/**
 * Transformações puras usadas pelo OneClickService ao ler o OneClick de PROD
 * (PostgreSQL `public.clientes` na VPS) e adaptar para o contrato `OneClickCliente`
 * (nomes `cad_cli_*`), preservando controller e Cliente.sincronizarComOneClick.
 *
 * Ver docs/plano-sync-oneclick-v2.md.
 */

import type { OneClickCliente } from './OneClickService';

/** Linha crua vinda de `public.clientes` (só as colunas usadas na sincronização). */
export interface ClienteProdRow {
  id: string;
  documento: string;
  razao_social: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  complemento: string | null;
  tributacao: string | null; // enum TaxRegime do OneClick
}

/**
 * Converte o enum `tributacao` (TaxRegime) para o código inteiro que o
 * `regimeMap` já existente em Cliente.sincronizarComOneClick espera
 * ({1:'LUCRO PRESUMIDO', 2:'LUCRO REAL', 4:'SIMPLES NACIONAL', 5:'SIMPLES NACIONAL'}).
 * Assim o downstream não precisa mudar. IMUNE/ISENTA não têm equivalente no
 * legado → null (não sobrescreve o regime; upsert é não-destrutivo).
 */
export function mapTributacaoToRegimeCode(tributacao: string | null): number | null {
  switch (tributacao) {
    case 'LUCRO_PRESUMIDO':
      return 1;
    case 'LUCRO_REAL':
      return 2;
    case 'SIMPLES_NACIONAL':
      return 4;
    case 'MEI':
      return 5;
    default:
      // IMUNE, ISENTA, null, vazio, desconhecido
      return null;
  }
}

/** Mapeia uma linha de `public.clientes` para o shape `OneClickCliente` (cad_cli_*). */
export function mapClienteRowToOneClick(row: ClienteProdRow): OneClickCliente {
  return {
    id: row.id,
    cad_cli_cnpj: row.documento,
    cad_cli_razao: row.razao_social,
    cad_cli_email: row.email,
    cad_cli_tel: row.telefone,
    cad_cli_end: row.logradouro,
    cad_cli_num: row.numero,
    cad_cli_bairro: row.bairro,
    cad_cli_cidade: row.cidade,
    cad_cli_estado: row.uf,
    cad_cli_cep: row.cep,
    cad_cli_complemento: row.complemento,
    cad_cli_regime: mapTributacaoToRegimeCode(row.tributacao),
  };
}

/** Colunas selecionadas de `public.clientes` (ordem casa com ClienteProdRow). */
export const SELECT_CLIENTE_COLUMNS = `
  id, documento, razao_social, email, telefone,
  logradouro, numero, bairro, cidade, uf, cep, complemento, tributacao
`;

/**
 * Tenant da Central Contábil em `public.clientes.empresa_id`.
 * O OneClick de prod é multi-tenant por coluna (não por schema): além da Central
 * convivem ali `jrg-empresa` (escritório de Brasília/GO) e um tenant de demo.
 * Sem este filtro o preview do OneClick trazia os ~950 mensais/ativos dos três
 * juntos, em vez dos ~470 da Central. Confirmado empiricamente em 2026-08-18:
 * 217 dos 220 clientes já cadastrados no DCTF pertencem a este empresa_id.
 */
export const EMPRESA_ID_CENTRAL = 'cmnn7xm6e00009gqgoii3ims2';

/** Tenant efetivo (override por env para outros ambientes/escritórios). */
export function getEmpresaId(): string {
  return process.env['ONECLICK_EMPRESA_ID'] || EMPRESA_ID_CENTRAL;
}

/**
 * Filtro "Mensais/Ativos" acordado: só MENSAL + ATIVA + CNPJ, sem soft-delete,
 * com documento preenchido. NÃO inclui inativos. (Filtro de área desligado por ora.)
 * `$1` = empresa_id (tenant) — ver `getEmpresaId()`.
 */
/**
 * Normaliza CNPJ para 14 dígitos. `documento` vem misto no OneClick
 * (`04.900.790/0001-12` e `37511891000150` convivem na mesma coluna).
 */
export function somenteDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Filtro "cliente inativo" — MESMA regra que o próprio OneClick usa na tela.
 * Espelha `apps/api/src/cliente/cliente.service.ts` (opção "Inativo" do filtro
 * "Cliente Ativo / Inativo"), que trata como inativo tanto `status='INATIVA'`
 * quanto o que está na lixeira (`deleted_at` preenchido).
 *
 * Não usar `is_active`: naquele banco a coluna acompanha o soft-delete, não o
 * filtro da tela, e sozinha não reproduz o que o usuário vê no OneClick.
 *
 * `$1` = empresa_id (tenant) — ver `getEmpresaId()`.
 */
export const INATIVOS_WHERE = `
  empresa_id = $1
  AND tipo_documento = 'CNPJ'
  AND documento IS NOT NULL
  AND btrim(documento) <> ''
  AND (status = 'INATIVA' OR deleted_at IS NOT NULL)
`;

export const MENSAIS_ATIVOS_WHERE = `
  empresa_id = $1
  AND situacao = 'MENSAL'
  AND status = 'ATIVA'
  AND tipo_documento = 'CNPJ'
  AND deleted_at IS NULL
  AND documento IS NOT NULL
  AND btrim(documento) <> ''
`;
