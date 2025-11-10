/**
 * Rotas para operações de Relatório
 * Endpoints para gerenciamento de relatórios
 */

import { Router } from 'express';
import { RelatorioController } from '../controllers/RelatorioController';
import { validate, validateParams, validateQuery, sanitizeData } from '../middleware/validation';
import { relatorioSchemas } from '../middleware/schemas';

const router = Router();
const relatorioController = new RelatorioController();

// Middleware de sanitização global
router.use(sanitizeData);

// GET /api/relatorios - Listar relatórios
router.get('/', validateQuery(relatorioSchemas.query), (req, res) => {
  relatorioController.listarRelatorios(req, res);
});

// GET /api/relatorios/declaracao/:declaracaoId - Buscar por declaração
router.get('/declaracao/:declaracaoId', validateParams(relatorioSchemas.params), (req, res) => {
  relatorioController.obterRelatoriosPorDeclaracao(req, res);
});

// GET /api/relatorios/:id - Obter relatório por ID
router.get('/:id', validateParams(relatorioSchemas.params), (req, res) => {
  relatorioController.obterRelatorio(req, res);
});

// POST /api/relatorios - Criar relatório
router.post('/', validate(relatorioSchemas.create), (req, res) => {
  relatorioController.criarRelatorio(req, res);
});

// POST /api/relatorios/generate - Gerar relatório
router.post('/generate', validate(relatorioSchemas.generate), (req, res) => {
  relatorioController.gerarRelatorio(req, res);
});

// PUT /api/relatorios/:id - Atualizar relatório
router.put('/:id', 
  validateParams(relatorioSchemas.params),
  validate(relatorioSchemas.update),
  (req, res) => {
    relatorioController.atualizarRelatorio(req, res);
  }
);

// DELETE /api/relatorios/:id - Deletar relatório
router.delete('/:id', validateParams(relatorioSchemas.params), (req, res) => {
  relatorioController.deletarRelatorio(req, res);
});

export default router;
