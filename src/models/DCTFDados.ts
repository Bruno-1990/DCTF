/**
 * Modelo DCTFDados - Representa dados processados das declarações DCTF
 * Gerencia os dados extraídos dos arquivos DCTF
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';
import { ValidationService } from '../services/ValidationService';
import Joi from 'joi';
import { DCTFValidationService } from '../services/DCTFValidationService';

// Interface para dados DCTF processados
export interface DCTFDados {
  id: string;
  declaracaoId: string;
  linha: number;
  codigo?: string;
  descricao?: string;
  valor?: number;
  dataOcorrencia?: Date;
  observacoes?: string;
  createdAt: Date;
}

// Schema de validação para DCTF Dados
const dctfDadosSchema = Joi.object({
  declaracaoId: Joi.string().uuid().required().messages({
    'string.guid': 'ID da declaração deve ser um UUID válido',
    'any.required': 'ID da declaração é obrigatório',
  }),
  linha: Joi.number().integer().min(1).required().messages({
    'number.base': 'Linha deve ser um número',
    'number.integer': 'Linha deve ser um número inteiro',
    'number.min': 'Linha deve ser maior que 0',
    'any.required': 'Linha é obrigatória',
  }),
  codigo: Joi.string().max(10).optional().allow('').messages({
    'string.max': 'Código deve ter no máximo 10 caracteres',
  }),
  descricao: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Descrição deve ter no máximo 500 caracteres',
  }),
  valor: Joi.number().precision(2).min(0).optional().messages({
    'number.base': 'Valor deve ser um número',
    'number.min': 'Valor não pode ser negativo',
    'number.precision': 'Valor deve ter no máximo 2 casas decimais',
  }),
  dataOcorrencia: Joi.date().optional().messages({
    'date.base': 'Data de ocorrência deve ser uma data válida',
  }),
  observacoes: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Observações devem ter no máximo 1000 caracteres',
  }),
});

export class DCTFDados extends DatabaseService<DCTFDados> {
  constructor() {
    super('dctf_dados');
  }

  /**
   * Valida os dados DCTF
   */
  private validateDCTFDados(data: Partial<DCTFDados>): { isValid: boolean; error?: string } {
    const { error } = dctfDadosSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Criar dados DCTF com validação
   */
  async createDCTFDados(dadosData: Partial<DCTFDados>): Promise<ApiResponse<DCTFDados>> {
    // Normalizar dataOcorrencia (aceita dd/mm/yyyy) e permitir vazio
    if ((dadosData as any).dataOcorrencia !== undefined) {
      const raw = (dadosData as any).dataOcorrencia;
      if (typeof raw === 'string' && raw.trim() === '') {
        delete (dadosData as any).dataOcorrencia;
      } else {
        const normalized = ValidationService.normalizeDate(raw);
        if (!normalized) {
          return {
            success: false,
            error: 'Data de ocorrência inválida',
          };
        }
        dadosData.dataOcorrencia = normalized;
      }
    }
    // Sanitizar código (trim + upper)
    if (dadosData.codigo) {
      dadosData.codigo = ValidationService.sanitizeCodigo(String(dadosData.codigo));
    }

    // Regras de negócio adicionais (código/valor)
    const linhaValidation = DCTFValidationService.validateDCTFLinha({
      codigo: dadosData.codigo,
      descricao: dadosData.descricao,
      valor: dadosData.valor,
      dataOcorrencia: dadosData.dataOcorrencia ? new Date(dadosData.dataOcorrencia).toISOString() : undefined,
    });
    if (!linhaValidation.isValid) {
      return { success: false, error: linhaValidation.errors[0] || 'Dados DCTF inválidos' };
    }

    const validation = this.validateDCTFDados(dadosData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.create(dadosData);
  }

  /**
   * Criar múltiplos dados DCTF em lote
   */
  async createBulkDCTFDados(dadosArray: Partial<DCTFDados>[]): Promise<ApiResponse<DCTFDados[]>> {
    try {
      // Normalizar/sanitizar antes de validar (permitir vazio)
      dadosArray = dadosArray.map(d => {
        if (d.codigo) {
          d.codigo = ValidationService.sanitizeCodigo(String(d.codigo));
        }
        if ((d as any).dataOcorrencia !== undefined) {
          const raw = (d as any).dataOcorrencia;
          if (typeof raw === 'string' && raw.trim() === '') {
            delete (d as any).dataOcorrencia;
          } else {
            const normalized = ValidationService.normalizeDate(raw);
            if (normalized) {
              d.dataOcorrencia = normalized;
            }
          }
        }
        return d;
      });

      // Validar todos os dados
      for (const dados of dadosArray) {
        const linhaValidation = DCTFValidationService.validateDCTFLinha({
          codigo: dados.codigo,
          descricao: dados.descricao,
          valor: dados.valor,
          dataOcorrencia: dados.dataOcorrencia ? new Date(dados.dataOcorrencia).toISOString() : undefined,
        });
        if (!linhaValidation.isValid) {
          return {
            success: false,
            error: `Dados inválidos na linha ${dados.linha}: ${linhaValidation.errors[0]}`,
          };
        }
        const validation = this.validateDCTFDados(dados);
        if (!validation.isValid) {
          return {
            success: false,
            error: `Dados inválidos na linha ${dados.linha}: ${validation.error}`,
          };
        }
      }

      // Inserir em lote
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(dadosArray)
        .select();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar dados por declaração
   */
  async findByDeclaracao(declaracaoId: string): Promise<ApiResponse<DCTFDados[]>> {
    return this.findBy({ declaracao_id: declaracaoId });
  }

  /**
   * Buscar dados por código
   */
  async findByCodigo(codigo: string): Promise<ApiResponse<DCTFDados[]>> {
    return this.findBy({ codigo });
  }

  /**
   * Buscar dados por faixa de valores
   */
  async findByValorRange(valorMin: number, valorMax: number): Promise<ApiResponse<DCTFDados[]>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .gte('valor', valorMin)
        .lte('valor', valorMax)
        .order('valor');

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar dados por período de ocorrência
   */
  async findByPeriodoOcorrencia(dataInicio: Date, dataFim: Date): Promise<ApiResponse<DCTFDados[]>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .gte('data_ocorrencia', dataInicio.toISOString())
        .lte('data_ocorrencia', dataFim.toISOString())
        .order('data_ocorrencia');

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Obter estatísticas dos dados
   */
  async getStats(declaracaoId?: string): Promise<ApiResponse<{
    total: number;
    totalValor: number;
    porCodigo: Record<string, number>;
    valorMedio: number;
    valorMaximo: number;
    valorMinimo: number;
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

      const dados = data || [];
      const total = dados.length;
      
      // Calcular estatísticas
      const valores = dados
        .map(d => d.valor)
        .filter(v => v !== null && v !== undefined) as number[];
      
      const totalValor = valores.reduce((sum, val) => sum + val, 0);
      const valorMedio = valores.length > 0 ? totalValor / valores.length : 0;
      const valorMaximo = valores.length > 0 ? Math.max(...valores) : 0;
      const valorMinimo = valores.length > 0 ? Math.min(...valores) : 0;

      // Contar por código
      const porCodigo: Record<string, number> = {};
      dados.forEach(d => {
        if (d.codigo) {
          porCodigo[d.codigo] = (porCodigo[d.codigo] || 0) + 1;
        }
      });

      return {
        success: true,
        data: {
          total,
          totalValor,
          porCodigo,
          valorMedio,
          valorMaximo,
          valorMinimo,
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
   * Deletar dados por declaração
   */
  async deleteByDeclaracao(declaracaoId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('declaracao_id', declaracaoId);

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar com filtros/paginação/ordenação (usa Supabase quando disponível)
   */
  async searchByDeclaracao(params: {
    declaracaoId: string;
    page?: number;
    limit?: number;
    codigo?: string;
    codigoReceita?: string;
    valorMin?: number;
    valorMax?: number;
    dataInicio?: Date | null;
    dataFim?: Date | null;
    search?: string;
    orderBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ApiResponse<{ items: DCTFDados[]; total: number }>> {
    try {
      const {
        declaracaoId,
        page = 1,
        limit = 50,
        codigo,
        codigoReceita,
        valorMin,
        valorMax,
        dataInicio,
        dataFim,
        search,
        orderBy = 'linha',
        order = 'asc',
      } = params;

      if (process.env['SUPABASE_URL'] && process.env['SUPABASE_URL'] !== '') {
        let query = this.supabase
          .from(this.tableName)
          .select('*', { count: 'exact' })
          .eq('declaracao_id', declaracaoId);

        if (codigo) query = query.eq('codigo', ValidationService.sanitizeCodigo(codigo));
        if (valorMin !== undefined) query = query.gte('valor', valorMin);
        if (valorMax !== undefined) query = query.lte('valor', valorMax);
        if (codigoReceita) query = query.eq('codigo_receita', ValidationService.sanitizeCodigo(codigoReceita));
        if (dataInicio) query = query.gte('data_ocorrencia', dataInicio.toISOString());
        if (dataFim) query = query.lte('data_ocorrencia', dataFim.toISOString());
        if (search) {
          const term = `%${ValidationService.sanitizeSearchString(search)}%`;
          query = query.or(`descricao.ilike.${term},observacoes.ilike.${term}`);
        }

        const allowedOrder = new Set(['linha', 'valor', 'codigo', 'codigo_receita', 'data_ocorrencia', 'created_at']);
        const orderColumn = allowedOrder.has(orderBy) ? orderBy : 'linha';
        query = query.order(orderColumn, { ascending: String(order).toLowerCase() !== 'desc' });

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) return { success: false, error: error.message };
        return { success: true, data: { items: (data || []) as any, total: count || 0 } };
      }

      // Fallback em memória
      const base = await this.findByDeclaracao(declaracaoId);
      if (!base.success || !base.data) {
        return { success: false, error: base.error || 'Erro ao buscar dados' };
      }

      let items = base.data as any[];
      if (codigo) {
        const code = ValidationService.sanitizeCodigo(codigo);
        items = items.filter(r => (r.codigo || '').toUpperCase() === code);
      }
      if (valorMin !== undefined || valorMax !== undefined) {
        const min = valorMin !== undefined ? Number(valorMin) : Number.NEGATIVE_INFINITY;
        const max = valorMax !== undefined ? Number(valorMax) : Number.POSITIVE_INFINITY;
        items = items.filter(r => typeof r.valor === 'number' && r.valor >= min && r.valor <= max);
      }
      if (codigoReceita) {
        const code = ValidationService.sanitizeCodigo(codigoReceita);
        items = items.filter(r => (r as any).codigoReceita ? String((r as any).codigoReceita).toUpperCase() === code : false);
      }
      if (dataInicio || dataFim) {
        items = items.filter(r => {
          if (!r.dataOcorrencia) return false;
          const d = new Date(r.dataOcorrencia);
          if (isNaN(d.getTime())) return false;
          if (dataInicio && d < dataInicio) return false;
          if (dataFim && d > dataFim) return false;
          return true;
        });
      }
      if (search) {
        const term = ValidationService.sanitizeSearchString(search);
        items = items.filter(r =>
          [r.codigo, r.descricao, r.observacoes]
            .map((v: any) => (v ? ValidationService.sanitizeSearchString(String(v)) : ''))
            .some((v: string) => v.includes(term))
        );
      }

      const ord = String(order).toLowerCase() === 'desc' ? -1 : 1;
      const key = ['linha', 'valor', 'codigo', 'codigoReceita', 'dataOcorrencia', 'createdAt'].includes(String(orderBy)) ? String(orderBy) : 'linha';
      items = items.sort((a: any, b: any) => {
        const va = a[key];
        const vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return -1 * ord;
        if (vb == null) return 1 * ord;
        if (va < vb) return -1 * ord;
        if (va > vb) return 1 * ord;
        return 0;
      });

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.max(1, Number(limit));
      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum;
      const total = items.length;
      const pageItems = items.slice(start, end) as DCTFDados[];

      return { success: true, data: { items: pageItems, total } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
    }
  }

  /**
   * Deduplicar dados por declaração mantendo o primeiro registro de cada chave forte
   * Chave: codigo + descricao + valor(2 casas) + dataOcorrencia(YYYY-MM-DD) + codigoReceita + cnpjCpf
   */
  async deduplicateByDeclaracao(declaracaoId: string): Promise<ApiResponse<{ removed: number; kept: number; totalBefore: number; totalAfter: number }>> {
    try {
      // Carregar todos os registros da declaração
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('declaracao_id', declaracaoId);

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = (data || []) as any[];
      const totalBefore = rows.length;
      if (totalBefore === 0) {
        return { success: true, data: { removed: 0, kept: 0, totalBefore, totalAfter: 0 } };
      }

      const buildKey = (r: any) => {
        const codigo = (r.codigo ? ValidationService.sanitizeCodigo(String(r.codigo)) : '').toUpperCase();
        const descricao = r.descricao ? ValidationService.sanitizeSearchString(String(r.descricao)) : '';
        const valor = typeof r.valor === 'number' ? r.valor.toFixed(2) : (r.valor ? Number(r.valor).toFixed(2) : '');
        const d = r.data_ocorrencia || r.dataOcorrencia;
        const dataKey = d ? new Date(d).toISOString().slice(0, 10) : '';
        const codigoReceita = (r.codigo_receita || r.codigoReceita) ? ValidationService.sanitizeCodigo(String(r.codigo_receita || r.codigoReceita)) : '';
        const cnpjCpf = (r.cnpj_cpf || r.cnpjCpf) ? String(r.cnpj_cpf || r.cnpjCpf).replace(/\D/g, '') : '';
        return [codigo, descricao, valor, dataKey, codigoReceita, cnpjCpf].join('|');
      };

      const seen = new Map<string, any>();
      const toDeleteIds: string[] = [];

      for (const r of rows) {
        const key = buildKey(r);
        if (!seen.has(key)) {
          seen.set(key, r);
        } else {
          // Escolher qual manter: manter o de menor linha ou mais antigo created_at
          const kept = seen.get(key);
          const linhaR = r.linha ?? Number.MAX_SAFE_INTEGER;
          const linhaK = kept.linha ?? Number.MAX_SAFE_INTEGER;
          let keepCurrent = false;
          if (linhaR < linhaK) {
            keepCurrent = true;
          } else if (linhaR === linhaK) {
            const kr = new Date(kept.created_at || kept.createdAt || 0).getTime();
            const rr = new Date(r.created_at || r.createdAt || 0).getTime();
            if (rr < kr) keepCurrent = true;
          }
          if (keepCurrent) {
            // novo substitui o mantido; marcar antigo para excluir
            if (kept.id) toDeleteIds.push(String(kept.id));
            seen.set(key, r);
          } else {
            if (r.id) toDeleteIds.push(String(r.id));
          }
        }
      }

      let removed = 0;
      if (toDeleteIds.length > 0) {
        const { error: delError } = await this.supabase
          .from(this.tableName)
          .delete()
          .in('id', toDeleteIds);
        if (delError) {
          return { success: false, error: delError.message };
        }
        removed = toDeleteIds.length;
      }

      const kept = totalBefore - removed;
      const totalAfter = kept;
      return { success: true, data: { removed, kept, totalBefore, totalAfter } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
    }
  }
}
