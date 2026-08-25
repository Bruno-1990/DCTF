/**
 * Rotas de RELATÓRIOS, montadas sob `/api/dashboard/admin`.
 *
 * O prefixo é herança da página `/dashboard`, removida em 20/08/2026 por não ser
 * usada. As rotas `/snapshot`, `/enhanced` e `/top-faturamento`, que serviam só
 * àquela página, saíram junto; estas aqui ficaram porque são o que a página
 * **Relatórios** consome (`frontend/src/services/relatorios.ts`).
 *
 * Renomear o prefixo para `/api/reports` seria mais honesto, mas quebraria a URL
 * que o frontend já usa — fica registrado aqui para quem estranhar o caminho.
 */
import { Router } from 'express';
import multer from 'multer';
import AdminDashboardReportController from '../controllers/AdminDashboardReportController';

const router = Router();

// Configurar multer para upload de arquivos de relatório
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
  },
});

router.get('/reports/history', (req, res) => AdminDashboardReportController.listHistory(req, res));
router.post('/reports/history', upload.single('file'), (req, res) => AdminDashboardReportController.saveHistory(req, res));
router.get('/reports/history/:id/download', (req, res) => AdminDashboardReportController.downloadHistory(req, res));
router.delete('/reports/history/:id', (req, res) => AdminDashboardReportController.deleteHistory(req, res));
router.get('/reports/:reportType.:format', (req, res) => AdminDashboardReportController.downloadReport(req, res));

export default router;
