/**
 * Rotas para operações do SCI (Sistema de Controle Interno)
 * Endpoints para gerenciamento de banco de horas
 */

import { Router } from 'express';
import { BancoHorasController } from '../controllers/BancoHorasController';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const bancoHorasController = new BancoHorasController();

// Middleware de sanitização global
router.use(sanitizeData);

// POST /api/sci/banco-horas/gerar - Gerar relatório de banco de horas
router.post('/banco-horas/gerar', (req, res) => {
  bancoHorasController.gerarRelatorio(req, res);
});

// GET /api/sci/banco-horas/gerar/:relatorioId/logs - Stream de logs em tempo real (SSE)
router.get('/banco-horas/gerar/:relatorioId/logs', (req, res) => {
  bancoHorasController.streamLogs(req, res);
});

// GET /api/sci/banco-horas/download/:id - Baixar arquivo de relatório
router.get('/banco-horas/download/:id', (req, res) => {
  bancoHorasController.downloadArquivo(req, res);
});

// GET /api/sci/banco-horas/download-formatado/:id - Baixar arquivo formatado
router.get('/banco-horas/download-formatado/:id', (req, res) => {
  bancoHorasController.downloadArquivoFormatado(req, res);
});

export default router;

