/**
 * MÓDULO: DCTFs Em Andamento
 *
 * Objetivo: Listar todas as DCTFs com situação "Em andamento" (uma linha por declaração).
 *
 * Fonte de dados: MySQL (tabela dctf_declaracoes)
 */

import { executeQuery } from '../../../config/mysql';
import { formatarCNPJ } from '../utils/cnpjUtils';

const SITUACAO_EM_ANDAMENTO = 'Em andamento';

export interface DCTFEmAndamento {
  id: string;
  cnpj: string;
  razao_social: string | null;
  periodo_apuracao: string;
  situacao: string | null;
  tipo: string | null;
  data_transmissao: string | null;
}

/**
 * Lista todas as DCTFs em situação "Em andamento" (uma linha por declaração)
 */
export async function listarDCTFsEmAndamento(): Promise<DCTFEmAndamento[]> {
  try {
    console.log('[Conferência - Em Andamento] 🔍 Iniciando análise...');

    const rows = await executeQuery<{
      id: string;
      cnpj: string;
      razao_social: string | null;
      periodo_apuracao: string | null;
      situacao: string | null;
      tipo: string | null;
      data_transmissao: string | null;
    }>(
      `
      SELECT 
        d.id,
        d.cnpj,
        c.razao_social,
        d.periodo_apuracao,
        COALESCE(d.situacao, d.status) AS situacao,
        d.tipo,
        d.data_transmissao
      FROM dctf_declaracoes d
      LEFT JOIN clientes c ON REPLACE(REPLACE(REPLACE(COALESCE(c.cnpj_limpo, ''), '.', ''), '/', ''), '-', '') = REPLACE(REPLACE(REPLACE(COALESCE(d.cnpj, ''), '.', ''), '/', ''), '-', '')
      WHERE (d.situacao = ? OR d.status = ?)
        AND d.cnpj IS NOT NULL
        AND TRIM(d.cnpj) != ''
      ORDER BY d.cnpj, d.periodo_apuracao
      `,
      [SITUACAO_EM_ANDAMENTO, SITUACAO_EM_ANDAMENTO]
    );

    const dctfs: DCTFEmAndamento[] = rows.map((row) => ({
      id: row.id,
      cnpj: formatarCNPJ(row.cnpj),
      razao_social: row.razao_social,
      periodo_apuracao: row.periodo_apuracao || '—',
      situacao: row.situacao,
      tipo: row.tipo,
      data_transmissao: row.data_transmissao,
    }));

    console.log(`[Conferência - Em Andamento] 📊 DCTFs em andamento: ${dctfs.length}`);

    return dctfs;
  } catch (error: any) {
    console.error('[Conferência - Em Andamento] ❌ Erro:', error);
    throw error;
  }
}
