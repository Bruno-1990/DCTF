/**
 * Worker BullMQ: validate — validação pós-classify (pipeline classify → validate).
 * Persiste execução em irpf_producao_job_runs. Lógica de negócio (regras de validação) pode ser expandida depois.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';
import { enqueueScoreRisk } from '../enqueue-score-risk';

export interface ValidateJobData {
  mysql_job_id: number;
  mysql_run_id?: number;
  document_id: number;
  case_id?: number | null;
  version?: number;
}

/** Processa um job validate: atualiza run e conclui (placeholder para regras de validação futuras). */
async function processValidateJob(job: Job<ValidateJobData, void>): Promise<void> {
  const { mysql_job_id, mysql_run_id, document_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id, mysql_run_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    // Placeholder: futura lógica (ex.: validar extracted_data, consistência, marcar REQUIRES_REVIEW)
    void document_id;
    await completeRun(runId);
    try {
      await enqueueScoreRisk(document_id, { caseId: job.data.case_id ?? undefined });
    } catch (e) {
      console.error('[IRPF Produção] enqueueScoreRisk após validate:', e);
    }
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

/** Cria e retorna o Worker para a fila validate */
export function createValidateWorker(): Worker<ValidateJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<ValidateJobData, void>(
    'validate',
    async (j) => processValidateJob(j),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
