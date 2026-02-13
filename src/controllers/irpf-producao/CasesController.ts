/**
 * Controller: Cases do módulo IRPF Produção (PRD-IRPF-001)
 * CRUD de cases e transição de status
 */

import { Request, Response } from 'express';
import { executeQuery, getConnection } from '../../config/mysql';

const STATUS_LIST = [
  'NEW', 'INTAKE_IN_PROGRESS', 'INTAKE_COMPLETE', 'PROCESSING',
  'PENDING_INTERNAL', 'PENDING_DOCS', 'READY_FOR_REVIEW', 'APPROVED',
  'SUBMITTED', 'POST_DELIVERY', 'CLOSED'
];

function nextCaseCode(rows: { maxId: number }[]): string {
  const n = (rows[0]?.maxId ?? 0) + 1;
  return 'C' + String(n).padStart(7, '0');
}

export class CasesController {
  /** GET /api/irpf-producao/cases - Listar com filtros (status, exercício, assigned_to) */
  async list(req: Request, res: Response) {
    try {
      const { status, exercicio, ano_base, assigned_to } = req.query;
      let sql = 'SELECT * FROM irpf_producao_cases WHERE 1=1';
      const params: (string | number)[] = [];
      if (status && typeof status === 'string') {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (exercicio != null && exercicio !== '') {
        sql += ' AND exercicio = ?';
        params.push(Number(exercicio));
      }
      if (ano_base != null && ano_base !== '') {
        sql += ' AND ano_base = ?';
        params.push(Number(ano_base));
      }
      if (assigned_to && typeof assigned_to === 'string') {
        sql += ' AND assigned_to = ?';
        params.push(assigned_to);
      }
      sql += ' ORDER BY updated_at DESC, id DESC';
      const rows = await executeQuery<any>(sql, params.length ? params : undefined);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('[IRPF Produção] list:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao listar cases' });
    }
  }

  /** GET /api/irpf-producao/cases/:id - Buscar um case por id */
  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }
      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Case não encontrado' });
      }
      const people = await executeQuery<any>('SELECT * FROM irpf_producao_case_people WHERE case_id = ?', [id]);
      res.json({ success: true, data: { ...rows[0], people } });
    } catch (error: any) {
      console.error('[IRPF Produção] getById:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao buscar case' });
    }
  }

  /** POST /api/irpf-producao/cases - Criar case */
  async create(req: Request, res: Response) {
    try {
      const { exercicio, ano_base, perfil, assigned_to, cliente_id } = req.body || {};
      if (!exercicio || !ano_base) {
        return res.status(400).json({ success: false, error: 'exercicio e ano_base são obrigatórios' });
      }
      const conn = await getConnection();
      try {
        const [maxRows] = (await conn.execute(
          'SELECT COALESCE(MAX(id), 0) AS maxId FROM irpf_producao_cases'
        )) as [ { maxId: number }[], unknown ];
        const maxId = Array.isArray(maxRows) && maxRows[0] ? maxRows[0].maxId : 0;
        const case_code = nextCaseCode([{ maxId }]);
        await conn.execute(
          `INSERT INTO irpf_producao_cases (case_code, exercicio, ano_base, status, perfil, assigned_to, cliente_id)
           VALUES (?, ?, ?, 'NEW', ?, ?, ?)`,
          [case_code, Number(exercicio), Number(ano_base), perfil || null, assigned_to || null, cliente_id ?? null]
        );
        const [ins] = await conn.execute<any[]>('SELECT * FROM irpf_producao_cases WHERE case_code = ?', [case_code]);
        const row = Array.isArray(ins) && ins[0] ? ins[0] : null;
        if (!row) {
          return res.status(500).json({ success: false, error: 'Falha ao recuperar case criado' });
        }
        res.status(201).json({ success: true, data: row });
      } finally {
        conn.release();
      }
    } catch (error: any) {
      console.error('[IRPF Produção] create:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao criar case' });
    }
  }

  /** PATCH /api/irpf-producao/cases/:id - Atualizar case (triagem, perfil, assigned_to) */
  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const { perfil, risk_score, assigned_to, triagem_json } = req.body || {};
      const updates: string[] = [];
      const params: any[] = [];
      if (perfil !== undefined) { updates.push('perfil = ?'); params.push(perfil); }
      if (risk_score !== undefined) { updates.push('risk_score = ?'); params.push(risk_score); }
      if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
      if (triagem_json !== undefined) { updates.push('triagem_json = ?'); params.push(JSON.stringify(triagem_json)); }
      if (!updates.length) return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      params.push(id);
      await executeQuery(
        `UPDATE irpf_producao_cases SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, data: rows[0] || null });
    } catch (error: any) {
      console.error('[IRPF Produção] update:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar case' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/status - Transição de status */
  async updateStatus(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body || {};
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ success: false, error: 'status é obrigatório' });
      }
      if (!STATUS_LIST.includes(status)) {
        return res.status(400).json({ success: false, error: 'Status inválido' });
      }
      await executeQuery('UPDATE irpf_producao_cases SET status = ? WHERE id = ?', [status, id]);
      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, data: rows[0] || null });
    } catch (error: any) {
      console.error('[IRPF Produção] updateStatus:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar status' });
    }
  }
}
