/**
 * Health check e monitoramento IRPF Produção (Task 13, RNF-033, RNF-032)
 */

import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { testMySQLConnection } from '../../config/mysql';
import { getConnection } from '../../config/mysql';

/** GET /api/irpf-producao/health — MySQL + share (RNF-033); 200 ou 503 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    const mysqlOk = await testMySQLConnection();
    const base = process.env['IRPF_STORAGE_PATH']?.trim() || join(process.cwd(), 'irpf_storage');
    const shareOk = existsSync(base);
    const healthy = mysqlOk && shareOk;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unhealthy',
      mysql: mysqlOk,
      share: shareOk,
    });
  } catch (e) {
    res.status(503).json({
      status: 'unhealthy',
      mysql: false,
      share: false,
      error: (e as Error).message,
    });
  }
}

/** GET /api/irpf-producao/jobs — Listar job_runs recentes para monitoramento (RNF-032) */
export async function listJobRuns(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const caseId = req.query.case_id != null ? parseInt(String(req.query.case_id), 10) : null;
    const documentId = req.query.document_id != null ? parseInt(String(req.query.document_id), 10) : null;
    const status = req.query.status as string | undefined;

    const conn = await getConnection();
    try {
      let sql = `
        SELECT r.id AS run_id, r.job_id, r.status, r.attempts, r.error_message, r.started_at, r.finished_at, r.created_at,
               j.job_type, j.case_id, j.document_id
        FROM irpf_producao_job_runs r
        JOIN irpf_producao_jobs j ON j.id = r.job_id
        WHERE 1=1`;
      const params: (number | string)[] = [];
      if (caseId != null && !isNaN(caseId)) {
        sql += ' AND j.case_id = ?';
        params.push(caseId);
      }
      if (documentId != null && !isNaN(documentId)) {
        sql += ' AND j.document_id = ?';
        params.push(documentId);
      }
      if (status && ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'].includes(status)) {
        sql += ' AND r.status = ?';
        params.push(status);
      }
      sql += ' ORDER BY r.started_at DESC, r.id DESC LIMIT ?';
      params.push(limit);

      const [rows] = await conn.execute<any>(sql, params);
      const list = Array.isArray(rows) ? rows : [];
      res.json({ success: true, runs: list });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('[IRPF Produção] listJobRuns:', e);
    res.status(500).json({ success: false, error: e?.message || 'Erro ao listar jobs' });
  }
}
