/**
 * Enfileirar job score_risk (pipeline pós-validate): insere em irpf_producao_jobs e adiciona à fila BullMQ.
 */

import { getConnection } from '../../config/mysql';
import { getQueue } from './queues';

export const SCORE_RISK_JOB_VERSION = 1;

export interface EnqueueScoreRiskOptions {
  caseId?: number;
  jobId?: string;
}

/** Enfileira score de risco para o documento/case; persiste job + run PENDING e retorna job_id MySQL. */
export async function enqueueScoreRisk(
  documentId: number,
  optionsOrCaseId: EnqueueScoreRiskOptions | number = {}
): Promise<number> {
  const options: EnqueueScoreRiskOptions =
    typeof optionsOrCaseId === 'number' ? { caseId: optionsOrCaseId } : optionsOrCaseId;
  const { caseId, jobId } = options;
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_jobs (job_type, case_id, document_id, payload)
       VALUES ('score_risk', ?, ?, JSON_OBJECT('document_id', ?, 'version', ?))`,
      [caseId ?? null, documentId, documentId, SCORE_RISK_JOB_VERSION]
    );
    const header = result as { insertId: number };
    const mysqlJobId = header.insertId;
    const [runResult] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts) VALUES (?, 'PENDING', 0)`,
      [mysqlJobId]
    );
    const mysqlRunId = (runResult as { insertId: number }).insertId;
    const queue = getQueue('score_risk');
    await queue.add(
      'score_risk',
      { mysql_job_id: mysqlJobId, mysql_run_id: mysqlRunId, document_id: documentId, case_id: caseId ?? null, version: SCORE_RISK_JOB_VERSION },
      jobId ? { jobId } : undefined
    );
    return mysqlJobId;
  } finally {
    conn.release();
  }
}
