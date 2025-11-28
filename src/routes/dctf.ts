/**
 * Rotas para operações de DCTF
 * Endpoints para gerenciamento de declarações DCTF
 */

import { Router } from 'express';
import { DCTFController } from '../controllers/DCTFController';
import { validate, validateParams, validateQuery, sanitizeData } from '../middleware/validation';
import { dctfSchemas } from '../middleware/schemas';

const router = Router();
const dctfController = new DCTFController();

// Middleware de sanitização global
router.use(sanitizeData);

// GET /api/dctf - Listar declarações
router.get('/', validateQuery(dctfSchemas.query), (req, res) => {
  dctfController.listarDeclaracoes(req, res);
});

// GET /api/dctf/stats - Estatísticas das declarações
router.get('/stats', (req, res) => {
  dctfController.obterEstatisticas(req, res);
});

// GET /api/dctf/cliente/:clienteId - Buscar por cliente
router.get('/cliente/:clienteId', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.obterDeclaracoesPorCliente(req, res);
});

// GET /api/dctf/:id - Obter declaração por ID
router.get('/:id', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.obterDeclaracao(req, res);
});

// GET /api/dctf/:id/dados - Listar dados da declaração
router.get('/:id/dados', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.listarDadosPorDeclaracao(req, res);
});

// GET /api/dctf/:id/analyze - Analisar declaração
router.get('/:id/analyze', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.analisarDeclaracao(req, res);
});

// POST /api/dctf/:id/cleanup - Deduplicar dados da declaração
router.post('/:id/cleanup', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.limparDuplicados(req, res);
});

// POST /api/dctf/admin/clear - Limpar todas as declarações (operação administrativa)
router.post('/admin/clear', (req, res) => {
  dctfController.limparTodasDeclaracoes(req, res);
});

// POST /api/dctf/admin/sync - Sincronizar declarações do Supabase para MySQL (operação administrativa)
router.post('/admin/sync', (req, res) => {
  dctfController.sincronizarDoSupabase(req, res);
});

// POST /api/dctf/admin/fix-schema - Corrigir schema MySQL (tornar cliente_id nullable e remover FK)
router.post('/admin/fix-schema', (req, res) => {
  dctfController.corrigirSchemaClienteId(req, res);
});

// POST /api/dctf/admin/delete-supabase - Deletar todas as declarações do Supabase (operação administrativa)
router.post('/admin/delete-supabase', (req, res) => {
  dctfController.deletarDoSupabase(req, res);
});

// POST /api/dctf - Criar declaração
router.post('/', validate(dctfSchemas.create), (req, res) => {
  dctfController.criarDeclaracao(req, res);
});

// PUT /api/dctf/:id - Atualizar declaração
router.put('/:id', 
  validateParams(dctfSchemas.params),
  validate(dctfSchemas.update),
  (req, res) => {
    dctfController.atualizarDeclaracao(req, res);
  }
);

// DELETE /api/dctf/:id - Deletar declaração
router.delete('/:id', validateParams(dctfSchemas.params), (req, res) => {
  dctfController.deletarDeclaracao(req, res);
});

export default router;