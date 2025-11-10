/**
 * Modelo Analise - Representa análises realizadas nas declarações DCTF
 * Gerencia resultados de análises e validações
 */

import { DatabaseService } from '../services/DatabaseService';
import { Analise as IAnalise, ApiResponse } from '../types';
import Joi from 'joi';

// Schema de validação para Análise
const analiseSchema = Joi.object({
  declaracaoId: Joi.string().uuid().required().messages({
    'string.guid': 'ID da declaração deve ser um UUID válido',
    'any.required': 'ID da declaração é obrigatório',
  }),
  tipoAnalise: Joi.string().max(50).required().messages({
    'string.max': 'Tipo de análise deve ter no máximo 50 caracteres',
    'any.required': 'Tipo de análise é obrigatório',
  }),
  severidade: Joi.string()
    .valid('baixa', 'media', 'alta', 'critica')
    .required()
    .messages({
      'any.only': 'Severidade deve ser: baixa, media, alta ou critica',
      'any.required': 'Severidade é obrigatória',
    }),
  descricao: Joi.string().min(10).max(1000).required().messages({
    'string.min': 'Descrição deve ter pelo menos 10 caracteres',
    'string.max': 'Descrição deve ter no máximo 1000 caracteres',
    'any.required': 'Descrição é obrigatória',
  }),
  recomendacoes: Joi.array().items(Joi.string().max(500)).optional().messages({
    'array.base': 'Recomendações deve ser um array',
    'string.max': 'Cada recomendação deve ter no máximo 500 caracteres',
  }),
  status: Joi.string()
    .valid('pendente', 'em_analise', 'concluida')
    .default('pendente')
    .messages({
      'any.only': 'Status deve ser: pendente, em_analise ou concluida',
    }),
  dadosAnalise: Joi.object().optional().messages({
    'object.base': 'Dados de análise deve ser um objeto',
  }),
});

export class Analise extends DatabaseService<IAnalise> {
  constructor() {
    super('analises');
  }

  /**
   * Valida os dados da análise
   */
  private validateAnalise(data: Partial<IAnalise>): { isValid: boolean; error?: string } {
    const { error } = analiseSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Criar análise com validação
   */
  async createAnalise(analiseData: Partial<IAnalise>): Promise<ApiResponse<IAnalise>> {
    const validation = this.validateAnalise(analiseData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.create(analiseData);
  }

  /**
   * Atualizar análise
   */
  async updateAnalise(id: string, updates: Partial<IAnalise>): Promise<ApiResponse<IAnalise>> {
    const validation = this.validateAnalise(updates);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.update(id, updates);
  }

  /**
   * Buscar análises por declaração
   */
  async findByDeclaracao(declaracaoId: string): Promise<ApiResponse<IAnalise[]>> {
    return this.findBy({ declaracao_id: declaracaoId });
  }

  /**
   * Buscar análises por tipo
   */
  async findByTipo(tipoAnalise: string): Promise<ApiResponse<IAnalise[]>> {
    return this.findBy({ tipo_analise: tipoAnalise });
  }

  /**
   * Buscar análises por severidade
   */
  async findBySeveridade(severidade: string): Promise<ApiResponse<IAnalise[]>> {
    const validSeveridades = ['baixa', 'media', 'alta', 'critica'];
    if (!validSeveridades.includes(severidade)) {
      return {
        success: false,
        error: 'Severidade inválida',
      };
    }

    return this.findBy({ severidade });
  }

  /**
   * Buscar análises por status
   */
  async findByStatus(status: string): Promise<ApiResponse<IAnalise[]>> {
    const validStatuses = ['pendente', 'em_analise', 'concluida'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: 'Status inválido',
      };
    }

    return this.findBy({ status });
  }

  /**
   * Atualizar status da análise
   */
  async updateStatus(id: string, status: string): Promise<ApiResponse<IAnalise>> {
    const validStatuses = ['pendente', 'em_analise', 'concluida'] as const;
    if (!validStatuses.includes(status as any)) {
      return {
        success: false,
        error: 'Status inválido',
      };
    }

    return this.update(id, { status: status as 'pendente' | 'em_analise' | 'concluida' });
  }

  /**
   * Obter estatísticas das análises
   */
  async getStats(declaracaoId?: string): Promise<ApiResponse<{
    total: number;
    porSeveridade: Record<string, number>;
    porTipo: Record<string, number>;
    porStatus: Record<string, number>;
    criticasPendentes: number;
  }>> {
    try {
      let query = this.supabase.from(this.tableName).select('*');
      
      if (declaracaoId) {
        query = query.eq('declaracao_id', declaracaoId);
      }

      const { data, error } = await query;

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      const analises = data || [];
      const total = analises.length;

      // Contar por severidade
      const porSeveridade: Record<string, number> = {
        baixa: 0,
        media: 0,
        alta: 0,
        critica: 0,
      };
      analises.forEach(a => {
        porSeveridade[a.severidade] = (porSeveridade[a.severidade] || 0) + 1;
      });

      // Contar por tipo
      const porTipo: Record<string, number> = {};
      analises.forEach(a => {
        porTipo[a.tipoAnalise] = (porTipo[a.tipoAnalise] || 0) + 1;
      });

      // Contar por status
      const porStatus: Record<string, number> = {
        pendente: 0,
        em_analise: 0,
        concluida: 0,
      };
      analises.forEach(a => {
        porStatus[a.status] = (porStatus[a.status] || 0) + 1;
      });

      // Contar críticas pendentes
      const criticasPendentes = analises.filter(
        a => a.severidade === 'critica' && a.status !== 'concluida'
      ).length;

      return {
        success: true,
        data: {
          total,
          porSeveridade,
          porTipo,
          porStatus,
          criticasPendentes,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Executar análise automática (placeholder para implementação futura)
   */
  async executarAnalise(declaracaoId: string, tipoAnalise: string): Promise<ApiResponse<IAnalise>> {
    try {
      // TODO: Implementar lógica de análise específica
      // 1. Buscar dados da declaração
      // 2. Aplicar regras de negócio
      // 3. Identificar problemas
      // 4. Calcular severidade
      // 5. Gerar recomendações

      // Por enquanto, criar análise de exemplo
      const analiseData: Partial<IAnalise> = {
        dctfId: declaracaoId,
        tipoAnalise,
        severidade: 'media',
        descricao: `Análise ${tipoAnalise} executada automaticamente`,
        recomendacoes: ['Verificar dados', 'Validar cálculos'],
        status: 'concluida',
      };

      return this.createAnalise(analiseData);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Marcar análise como concluída
   */
  async marcarConcluida(id: string): Promise<ApiResponse<IAnalise>> {
    return this.updateStatus(id, 'concluida');
  }

  /**
   * Marcar análise como em análise
   */
  async marcarEmAnalise(id: string): Promise<ApiResponse<IAnalise>> {
    return this.updateStatus(id, 'em_analise');
  }
}
