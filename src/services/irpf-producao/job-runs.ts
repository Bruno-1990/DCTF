/**
 * Persistência de execuções de jobs no MySQL (Task 9.2 - irpf_producao_job_runs)
 */

import { executeQuery, getConnection } from '../../config/mysql';

export type JobRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

/** Inicia uma execução (run): se runId informado, atualiza run existente para RUNNING; senão insere novo run (retrocompat). */
export async function startRun(jobId: number, runId?: number): Promise<number> {
  if (runId != null) {
    await executeQuery(
      `UPDATE irpf_producao_job_runs SET status = 'RUNNING', attempts = 1, started_at = CURRENT_TIMESTAMP WHERE id = ? AND job_id = ?`,
      [runId, jobId]
    );
    return runId;
  }
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO irpf_producao_job_runs (job_id, status, attempts, started_at)
       VALUES (?, 'RUNNING', 1, CURRENT_TIMESTAMP)`,
      [jobId]
    );
    const header = result as { insertId: number };
    return header.insertId;
  } finally {
    conn.release();
  }
}

/** Marca run como sucesso */
export async function completeRun(runId: number): Promise<void> {
  await executeQuery(
    `UPDATE irpf_producao_job_runs SET status = 'SUCCESS', finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [runId]
  );
}

/** Marca run como falha com mensagem */
export async function failRun(runId: number, errorMessage: string): Promise<void> {
  await executeQuery(
    `UPDATE irpf_producao_job_runs SET status = 'FAILED', error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [errorMessage.slice(0, 65535), runId]
  );
}
