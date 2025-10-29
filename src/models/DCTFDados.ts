/**
 * Modelo DCTFDados - Representa dados processados das declarações DCTF
 * Gerencia os dados extraídos dos arquivos DCTF
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';
import Joi from 'joi';

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
  valor: Joi.number().precision(2).optional().messages({
    'number.base': 'Valor deve ser um número',
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
      // Validar todos os dados
      for (const dados of dadosArray) {
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
}
