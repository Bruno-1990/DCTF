/**
 * Worker BullMQ: score_risk — pontuação de risco pós-validate (pipeline validate → score_risk).
 * Persiste execução em irpf_producao_job_runs. Lógica de negócio (cálculo de risco) pode ser expandida depois.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';

export interface ScoreRiskJobData {
  mysql_job_id: number;
  mysql_run_id?: number;
  document_id: number;
  case_id?: number | null;
  version?: number;
}

/** Processa um job score_risk: atualiza run e conclui (placeholder para regras de risco futuras). */
async function processScoreRiskJob(job: Job<ScoreRiskJobData, void>): Promise<void> {
  const { mysql_job_id, mysql_run_id, document_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id, mysql_run_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    // Placeholder: futura lógica (ex.: calcular score de risco do case/documento, persistir)
    void document_id;
    await completeRun(runId);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

/** Cria e retorna o Worker para a fila score_risk */
export function createScoreRiskWorker(): Worker<ScoreRiskJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<ScoreRiskJobData, void>(
    'score_risk',
    async (j) => processScoreRiskJob(j),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
