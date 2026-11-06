import crypto from 'node:crypto';
import { Chapa, isAxiosError } from 'chapa-nodejs';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { toEthiopian } from '../utils/ethiopianDate.js';
import { calculateOverdueLateFee } from '../utils/lateFee.js';

// Chapa field limits: checkout `title` ≤ 26 chars, `description` ≤ 128 chars. Anything
// longer is rejected at initialize-time with a validation error, so clamp here.
const CHAPA_TITLE_LIMIT = 26;
const CHAPA_DESCRIPTION_LIMIT = 128;

// Chapa only accepts letters, numbers, hyphens, underscores, spaces, and dots inside
// customization (and name) fields — parentheses, slashes, Amharic script, etc. are
// rejected wholesale. Strip anything else before it reaches the gateway.
const CHAPA_ALLOWED_TEXT = /[^A-Za-z0-9_.\- ]+/g;

export function sanitizeChapaText(value, limit) {
  if (value == null) return '';
  const cleaned = String(value).replace(CHAPA_ALLOWED_TEXT, ' ').replace(/\s+/g, ' ').trim();
  return limit ? cleaned.slice(0, limit).trim() : cleaned;
}

// Lazily created official SDK client (https://github.com/Chapa-Et/chapa-nodejs).
let chapaClient = null;

export function getChapaClient() {
  if (!env.CHAPA_SECRET_KEY) {
    throw new AppError(503, 'CHAPA_NOT_CONFIGURED', 'Chapa payment gateway is not configured.');
  }
  if (!chapaClient) {
    chapaClient = new Chapa({ secretKey: env.CHAPA_SECRET_KEY });
  }
  return chapaClient;
}

/**
 * Turn an SDK/Axios failure into a user-readable sentence. Chapa sends either a plain
 * string, or a validation-error object which the SDK collapses into "[object Object]" —
 * in that case we still know the HTTP status and can hint at what was rejected.
 */
function chapaFailureMessage(error) {
  let detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!detail || detail === '[object Object]') detail = '';
  if (detail) return detail;

  const status = error?.status ?? error?.response?.status;
  switch (status) {
    case 400:
      return 'Chapa rejected the payment details (invalid field). Please contact the finance office if this continues.';
    case 401:
      return 'Chapa credentials were rejected. Please contact the finance office.';
    case 408:
    case 504:
      return 'Chapa gateway timed out. Please try again.';
    case 404:
      return 'Chapa could not find this transaction.';
    case 503:
      return 'Chapa gateway is unreachable right now. Please try again shortly.';
    default:
      return 'Chapa gateway could not process the request. Please try again.';
  }
}

function logChapaFailure(error, scope, extra = {}) {
  const status = error?.status ?? error?.response?.status;
  const payload = isAxiosError(error) ? error.response?.data : undefined;
  if (payload) {
    logger.warn({ chapaResponse: payload, status, ...extra }, scope);
  } else {
    logger.warn({ chapaError: error?.message, status, ...extra }, scope);
  }
}

/**
 * 1. Initialize Chapa Hosted Checkout (official SDK, v1 /transaction/initialize)
 */
export async function initializeHostedPayment({
  amount,
  currency = 'ETB',
  email,
  firstName,
  lastName,
  phone,
  txRef,
  callbackUrl,
  returnUrl,
  customization = {},
}) {
  const chapa = getChapaClient();

  const payload = {
    amount: String(amount),
    currency,
    email: email || 'student@college.edu.et',
    first_name: sanitizeChapaText(firstName || 'Student') || 'Student',
    last_name: sanitizeChapaText(lastName || 'Account') || 'Account',
    phone_number: phone || '',
    tx_ref: txRef,
    callback_url: callbackUrl || env.CHAPA_WEBHOOK_URL,
    return_url: returnUrl,
    customization: {
      title: sanitizeChapaText(customization.title || 'College Monthly Fee', CHAPA_TITLE_LIMIT) || 'Monthly Fee',
      description:
        sanitizeChapaText(customization.description || 'Monthly college tuition fee payment', CHAPA_DESCRIPTION_LIMIT) ||
        'Tuition payment',
    },
  };

  let response;
  try {
    response = await chapa.initialize(payload);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logChapaFailure(error, 'Chapa initialization failed', { txRef });
    throw new AppError(400, 'CHAPA_INIT_FAILED', chapaFailureMessage(error));
  }

  const checkoutUrl = response?.data?.checkout_url || response?.checkout_url;
  if (!checkoutUrl) {
    logger.warn({ chapaResponse: response, txRef }, 'Chapa initialization returned no checkout_url');
    throw new AppError(502, 'CHAPA_INVALID_RESPONSE', 'Chapa did not return a valid checkout link.');
  }

  return {
    checkoutUrl,
    txRef,
    raw: response,
  };
}

/**
 * 2. Verify Transaction with Chapa Official Verify API (official SDK)
 * Returns `{ status: number, data }` — consumers treat non-200 as verification failure.
 */
export async function verifyChapaTransaction(txRef) {
  const chapa = getChapaClient();

  try {
    const response = await chapa.verify({ tx_ref: txRef });
    return { status: 200, data: response };
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    logChapaFailure(error, 'Chapa verification failed', { txRef });
    return {
      status,
      data: { message: chapaFailureMessage(error) },
    };
  }
}

/**
 * 3. Verify Webhook Signature (HMAC-SHA256, constant-time)
 */
export function verifyChapaWebhookSignature(rawBody, signatureHeader) {
  if (!env.CHAPA_WEBHOOK_SECRET) return false;
  if (!signatureHeader || !rawBody) return false;

  const expected = crypto
    .createHmac('sha256', env.CHAPA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(String(signatureHeader), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * 4. Process Verified Chapa Payment & Atomically Update Database
 * Strict rules:
 * - SUCCESS: Mark StudentCharge as PAID, create Payment record, return doneHash
 * - FAILED: Do NOT mark as paid, do NOT create Payment record, return failed status
 */
export async function processVerifiedChapaPayment({ txRef, verifiedData, ipAddress = '' }) {
  // Find PaymentAttempt by txRef
  let attempt = await PaymentAttempt.findOne({ parsedReference: txRef });
  let charge = null;
  let cycle = null;
  let student = null;

  if (attempt && attempt.charge) {
    charge = await StudentCharge.findById(attempt.charge);
    if (charge) {
      cycle = await PaymentCycle.findById(charge.cycle);
      student = await Student.findById(charge.student);
    }
  }

  // Fallback: If attempt not found, parse chargeId from tx_ref ('TX-CHAPA-<chargeId>-<timestamp>')
  if (!charge && txRef.startsWith('TX-CHAPA-')) {
    const parts = txRef.split('-');
    if (parts[2]) {
      charge = await StudentCharge.findById(parts[2]);
      if (charge) {
        cycle = await PaymentCycle.findById(charge.cycle);
        student = await Student.findById(charge.student);
      }
    }
  }

  if (!charge || !cycle || !student) {
    throw new AppError(404, 'CHARGE_NOT_FOUND', 'Could not locate matching student charge record.');
  }

  // Idempotency: if already paid, return confirmed details
  if (charge.status === 'paid' && charge.payment) {
    const existingPayment = await Payment.findById(charge.payment).lean();
    if (existingPayment) {
      return {
        status: 'success',
        alreadyPaid: true,
        doneHash: existingPayment.doneHash,
        receiptNumber: existingPayment.receiptNumber,
        payment: existingPayment,
        message: 'This fee is already paid and confirmed.',
      };
    }
  }

  // Validation
  const chapaStatus = String(verifiedData.status || '').toLowerCase();
  const isSuccess = chapaStatus === 'success';

  // Amount check in ETB (charge.amountDue is in santim, late fee may apply)
  const baseExpectedEtb = (charge.amountDue / 100).toFixed(2);
  let cycleDoc = null;
  if (charge.cycle) {
    const query = PaymentCycle.findById(charge.cycle);
    cycleDoc = query && typeof query.lean === 'function' ? await query.lean() : await query;
  }
  const lateFee = calculateOverdueLateFee(charge.dueAt || cycleDoc?.dueAt, charge.amountDue);
  const overdueExpectedEtb = (lateFee.totalAmountSantim / 100).toFixed(2);
  const receivedEtb = Number(verifiedData.amount).toFixed(2);

  if (!isSuccess) {
    // Record failed attempt in audit ledger WITHOUT updating charge/payment
    if (attempt) {
      attempt.result = chapaStatus === 'pending' ? 'pending_verification' : 'failed';
      attempt.cbeResponse = verifiedData;
      attempt.reasonCode = chapaStatus === 'pending' ? 'CHAPA_PENDING' : 'CHAPA_VERIFICATION_FAILED';
      await attempt.save().catch(() => {});
    }

    charge.isLocked = false;
    charge.lockedAt = null;
    await charge.save().catch(() => {});

    if (chapaStatus === 'pending') {
      return {
        status: 'pending',
        message: 'Payment is still being processed by Chapa. Please try again in a moment.',
        verifiedData,
      };
    }

    return {
      status: 'failed',
      message: 'Payment verification failed on Chapa. Your card or wallet was not charged.',
      verifiedData,
    };
  }

  const amountMatches = (receivedEtb === baseExpectedEtb || receivedEtb === overdueExpectedEtb);
  if (!amountMatches) {
    logger.warn({ baseExpectedEtb, overdueExpectedEtb, receivedEtb, txRef }, 'Chapa payment amount mismatch');
    throw new AppError(400, 'AMOUNT_MISMATCH', `Payment amount ${receivedEtb} ETB does not match expected fee ${overdueExpectedEtb} ETB.`);
  }

  const currency = String(verifiedData.currency || '').toUpperCase();
  if (currency !== 'ETB') {
    throw new AppError(400, 'CURRENCY_MISMATCH', `Expected currency ETB but received ${currency}.`);
  }

  // Build unique receipt number & doneHash
  const ethYear = toEthiopian(new Date()).year;
  const count = await Payment.countDocuments();
  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const receiptNumber = `REC-${ethYear}-${String(count + 1).padStart(4, '0')}-${randSuffix}`;
  const doneHash = crypto.randomBytes(16).toString('hex');

  // Chapa's own transaction reference ID (e.g. CHAPA-REF-999) — used to build the
  // official Chapa receipt URL: https://chapa.link/payment-receipt/{chapaReference}
  const chapaReference = String(verifiedData.reference || verifiedData.tx_ref || txRef).trim();
  const chapaReceiptUrl = `https://checkout.chapa.co/checkout/test-payment-receipt/${encodeURIComponent(chapaReference)}`;

  // Create append-only confirmed Payment record
  const payment = await Payment.create({
    receiptNumber,
    charge: charge._id,
    cycle: cycle._id,
    student: student._id,
    amount: charge.amountDue,
    method: 'chapa',
    bankReference: verifiedData.reference || txRef,
    doneHash,
    status: 'confirmed',
    chapaReference,
    chapaReceiptUrl,
    payerName: `${verifiedData.first_name || ''} ${verifiedData.last_name || ''}`.trim() || student.fullName,
    cbeData: verifiedData,
    paidAt: verifiedData.created_at ? new Date(verifiedData.created_at) : new Date(),
  });

  // Update StudentCharge to paid
  charge.status = 'paid';
  charge.paidAt = new Date();
  charge.payment = payment._id;
  charge.isLocked = false;
  charge.lockedAt = null;
  await charge.save();

  // Update PaymentAttempt to success
  if (attempt) {
    attempt.result = 'success';
    attempt.cbeResponse = verifiedData;
    attempt.reasonCode = 'CHAPA_SUCCESS';
    await attempt.save().catch(() => {});
  } else {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: `chapa://${txRef}`,
      parsedReference: txRef,
      cbeResponse: verifiedData,
      result: 'success',
      reasonCode: 'CHAPA_SUCCESS',
      ipAddress,
    }).catch(() => {});
  }

  return {
    status: 'success',
    alreadyPaid: false,
    doneHash,
    receiptNumber,
    payment,
    charge,
    message: 'Payment verified and successfully confirmed!',
  };
}
