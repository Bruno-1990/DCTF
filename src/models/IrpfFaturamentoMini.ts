/**
 * Modelo IrpfFaturamentoMini - Cache miniaturizado (apenas totais anuais)
 * Gerado automaticamente a partir dos dados detalhados
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IrpfFaturamentoMiniData {
  id?: string;
  cliente_id: string;
  codigo_sci: number;
  codigo_empresa?: number; // 1=Matriz, 2=Filial (SCI BDCOD)
  ano: number;
  valor_total: number;
  media_mensal: number;
  updated_at?: Date | string;
}

export class IrpfFaturamentoMini extends DatabaseService<IrpfFaturamentoMiniData> {
  constructor() {
    super('irpf_faturamento_mini');
  }

  /**
   * Criar tabela de cache mini se não existir
   */
  async ensureTable(): Promise<ApiResponse<boolean>> {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`irpf_faturamento_mini\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`cliente_id\` VARCHAR(36) NOT NULL,
          \`codigo_sci\` INT NOT NULL,
          \`codigo_empresa\` INT NOT NULL DEFAULT 1,
          \`ano\` INT NOT NULL,
          \`valor_total\` DECIMAL(15, 2) NOT NULL,
          \`media_mensal\` DECIMAL(15, 2) NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_cliente_empresa_ano\` (\`cliente_id\`, \`codigo_empresa\`, \`ano\`),
          INDEX \`idx_codigo_sci_ano\` (\`codigo_sci\`, \`ano\`),
          UNIQUE KEY \`uk_cliente_empresa_ano\` (\`cliente_id\`, \`codigo_empresa\`, \`ano\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;

      await this.executeCustomQuery(createTableSQL);
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao criar tabela de cache mini',
      };
    }
  }

  /**
   * Gerar cache mini a partir de dados detalhados.
   * Usa apenas INSERT ... ON DUPLICATE KEY UPDATE (sem DELETE) para reduzir lock e risco de deadlock.
   * Em caso de deadlock (concorrência 2024/2025), faz retry automático.
   */
  async gerarCache(
    clienteId: string,
    codigoSci: number,
    ano: number,
    dadosMensais: Array<{
      faturamento_total: number;
    }>,
    codigoEmpresa: number = 1
  ): Promise<ApiResponse<boolean>> {
    try {
      await this.ensureTable();

      const valorTotal = dadosMensais.reduce(
        (sum, item) => sum + (item.faturamento_total || 0),
        0
      );
      const mediaMensal = dadosMensais.length > 0 ? valorTotal / dadosMensais.length : 0;

      const id = require('uuid').v4();
      const sql = `
        INSERT INTO \`irpf_faturamento_mini\`
          (\`id\`, \`cliente_id\`, \`codigo_sci\`, \`codigo_empresa\`, \`ano\`, \`valor_total\`, \`media_mensal\`)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`valor_total\` = VALUES(\`valor_total\`),
          \`media_mensal\` = VALUES(\`media_mensal\`),
          \`updated_at\` = CURRENT_TIMESTAMP
      `;
      const params = [id, clienteId, codigoSci, codigoEmpresa, ano, valorTotal, mediaMensal];

      const maxRetries = 3;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.executeCustomQuery(sql, params);
          return { success: true, data: true };
        } catch (err: any) {
          lastError = err;
          const isDeadlock =
            err?.code === 'ER_LOCK_DEADLOCK' ||
            err?.errno === 1213 ||
            err?.sqlState === '40001';
          if (isDeadlock && attempt < maxRetries) {
            const delayMs = 50 * attempt + Math.floor(Math.random() * 100);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          throw err;
        }
      }

      throw lastError;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao gerar cache mini',
      };
    }
  }

  /**
   * Buscar cache mini por cliente e anos
   */
  async buscarPorAnos(
    clienteId: string,
    anos: number[]
  ): Promise<ApiResponse<IrpfFaturamentoMiniData[]>> {
    try {
      await this.ensureTable();

      const placeholders = anos.map(() => '?').join(',');
      const sql = `
        SELECT *
        FROM \`irpf_faturamento_mini\`
        WHERE \`cliente_id\` = ? AND \`ano\` IN (${placeholders})
        ORDER BY \`ano\` ASC
      `;

      const result = await this.executeCustomQuery<IrpfFaturamentoMiniData>(
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
        error: error instanceof Error ? error.message : 'Erro ao buscar cache mini',
        data: [],
      };
    }
  }
}




