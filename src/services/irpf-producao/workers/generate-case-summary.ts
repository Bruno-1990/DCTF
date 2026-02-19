/**
 * Worker BullMQ: generate_case_summary — resumo do case (último estágio do pipeline).
 * Persiste execução em irpf_producao_job_runs. Lógica de negócio (agregação, resumo) pode ser expandida depois.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';

export interface GenerateCaseSummaryJobData {
  mysql_job_id: number;
  mysql_run_id?: number;
  document_id?: number | null;
  case_id?: number | null;
  version?: number;
}

/** Processa um job generate_case_summary: atualiza run e conclui (placeholder para agregação futura). */
async function processGenerateCaseSummaryJob(job: Job<GenerateCaseSummaryJobData, void>): Promise<void> {
  const { mysql_job_id, mysql_run_id, case_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id, mysql_run_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    // Placeholder: futura lógica (ex.: agregar dados do case, gerar resumo, persistir)
    void case_id;
    await completeRun(runId);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

/** Cria e retorna o Worker para a fila generate_case_summary */
export function createGenerateCaseSummaryWorker(): Worker<GenerateCaseSummaryJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<GenerateCaseSummaryJobData, void>(
    'generate_case_summary',
    async (j) => processGenerateCaseSummaryJob(j),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
