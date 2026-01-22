/**
 * Controller para Geração Automática de Regras
 */

import { Request, Response } from 'express';
import SpedRuleGeneratorService from '../services/SpedRuleGeneratorService';

class SpedRuleGeneratorController {
  
  /**
   * POST /api/sped/v2/rules/generate
   * Gera regras automáticas para divergências não cobertas
   */
  async gerarRegras(req: Request, res: Response) {
    try {
      const { validationId, divergenciasSemRegra } = req.body;
      
      if (!validationId || !divergenciasSemRegra || !Array.isArray(divergenciasSemRegra)) {
        return res.status(400).json({
          error: 'validationId e divergenciasSemRegra são obrigatórios'
        });
      }
      
      console.log(`[RuleGenerator] Requisição para gerar regras: ${divergenciasSemRegra.length} divergências`);
      
      const regrasGeradas = await SpedRuleGeneratorService.gerarRegrasAutomaticas(
        validationId,
        divergenciasSemRegra
      );
      
      return res.json({
        success: true,
        total_regras: regrasGeradas.length,
        regras: regrasGeradas
      });
      
    } catch (error: any) {
      console.error('[RuleGenerator] Erro:', error);
      return res.status(500).json({
        error: 'Erro ao gerar regras',
        message: error.message
      });
    }
  }
  
  /**
   * POST /api/sped/v2/rules/apply
   * Aplica regras aprovadas pelo usuário
   */
  async aplicarRegras(req: Request, res: Response) {
    try {
      const { validationId, regrasAprovadas } = req.body;
      
      if (!regrasAprovadas || !Array.isArray(regrasAprovadas)) {
        return res.status(400).json({
          error: 'regrasAprovadas é obrigatório'
        });
      }
      
      console.log(`[RuleGenerator] Aplicando ${regrasAprovadas.length} regras aprovadas`);
      
      // Salvar regras em arquivo JSON
      await SpedRuleGeneratorService.persistirRegrasCustomizadas(validationId, regrasAprovadas);
      
      return res.json({
        success: true,
        message: `${regrasAprovadas.length} regras aplicadas com sucesso`,
        arquivo: '.taskmaster/validation_rules/custom_rules.json'
      });
      
    } catch (error: any) {
      console.error('[RuleGenerator] Erro ao aplicar regras:', error);
      return res.status(500).json({
        error: 'Erro ao aplicar regras',
        message: error.message
      });
    }
  }
}

export default new SpedRuleGeneratorController();

