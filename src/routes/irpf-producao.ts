/**
 * Rotas do módulo IRPF Produção (PRD-IRPF-001)
 * Prefixo: /api/irpf-producao
 * Reutiliza auth/sanitização do DCTF (mesmo padrão de clientes, dctf, etc.)
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CasesController } from '../controllers/irpf-producao/CasesController';
import { DocumentsController } from '../controllers/irpf-producao/DocumentsController';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const casesController = new CasesController();
const documentsController = new DocumentsController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Reutilizar middleware de sanitização (padrão DCTF)
router.use(sanitizeData);

// Anexar info de auth para RBAC futuro (reutiliza padrão: header Authorization)
router.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).irpfAuth = { hasAuth: !!req.headers.authorization };
  next();
});

// Cases
router.get('/cases', (req, res) => casesController.list(req, res));
router.get('/cases/:id', (req, res) => casesController.getById(req, res));
router.post('/cases', (req, res) => casesController.create(req, res));
router.patch('/cases/:id', (req, res) => casesController.update(req, res));
router.patch('/cases/:id/triage', (req, res) => casesController.patchTriage(req, res));
router.post('/cases/:id/status', (req, res) => casesController.updateStatus(req, res));

router.post(
  '/cases/:id/documents',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Arquivo excede o tamanho máximo (50 MB).', code: 'DOC_SIZE_EXCEEDED' });
      }
      next(err);
    });
  },
  (req, res) => documentsController.upload(req, res)
);

export default router;
