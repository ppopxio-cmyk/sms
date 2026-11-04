import express from 'express';
import {
  getPublicPortal,
  submitPublicApplication,
  trackApplication,
} from '../controllers/registrationPortal.controller.js';

const router = express.Router();

router.get('/registration-portals/:portalId', getPublicPortal);
router.post('/registration-portals/:portalId/apply', submitPublicApplication);
router.get('/registration-portals/track/:trackingNumber', trackApplication);
router.get('/track/:trackingNumber', trackApplication);

export default router;
