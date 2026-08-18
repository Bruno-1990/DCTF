/**
 * Transformações puras usadas pelo AcessoriasService ao ler a carteira do
 * Sistema Acessórias (`GET /companies/ListAll?Pagina=N`) e adaptá-la ao cadastro
 * de clientes do DCTF.
 *
 * A Acessórias devolve bem menos campos que o OneClick — não há endereço, e-mail
 * nem regime tributário. O que ela traz de próprio é a carteira de obrigações de
 * verdade (quem é cliente ativo hoje), além de honorário e data de início.
 * O cadastro fica incompleto de propósito: quem completa é a ReceitaWS, que já
 * roda na varredura cadastral (ver COTA_REFRESH_CADASTRO).
 */

/** Linha crua de `GET /companies/ListAll`. Todos os campos vêm como string. */
export interface AcessoriasEmpresaRow {
  ID: string;
  /** CNPJ (ou CPF) formatado, ex.: "42.081.159/0001-28". */
  Identificador: string;
  Razao: string | null;
  Fantasia: string | null;
  /** "Ativa" | "Inativa". */
  Status: string | null;
  Telefone: string | null;
  UF: string | null;
  /** Datas vêm como "0000-00-00" quando não preenchidas. */
  ClienteDesde: string | null;
  ClienteAte: string | null;
  DataDoCadastro: string | null;
  Honorario: string | null;
}

/** Shape normalizado consumido pelo controller e pelo model. */
export interface AcessoriasEmpresa {
  id: string;
  cnpj: string;
  cnpj_limpo: string;
  razao_social: string | null;
  fantasia: string | null;
  status: string | null;
  telefone: string | null;
  uf: string | null;
  cliente_desde: string | null;
  honorario: number | null;
}

/** Status que conta como carteira ativa (análogo ao "Mensais + Ativos" do OneClick). */
export const STATUS_ATIVA = 'Ativa';

/** Remove tudo que não é dígito. */
export function limparDocumento(documento: string | null | undefined): string {
  return String(documento || '').replace(/\D/g, '');
}

/** Só CNPJ entra no DCTF (que é por CNPJ) — CPF e documento truncado ficam de fora. */
export function isCnpjValido(documento: string | null | undefined): boolean {
  return limparDocumento(documento).length === 14;
}

/**
 * Datas nulas chegam como "0000-00-00" — vira null para não gravar data inválida.
 */
export function normalizarData(valor: string | null | undefined): string | null {
  const v = String(valor || '').trim();
  if (!v || /^0{4}-0{2}-0{2}$/.test(v)) return null;
  return v;
}

/** "0.00" → 0; vazio/inválido → null. */
export function normalizarHonorario(valor: string | null | undefined): number | null {
  const v = String(valor ?? '').trim();
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Mapeia uma linha crua da Acessórias para o shape normalizado. */
export function mapEmpresaRow(row: AcessoriasEmpresaRow): AcessoriasEmpresa {
  return {
    id: String(row.ID),
    cnpj: row.Identificador,
    cnpj_limpo: limparDocumento(row.Identificador),
    razao_social: row.Razao || null,
    fantasia: row.Fantasia || null,
    status: row.Status || null,
    telefone: row.Telefone || null,
    uf: row.UF ? row.UF.toUpperCase() : null,
    cliente_desde: normalizarData(row.ClienteDesde),
    honorario: normalizarHonorario(row.Honorario),
  };
}

/** Só empresas ATIVAS e com CNPJ de 14 dígitos entram na sincronização. */
export function isSincronizavel(empresa: AcessoriasEmpresa): boolean {
  return empresa.status === STATUS_ATIVA && empresa.cnpj_limpo.length === 14;
}

/**
 * Campos que a Acessórias sabe preencher no cadastro do DCTF.
 * O upsert é não-destrutivo: só preenche o que estiver vazio no DCTF.
 */
export function camposParaCadastro(empresa: AcessoriasEmpresa): Record<string, unknown> {
  return {
    razao_social: empresa.razao_social,
    fantasia: empresa.fantasia,
    telefone: empresa.telefone,
    uf: empresa.uf,
  };
}
