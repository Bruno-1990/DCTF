/**
 * Rotas para dados de CFOP entrada e saída (Clientes / CFOP).
 */

import { Router } from 'express';
import multer from 'multer';
import { CFOPController } from '../controllers/CFOPController';

const router = Router();
const cfopController = new CFOPController();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/cfop/entrada - Listar CFOP de entrada (1.xxx, 2.xxx, 3.xxx). Query: ano?, mes?
router.get('/entrada', (req, res) => {
  cfopController.listarEntrada(req, res);
});

// GET /api/cfop/saida - Listar CFOP de saída (5.xxx, 6.xxx, 7.xxx). Query: ano?, mes?
router.get('/saida', (req, res) => {
  cfopController.listarSaida(req, res);
});

// POST /api/cfop/upload-pdf - Enviar um único PDF; extrai CFOP de entrada e saída e retorna { entrada, saida }
router.post('/upload-pdf', upload.single('pdf'), (req, res) => {
  cfopController.uploadPdf(req, res);
});

export default router;
