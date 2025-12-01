/**
 * Utilitários para normalização e comparação de CNPJ
 * Garante que CNPJs sejam sempre comparados de forma consistente
 */

/**
 * Normaliza CNPJ removendo caracteres não numéricos
 * Retorna apenas os dígitos (11 ou 14 caracteres)
 */
export function normalizarCNPJ(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.replace(/\D/g, '');
  return limpo.length >= 11 ? limpo : null;
}

/**
 * Formata CNPJ para exibição (XX.XXX.XXX/XXXX-XX)
 */
export function formatarCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '—';
  const digits = normalizarCNPJ(cnpj);
  if (!digits || digits.length !== 14) return cnpj;
  
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/**
 * Compara dois CNPJs de forma normalizada
 */
export function compararCNPJ(cnpj1: string | null | undefined, cnpj2: string | null | undefined): boolean {
  const n1 = normalizarCNPJ(cnpj1);
  const n2 = normalizarCNPJ(cnpj2);
  if (!n1 || !n2) return false;
  return n1 === n2;
}


