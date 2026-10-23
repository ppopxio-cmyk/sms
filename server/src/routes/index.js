import { Router } from 'express';
import authRoutes from './auth.routes.js';
import passwordRoutes from './password.routes.js';
import adminRoutes from './admin.routes.js';
import notificationRoutes from './notifications.routes.js';
import searchRoutes from './search.routes.js';
import teacherRoutes from './teacher.routes.js';
import registrarRoutes from './registrar.routes.js';
import publicAssessmentRoutes from './publicAssessment.routes.js';
import { verifyDocument } from '../controllers/registrar.documents.controller.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/auth', passwordRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/registrar', registrarRoutes);
router.use('/public', publicAssessmentRoutes);
// Public verification by the opaque reference printed on a certificate or transcript.
// It returns only the minimum fields a verifier needs and never exposes contact data.
router.get('/verify/:verificationId', verifyDocument);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);

export default router;
