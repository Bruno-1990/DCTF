/**
 * Task 21: Orquestrador de geração .DEC e validações em camadas.
 * Pré: APPROVED, sem BLOCKER, totais consistentes. Pós: releitura, T9 count. Rollback em falha.
 */

import { executeQuery } from '../../config/mysql';
import { getLayoutForExercicio } from './dec-layout';
import { generateDecBuffer, type DecWriterContext } from './dec-writers';
import { validateDeclarationConsistency } from './declaration-consistency';
import { resolveCasePath, ensureSubfolders, saveFileAtomically, computeSha256 } from './storage';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export interface GenerateDecPreCondition {
  ok: boolean;
  error?: string;
  code?: string;
}

export interface GenerateDecResult {
  success: boolean;
  filePath?: string;
  documentId?: number;
  error?: string;
  code?: string;
}

const DEC_FILENAME_PATTERN = '{CPF}-IRPF-A-{EXERCICIO}-{ANO_BASE}-{ORIGI|RETIF}.DEC';

/**
 * RF-072/RF-070: Valida pré-condições (APPROVED, sem BLOCKER, totais consistentes).
 */
export async function validatePreConditions(caseId: number): Promise<GenerateDecPreCondition> {
  const [caseRow] = await executeQuery<{ status: string; exercicio: number; ano_base: number }>(
    'SELECT status, exercicio, ano_base FROM irpf_producao_cases WHERE id = ?',
    [caseId]
  );
  if (!caseRow) return { ok: false, error: 'Case não encontrado', code: 'CASE_NOT_FOUND' };
  if (caseRow.status !== 'APPROVED') {
    return { ok: false, error: 'Case deve estar aprovado (APPROVED) para gerar .DEC', code: 'RF072_STATUS_NOT_APPROVED' };
  }

  const [blocker] = await executeQuery<{ id: number }>(
    "SELECT id FROM irpf_producao_issues WHERE case_id = ? AND severity = 'BLOCKER' LIMIT 1",
    [caseId]
  );
  if (blocker.length > 0) {
    return { ok: false, error: 'Existem pendências bloqueadoras. Resolva antes de gerar .DEC', code: 'RF070_BLOCKER_PRESENT' };
  }

  const consistency = await validateDeclarationConsistency(caseId);
  if (!consistency.valid) {
    return {
      ok: false,
      error: consistency.errors.map(e => e.message).join('; '),
      code: consistency.errors[0]?.code ?? 'RF075_INCONSISTENT',
    };
  }
  return { ok: true };
}

/**
 * Monta nome do arquivo: {CPF}-IRPF-A-{EXERCICIO}-{ANO_BASE}-ORIGI.DEC (ou RETIF se retificação).
 */
function buildDecFilename(cpf: string, exercicio: number, anoBase: number, isRetificacao: boolean): string {
  const cpfNum = (cpf || '').replace(/\D/g, '').slice(0, 11).padStart(11, '0');
  const origi = isRetificacao ? 'RETIF' : 'ORIGI';
  return `${cpfNum}-IRPF-A-${exercicio}-${anoBase}-${origi}.DEC`;
}

/**
 * Validação pós-geração: releitura do arquivo, contagem de linhas T9 (RF-076).
 */
function validatePostGeneration(buffer: Buffer): { ok: boolean; error?: string } {
  const text = buffer.toString('latin1');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const t9Count = lines.filter(l => l.slice(0, 2) === 'T9').length;
  if (t9Count !== 1) {
    return { ok: false, error: `Validação pós-geração: esperado 1 registro T9, encontrado ${t9Count}` };
  }
  const r9Count = lines.filter(l => l.slice(0, 2) === 'R9').length;
  if (r9Count !== 1) {
    return { ok: false, error: `Validação pós-geração: esperado 1 registro R9, encontrado ${r9Count}` };
  }
  return { ok: true };
}

/**
 * Orquestra: pré-valida → gera buffer → grava em 11_dec → pós-valida → registra document DEC_GERADO ou rollback.
 */
export async function generateDecForCase(caseId: number, isRetificacao = false): Promise<GenerateDecResult> {
  const pre = await validatePreConditions(caseId);
  if (!pre.ok) {
    return { success: false, error: pre.error, code: pre.code };
  }

  const [caseRow] = await executeQuery<{ exercicio: number; ano_base: number }>(
    'SELECT exercicio, ano_base FROM irpf_producao_cases WHERE id = ?',
    [caseId]
  );
  if (!caseRow) return { success: false, error: 'Case não encontrado', code: 'CASE_NOT_FOUND' };

  const [titular] = await executeQuery<{ cpf: string }>(
    "SELECT cpf FROM irpf_producao_case_people WHERE case_id = ? AND tipo = 'titular' LIMIT 1",
    [caseId]
  );
  const cpf = titular[0]?.cpf ?? '00000000000';
  const filename = buildDecFilename(cpf, caseRow.exercicio, caseRow.ano_base, isRetificacao);

  const layout = getLayoutForExercicio(caseRow.exercicio);
  const ctx: DecWriterContext = { exercicio: caseRow.exercicio, layout, caseId };
  const buffer = generateDecBuffer(ctx);

  const post = validatePostGeneration(buffer);
  if (!post.ok) {
    return { success: false, error: post.error, code: 'RF076_POST_VALIDATION_FAILED' };
  }

  const ano = caseRow.ano_base || caseRow.exercicio;
  const casePath = resolveCasePath(ano, String(caseId));
  await ensureSubfolders(casePath);
  const decDir = join(casePath, '11_dec');
  let filePath: string;
  try {
    filePath = await saveFileAtomically(decDir, filename, buffer);
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Falha ao gravar arquivo .DEC', code: 'DEC_WRITE_FAILED' };
  }

  const sha256 = computeSha256(buffer);
  const version = Date.now();

  try {
    const [insertResult] = await executeQuery<{ insertId: number }>(
      `INSERT INTO irpf_producao_documents (case_id, doc_type, source, version, file_path, file_size, sha256, extraction_status)
       VALUES (?, 'DEC_GERADO', 'SISTEMA', ?, ?, ?, ?, 'EXTRACTED')`,
      [caseId, 1, filePath, buffer.length, sha256]
    );
    const documentId = insertResult?.insertId ?? 0;

    await executeQuery(
      `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
       VALUES (?, 'dec_generated', 'SISTEMA', ?)`,
      [caseId, JSON.stringify({ document_id: documentId, filename, version, sha256_prefix: sha256.slice(0, 16) + '...' })]
    );

    return { success: true, filePath, documentId };
  } catch (err: any) {
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch (_) {}
    }
    return { success: false, error: err?.message ?? 'Falha ao registrar documento DEC_GERADO', code: 'DEC_REGISTER_FAILED' };
  }
}

export { DEC_FILENAME_PATTERN };
