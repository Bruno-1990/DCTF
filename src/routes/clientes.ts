/**
 * Rotas para operações de Cliente
 */

import { Router } from 'express';
import { ClienteController } from '../controllers/ClienteController';

const router = Router();
const clienteController = new ClienteController();

// Middleware de validação básica
const validateId = (req: any, res: any, next: any) => {
  const { id } = req.params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({
      success: false,
      error: 'ID inválido',
    });
  }
  next();
};

// GET /api/clientes - Listar clientes
router.get('/', (req, res) => {
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

// GET /api/clientes/:id - Obter cliente por ID
router.get('/:id', validateId, (req, res) => {
  clienteController.obterCliente(req, res);
});

// POST /api/clientes - Criar cliente
router.post('/', (req, res) => {
  clienteController.criarCliente(req, res);
});

// PUT /api/clientes/:id - Atualizar cliente
router.put('/:id', validateId, (req, res) => {
  clienteController.atualizarCliente(req, res);
});

// DELETE /api/clientes/:id - Deletar cliente
router.delete('/:id', validateId, (req, res) => {
  clienteController.deletarCliente(req, res);
});

export default router;
