import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getCyclePublicDetails,
  loginStudentPortal,
  verifyPortalReceipt,
  getChapaPaymentResult,
  initializeChapaPortalPayment,
  verifyChapaPortalPayment,
} from '../controllers/portalPayment.controller.js';

const router = Router();

// IP rate limit for portal login: 20 per 15 minutes per IP
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many requests from this IP address. Please wait a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Verification attempt limit: 10 per 5 minutes per IP
const portalVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many receipt verification attempts. Please wait a moment before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:hash', getCyclePublicDetails);
router.post('/:hash/login', portalLoginLimiter, loginStudentPortal);
router.post('/:hash/verify', portalVerifyLimiter, verifyPortalReceipt);
router.post('/:hash/chapa/initialize', portalLoginLimiter, initializeChapaPortalPayment);
router.post('/chapa/verify', portalVerifyLimiter, verifyChapaPortalPayment);
router.post('/:hash/chapa/verify', portalVerifyLimiter, verifyChapaPortalPayment);
router.get('/chapa/verify', portalVerifyLimiter, verifyChapaPortalPayment);
// Unified payment result page: Chapa (PaymentAttempt._id) and CBE/cash (Payment.doneHash)
router.get('/done/:paymentId', getChapaPaymentResult);

export default router;
