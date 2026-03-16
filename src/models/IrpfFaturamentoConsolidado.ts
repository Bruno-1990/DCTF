/**
 * Modelo IrpfFaturamentoConsolidado - Cache consolidado (apenas faturamento total por mês)
 * Gerado automaticamente a partir dos dados detalhados
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IrpfFaturamentoConsolidadoData {
  id?: string;
  cliente_id: string;
  codigo_sci: number;
  ano: number;
  mes: number;
  mes_ano: string; // "Janeiro/2025"
  faturamento: number;
  updated_at?: Date | string;
}

export class IrpfFaturamentoConsolidado extends DatabaseService<IrpfFaturamentoConsolidadoData> {
  constructor() {
    super('irpf_faturamento_consolidado');
  }

  /**
   * Criar tabela de cache consolidado se não existir
   */
  async ensureTable(): Promise<ApiResponse<boolean>> {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`irpf_faturamento_consolidado\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`cliente_id\` VARCHAR(36) NOT NULL,
          \`codigo_sci\` INT NOT NULL,
          \`codigo_empresa\` INT NOT NULL DEFAULT 1,
          \`ano\` INT NOT NULL,
          \`mes\` INT NOT NULL,
          \`mes_ano\` VARCHAR(20) NOT NULL,
          \`faturamento\` DECIMAL(15, 2) NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_cliente_empresa_ano_mes\` (\`cliente_id\`, \`codigo_empresa\`, \`ano\`, \`mes\`),
          INDEX \`idx_codigo_sci_ano\` (\`codigo_sci\`, \`ano\`),
          UNIQUE KEY \`uk_cliente_empresa_ano_mes\` (\`cliente_id\`, \`codigo_empresa\`, \`ano\`, \`mes\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;

      await this.executeCustomQuery(createTableSQL);
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao criar tabela de cache consolidado',
      };
    }
  }

  /**
   * Gerar cache consolidado a partir de dados detalhados
   */
  async gerarCache(
    clienteId: string,
    codigoSci: number,
    ano: number,
    dadosMensais: Array<{
      mes: number;
      bdref: number;
      faturamento_total: number;
    }>,
    codigoEmpresa: number = 1
  ): Promise<ApiResponse<number>> {
    try {
      await this.ensureTable();

      // Remover cache existente para (cliente, empresa, ano) para evitar duplicatas ao atualizar
      await this.executeCustomQuery(
        `DELETE FROM \`irpf_faturamento_consolidado\` WHERE \`cliente_id\` = ? AND \`codigo_empresa\` = ? AND \`ano\` = ?`,
        [clienteId, codigoEmpresa, ano]
      );

      const meses = [
        '',
        'Janeiro',
        'Fevereiro',
        'Março',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ];

      let salvos = 0;

      for (const item of dadosMensais) {
        const id = require('uuid').v4();
        const mesAno = `${meses[item.mes]}/${ano}`;

        const sql = `
          INSERT INTO \`irpf_faturamento_consolidado\` 
            (\`id\`, \`cliente_id\`, \`codigo_sci\`, \`codigo_empresa\`, \`ano\`, \`mes\`, \`mes_ano\`, \`faturamento\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            \`faturamento\` = VALUES(\`faturamento\`),
            \`mes_ano\` = VALUES(\`mes_ano\`),
            \`updated_at\` = CURRENT_TIMESTAMP
        `;

        await this.executeCustomQuery(sql, [
          id,
          clienteId,
          codigoSci,
          codigoEmpresa,
          ano,
          item.mes,
          mesAno,
          item.faturamento_total || 0,
        ]);

        salvos++;
      }

      return { success: true, data: salvos };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao gerar cache consolidado',
      };
    }
  }

  /**
   * Buscar cache consolidado por cliente e anos
   */
  async buscarPorAnos(
    clienteId: string,
    anos: number[]
  ): Promise<ApiResponse<IrpfFaturamentoConsolidadoData[]>> {
    try {
      await this.ensureTable();

      const placeholders = anos.map(() => '?').join(',');
      const sql = `
        SELECT *
        FROM \`irpf_faturamento_consolidado\`
        WHERE \`cliente_id\` = ? AND \`ano\` IN (${placeholders})
        ORDER BY \`ano\` ASC, \`mes\` ASC
      `;

      const result = await this.executeCustomQuery<IrpfFaturamentoConsolidadoData>(
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
        error: error instanceof Error ? error.message : 'Erro ao buscar cache consolidado',
        data: [],
      };
    }
  }
}




