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
import { notifyRole, notifyUsers } from '../services/notification.service.js';
import mongoose from 'mongoose';
import {
  PaymentCycle,
  StudentCharge,
  Payment,
  PaymentAttempt,
  Waiver,
  DeadlineExtension,
  StudentNotification,
  AwardPayment,
} from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { Batch, Department, Course, Program } from '../models/AcademicStructure.js';
import { CourseRegistration } from '../models/Offering.js';
import { SystemSetting } from '../models/SystemSetting.js';
import { ETH_MONTHS, toEthiopian } from '../utils/ethiopianDate.js';
import crypto from 'node:crypto';
import {
  buildStudentStatementDocx,
  buildStudentStatementXlsx,
  buildStudentStatementPdf,
  buildListXlsx,
  buildListCsv,
  buildListDocx,
  buildListPdf,
} from '../services/finance-export.service.js';
import { sendFinanceNotification } from '../services/mail.service.js';
import { getAssignedTeacherUserIdsForStudent, getStudentFinancialStatus } from '../services/finance.service.js';

async function resolveStudentIdsForAcademicFilter({ batchId, departmentId, programId, courseId }) {
  if (!batchId && !departmentId && !programId && !courseId) return null;
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
  if (programId) {
    if (mongoose.Types.ObjectId.isValid(programId)) {
      filter.program = programId;
    } else {
      const pDoc = await Program.findOne({ $or: [{ code: programId }, { name: programId }] });
      if (pDoc) filter.program = pDoc._id;
    }
  }
  const students = await Student.find(filter).distinct('_id');
  return students;
}

let programNameCache = null;
async function getProgramNameMap() {
  if (programNameCache && Date.now() - programNameCache.at < 5 * 60 * 1000) return programNameCache.map;
  const programs = await Program.find({}).select('name code').lean();
  const map = new Map(programs.map((p) => [p._id.toString(), p.name || p.code || '']));
  programNameCache = { map, at: Date.now() };
  return map;
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
    courseId: mongoose.Types.ObjectId.isValid(courseId) ? courseId : undefined,
    programId: req.query.programId || (mongoose.Types.ObjectId.isValid(programme) ? programme : undefined),
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
  const { amount, type, reason, scholarshipCollege, sendEmail } = req.body;
  const result = await createWaiver({
    chargeId,
    amount,
    type,
    reason,
    scholarshipCollege,
    sendEmail: sendEmail !== false,
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
  const { status, batchId, departmentId, courseId, programId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId, programId });
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
  const { status, method, search, batchId, departmentId, courseId, programId, page = 1, limit = 25 } = req.query;
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

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId, programId });
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

export const verifyPaymentByReceipt = asyncHandler(async (req, res) => {
  const { receiptNumber } = req.params;
  if (!receiptNumber || !String(receiptNumber).trim()) {
    throw new AppError(400, 'RECEIPT_NUMBER_REQUIRED', 'Receipt number is required.');
  }

  const payment = await Payment.findOne({ receiptNumber: String(receiptNumber).trim() })
    .populate('charge')
    .populate('cycle', 'title ethYear ethMonth')
    .populate('student', 'studentId fullName department program batch')
    .lean();

  if (!payment) {
    throw new AppError(404, 'RECEIPT_NOT_FOUND', 'No payment found with that receipt number.');
  }

  const charge = payment.charge || null;
  const cycle = payment.cycle || null;
  const student = payment.student || null;

  res.json({
    verification: {
      receiptNumber: payment.receiptNumber,
      amountEtb: (payment.amount / 100).toFixed(2),
      paidAt: payment.paidAt,
      method: payment.method,
      bankReference: payment.bankReference,
      payerName: payment.payerName,
      status: payment.status,
      chapaReference: payment.chapaReference || null,
      chapaReceiptUrl: payment.chapaReceiptUrl || null,
      student: student
        ? {
            studentId: student.studentId,
            fullName: student.fullName,
            department: student.department?.name || '',
            programme: student.program?.name || '',
            batch: student.batch?.name || '',
          }
        : null,
      cycle: cycle
        ? {
            title: cycle.title,
            ethYear: cycle.ethYear,
            ethMonth: cycle.ethMonth,
          }
        : null,
      bank: cycle?.bank || null,
    },
  });
});

// 13. Review Queue
export const listReviewQueue = asyncHandler(async (req, res) => {
  const { result = 'review_required', batchId, departmentId, courseId, programId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (result) filter.result = result;

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId, programId });
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
  const now = new Date();
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const graceDays = Number(settings?.finance?.graceDays || 0);
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  const filter = {
    status: 'unpaid',
    dueAt: { $lt: cutoff },
  };

  const { search, programme, batchId, departmentId, programId, page = 1, limit = 25 } = req.query;

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { studentId: new RegExp(s, 'i') },
      { studentName: new RegExp(s, 'i') },
    ];
  }

  // Student-level academic filters (batch / department / programme)
  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, programId });
  if (matchingStudentIds !== null) {
    filter.student = { $in: matchingStudentIds };
  }

  const charges = await StudentCharge.find(filter)
    .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
    .populate('student', 'studentId fullName photo department program batch')
    .lean();

  const programNameMap = await getProgramNameMap();

  // Group overdue charges per student: one row per student with every overdue month
  const studentMap = new Map();
  for (const c of charges) {
    const sKey = String(c.student?._id || c.student);
    if (!studentMap.has(sKey)) {
      const st = c.student || {};
      studentMap.set(sKey, {
        id: sKey,
        studentId: st.studentId || c.studentId,
        fullName: st.fullName || c.studentName,
        photoUrl: st.photo?.url || st.photo?.filePath || null,
        programme: st.program?._id ? programNameMap.get(String(st.program._id)) : c.programme || '',
        batch: st.batch?.name || c.batch || '',
        charges: [],
      });
    }
    studentMap.get(sKey).charges.push({
      id: String(c._id),
      cycle: c.cycle?.title || 'Monthly fee',
      ethYear: c.cycle?.ethYear,
      ethMonth: c.cycle?.ethMonth,
      dueAt: c.dueAt,
      amountDueEtb: (c.amountDue / 100).toFixed(2),
      daysOverdue: Math.max(1, Math.floor((now - new Date(c.dueAt)) / 86_400_000)),
      portalHash: c.cycle?.portalHash || null,
    });
  }

  let students = [...studentMap.values()].map((row) => ({
    ...row,
    overdueCount: row.charges.length,
    totalOverdueEtb: row.charges
      .reduce((acc, c) => acc + (parseEtbToSantim(c.amountDueEtb) || 0), 0)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }));

  if (programme) {
    const p = String(programme).trim().toLowerCase();
    students = students.filter((s) => String(s.programme || '').toLowerCase() === p);
  }

  students.sort((a, b) => b.charges.length - a.charges.length || a.fullName.localeCompare(b.fullName));

  // Distinct programme list for the filter dropdown
  const programmes = [...new Set(students.map((s) => s.programme).filter(Boolean))].sort();

  // Flat charge list kept for compatibility
  const overdueFlat = charges.map((c) => ({
    id: String(c._id),
    student: c.student,
    studentId: c.studentId,
    studentName: c.studentName,
    programme: c.programme,
    batch: c.batch,
    cycle: c.cycle,
    amountDue: c.amountDue,
    amountDueEtb: (c.amountDue / 100).toFixed(2),
    dueAt: c.dueAt,
    daysOverdue: Math.max(1, Math.floor((now - new Date(c.dueAt)) / 86_400_000)),
  }));

  const totalStudents = students.length;
  const totalOverdueSantim = overdueFlat.reduce((acc, c) => acc + (c.amountDue || 0), 0);
  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const paged = students.slice(skip, skip + Number(limit));

  res.json({
    students: paged,
    overdue: overdueFlat,
    programmes,
    summary: {
      totalStudents,
      totalOverdueEtb: (totalOverdueSantim / 100).toFixed(2),
      totalOverdueCharges: overdueFlat.length,
    },
    page: Number(page),
    pages: Math.max(1, Math.ceil(totalStudents / Number(limit))),
  });
});

function parseEtbToSantim(etbString) {
  const n = parseFloat(String(etbString));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Overdue giveaway to assigned teachers only (NOT students, NOT registrar) for one programme
export const notifyProgrammeOverdueTeachers = asyncHandler(async (req, res) => {
  const now = new Date();
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  const graceDays = Number(settings?.finance?.graceDays || 0);
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  const { programme, batchId, departmentId, programId } = req.body || {};
  const filter = { status: 'unpaid', dueAt: { $lt: cutoff } };

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, programId });
  if (matchingStudentIds !== null) filter.student = { $in: matchingStudentIds };

  const charges = await StudentCharge.find(filter)
    .populate('cycle', 'title ethYear ethMonth dueAt')
    .populate('student', 'studentId fullName department program batch')
    .lean();

  let target = charges;
  if (programme) {
    const p = String(programme).trim().toLowerCase();
    target = charges.filter((c) => {
      const st = c.student || {};
      return String(st.program?.name || c.programme || '').trim().toLowerCase() === p;
    });
  }

  if (!target.length) {
    return res.json({ success: true, students: 0, teachers: 0, message: 'No overdue charges found for this selection.' });
  }

  const studentMap = new Map();
  for (const c of target) {
    const sid = String(c.student?._id || c.student);
    if (!studentMap.has(sid)) studentMap.set(sid, { student: c.student || { _id: c.student }, charges: [] });
    studentMap.get(sid).charges.push(c);
  }

  let studentsNotified = 0;
  const failed = [];

  for (const [sid, item] of studentMap.entries()) {
    const st = item.student || {};
    const fullName = [st.firstName, st.middleName, st.lastName].filter(Boolean).join(' ') || st.fullName || st.studentId || 'Student';
    const months = item.charges
      .map((c) => `${c.cycle?.title || `${c.cycle?.ethMonth}/${c.cycle?.ethYear}`}`)
      .join(', ');
    const totalEtb = (item.charges.reduce((acc, c) => acc + (c.amountDue || 0), 0) / 100).toFixed(2);

    try {
      const teacherIds = await getAssignedTeacherUserIdsForStudent(sid);
      if (!teacherIds.length) continue;
      await notifyUsers(teacherIds, {
        title: 'Overdue Monthly Fee Alert',
        message: `${fullName} (${st.studentId || 'unknown ID'}) has ${item.charges.length} overdue month(s): ${months}. Total overdue: ${totalEtb} ETB. The official documents (transcript/certificate) remain blocked until cleared.`,
        type: 'financial_hold',
        link: '/teacher/classes',
      });
      studentsNotified++;
    } catch {
      failed.push(st.studentId || sid);
    }
  }

  audit({
    req,
    action: 'finance.overdue_programme_teachers_notified',
    targetType: 'StudentCharge',
    meta: { programme: programme || '', students: studentMap.size, studentsNotified },
  });

  res.json({
    success: true,
    studentsInProgramme: studentMap.size,
    studentsNotified,
    failed,
    message: `Notified assigned teachers for ${studentMap.size} overdue student(s) in this programme.`,
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

// ---------------------------------------------------------------- Student search & exports

export const searchStudents = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ students: [] });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const students = await Student.find({
    $or: [
      { studentId: new RegExp(escaped, 'i') },
      { fullName: new RegExp(escaped, 'i') },
      { firstName: new RegExp(escaped, 'i') },
      { lastName: new RegExp(escaped, 'i') },
    ],
  })
    .select('studentId fullName department program batch studentCategory photo phone email')
    .populate('department', 'name')
    .populate('program', 'name')
    .populate('batch', 'name')
    .sort({ studentId: 1 })
    .limit(10)
    .lean();

  res.json({
    students: students.map((s) => ({
      id: String(s._id),
      studentId: s.studentId,
      fullName: s.fullName,
      department: s.department?.name || '',
      programme: s.program?.name || '',
      batch: s.batch?.name || '',
      category: s.studentCategory || 'regular',
      photoUrl: s.photo?.url || s.photo?.filePath || null,
      phone: s.phone || '',
      email: s.email || '',
    })),
  });
});

// fprintf helpers -------------------------------------------------------------------

const EXPORT_FORMATS = ['pdf', 'docx', 'xlsx', 'csv'];

function sendExport(res, { buffer, format, filename }) {
  const types = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8',
  };
  res.setHeader('Content-Type', types[format] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (format === 'csv') res.send(String(buffer));
  else res.send(Buffer.from(buffer));
}

async function buildStudentFinanceSnapshot(id) {
  const student = await Student.findById(id)
    .populate('department', 'name')
    .populate('program', 'name')
    .populate('batch', 'name')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student record not found.');

  const [charges, payments, waivers, holdStatus] = await Promise.all([
    StudentCharge.find({ student: student._id })
      .populate('cycle', 'title ethYear ethMonth dueAt amount portalHash')
      .populate('payment', 'receiptNumber method bankReference paidAt status chapaReference')
      .populate('waiver', 'amount type reason')
      .sort({ createdAt: 1 })
      .lean(),
    Payment.find({ student: student._id }).populate('cycle', 'title ethYear ethMonth').sort({ paidAt: -1 }).lean(),
    Waiver.find({ student: student._id }).populate('cycle', 'title ethYear ethMonth').sort({ createdAt: -1 }).lean(),
    checkStudentFinancialHold(student._id),
  ]);

  const totalBilledSantim = charges.reduce((acc, c) => acc + (c.amountDue || 0), 0);
  const totalPaidSantim = payments.filter((p) => p.status === 'confirmed').reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalWaivedSantim = waivers
    .filter((w) => w.status === 'approved')
    .reduce((acc, w) => acc + (w.amount || 0), 0);

  const currentEthYear = toEthiopian(new Date()).year;
  const chargeYears = charges.map((c) => c.cycle?.ethYear).filter(Boolean);
  const years = [...new Set([currentEthYear, ...chargeYears])].sort((a, b) => b - a);

  const matrix = {};
  for (const y of years) {
    matrix[y] = ETH_MONTHS.map((monthName, idx) => {
      const m = idx + 1;
      const charge = charges.find((c) => c.cycle?.ethYear === y && c.cycle?.ethMonth === m);
      if (!charge) {
        return { month: m, name: monthName, status: 'none', label: 'No Cycle' };
      }
      const isOverdue = charge.status === 'unpaid' && new Date(charge.dueAt) < new Date();
      return {
        month: m,
        name: monthName,
        chargeId: String(charge._id),
        status: isOverdue ? 'overdue' : charge.status,
        label: isOverdue ? 'Overdue' : charge.status === 'paid' ? 'Paid' : charge.status === 'waived' ? 'Waived' : 'Unpaid',
        amountDueEtb: ((charge.amountDue || 0) / 100).toFixed(2),
        dueAt: charge.dueAt,
        paidAt: charge.paidAt,
        receiptNumber: charge.payment?.receiptNumber || null,
        waiverReason: charge.waiver?.reason || null,
      };
    });
  }

  return {
    student,
    summary: {
      totalBilledSantim,
      totalPaidSantim,
      totalWaivedSantim,
      outstandingSantim: Math.max(0, totalBilledSantim - totalPaidSantim - totalWaivedSantim),
      holdStatus,
    },
    ethiopianMatrix: matrix,
    charges,
    payments,
    waivers,
  };
}

export const exportStudentStatement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const format = String(req.query.format || 'pdf').toLowerCase();
  if (!EXPORT_FORMATS.includes(format)) {
    throw new AppError(400, 'BAD_FORMAT', 'Format must be one of pdf, docx, xlsx, csv.');
  }

  const snapshot = await buildStudentFinanceSnapshot(id);
  const snapshotForExport = {
    ...snapshot,
    summary: {
      totalBilledSantim: snapshot.summary.totalBilledSantim,
      totalPaidSantim: snapshot.summary.totalPaidSantim,
      totalWaivedSantim: snapshot.summary.totalWaivedSantim,
      outstandingSantim: snapshot.summary.outstandingSantim,
      holdStatus: snapshot.summary.holdStatus,
    },
  };
  const safeName = (snapshot.student.studentId || 'student').replace(/[^\w-]+/g, '_');
  const filename = `Fee-Statement-${safeName}`;

  let buffer;
  if (format === 'pdf') buffer = await buildStudentStatementPdf(snapshotForExport);
  else if (format === 'docx') buffer = await buildStudentStatementDocx(snapshotForExport);
  else if (format === 'xlsx') buffer = await buildStudentStatementXlsx(snapshotForExport);
  else {
    const rows = statementListRows(snapshotForExport);
    buffer = buildListCsv(
      [rows, paymentListRows(snapshotForExport)].flat(),
      ['record', 'receiptNumber', 'cycle', 'amount', 'status', 'method', 'paidAt', 'reference'],
    );
  }

  audit({ req, action: 'finance.student_statement_exported', targetType: 'Student', targetId: id, meta: { format } });
  sendExport(res, { buffer, format, filename });
});

function statementListRows(snapshot) {
  return statementRowsHelper(snapshot.charges || []);
}
function paymentListRows(snapshot) {
  return paymentRowsHelper(snapshot.payments || []);
}

function statementRowsHelper(charges) {
  return charges.map((c) => ({
    record: 'CHARGE',
    receiptNumber: c.payment?.receiptNumber || '-',
    cycle: c.cycle?.title || '-',
    amount: ((c.amountDue || 0) / 100).toFixed(2),
    status: String(c.status || '').toUpperCase(),
    method: c.payment?.method ? String(c.payment.method).replace(/_/g, ' ').toUpperCase() : (c.waiver ? 'WAIVER' : '-'),
    paidAt: c.paidAt ? new Date(c.paidAt).toISOString().slice(0, 10) : '-',
    reference: c.payment?.bankReference || c.waiver?.reason || '-',
  }));
}
function paymentRowsHelper(payments) {
  return payments.map((p) => ({
    record: 'PAYMENT',
    receiptNumber: p.receiptNumber || '-',
    cycle: p.cycle?.title || '-',
    amount: ((p.amount || 0) / 100).toFixed(2),
    status: String(p.status || '').toUpperCase(),
    method: String(p.method || '').replace(/_/g, ' ').toUpperCase(),
    paidAt: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '-',
    reference: p.bankReference || p.chapaReference || '-',
  }));
}

export const exportCollections = asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  if (!EXPORT_FORMATS.includes(format)) {
    throw new AppError(400, 'BAD_FORMAT', 'Format must be one of pdf, docx, xlsx, csv.');
  }

  const {
    cycleId, department, programme, batch, category, status, search, overdueOnly,
    batchId, departmentId, courseId, programId,
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
    filter.$or = [{ studentId: new RegExp(s, 'i') }, { studentName: new RegExp(s, 'i') }];
  }

  const matchingStudentIds = await resolveStudentIdsForAcademicFilter({ batchId, departmentId, courseId, programId });
  if (matchingStudentIds !== null) filter.student = { $in: matchingStudentIds };

  const charges = await StudentCharge.find(filter)
    .populate('cycle', 'title ethYear ethMonth dueAt amount')
    .populate('student', 'studentId fullName photo department program batch')
    .populate('payment', 'receiptNumber method bankReference paidAt payerName')
    .sort({ createdAt: 1 })
    .limit(5000)
    .lean();

  const programNameMap = await getProgramNameMap();
  const rows = charges.map((c) => ({
    studentId: c.student?.studentId || c.studentId,
    studentName: c.student?.fullName || c.studentName,
    programme: c.student?.program?._id ? programNameMap.get(String(c.student.program._id)) : c.programme || '',
    department: c.department || '',
    batch: c.student?.batch?.name || c.batch || '',
    cycle: c.cycle?.title || '-',
    month: c.cycle?.ethMonth || '',
    year: c.cycle?.ethYear || '',
    amountDueEtb: (c.amountDue / 100).toFixed(2),
    status: String(c.status || '').toUpperCase(),
    receiptNumber: c.payment?.receiptNumber || '',
    method: c.payment?.method ? String(c.payment.method).replace(/_/g, ' ').toUpperCase() : '',
    paidAt: c.paidAt ? new Date(c.paidAt).toISOString().slice(0, 10) : '',
  }));

  const meta = {
    Rows: rows.length,
    Programme: rowProgrammeLabel(rows, programme) || programme || '-',
    Status: status || (overdueOnly === 'true' ? 'overdue only' : 'all'),
  };

  const filename = `Payment-Status-Programme-${Date.now()}`;
  let buffer;
  if (format === 'xlsx') buffer = await buildListXlsx({ title: 'Payment Status Report', meta, rows });
  else if (format === 'docx') buffer = await buildListDocx({ title: 'Payment Status Report', meta, rows });
  else if (format === 'pdf') buffer = await buildListPdf({ title: 'Payment Status Report', meta, rows });
  else buffer = buildListCsv(rows);

  audit({ req, action: 'finance.collections_exported', targetType: 'StudentCharge', meta: { format, rows: rows.length } });
  sendExport(res, { buffer, format, filename });
});

function rowProgrammeLabel(rows, programmeQuery) {
  return programmeQuery || rows.find((r) => r.programme)?.programme || '';
}

// ---------------------------------------------------------------- Award Payments

export const listAwardPayments = asyncHandler(async (req, res) => {
  const { competition, search, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (competition) filter.competition = String(competition).trim();
  if (search) {
    const s = String(search).trim();
    filter.$or = [{ studentId: new RegExp(s, 'i') }, { studentName: new RegExp(s, 'i') }];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [awards, total] = await Promise.all([
    AwardPayment.find(filter)
      .populate('student', 'studentId fullName photo department program batch')
      .sort({ awardedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    AwardPayment.countDocuments(filter),
  ]);

  // Group by competition with totals for the filter cards
  const byCompetition = await AwardPayment.aggregate([
    competition ? { $match: { competition: String(competition).trim() } } : { $match: {} },
    {
      $group: {
        _id: '$competition',
        count: { $sum: 1 },
        totalAmountSantim: { $sum: '$amount' },
        latest: { $max: '$awardedAt' },
      },
    },
    { $sort: { latest: -1 } },
  ]);

  res.json({
    awards: awards.map((a) => ({
      ...a,
      id: String(a._id),
      amountEtb: (a.amount / 100).toFixed(2),
      photoUrl: a.student?.photo?.url || a.student?.photo?.filePath || null,
    })),
    competitions: byCompetition.map((c) => ({
      name: c._id,
      count: c.count,
      totalAmountEtb: ((c.totalAmountSantim || 0) / 100).toFixed(2),
      latest: c.latest,
    })),
    total,
    page: Number(page),
    pages: Math.max(1, Math.ceil(total / Number(limit))),
  });
});

export const createAwardPayment = asyncHandler(async (req, res) => {
  const { student, competition, place, amountEtb, method, proofUrl, awardedAt, notes } = req.body;
  if (!student || !competition || !place || !amountEtb) {
    throw new AppError(400, 'FIELD_REQUIRED', 'Student, competition, place and amount are required.');
  }
  if (!['1st', '2nd', '3rd', '4th'].includes(String(place))) {
    throw new AppError(400, 'BAD_PLACE', 'Place must be 1st, 2nd, 3rd or 4th.');
  }
  if (!['cash', 'transfer'].includes(String(method || 'cash'))) {
    throw new AppError(400, 'BAD_METHOD', 'Method must be cash or transfer.');
  }
  if (method === 'transfer' && proofUrl && !/^https?:\/\//i.test(proofUrl)) {
    throw new AppError(400, 'BAD_PROOF_URL', 'Proof of payment must be a valid http(s) link.');
  }

  let studentDoc;
  if (mongoose.Types.ObjectId.isValid(student)) {
    studentDoc = await Student.findById(student);
  }
  if (!studentDoc) {
    studentDoc = await Student.findOne({ studentId: String(student).toUpperCase().trim() });
  }
  if (!studentDoc) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student not found by id or student number.');

  const amount = Math.round(Number(amountEtb) * 100);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new AppError(400, 'BAD_AMOUNT', 'Enter a valid award amount.');
  }

  const award = await AwardPayment.create({
    student: studentDoc._id,
    studentId: studentDoc.studentId,
    studentName: studentDoc.fullName || [studentDoc.firstName, studentDoc.middleName, studentDoc.lastName].filter(Boolean).join(' '),
    programme: studentDoc.programme || '',
    batch: studentDoc.batch || '',
    competition: String(competition).trim(),
    place,
    amount,
    method: method || 'cash',
    proofUrl: proofUrl || '',
    awardedAt: awardedAt ? new Date(awardedAt) : new Date(),
    notes: notes || '',
    recordedBy: req.user?.id,
  });

  audit({ req, action: 'finance.award_created', targetType: 'AwardPayment', targetId: award._id, meta: { competition, place, amount, studentId: studentDoc.studentId } });
  res.json({ award: { ...award.toObject(), id: String(award._id), amountEtb: (award.amount / 100).toFixed(2) } });
});

export const deleteAwardPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const award = await AwardPayment.findById(id);
  if (!award) throw new AppError(404, 'AWARD_NOT_FOUND', 'Award payment record not found.');
  await award.deleteOne();
  audit({ req, action: 'finance.award_deleted', targetType: 'AwardPayment', targetId: id });
  res.json({ success: true });
});

// ---------------------------------------------------------------- Reports (real academic years + export)

export const getAcademicYears = asyncHandler(async (_req, res) => {
  const years = await PaymentCycle.aggregate([
    { $group: { _id: '$ethYear', cycles: { $sum: 1 }, first: { $min: '$opensAt' }, last: { $max: '$dueAt' } } },
    { $sort: { _id: -1 } },
  ]);
  res.json({
    years: years.map((y) => ({ ethYear: y._id, cycles: y.cycles, from: y.first, to: y.last })),
  });
});

export const getYearlyReport = asyncHandler(async (req, res) => {
  const ethYear = Number(req.query.ethYear) || (await latestEthYear());
  if (!ethYear) throw new AppError(404, 'NO_YEARS', 'No payment cycles exist yet.');

  const cycles = await PaymentCycle.find({ ethYear }).lean();

  // StudentCharge has no direct ethYear → filter with cycle _ids of this year
  const cycleIds = cycles.map((c) => c._id);
  const [yearCharges, yearPayments] = await Promise.all([
    StudentCharge.find({ cycle: { $in: cycleIds } })
      .populate('cycle', 'ethYear ethMonth')
      .populate('student', 'program batch')
      .lean(),
    Payment.find({ cycle: { $in: cycleIds } })
      .populate('cycle', 'ethYear ethMonth')
      .lean(),
  ]);

  const programNameMap = await getProgramNameMap();
  const monthRows = [];
  for (let m = 1; m <= 12; m++) {
    const monthCharges = yearCharges.filter((c) => c.cycle?.ethMonth === m);
    const monthPayments = yearPayments.filter((p) => p.cycle?.ethMonth === m);
    monthRows.push({
      month: `${m}`,
      charges: monthCharges.length,
      billed: (monthCharges.reduce((a, c) => a + (c.amountDue || 0), 0) / 100).toFixed(2),
      paid: (monthPayments.reduce((a, p) => a + (p.amount || 0), 0) / 100).toFixed(2),
      paidCount: monthPayments.length,
    });
  }

  const byProgramme = {};
  for (const c of yearCharges) {
    const key = c.student?.program?._id ? programNameMap.get(String(c.student.program._id)) || '-' : c.programme || '-';
    byProgramme[key] ||= { programme: key, charges: 0, billed: 0, paid: 0, outstanding: 0 };
    const row = byProgramme[key];
    row.charges++;
    row.billed += c.amountDue || 0;
    if (c.status === 'paid') row.paid += c.amountDue || 0;
    if (c.status === 'unpaid') row.outstanding += c.amountDue || 0;
  }
  const programmeRows = Object.values(byProgramme)
    .map((r) => ({
      programme: r.programme,
      charges: r.charges,
      billed: (r.billed / 100).toFixed(2),
      paid: (r.paid / 100).toFixed(2),
      outstanding: (r.outstanding / 100).toFixed(2),
    }))
    .sort((a, b) => a.programme.localeCompare(b.programme));

  const methodRows = Object.entries(
    yearPayments.reduce((acc, p) => {
      acc[p.method || 'other'] = (acc[p.method || 'other'] || 0) + (p.amount || 0);
      return acc;
    }, {}),
  ).map(([method, amt]) => ({ method: String(method).replace(/_/g, ' ').toUpperCase(), amount: (amt / 100).toFixed(2) }));

  res.json({
    ethYear,
    monthRows,
    programmeRows,
    methodRows,
    totals: {
      cycles: cycles.length,
      charges: yearCharges.length,
      billed: (yearCharges.reduce((a, c) => a + (c.amountDue || 0), 0) / 100).toFixed(2),
      paid: (yearPayments.reduce((a, p) => a + (p.amount || 0), 0) / 100).toFixed(2),
      outstanding: (
        yearCharges.reduce((a, c) => a + (c.status === 'unpaid' ? c.amountDue || 0 : 0), 0) / 100
      ).toFixed(2),
      payments: yearPayments.length,
    },
  });
});

async function latestEthYear() {
  const agg = await PaymentCycle.aggregate([{ $group: { _id: null, maxYear: { $max: '$ethYear' } } }]);
  return agg[0]?.maxYear || null;
}

export const exportYearlyReport = asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!EXPORT_FORMATS.includes(format)) {
    throw new AppError(400, 'BAD_FORMAT', 'Format must be one of pdf, docx, xlsx, csv.');
  }

  // Reuse the same aggregation by calling the service directly
  const ethYear = Number(req.query.ethYear) || (await latestEthYear());

  // Minimal duplicate of getYearlyReport logic for export
  const cycles = await PaymentCycle.find({ ethYear }).lean();
  const cycleIds = cycles.map((c) => c._id);
  const [yearCharges, yearPayments] = await Promise.all([
    StudentCharge.find({ cycle: { $in: cycleIds } }).populate('cycle', 'ethYear ethMonth').populate('student', 'program programme').lean(),
    Payment.find({ cycle: { $in: cycleIds } }).populate('cycle', 'ethYear ethMonth').lean(),
  ]);
  const programNameMap = await getProgramNameMap();

  const rows = yearCharges.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    programme: c.student?.program?._id ? programNameMap.get(String(c.student.program._id)) || '' : c.programme || '',
    batch: c.batch || '',
    cycle: `${c.cycle?.ethMonth}/${c.cycle?.ethYear}`,
    amountDueEtb: (c.amountDue / 100).toFixed(2),
    status: String(c.status || '').toUpperCase(),
    paidAt: c.paidAt ? new Date(c.paidAt).toISOString().slice(0, 10) : '',
  }));

  const meta = { EthYear: ethYear, Cycles: cycles.length, Charges: rows.length };
  const filename = `Finance-Report-EC-${ethYear}`;
  let buffer;
  if (format === 'xlsx') buffer = await buildListXlsx({ title: `Finance Report EC ${ethYear}`, meta, rows });
  else if (format === 'docx') buffer = await buildListDocx({ title: `Finance Report EC ${ethYear}`, meta, rows });
  else if (format === 'pdf') buffer = await buildListPdf({ title: `Finance Report EC ${ethYear}`, meta, rows });
  else buffer = buildListCsv(rows);

  audit({ req, action: 'finance.report_exported', targetType: 'PaymentCycle', meta: { ethYear, format, rows: rows.length } });
  sendExport(res, { buffer, format, filename });
});
