/**
 * Enfileirar job process_case (Task 14 - Validações iniciais e divergências).
 * Insere em irpf_producao_jobs e adiciona à fila BullMQ.
 */

import { getConnection } from '../../config/mysql';
import { getQueue } from './queues';

export const PROCESS_CASE_JOB_VERSION = 1;

export interface EnqueueProcessCaseOptions {
  jobId?: string;
}

/** Enfileira processamento do case (validações completude, informes, fontes pagadoras); persiste job + run PENDING. */
export async function enqueueProcessCase(caseId: number, options: EnqueueProcessCaseOptions = {}): Promise<number> {
  const { jobId } = options;
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_jobs (job_type, case_id, document_id, payload)
       VALUES ('process_case', ?, NULL, JSON_OBJECT('case_id', ?, 'version', ?))`,
      [caseId, caseId, PROCESS_CASE_JOB_VERSION]
    );
    const header = result as { insertId: number };
    const mysqlJobId = header.insertId;
    const [runResult] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts) VALUES (?, 'PENDING', 0)`,
      [mysqlJobId]
    );
    const mysqlRunId = (runResult as { insertId: number }).insertId;
    const queue = getQueue('process_case');
    await queue.add(
      'process_case',
      { mysql_job_id: mysqlJobId, mysql_run_id: mysqlRunId, case_id: caseId, version: PROCESS_CASE_JOB_VERSION },
      jobId ? { jobId } : undefined
    );
    return mysqlJobId;
  } finally {
    conn.release();
  }
}
