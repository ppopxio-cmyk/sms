import crypto from 'node:crypto';
import {
  PaymentCycle,
  StudentCharge,
  Payment,
  PaymentAttempt,
  Waiver,
  DeadlineExtension,
  StudentNotification,
} from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { audit } from './audit.service.js';
import { notifyUsers, notifyUser } from './notification.service.js';
import { sendFinanceNotification } from './mail.service.js';
import { AppError } from '../utils/AppError.js';
import { toEthiopian, ETH_MONTHS, fromEthiopian, parseEATDate } from '../utils/ethiopianDate.js';

/**
 * Authoritative Centralized Financial Eligibility Service
 * Supports 6 discrete states:
 * 1. PAID - All assigned cycles/charges are fully settled
 * 2. UNPAID - Has active charges within due date, not yet overdue
 * 3. OVERDUE - Has unpaid charges past due date (+ grace period); ACADEMIC HOLD ACTIVE
 * 4. WAIVED - All charges waived by scholarship / admin
 * 5. PENDING - Cycle created, but opensAt is in the future
 * 6. NOT_APPLICABLE - No charges assigned to student
 */
export async function getStudentFinancialStatus(studentId) {
  if (!studentId) {
    return {
      state: 'NOT_APPLICABLE',
      hasHold: false,
      canAttend: true,
      canSubmitAssessments: true,
      canSubmitMarks: true,
      canIssueDocuments: true,
      overdueCount: 0,
      overdueCharges: [],
      totalOutstandingSantim: 0,
      totalOutstandingEtb: '0.00',
      totalPaidSantim: 0,
      totalPaidEtb: '0.00',
    };
  }

  const [settings, charges] = await Promise.all([
    SystemSetting.findOne({ key: 'global' }).lean(),
    StudentCharge.find({ student: studentId })
      .populate('cycle', 'title ethYear ethMonth portalHash dueAt opensAt amount status deletedAt')
      .sort({ dueAt: 1 })
      .lean(),
  ]);

  const graceDays = Number(settings?.finance?.graceDays || 0);
  const now = new Date();
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  // Filter charges for active/valid cycles
  const validCharges = charges.filter((c) => c.cycle && !c.cycle.deletedAt && c.cycle.status !== 'cancelled');

  if (!validCharges.length) {
    return {
      state: 'NOT_APPLICABLE',
      hasHold: false,
      canAttend: true,
      canSubmitAssessments: true,
      canSubmitMarks: true,
      canIssueDocuments: true,
      overdueCount: 0,
      overdueCharges: [],
      totalOutstandingSantim: 0,
      totalOutstandingEtb: '0.00',
      totalPaidSantim: 0,
      totalPaidEtb: '0.00',
    };
  }

  const overdueCharges = [];
  let unpaidCount = 0;
  let paidCount = 0;
  let waivedCount = 0;
  let pendingCount = 0;
  let totalOutstandingSantim = 0;
  let totalPaidSantim = 0;

  for (const c of validCharges) {
    if (c.status === 'paid') {
      paidCount++;
      totalPaidSantim += (c.amountDue || 0);
    } else if (c.status === 'waived') {
      waivedCount++;
    } else if (c.status === 'unpaid') {
      unpaidCount++;
      totalOutstandingSantim += (c.amountDue || 0);
      const isOverdue = new Date(c.dueAt) < cutoff;
      const isPending = c.cycle.opensAt && new Date(c.cycle.opensAt) > now;

      if (isOverdue) {
        overdueCharges.push({
          chargeId: String(c._id),
          cycleId: String(c.cycle._id),
          title: c.cycle.title || `Month ${c.cycle.ethMonth} ${c.cycle.ethYear}`,
          amountDue: c.amountDue,
          amountDueEtb: ((c.amountDue || 0) / 100).toFixed(2),
          dueAt: c.dueAt,
          ethYear: c.cycle.ethYear,
          ethMonth: c.cycle.ethMonth,
          portalHash: c.cycle.portalHash,
        });
      } else if (isPending) {
        pendingCount++;
      }
    }
  }

  let state = 'NOT_APPLICABLE';
  const hasHold = overdueCharges.length > 0;

  if (hasHold) {
    state = 'OVERDUE';
  } else if (unpaidCount > 0) {
    state = (pendingCount === unpaidCount) ? 'PENDING' : 'UNPAID';
  } else if (waivedCount > 0 && paidCount === 0) {
    state = 'WAIVED';
  } else if (paidCount > 0 || (paidCount + waivedCount === validCharges.length)) {
    state = 'PAID';
  }

  return {
    state,
    hasHold,
    // Holding policy: overdue students may still attend class, submit assessments
    // and have course marks entered. Only official document issuance
    // (transcript / certificate / graduation) stays blocked until cleared.
    canAttend: true,
    canSubmitAssessments: true,
    canSubmitMarks: true,
    canIssueDocuments: !hasHold,
    overdueCount: overdueCharges.length,
    overdueCharges,
    totalOutstandingSantim,
    totalOutstandingEtb: (totalOutstandingSantim / 100).toFixed(2),
    totalPaidSantim,
    totalPaidEtb: (totalPaidSantim / 100).toFixed(2),
  };
}

/**
 * Live instant database check for financial hold.
 * Blocked if the student has ANY unpaid charge where dueAt < now (past due).
 */
export async function checkStudentFinancialHold(studentId) {
  const status = await getStudentFinancialStatus(studentId);
  return {
    hasHold: status.hasHold,
    overdueCount: status.overdueCount,
    overdueCharges: status.overdueCharges,
    totalOutstandingSantim: status.totalOutstandingSantim,
    totalOutstandingEtb: status.totalOutstandingEtb,
    state: status.state,
  };
}

/**
 * Assertion helper: throws AppError(403) if the student is on financial hold
 */
export async function assertNoFinancialHold(studentId, actionName = 'this action') {
  const status = await getStudentFinancialStatus(studentId);
  if (status.hasHold) {
    const firstOverdue = status.overdueCharges[0];
    const portalHash = firstOverdue?.portalHash;
    const paymentLink = portalHash ? `/monthly-payments/${portalHash}` : '/monthly-payments';
    throw new AppError(
      403,
      'FINANCIAL_CLEARANCE_REQUIRED',
      `Financial clearance required: Student has unpaid monthly fees (${firstOverdue?.title || 'Monthly Fee'} - ${firstOverdue?.amountDueEtb || '0.00'} ETB). Please complete payment at ${paymentLink} to proceed with ${actionName}.`,
      {
        paymentLink,
        overdueCount: status.overdueCount,
        totalOutstandingEtb: status.totalOutstandingEtb,
        overdueCharges: status.overdueCharges,
      }
    );
  }
  return status;
}

/**
 * Find teacher user IDs assigned to a student's active registered courses
 */
export async function getAssignedTeacherUserIdsForStudent(studentId) {
  if (!studentId) return [];
  const registrations = await CourseRegistration.find({
    student: studentId,
    status: 'registered',
  }).select('offering').lean();

  if (!registrations.length) return [];
  const offeringIds = registrations.map((r) => r.offering);

  const offerings = await CourseOffering.find({
    _id: { $in: offeringIds },
    teacher: { $ne: null },
  }).select('teacher').lean();

  return [...new Set(offerings.map((o) => String(o.teacher)).filter(Boolean))];
}

/**
 * Send targeted notifications to assigned teachers when hold status changes
 */
function truncateBody(text, max = 300) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

// Registrations of a student mapped per teacher: { teacherId -> [{code, title, term, level}] }
export async function studentCoursesPerTeacher(studentId) {
  const out = new Map();
  if (!studentId) return out;
  try {
    const registrations = await CourseRegistration.find({ student: studentId, status: 'registered' })
      .select('offering')
      .lean();
    const offerings = await CourseOffering.find({
      _id: { $in: registrations.map((r) => r.offering) },
      teacher: { $ne: null },
    })
      .select('teacher course term level')
      .populate('course', 'code title')
      .lean();

    for (const o of offerings) {
      const tid = String(o.teacher || '');
      if (!tid) continue;
      if (!out.has(tid)) out.set(tid, []);
      out.get(tid).push({
        code: o.course?.code || '',
        title: o.course?.title || '',
        term: o.term || '',
        level: o.level || null,
      });
    }
  } catch {
    // The list is supplementary — looking it up must never break a notice
  }
  return out;
}

function describeCourses(courses, maxCodes = 4) {
  const labels = (courses || [])
    .map((c) => [c.code, c.title].filter(Boolean).join(' — '))
    .filter(Boolean);
  if (!labels.length) return '';
  const shown = labels.slice(0, maxCodes).join(', ');
  return labels.length <= maxCodes ? shown : `${shown} +${labels.length - maxCodes} more`;
}

export async function notifyAssignedTeachersHoldStatus(studentId, { isCleared, details } = {}) {
  try {
    const teacherIds = await getAssignedTeacherUserIdsForStudent(studentId);
    if (!teacherIds.length) return;

    const student = await Student.findById(studentId)
      .select('studentId firstName lastName middleName fullName studentCategory department program batch')
      .populate('department', 'name code')
      .populate('program', 'name code')
      .populate('batch', 'name code')
      .lean();
    if (!student) return;

    const studentName = student.fullName
      || [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')
      || student.studentId;
    const deptName = student.department?.name || student.department?.code || '—';
    const progName = student.program?.name || student.program?.code || '—';
    const batchName = student.batch?.name || student.batch?.code || '—';

    const perTeacherCourses = await studentCoursesPerTeacher(student._id || studentId);

    // Everything a teacher should read, both inline (body ≤300 chars) and structurally
    // (meta.finStudents) so the notifications page can render the full list.
    const metaStudent = {
      name: studentName,
      studentId: student.studentId || '',
      department: deptName,
      programme: progName,
      batch: batchName,
      category: student.studentCategory || '',
      months: details?.title || 'Monthly Fee',
      amountEtb: details?.amountEtb || '0.00',
    };

    for (const teacherId of teacherIds) {
      const courses = perTeacherCourses.get(String(teacherId)) || [];
      metaStudent.yourClasses = courses.map((c) => [c.code, c.title].filter(Boolean).join(' — ')).filter(Boolean);

      const coursesText = describeCourses(courses);
      const classesLine = coursesText ? ` Your classes: ${coursesText}.` : '';
      const subjectLine = isCleared
        ? `CLEARED. Paid: ${details?.title || 'Monthly Fee'} (${details?.amountEtb || '0.00'} ETB).`
        : `ON HOLD. Outstanding: ${details?.title || 'Monthly Fee'} (${details?.amountEtb || '0.00'} ETB).`;
      const intro = isCleared
        ? 'Financial hold LIFTED — the student may attend, sit assessments and receive documents.'
        : 'Financial hold ACTIVE — attendance/assessments continue as normal; official documents stay blocked.';

      await notifyUser(teacherId, {
        type: isCleared ? 'financial_clearance' : 'financial_hold',
        title: truncateBody(`Fee status: ${studentName} (${student.studentId})`, 160),
        body: truncateBody(
          `${student.studentId} · ${deptName} · ${progName} · ${batchName}${student.studentCategory ? ` · ${student.studentCategory}` : ''} — ${subjectLine}${classesLine} ${intro}`,
          300,
        ),
        meta: {
          finStudents: [metaStudent],
          finHeader: isCleared ? 'Fee cleared — student details' : 'Fee on hold — student details',
        },
      });
    }
  } catch (err) {
    // Non-blocking notice error
  }
}

/**
 * 1. Create a Payment Cycle
 */
export async function createPaymentCycle(payload, userId) {
  const {
    title,
    ethYear,
    ethMonth,
    opensAt,
    dueAt,
    amount,
    bank,
    targets,
    tutorialVideoUrl,
  } = payload;

  const cleanAmount = Math.round(Number(amount));
  if (cleanAmount < 0) throw new AppError(400, 'INVALID_AMOUNT', 'Cycle amount must be non-negative.');

  // Guard: If this month already has an active or draft cycle, do not allow duplicate creation
  const existingCycle = await PaymentCycle.findOne({
    ethYear: Number(ethYear),
    ethMonth: Number(ethMonth),
    status: { $in: ['open', 'draft'] },
    deletedAt: null,
  });
  if (existingCycle) {
    throw new AppError(
      409,
      'CYCLE_EXISTS',
      `A payment cycle for ${ETH_MONTHS[ethMonth - 1] || 'Month'} ${ethYear} is already ${existingCycle.status}. You cannot create a duplicate cycle for the same month.`
    );
  }

  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const defaultBank = settings?.finance?.defaultBank || {};

  const portalHash = crypto.randomBytes(16).toString('hex');
  const monthName = (ETH_MONTHS[ethMonth - 1] || 'month').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = `${monthName}-${ethYear}`;

  const cycle = await PaymentCycle.create({
    title: title || `${ETH_MONTHS[ethMonth - 1] || 'Month'} ${ethYear}`,
    slug,
    ethYear: Number(ethYear),
    ethMonth: Number(ethMonth),
    opensAt: parseEATDate(opensAt, false),
    dueAt: parseEATDate(dueAt, true),
    amount: cleanAmount,
    tutorialVideoUrl: tutorialVideoUrl ? String(tutorialVideoUrl).trim() : '',
    bank: {
      bank: bank?.bank || defaultBank.bank || 'Chapa Payment Gateway',
      accountNumber: bank?.accountNumber || defaultBank.accountNumber || 'CHAPA',
      holderName: bank?.holderName || defaultBank.holderName || 'College Online Fee Portal',
    },
    targets: {
      all: targets?.all ?? true,
      departments: targets?.departments || [],
      programmes: targets?.programmes || [],
      batches: targets?.batches || [],
      categories: targets?.categories || [],
    },
    portalHash,
    status: 'draft',
    createdBy: userId,
  });

  return cycle;
}

/**
 * 1b. Bulk-create payment cycles: one cycle per selected Ethiopian month
 * (e.g. Meskerem), all sharing the year, amount, due date and target scopes.
 * Optionally opens every created cycle immediately so student charges (and
 * any overdue flags for past due dates) are generated in one go.
 */
export async function bulkCreatePaymentCycles(payload, userId) {
  const {
    ethYear,
    ethMonths,
    opensAt,
    opensDates,
    dueAt,
    dueDates,
    amount,
    targets,
    tutorialVideoUrl,
    autoOpen = false,
  } = payload;

  const months = Array.isArray(ethMonths)
    ? ethMonths.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 13)
    : [];
  if (!months.length) {
    throw new AppError(400, 'MONTHS_REQUIRED', 'Select at least one Ethiopian month to create cycles for.');
  }
  if (!ethYear || !Number.isInteger(Number(ethYear))) {
    throw new AppError(400, 'YEAR_REQUIRED', 'A valid Ethiopian academic year is required.');
  }

  const cleanTargets = {
    all: targets?.all ?? true,
    departments: targets?.departments || [],
    programmes: targets?.programmes || [],
    batches: targets?.batches || [],
    categories: targets?.categories || [],
  };
  if (!cleanTargets.all && !cleanTargets.departments.length && !cleanTargets.programmes.length && !cleanTargets.batches.length && !cleanTargets.categories.length) {
    throw new AppError(400, 'TARGETS_REQUIRED', 'Pick at least one department, programme or batch — or target all students.');
  }

  const created = [];
  const skipped = [];
  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    try {
      const cycle = await createPaymentCycle(
        {
          ethYear: Number(ethYear),
          ethMonth: month,
          opensAt: Array.isArray(opensDates) ? opensDates[i] : opensAt,
          dueAt: Array.isArray(dueDates) ? dueDates[i] : dueAt,
          amount,
          targets: cleanTargets,
          tutorialVideoUrl,
        },
        userId,
      );

      let chargesGenerated = 0;
      if (autoOpen) {
        const openResult = await openPaymentCycle(cycle._id, userId);
        chargesGenerated = openResult.chargesGenerated || 0;
      }

      created.push({
        id: String(cycle._id),
        title: cycle.title,
        ethYear: cycle.ethYear,
        ethMonth: cycle.ethMonth,
        status: cycle.status,
        amount: cycle.amount,
        amountEtb: (cycle.amount / 100).toFixed(2),
        dueAt: cycle.dueAt,
        portalHash: cycle.portalHash,
        chargesGenerated,
      });
    } catch (err) {
      // A month that already has an active cycle is skipped, never fatal
      if (err?.code === 'CYCLE_EXISTS') {
        skipped.push({ month, message: err.message });
        continue;
      }
      throw err;
    }
  }

  const chargesGenerated = created.reduce((sum, c) => sum + (c.chargesGenerated || 0), 0);
  return { created, skipped, chargesGenerated };
}

/**
 * 2. Open a Payment Cycle and generate Student Charges
 */
export async function openPaymentCycle(cycleId, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');

  if (cycle.status === 'open') return { cycle, chargesGenerated: 0 };
  if (cycle.status === 'cancelled') {
    throw new AppError(400, 'CYCLE_CANCELLED', 'Cancelled payment cycles cannot be opened.');
  }

  // Build target query for students
  const studentFilter = {
    studentStatus: { $in: ['active', 'graduated'] },
    enrollmentStatus: { $nin: ['withdrawn', 'cancelled'] },
  };

  if (!cycle.targets.all) {
    if (cycle.targets.departments?.length) {
      studentFilter.department = { $in: cycle.targets.departments };
    }
    if (cycle.targets.programmes?.length) {
      studentFilter.program = { $in: cycle.targets.programmes };
    }
    if (cycle.targets.batches?.length) {
      studentFilter.batch = { $in: cycle.targets.batches };
    }
    if (cycle.targets.categories?.length) {
      studentFilter.studentCategory = { $in: cycle.targets.categories.map((c) => c.toLowerCase()) };
    }
  }

  const eligibleStudents = await Student.find(studentFilter)
    .populate('department', 'name')
    .populate('program', 'name')
    .populate('batch', 'name')
    .lean();

  let chargesGenerated = 0;
  const bulkOps = [];
  const notifications = [];

  for (const s of eligibleStudents) {
    bulkOps.push({
      updateOne: {
        filter: { student: s._id, cycle: cycle._id },
        update: {
          $setOnInsert: {
            student: s._id,
            cycle: cycle._id,
            studentId: s.studentId,
            studentName: s.fullName || `${s.firstName} ${s.lastName}`,
            department: s.department?.name || '',
            programme: s.program?.name || '',
            batch: s.batch?.name || '',
            category: s.studentCategory || 'regular',
            amountDue: cycle.amount,
            status: 'unpaid',
            dueAt: cycle.dueAt,
          },
        },
        upsert: true,
      },
    });

    notifications.push({
      student: s._id,
      cycle: cycle._id,
      title: `Monthly Fee Announced: ${cycle.title}`,
      message: `The fee cycle for ${cycle.title} is now open. Amount: ${(cycle.amount / 100).toFixed(2)} ETB. Due date: ${cycle.dueAt.toISOString().slice(0, 10)}. Pay via CBE receipt at /monthly-payments/${cycle.portalHash}`,
      type: 'payment_reminder',
    });
  }

  if (bulkOps.length) {
    const res = await StudentCharge.bulkWrite(bulkOps);
    chargesGenerated = res.upsertedCount;
  }

  // Save student notifications
  if (notifications.length) {
    await StudentNotification.insertMany(notifications, { ordered: false }).catch(() => {});
  }

  cycle.status = 'open';
  cycle.updatedBy = userId;
  await cycle.save();

  return { cycle, chargesGenerated };
}

/**
 * 3. Update Cycle
 */
export async function updatePaymentCycle(cycleId, updates, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');

  if (cycle.status === 'cancelled') {
    throw new AppError(400, 'CYCLE_CANCELLED', 'Cancelled cycle cannot be modified.');
  }

  if (cycle.status === 'open') {
    // Once open, only due date can change. Amount is locked if any payment exists.
    if (updates.dueAt) {
      cycle.dueAt = parseEATDate(updates.dueAt, true);
      // Update dueAt on all unpaid charges
      await StudentCharge.updateMany(
        { cycle: cycle._id, status: 'unpaid' },
        { $set: { dueAt: cycle.dueAt } }
      );
    }

    if (updates.amount !== undefined) {
      const hasPayment = await Payment.exists({ cycle: cycle._id, status: 'confirmed' });
      if (hasPayment) {
        throw new AppError(400, 'AMOUNT_LOCKED', 'Cycle amount cannot be changed after payments have been confirmed.');
      }
      cycle.amount = Math.round(Number(updates.amount));
      await StudentCharge.updateMany(
        { cycle: cycle._id, status: 'unpaid' },
        { $set: { amountDue: cycle.amount } }
      );
    }
  } else if (cycle.status === 'draft') {
    // Fully editable in draft
    if (updates.title) cycle.title = updates.title;
    if (updates.ethYear) cycle.ethYear = Number(updates.ethYear);
    if (updates.ethMonth) cycle.ethMonth = Number(updates.ethMonth);
    if (updates.opensAt) cycle.opensAt = new Date(updates.opensAt);
    if (updates.dueAt) cycle.dueAt = new Date(updates.dueAt);
    if (updates.amount !== undefined) cycle.amount = Math.round(Number(updates.amount));
    if (updates.bank) {
      cycle.bank = { ...cycle.bank, ...updates.bank };
    }
    if (updates.targets) {
      cycle.targets = { ...cycle.targets, ...updates.targets };
    }
  }

  if (updates.tutorialVideoUrl !== undefined) {
    cycle.tutorialVideoUrl = updates.tutorialVideoUrl ? String(updates.tutorialVideoUrl).trim() : '';
  }

  cycle.updatedBy = userId;
  await cycle.save();
  return cycle;
}

/**
 * 4. Close Payment Cycle
 */
export async function closePaymentCycle(cycleId, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');
  cycle.status = 'closed';
  cycle.updatedBy = userId;
  await cycle.save();
  return cycle;
}

/**
 * 5. Reopen Payment Cycle
 */
export async function reopenPaymentCycle(cycleId, newDueAt, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');

  cycle.status = 'open';
  if (newDueAt) {
    cycle.dueAt = new Date(newDueAt);
    await StudentCharge.updateMany(
      { cycle: cycle._id, status: 'unpaid' },
      { $set: { dueAt: cycle.dueAt } }
    );
  }
  cycle.updatedBy = userId;
  await cycle.save();
  return cycle;
}

/**
 * 6. Cancel Payment Cycle
 */
export async function cancelPaymentCycle(cycleId, reason, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');
  cycle.status = 'cancelled';
  cycle.updatedBy = userId;
  await cycle.save();

  audit({
    actorId: userId,
    actorRole: 'ACCOUNTANT',
    action: 'finance.cycle_cancelled',
    targetType: 'PaymentCycle',
    targetId: cycle._id,
    meta: { reason },
  });

  return cycle;
}

/**
 * 7. Delete Draft Cycle
 */
export async function deletePaymentCycle(cycleId, userId) {
  const cycle = await PaymentCycle.findById(cycleId);
  if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');
  if (cycle.status !== 'draft') {
    throw new AppError(400, 'CANNOT_DELETE_OPEN_CYCLE', 'Only draft cycles can be deleted. Open or closed cycles must be cancelled.');
  }
  cycle.deletedAt = new Date();
  cycle.updatedBy = userId;
  await cycle.save();
  return { success: true };
}

/**
 * 8. Manual Payment Recording (Cash, bank slip, accountant override)
 */
export async function recordManualPayment({
  chargeId,
  amount,
  method = 'manual',
  bankReference,
  payerName = '',
  receiptUrl = '',
  userId,
}) {
  const charge = await StudentCharge.findById(chargeId).populate('cycle').populate('student');
  if (!charge) throw new AppError(404, 'CHARGE_NOT_FOUND', 'Student charge not found.');
  if (charge.status === 'paid') {
    throw new AppError(400, 'ALREADY_PAID', 'This charge has already been marked as paid.');
  }

  const existingRef = await Payment.findOne({ bankReference: bankReference.trim() });
  if (existingRef) {
    throw new AppError(400, 'DUPLICATE_REFERENCE', `Bank reference ${bankReference} has already been registered.`);
  }

  const doneHash = crypto.randomBytes(16).toString('hex');
  const count = await Payment.countDocuments();
  const ethYear = charge.cycle?.ethYear || 2019;
  const receiptNumber = `REC-${ethYear}-${String(count + 1).padStart(6, '0')}`;

  const payment = await Payment.create({
    receiptNumber,
    charge: charge._id,
    cycle: charge.cycle._id,
    student: charge.student._id,
    amount: Math.round(Number(amount)),
    method,
    bankReference: bankReference.trim(),
    doneHash,
    status: 'confirmed',
    payerName: payerName || charge.studentName,
    receiptUrl,
    recordedBy: userId,
    paidAt: new Date(),
  });

  charge.status = 'paid';
  charge.paidAt = new Date();
  charge.payment = payment._id;
  await charge.save();

  // Notify assigned teachers if student is now fully cleared
  const postHold = await checkStudentFinancialHold(charge.student?._id || charge.student);
  if (!postHold.hasHold) {
    void notifyAssignedTeachersHoldStatus(charge.student?._id || charge.student, {
      isCleared: true,
      details: { title: charge.cycle?.title, amountEtb: (payment.amount / 100).toFixed(2) },
    });
  }

  audit({
    actorId: userId,
    actorRole: 'ACCOUNTANT',
    action: 'finance.manual_payment_recorded',
    targetType: 'Payment',
    targetId: payment._id,
    meta: {
      receiptNumber,
      amount: payment.amount,
      studentId: charge.studentId,
      method,
      bankReference,
    },
  });

  return { payment, charge };
}

/**
 * 9. Reverse a Payment
 */
export async function reversePayment(paymentId, reason, userId) {
  if (!reason || !reason.trim()) {
    throw new AppError(400, 'REASON_REQUIRED', 'A reason is required to reverse a confirmed payment.');
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  if (payment.status === 'reversed') {
    throw new AppError(400, 'ALREADY_REVERSED', 'This payment has already been reversed.');
  }

  payment.status = 'reversed';
  payment.reversalReason = reason.trim();
  payment.reversedBy = userId;
  payment.reversedAt = new Date();
  await payment.save();

  // Reset charge to unpaid
  await StudentCharge.findByIdAndUpdate(payment.charge, {
    status: 'unpaid',
    paidAt: null,
    payment: null,
  });

  audit({
    actorId: userId,
    actorRole: 'ACCOUNTANT',
    action: 'finance.payment_reversed',
    targetType: 'Payment',
    targetId: payment._id,
    meta: {
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      reason,
    },
  });

  return payment;
}

/**
 * 10. Waivers
 */
export async function createWaiver({ chargeId, amount, type = 'full', reason, scholarshipCollege, sendEmail = true, userId }) {
  const charge = await StudentCharge.findById(chargeId)
    .populate('cycle', 'title ethYear ethMonth')
    .populate('student', 'studentId fullName firstName lastName email');
  if (!charge) throw new AppError(404, 'CHARGE_NOT_FOUND', 'Charge not found.');
  if (charge.status === 'paid') {
    throw new AppError(400, 'ALREADY_PAID', 'Cannot waive an already paid charge.');
  }

  const waiverAmount = type === 'full' ? charge.amountDue : Math.round(Number(amount));

  const waiver = await Waiver.create({
    student: charge.student._id,
    cycle: charge.cycle._id,
    charge: charge._id,
    amount: waiverAmount,
    type,
    reason,
    scholarshipCollege: scholarshipCollege || '',
    status: 'approved',
    approvedBy: userId,
    approvedAt: new Date(),
  });

  if (type === 'full' || waiverAmount >= charge.amountDue) {
    charge.status = 'waived';
    charge.waivedAt = new Date();
    charge.waiver = waiver._id;
  } else {
    charge.amountDue = Math.max(0, charge.amountDue - waiverAmount);
    charge.waiver = waiver._id;
  }
  await charge.save();

  // Email confirmation to the student (best-effort; never blocks the waiver itself)
  const studentEmail = charge.student?.email;
  if (sendEmail && studentEmail) {
    try {
      const monthName = ETH_MONTHS[(charge.cycle.ethMonth || 1) - 1] || 'Unknown month';
      await sendFinanceNotification({
        to: studentEmail,
        name: charge.student.fullName || charge.student.studentId,
        subject: `Fee waiver approved · ${charge.cycle.title}`,
        title: 'Fee Waiver Approved',
        intro: 'Your monthly fee exemption has been officially approved by the Finance Office.',
        paragraphs: [
          'You no longer need to pay this month on the student payment portal. This message is your confirmation.',
        ],
        rows: [
          ['Student', `${charge.student.fullName || ''} (${charge.student.studentId || ''})`],
          ['Fee cycle', `${charge.cycle.title} — ${monthName}`],
          ['Waiver type', type === 'full' ? 'Full waiver' : 'Partial waiver'],
          ['Waiver amount', (waiverAmount / 100).toFixed(2) + ' ETB'],
          ['Reason', reason || '-'],
          ...(scholarshipCollege ? [['Granted by', scholarshipCollege]] : []),
        ],
        footerNote: 'Keep this email for your records. Contact the Finance Office if any detail above looks wrong.',
      });
      waiver.emailSentAt = new Date();
      await waiver.save();
    } catch {
      // email failure must not roll back an approved waiver
    }
  }

  // Notify assigned teachers if student is now fully cleared
  const postHold = await checkStudentFinancialHold(charge.student._id || charge.student);
  if (!postHold.hasHold) {
    void notifyAssignedTeachersHoldStatus(charge.student._id || charge.student, {
      isCleared: true,
      details: { title: 'Tuition Fee Exemption', amountEtb: (waiverAmount / 100).toFixed(2) },
    });
  }

  audit({
    actorId: userId,
    actorRole: 'ACCOUNTANT',
    action: 'finance.waiver_created',
    targetType: 'Waiver',
    targetId: waiver._id,
    meta: { studentId: charge.studentId, amount: waiverAmount, type, reason, scholarshipCollege: scholarshipCollege || '' },
  });

  return { waiver, charge };
}

export async function revokeWaiver(waiverId, reason, userId) {
  const waiver = await Waiver.findById(waiverId);
  if (!waiver) throw new AppError(404, 'WAIVER_NOT_FOUND', 'Waiver not found.');
  if (waiver.status === 'revoked') {
    throw new AppError(400, 'ALREADY_REVOKED', 'Waiver is already revoked.');
  }

  waiver.status = 'revoked';
  waiver.revokedBy = userId;
  waiver.revokedAt = new Date();
  waiver.revokeReason = reason || 'Revoked by accountant';
  await waiver.save();

  // Reset charge
  const charge = await StudentCharge.findById(waiver.charge).populate('cycle');
  if (charge) {
    charge.status = 'unpaid';
    charge.waivedAt = null;
    charge.waiver = null;
    if (charge.cycle) charge.amountDue = charge.cycle.amount;
    await charge.save();

    // Check if student now has an active hold and notify assigned teachers
    const postHold = await checkStudentFinancialHold(charge.student);
    if (postHold.hasHold) {
      void notifyAssignedTeachersHoldStatus(charge.student, {
        isCleared: false,
        details: { title: 'Waiver Revoked', amountEtb: ((charge.amountDue || 0) / 100).toFixed(2) },
      });
    }
  }

  return waiver;
}

/**
 * 11. Deadline Extensions
 */
export async function extendStudentDeadline({ chargeId, extendedDueAt, reason, userId }) {
  const charge = await StudentCharge.findById(chargeId);
  if (!charge) throw new AppError(404, 'CHARGE_NOT_FOUND', 'Charge not found.');

  const ext = await DeadlineExtension.create({
    student: charge.student,
    cycle: charge.cycle,
    charge: charge._id,
    originalDueAt: charge.dueAt,
    extendedDueAt: new Date(extendedDueAt),
    reason,
    grantedBy: userId,
  });

  charge.dueAt = new Date(extendedDueAt);
  await charge.save();

  // If deadline extension lifted an active hold, notify assigned teachers
  const postHold = await checkStudentFinancialHold(charge.student);
  if (!postHold.hasHold) {
    void notifyAssignedTeachersHoldStatus(charge.student, {
      isCleared: true,
      details: { title: 'Deadline Extended', amountEtb: ((charge.amountDue || 0) / 100).toFixed(2) },
    });
  }

  audit({
    actorId: userId,
    actorRole: 'ACCOUNTANT',
    action: 'finance.deadline_extended',
    targetType: 'DeadlineExtension',
    targetId: ext._id,
    meta: { studentId: charge.studentId, extendedDueAt, reason },
  });

  return { extension: ext, charge };
}

/**
 * 12. Finance Dashboard Data
 */
export async function getFinanceDashboardData() {
  const now = new Date();
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const graceDays = Number(settings?.finance?.graceDays || 0);
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  const [
    totalCollectedAgg,
    totalOutstandingAgg,
    statusCounts,
    overdueCount,
    reviewQueueCount,
    programmeBreakdown,
    recentCycles,
    paymentMethodCounts,
    departmentBreakdown,
    cycleStatusCounts,
    topDebtors,
  ] = await Promise.all([
    // Total collected
    Payment.aggregate([{ $match: { status: 'confirmed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    // Total outstanding
    StudentCharge.aggregate([
      { $match: { status: 'unpaid' } },
      { $group: { _id: null, total: { $sum: '$amountDue' } } },
    ]),
    // Status counts
    StudentCharge.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    // Overdue count
    StudentCharge.countDocuments({
      status: 'unpaid',
      dueAt: { $lt: cutoff },
    }),
    // Review queue count (keep for backwards compat)
    PaymentAttempt.countDocuments({
      result: { $in: ['review_required', 'pending_verification'] },
    }),
    // Programme breakdown
    StudentCharge.aggregate([
      {
        $group: {
          _id: '$programme',
          totalBilled: { $sum: '$amountDue' },
          collected: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountDue', 0] },
          },
          studentsCount: { $sum: 1 },
        },
      },
      { $sort: { totalBilled: -1 } },
      { $limit: 10 },
    ]),
    // Cycles for 13-month collection trend
    PaymentCycle.find({ deletedAt: null }).sort({ ethYear: -1, ethMonth: -1 }).limit(13).lean(),
    // Payment method breakdown
    Payment.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: '$method', total: { $sum: '$amount' } } },
    ]),
    // Department breakdown (top 5)
    StudentCharge.aggregate([
      { $match: { department: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$department',
          totalBilled: { $sum: '$amountDue' },
          collected: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountDue', 0] },
          },
          studentsCount: { $sum: 1 },
        },
      },
      { $sort: { totalBilled: -1 } },
      { $limit: 5 },
    ]),
    // Cycle status breakdown
    PaymentCycle.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    // Top debtors (students with highest outstanding)
    StudentCharge.aggregate([
      { $match: { status: 'unpaid' } },
      {
        $group: {
          _id: '$student',
          studentId: { $first: '$studentId' },
          studentName: { $first: '$studentName' },
          outstanding: { $sum: '$amountDue' },
          dueAt: { $min: '$dueAt' },
        },
      },
      { $sort: { outstanding: -1 } },
      { $limit: 8 },
    ]),
  ]);

  const totalCollected = totalCollectedAgg[0]?.total || 0;
  const totalOutstanding = totalOutstandingAgg[0]?.total || 0;
  const totalBilled = totalCollected + totalOutstanding;
  const percentPaid = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  const statusMap = statusCounts.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  // Monthly collection breakdown across the cycles
  const cycleIds = recentCycles.map((c) => c._id);
  const cycleCollections = await Payment.aggregate([
    { $match: { cycle: { $in: cycleIds }, status: 'confirmed' } },
    { $group: { _id: '$cycle', collected: { $sum: '$amount' } } },
  ]);
  const cycleColMap = cycleCollections.reduce((acc, curr) => {
    acc[String(curr._id)] = curr.collected;
    return acc;
  }, {});

  const monthlyTrend = recentCycles.map((c) => ({
    cycleId: String(c._id),
    title: c.title,
    ethYear: c.ethYear,
    ethMonth: c.ethMonth,
    monthName: ETH_MONTHS[c.ethMonth - 1] || `Month ${c.ethMonth}`,
    collectedSantim: cycleColMap[String(c._id)] || 0,
    collectedEtb: ((cycleColMap[String(c._id)] || 0) / 100).toFixed(2),
    amountPerStudent: (c.amount / 100).toFixed(2),
    status: c.status,
    billedSantim: c.amount * (c.totalStudents || 1),
  })).reverse();

  const paymentMethodBreakdown = (paymentMethodCounts || []).map((m) => ({
    method: m._id || 'other',
    totalEtb: ((m.total || 0) / 100).toFixed(2),
    totalSantim: m.total || 0,
  }));

  const departmentBreakdownResult = (departmentBreakdown || []).map((d) => ({
    department: d._id || 'Unassigned',
    totalBilledEtb: (d.totalBilled / 100).toFixed(2),
    collectedEtb: (d.collected / 100).toFixed(2),
    studentsCount: d.studentsCount,
    percent: d.totalBilled > 0 ? Math.round((d.collected / d.totalBilled) * 100) : 0,
  }));

  const cycleStatusCountsResult = (cycleStatusCounts || []).reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  const topDebtorsResult = (topDebtors || []).map((d) => ({
    studentId: d.studentId,
    studentName: d.studentName,
    outstandingEtb: (d.outstanding / 100).toFixed(2),
    dueAt: d.dueAt,
  }));

  return {
    overview: {
      totalCollectedSantim: totalCollected,
      totalCollectedEtb: (totalCollected / 100).toFixed(2),
      totalOutstandingSantim: totalOutstanding,
      totalOutstandingEtb: (totalOutstanding / 100).toFixed(2),
      totalBilledEtb: (totalBilled / 100).toFixed(2),
      percentPaid,
      overdueCount,
      reviewQueueCount,
      verifierHealth: 'operational',
    },
    statusSplit: {
      paid: statusMap.paid || 0,
      unpaid: statusMap.unpaid || 0,
      waived: statusMap.waived || 0,
      overdue: overdueCount,
    },
    monthlyTrend,
    programmeBreakdown: programmeBreakdown.map((p) => ({
      programme: p._id || 'Unassigned',
      totalBilledEtb: (p.totalBilled / 100).toFixed(2),
      collectedEtb: (p.collected / 100).toFixed(2),
      studentsCount: p.studentsCount,
      percent: p.totalBilled > 0 ? Math.round((p.collected / p.totalBilled) * 100) : 0,
    })),
    paymentMethodBreakdown,
    departmentBreakdown: departmentBreakdownResult,
    cycleStatusCounts: cycleStatusCountsResult,
    topDebtors: topDebtorsResult,
  };
}
