/**
 * Enfileirar job extract_text (Task 9.2/9.3): insere em irpf_producao_jobs e adiciona à fila BullMQ.
 * Idempotência: jobId por document_id evita duplicação (Task 9.3).
 */

import { getConnection } from '../../config/mysql';
import { getQueue } from './queues';

export const JOB_VERSION = 1;

export interface EnqueueExtractTextOptions {
  caseId?: number;
  /** Se informado, usa como jobId no BullMQ para idempotência (evitar duplicar por documento) */
  jobId?: string;
}

/** Enfileira extração de texto para o documento; persiste em irpf_producao_jobs e retorna o job_id MySQL. Opções: caseId (número) ou objeto { caseId, jobId }. */
export async function enqueueExtractText(
  documentId: number,
  optionsOrCaseId: EnqueueExtractTextOptions | number = {}
): Promise<number> {
  const options: EnqueueExtractTextOptions =
    typeof optionsOrCaseId === 'number' ? { caseId: optionsOrCaseId } : optionsOrCaseId;
  const { caseId, jobId } = options;
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_jobs (job_type, case_id, document_id, payload)
       VALUES ('extract_text', ?, ?, JSON_OBJECT('document_id', ?, 'version', ?))`,
      [caseId ?? null, documentId, documentId, JOB_VERSION]
    );
    const header = result as { insertId: number };
    const mysqlJobId = header.insertId;
    const [runResult] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts) VALUES (?, 'PENDING', 0)`,
      [mysqlJobId]
    );
    const mysqlRunId = (runResult as { insertId: number }).insertId;
    const queue = getQueue('extract_text');
    await queue.add(
      'extract',
      { mysql_job_id: mysqlJobId, mysql_run_id: mysqlRunId, document_id: documentId, version: JOB_VERSION },
      jobId ? { jobId } : undefined
    );
    return mysqlJobId;
  } finally {
    conn.release();
  }
}
