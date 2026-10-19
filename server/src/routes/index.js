import { Router } from 'express';
import authRoutes from './auth.routes.js';
import passwordRoutes from './password.routes.js';
import adminRoutes from './admin.routes.js';
import notificationRoutes from './notifications.routes.js';
import searchRoutes from './search.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/auth', passwordRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);

export default router;
