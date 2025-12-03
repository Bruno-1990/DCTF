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

// GET /api/sci/banco-horas/historico - Listar histórico de relatórios
router.get('/banco-horas/historico', (req, res) => {
  bancoHorasController.listarHistorico(req, res);
});

// GET /api/sci/banco-horas/historico/:id/download - Baixar relatório do histórico
router.get('/banco-horas/historico/:id/download', (req, res) => {
  bancoHorasController.baixarDoHistorico(req, res);
});

// GET /api/sci/banco-horas/historico/:id/download-formatado - Baixar relatório formatado do histórico
router.get('/banco-horas/historico/:id/download-formatado', (req, res) => {
  bancoHorasController.baixarFormatadoDoHistorico(req, res);
});

router.delete('/banco-horas/historico/:id', (req, res) => {
  bancoHorasController.deletarHistorico(req, res);
});

export default router;

