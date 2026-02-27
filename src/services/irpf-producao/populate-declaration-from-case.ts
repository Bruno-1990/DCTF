/**
 * Popular tabelas declaration_* a partir de case (case_people, triagem, documentos).
 * Task 18.2 – P-014: todo campo .DEC tem origem registrada em origem_dado.
 */

import { executeQuery } from '../../config/mysql';
import { getDeclarationTableForCampoDestino } from './dec-mapping';

const ORIGIN_CASE_PEOPLE = 'case_people';
const ORIGIN_TRIAGEM = 'triagem_json';
const ORIGIN_CASE = 'case';

export interface PopulateDeclarationResult {
  dependentsInserted: number;
  totalsUpserted: boolean;
  layoutVersionEnsured: boolean;
}

/**
 * Sincroniza dependentes do case (case_people tipo dependente) para declaration_dependents.
 */
async function syncDependentsFromCasePeople(caseId: number): Promise<number> {
  const people = await executeQuery<{ id: number; cpf: string; nome: string | null; tipo: string }>(
    'SELECT id, cpf, nome, tipo FROM irpf_producao_case_people WHERE case_id = ? AND tipo IN (\'dependente\', \'dependent\')',
    [caseId]
  );
  let inserted = 0;
  for (const p of people) {
    const existing = await executeQuery<{ id: number }>(
      'SELECT id FROM irpf_producao_declaration_dependents WHERE case_id = ? AND cpf = ?',
      [caseId, p.cpf]
    );
    if (existing.length === 0) {
      await executeQuery(
        `INSERT INTO irpf_producao_declaration_dependents (case_id, origem_dado, cpf, nome)
         VALUES (?, ?, ?, ?)`,
        [caseId, ORIGIN_CASE_PEOPLE, p.cpf, p.nome ?? null]
      );
      inserted++;
    }
  }
  return inserted;
}

/**
 * Garante uma linha em dec_layout_version para o exercício do case.
 */
async function ensureDecLayoutVersion(exercicio: number): Promise<boolean> {
  const rows = await executeQuery<{ id: number }>(
    'SELECT id FROM irpf_producao_dec_layout_version WHERE exercicio = ?',
    [exercicio]
  );
  if (rows.length > 0) return true;
  await executeQuery(
    'INSERT INTO irpf_producao_dec_layout_version (exercicio, layout_version) VALUES (?, ?)',
    [exercicio, `IRPF-LeiauteTXT-${exercicio}`]
  );
  return true;
}

/**
 * Garante uma linha em declaration_totals para o case (zerada, origem triagem/case).
 */
async function ensureDeclarationTotals(caseId: number, origem: string): Promise<boolean> {
  const rows = await executeQuery<{ id: number }>(
    'SELECT id FROM irpf_producao_declaration_totals WHERE case_id = ?',
    [caseId]
  );
  if (rows.length > 0) return false;
  await executeQuery(
    `INSERT INTO irpf_producao_declaration_totals (case_id, origem_dado, total_rendimentos, total_deducoes, total_imposto)
     VALUES (?, ?, 0, 0, 0)`,
    [caseId, origem]
  );
  return true;
}

/**
 * Popula dados da declaração a partir do case: case_people → dependents,
 * dec_layout_version por exercício, declaration_totals (um por case).
 * Opcional: document_extracted_data pode ser consumido em job/worker posterior
 * mapeando campo_destino → declaration_* via dec-mapping.
 */
export async function populateDeclarationFromCase(caseId: number): Promise<PopulateDeclarationResult> {
  const cases = await executeQuery<{ exercicio: number }>(
    'SELECT exercicio FROM irpf_producao_cases WHERE id = ?',
    [caseId]
  );
  if (cases.length === 0) {
    throw new Error('Case not found');
  }
  const exercicio = cases[0].exercicio;

  const dependentsInserted = await syncDependentsFromCasePeople(caseId);
  const layoutVersionEnsured = await ensureDecLayoutVersion(exercicio);
  const totalsUpserted = await ensureDeclarationTotals(caseId, ORIGIN_TRIAGEM);

  return { dependentsInserted, totalsUpserted, layoutVersionEnsured };
}
