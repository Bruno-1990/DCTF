/**
 * Naturezas jurídicas que podem ter Capital Social zerado (Tabela de Natureza Jurídica da RFB).
 * Para elas, capital zero e sócio sem valor de participação NÃO são erro: a empresa está enquadrada.
 *
 * - Grupo 1 (Administração Pública), 3 (Entidades sem fins lucrativos), 4 (Pessoas físicas com CNPJ)
 *   e 5 (Organizações internacionais): todas.
 * - Grupo 2 (Entidades empresariais): só as específicas abaixo. Ltda, S.A., Sociedade Simples etc.
 *   continuam exigindo capital.
 *
 * Para incluir outra natureza, acrescente o código (4 dígitos, sem traço) em GRUPO_2_SEM_CAPITAL.
 */
const GRUPO_2_SEM_CAPITAL: Record<string, string> = {
  '2127': 'Sociedade em Conta de Participação',
  '2135': 'Empresário (Individual)',
  '2151': 'Consórcio de Sociedades',
  '2160': 'Grupo de Sociedades',
  '2178': 'Estabelecimento, no Brasil, de Sociedade Estrangeira',
  '2194': 'Estabelecimento, no Brasil, de Empresa Binacional Argentino-Brasileira',
  '2216': 'Empresa Domiciliada no Exterior',
  '2224': 'Clube/Fundo de Investimento',
  '2283': 'Consórcio de Empregadores',
  '2291': 'Consórcio Simples',
  '2348': 'Empresa Simples de Inovação - Inova Simples',
  '2356': 'Investidor Não Residente',
};

const GRUPOS_SEM_CAPITAL = new Set(['1', '3', '4', '5']);

/** "215-1 - Consórcio de Sociedades" | "2151" | "215-1" → "2151". */
export function codigoNaturezaJuridica(natureza: unknown): string | null {
  const m = String(natureza ?? '').match(/^\s*(\d{3})-?(\d)/);
  return m ? m[1] + m[2] : null;
}

/** A natureza jurídica permite Capital Social zerado? */
export function naturezaPermiteCapitalZerado(natureza: unknown): boolean {
  const codigo = codigoNaturezaJuridica(natureza);
  if (!codigo) return false;
  return GRUPOS_SEM_CAPITAL.has(codigo[0]) || codigo in GRUPO_2_SEM_CAPITAL;
}

const capitalNumero = (capital: unknown): number => {
  if (capital === null || capital === undefined || capital === '') return 0;
  const n = typeof capital === 'number' ? capital : parseFloat(String(capital).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Capital zerado que está enquadrado: natureza que permite e capital 0/vazio.
 * Nesses clientes a verificação de percentuais/valores dos sócios não se aplica.
 */
export function capitalZeradoEnquadrado(c: { natureza_juridica?: unknown; capital_social?: unknown } | null | undefined): boolean {
  if (!c) return false;
  return naturezaPermiteCapitalZerado(c.natureza_juridica) && capitalNumero(c.capital_social) === 0;
}
