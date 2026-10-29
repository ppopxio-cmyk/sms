import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  getDashboard,
  listCycles,
  createCycle,
  getCycleDetail,
  openCycleHandler,
  updateCycleHandler,
  closeCycleHandler,
  reopenCycleHandler,
  cancelCycleHandler,
  deleteCycleHandler,
  listCollections,
  recordPaymentHandler,
  createWaiverHandler,
  revokeWaiverHandler,
  listWaivers,
  extendDeadlineHandler,
  listLedger,
  reversePaymentHandler,
  listReviewQueue,
  resolveReviewAttempt,
  listOverdueHolds,
  getStudentProfile,
  getSettings,
  updateSettings,
  testReceiptTool,
} from '../controllers/finance.controller.js';

const router = Router();

// Protect all finance endpoints with authentication
router.use(authenticate);

// Dashboard
router.get('/dashboard', requirePermission('finance:view'), getDashboard);

// Payment Cycles
router.get('/cycles', requirePermission('finance:view'), listCycles);
router.post('/cycles', requirePermission('finance:cycles'), createCycle);
router.get('/cycles/:id', requirePermission('finance:view'), getCycleDetail);
router.put('/cycles/:id', requirePermission('finance:cycles'), updateCycleHandler);
router.post('/cycles/:id/open', requirePermission('finance:cycles'), openCycleHandler);
router.post('/cycles/:id/close', requirePermission('finance:cycles'), closeCycleHandler);
router.post('/cycles/:id/reopen', requirePermission('finance:cycles'), reopenCycleHandler);
router.post('/cycles/:id/cancel', requirePermission('finance:cycles'), cancelCycleHandler);
router.delete('/cycles/:id', requirePermission('finance:cycles'), deleteCycleHandler);

// Collections & Charges
router.get('/collections', requirePermission('finance:view'), listCollections);
router.post('/charges/:chargeId/pay', requirePermission('finance:payments'), recordPaymentHandler);
router.post('/charges/:chargeId/waive', requirePermission('finance:waivers'), createWaiverHandler);
router.post('/charges/:chargeId/extend', requirePermission('finance:cycles'), extendDeadlineHandler);

// Ledger & Payments
router.get('/ledger', requirePermission('finance:view'), listLedger);
router.post('/payments/:id/reverse', requirePermission('finance:payments'), reversePaymentHandler);

// Review Queue
router.get('/review-queue', requirePermission('finance:view'), listReviewQueue);
router.post('/review-queue/:id/resolve', requirePermission('finance:review'), resolveReviewAttempt);

// Overdue & Holds
router.get('/overdue', requirePermission('finance:view'), listOverdueHolds);

// Waivers
router.get('/waivers', requirePermission('finance:view'), listWaivers);
router.post('/waivers/:id/revoke', requirePermission('finance:waivers'), revokeWaiverHandler);

// Student Profile
router.get('/students/:id', requirePermission('finance:view'), getStudentProfile);

// Settings
router.get('/settings', requirePermission('finance:view'), getSettings);
router.put('/settings', requirePermission('finance:settings'), updateSettings);
router.post('/test-receipt', requirePermission('finance:settings'), testReceiptTool);

export default router;
