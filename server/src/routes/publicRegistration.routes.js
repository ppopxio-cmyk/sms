import express from 'express';
import {
  getPublicPortal,
  submitPublicApplication,
} from '../controllers/registrationPortal.controller.js';

const router = express.Router();

router.get('/registration-portals/:portalId', getPublicPortal);
router.post('/registration-portals/:portalId/apply', submitPublicApplication);

export default router;
