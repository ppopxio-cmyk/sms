import { Router } from 'express';
import authRoutes from './auth.routes.js';
import passwordRoutes from './password.routes.js';
import adminRoutes from './admin.routes.js';
import notificationRoutes from './notifications.routes.js';
import searchRoutes from './search.routes.js';
import teacherRoutes from './teacher.routes.js';
import registrarRoutes from './registrar.routes.js';
import publicAssessmentRoutes from './publicAssessment.routes.js';
import portalPaymentRoutes from './portalPayment.routes.js';
import financeRoutes from './finance.routes.js';
import publicRegistrationRoutes from './publicRegistration.routes.js';
import registrarRegistrationRoutes from './registrarRegistration.routes.js';
import { verifyDocument } from '../controllers/registrar.documents.controller.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/auth', passwordRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/registrar', registrarRoutes);
router.use('/registrar', registrarRegistrationRoutes);
router.use('/finance', financeRoutes);
router.use('/portal/monthly-payments', portalPaymentRoutes);
router.use('/public/monthly-payments', portalPaymentRoutes);
router.use('/monthly-payments', portalPaymentRoutes);
router.use('/public', publicAssessmentRoutes);
router.use('/public', publicRegistrationRoutes);
router.use('/portal', publicRegistrationRoutes);
// Public verification by the opaque reference printed on a certificate or transcript.
// It returns only the minimum fields a verifier needs and never exposes contact data.
router.get('/verify/:verificationId', verifyDocument);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);

export default router;
