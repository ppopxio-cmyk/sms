import express from 'express';
import { requirePermission } from '../middleware/authorize.js';
import {
  createPortal,
  listPortals,
  getPortalDetail,
  updatePortal,
  listApplications,
  getApplicationDetail,
  approveApplication,
  rejectApplication,
} from '../controllers/registrationPortal.controller.js';

const router = express.Router();

// Registration Portals Management
router.post('/registration-portals', requirePermission('students:manage'), createPortal);
router.get('/registration-portals', requirePermission('students:manage'), listPortals);
router.get('/registration-portals/:id', requirePermission('students:manage'), getPortalDetail);
router.patch('/registration-portals/:id', requirePermission('students:manage'), updatePortal);

// Applications Review Queue
router.get('/applications', requirePermission('students:manage'), listApplications);
router.get('/applications/:id', requirePermission('students:manage'), getApplicationDetail);
router.post('/applications/:id/approve', requirePermission('students:manage'), approveApplication);
router.post('/applications/:id/reject', requirePermission('students:manage'), rejectApplication);

export default router;
