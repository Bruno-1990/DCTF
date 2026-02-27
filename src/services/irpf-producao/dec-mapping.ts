/**
 * Mapeamento bloco .DEC → origem (Task 18.2, P-014: nenhum campo .DEC sem origem).
 * Anexo C do PRD define blocos; aqui registramos origens permitidas por tabela.
 */

export const DEC_DECLARATION_TABLES = [
  'irpf_producao_declaration_income_pj',
  'irpf_producao_declaration_income_pf',
  'irpf_producao_declaration_income_exempt',
  'irpf_producao_declaration_income_exclusive',
  'irpf_producao_declaration_dependents',
  'irpf_producao_declaration_payments',
  'irpf_producao_declaration_assets',
  'irpf_producao_declaration_debts',
  'irpf_producao_declaration_totals',
] as const;

/** Origens permitidas por tabela (P-014) */
export const DEC_TABLE_ORIGINS: Record<string, string[]> = {
  irpf_producao_declaration_income_pj: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_income_pf: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_income_exempt: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_income_exclusive: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_dependents: ['case_people', 'document_extracted_data'],
  irpf_producao_declaration_payments: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_assets: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_debts: ['document_extracted_data', 'triagem_json'],
  irpf_producao_declaration_totals: ['triagem_json', 'case', 'document_extracted_data'],
};

/** Prefixo de campo_destino (extraction) → tabela declaration */
export const CAMPO_DESTINO_TO_TABLE: Record<string, string> = {
  declaration_income_pj: 'irpf_producao_declaration_income_pj',
  declaration_income_pf: 'irpf_producao_declaration_income_pf',
  declaration_income_exempt: 'irpf_producao_declaration_income_exempt',
  declaration_income_exclusive: 'irpf_producao_declaration_income_exclusive',
  declaration_dependents: 'irpf_producao_declaration_dependents',
  declaration_payments: 'irpf_producao_declaration_payments',
  declaration_assets: 'irpf_producao_declaration_assets',
  declaration_debts: 'irpf_producao_declaration_debts',
  declaration_totals: 'irpf_producao_declaration_totals',
};

/** Retorna tabela declaration para um campo_destino (ex: "declaration_income_pj" ou "declaration_income_pj.valor") */
export function getDeclarationTableForCampoDestino(campoDestino: string): string | null {
  const prefix = campoDestino.split('.')[0];
  return CAMPO_DESTINO_TO_TABLE[prefix] ?? null;
}
