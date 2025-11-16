import { Router } from 'express';
import AdminDashboardController from '../controllers/AdminDashboardController';
import AdminDashboardReportController from '../controllers/AdminDashboardReportController';

const router = Router();

router.get('/snapshot', (req, res) => AdminDashboardController.getSnapshot(req, res));
router.get('/reports/history', (req, res) => AdminDashboardReportController.listHistory(req, res));
router.get('/reports/history/:id/download', (req, res) => AdminDashboardReportController.downloadHistory(req, res));
router.delete('/reports/history/:id', (req, res) => AdminDashboardReportController.deleteHistory(req, res));
router.get('/reports/:reportType.:format', (req, res) => AdminDashboardReportController.downloadReport(req, res));

export default router;
