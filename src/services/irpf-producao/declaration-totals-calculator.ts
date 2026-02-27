/**
 * Task 20.1: Calcular base, imposto, deduções (simplificada 20% vs completa) e totais.
 * declaration_totals; fórmulas conforme leiaute e Anexo A (limites).
 */

import { executeQuery } from '../../config/mysql';

const ORIGIN_CALCULATOR = 'declaration_totals_calculator';
const DEDUCAO_SIMPLIFICADA_PERCENT = 20;

export interface TotalsInput {
  totalRendimentos: number;
  totalDeducoes: number;
  totalPagamentos: number; // retenções/pagamentos
}

export interface TotalsResult {
  total_rendimentos: number;
  total_deducoes: number;
  base_calculo: number;
  imposto_bruto: number;
  imposto_liquido: number;
  total_imposto: number;
  perfil: string | null;
  simplificada: boolean;
}

/**
 * Calcula base, imposto e deduções. Simplificada: dedução 20% sobre rendimentos tributáveis.
 * Completa: usa total_deducoes já informado. Imposto líquido = imposto bruto - pagamentos.
 */
export function calculateTotals(
  input: TotalsInput,
  perfil: string | null
): TotalsResult {
  const simplificada = perfil != null && /simplificad/i.test(perfil);
  const totalRendimentos = Number(input.totalRendimentos) || 0;
  const totalDeducoes = Number(input.totalDeducoes) || 0;
  const totalPagamentos = Number(input.totalPagamentos) || 0;

  let baseCalculo: number;
  if (simplificada) {
    const deducaoSimplificada = totalRendimentos * (DEDUCAO_SIMPLIFICADA_PERCENT / 100);
    baseCalculo = Math.max(0, totalRendimentos - deducaoSimplificada);
  } else {
    baseCalculo = Math.max(0, totalRendimentos - totalDeducoes);
  }

  // Imposto bruto simplificado: tabela progressiva seria aqui; placeholder por faixa fixa
  const impostoBruto = baseCalculo <= 0 ? 0 : Math.round(baseCalculo * 0.075 * 100) / 100;
  const impostoLiquido = Math.max(0, impostoBruto - totalPagamentos);
  const totalImposto = impostoLiquido;

  return {
    total_rendimentos: totalRendimentos,
    total_deducoes: simplificada ? totalRendimentos * (DEDUCAO_SIMPLIFICADA_PERCENT / 100) : totalDeducoes,
    base_calculo: baseCalculo,
    imposto_bruto: impostoBruto,
    imposto_liquido: impostoLiquido,
    total_imposto: totalImposto,
    perfil,
    simplificada,
  };
}

/**
 * Soma rendimentos de declaration_income_* para um case.
 */
export async function getRendimentosFromDeclaration(caseId: number): Promise<TotalsInput> {
  const [pj, pf, exempt, exclusive, payments] = await Promise.all([
    executeQuery<{ s: string }>('SELECT COALESCE(SUM(valor), 0) AS s FROM irpf_producao_declaration_income_pj WHERE case_id = ?', [caseId]),
    executeQuery<{ s: string }>('SELECT COALESCE(SUM(valor), 0) AS s FROM irpf_producao_declaration_income_pf WHERE case_id = ?', [caseId]),
    executeQuery<{ s: string }>('SELECT COALESCE(SUM(valor), 0) AS s FROM irpf_producao_declaration_income_exempt WHERE case_id = ?', [caseId]),
    executeQuery<{ s: string }>('SELECT COALESCE(SUM(valor), 0) AS s FROM irpf_producao_declaration_income_exclusive WHERE case_id = ?', [caseId]),
    executeQuery<{ s: string }>('SELECT COALESCE(SUM(valor), 0) AS s FROM irpf_producao_declaration_payments WHERE case_id = ?', [caseId]),
  ]);

  const totalRendimentos =
    Number(pj[0]?.s ?? 0) + Number(pf[0]?.s ?? 0) + Number(exempt[0]?.s ?? 0) + Number(exclusive[0]?.s ?? 0);
  const totalPagamentos = Number(payments[0]?.s ?? 0);

  const [totalsRow] = await executeQuery<{ total_deducoes: string }>(
    'SELECT total_deducoes FROM irpf_producao_declaration_totals WHERE case_id = ?',
    [caseId]
  );
  const totalDeducoes = totalsRow ? Number(totalsRow.total_deducoes) : 0;

  return { totalRendimentos, totalDeducoes, totalPagamentos };
}

/**
 * Recalcula e persiste declaration_totals para o case.
 */
export async function recalculateAndSaveDeclarationTotals(caseId: number): Promise<TotalsResult> {
  const [caseRow] = await executeQuery<{ exercicio: number; perfil: string | null }>(
    'SELECT exercicio, perfil FROM irpf_producao_cases WHERE id = ?',
    [caseId]
  );
  if (!caseRow) throw new Error('Case not found');
  const input = await getRendimentosFromDeclaration(caseId);
  const result = calculateTotals(input, caseRow.perfil);

  await executeQuery(
    `UPDATE irpf_producao_declaration_totals 
     SET origem_dado = ?, total_rendimentos = ?, total_deducoes = ?, total_imposto = ?, payload = ?
     WHERE case_id = ?`,
    [
      ORIGIN_CALCULATOR,
      result.total_rendimentos,
      result.total_deducoes,
      result.total_imposto,
      JSON.stringify({ base_calculo: result.base_calculo, imposto_bruto: result.imposto_bruto, imposto_liquido: result.imposto_liquido, simplificada: result.simplificada }),
      caseId,
    ]
  );
  return result;
}
