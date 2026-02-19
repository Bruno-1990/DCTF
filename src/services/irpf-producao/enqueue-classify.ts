/**
 * Enfileirar job classify (pipeline pós-extract_text): insere em irpf_producao_jobs e adiciona à fila BullMQ.
 */

import { getConnection } from '../../config/mysql';
import { getQueue } from './queues';

export const CLASSIFY_JOB_VERSION = 1;

export interface EnqueueClassifyOptions {
  caseId?: number;
  jobId?: string;
}

/** Enfileira classificação para o documento; persiste job + run PENDING e retorna job_id MySQL. */
export async function enqueueClassify(
  documentId: number,
  optionsOrCaseId: EnqueueClassifyOptions | number = {}
): Promise<number> {
  const options: EnqueueClassifyOptions =
    typeof optionsOrCaseId === 'number' ? { caseId: optionsOrCaseId } : optionsOrCaseId;
  const { caseId, jobId } = options;
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_jobs (job_type, case_id, document_id, payload)
       VALUES ('classify', ?, ?, JSON_OBJECT('document_id', ?, 'version', ?))`,
      [caseId ?? null, documentId, documentId, CLASSIFY_JOB_VERSION]
    );
    const header = result as { insertId: number };
    const mysqlJobId = header.insertId;
    const [runResult] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts) VALUES (?, 'PENDING', 0)`,
      [mysqlJobId]
    );
    const mysqlRunId = (runResult as { insertId: number }).insertId;
    const queue = getQueue('classify');
    await queue.add(
      'classify',
      { mysql_job_id: mysqlJobId, mysql_run_id: mysqlRunId, document_id: documentId, case_id: caseId ?? null, version: CLASSIFY_JOB_VERSION },
      jobId ? { jobId } : undefined
    );
    return mysqlJobId;
  } finally {
    conn.release();
  }
}
