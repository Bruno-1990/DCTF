/**
 * Worker BullMQ: classify — classificação pós-extração (pipeline extract_text → classify).
 * Persiste execução em irpf_producao_job_runs. Lógica de negócio (ex.: validar doc_type) pode ser expandida depois.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';

export interface ClassifyJobData {
  mysql_job_id: number;
  mysql_run_id?: number;
  document_id: number;
  case_id?: number | null;
  version?: number;
}

/** Processa um job classify: atualiza run e conclui (placeholder para regras de classificação futuras). */
async function processClassifyJob(job: Job<ClassifyJobData, void>): Promise<void> {
  const { mysql_job_id, mysql_run_id, document_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id, mysql_run_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    // Placeholder: futura lógica (ex.: validar doc_type a partir de extracted_data, marcar REQUIRES_REVIEW)
    void document_id;
    await completeRun(runId);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

/** Cria e retorna o Worker para a fila classify */
export function createClassifyWorker(): Worker<ClassifyJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<ClassifyJobData, void>(
    'classify',
    async (j) => processClassifyJob(j),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
