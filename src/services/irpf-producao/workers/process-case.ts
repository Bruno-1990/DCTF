/**
 * Worker BullMQ: process_case — Task 14 (Validações iniciais e divergências).
 * RF-040 a RF-043: validações de completude e informes; compara fontes pagadoras esperadas x recebidas; cria pendências.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';
import { executeQuery, getConnection } from '../../../config/mysql';

export interface ProcessCaseJobData {
  mysql_job_id: number;
  mysql_run_id?: number;
  case_id: number;
  version?: number;
}

type IssueSeverity = 'INFO' | 'WARN' | 'BLOCKER';

const CREATED_BY_SYSTEM = 'system';

/** RF-040 a RF-043: Validações iniciais (completude, informes). Gera issues com severidade conforme regra. */
async function runInitialValidations(caseId: number): Promise<{ code: string; message: string; severity: IssueSeverity }[]> {
  const issues: { code: string; message: string; severity: IssueSeverity }[] = [];
  const docs = await executeQuery<{ doc_type: string; extraction_status: string | null }>(
    'SELECT doc_type, extraction_status FROM irpf_producao_documents WHERE case_id = ?',
    [caseId]
  );
  const docTypes = [...new Set((docs || []).map((d) => d.doc_type))];
  const hasInforme = docTypes.some((t) => /^INF/i.test(t) || t === 'INFORMES');
  const hasAnyDoc = (docs?.length ?? 0) > 0;

  if (!hasAnyDoc) {
    issues.push({ code: 'RF-040', message: 'Case sem documentos anexados. Completude mínima não atendida.', severity: 'BLOCKER' });
  }
  if (!hasInforme && hasAnyDoc) {
    issues.push({ code: 'RF-041', message: 'Nenhum informe de rendimentos (INFORMES/INF_*) encontrado.', severity: 'WARN' });
  }
  const pendingExtraction = (docs || []).filter((d) => d.extraction_status === 'PENDING' || d.extraction_status === 'EXTRACTING' || d.extraction_status === 'REQUIRES_REVIEW');
  if (pendingExtraction.length > 0) {
    issues.push({
      code: 'RF-042',
      message: `${pendingExtraction.length} documento(s) com extração pendente ou em revisão.`,
      severity: 'INFO'
    });
  }
  const withError = (docs || []).filter((d) => d.extraction_status === 'EXTRACTION_ERROR' || (d.extraction_status && d.extraction_status.includes('error')));
  if (withError.length > 0) {
    issues.push({ code: 'RF-043', message: `${withError.length} documento(s) com erro de extração. Reprocessar ou anexar novamente.`, severity: 'WARN' });
  }
  return issues;
}

/** Compara fontes pagadoras esperadas (triagem) x recebidas (doc_type) e gera divergências. */
async function compareFontesAndGenerateIssues(caseId: number): Promise<{ code: string; message: string; severity: IssueSeverity }[]> {
  const issues: { code: string; message: string; severity: IssueSeverity }[] = [];
  const caseRows = await executeQuery<{ triagem_json: string | null }>('SELECT triagem_json FROM irpf_producao_cases WHERE id = ?', [caseId]);
  const triagem = caseRows?.[0]?.triagem_json;
  let fontesEsperadas: string[] = [];
  if (triagem) {
    try {
      const parsed = JSON.parse(triagem) as { fontes_esperadas?: string[] };
      if (Array.isArray(parsed.fontes_esperadas)) {
        fontesEsperadas = parsed.fontes_esperadas.filter((f: unknown) => typeof f === 'string' && f.trim()).map((f: string) => f.trim());
      }
    } catch {
      // ignore invalid JSON
    }
  }
  if (fontesEsperadas.length === 0) return issues;

  const docs = await executeQuery<{ doc_type: string }>('SELECT doc_type FROM irpf_producao_documents WHERE case_id = ?', [caseId]);
  const recebidos = new Set((docs || []).map((d) => d.doc_type.toUpperCase()));

  for (const fonte of fontesEsperadas) {
    const fonteNorm = fonte.toUpperCase();
    const matched = recebidos.has(fonteNorm) || (fonteNorm === 'INFORMES' && [...recebidos].some((r) => r.startsWith('INF') || r === 'INFORMES'));
    if (!matched) {
      issues.push({
        code: 'DIVERGENCIA_FONTE',
        message: `Fonte pagadora esperada sem documento correspondente: ${fonte}.`,
        severity: 'WARN'
      });
    }
  }
  return issues;
}

/** Remove issues auto-geradas por este job (códigos RF-040 a RF-043 e DIVERGENCIA_FONTE) e insere as novas. */
async function replaceProcessCaseIssues(caseId: number, newIssues: { code: string; message: string; severity: IssueSeverity }[]): Promise<void> {
  await executeQuery(
    "DELETE FROM irpf_producao_issues WHERE case_id = ? AND created_by = ? AND (code LIKE 'RF-%' OR code = 'DIVERGENCIA_FONTE')",
    [caseId, CREATED_BY_SYSTEM]
  );
  const conn = await getConnection();
  try {
    for (const i of newIssues) {
      await conn.execute(
        'INSERT INTO irpf_producao_issues (case_id, code, message, severity, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [caseId, i.code, i.message, i.severity, 'OPEN', CREATED_BY_SYSTEM]
      );
    }
  } finally {
    conn.release();
  }
}

async function processProcessCaseJob(job: Job<ProcessCaseJobData, void>): Promise<void> {
  const { mysql_job_id, mysql_run_id, case_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id, mysql_run_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    const validations = await runInitialValidations(case_id);
    const divergencias = await compareFontesAndGenerateIssues(case_id);
    const allIssues = [...validations, ...divergencias];
    await replaceProcessCaseIssues(case_id, allIssues);

    await executeQuery(
      `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
       VALUES (?, 'case_processed_initial_validations', ?, ?)`,
      [case_id, CREATED_BY_SYSTEM, JSON.stringify({ issues_created: allIssues.length, job_run_id: runId })]
    );

    await completeRun(runId);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

export function createProcessCaseWorker(): Worker<ProcessCaseJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<ProcessCaseJobData, void>(
    'process_case',
    async (j) => processProcessCaseJob(j),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
