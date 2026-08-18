/**
 * Serviço de leitura (read-only) do OneClick de PRODUÇÃO (PostgreSQL na VPS).
 * Banco `oneclick`, schema `public`, tabela `public.clientes`.
 * Retorna clientes Mensais e Ativos para sincronização com o DCTF_WEB.
 *
 * O shape `OneClickCliente` (campos `cad_cli_*`) é mantido de propósito: o
 * controller (previewOneClick) e o Cliente.sincronizarComOneClick continuam
 * consumindo o mesmo contrato, então a lógica de importação não muda —
 * só a fonte dos dados (antes: MySQL v1 `ger_cad_cli`; agora: PG prod `clientes`).
 * Ver docs/plano-sync-oneclick-v2.md.
 */

import { getOneClickPool } from '../config/oneclick';
import {
  mapClienteRowToOneClick,
  SELECT_CLIENTE_COLUMNS,
  MENSAIS_ATIVOS_WHERE,
  getEmpresaId,
  type ClienteProdRow,
} from './oneclick.mappers';

export interface OneClickCliente {
  id: string; // cuid do OneClick de prod (public.clientes.id)
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
   * Busca clientes Mensais (situacao='MENSAL') e Ativos (status='ATIVA') da
   * Central Contábil (empresa_id) no OneClick. O banco é multi-tenant por
   * coluna, então sem o filtro de tenant vinham também os clientes do JRG.
   * Somente leitura — nenhuma escrita é feita no banco externo.
   */
  async buscarClientesMensaisAtivos(): Promise<OneClickCliente[]> {
    const pool = getOneClickPool();
    const { rows } = await pool.query<ClienteProdRow>(
      `SELECT ${SELECT_CLIENTE_COLUMNS}
       FROM public.clientes
       WHERE ${MENSAIS_ATIVOS_WHERE}
       ORDER BY razao_social ASC`,
      [getEmpresaId()],
    );
    return rows.map(mapClienteRowToOneClick);
  }

  /**
   * Busca benefícios fiscais por cliente. O OneClick de prod ainda não popula
   * `cliente_beneficios` (0 linhas) — retorna mapa vazio (no-op). Assinatura e
   * tipo de retorno mantidos para não alterar controller/model.
   * TODO: quando `public.cliente_beneficios` for populado, buscar por cliente_id.
   */
  async buscarBeneficiosPorClienteIds(_ids: string[]): Promise<Map<number, string[]>> {
    return new Map<number, string[]>();
  }

  /**
   * Busca clientes por IDs específicos (cuid do prod). Usado na importação seletiva.
   * Mantém o filtro de tenant: um id de outro escritório não deve ser importável
   * nem que chegue no corpo da requisição.
   */
  async buscarClientesPorIds(ids: string[]): Promise<OneClickCliente[]> {
    if (ids.length === 0) return [];
    const pool = getOneClickPool();
    const { rows } = await pool.query<ClienteProdRow>(
      `SELECT ${SELECT_CLIENTE_COLUMNS}
       FROM public.clientes
       WHERE id = ANY($1::text[])
         AND empresa_id = $2`,
      [ids, getEmpresaId()],
    );
    return rows.map(mapClienteRowToOneClick);
  }
}
