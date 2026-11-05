import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createPaymentCycle,
  openPaymentCycle,
  updatePaymentCycle,
  closePaymentCycle,
  reopenPaymentCycle,
  cancelPaymentCycle,
  deletePaymentCycle,
  recordManualPayment,
  reversePayment,
  createWaiver,
  revokeWaiver,
  extendStudentDeadline,
  getFinanceDashboardData,
  checkStudentFinancialHold,
  notifyAssignedTeachersHoldStatus,
} from '../services/finance.service.js';
import { notifyRole } from '../services/notification.service.js';
import mongoose from 'mongoose';
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
import { Batch, Department, Course } from '../models/AcademicStructure.js';
import { CourseRegistration } from '../models/Offering.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { ETH_MONTHS } from '../utils/ethiopianDate.js';
import crypto from 'node:crypto';

async function resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId }) {
  if (!batchId && !departmentId && !courseId) return null;
  const filter = {};
  if (batchId) {
    if (mongoose.Types.ObjectId.isValid(batchId)) {
      filter.batch = batchId;
    } else {
      const bDoc = await Batch.findOne({ $or: [{ code: batchId }, { name: batchId }] });
      if (bDoc) filter.batch = bDoc._id;
    }
  }
  if (departmentId) {
    if (mongoose.Types.ObjectId.isValid(departmentId)) {
      filter.department = departmentId;
    } else {
      const dDoc = await Department.findOne({ $or: [{ code: departmentId }, { name: departmentId }] });
      if (dDoc) filter.department = dDoc._id;
    }
  }
  if (courseId) {
    let targetCourseId = courseId;
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      const cDoc = await Course.findOne({ $or: [{ code: courseId }, { name: courseId }] });
      if (cDoc) targetCourseId = cDoc._id;
    }
    const studentIdsInCourse = await CourseRegistration.find({
      course: targetCourseId,
      status: { $ne: 'cancelled' },
    }).distinct('student');
    filter._id = { $in: studentIdsInCourse };
  }
  const students = await Student.find(filter).distinct('_id');
  return students;
}

// 1. Dashboard
export const getDashboard = asyncHandler(async (req, res) => {
  const data = await getFinanceDashboardData();
  res.json(data);
});

// 2. List Cycles
export const listCycles = asyncHandler(async (req, res) => {
  const {
    status,
    ethYear,
    ethMonth,
    departmentId,
    programId,
    batchId,
    courseId,
    search,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (ethYear) filter.ethYear = Number(ethYear);
  if (ethMonth) filter.ethMonth = Number(ethMonth);

  const andConditions = [];

  if (departmentId) {
    andConditions.push({
      $or: [{ 'targets.all': true }, { 'targets.departments': departmentId }],
    });
  }

  if (programId) {
    andConditions.push({
      $or: [{ 'targets.all': true }, { 'targets.programmes': programId }],
    });
  }

  if (batchId) {
    andConditions.push({
      $or: [{ 'targets.all': true }, { 'targets.batches': batchId }],
    });
  }

  if (courseId) {
    const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ courseId });
    if (matchingStudentIds !== null) {
      const cycleIdsWithCharges = await StudentCharge.find({
        student: { $in: matchingStudentIds },
      }).distinct('cycle');
      andConditions.push({ _id: { $in: cycleIdsWithCharges } });
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    const matchingCharges = await StudentCharge.find({
      studentId: { $regex: term, $options: 'i' },
    }).distinct('cycle');

    andConditions.push({
      $or: [
        { title: { $regex: term, $options: 'i' } },
        { _id: { $in: matchingCharges } },
      ],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [cycles, total] = await Promise.all([
    PaymentCycle.find(filter)
      .sort({ ethYear: -1, ethMonth: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PaymentCycle.countDocuments(filter),
  ]);

  // Attach quick stats per cycle
  const cycleIds = cycles.map((c) => c._id);
  const stats = await StudentCharge.aggregate([
    { $match: { cycle: { $in: cycleIds } } },
    {
      $group: {
        _id: '$cycle',
        totalStudents: { $sum: 1 },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        collected: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountDue', 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, '$amountDue', 0] } },
      },
    },
  ]);

  const statsMap = stats.reduce((acc, curr) => {
    acc[String(curr._id)] = curr;
    return acc;
  }, {});

  const enriched = cycles.map((c) => {
    const s = statsMap[String(c._id)] || {};
    return {
      ...c,
      id: String(c._id),
      totalStudents: s.totalStudents || 0,
      paidCount: s.paidCount || 0,
      collectedSantim: s.collected || 0,
      collectedEtb: ((s.collected || 0) / 100).toFixed(2),
      outstandingSantim: s.outstanding || 0,
      outstandingEtb: ((s.outstanding || 0) / 100).toFixed(2),
      monthName: ETH_MONTHS[c.ethMonth - 1] || `Month ${c.ethMonth}`,
    };
  });

  res.json({ cycles: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

// 3. Create Cycle
export const createCycle = asyncHandler(async (req, res) => {
  const cycle = await createPaymentCycle(req.body, req.user?.id);
  audit({
    req,
    action: 'finance.cycle_created',
    targetType: 'PaymentCycle',
    targetId: cycle._id,
    meta: { title: cycle.title, amount: cycle.amount, ethYear: cycle.ethYear, ethMonth: cycle.ethMonth },
  });
  res.status(201).json({ cycle });
});

// 4. Get Cycle Detail
export const getCycleDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cycle = await PaymentCycle.findById(id).lean();
  if (!cycle || cycle.deletedAt) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Payment cycle not found.');

  const [totalStudents, paidCount, waivedCount, unpaidCount, collectedAgg, submissionsCount] = await Promise.all([
    StudentCharge.countDocuments({ cycle: cycle._id }),
    StudentCharge.countDocuments({ cycle: cycle._id, status: 'paid' }),
    StudentCharge.countDocuments({ cycle: cycle._id, status: 'waived' }),
    StudentCharge.countDocuments({ cycle: cycle._id, status: 'unpaid' }),
    Payment.aggregate([
      { $match: { cycle: cycle._id, status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    PaymentAttempt.countDocuments({ cycle: cycle._id }),
  ]);

  const collected = collectedAgg[0]?.total || 0;

  res.json({
    cycle: {
      ...cycle,
      id: String(cycle._id),
      monthName: ETH_MONTHS[cycle.ethMonth - 1] || `Month ${cycle.ethMonth}`,
      stats: {
        totalStudents,
        paidCount,
        waivedCount,
        unpaidCount,
        collectedSantim: collected,
        collectedEtb: (collected / 100).toFixed(2),
        submissionsCount,
        percentPaid: totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0,
      },
    },
  });
});

// 5. Open Cycle
export const openCycleHandler = asyncHandler(async (req, res) => {
  const result = await openPaymentCycle(req.params.id, req.user?.id);
  audit({
    req,
    action: 'finance.cycle_opened',
    targetType: 'PaymentCycle',
    targetId: req.params.id,
    meta: { chargesGenerated: result.chargesGenerated },
  });
  res.json(result);
});

// 6. Update Cycle
export const updateCycleHandler = asyncHandler(async (req, res) => {
  const cycle = await updatePaymentCycle(req.params.id, req.body, req.user?.id);
  audit({
    req,
    action: 'finance.cycle_updated',
    targetType: 'PaymentCycle',
    targetId: cycle._id,
    meta: req.body,
  });
  res.json({ cycle });
});

// 7. Close / Reopen / Cancel / Delete
export const closeCycleHandler = asyncHandler(async (req, res) => {
  const cycle = await closePaymentCycle(req.params.id, req.user?.id);
  audit({ req, action: 'finance.cycle_closed', targetType: 'PaymentCycle', targetId: cycle._id });
  res.json({ cycle });
});

export const reopenCycleHandler = asyncHandler(async (req, res) => {
  const cycle = await reopenPaymentCycle(req.params.id, req.body.newDueAt, req.user?.id);
  audit({ req, action: 'finance.cycle_reopened', targetType: 'PaymentCycle', targetId: cycle._id, meta: { newDueAt: req.body.newDueAt } });
  res.json({ cycle });
});

export const cancelCycleHandler = asyncHandler(async (req, res) => {
  const cycle = await cancelPaymentCycle(req.params.id, req.body.reason, req.user?.id);
  res.json({ cycle });
});

export const deleteCycleHandler = asyncHandler(async (req, res) => {
  const result = await deletePaymentCycle(req.params.id, req.user?.id);
  audit({ req, action: 'finance.cycle_deleted', targetType: 'PaymentCycle', targetId: req.params.id });
  res.json(result);
});

// 8. Collections (All charges list with rich filters)
export const listCollections = asyncHandler(async (req, res) => {
  const {
    cycleId,
    department,
    programme,
    batch,
    category,
    status,
    search,
    overdueOnly,
    batchId,
    departmentId,
    courseId,
    page = 1,
    limit = 25,
  } = req.query;

  const filter = {};
  if (cycleId) filter.cycle = cycleId;
  if (department) filter.department = new RegExp(department, 'i');
  if (programme) filter.programme = new RegExp(programme, 'i');
  if (batch) filter.batch = new RegExp(batch, 'i');
  if (category) filter.category = category.toLowerCase();
  if (status) filter.status = status;

  if (overdueOnly === 'true') {
    filter.status = 'unpaid';
    filter.dueAt = { $lt: new Date() };
  }

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { studentId: new RegExp(s, 'i') },
      { studentName: new RegExp(s, 'i') },
    ];
  }

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({
    batchId: batchId || (mongoose.Types.ObjectId.isValid(batch) ? batch : undefined),
    departmentId: departmentId || (mongoose.Types.ObjectId.isValid(department) ? department : undefined),
    courseId,
  });

  if (matchingStudentIds !== null) {
    filter.student = { $in: matchingStudentIds };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [charges, total] = await Promise.all([
    StudentCharge.find(filter)
      .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
      .populate('student', 'phone email photo')
      .populate('payment', 'receiptNumber method bankReference paidAt payerName')
      .populate('waiver', 'amount type reason approvedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    StudentCharge.countDocuments(filter),
  ]);

  const now = new Date();
  const enriched = charges.map((c) => ({
    ...c,
    id: String(c._id),
    isOverdue: c.status === 'unpaid' && new Date(c.dueAt) < now,
    amountDueEtb: (c.amountDue / 100).toFixed(2),
  }));

  res.json({ charges: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

// 9. Manual Payment
export const recordPaymentHandler = asyncHandler(async (req, res) => {
  const { chargeId } = req.params;
  const { amount, method, bankReference, payerName, receiptUrl } = req.body;
  const result = await recordManualPayment({
    chargeId,
    amount,
    method,
    bankReference,
    payerName,
    receiptUrl,
    userId: req.user?.id,
  });
  res.json(result);
});

// 10. Waiver
export const createWaiverHandler = asyncHandler(async (req, res) => {
  const { chargeId } = req.params;
  const { amount, type, reason } = req.body;
  const result = await createWaiver({
    chargeId,
    amount,
    type,
    reason,
    userId: req.user?.id,
  });
  res.json(result);
});

export const revokeWaiverHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await revokeWaiver(id, req.body.reason, req.user?.id);
  audit({ req, action: 'finance.waiver_revoked', targetType: 'Waiver', targetId: id, meta: { reason: req.body.reason } });
  res.json({ waiver: result });
});

export const listWaivers = asyncHandler(async (req, res) => {
  const { status, batchId, departmentId, courseId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId });
  if (matchingStudentIds !== null) {
    filter.student = { $in: matchingStudentIds };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [waivers, total] = await Promise.all([
    Waiver.find(filter)
      .populate('student', 'studentId fullName department program batch')
      .populate('cycle', 'title ethYear ethMonth')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Waiver.countDocuments(filter),
  ]);

  res.json({
    waivers: waivers.map((w) => ({
      ...w,
      id: String(w._id),
      amountEtb: (w.amount / 100).toFixed(2),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// 11. Extend Deadline
export const extendDeadlineHandler = asyncHandler(async (req, res) => {
  const { chargeId } = req.params;
  const { extendedDueAt, reason } = req.body;
  const result = await extendStudentDeadline({
    chargeId,
    extendedDueAt,
    reason,
    userId: req.user?.id,
  });
  res.json(result);
});

// 12. Payments Ledger
export const listLedger = asyncHandler(async (req, res) => {
  const { status, method, search, batchId, departmentId, courseId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (method) filter.method = method;

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { receiptNumber: new RegExp(s, 'i') },
      { bankReference: new RegExp(s, 'i') },
      { payerName: new RegExp(s, 'i') },
    ];
  }

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId });
  if (matchingStudentIds !== null) {
    filter.student = { $in: matchingStudentIds };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('student', 'studentId fullName department program batch')
      .populate('cycle', 'title ethYear ethMonth dueAt')
      .populate('recordedBy', 'name email')
      .populate('reversedBy', 'name email')
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Payment.countDocuments(filter),
  ]);

  res.json({
    payments: payments.map((p) => ({
      ...p,
      id: String(p._id),
      amountEtb: (p.amount / 100).toFixed(2),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

export const reversePaymentHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const payment = await reversePayment(id, reason, req.user?.id);
  res.json({ payment });
});

// 13. Review Queue
export const listReviewQueue = asyncHandler(async (req, res) => {
  const { result = 'review_required', batchId, departmentId, courseId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (result) filter.result = result;

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId });
  if (matchingStudentIds !== null) {
    filter.student = { $in: matchingStudentIds };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [attempts, total] = await Promise.all([
    PaymentAttempt.find(filter)
      .populate('student', 'studentId fullName phone email')
      .populate('cycle', 'title ethYear ethMonth amount bank')
      .populate('charge')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PaymentAttempt.countDocuments(filter),
  ]);

  res.json({
    attempts: attempts.map((a) => ({
      ...a,
      id: String(a._id),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

export const resolveReviewAttempt = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // 'approve' or 'reject'

  const attempt = await PaymentAttempt.findById(id).populate('charge').populate('cycle').populate('student');
  if (!attempt) throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Attempt record not found.');

  if (action === 'approve') {
    // Approve: record as confirmed payment!
    const doneHash = crypto.randomBytes(16).toString('hex');
    const count = await Payment.countDocuments();
    const ethYear = attempt.cycle?.ethYear || 2019;
    const receiptNumber = `REC-${ethYear}-${String(count + 1).padStart(6, '0')}`;

    const payment = await Payment.create({
      receiptNumber,
      charge: attempt.charge._id,
      cycle: attempt.cycle._id,
      student: attempt.student._id,
      amount: attempt.cycle.amount,
      method: 'cbe_receipt',
      bankReference: attempt.parsedReference || `REVIEW-${Date.now()}`,
      doneHash,
      status: 'confirmed',
      payerName: attempt.student?.fullName || attempt.studentId,
      receiptUrl: attempt.receiptUrl,
      cbeData: attempt.cbeResponse,
      recordedBy: req.user?.id,
      paidAt: new Date(),
    });

    attempt.charge.status = 'paid';
    attempt.charge.paidAt = new Date();
    attempt.charge.payment = payment._id;
    await attempt.charge.save();

    attempt.result = 'success';
    attempt.reviewNotes = notes || 'Approved manually by accountant in review queue.';
    attempt.reviewedBy = req.user?.id;
    attempt.reviewedAt = new Date();
    await attempt.save();

    audit({
      req,
      action: 'finance.review_queue_approved',
      targetType: 'PaymentAttempt',
      targetId: attempt._id,
      meta: { receiptNumber, notes },
    });

    return res.json({ success: true, payment, attempt });
  } else {
    // Reject
    attempt.result = 'failed';
    attempt.reviewNotes = notes || 'Rejected by accountant.';
    attempt.reviewedBy = req.user?.id;
    attempt.reviewedAt = new Date();
    await attempt.save();

    audit({
      req,
      action: 'finance.review_queue_rejected',
      targetType: 'PaymentAttempt',
      targetId: attempt._id,
      meta: { notes },
    });

    return res.json({ success: true, attempt });
  }
});

// 14. Overdue and Holds
export const listOverdueHolds = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 25 } = req.query;
  const now = new Date();

  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const graceDays = Number(settings?.finance?.graceDays || 0);
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  const filter = {
    status: 'unpaid',
    dueAt: { $lt: cutoff },
  };

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { studentId: new RegExp(s, 'i') },
      { studentName: new RegExp(s, 'i') },
    ];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [charges, total] = await Promise.all([
    StudentCharge.find(filter)
      .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
      .populate('student', 'phone email photo')
      .sort({ dueAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    StudentCharge.countDocuments(filter),
  ]);

  res.json({
    overdue: charges.map((c) => ({
      ...c,
      id: String(c._id),
      daysOverdue: Math.max(1, Math.floor((now - new Date(c.dueAt)) / 86_400_000)),
      amountDueEtb: (c.amountDue / 100).toFixed(2),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

export const notifyOverdueHoldsHandler = asyncHandler(async (req, res) => {
  const now = new Date();
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const graceDays = Number(settings?.finance?.graceDays || 0);
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  const overdueCharges = await StudentCharge.find({
    status: 'unpaid',
    dueAt: { $lt: cutoff },
  })
    .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
    .populate('student', 'studentId fullName phone email department program batch')
    .lean();

  if (!overdueCharges.length) {
    return res.json({ success: true, count: 0, message: 'No overdue charges requiring notification.' });
  }

  // 1. Group by student
  const studentMap = new Map();
  for (const c of overdueCharges) {
    if (!c.student?._id) continue;
    const sId = String(c.student._id);
    if (!studentMap.has(sId)) {
      studentMap.set(sId, { student: c.student, charges: [] });
    }
    studentMap.get(sId).charges.push(c);
  }

  const notificationsToInsert = [];

  for (const [sId, item] of studentMap.entries()) {
    const student = item.student;
    const charges = item.charges;
    const totalDue = charges.reduce((acc, c) => acc + (c.amountDue || 0), 0);
    const totalDueEtb = (totalDue / 100).toFixed(2);
    const firstCharge = charges[0];
    const portalHash = firstCharge?.cycle?.portalHash;

    notificationsToInsert.push({
      student: student._id,
      cycle: firstCharge?.cycle?._id || null,
      title: 'Academic Hold Warning: Unpaid Monthly Fees',
      message: `You have ${charges.length} overdue fee cycle(s) totaling ${totalDueEtb} ETB. Automated academic holds are in effect blocking assessment submissions, attendance, and mark recording. Please settle immediately via Chapa at /monthly-payments/${portalHash || ''}`,
      type: 'hold_warning',
    });

    // Notify assigned teachers for this student
    notifyAssignedTeachersHoldStatus(student._id, {
      isCleared: false,
      details: {
        title: firstCharge?.cycle?.title || 'Overdue Monthly Fee',
        amountEtb: totalDueEtb,
      },
    }).catch(() => {});
  }

  if (notificationsToInsert.length) {
    await StudentNotification.insertMany(notificationsToInsert, { ordered: false }).catch(() => {});
  }

  // 2. Notify Registrar office
  await notifyRole('REGISTRAR', {
    title: 'Financial Holds Active: Student Clearance Blocked',
    message: `Finance has alerted ${studentMap.size} overdue student(s) currently under academic hold. ID card issuance, graduation eligibility, and official document printing remain locked.`,
    type: 'financial_hold_summary',
    link: '/registrar/applications',
  }).catch(() => {});

  audit({
    req,
    action: 'finance.overdue_holds_notified',
    targetType: 'StudentCharge',
    meta: { studentsCount: studentMap.size, chargesCount: overdueCharges.length },
  });

  res.json({
    success: true,
    studentsNotified: studentMap.size,
    chargesCount: overdueCharges.length,
    message: `Alerts dispatched to ${studentMap.size} overdue students, their assigned teachers, and the Registrar Office.`,
  });
});

// 15. Student Finance Profile
export const getStudentProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const student = await Student.findById(id)
    .populate('department', 'name')
    .populate('program', 'name')
    .populate('batch', 'name')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student record not found.');

  const [charges, payments, waivers, holdStatus] = await Promise.all([
    StudentCharge.find({ student: student._id })
      .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
      .populate('payment', 'receiptNumber method bankReference paidAt status')
      .populate('waiver', 'amount type reason')
      .sort({ 'cycle.ethYear': -1, 'cycle.ethMonth': -1 })
      .lean(),
    Payment.find({ student: student._id })
      .populate('cycle', 'title ethYear ethMonth')
      .sort({ paidAt: -1 })
      .lean(),
    Waiver.find({ student: student._id })
      .populate('cycle', 'title ethYear ethMonth')
      .sort({ createdAt: -1 })
      .lean(),
    checkStudentFinancialHold(student._id),
  ]);

  const totalBilled = charges.reduce((acc, c) => acc + (c.amountDue || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalWaived = waivers
    .filter((w) => w.status === 'approved')
    .reduce((acc, w) => acc + (w.amount || 0), 0);

  const currentEthYear = toEthiopian(new Date()).year;
  const chargeYears = charges.map((c) => c.cycle?.ethYear).filter(Boolean);
  const years = [...new Set([currentEthYear, ...chargeYears])].sort((a, b) => b - a);

  const ethiopianMatrix = {};
  for (const y of years) {
    ethiopianMatrix[y] = ETH_MONTHS.map((monthName, idx) => {
      const m = idx + 1; // 1 to 13
      const charge = charges.find((c) => c.cycle?.ethYear === y && c.cycle?.ethMonth === m);
      if (!charge) {
        return {
          month: m,
          name: monthName,
          status: 'none',
          label: 'No Cycle',
          amountEtb: null,
        };
      }
      const isOverdue = charge.status === 'unpaid' && new Date(charge.dueAt) < new Date();
      return {
        month: m,
        name: monthName,
        chargeId: String(charge._id),
        status: isOverdue ? 'overdue' : charge.status,
        label: isOverdue
          ? 'Overdue'
          : charge.status === 'paid'
          ? 'Paid'
          : charge.status === 'waived'
          ? 'Waived'
          : 'Unpaid',
        amountDueEtb: (charge.amountDue / 100).toFixed(2),
        dueAt: charge.dueAt,
        paidAt: charge.paidAt,
        receiptNumber: charge.payment?.receiptNumber || null,
        waiverReason: charge.waiver?.reason || null,
        portalHash: charge.cycle?.portalHash || null,
      };
    });
  }

  res.json({
    student: {
      ...student,
      id: String(student._id),
    },
    summary: {
      totalBilledEtb: (totalBilled / 100).toFixed(2),
      totalPaidEtb: (totalPaid / 100).toFixed(2),
      totalWaivedEtb: (totalWaived / 100).toFixed(2),
      outstandingEtb: (Math.max(0, totalBilled - totalPaid - totalWaived) / 100).toFixed(2),
      holdStatus,
    },
    ethiopianMatrix,
    charges: charges.map((c) => ({
      ...c,
      id: String(c._id),
      amountDueEtb: (c.amountDue / 100).toFixed(2),
    })),
    payments: payments.map((p) => ({
      ...p,
      id: String(p._id),
      amountEtb: (p.amount / 100).toFixed(2),
    })),
    waivers: waivers.map((w) => ({
      ...w,
      id: String(w._id),
      amountEtb: (w.amount / 100).toFixed(2),
    })),
  });
});

// 16. Finance Settings
export const getSettings = asyncHandler(async (_req, res) => {
  const setting = await SystemSetting.findOne({ key: 'global' }).lean();
  res.json({ finance: setting?.finance || {} });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const setting = await SystemSetting.findOne({ key: 'global' });
  if (!setting) throw new AppError(404, 'NOT_FOUND', 'System settings not initialized.');

  setting.finance = {
    ...setting.finance?.toObject?.(),
    ...req.body,
  };
  await setting.save();

  audit({
    req,
    action: 'finance.settings_updated',
    targetType: 'SystemSetting',
    targetId: 'global',
    meta: req.body,
  });

  res.json({ finance: setting.finance });
});
