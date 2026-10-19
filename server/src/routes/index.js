import { Router } from 'express';
import authRoutes from './auth.routes.js';
import passwordRoutes from './password.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/auth', passwordRoutes);
router.use('/admin', adminRoutes);

export default router;
