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
  INATIVOS_WHERE,
  somenteDigitos,
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
  /**
   * CNPJs que o OneClick considera INATIVOS (status INATIVA ou na lixeira).
   *
   * Um mesmo CNPJ pode ter várias linhas no OneClick (ex.: cadastro vivo +
   * duplicata mandada pra lixeira). Por isso a decisão não pode sair de uma
   * linha isolada: só é inativo o CNPJ que NÃO tem nenhuma linha viva. Sem
   * isso, um cliente ativo com uma duplicata na lixeira seria inativado aqui.
   *
   * Somente leitura — nada é escrito no OneClick.
   */
  async buscarCnpjsInativos(): Promise<Map<string, { razaoSocial: string; situacao: string; status: string; naLixeira: boolean }>> {
    const pool = getOneClickPool();
    const empresaId = getEmpresaId();

    const { rows: inativos } = await pool.query<{
      documento: string; razao_social: string; situacao: string; status: string; deleted_at: Date | null;
    }>(
      `SELECT documento, razao_social, situacao::text AS situacao, status::text AS status, deleted_at
       FROM public.clientes
       WHERE ${INATIVOS_WHERE}`,
      [empresaId],
    );

    // CNPJs com ao menos uma linha viva não entram, mesmo tendo linhas inativas.
    const { rows: vivos } = await pool.query<{ documento: string }>(
      `SELECT documento
       FROM public.clientes
       WHERE empresa_id = $1
         AND tipo_documento = 'CNPJ'
         AND status <> 'INATIVA'
         AND deleted_at IS NULL`,
      [empresaId],
    );
    const cnpjsVivos = new Set(vivos.map((r) => somenteDigitos(r.documento)));

    const mapa = new Map<string, { razaoSocial: string; situacao: string; status: string; naLixeira: boolean }>();
    for (const row of inativos) {
      const cnpj = somenteDigitos(row.documento);
      if (!cnpj || cnpjsVivos.has(cnpj) || mapa.has(cnpj)) continue;
      mapa.set(cnpj, {
        razaoSocial: row.razao_social,
        situacao: row.situacao,
        status: row.status,
        naLixeira: row.deleted_at !== null,
      });
    }
    return mapa;
  }

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
