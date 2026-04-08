/**
 * Serviço de leitura (read-only) do banco OneClick (db_intranet).
 * Retorna clientes Mensais e Ativos para sincronização com DCTF_WEB.
 */

import { getOneClickPool } from '../config/oneclick';

export interface OneClickCliente {
  id: number;
  cad_cli_cnpj: string;
  cad_cli_razao: string | null;
  cad_cli_email: string | null;
  cad_cli_tel: string | null;
  cad_cli_end: string | null;
  cad_cli_num: string | null;
  cad_cli_bairro: string | null;
  cad_cli_cidade: string | null;
  cad_cli_estado: string | null;
  cad_cli_cep: string | null;
  cad_cli_complemento: string | null;
  cad_cli_regime: number | null;
}

export class OneClickService {
  /**
   * Busca clientes Mensais (situacao=2) e Ativos (ativo=1) no OneClick.
   * Somente leitura — nenhuma escrita é feita no banco externo.
   */
  async buscarClientesMensaisAtivos(): Promise<OneClickCliente[]> {
    const pool = getOneClickPool();
    const [rows] = await pool.query<any[]>(
      `SELECT id, cad_cli_cnpj, cad_cli_razao, cad_cli_email, cad_cli_tel,
              cad_cli_end, cad_cli_num, cad_cli_bairro, cad_cli_cidade,
              cad_cli_estado, cad_cli_cep, cad_cli_complemento, cad_cli_regime
       FROM ger_cad_cli
       WHERE cad_cli_situacao = 2
         AND cad_cli_ativo = 1
         AND cad_cli_cnpj IS NOT NULL
         AND TRIM(cad_cli_cnpj) != ''
         AND cad_cli_cnpj != '00.000.000/0000-00'
       ORDER BY cad_cli_razao ASC`
    );
    return rows as OneClickCliente[];
  }

  /**
   * Busca benefícios fiscais ativos para uma lista de IDs de clientes.
   * Retorna Map<id_cliente, string[]> com os nomes dos benefícios.
   */
  async buscarBeneficiosPorClienteIds(ids: number[]): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (ids.length === 0) return map;

    const pool = getOneClickPool();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query<any[]>(
      `SELECT b.id_cliente, cb.beneficio
       FROM cad_cli_bnf b
       JOIN cad_cli_beneficios cb ON cb.id = b.id_beneficio
       WHERE b.id_cliente IN (${placeholders}) AND b.ativo = 1
       ORDER BY b.id_cliente, cb.beneficio`,
      ids
    );

    for (const row of rows as any[]) {
      const id = Number(row.id_cliente);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row.beneficio as string);
    }

    return map;
  }

  /**
   * Busca clientes por IDs específicos.
   */
  async buscarClientesPorIds(ids: number[]): Promise<OneClickCliente[]> {
    if (ids.length === 0) return [];
    const pool = getOneClickPool();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query<any[]>(
      `SELECT id, cad_cli_cnpj, cad_cli_razao, cad_cli_email, cad_cli_tel,
              cad_cli_end, cad_cli_num, cad_cli_bairro, cad_cli_cidade,
              cad_cli_estado, cad_cli_cep, cad_cli_complemento, cad_cli_regime
       FROM ger_cad_cli
       WHERE id IN (${placeholders})`,
      ids
    );
    return rows as OneClickCliente[];
  }
}
