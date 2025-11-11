import { Router } from 'express';
import AdminDashboardConferenceController from '../controllers/AdminDashboardConferenceController';

const router = Router();

router.get('/summary', (req, res) => AdminDashboardConferenceController.getSummary(req, res));

export default router;
