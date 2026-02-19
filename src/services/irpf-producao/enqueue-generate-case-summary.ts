/**
 * Enfileirar job generate_case_summary (pipeline pós-score_risk): insere em irpf_producao_jobs e adiciona à fila BullMQ.
 */

import { getConnection } from '../../config/mysql';
import { getQueue } from './queues';

export const GENERATE_CASE_SUMMARY_JOB_VERSION = 1;

export interface EnqueueGenerateCaseSummaryOptions {
  caseId?: number;
  documentId?: number;
  jobId?: string;
}

/** Enfileira geração de resumo do case; persiste job + run PENDING e retorna job_id MySQL. */
export async function enqueueGenerateCaseSummary(
  options: EnqueueGenerateCaseSummaryOptions
): Promise<number> {
  const { caseId, documentId, jobId } = options;
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_jobs (job_type, case_id, document_id, payload)
       VALUES ('generate_case_summary', ?, ?, JSON_OBJECT('document_id', ?, 'version', ?))`,
      [caseId ?? null, documentId ?? null, documentId ?? null, GENERATE_CASE_SUMMARY_JOB_VERSION]
    );
    const header = result as { insertId: number };
    const mysqlJobId = header.insertId;
    const [runResult] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts) VALUES (?, 'PENDING', 0)`,
      [mysqlJobId]
    );
    const mysqlRunId = (runResult as { insertId: number }).insertId;
    const queue = getQueue('generate_case_summary');
    await queue.add(
      'generate_case_summary',
      { mysql_job_id: mysqlJobId, mysql_run_id: mysqlRunId, document_id: documentId ?? null, case_id: caseId ?? null, version: GENERATE_CASE_SUMMARY_JOB_VERSION },
      jobId ? { jobId } : undefined
    );
    return mysqlJobId;
  } finally {
    conn.release();
  }
}
