/**
 * Modelo Flag - Representa sinalizações de problemas encontrados
 * Gerencia flags de validação e problemas identificados
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';
import Joi from 'joi';

// Interface para Flag
export interface Flag {
  id: string;
  declaracaoId: string;
  linhaDctf?: number;
  codigoFlag: string;
  descricao: string;
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  resolvido: boolean;
  resolucao?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schema de validação para Flag
const flagSchema = Joi.object({
  declaracaoId: Joi.string().uuid().required().messages({
    'string.guid': 'ID da declaração deve ser um UUID válido',
    'any.required': 'ID da declaração é obrigatório',
  }),
  linhaDctf: Joi.number().integer().min(1).optional().messages({
    'number.base': 'Linha DCTF deve ser um número',
    'number.integer': 'Linha DCTF deve ser um número inteiro',
    'number.min': 'Linha DCTF deve ser maior que 0',
  }),
  codigoFlag: Joi.string().max(20).required().messages({
    'string.max': 'Código da flag deve ter no máximo 20 caracteres',
    'any.required': 'Código da flag é obrigatório',
  }),
  descricao: Joi.string().min(10).max(1000).required().messages({
    'string.min': 'Descrição deve ter pelo menos 10 caracteres',
    'string.max': 'Descrição deve ter no máximo 1000 caracteres',
    'any.required': 'Descrição é obrigatória',
  }),
  severidade: Joi.string()
    .valid('baixa', 'media', 'alta', 'critica')
    .required()
    .messages({
      'any.only': 'Severidade deve ser: baixa, media, alta ou critica',
      'any.required': 'Severidade é obrigatória',
    }),
  resolvido: Joi.boolean().default(false).messages({
    'boolean.base': 'Resolvido deve ser um valor booleano',
  }),
  resolucao: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Resolução deve ter no máximo 1000 caracteres',
  }),
});

export class Flag extends DatabaseService<Flag> {
  constructor() {
    super('flags');
  }

  /**
   * Valida os dados da flag
   */
  private validateFlag(data: Partial<Flag>): { isValid: boolean; error?: string } {
    const { error } = flagSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Criar flag com validação
   */
  async createFlag(flagData: Partial<Flag>): Promise<ApiResponse<Flag>> {
    const validation = this.validateFlag(flagData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.create(flagData);
  }

  /**
   * Atualizar flag
   */
  async updateFlag(id: string, updates: Partial<Flag>): Promise<ApiResponse<Flag>> {
    const validation = this.validateFlag(updates);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.update(id, updates);
  }

  /**
   * Buscar flags por declaração
   */
  async findByDeclaracao(declaracaoId: string): Promise<ApiResponse<Flag[]>> {
    return this.findBy({ declaracao_id: declaracaoId });
  }

  /**
   * Buscar flags por código
   */
  async findByCodigo(codigoFlag: string): Promise<ApiResponse<Flag[]>> {
    return this.findBy({ codigo_flag: codigoFlag });
  }

  /**
   * Buscar flags por severidade
   */
  async findBySeveridade(severidade: string): Promise<ApiResponse<Flag[]>> {
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
   * Buscar flags não resolvidas
   */
  async findNaoResolvidas(): Promise<ApiResponse<Flag[]>> {
    return this.findBy({ resolvido: false });
  }

  /**
   * Buscar flags resolvidas
   */
  async findResolvidas(): Promise<ApiResponse<Flag[]>> {
    return this.findBy({ resolvido: true });
  }

  /**
   * Resolver flag
   */
  async resolverFlag(id: string, resolucao: string): Promise<ApiResponse<Flag>> {
    if (!resolucao || resolucao.trim().length === 0) {
      return {
        success: false,
        error: 'Resolução é obrigatória',
      };
    }

    return this.update(id, {
      resolvido: true,
      resolucao: resolucao.trim(),
    });
  }

  /**
   * Reabrir flag
   */
  async reabrirFlag(id: string): Promise<ApiResponse<Flag>> {
    return this.update(id, {
      resolvido: false,
      resolucao: undefined,
    });
  }

  /**
   * Obter estatísticas das flags
   */
  async getStats(declaracaoId?: string): Promise<ApiResponse<{
    total: number;
    resolvidas: number;
    naoResolvidas: number;
    porSeveridade: Record<string, number>;
    porCodigo: Record<string, number>;
    criticasNaoResolvidas: number;
  }>> {
    try {
      const adapter = this.supabase as any;
      let query = adapter.from(this.tableName).select('*');
      
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

      const flags = data || [];
      const total = flags.length;
      const resolvidas = flags.filter(f => f.resolvido).length;
      const naoResolvidas = total - resolvidas;

      // Contar por severidade
      const porSeveridade: Record<string, number> = {
        baixa: 0,
        media: 0,
        alta: 0,
        critica: 0,
      };
      flags.forEach(f => {
        porSeveridade[f.severidade] = (porSeveridade[f.severidade] || 0) + 1;
      });

      // Contar por código
      const porCodigo: Record<string, number> = {};
      flags.forEach(f => {
        porCodigo[f.codigoFlag] = (porCodigo[f.codigoFlag] || 0) + 1;
      });

      // Contar críticas não resolvidas
      const criticasNaoResolvidas = flags.filter(
        f => f.severidade === 'critica' && !f.resolvido
      ).length;

      return {
        success: true,
        data: {
          total,
          resolvidas,
          naoResolvidas,
          porSeveridade,
          porCodigo,
          criticasNaoResolvidas,
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
   * Criar flag automática (para uso em validações)
   */
  async criarFlagAutomatica(
    declaracaoId: string,
    codigoFlag: string,
    descricao: string,
    severidade: 'baixa' | 'media' | 'alta' | 'critica',
    linhaDctf?: number
  ): Promise<ApiResponse<Flag>> {
    const flagData: Partial<Flag> = {
      declaracaoId,
      codigoFlag,
      descricao,
      severidade,
      linhaDctf,
      resolvido: false,
    };

    return this.createFlag(flagData);
  }

  /**
   * Criar ou atualizar flag garantindo idempotência por declaração + código
   */
  async upsertFlag(
    declaracaoId: string,
    codigoFlag: string,
    descricao: string,
    severidade: 'baixa' | 'media' | 'alta' | 'critica',
    linhaDctf?: number
  ): Promise<ApiResponse<Flag>> {
    const existing = await this.findBy({ declaracao_id: declaracaoId, codigo_flag: codigoFlag });
    if (existing.success && existing.data && existing.data.length > 0) {
      const flag = existing.data[0] as any;
      return this.update(flag.id, {
        declaracaoId,
        codigoFlag,
        descricao,
        severidade,
        linhaDctf,
        resolvido: false,
        resolucao: undefined,
      });
    }

    return this.criarFlagAutomatica(declaracaoId, codigoFlag, descricao, severidade, linhaDctf);
  }

  /**
   * Resolver flags por código
   */
  async resolverFlagsPorCodigo(codigoFlag: string, resolucao: string): Promise<ApiResponse<number>> {
    try {
      const flagsResult = await this.findByCodigo(codigoFlag);
      if (!flagsResult.success) {
        return {
          success: false,
          error: flagsResult.error,
        };
      }

      const flags = flagsResult.data!;
      let resolvidas = 0;

      for (const flag of flags) {
        if (!flag.resolvido) {
          const result = await this.resolverFlag(flag.id, resolucao);
          if (result.success) {
            resolvidas++;
          }
        }
      }

      return {
        success: true,
        data: resolvidas,
        message: `${resolvidas} flags resolvidas`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar flags com filtros e paginação
   */
  async search(options: {
    page?: number;
    limit?: number;
    declaracaoId?: string;
    codigoFlag?: string;
    severidade?: string;
    resolvido?: boolean;
    orderBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ApiResponse<{ items: Flag[]; pagination: { page: number; limit: number; total: number } }>> {
    const page = Math.max(1, Number(options.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(options.limit ?? 20)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const adapter = this.supabase as any;
    let query = adapter
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .range(from, to);

    if (options.declaracaoId) {
      query = query.eq('declaracao_id', options.declaracaoId);
    }
    if (options.codigoFlag) {
      query = query.eq('codigo_flag', options.codigoFlag);
    }
    if (options.severidade) {
      query = query.eq('severidade', options.severidade);
    }
    if (typeof options.resolvido === 'boolean') {
      query = query.eq('resolvido', options.resolvido);
    }

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: options.order === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error, count } = await query;

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: {
        items: (data || []) as Flag[],
        pagination: {
          page,
          limit,
          total: count ?? 0,
        },
      },
    };
  }
}
