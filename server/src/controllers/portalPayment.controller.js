import jwt from 'jsonwebtoken';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyCbeReceipt } from '../services/cbeVerifier.service.js';
import { toEthiopian, ETH_MONTHS } from '../utils/ethiopianDate.js';
import { calculateOverdueLateFee } from '../utils/lateFee.js';
import { normalizePhone } from '../utils/phone.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  initializeHostedPayment,
  verifyChapaTransaction,
  verifyChapaWebhookSignature,
  processVerifiedChapaPayment,
} from '../services/chapa.service.js';

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
  const cleanHash = String(hash).toLowerCase().trim();
  const cycle = await PaymentCycle.findOne({
    $or: [
      { portalHash: cleanHash },
      { slug: cleanHash },
      { slug: cleanHash.replace(/_/g, '-') },
    ],
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

  // Calculate late fee if overdue
  const lateFee = calculateOverdueLateFee(cycle.dueAt, cycle.amount);

  // Format Ethiopian label
  const ethMonthName = ETH_MONTHS[cycle.ethMonth - 1] || 'Month';

  res.json({
    cycle: {
      portalHash: cycle.portalHash,
      slug: cycle.slug,
      title: cycle.title,
      ethYear: cycle.ethYear,
      ethMonth: cycle.ethMonth,
      monthName: ethMonthName,
      amount: cycle.amount,
      amountEtb: (cycle.amount / 100).toFixed(2),
      daysOverdue: lateFee.daysOverdue,
      overduePenaltyEtb: lateFee.penaltyEtb,
      totalAmountEtb: (lateFee.totalAmountSantim / 100).toFixed(2),
      opensAt: cycle.opensAt,
      dueAt: cycle.dueAt,
      bank: {
        bank: cycle.bank?.bank || 'Chapa Payment Gateway',
        accountNumber: cycle.bank?.accountNumber || 'CHAPA',
        holderName: cycle.bank?.holderName || 'College Online Portal',
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

  const cleanHash = String(hash).toLowerCase().trim();
  const cycle = await PaymentCycle.findOne({
    $or: [
      { portalHash: cleanHash },
      { slug: cleanHash },
      { slug: cleanHash.replace(/_/g, '-') },
    ],
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

  // Compute late fee if overdue
  const lateFee = calculateOverdueLateFee(charge.dueAt || cycle.dueAt, charge.amountDue);

  res.json({
    alreadyPaid: false,
    portalToken,
    student: {
      studentId: student.studentId,
      fullName: student.fullName || `${student.firstName} ${student.lastName}`,
    },
    charge: {
      id: charge._id,
      amountDue: lateFee.totalAmountSantim,
      baseAmountEtb: (charge.amountDue / 100).toFixed(2),
      daysOverdue: lateFee.daysOverdue,
      overduePenaltyEtb: lateFee.penaltyEtb,
      amountEtb: (lateFee.totalAmountSantim / 100).toFixed(2),
      dueAt: charge.dueAt || cycle.dueAt,
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

/**
 * 5. POST /api/portal/monthly-payments/:hash/chapa/initialize
 * Initializes hosted checkout with Chapa Test API
 */
export const initializeChapaPortalPayment = asyncHandler(async (req, res) => {
  const { hash } = req.params;
  const { portalToken } = req.body;

  if (!portalToken) {
    throw new AppError(401, 'INVALID_SESSION', 'Session expired. Please enter your Student ID again.');
  }

  let decoded;
  try {
    decoded = jwt.verify(portalToken, PORTAL_JWT_SECRET);
  } catch {
    throw new AppError(401, 'EXPIRED_SESSION', 'Session expired. Please enter your Student ID again.');
  }

  const cleanHash = String(hash).toLowerCase().trim();
  if (decoded.portalHash !== cleanHash) {
    const matchingCycle = await PaymentCycle.findOne({
      $or: [{ portalHash: cleanHash }, { slug: cleanHash }, { slug: cleanHash.replace(/_/g, '-') }],
    }).select('portalHash slug').lean();
    if (!matchingCycle || matchingCycle.portalHash !== decoded.portalHash) {
      throw new AppError(403, 'INVALID_PORTAL_SCOPE', 'Token scope does not match this payment cycle.');
    }
  }

  const [cycle, charge] = await Promise.all([
    PaymentCycle.findById(decoded.cycleId),
    StudentCharge.findById(decoded.chargeId),
  ]);

  if (!cycle || !charge) {
    throw new AppError(404, 'RECORD_NOT_FOUND', 'Payment record not found.');
  }

  const studentDoc = await Student.findById(charge.student);
  if (!studentDoc) {
    throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student record not found.');
  }

  if (charge.status === 'paid' && charge.payment) {
    const p = await Payment.findById(charge.payment);
    return res.json({
      status: 'already_paid',
      doneHash: p?.doneHash,
      receiptNumber: p?.receiptNumber,
      message: 'This fee is already paid!',
    });
  }

  // Calculate late fee if overdue
  const lateFee = calculateOverdueLateFee(charge.dueAt || cycle.dueAt, charge.amountDue);
  const txRef = `TX-CHAPA-${charge._id}-${Date.now()}`;
  const amountEtb = (lateFee.totalAmountSantim / 100).toFixed(2);

  const clientOrigin = env.CLIENT_ORIGIN || 'https://sms-two-kappa.vercel.app';
  const returnUrl = `${clientOrigin}/monthly-payments/chapa-verify?tx_ref=${encodeURIComponent(txRef)}&hash=${encodeURIComponent(cycle.portalHash)}`;

  await PaymentAttempt.create({
    charge: charge._id,
    cycle: cycle._id,
    student: studentDoc._id,
    studentId: studentDoc.studentId,
    receiptUrl: `chapa://${txRef}`,
    parsedReference: txRef,
    result: 'pending_verification',
    ipAddress: req.ip || '',
  });

  const nameParts = (studentDoc.fullName || `${studentDoc.firstName} ${studentDoc.lastName}`).trim().split(' ');
  const firstName = nameParts[0] || 'Student';
  const lastName = nameParts.slice(1).join(' ') || 'Account';

  // Chapa only accepts Ethiopian domestic numbers (09XXXXXXXX / 07XXXXXXXX); our records
  // store the international form (+2519XXXXXXXX). Convert, and fall back to a neutral
  // placeholder when no mobile number is on file so checkout is not fully blocked.
  const normalizedPhone = normalizePhone(studentDoc.phone || '');
  const chapaPhone = normalizedPhone ? `0${normalizedPhone.slice(4)}` : '0900000000';

  const chapaRes = await initializeHostedPayment({
    amount: amountEtb,
    currency: 'ETB',
    email: studentDoc.email && studentDoc.email.includes('@') ? studentDoc.email : 'student@college.edu.et',
    firstName,
    lastName,
    phone: chapaPhone,
    txRef,
    returnUrl,
    customization: {
      title: `${cycle.title} Fee`,
      description: `Payment for ${studentDoc.fullName} (${studentDoc.studentId})`,
    },
  });

  res.json({
    status: 'success',
    checkoutUrl: chapaRes.checkoutUrl,
    txRef,
  });
});

/**
 * 6. POST /api/portal/monthly-payments/chapa/verify
 * Real database update on verification
 */
export const verifyChapaPortalPayment = asyncHandler(async (req, res) => {
  const { txRef, tx_ref } = req.body;
  const reference = txRef || tx_ref || req.query.tx_ref || req.query.txRef;

  if (!reference || !String(reference).trim()) {
    throw new AppError(400, 'TX_REF_REQUIRED', 'Transaction reference (tx_ref) is required.');
  }

  const cleanRef = String(reference).trim();

  // This is a public payment-return endpoint, not a student login endpoint.
  // Chapa redirects with tx_ref only. Never reject a completed payment because a
  // short-lived portal JWT is missing, expired, or left over in a cached frontend.
  // The server-created PaymentAttempt plus the server-to-server Chapa verification
  // below are the authority for an unpaid transaction.

  // First reconcile against the local ledger. The webhook may have completed this
  // payment before the student's browser returned from Chapa. In that case, return
  // the existing receipt immediately instead of making a second gateway request.
  const existingAttempt = await PaymentAttempt.findOne({ parsedReference: cleanRef });
  if (existingAttempt?.charge) {
    const existingCharge = await StudentCharge.findById(existingAttempt.charge);
    if (existingCharge) {
      let existingPayment = existingCharge.payment
        ? await Payment.findById(existingCharge.payment).lean()
        : null;

      // Recover safely if the payment row was created but the charge link was not
      // saved before a process restart/interruption.
      if (!existingPayment) {
        existingPayment = await Payment.findOne({
          charge: existingCharge._id,
          status: 'confirmed',
        }).lean();
      }

      if (existingPayment?.status === 'confirmed') {
        if (
          existingCharge.status !== 'paid' ||
          String(existingCharge.payment || '') !== String(existingPayment._id)
        ) {
          existingCharge.status = 'paid';
          existingCharge.payment = existingPayment._id;
          existingCharge.paidAt = existingPayment.paidAt || new Date();
          existingCharge.isLocked = false;
          existingCharge.lockedAt = null;
          await existingCharge.save();
        }

        return res.json({
          status: 'success',
          alreadyPaid: true,
          doneHash: existingPayment.doneHash,
          receiptNumber: existingPayment.receiptNumber,
          message: 'Payment is already confirmed in the college ledger.',
        });
      }
    }
  }

  // Only an unpaid transaction needs a fresh server-to-server Chapa verification.
  const chapaVerifyRes = await verifyChapaTransaction(cleanRef);
  if (chapaVerifyRes.status !== 200 || !chapaVerifyRes.data) {
    const errorMsg = chapaVerifyRes.data?.message || 'Chapa transaction verification failed.';
    return res.status(400).json({
      status: 'failed',
      message: errorMsg,
    });
  }

  const verifiedData = chapaVerifyRes.data?.data || chapaVerifyRes.data;

  // Process verified data and update database atomicity
  const processResult = await processVerifiedChapaPayment({
    txRef: cleanRef,
    verifiedData,
    ipAddress: req.ip || '',
  });

  // 202 Accepted = Chapa has the transaction but has not confirmed it yet. The student
  // should retry; no payment record was created, so a later retry is safe.
  if (processResult.status === 'pending') {
    return res.status(202).json(processResult);
  }

  res.json(processResult);
});

/**
 * 7. POST /api/webhooks/chapa
 * Webhook handler with HMAC-SHA256 constant-time verification
 */
export const chapaWebhookHandler = asyncHandler(async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['x-chapa-signature'] || req.headers['chapa-signature'];

  if (!rawBody) {
    return res.status(400).send('Missing webhook body');
  }

  const isValid = verifyChapaWebhookSignature(rawBody, signature);
  if (!isValid && env.NODE_ENV === 'production') {
    logger.warn({ signature }, 'Invalid Chapa webhook signature rejected');
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  let event = {};
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON payload');
  }

  const txRef = event.tx_ref || event.trx_ref || event.reference;
  if (!txRef) {
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    const chapaVerifyRes = await verifyChapaTransaction(txRef);
    if (chapaVerifyRes.status === 200 && chapaVerifyRes.data) {
      const verifiedData = chapaVerifyRes.data?.data || chapaVerifyRes.data;
      await processVerifiedChapaPayment({
        txRef,
        verifiedData,
        ipAddress: req.ip || '',
      });
    }
  } catch (err) {
    logger.warn({ err: err?.message, txRef }, 'Error processing Chapa webhook verification');
  }

  res.status(200).json({ status: 'success' });
});
