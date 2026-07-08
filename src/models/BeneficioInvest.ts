/**
 * Modelo BeneficioInvest - Benefícios fiscais Invest importados de planilha
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface IBeneficioInvest {
  id?: number;
  numero: string | null;
  data_cadastro: string | null;
  processo: string | null;
  ementa: string | null;
  base_legal: string | null;
  tipo: string | null;
  cnpj: string;
  inscricao_estadual: string | null;
  razao_social: string;
  municipio: string | null;
  situacao: string | null;
  data_assinatura: string | null;
  data_publicacao_dio: string | null;
  data_inicio_vigencia: string | null;
  data_final_vigencia: string | null;
  data_prorrogacao: string | null;
  data_cancelamento: string | null;
  data_suspensao: string | null;
  data_revogacao: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface IComparacaoInvest {
  cnpj: string;
  razao_social: string;
  beneficio_sistema: string | null;
  beneficio_planilha: string | null;
}

const TABLE_NAME = 'beneficio_invest';
const VIEW_NAME = 'vw_comparacao_invest';

export class BeneficioInvest extends DatabaseService<IBeneficioInvest> {
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
      if (rows[0]?.count > 0) {
        // Verificar se a tabela tem as colunas corretas (TEXT), senão recriar
        const [colRows] = await mysqlPool.query<any[]>(
          `SELECT DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'numero'`,
          [TABLE_NAME]
        );
        if (colRows[0]?.DATA_TYPE === 'text') return; // já está ok
        console.log(`[BENEFICIO_INVEST] Recriando tabela com colunas TEXT...`);
        await mysqlPool.query(`DROP TABLE ${TABLE_NAME}`);
      }

      console.log(`[BENEFICIO_INVEST] Criando tabela ${TABLE_NAME}...`);
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          numero TEXT NULL,
          data_cadastro TEXT NULL,
          processo TEXT NULL,
          ementa TEXT NULL,
          base_legal TEXT NULL,
          tipo TEXT NULL,
          cnpj VARCHAR(20) NOT NULL,
          inscricao_estadual VARCHAR(100) NULL,
          razao_social VARCHAR(255) NOT NULL,
          municipio VARCHAR(255) NULL,
          situacao VARCHAR(255) NULL,
          data_assinatura TEXT NULL,
          data_publicacao_dio TEXT NULL,
          data_inicio_vigencia TEXT NULL,
          data_final_vigencia TEXT NULL,
          data_prorrogacao TEXT NULL,
          data_cancelamento TEXT NULL,
          data_suspensao TEXT NULL,
          data_revogacao TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_bi_cnpj (cnpj)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log(`[BENEFICIO_INVEST] ✅ Tabela criada.`);
    } catch (err: any) {
      console.warn('[BENEFICIO_INVEST] ensureTable:', err.message);
    }
  }

  async importarLote(registros: Omit<IBeneficioInvest, 'id' | 'created_at' | 'updated_at'>[]): Promise<ApiResponse<{ importados: number }>> {
    if (registros.length === 0) {
      return { success: true, data: { importados: 0 } };
    }

    try {
      const { mysqlPool } = await import('../config/mysql');

      const cols = [
        'numero', 'data_cadastro', 'processo', 'ementa', 'base_legal', 'tipo',
        'cnpj', 'inscricao_estadual', 'razao_social', 'municipio', 'situacao',
        'data_assinatura', 'data_publicacao_dio', 'data_inicio_vigencia', 'data_final_vigencia',
        'data_prorrogacao', 'data_cancelamento', 'data_suspensao', 'data_revogacao',
      ];

      const BATCH = 100;
      let total = 0;

      for (let i = 0; i < registros.length; i += BATCH) {
        const batch = registros.slice(i, i + BATCH);
        const placeholders = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
        const values = batch.flatMap(r => [
          r.numero, r.data_cadastro, r.processo, r.ementa, r.base_legal, r.tipo,
          r.cnpj, r.inscricao_estadual, r.razao_social, r.municipio, r.situacao,
          r.data_assinatura, r.data_publicacao_dio, r.data_inicio_vigencia, r.data_final_vigencia,
          r.data_prorrogacao, r.data_cancelamento, r.data_suspensao, r.data_revogacao,
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
    items: IComparacaoInvest[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { mysqlPool } = await import('../config/mysql');
    const offset = (page - 1) * limit;

    try {
      await mysqlPool.query(`
        CREATE OR REPLACE VIEW ${VIEW_NAME} AS
        SELECT
          c.cnpj_limpo AS cnpj,
          c.razao_social,
          c.beneficios_fiscais AS beneficio_sistema,
          GROUP_CONCAT(DISTINCT CASE WHEN bi.situacao = 'Ativo' THEN 'INVEST' ELSE bi.situacao END ORDER BY bi.situacao SEPARATOR ', ') AS beneficio_planilha
        FROM clientes c
        INNER JOIN ${TABLE_NAME} bi
          ON c.cnpj_limpo = REPLACE(REPLACE(REPLACE(bi.cnpj, '.', ''), '/', ''), '-', '')
        GROUP BY c.cnpj_limpo, c.razao_social, c.beneficios_fiscais
      `);
    } catch (err: any) {
      console.warn('[BENEFICIO_INVEST] Erro ao criar VIEW:', err.message);
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
      items: dataRows as IComparacaoInvest[],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
