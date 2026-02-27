/**
 * Sobe todos os workers do pipeline IRPF Produção (Task 19).
 * extract_text, classify, validate, score_risk, generate_case_summary
 * Requer Redis (REDIS_URL ou REDIS_HOST/REDIS_PORT) e MySQL configurados.
 */

import { createExtractTextWorker } from '../services/irpf-producao/workers/extract-text';
import { createClassifyWorker } from '../services/irpf-producao/workers/classify';
import { createValidateWorker } from '../services/irpf-producao/workers/validate';
import { createScoreRiskWorker } from '../services/irpf-producao/workers/score-risk';
import { createGenerateCaseSummaryWorker } from '../services/irpf-producao/workers/generate-case-summary';
import { createProcessCaseWorker } from '../services/irpf-producao/workers/process-case';

const workers = [
  createExtractTextWorker(),
  createClassifyWorker(),
  createValidateWorker(),
  createScoreRiskWorker(),
  createGenerateCaseSummaryWorker(),
  createProcessCaseWorker(),
];

function shutdown(): void {
  console.log('[IRPF Produção] Encerrando workers...');
  Promise.all(workers.map((w) => w.close()))
    .then(() => {
      console.log('[IRPF Produção] Workers encerrados.');
      process.exit(0);
    })
    .catch((e) => {
      console.error('[IRPF Produção] Erro ao encerrar:', e);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[IRPF Produção] Workers ativos: extract_text, classify, validate, score_risk, generate_case_summary, process_case');
