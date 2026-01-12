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

// GET /api/clientes/socios - Listar sócios distintos (para select box)
router.get('/socios', (req, res) => {
  clienteController.listarSociosDistinct(req, res);
});

// PUT /api/clientes/:id/recalcular-valores-participacao - Recalcular valores de participação dos sócios
router.put('/:id/recalcular-valores-participacao', validateParams(clienteSchemas.params), (req, res) => {
  clienteController.recalcularValoresParticipacao(req, res);
});

// PUT /api/clientes/:id/atualizar-socios-situacao-fiscal - Atualizar sócios a partir da situação fiscal
router.put('/:id/atualizar-socios-situacao-fiscal', validateParams(clienteSchemas.params), (req, res) => {
  clienteController.atualizarSociosPorSituacaoFiscal(req, res);
});

// GET /api/clientes/sem-dctf - Identificar clientes sem DCTF no mês vigente
// Conforme IN RFB 2.237/2024, 2.267/2025 e 2.248/2025
router.get('/sem-dctf', (req, res) => {
  clienteController.identificarClientesSemDCTF(req, res);
});

// GET /api/clientes/modelo - Download do modelo de planilha (DEVE vir antes de /:id)
router.get('/modelo', (req, res) => {
  clienteController.downloadModelo(req, res);
});

// GET /api/clientes/receita-ws/cnpj/:cnpj - Consultar ReceitaWS (sem salvar)
router.get('/receita-ws/cnpj/:cnpj', (req, res) => {
  clienteController.consultarReceitaWS(req, res);
});

// GET /api/clientes/cnpj/:cnpj - Buscar por CNPJ (DEVE vir antes de /:id)
router.get('/cnpj/:cnpj', (req, res) => {
  clienteController.buscarPorCNPJ(req, res);
});

// GET /api/clientes/:id - Obter cliente por ID (DEVE ser a última rota GET com :id)
router.get('/:id', validateParams(clienteSchemas.params), (req, res) => {
  clienteController.obterCliente(req, res);
});

// POST /api/clientes - Criar cliente
router.post('/', validate(clienteSchemas.create), (req, res) => {
  clienteController.criarCliente(req, res);
});

// POST /api/clientes/import-receita-ws - Importar dados do cliente via ReceitaWS (salva/atualiza)
router.post('/import-receita-ws', (req, res) => {
  clienteController.importarReceitaWS(req, res);
});

// POST /api/clientes/atualizar-todos-receita-ws - Atualizar todos os clientes na ReceitaWS (execução única)
router.post('/atualizar-todos-receita-ws', (req, res) => {
  clienteController.atualizarTodosReceitaWS(req, res);
});

// POST /api/clientes/atualizar-regimes-massa - Atualizar regimes tributários em massa
router.post('/atualizar-regimes-massa', (req, res) => {
  clienteController.atualizarRegimesMassa(req, res);
});

// POST /api/clientes/exportar-personalizado - Exportar clientes personalizado (XLSX)
router.post('/exportar-personalizado', (req, res) => {
  clienteController.exportarClientesPersonalizado(req, res);
});

// POST /api/clientes/import-json - Importar clientes em lote via JSON
router.post('/import-json', (req, res) => {
  clienteController.importarClientesJson(req, res);
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
