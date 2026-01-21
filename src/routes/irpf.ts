/**
 * Rotas para IRPF - Gerenciamento de dados para declaração de IRPF
 */

import { Router } from 'express';
import { IrpfController } from '../controllers/IrpfController';

const router = Router();
const irpfController = new IrpfController();

// GET /api/irpf/faturamento/:clienteId - Buscar faturamento (com cache)
router.get('/faturamento/:clienteId', (req, res) => {
  irpfController.buscarFaturamento(req, res);
});

// GET /api/irpf/faturamento/:clienteId/cache - Buscar apenas do cache (sem consultar SCI)
router.get('/faturamento/:clienteId/cache', (req, res) => {
  irpfController.buscarApenasCache(req, res);
});

// GET /api/irpf/faturamento/:clienteId/cache/:tipo - Buscar faturamento do cache por tipo (detalhado, consolidado, mini)
router.get('/faturamento/:clienteId/cache/:tipo', (req, res) => {
  irpfController.buscarFaturamentoPorTipo(req, res);
});

// POST /api/irpf/faturamento/:clienteId/atualizar - Forçar atualização do cache
router.post('/faturamento/:clienteId/atualizar', (req, res) => {
  irpfController.atualizarCache(req, res);
});

// POST /api/irpf/faturamento/atualizar-todos - Atualizar cache de todos os clientes
router.post('/faturamento/atualizar-todos', async (req, res) => {
  try {
    const { IrpfScheduler } = await import('../services/IrpfScheduler');
    const scheduler = new IrpfScheduler();
    const resultado = await scheduler.forcarAtualizacao();
    
    res.json({
      success: true,
      data: resultado,
      message: `Atualização concluída: ${resultado.sucesso} sucesso, ${resultado.erros} erros de ${resultado.total} clientes.`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar todos os clientes',
    });
  }
});

// POST /api/irpf/consulta-personalizada - Consulta personalizada de faturamento
router.post('/consulta-personalizada', (req, res) => {
  irpfController.consultaPersonalizada(req, res);
});

export default router;

