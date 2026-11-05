import crypto from 'node:crypto';
import https from 'node:https';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';
import { toEthiopian } from '../utils/ethiopianDate.js';
import { calculateOverdueLateFee } from '../utils/lateFee.js';

const CHAPA_BASE_URL = env.CHAPA_API_BASE_URL || 'https://api.chapa.co';

// Chapa field limits: checkout `title` ≤ 26 chars, `description` ≤ 128 chars. Anything
// longer is rejected at initialize-time with a validation error, so clamp here.
const CHAPA_TITLE_LIMIT = 26;
const CHAPA_DESCRIPTION_LIMIT = 128;

/**
 * Flatten a Chapa error response into one readable message.
 * Chapa returns either `message: "string"` or a validation error object such as
 * `{ message: { phone_number: ["not a valid format"], email: ["..."] } }`.
 */
function chapaErrorMessage(res) {
  const m = res?.data?.message ?? res?.data?.error;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (Array.isArray(m)) return m.filter(Boolean).join(', ');
  if (m && typeof m === 'object') {
    const parts = Object.entries(m).map(([field, issues]) => {
      const text = Array.isArray(issues) ? issues.join(', ') : String(issues);
      return `${field}: ${text}`;
    });
    if (parts.length) return parts.join('; ');
  }
  if (res?.data?.status && res.data.status !== 'success' && typeof res.data.message !== 'string') {
    return 'Chapa rejected the payment initialization.';
  }
  return 'Could not initialize Chapa checkout.';
}

/**
 * Perform HTTPS request with JSON parsing
 */
function chapaRequest({ path, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CHAPA_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(504, 'CHAPA_TIMEOUT', 'Chapa gateway timed out. Please try again.'));
    });

    req.on('error', (err) => {
      reject(new AppError(502, 'CHAPA_NETWORK_ERROR', `Payment gateway communication error: ${err.message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 1. Initialize Chapa Hosted Checkout
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
  if (!env.CHAPA_SECRET_KEY) {
    throw new AppError(503, 'CHAPA_NOT_CONFIGURED', 'Chapa payment gateway is not configured.');
  }

  const payload = {
    amount: String(amount),
    currency,
    email: email || 'student@college.edu.et',
    first_name: firstName || 'Student',
    last_name: lastName || 'Account',
    phone_number: phone || '',
    tx_ref: txRef,
    callback_url: callbackUrl || env.CHAPA_WEBHOOK_URL,
    return_url: returnUrl,
    customization: {
      title: (customization.title || 'College Monthly Fee').slice(0, CHAPA_TITLE_LIMIT),
      description: (customization.description || 'Monthly college tuition fee payment').slice(0, CHAPA_DESCRIPTION_LIMIT),
    },
  };

  // 1. Try v1/transaction/initialize
  let res = await chapaRequest({
    path: '/v1/transaction/initialize',
    method: 'POST',
    headers: {
      'Idempotency-Key': txRef,
    },
    body: payload,
  });

  // If 404 on v1, fallback to v2/payments/hosted
  if (res.status === 404) {
    res = await chapaRequest({
      path: '/v2/payments/hosted',
      method: 'POST',
      headers: {
        'Idempotency-Key': txRef,
      },
      body: payload,
    });
  }

  if (res.status !== 200 && res.status !== 201) {
    const errorMsg = chapaErrorMessage(res);
    logger.warn({ chapaResponse: res.data, status: res.status, txRef }, 'Chapa initialization failed');
    throw new AppError(400, 'CHAPA_INIT_FAILED', errorMsg);
  }

  const checkoutUrl = res.data?.data?.checkout_url || res.data?.checkout_url;
  if (!checkoutUrl) {
    throw new AppError(502, 'CHAPA_INVALID_RESPONSE', 'Chapa did not return a valid checkout link.');
  }

  return {
    checkoutUrl,
    txRef,
    raw: res.data,
  };
}

/**
 * 2. Verify Transaction with Chapa Official Verify API
 */
export async function verifyChapaTransaction(txRef) {
  if (!env.CHAPA_SECRET_KEY) {
    throw new AppError(503, 'CHAPA_NOT_CONFIGURED', 'Chapa payment gateway is not configured.');
  }

  // 1. Try v1 verify
  let res = await chapaRequest({
    path: `/v1/transaction/verify/${encodeURIComponent(txRef)}`,
    method: 'GET',
  });

  // If 404 on v1, try v2 verify
  if (res.status === 404) {
    res = await chapaRequest({
      path: `/v2/payments/${encodeURIComponent(txRef)}/verify`,
      method: 'GET',
    });
  }

  return res;
}

/**
 * 3. Verify Webhook Signature (HMAC-SHA256)
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
      attempt.result = 'failed';
      attempt.cbeResponse = verifiedData;
      attempt.reasonCode = 'CHAPA_VERIFICATION_FAILED';
      await attempt.save().catch(() => {});
    }

    charge.isLocked = false;
    charge.lockedAt = null;
    await charge.save().catch(() => {});

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
