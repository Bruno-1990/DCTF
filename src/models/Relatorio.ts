/**
 * Modelo Relatorio - Representa relatórios gerados pelo sistema
 * Gerencia geração e armazenamento de relatórios
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';
import Joi from 'joi';

// Interface para Relatório
export interface Relatorio {
  id: string;
  declaracaoId: string;
  tipoRelatorio: string;
  titulo: string;
  conteudo?: string;
  arquivoPdf?: string;
  parametros?: Record<string, any>;
  createdAt: Date;
}

// Schema de validação para Relatório
const relatorioSchema = Joi.object({
  declaracaoId: Joi.string().uuid().required().messages({
    'string.guid': 'ID da declaração deve ser um UUID válido',
    'any.required': 'ID da declaração é obrigatório',
  }),
  tipoRelatorio: Joi.string().max(50).required().messages({
    'string.max': 'Tipo de relatório deve ter no máximo 50 caracteres',
    'any.required': 'Tipo de relatório é obrigatório',
  }),
  titulo: Joi.string().min(5).max(255).required().messages({
    'string.min': 'Título deve ter pelo menos 5 caracteres',
    'string.max': 'Título deve ter no máximo 255 caracteres',
    'any.required': 'Título é obrigatório',
  }),
  conteudo: Joi.string().optional().allow('').messages({
    'string.base': 'Conteúdo deve ser uma string',
  }),
  arquivoPdf: Joi.string().uri().optional().messages({
    'string.uri': 'Arquivo PDF deve ser uma URI válida',
  }),
  parametros: Joi.object().optional().messages({
    'object.base': 'Parâmetros deve ser um objeto',
  }),
});

export class Relatorio extends DatabaseService<Relatorio> {
  constructor() {
    super('relatorios');
  }

  /**
   * Valida os dados do relatório
   */
  private validateRelatorio(data: Partial<Relatorio>): { isValid: boolean; error?: string } {
    const { error } = relatorioSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Criar relatório com validação
   */
  async createRelatorio(relatorioData: Partial<Relatorio>): Promise<ApiResponse<Relatorio>> {
    const validation = this.validateRelatorio(relatorioData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.create(relatorioData);
  }

  /**
   * Atualizar relatório
   */
  async updateRelatorio(id: string, updates: Partial<Relatorio>): Promise<ApiResponse<Relatorio>> {
    const validation = this.validateRelatorio(updates);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return this.update(id, updates);
  }

  /**
   * Buscar relatórios por declaração
   */
  async findByDeclaracao(declaracaoId: string): Promise<ApiResponse<Relatorio[]>> {
    return this.findBy({ declaracao_id: declaracaoId });
  }

  /**
   * Buscar relatórios por tipo
   */
  async findByTipo(tipoRelatorio: string): Promise<ApiResponse<Relatorio[]>> {
    return this.findBy({ tipo_relatorio: tipoRelatorio });
  }

  /**
   * Buscar relatórios por período de criação
   */
  async findByPeriodo(dataInicio: Date, dataFim: Date): Promise<ApiResponse<Relatorio[]>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .gte('created_at', dataInicio.toISOString())
        .lte('created_at', dataFim.toISOString())
        .order('created_at', { ascending: false });

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
   * Obter estatísticas dos relatórios
   */
  async getStats(declaracaoId?: string): Promise<ApiResponse<{
    total: number;
    porTipo: Record<string, number>;
    comPdf: number;
    semPdf: number;
    ultimos30Dias: number;
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

      const relatorios = data || [];
      const total = relatorios.length;

      // Contar por tipo
      const porTipo: Record<string, number> = {};
      relatorios.forEach(r => {
        porTipo[r.tipoRelatorio] = (porTipo[r.tipoRelatorio] || 0) + 1;
      });

      // Contar com e sem PDF
      const comPdf = relatorios.filter(r => r.arquivoPdf).length;
      const semPdf = total - comPdf;

      // Contar dos últimos 30 dias
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - 30);
      const ultimos30Dias = relatorios.filter(
        r => new Date(r.createdAt) >= dataLimite
      ).length;

      return {
        success: true,
        data: {
          total,
          porTipo,
          comPdf,
          semPdf,
          ultimos30Dias,
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
   * Gerar relatório de análise (placeholder para implementação futura)
   */
  async gerarRelatorioAnalise(
    declaracaoId: string,
    tipoRelatorio: string,
    parametros?: Record<string, any>
  ): Promise<ApiResponse<Relatorio>> {
    try {
      // TODO: Implementar geração de relatório
      // 1. Buscar dados da declaração
      // 2. Buscar análises relacionadas
      // 3. Buscar flags
      // 4. Gerar conteúdo do relatório
      // 5. Gerar PDF (se necessário)
      // 6. Salvar relatório

      const relatorioData: Partial<Relatorio> = {
        declaracaoId,
        tipoRelatorio,
        titulo: `Relatório de ${tipoRelatorio}`,
        conteudo: 'Relatório gerado automaticamente',
        parametros,
      };

      return this.createRelatorio(relatorioData);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Gerar relatório de flags
   */
  async gerarRelatorioFlags(declaracaoId: string): Promise<ApiResponse<Relatorio>> {
    try {
      // TODO: Implementar geração de relatório de flags
      const relatorioData: Partial<Relatorio> = {
        declaracaoId,
        tipoRelatorio: 'flags',
        titulo: 'Relatório de Flags DCTF',
        conteudo: 'Relatório de flags gerado automaticamente',
        parametros: {
          geradoEm: new Date().toISOString(),
          versao: '1.0',
        },
      };

      return this.createRelatorio(relatorioData);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Gerar relatório de estatísticas
   */
  async gerarRelatorioEstatisticas(declaracaoId: string): Promise<ApiResponse<Relatorio>> {
    try {
      // TODO: Implementar geração de relatório de estatísticas
      const relatorioData: Partial<Relatorio> = {
        declaracaoId,
        tipoRelatorio: 'estatisticas',
        titulo: 'Relatório de Estatísticas DCTF',
        conteudo: 'Relatório de estatísticas gerado automaticamente',
        parametros: {
          geradoEm: new Date().toISOString(),
          versao: '1.0',
        },
      };

      return this.createRelatorio(relatorioData);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Atualizar relatório com arquivo PDF
   */
  async atualizarComPdf(id: string, arquivoPdf: string): Promise<ApiResponse<Relatorio>> {
    return this.update(id, { arquivoPdf });
  }

  /**
   * Atualizar relatório com conteúdo
   */
  async atualizarConteudo(id: string, conteudo: string): Promise<ApiResponse<Relatorio>> {
    return this.update(id, { conteudo });
  }
}
