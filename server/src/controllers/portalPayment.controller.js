import jwt from 'jsonwebtoken';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyCbeReceipt } from '../services/cbeVerifier.service.js';
import { toEthiopian, ETH_MONTHS } from '../utils/ethiopianDate.js';

const PORTAL_JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'portal-secret-key-sms-finance-2019';

// In-memory rate limiting map for studentId attempts: max 6 attempts per 15 mins per studentId
const studentAttemptMap = new Map();
function checkStudentIdRateLimit(studentId) {
  const key = String(studentId).toUpperCase();
  const now = Date.now();
  const record = studentAttemptMap.get(key);
  if (!record || now > record.resetAt) {
    studentAttemptMap.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (record.count >= 6) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts for this Student ID. Please wait 15 minutes.');
  }
  record.count++;
}

/**
 * 1. GET /api/portal/monthly-payments/:hash
 * Returns uniform 404 for unknown, draft, closed or expired links
 */
export const getCyclePublicDetails = asyncHandler(async (req, res) => {
  const { hash } = req.params;
  const cycle = await PaymentCycle.findOne({
    portalHash: String(hash).toLowerCase().trim(),
    status: 'open',
    deletedAt: null,
  }).lean();

  if (!cycle) {
    throw new AppError(404, 'NOT_FOUND', 'This monthly payment link does not exist, has closed, or is not yet open.');
  }

  const now = new Date();
  if (cycle.opensAt && now < cycle.opensAt) {
    throw new AppError(404, 'NOT_FOUND', 'This payment portal has not yet opened.');
  }

  // Format Ethiopian label
  const ethMonthName = ETH_MONTHS[cycle.ethMonth - 1] || 'Month';

  res.json({
    cycle: {
      title: cycle.title,
      ethYear: cycle.ethYear,
      ethMonth: cycle.ethMonth,
      monthName: ethMonthName,
      amount: cycle.amount,
      amountEtb: (cycle.amount / 100).toFixed(2),
      opensAt: cycle.opensAt,
      dueAt: cycle.dueAt,
      bank: {
        bank: cycle.bank.bank,
        accountNumber: cycle.bank.accountNumber,
        holderName: cycle.bank.holderName,
      },
    },
  });
});

/**
 * 2. POST /api/portal/monthly-payments/:hash/login
 * Login by student ID with rate-limiting
 */
export const loginStudentPortal = asyncHandler(async (req, res) => {
  const { hash } = req.params;
  const { studentId } = req.body;

  if (!studentId || !String(studentId).trim()) {
    throw new AppError(400, 'STUDENT_ID_REQUIRED', 'Please enter your Student ID.');
  }

  const normalizedId = String(studentId).toUpperCase().trim();
  checkStudentIdRateLimit(normalizedId);

  const cycle = await PaymentCycle.findOne({
    portalHash: String(hash).toLowerCase().trim(),
    status: 'open',
    deletedAt: null,
  });

  if (!cycle) {
    throw new AppError(404, 'NOT_FOUND', 'This payment portal is not available.');
  }

  const student = await Student.findOne({ studentId: normalizedId });
  if (!student) {
    throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student ID was not found in college records.');
  }

  // Find charge for this student and cycle
  const charge = await StudentCharge.findOne({ student: student._id, cycle: cycle._id });
  if (!charge) {
    throw new AppError(403, 'NOT_IN_TARGET_GROUP', 'You are not enrolled in this monthly payment cycle.');
  }

  // If already paid, immediately return the doneHash link!
  if (charge.status === 'paid' && charge.payment) {
    const payment = await Payment.findById(charge.payment).lean();
    if (payment && payment.doneHash) {
      return res.json({
        alreadyPaid: true,
        doneHash: payment.doneHash,
        receiptNumber: payment.receiptNumber,
        message: 'This fee has already been paid and confirmed.',
      });
    }
  }

  if (charge.status === 'waived') {
    return res.json({
      alreadyPaid: true,
      waived: true,
      message: 'This monthly fee has been waived or exempted by the college.',
    });
  }

  // Generate short-lived scoped portal token (valid for 3 hours, strictly for this charge)
  const portalToken = jwt.sign(
    {
      chargeId: String(charge._id),
      studentId: student.studentId,
      studentName: student.fullName || `${student.firstName} ${student.lastName}`,
      cycleId: String(cycle._id),
      portalHash: cycle.portalHash,
    },
    PORTAL_JWT_SECRET,
    { expiresIn: '3h' }
  );

  res.json({
    alreadyPaid: false,
    portalToken,
    student: {
      studentId: student.studentId,
      fullName: student.fullName || `${student.firstName} ${student.lastName}`,
    },
    charge: {
      amountDue: charge.amountDue,
      amountEtb: (charge.amountDue / 100).toFixed(2),
      dueAt: charge.dueAt,
    },
    bank: cycle.bank,
  });
});

/**
 * 3. POST /api/portal/monthly-payments/:hash/verify
 * Submit CBE receipt URL and verify
 */
export const verifyPortalReceipt = asyncHandler(async (req, res) => {
  const { hash } = req.params;
  const { portalToken, receiptUrl } = req.body;

  if (!portalToken) {
    throw new AppError(401, 'INVALID_SESSION', 'Session expired. Please enter your Student ID again.');
  }
  if (!receiptUrl || !String(receiptUrl).trim()) {
    throw new AppError(400, 'RECEIPT_URL_REQUIRED', 'Please paste the CBE receipt link.');
  }

  let decoded;
  try {
    decoded = jwt.verify(portalToken, PORTAL_JWT_SECRET);
  } catch {
    throw new AppError(401, 'EXPIRED_SESSION', 'Your session has expired. Please enter your Student ID again.');
  }

  if (decoded.portalHash !== String(hash).toLowerCase().trim()) {
    throw new AppError(403, 'INVALID_PORTAL_SCOPE', 'Token scope does not match this payment cycle.');
  }

  const [cycle, charge, student] = await Promise.all([
    PaymentCycle.findById(decoded.cycleId),
    StudentCharge.findById(decoded.chargeId),
    Student.findById(charge?.student),
  ]);

  if (!cycle || !charge || !student) {
    throw new AppError(404, 'RECORD_NOT_FOUND', 'Payment record not found.');
  }

  if (charge.status === 'paid' && charge.payment) {
    const p = await Payment.findById(charge.payment);
    return res.json({
      status: 'success',
      alreadyPaid: true,
      doneHash: p?.doneHash,
      receiptNumber: p?.receiptNumber,
    });
  }

  // Prevent double-tap race condition
  if (charge.isLocked && charge.lockedAt && Date.now() - new Date(charge.lockedAt).getTime() < 30000) {
    throw new AppError(409, 'VERIFICATION_IN_PROGRESS', 'A verification is already in progress for this payment. Please wait 30 seconds.');
  }

  // Lock charge
  charge.isLocked = true;
  charge.lockedAt = new Date();
  await charge.save();

  try {
    const result = await verifyCbeReceipt({
      charge,
      cycle,
      student,
      rawReceiptInput: receiptUrl.trim(),
      ipAddress: req.ip || '',
    });

    // If failed, make sure charge is unlocked so student can retry
    if (result.status !== 'success') {
      charge.isLocked = false;
      charge.lockedAt = null;
      await charge.save();
    }

    res.json(result);
  } catch (err) {
    charge.isLocked = false;
    charge.lockedAt = null;
    await charge.save().catch(() => {});
    throw err;
  }
});

/**
 * 4. GET /api/portal/monthly-payments/done/:doneHash
 * Official Confirmation Page data
 */
export const getPaymentConfirmation = asyncHandler(async (req, res) => {
  const { doneHash } = req.params;
  const payment = await Payment.findOne({
    doneHash: String(doneHash).trim(),
    status: 'confirmed',
  })
    .populate('cycle', 'title ethYear ethMonth dueAt bank')
    .populate('student', 'studentId fullName department program batch')
    .lean();

  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Official payment confirmation not found or payment was reversed.');
  }

  res.json({
    confirmation: {
      receiptNumber: payment.receiptNumber,
      amountSantim: payment.amount,
      amountEtb: (payment.amount / 100).toFixed(2),
      paidAt: payment.paidAt,
      method: payment.method,
      bankReference: payment.bankReference,
      payerName: payment.payerName,
      student: {
        studentId: payment.student?.studentId,
        fullName: payment.student?.fullName,
      },
      cycle: {
        title: payment.cycle?.title,
        ethYear: payment.cycle?.ethYear,
        ethMonth: payment.cycle?.ethMonth,
      },
      bank: payment.cycle?.bank,
    },
  });
});
