import { Router } from 'express';
import AdminDashboardController from '../controllers/AdminDashboardController';

const router = Router();

router.get('/snapshot', (req, res) => AdminDashboardController.getSnapshot(req, res));

export default router;
