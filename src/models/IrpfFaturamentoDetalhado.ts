/**
 * Modelo IrpfFaturamentoDetalhado - Armazena dados detalhados de faturamento do SCI
 * Esta é a tabela principal que contém todos os dados brutos
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IrpfFaturamentoDetalhadoData {
  id?: string;
  cliente_id: string;
  codigo_sci: number;
  ano: number;
  mes: number;
  bdref: number; // YYYYMM format (ex: 202501)
  vendas_brutas: number;
  devolucoes_deducoes: number;
  vendas_liquidadas: number;
  servicos: number;
  outras_receitas: number;
  operacoes_imobiliarias: number;
  faturamento_total: number;
  dados_originais?: any; // JSON com dados completos retornados pela SP
  created_at?: Date | string;
  updated_at?: Date | string;
}

export class IrpfFaturamentoDetalhado extends DatabaseService<IrpfFaturamentoDetalhadoData> {
  constructor() {
    super('irpf_faturamento_detalhado');
  }

  /**
   * Criar tabela de dados detalhados se não existir
   */
  async ensureTable(): Promise<ApiResponse<boolean>> {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`irpf_faturamento_detalhado\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`cliente_id\` VARCHAR(36) NOT NULL,
          \`codigo_sci\` INT NOT NULL,
          \`ano\` INT NOT NULL,
          \`mes\` INT NOT NULL,
          \`bdref\` INT NOT NULL,
          \`vendas_brutas\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`devolucoes_deducoes\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`vendas_liquidadas\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`servicos\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`outras_receitas\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`operacoes_imobiliarias\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`faturamento_total\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`dados_originais\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_cliente_ano_mes\` (\`cliente_id\`, \`ano\`, \`mes\`),
          INDEX \`idx_codigo_sci_ano\` (\`codigo_sci\`, \`ano\`),
          INDEX \`idx_bdref\` (\`bdref\`),
          UNIQUE KEY \`uk_cliente_ano_mes\` (\`cliente_id\`, \`ano\`, \`mes\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;

      await this.executeCustomQuery(createTableSQL);
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao criar tabela de dados detalhados',
      };
    }
  }

  /**
   * Salvar dados detalhados mensais
   */
  async salvarDetalhado(
    clienteId: string,
    codigoSci: number,
    ano: number,
    dadosMensais: Array<{
      mes: number;
      bdref: number;
      vendas_brutas: number;
      devolucoes_deducoes: number;
      vendas_liquidadas: number;
      servicos: number;
      outras_receitas: number;
      operacoes_imobiliarias: number;
      faturamento_total: number;
      dados_originais?: any;
    }>
  ): Promise<ApiResponse<number>> {
    try {
      await this.ensureTable();

      let salvos = 0;

      for (const item of dadosMensais) {
        const id = require('uuid').v4();
        const sql = `
          INSERT INTO \`irpf_faturamento_detalhado\` 
            (\`id\`, \`cliente_id\`, \`codigo_sci\`, \`ano\`, \`mes\`, \`bdref\`,
             \`vendas_brutas\`, \`devolucoes_deducoes\`, \`vendas_liquidadas\`,
             \`servicos\`, \`outras_receitas\`, \`operacoes_imobiliarias\`,
             \`faturamento_total\`, \`dados_originais\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            \`vendas_brutas\` = VALUES(\`vendas_brutas\`),
            \`devolucoes_deducoes\` = VALUES(\`devolucoes_deducoes\`),
            \`vendas_liquidadas\` = VALUES(\`vendas_liquidadas\`),
            \`servicos\` = VALUES(\`servicos\`),
            \`outras_receitas\` = VALUES(\`outras_receitas\`),
            \`operacoes_imobiliarias\` = VALUES(\`operacoes_imobiliarias\`),
            \`faturamento_total\` = VALUES(\`faturamento_total\`),
            \`dados_originais\` = VALUES(\`dados_originais\`),
            \`updated_at\` = CURRENT_TIMESTAMP
        `;

        await this.executeCustomQuery(sql, [
          id,
          clienteId,
          codigoSci,
          ano,
          item.mes,
          item.bdref,
          item.vendas_brutas || 0,
          item.devolucoes_deducoes || 0,
          item.vendas_liquidadas || 0,
          item.servicos || 0,
          item.outras_receitas || 0,
          item.operacoes_imobiliarias || 0,
          item.faturamento_total || 0,
          item.dados_originais ? JSON.stringify(item.dados_originais) : null,
        ]);

        salvos++;
      }

      return { success: true, data: salvos };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao salvar dados detalhados',
      };
    }
  }

  /**
   * Buscar dados detalhados por cliente e anos
   */
  async buscarPorAnos(
    clienteId: string,
    anos: number[]
  ): Promise<ApiResponse<IrpfFaturamentoDetalhadoData[]>> {
    try {
      await this.ensureTable();

      const placeholders = anos.map(() => '?').join(',');
      const sql = `
        SELECT *
        FROM \`irpf_faturamento_detalhado\`
        WHERE \`cliente_id\` = ? AND \`ano\` IN (${placeholders})
        ORDER BY \`ano\` ASC, \`mes\` ASC
      `;

      const result = await this.executeCustomQuery<IrpfFaturamentoDetalhadoData>(
        sql,
        [clienteId, ...anos]
      );

      if (!result.success || !Array.isArray(result.data)) {
        return { success: true, data: [] };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar dados detalhados',
        data: [],
      };
    }
  }

  /**
   * Limpar dados antigos (manutenção)
   */
  async limparDadosAntigos(dias: number = 90): Promise<ApiResponse<number>> {
    try {
      await this.ensureTable();

      const sql = `
        DELETE FROM \`irpf_faturamento_detalhado\`
        WHERE \`updated_at\` < DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const { getConnection } = await import('../config/mysql');
      const connection = await getConnection();
      try {
        const [result] = await connection.execute(sql, [dias]) as any;
        const deletedCount = result?.affectedRows || 0;
        return { success: true, data: deletedCount };
      } finally {
        connection.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao limpar dados antigos',
      };
    }
  }
}




