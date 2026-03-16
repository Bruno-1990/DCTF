import { Router } from 'express';
import multer from 'multer';
import AdminDashboardController from '../controllers/AdminDashboardController';
import AdminDashboardReportController from '../controllers/AdminDashboardReportController';

const router = Router();

// Configurar multer para upload de arquivos de relatório
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
  },
});

router.get('/snapshot', (req, res) => AdminDashboardController.getSnapshot(req, res));
router.get('/enhanced', (req, res) => AdminDashboardController.getEnhanced(req, res));
router.get('/top-faturamento', (req, res) => AdminDashboardController.getTopFaturamento(req, res));
router.get('/reports/history', (req, res) => AdminDashboardReportController.listHistory(req, res));
router.post('/reports/history', upload.single('file'), (req, res) => AdminDashboardReportController.saveHistory(req, res));
router.get('/reports/history/:id/download', (req, res) => AdminDashboardReportController.downloadHistory(req, res));
router.delete('/reports/history/:id', (req, res) => AdminDashboardReportController.deleteHistory(req, res));
router.get('/reports/:reportType.:format', (req, res) => AdminDashboardReportController.downloadReport(req, res));

export default router;
