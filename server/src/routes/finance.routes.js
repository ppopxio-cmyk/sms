import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { structure } from '../controllers/registrar.academic.controller.js';
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
  notifyOverdueHoldsHandler,
  notifyProgrammeOverdueTeachers,
  searchStudents,
  exportStudentStatement,
  exportCollections,
  listAwardPayments,
  createAwardPayment,
  deleteAwardPayment,
  getAcademicYears,
  getYearlyReport,
  exportYearlyReport,
  getStudentProfile,
  getSettings,
  updateSettings,
  verifyPaymentByReceipt,
} from '../controllers/finance.controller.js';

const router = Router();

// Protect all finance endpoints with authentication
router.use(authenticate);

// Academic structure query alias for finance (structure:view)
router.get('/academic-structure', requirePermission('structure:view'), structure);

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
router.get('/payments/verify/:receiptNumber', requirePermission('finance:view'), verifyPaymentByReceipt);

// Review Queue
router.get('/review-queue', requirePermission('finance:view'), listReviewQueue);
router.post('/review-queue/:id/resolve', requirePermission('finance:review'), resolveReviewAttempt);

// Overdue & Holds
router.get('/overdue', requirePermission('finance:view'), listOverdueHolds);
router.post('/overdue/notify', requirePermission('finance:cycles'), notifyOverdueHoldsHandler);
router.post('/overdue/notify-teachers', requirePermission('finance:cycles'), notifyProgrammeOverdueTeachers);

// Waivers
router.get('/waivers', requirePermission('finance:view'), listWaivers);
router.post('/waivers/:id/revoke', requirePermission('finance:waivers'), revokeWaiverHandler);

// Student Profile, search & exports
router.get('/students/search', requirePermission('finance:view'), searchStudents);
router.get('/students/:id/export', requirePermission('finance:view'), exportStudentStatement);
router.get('/students/:id', requirePermission('finance:view'), getStudentProfile);
router.get('/collections/export', requirePermission('finance:view'), exportCollections);

// Award Payments
router.get('/awards', requirePermission('finance:view'), listAwardPayments);
router.post('/awards', requirePermission('finance:payments'), createAwardPayment);
router.delete('/awards/:id', requirePermission('finance:payments'), deleteAwardPayment);

// Reports (real academic years) & export
router.get('/reports/years', requirePermission('finance:view'), getAcademicYears);
router.get('/reports/export', requirePermission('finance:view'), exportYearlyReport);
router.get('/reports', requirePermission('finance:view'), getYearlyReport);

// Settings
router.get('/settings', requirePermission('finance:view'), getSettings);
router.put('/settings', requirePermission('finance:settings'), updateSettings);
export default router;
