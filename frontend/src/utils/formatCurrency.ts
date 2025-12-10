/**
 * Formata valores monetários no padrão brasileiro (BRL)
 * Exemplo: 114023.37 → "R$ 114.023,37"
 * 
 * @param value - Valor numérico a ser formatado
 * @param includeSymbol - Se deve incluir o símbolo "R$" (padrão: true)
 * @returns String formatada no padrão brasileiro
 */
export const formatCurrency = (value: number | undefined | null, includeSymbol: boolean = true): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return includeSymbol ? 'R$ 0,00' : '0,00';
  }
  
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
  
  // Se não quiser incluir o símbolo, remove o "R$ "
  if (!includeSymbol) {
    return formatted.replace('R$', '').trim();
  }
  
  return formatted;
};

/**
 * Formata valores monetários sem o símbolo R$
 * Exemplo: 114023.37 → "114.023,37"
 * 
 * @param value - Valor numérico a ser formatado
 * @returns String formatada sem símbolo
 */
export const formatCurrencyNoSymbol = (value: number | undefined | null): string => {
  return formatCurrency(value, false);
};

