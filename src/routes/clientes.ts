/**
 * Rotas para operações de Cliente
 */

import { Router } from 'express';
import { ClienteController } from '../controllers/ClienteController';
import { validate, validateParams, validateQuery, sanitizeData } from '../middleware/validation';
import { clienteSchemas } from '../middleware/schemas';

const router = Router();
const clienteController = new ClienteController();

// Middleware de sanitização global
router.use(sanitizeData);

// GET /api/clientes - Listar clientes
router.get('/', validateQuery(clienteSchemas.query), (req, res) => {
  clienteController.listarClientes(req, res);
});

// GET /api/clientes/stats - Estatísticas dos clientes
router.get('/stats', (req, res) => {
  clienteController.obterEstatisticas(req, res);
});

// GET /api/clientes/cnpj/:cnpj - Buscar por CNPJ
router.get('/cnpj/:cnpj', (req, res) => {
  clienteController.buscarPorCNPJ(req, res);
});

// GET /api/clientes/modelo - Download do modelo de planilha (DEVE vir antes de /:id)
router.get('/modelo', (req, res) => {
  clienteController.downloadModelo(req, res);
});

// GET /api/clientes/:id - Obter cliente por ID
router.get('/:id', validateParams(clienteSchemas.params), (req, res) => {
  clienteController.obterCliente(req, res);
});

// POST /api/clientes - Criar cliente
router.post('/', validate(clienteSchemas.create), (req, res) => {
  clienteController.criarCliente(req, res);
});

// POST /api/clientes/import-json - Importar clientes em lote via JSON
router.post('/import-json', (req, res) => {
  clienteController.importarClientesJson(req, res);
});

// POST /api/clientes/upload - Upload e processamento de planilha de clientes
router.post('/upload', ClienteController.uploadMiddleware, (req, res) => {
  clienteController.uploadPlanilhaClientes(req, res);
});

// PUT /api/clientes/:id - Atualizar cliente
router.put('/:id', 
  validateParams(clienteSchemas.params),
  validate(clienteSchemas.update),
  (req, res) => {
    clienteController.atualizarCliente(req, res);
  }
);

// DELETE /api/clientes/:id - Deletar cliente
router.delete('/:id', validateParams(clienteSchemas.params), (req, res) => {
  clienteController.deletarCliente(req, res);
});

export default router;
