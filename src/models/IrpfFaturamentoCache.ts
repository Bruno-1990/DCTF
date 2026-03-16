/**
 * Modelo IrpfFaturamentoCache - Cache de dados de faturamento para IRPF
 * Armazena dados de faturamento do SCI para evitar múltiplas consultas
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IrpfFaturamentoCacheData {
  id?: string;
  cliente_id: string;
  codigo_sci: number;
  ano: number;
  mes: number;
  valor: number;
  dados_originais?: any; // JSON com dados completos retornados pela SP
  created_at?: Date | string;
  updated_at?: Date | string;
}

export class IrpfFaturamentoCache extends DatabaseService<IrpfFaturamentoCacheData> {
  constructor() {
    super('irpf_faturamento_cache');
  }

  /**
   * Criar tabela de cache se não existir
   */
  async ensureTable(): Promise<ApiResponse<boolean>> {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`irpf_faturamento_cache\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`cliente_id\` VARCHAR(36) NOT NULL,
          \`codigo_sci\` INT NOT NULL,
          \`ano\` INT NOT NULL,
          \`mes\` INT NOT NULL,
          \`valor\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
          \`valor_total\` DECIMAL(15, 2) DEFAULT NULL,
          \`media_mensal\` DECIMAL(15, 2) DEFAULT NULL,
          \`dados_originais\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_cliente_ano\` (\`cliente_id\`, \`ano\`),
          INDEX \`idx_codigo_sci_ano\` (\`codigo_sci\`, \`ano\`),
          INDEX \`idx_ano_mes\` (\`ano\`, \`mes\`),
          UNIQUE KEY \`uk_cliente_ano_mes\` (\`cliente_id\`, \`ano\`, \`mes\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;

      // Adicionar colunas se não existirem (migration)
      // Verificar se as colunas já existem antes de tentar adicionar
      try {
        const checkColumns = await this.executeCustomQuery<any>(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'irpf_faturamento_cache' 
            AND COLUMN_NAME IN ('valor_total', 'media_mensal')
        `);
        
        const existingColumns = (checkColumns.success && Array.isArray(checkColumns.data))
          ? checkColumns.data.map((row: any) => {
              const colName = row.COLUMN_NAME || row.column_name || row.COLUMN_NAME || '';
              return colName.toLowerCase();
            })
          : [];
        
        // Adicionar valor_total se não existir
        if (!existingColumns.includes('valor_total')) {
          const result = await this.executeCustomQuery(`
            ALTER TABLE \`irpf_faturamento_cache\` 
            ADD COLUMN \`valor_total\` DECIMAL(15, 2) DEFAULT NULL
          `);
          if (result.success) {
            console.log('[IRPF Cache] Coluna valor_total adicionada');
          } else if (result.error && (
            result.error.includes('Duplicate column name') || 
            result.error.includes('ER_DUP_FIELDNAME')
          )) {
            // Coluna já existe, tudo bem - pode ter sido adicionada entre a verificação e a execução
          }
        }
        
        // Adicionar media_mensal se não existir
        if (!existingColumns.includes('media_mensal')) {
          const result = await this.executeCustomQuery(`
            ALTER TABLE \`irpf_faturamento_cache\` 
            ADD COLUMN \`media_mensal\` DECIMAL(15, 2) DEFAULT NULL
          `);
          if (result.success) {
            console.log('[IRPF Cache] Coluna media_mensal adicionada');
          } else if (result.error && (
            result.error.includes('Duplicate column name') || 
            result.error.includes('ER_DUP_FIELDNAME')
          )) {
            // Coluna já existe, tudo bem - pode ter sido adicionada entre a verificação e a execução
          }
        }
      } catch (error: any) {
        // Ignorar erro se a coluna já existir (fallback)
        if (error.code === 'ER_DUP_FIELDNAME' || error.message?.includes('Duplicate column name')) {
          // Coluna já existe, tudo bem - não precisa fazer nada
        } else {
          console.warn('[IRPF Cache] Erro ao verificar/adicionar colunas:', error.message);
        }
      }

      await this.executeCustomQuery(createTableSQL);
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao criar tabela de cache',
      };
    }
  }

  /**
   * Salvar dados de faturamento no cache
   * @param valorTotal Valor total anual (opcional, para quando não há meses)
   * @param mediaMensal Média mensal (opcional, para quando não há meses)
   */
  async salvarFaturamento(
    clienteId: string,
    codigoSci: number,
    ano: number,
    meses: Array<{ mes: number; valor: number; dados?: any }>,
    valorTotal?: number,
    mediaMensal?: number
  ): Promise<ApiResponse<number>> {
    try {
      // Garantir que a tabela existe
      await this.ensureTable();

      let salvos = 0;

      // Se não há meses mas há valores totais, salvar em um registro especial (mes = 0)
      if (meses.length === 0 && (valorTotal !== undefined || mediaMensal !== undefined)) {
        const id = require('uuid').v4();
        const sql = `
          INSERT INTO \`irpf_faturamento_cache\` 
            (\`id\`, \`cliente_id\`, \`codigo_sci\`, \`ano\`, \`mes\`, \`valor\`, \`valor_total\`, \`media_mensal\`, \`dados_originais\`)
          VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL)
          ON DUPLICATE KEY UPDATE
            \`valor_total\` = VALUES(\`valor_total\`),
            \`media_mensal\` = VALUES(\`media_mensal\`),
            \`updated_at\` = CURRENT_TIMESTAMP
        `;

        await this.executeCustomQuery(sql, [
          id,
          clienteId,
          codigoSci,
          ano,
          valorTotal || 0,
          mediaMensal || 0,
        ]);

        salvos++;
      } else {
        // Salvar meses individuais
        for (const item of meses) {
          const id = require('uuid').v4();
          const sql = `
            INSERT INTO \`irpf_faturamento_cache\` 
              (\`id\`, \`cliente_id\`, \`codigo_sci\`, \`ano\`, \`mes\`, \`valor\`, \`dados_originais\`)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              \`valor\` = VALUES(\`valor\`),
              \`dados_originais\` = VALUES(\`dados_originais\`),
              \`updated_at\` = CURRENT_TIMESTAMP
          `;

          await this.executeCustomQuery(sql, [
            id,
            clienteId,
            codigoSci,
            ano,
            item.mes,
            item.valor || 0,
            item.dados ? JSON.stringify(item.dados) : null,
          ]);

          salvos++;
        }
      }

      return { success: true, data: salvos };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao salvar faturamento no cache',
      };
    }
  }

  /**
   * Buscar faturamento do cache
   */
  async buscarFaturamento(
    clienteId: string,
    anos: number[]
  ): Promise<ApiResponse<Array<{ ano: number; meses: Array<{ mes: number; valor: number }>; valorTotal?: number; mediaMensal?: number }>>> {
    try {
      await this.ensureTable();

      const placeholders = anos.map(() => '?').join(',');
      const sql = `
        SELECT \`ano\`, \`mes\`, \`valor\`, \`valor_total\`, \`media_mensal\`
        FROM \`irpf_faturamento_cache\`
        WHERE \`cliente_id\` = ? AND \`ano\` IN (${placeholders})
        ORDER BY \`ano\` ASC, \`mes\` ASC
      `;

      const result = await this.executeCustomQuery<any>(sql, [clienteId, ...anos]);

      if (!result.success || !Array.isArray(result.data)) {
        return { success: true, data: [] };
      }

      // Agrupar por ano
      const porAno = new Map<number, { meses: Array<{ mes: number; valor: number }>; valorTotal?: number; mediaMensal?: number }>();

      for (const row of result.data) {
        const ano = row.ano;
        if (!porAno.has(ano)) {
          porAno.set(ano, { meses: [] });
        }
        
        const dadosAno = porAno.get(ano)!;
        
        // Se mes = 0, é um registro de totais
        if (row.mes === 0) {
          dadosAno.valorTotal = parseFloat(String(row.valor_total || 0));
          dadosAno.mediaMensal = parseFloat(String(row.media_mensal || 0));
        } else {
          // Meses individuais
          dadosAno.meses.push({
            mes: row.mes,
            valor: parseFloat(String(row.valor || 0)),
          });
        }
      }

      const resultado = Array.from(porAno.entries()).map(([ano, dados]) => ({
        ano,
        meses: dados.meses,
        valorTotal: dados.valorTotal,
        mediaMensal: dados.mediaMensal,
      }));

      return { success: true, data: resultado };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar faturamento do cache',
      };
    }
  }

  /**
   * Limpar cache antigo (opcional - para manutenção)
   */
  async limparCacheAntigo(dias: number = 30): Promise<ApiResponse<number>> {
    try {
      await this.ensureTable();

      const sql = `
        DELETE FROM \`irpf_faturamento_cache\`
        WHERE \`updated_at\` < DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      // Para DELETE, precisamos usar a conexão diretamente para obter affectedRows
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
        error: error instanceof Error ? error.message : 'Erro ao limpar cache',
      };
    }
  }

  /**
   * Verificar se cache está atualizado (última atualização há menos de X horas)
   */
  async cacheAtualizado(
    clienteId: string,
    ano: number,
    horas: number = 24
  ): Promise<ApiResponse<boolean>> {
    try {
      await this.ensureTable();

      const sql = `
        SELECT COUNT(*) as count
        FROM \`irpf_faturamento_cache\`
        WHERE \`cliente_id\` = ? 
          AND \`ano\` = ?
          AND \`updated_at\` >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      `;

      const result = await this.executeCustomQuery<any>(sql, [clienteId, ano, horas]);

      if (!result.success || !result.data || result.data.length === 0) {
        return { success: true, data: false };
      }

      return { success: true, data: (result.data[0]?.count || 0) > 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao verificar cache',
        data: false,
      };
    }
  }

  /**
   * Top empresas por faturamento anual (para dashboard)
   * Usa irpf_faturamento_cache: soma valor dos meses ou valor_total quando mes = 0.
   */
  async buscarTopPorAno(
    ano: number,
    limit: number = 10
  ): Promise<ApiResponse<Array<{ clientId: string; businessName: string; cnpj: string; faturamento: number }>>> {
    try {
      await this.ensureTable();

      const sql = `
        SELECT
          c.id AS clientId,
          c.razao_social AS businessName,
          c.cnpj_limpo AS cnpj,
          COALESCE(SUM(
            CASE
              WHEN f.mes = 0 THEN COALESCE(f.valor_total, 0)
              ELSE f.valor
            END
          ), 0) AS faturamento
        FROM \`irpf_faturamento_cache\` f
        INNER JOIN \`clientes\` c ON c.id = f.cliente_id
        WHERE f.ano = ?
        GROUP BY f.cliente_id, c.id, c.razao_social, c.cnpj_limpo
        HAVING faturamento > 0
        ORDER BY faturamento DESC
        LIMIT ?
      `;

      const result = await this.executeCustomQuery<any>(sql, [ano, limit]);

      if (!result.success || !Array.isArray(result.data)) {
        return { success: true, data: [] };
      }

      const data = result.data.map((row: Record<string, unknown>) => {
        const r = row as Record<string, unknown>;
        return {
          clientId: String(r.clientId ?? r.clientid ?? ''),
          businessName: String(r.businessName ?? r.businessname ?? ''),
          cnpj: String(r.cnpj ?? ''),
          faturamento: Number(r.faturamento ?? 0),
        };
      });

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar top faturamento',
        data: [],
      };
    }
  }
}

