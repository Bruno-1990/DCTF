/**
 * Modelo BeneficioCompete - Benefícios fiscais Compete importados de planilha
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IBeneficioCompete {
  id?: number;
  razao_social: string;
  inscricao_estadual: string | null;
  cnpj: string;
  municipio: string | null;
  portaria_inclusao: string | null;
  data_portaria: string | null;
  portaria_exclusao: string | null;
  data_portaria_exclusao: string | null;
  contrato: string | null;
  processo: string | null;
  processo_inclusao: string | null;
  processo_exclusao: string | null;
  data_inicio: string | null;
  data_final: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface IComparacaoCompete {
  cnpj: string;
  razao_social: string;
  beneficio_sistema: string | null;
  beneficio_planilha: string | null;
}

const TABLE_NAME = 'beneficio_compete';
const VIEW_NAME = 'vw_comparacao_compete';

export class BeneficioCompete extends DatabaseService<IBeneficioCompete> {
  constructor() {
    super(TABLE_NAME);
    this.ensureTableExists().catch(() => {});
  }

  private async ensureTableExists(): Promise<void> {
    try {
      const { mysqlPool } = await import('../config/mysql');
      const [rows] = await mysqlPool.query<any[]>(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [TABLE_NAME]
      );
      if (rows[0]?.count > 0) return;

      console.log(`[BENEFICIO_COMPETE] Criando tabela ${TABLE_NAME}...`);
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          razao_social VARCHAR(255) NOT NULL,
          inscricao_estadual VARCHAR(50) NULL,
          cnpj VARCHAR(20) NOT NULL,
          municipio VARCHAR(255) NULL,
          portaria_inclusao VARCHAR(100) NULL,
          data_portaria DATE NULL,
          portaria_exclusao VARCHAR(100) NULL,
          data_portaria_exclusao DATE NULL,
          contrato VARCHAR(255) NULL,
          processo VARCHAR(100) NULL,
          processo_inclusao VARCHAR(100) NULL,
          processo_exclusao VARCHAR(100) NULL,
          data_inicio DATE NULL,
          data_final DATE NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_bc_cnpj (cnpj)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log(`[BENEFICIO_COMPETE] ✅ Tabela criada.`);
    } catch (err: any) {
      console.warn('[BENEFICIO_COMPETE] ensureTable:', err.message);
    }
  }

  async importarLote(registros: Omit<IBeneficioCompete, 'id' | 'created_at' | 'updated_at'>[]): Promise<ApiResponse<{ importados: number }>> {
    if (registros.length === 0) {
      return { success: true, data: { importados: 0 } };
    }

    try {
      const { mysqlPool } = await import('../config/mysql');

      const cols = [
        'razao_social', 'inscricao_estadual', 'cnpj', 'municipio',
        'portaria_inclusao', 'data_portaria', 'portaria_exclusao', 'data_portaria_exclusao',
        'contrato', 'processo', 'processo_inclusao', 'processo_exclusao',
        'data_inicio', 'data_final',
      ];

      const BATCH = 200;
      let total = 0;

      for (let i = 0; i < registros.length; i += BATCH) {
        const batch = registros.slice(i, i + BATCH);
        const placeholders = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
        const values = batch.flatMap(r => [
          r.razao_social, r.inscricao_estadual, r.cnpj, r.municipio,
          r.portaria_inclusao, r.data_portaria, r.portaria_exclusao, r.data_portaria_exclusao,
          r.contrato, r.processo, r.processo_inclusao, r.processo_exclusao,
          r.data_inicio, r.data_final,
        ]);

        await mysqlPool.query(`INSERT INTO ${TABLE_NAME} (${cols.join(',')}) VALUES ${placeholders}`, values);
        total += batch.length;
      }

      return { success: true, data: { importados: total } };
    } catch (error: any) {
      return { success: false, error: error.message || 'Erro ao importar lote' };
    }
  }

  async limparTudo(): Promise<ApiResponse<boolean>> {
    try {
      const { mysqlPool } = await import('../config/mysql');
      await mysqlPool.query(`TRUNCATE TABLE ${TABLE_NAME}`);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Erro ao limpar tabela' };
    }
  }

  async listarComparacao(page = 1, limit = 50, busca?: string): Promise<{
    items: IComparacaoCompete[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { mysqlPool } = await import('../config/mysql');
    const offset = (page - 1) * limit;

    // Garantir que a VIEW existe
    try {
      await mysqlPool.query(`
        CREATE OR REPLACE VIEW ${VIEW_NAME} AS
        SELECT
          c.cnpj_limpo AS cnpj,
          c.razao_social,
          c.beneficios_fiscais AS beneficio_sistema,
          GROUP_CONCAT(DISTINCT bc.contrato ORDER BY bc.contrato SEPARATOR ', ') AS beneficio_planilha
        FROM clientes c
        INNER JOIN ${TABLE_NAME} bc
          ON c.cnpj_limpo = REPLACE(REPLACE(REPLACE(bc.cnpj, '.', ''), '/', ''), '-', '')
        GROUP BY c.cnpj_limpo, c.razao_social, c.beneficios_fiscais
      `);
    } catch (err: any) {
      console.warn('[BENEFICIO_COMPETE] Erro ao criar VIEW:', err.message);
    }

    let where = '';
    const params: any[] = [];
    if (busca) {
      where = `WHERE razao_social LIKE ? OR cnpj LIKE ?`;
      const like = `%${busca}%`;
      params.push(like, like);
    }

    const [countRows] = await mysqlPool.query<any[]>(`SELECT COUNT(*) as total FROM ${VIEW_NAME} ${where}`, params);
    const total = countRows[0]?.total || 0;

    const [dataRows] = await mysqlPool.query<any[]>(
      `SELECT * FROM ${VIEW_NAME} ${where} ORDER BY razao_social ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: dataRows as IComparacaoCompete[],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
