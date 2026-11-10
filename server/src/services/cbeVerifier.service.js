import { Payment, PaymentAttempt, StudentCharge } from '../models/Finance.js';
import { checkStudentFinancialHold, notifyAssignedTeachersHoldStatus } from './finance.service.js';
import { audit } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import crypto from 'node:crypto';

// Allowed upstream hosts for SSRF prevention
const ALLOWED_HOSTS = new Set([
  'mbreciept.cbe.com.et',
  'apps.cbe.com.et',
  'mb.cbe.com.et',
]);

const CBE_JSON_API_BASE = process.env.CBE_API_BASE_URL || 'https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/';
const CBE_PORT_100_BASE = process.env.CBE_BRANCH_RECEIPT_BASE_URL || 'https://apps.cbe.com.et:100/BranchReceipt/';
const CBE_APP_ID = process.env.CBE_APP_ID || 'd1292e42-7400-49de-a2d3-9731caa4c819';
const CBE_APP_VERSION = process.env.CBE_APP_VERSION || '0a01980b-9859-1369-8198-59f403820000';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Clean & extract the safe input components from a raw student receipt URL or token
 */
export function parseCbeReceiptInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new AppError(400, 'INVALID_URL', 'Please enter a valid CBE receipt URL or token.');
  }

  const trimmed = rawInput.trim();

  // If typed directly as a v2 token or alphanumeric hash
  if (/^v2-[A-Za-z0-9_-]+$/i.test(trimmed)) {
    return { type: 'json_token', token: trimmed, rawUrl: trimmed };
  }
  if (/^[A-Za-z0-9]{16,64}$/.test(trimmed) && !trimmed.startsWith('FT')) {
    return { type: 'json_token', token: trimmed, rawUrl: trimmed };
  }
  if (/^FT[A-Z0-9]+-\d+$/i.test(trimmed)) {
    const [ft, accSuffix] = trimmed.split('-');
    return { type: 'pdf_ref', ftRef: ft.toUpperCase(), accSuffix, rawUrl: trimmed };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'The receipt link format is not recognized.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new AppError(400, 'DISALLOWED_DOMAIN', 'Only official CBE receipt links (mbreciept.cbe.com.et or apps.cbe.com.et) are accepted.');
  }

  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // Pattern 1: https://apps.cbe.com.et:100/?id=FT...12345678
  const idQuery = searchParams.get('id');
  if (idQuery && /^FT[A-Z0-9]+$/i.test(idQuery)) {
    // Standard CBE FT references are FT + 10 alphanumeric characters (12 chars total)
    const ftMatch = idQuery.match(/^(FT[A-Z0-9]{10})(\d{8,16})$/i) || idQuery.match(/^(FT[A-Z0-9]{8,12})(\d{8,16})$/i);
    if (ftMatch) {
      return { type: 'pdf_ref', ftRef: ftMatch[1].toUpperCase(), accSuffix: ftMatch[2], rawUrl: trimmed };
    }
    return { type: 'pdf_ref', ftRef: idQuery.toUpperCase(), accSuffix: '', rawUrl: trimmed };
  }

  // Pattern 2: https://apps.cbe.com.et:100/BranchReceipt/FT...&12345678
  if (pathname.includes('/BranchReceipt/')) {
    const rawTarget = pathname.replace(/^.*\/BranchReceipt\//, '');
    const [ft, acc] = rawTarget.split('&');
    if (ft) {
      return { type: 'pdf_ref', ftRef: ft.toUpperCase(), accSuffix: acc || '', rawUrl: trimmed };
    }
  }

  // Pattern 3: https://mbreciept.cbe.com.et/FT...-12345678
  const pathToken = pathname.replace(/^\/+/, '').split('/')[0];
  if (/^FT[A-Z0-9]+-\d+$/i.test(pathToken)) {
    const [ft, acc] = pathToken.split('-');
    return { type: 'pdf_ref', ftRef: ft.toUpperCase(), accSuffix: acc, rawUrl: trimmed };
  }

  // Pattern 4: https://mbreciept.cbe.com.et/v2-<token> or plain token
  if (pathToken) {
    return { type: 'json_token', token: pathToken, rawUrl: trimmed };
  }

  throw new AppError(400, 'UNSUPPORTED_CBE_LINK', 'Could not extract a valid CBE transaction token or reference from this link.');
}

/**
 * Fetch from CBE JSON API
 */
export async function queryCbeJsonBackend(token) {
  const endpoint = `${CBE_JSON_API_BASE.replace(/\/+$/, '')}/${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-App-ID': CBE_APP_ID,
        'X-App-Version': CBE_APP_VERSION,
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { notFound: true, status: 404 };
    }
    if (!response.ok) {
      return { error: true, status: response.status, statusText: response.statusText };
    }

    const json = await response.json();
    return { success: true, data: json };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { timeout: true, error: true, message: 'CBE JSON service timeout (8s)' };
    }
    return { networkError: true, error: true, message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch from CBE Port 100 PDF Backend
 */
export async function queryCbePdfBackend(ftRef, accSuffix) {
  const endpoint = `${CBE_PORT_100_BASE.replace(/\/+$/, '')}/${encodeURIComponent(ftRef)}&${encodeURIComponent(accSuffix || '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf, text/plain, */*',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { notFound: true, status: 404 };
    }
    if (!response.ok) {
      return { error: true, status: response.status };
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > 2 * 1024 * 1024) {
      return { error: true, message: 'Receipt PDF exceeded 2MB limit' };
    }

    // Parse PDF text dynamically
    let text = '';
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const pdfData = await pdfParse(buffer);
      text = pdfData.text || '';
    } catch (parseErr) {
      // Fallback: extract ASCII characters
      text = buffer.toString('utf-8');
    }

    return { success: true, text, contentType, byteLength: buffer.length };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { timeout: true, error: true, message: 'CBE PDF service timeout (8s)' };
    }
    return { networkError: true, error: true, message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalise field mapping across diverse CBE response structures
 */
export function extractCbeTransactionFields(rawBackendResponse) {
  if (!rawBackendResponse) return null;

  // If JSON Backend response
  if (rawBackendResponse.data) {
    const root = rawBackendResponse.data.data || rawBackendResponse.data;

    const ref =
      root.transactionReference ||
      root.txId ||
      root.referenceNo ||
      root.reference ||
      root.id ||
      root.paymentReference;

    const rawAmount =
      root.amount ??
      root.transferredAmount ??
      root.transactionAmount ??
      root.totalAmount;

    let amountSantim = null;
    if (rawAmount !== undefined && rawAmount !== null) {
      const parsedNum = parseFloat(String(rawAmount).replace(/,/g, ''));
      if (!isNaN(parsedNum)) {
        amountSantim = Math.round(parsedNum * 100);
      }
    }

    const sender =
      root.senderName ||
      root.debtorName ||
      root.payerName ||
      root.fromAccountName ||
      root.sourceName ||
      root.customerName ||
      '';

    const receiver =
      root.receiverName ||
      root.creditorName ||
      root.beneficiaryName ||
      root.payeeName ||
      root.destinationName ||
      '';

    const receiverAcc =
      root.receiverAccount ||
      root.creditorAccount ||
      root.beneficiaryAccount ||
      root.toAccount ||
      root.accountNumber ||
      '';

    const rawStatus = (
      root.status ||
      root.paymentStatus ||
      root.transactionStatus ||
      root.statusCode ||
      'SUCCESS'
    ).toUpperCase();

    const isSuccess =
      rawStatus === 'SUCCESS' ||
      rawStatus === 'COMPLETED' ||
      rawStatus === 'PAID' ||
      rawStatus === 'OK' ||
      rawStatus === '00';

    const rawDate = root.transactionDate || root.paymentDate || root.date || root.createdAt;
    const txDate = rawDate ? new Date(rawDate) : new Date();

    return {
      reference: ref ? String(ref).trim() : null,
      amountSantim,
      senderName: String(sender).trim(),
      receiverName: String(receiver).trim(),
      receiverAccount: String(receiverAcc).trim(),
      isSuccess,
      statusString: rawStatus,
      transactionDate: isNaN(txDate.getTime()) ? new Date() : txDate,
      raw: root,
    };
  }

  // If PDF Backend text extraction
  if (rawBackendResponse.text) {
    const text = rawBackendResponse.text;

    const ftMatch = text.match(/\b(FT[A-Z0-9]+)\b/i);
    const amountMatch = text.match(/(?:ETB|Amount|AMT)[:\s]+([0-9,]+(?:\.[0-9]{2})?)/i) || text.match(/([0-9,]+\.[0-9]{2})\s*ETB/i);
    const accMatch = text.match(/(?:Credited To|Account|Acc|To)[:\s]+(\d{8,16})/i);
    const receiverMatch = text.match(/(?:Beneficiary|Receiver|Credited To Name|To Name)[:\s]+([A-Z\s]{3,60})/i);
    const senderMatch = text.match(/(?:Debited From|Sender|Payer|From Name)[:\s]+([A-Z\s]{3,60})/i);
    const dateMatch = text.match(/(?:Date|Txn Date|Time)[:\s]+([0-9\/-]+)/i);

    let amountSantim = null;
    if (amountMatch) {
      const num = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (!isNaN(num)) amountSantim = Math.round(num * 100);
    }

    const txDate = dateMatch ? new Date(dateMatch[1]) : new Date();
    const isSuccess = !/failed|reversed|cancelled|invalid/i.test(text);

    return {
      reference: ftMatch ? ftMatch[1].toUpperCase() : null,
      amountSantim,
      senderName: senderMatch ? senderMatch[1].trim() : '',
      receiverName: receiverMatch ? receiverMatch[1].trim() : '',
      receiverAccount: accMatch ? accMatch[1].trim() : '',
      isSuccess,
      statusString: isSuccess ? 'SUCCESS' : 'UNKNOWN',
      transactionDate: isNaN(txDate.getTime()) ? new Date() : txDate,
      raw: { textSnippet: text.slice(0, 500) },
    };
  }

  return null;
}

/**
 * Case & order insensitive token matching for names
 * (e.g. "Semir Muleta" matches "MULETA SEMIR ADAM" or "SEMIR MULETA")
 */
export function checkNameTokenMatch(studentName, payerName) {
  if (!studentName || !payerName) return false;

  const tokenize = (s) =>
    String(s)
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

  const studentTokens = tokenize(studentName);
  const payerTokens = new Set(tokenize(payerName));

  if (studentTokens.length === 0 || payerTokens.size === 0) return false;

  let matched = 0;
  for (const token of studentTokens) {
    if (payerTokens.has(token)) {
      matched++;
    }
  }

  // If at least 2 tokens match or >= 50% of student name tokens match
  return matched >= 2 || (studentTokens.length === 1 && matched === 1) || matched / studentTokens.length >= 0.5;
}

/**
 * Check if the receiver account matches the cycle's college bank account
 */
export function checkReceiverAccountMatch(cycleAccount, receiptAccount) {
  if (!cycleAccount || !receiptAccount) return true; // lenient if unparsed from CBE
  const cClean = String(cycleAccount).replace(/\D/g, '');
  const rClean = String(receiptAccount).replace(/\D/g, '');
  if (!cClean || !rClean) return true;
  // Match full or last 8 digits
  return cClean === rClean || cClean.endsWith(rClean) || rClean.endsWith(cClean.slice(-8));
}

/**
 * Full Verifier Pipeline
 */
export async function verifyCbeReceipt({
  charge,
  cycle,
  student,
  rawReceiptInput,
  ipAddress = '',
}) {
  const parsedInput = parseCbeReceiptInput(rawReceiptInput);
  let backendResult = null;

  // 1. Primary Query
  if (parsedInput.type === 'json_token') {
    backendResult = await queryCbeJsonBackend(parsedInput.token);
    // Bidirectional fallback if 404/error and token could be FT ref
    if ((backendResult?.notFound || backendResult?.error) && parsedInput.token.startsWith('FT')) {
      backendResult = await queryCbePdfBackend(parsedInput.token, '');
    }
  } else {
    backendResult = await queryCbePdfBackend(parsedInput.ftRef, parsedInput.accSuffix);
    // Bidirectional fallback to JSON if PDF returns 404
    if (backendResult?.notFound || backendResult?.error) {
      backendResult = await queryCbeJsonBackend(parsedInput.ftRef);
    }
  }

  // If CBE is completely down / timed out:
  if (backendResult?.timeout || backendResult?.networkError) {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: parsedInput.token || parsedInput.ftRef || '',
      cbeResponse: backendResult,
      result: 'pending_verification',
      reasonCode: 'CBE_SERVICE_UNAVAILABLE',
      ipAddress,
    });

    return {
      status: 'pending_verification',
      message: "Couldn't check right now, try again soon. Your receipt has been queued for verification.",
    };
  }

  if (backendResult?.notFound) {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: parsedInput.token || parsedInput.ftRef || '',
      cbeResponse: backendResult,
      result: 'failed',
      reasonCode: 'RECEIPT_NOT_FOUND',
      ipAddress,
    });

    return {
      status: 'failed',
      message: 'The transaction could not be found in CBE records. Please ensure the payment was completed and the link is correct.',
    };
  }

  const tx = extractCbeTransactionFields(backendResult);
  if (!tx || !tx.reference) {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: parsedInput.token || parsedInput.ftRef || '',
      cbeResponse: backendResult,
      result: 'failed',
      reasonCode: 'UNABLE_TO_PARSE_TRANSACTION',
      ipAddress,
    });

    return {
      status: 'failed',
      message: 'Unable to extract transaction details from this CBE receipt.',
    };
  }

  // Check 1: Successful transaction
  if (!tx.isSuccess) {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: tx.reference,
      cbeResponse: tx.raw,
      result: 'failed',
      reasonCode: 'TRANSACTION_NOT_SUCCESSFUL',
      ipAddress,
    });

    return {
      status: 'failed',
      message: 'This transaction was marked as unsuccessful, reversed, or cancelled by CBE.',
    };
  }

  // Check 2: Reference already used
  const existingPayment = await Payment.findOne({ bankReference: tx.reference });
  if (existingPayment) {
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: tx.reference,
      cbeResponse: tx.raw,
      result: 'failed',
      reasonCode: 'RECEIPT_ALREADY_USED',
      ipAddress,
    });

    return {
      status: 'failed',
      message: `This receipt (${tx.reference}) has already been used for a confirmed payment on ${existingPayment.createdAt.toISOString().slice(0, 10)}.`,
    };
  }

  // Check 3: Exact amount match
  if (tx.amountSantim !== null && tx.amountSantim !== cycle.amount) {
    const paidEtb = (tx.amountSantim / 100).toFixed(2);
    const requiredEtb = (cycle.amount / 100).toFixed(2);
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: tx.reference,
      cbeResponse: tx.raw,
      result: 'failed',
      reasonCode: 'AMOUNT_MISMATCH',
      ipAddress,
    });

    return {
      status: 'failed',
      message: `The amount transferred (${paidEtb} ETB) does not match the exact cycle fee (${requiredEtb} ETB). Exact amount is required.`,
    };
  }

  // Check 4: Receiver account match
  if (cycle.bank?.accountNumber && tx.receiverAccount) {
    if (!checkReceiverAccountMatch(cycle.bank.accountNumber, tx.receiverAccount)) {
      await PaymentAttempt.create({
        charge: charge._id,
        cycle: cycle._id,
        student: student._id,
        studentId: student.studentId,
        receiptUrl: rawReceiptInput,
        parsedReference: tx.reference,
        cbeResponse: tx.raw,
        result: 'failed',
        reasonCode: 'RECEIVER_ACCOUNT_MISMATCH',
        ipAddress,
      });

      return {
        status: 'failed',
        message: 'This payment was made to a different bank account than the official college fee account.',
      };
    }
  }

  // Check 5: Receipt date is on or after cycle creation and not future
  const now = new Date();
  if (tx.transactionDate) {
    const cycleStart = new Date(cycle.opensAt || cycle.createdAt);
    cycleStart.setHours(0, 0, 0, 0);
    // Allow 1 day grace for timezone drift
    const earliestAllowed = new Date(cycleStart.getTime() - 86_400_000);
    const latestAllowed = new Date(now.getTime() + 86_400_000);

    if (tx.transactionDate < earliestAllowed) {
      await PaymentAttempt.create({
        charge: charge._id,
        cycle: cycle._id,
        student: student._id,
        studentId: student.studentId,
        receiptUrl: rawReceiptInput,
        parsedReference: tx.reference,
        cbeResponse: tx.raw,
        result: 'failed',
        reasonCode: 'TRANSACTION_DATE_TOO_OLD',
        ipAddress,
      });

      return {
        status: 'failed',
        message: 'The payment date on this receipt is earlier than when this payment cycle opened.',
      };
    }

    if (tx.transactionDate > latestAllowed) {
      await PaymentAttempt.create({
        charge: charge._id,
        cycle: cycle._id,
        student: student._id,
        studentId: student.studentId,
        receiptUrl: rawReceiptInput,
        parsedReference: tx.reference,
        cbeResponse: tx.raw,
        result: 'failed',
        reasonCode: 'TRANSACTION_DATE_IN_FUTURE',
        ipAddress,
      });

      return {
        status: 'failed',
        message: 'The transaction date is in the future.',
      };
    }
  }

  // Check 6: Sender name matches student name
  const nameMatched = checkNameTokenMatch(student.fullName || `${student.firstName} ${student.lastName}`, tx.senderName);

  if (!nameMatched && tx.senderName) {
    // Parent or sponsor paid under different name -> Send to Review Queue!
    await PaymentAttempt.create({
      charge: charge._id,
      cycle: cycle._id,
      student: student._id,
      studentId: student.studentId,
      receiptUrl: rawReceiptInput,
      parsedReference: tx.reference,
      cbeResponse: tx.raw,
      result: 'review_required',
      reasonCode: 'PAYER_NAME_MISMATCH',
      reviewNotes: `Payer name "${tx.senderName}" does not match student name "${student.fullName}". Sent to accountant review queue.`,
      ipAddress,
    });

    return {
      status: 'review_required',
      message: `The payer name on the receipt (${tx.senderName}) does not match your student record (${student.fullName}). Your payment has been submitted to the Accountant Review Queue for manual verification.`,
    };
  }

  // ALL CHECKS PASSED -> Confirm Payment!
  const doneHash = crypto.randomBytes(16).toString('hex');
  const count = await Payment.countDocuments();
  const ethYear = cycle.ethYear || 2019;
  const receiptNumber = `REC-${ethYear}-${String(count + 1).padStart(6, '0')}`;

  const payment = await Payment.create({
    receiptNumber,
    charge: charge._id,
    cycle: cycle._id,
    student: student._id,
    amount: cycle.amount,
    method: 'cbe_receipt',
    bankReference: tx.reference,
    doneHash,
    status: 'confirmed',
    payerName: tx.senderName || student.fullName,
    receiptUrl: rawReceiptInput,
    cbeData: tx.raw,
    paidAt: new Date(),
  });

  // Mark StudentCharge paid
  charge.status = 'paid';
  charge.paidAt = new Date();
  charge.payment = payment._id;
  charge.isLocked = false;
  charge.lockedAt = null;
  await charge.save();

  // Log successful attempt
  await PaymentAttempt.create({
    charge: charge._id,
    cycle: cycle._id,
    student: student._id,
    studentId: student.studentId,
    receiptUrl: rawReceiptInput,
    parsedReference: tx.reference,
    cbeResponse: tx.raw,
    result: 'success',
    reasonCode: 'VERIFIED_AUTOMATICALLY',
    ipAddress,
  });

  audit({
    actorRole: 'STUDENT',
    actorId: student._id,
    action: 'finance.payment_confirmed',
    targetType: 'Payment',
    targetId: payment._id,
    meta: {
      receiptNumber,
      amount: payment.amount,
      cycle: cycle.title,
      studentId: student.studentId,
      bankReference: tx.reference,
    },
  });

  return {
    status: 'success',
    doneHash,
    receiptNumber,
    payment,
  };
}
