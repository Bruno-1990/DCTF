/**
 * Worker BullMQ: extract_text — extrai texto de PDF editável (Task 9.2, PRD 8.8)
 * Persiste execução em irpf_producao_job_runs.
 */

import { Worker, Job } from 'bullmq';
import { readFile } from 'fs/promises';
import { executeQuery, getConnection } from '../../../config/mysql';
import { getRedisConnectionOptions } from '../queues/config';
import { startRun, completeRun, failRun } from '../job-runs';
import { runExtractionPipeline } from '../extraction-pipeline';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export interface ExtractTextJobData {
  mysql_job_id: number;
  document_id: number;
}

async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  const fn = typeof pdfParse === 'function' ? pdfParse : pdfParse?.default;
  if (typeof fn !== 'function') throw new Error('pdf-parse não disponível');
  const result = await fn(buffer);
  return {
    text: result?.text ?? '',
    numpages: result?.numpages ?? 0,
  };
}

/** Processa um job extract_text: lê documento, extrai texto, grava job_runs */
async function processExtractTextJob(job: Job<ExtractTextJobData, void>): Promise<void> {
  const { mysql_job_id, document_id } = job.data;
  let runId: number | null = null;

  try {
    runId = await startRun(mysql_job_id);
  } catch (e) {
    throw new Error(`Falha ao registrar run: ${(e as Error).message}`);
  }

  try {
    const conn = await getConnection();
    let filePath: string;
    try {
      const [rows] = await conn.execute<any>(
        'SELECT file_path FROM irpf_producao_documents WHERE id = ?',
        [document_id]
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      filePath = row?.file_path;
      conn.release();
    } catch (e) {
      conn.release();
      throw e;
    }

    if (!filePath) {
      await failRun(runId, `Documento ${document_id} sem file_path`);
      return;
    }

    const buffer = await readFile(filePath);
    const { text, numpages } = await extractTextFromPdf(buffer);

    if (numpages === 0) {
      await failRun(runId, 'PDF sem páginas ou não editável');
      return;
    }

    await runExtractionPipeline(document_id, text || '');
    await completeRun(runId);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (runId != null) await failRun(runId, msg);
    throw err;
  }
}

/** Cria e retorna o Worker para a fila extract_text */
export function createExtractTextWorker(): Worker<ExtractTextJobData, void> {
  const connection = getRedisConnectionOptions();
  return new Worker<ExtractTextJobData, void>(
    'extract_text',
    async (job) => processExtractTextJob(job),
    {
      connection: connection as any,
      prefix: 'irpf_producao',
      concurrency: 2,
    }
  );
}
