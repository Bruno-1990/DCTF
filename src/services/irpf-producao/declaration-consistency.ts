/**
 * Task 20.2 / RF-075: Validação de consistência.
 * Tipo simplificada/completa coerente com blocos 17/18 ou 19/20; T9 = totais calculados.
 */

import { executeQuery } from '../../config/mysql';
import { calculateTotals, getRendimentosFromDeclaration, type TotalsResult } from './declaration-totals-calculator';

export interface ConsistencyError {
  code: string;
  message: string;
}

export interface ConsistencyResult {
  valid: boolean;
  errors: ConsistencyError[];
  perfil: string | null;
  usesBlocks17_18: boolean;
  usesBlocks19_20: boolean;
  totalsMatch: boolean;
}

/**
 * Simplificada → blocos 17/18; Completa → blocos 19/20. RF-075.
 */
export function validatePerfilVsBlocks(perfil: string | null): { valid: boolean; uses17_18: boolean; uses19_20: boolean; error?: ConsistencyError } {
  const simplificada = perfil != null && /simplificad/i.test(perfil);
  const completa = perfil != null && /complet/i.test(perfil);
  if (!perfil) {
    return { valid: true, uses17_18: false, uses19_20: false };
  }
  if (simplificada) {
    return { valid: true, uses17_18: true, uses19_20: false };
  }
  if (completa) {
    return { valid: true, uses17_18: false, uses19_20: true };
  }
  return {
    valid: false,
    uses17_18: false,
    uses19_20: false,
    error: { code: 'RF075_PERFIL_BLOCOS', message: 'Perfil deve ser Simplificada (blocos 17/18) ou Completa (blocos 19/20).' },
  };
}

/**
 * Valida que T9 / totais gerados batem com declaration_totals calculados.
 */
export function validateT9Totals(
  calculated: TotalsResult,
  declaredTotalRendimentos: number,
  declaredTotalImposto: number
): boolean {
  const rendMatch = Math.abs(calculated.total_rendimentos - declaredTotalRendimentos) < 0.02;
  const impostoMatch = Math.abs(calculated.total_imposto - declaredTotalImposto) < 0.02;
  return rendMatch && impostoMatch;
}

/**
 * Validação completa de consistência para o case (RF-075). Bloquear geração se inconsistente.
 */
export async function validateDeclarationConsistency(caseId: number): Promise<ConsistencyResult> {
  const errors: ConsistencyError[] = [];

  const [caseRow] = await executeQuery<{ perfil: string | null }>(
    'SELECT perfil FROM irpf_producao_cases WHERE id = ?',
    [caseId]
  );
  const perfil = caseRow?.perfil ?? null;

  const perfilCheck = validatePerfilVsBlocks(perfil);
  if (!perfilCheck.valid && perfilCheck.error) errors.push(perfilCheck.error);

  const input = await getRendimentosFromDeclaration(caseId);
  const calculated = calculateTotals(input, perfil);

  const [totalsRow] = await executeQuery<{ total_rendimentos: string; total_imposto: string }>(
    'SELECT total_rendimentos, total_imposto FROM irpf_producao_declaration_totals WHERE case_id = ?',
    [caseId]
  );
  const declaredRend = totalsRow ? Number(totalsRow.total_rendimentos) : 0;
  const declaredImposto = totalsRow ? Number(totalsRow.total_imposto) : 0;
  const totalsMatch = validateT9Totals(calculated, declaredRend, declaredImposto);
  if (!totalsMatch) {
    errors.push({
      code: 'RF075_T9_TOTAIS',
      message: 'Totais da declaração (T9) não conferem com os calculados. Execute recálculo de totais.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    perfil,
    usesBlocks17_18: perfilCheck.uses17_18,
    usesBlocks19_20: perfilCheck.uses19_20,
    totalsMatch,
  };
}
