import { Router } from 'express';
import { ConferenciaController } from '../controllers/ConferenciaController';
import { gerarResumoConferencias } from '../services/conferences/ConferenceModulesService';

const router = Router();
const controller = new ConferenciaController();

// GET /api/conferencias/resumo?cnpj=&clienteId=&inicio=YYYY-MM&fim=YYYY-MM
router.get('/resumo', (req, res) => controller.resumo(req, res));

// GET /api/conferencias/detalhe?cnpj=&competencia=YYYY-MM
router.get('/detalhe', (req, res) => controller.detalhe(req, res));

// GET /api/conferencias/summary - Novo resumo modular de conferências
router.get('/summary', async (req, res) => {
  try {
    const summary = await gerarResumoConferencias();
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[Conferências] Erro ao gerar resumo:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Falha ao gerar resumo de conferências', 
      details: error?.message 
    });
  }
});

export default router;


