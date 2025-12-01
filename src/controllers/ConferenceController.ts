/**
 * Controller para Conferências (Nova estrutura modular)
 */

import { Request, Response } from 'express';
import { gerarResumoConferencias } from '../services/conferences/ConferenceModulesService';

class ConferenceController {
  /**
   * GET /api/conferences/summary
   * Retorna o resumo completo de todas as conferências
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await gerarResumoConferencias();
      res.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      console.error('[ConferenceController] Erro ao gerar resumo:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao gerar resumo de conferências',
      });
    }
  }
}

export default new ConferenceController();








