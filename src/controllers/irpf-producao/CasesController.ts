/**
 * Controller: Cases do módulo IRPF Produção (PRD-IRPF-001)
 * CRUD de cases, triagem (folha de rosto) e transição de status
 */

import { Request, Response } from 'express';
import { executeQuery, getConnection } from '../../config/mysql';
import { enqueueProcessCase as enqueueProcessCaseJob } from '../../services/irpf-producao/enqueue-process-case';
import { populateDeclarationFromCase } from '../../services/irpf-producao/populate-declaration-from-case';
import { generateDecForCase } from '../../services/irpf-producao/generate-dec-orchestrator';
import { recalculateAndSaveDeclarationTotals } from '../../services/irpf-producao/declaration-totals-calculator';

/** Marcadores da folha de rosto (Task 5, RF-010/011/012) */
export interface TriagemMarcadores {
  saude?: boolean;
  educacao?: boolean;
  bens?: boolean;
  investimentos?: boolean;
  exterior?: boolean;
  pensao?: boolean;
  rv_gcap?: boolean;
}

export interface TriagemPayload {
  marcadores?: TriagemMarcadores;
  fontes_esperadas?: string[];
}

function computeRiskFromTriagem(marcadores?: TriagemMarcadores): string | null {
  if (!marcadores || typeof marcadores !== 'object') return null;
  if (marcadores.exterior) return 'EXTERIOR';
  if (marcadores.rv_gcap || marcadores.investimentos) return 'RV_GCAP';
  const count = [marcadores.saude, marcadores.educacao, marcadores.bens, marcadores.pensao].filter(Boolean).length;
  if (count >= 3) return 'Alto';
  if (count >= 1) return 'Médio';
  return 'Baixo';
}

/** Itens de checklist por marcador (Anexo B / causas malha fina) */
const CHECKLIST_POR_MARCADOR: { key: keyof TriagemMarcadores; code: string; message: string; severity: 'INFO' | 'WARN' }[] = [
  { key: 'saude', code: 'CHECKLIST_SAUDE', message: 'Comprovar despesas médicas (comprovantes)', severity: 'INFO' },
  { key: 'educacao', code: 'CHECKLIST_EDUC', message: 'Conferir limite dedução educação e informes', severity: 'INFO' },
  { key: 'investimentos', code: 'CHECKLIST_INV', message: 'Conferir informes de rendimentos (investimentos)', severity: 'INFO' },
  { key: 'bens', code: 'CHECKLIST_BENS', message: 'Conferir bens e direitos declarados', severity: 'INFO' },
  { key: 'pensao', code: 'CHECKLIST_PENSAO', message: 'Pensão alimentícia: decisão/escritura e comprovantes', severity: 'WARN' },
  { key: 'exterior', code: 'CHECKLIST_EXTERIOR', message: 'Rendimentos no exterior: documentação e conversão', severity: 'WARN' },
  { key: 'rv_gcap', code: 'CHECKLIST_RV_GCAP', message: 'RV/GCAP: conferir informes e ganho de capital', severity: 'WARN' },
];

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
      const [people, issues, documents] = await Promise.all([
        executeQuery<any>('SELECT * FROM irpf_producao_case_people WHERE case_id = ?', [id]),
        executeQuery<any>('SELECT id, case_id, severity, status, code, message, created_at, created_by AS owner, due_date FROM irpf_producao_issues WHERE case_id = ? ORDER BY severity DESC, id ASC', [id]),
        executeQuery<any>('SELECT id, doc_type, source, version, file_path, file_size, created_at FROM irpf_producao_documents WHERE case_id = ? ORDER BY created_at ASC', [id])
      ]);
      res.json({ success: true, data: { ...rows[0], people, issues: issues || [], documents: documents || [] } });
    } catch (error: any) {
      console.error('[IRPF Produção] getById:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao buscar case' });
    }
  }

  /** GET /api/irpf-producao/cases/:id/dossie - Task 15 / RF-062: Dossiê final (inventário + hashes + histórico) */
  async getDossie(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }
      const caseRows = await executeQuery<any>(
        'SELECT id, case_code, exercicio, ano_base, status, perfil, risk_score, assigned_to, created_at, updated_at FROM irpf_producao_cases WHERE id = ?',
        [id]
      );
      if (!caseRows.length) {
        return res.status(404).json({ success: false, error: 'Case não encontrado' });
      }
      const [documents, events] = await Promise.all([
        executeQuery<any>(
          'SELECT id, doc_type, source, version, sha256, file_path, file_size, uploaded_by, created_at FROM irpf_producao_documents WHERE case_id = ? ORDER BY created_at ASC',
          [id]
        ),
        executeQuery<any>(
          'SELECT id, event_type, actor, payload, created_at FROM irpf_producao_audit_events WHERE case_id = ? ORDER BY created_at ASC',
          [id]
        )
      ]);
      const inventario = (documents || []).map((d: any) => ({
        document_id: d.id,
        doc_type: d.doc_type,
        source: d.source,
        version: d.version,
        sha256: d.sha256,
        file_path: d.file_path,
        file_size: d.file_size,
        uploaded_by: d.uploaded_by,
        created_at: d.created_at,
      }));
      const historico = (events || []).map((e: any) => ({
        event_type: e.event_type,
        actor: e.actor,
        payload: e.payload,
        created_at: e.created_at,
      }));
      res.json({
        success: true,
        data: {
          case: caseRows[0],
          inventario,
          historico,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error('[IRPF Produção] getDossie:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao gerar dossiê' });
    }
  }

  /** GET /api/irpf-producao/cases/:id/audit - Trilha de auditoria do case (Task 8.3) */
  async getAudit(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }
      const caseRows = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!caseRows.length) {
        return res.status(404).json({ success: false, error: 'Case não encontrado' });
      }
      const events = await executeQuery<any>(
        'SELECT id, case_id, event_type, actor, payload, created_at FROM irpf_producao_audit_events WHERE case_id = ? ORDER BY created_at DESC',
        [id]
      );
      res.json({ success: true, data: { events: events || [] } });
    } catch (error: any) {
      console.error('[IRPF Produção] getAudit:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao listar auditoria' });
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

  /** PATCH /api/irpf-producao/cases/:id/triage - Folha de rosto: marcadores + fontes esperadas; calcula risk_score (RF-012) */
  async patchTriage(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const { marcadores, fontes_esperadas } = req.body || {};
      const triagem_json: TriagemPayload = { marcadores, fontes_esperadas };
      const risk_score = computeRiskFromTriagem(marcadores);

      const current = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!current.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });

      const updates: string[] = ['triagem_json = ?'];
      const params: any[] = [JSON.stringify(triagem_json)];
      if (risk_score !== null) {
        updates.push('risk_score = ?');
        params.push(risk_score);
      }
      params.push(id);
      await executeQuery(
        `UPDATE irpf_producao_cases SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      const actor = (req as any).user?.email ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? null;
      await executeQuery(
        `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
         VALUES (?, 'triage_updated', ?, ?)`,
        [id, actor, JSON.stringify({ marcadores, risk_score })]
      );

      await this.syncChecklistFromTriagem(id, marcadores, fontes_esperadas);

      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, data: rows[0] || null });
    } catch (error: any) {
      console.error('[IRPF Produção] patchTriage:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao salvar triagem' });
    }
  }

  /**
   * Alimenta checklist (irpf_producao_issues) a partir da triagem: fontes esperadas + marcadores (Anexo B).
   * Remove itens CHECKLIST_* existentes e insere os novos.
   */
  private async syncChecklistFromTriagem(
    caseId: number,
    marcadores?: TriagemMarcadores,
    fontes_esperadas?: string[]
  ): Promise<void> {
    await executeQuery(
      "DELETE FROM irpf_producao_issues WHERE case_id = ? AND code LIKE 'CHECKLIST_%'",
      [caseId]
    );
    const insert = 'INSERT INTO irpf_producao_issues (case_id, code, message, severity, status) VALUES (?, ?, ?, ?, ?)';

    if (Array.isArray(fontes_esperadas)) {
      for (const fonte of fontes_esperadas) {
        if (typeof fonte === 'string' && fonte.trim()) {
          await executeQuery(insert, [
            caseId,
            'CHECKLIST_INFORME',
            `Aguardar informe de rendimentos: ${fonte.trim()}`,
            'INFO',
            'OPEN'
          ]);
        }
      }
    }

    if (marcadores && typeof marcadores === 'object') {
      for (const item of CHECKLIST_POR_MARCADOR) {
        if (marcadores[item.key]) {
          await executeQuery(insert, [caseId, item.code, item.message, item.severity, 'OPEN']);
        }
      }
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

  /** DELETE /api/irpf-producao/cases/:id - Excluir case (CASCADE remove issues, documents, etc.) */
  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const rows = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      await executeQuery('DELETE FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, message: 'Case excluído' });
    } catch (error: any) {
      console.error('[IRPF Produção] delete:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao excluir case' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/status - Transição de status (gate BLOCKER; audit_event) */
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

      const current = await executeQuery<any>('SELECT id, status FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!current.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      const previousStatus = current[0].status as string;

      if (status === 'APPROVED') {
        return res.status(400).json({
          success: false,
          error: 'Use POST /api/irpf-producao/cases/:id/review com action "approve" e justificativa obrigatória (RF-050, RF-051).',
          code: 'USE_REVIEW_ENDPOINT'
        });
      }

      if (status === 'READY_FOR_REVIEW') {
        const blockers = await executeQuery<any>(
          'SELECT id FROM irpf_producao_issues WHERE case_id = ? AND severity = ? AND status = ?',
          [id, 'BLOCKER', 'OPEN']
        );
        if (Array.isArray(blockers) && blockers.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Não é possível enviar para revisão: existem pendências BLOCKER em aberto.',
            code: 'BLOCKER_GATE'
          });
        }
      }

      if (status === 'SUBMITTED') {
        const protocolo = await executeQuery<any>(
          'SELECT id FROM irpf_producao_documents WHERE case_id = ? AND doc_type = ? LIMIT 1',
          [id, 'PROTOCOLO']
        );
        if (!protocolo?.length) {
          return res.status(400).json({
            success: false,
            error: 'Não é possível marcar como enviado: é obrigatório anexar ao menos um documento PROTOCOLO (recibo). RF-060.',
            code: 'PROTOCOLO_REQUIRED'
          });
        }
      }

      if (status === 'CLOSED') {
        const inv = await executeQuery<any>('SELECT COUNT(*) AS cnt FROM irpf_producao_documents WHERE case_id = ?', [id]);
        const count = Array.isArray(inv) && inv[0] && typeof inv[0].cnt === 'number' ? inv[0].cnt : Number(inv?.[0]?.cnt ?? 0);
        if (count === 0) {
          return res.status(400).json({
            success: false,
            error: 'Não é possível fechar o case: inventário de documentos vazio. RF-062: o dossiê exige ao menos um documento.',
            code: 'INVENTORY_REQUIRED'
          });
        }
      }

      await executeQuery('UPDATE irpf_producao_cases SET status = ? WHERE id = ?', [status, id]);

      const actor = (req as any).user?.email ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? null;
      await executeQuery(
        `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
         VALUES (?, 'status_change', ?, ?)`,
        [id, actor, JSON.stringify({ from: previousStatus, to: status })]
      );

      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, data: rows[0] || null });
    } catch (error: any) {
      console.error('[IRPF Produção] updateStatus:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar status' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/review — Task 16: Revisão e aprovação (RF-050 a RF-052, P-004). Aprovar/reprovar com justificativa; revisor sênior para alto risco. */
  async submitReview(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const { action, justification, override_reason, attachment_ref } = req.body || {};
      if (!action || (action !== 'approve' && action !== 'reject')) {
        return res.status(400).json({ success: false, error: 'action é obrigatório e deve ser "approve" ou "reject".' });
      }
      const just = typeof justification === 'string' ? justification.trim() : '';
      if (!just) {
        return res.status(400).json({ success: false, error: 'justificativa é obrigatória (RF-050, RF-051).' });
      }

      const caseRows = await executeQuery<any>('SELECT id, status, risk_score FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!caseRows.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      const currentStatus = caseRows[0].status as string;
      const riskScore = (caseRows[0].risk_score as string) || '';

      if (currentStatus !== 'READY_FOR_REVIEW') {
        return res.status(400).json({
          success: false,
          error: 'Case deve estar em READY_FOR_REVIEW para aprovação/reprovação.',
          code: 'INVALID_STATUS'
        });
      }

      const profile = (req as any).irpfAuth?.profile as string;
      const actor = (req as any).user?.email ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? profile ?? null;

      if (action === 'reject') {
        await executeQuery('UPDATE irpf_producao_cases SET status = ? WHERE id = ?', ['PENDING_INTERNAL', id]);
        await executeQuery(
          `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
           VALUES (?, 'review_rejected', ?, ?)`,
          [id, actor, JSON.stringify({ justification })]
        );
        const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
        return res.json({ success: true, data: rows[0] || null, message: 'Case reprovado na revisão.' });
      }

      const highRiskValues = ['Alto', 'RV_GCAP', 'EXTERIOR'];
      const isHighRisk = highRiskValues.includes(riskScore);
      const seniorProfiles = ['Auditor', 'Admin'];
      const isSenior = profile && seniorProfiles.includes(profile);
      if (isHighRisk && !isSenior) {
        return res.status(403).json({
          success: false,
          error: 'Política P-004: case de alto risco requer aprovação de revisor sênior (perfil Auditor ou Admin).',
          code: 'P004_SENIOR_REQUIRED'
        });
      }

      await executeQuery('UPDATE irpf_producao_cases SET status = ? WHERE id = ?', ['APPROVED', id]);
      const payload: Record<string, unknown> = { justification };
      if (override_reason) payload.override_reason = override_reason;
      if (attachment_ref) payload.attachment_ref = attachment_ref;
      if (isHighRisk) payload.p004_senior_approval = true;
      await executeQuery(
        `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
         VALUES (?, 'review_approved', ?, ?)`,
        [id, actor, JSON.stringify(payload)]
      );
      const rows = await executeQuery<any>('SELECT * FROM irpf_producao_cases WHERE id = ?', [id]);
      res.json({ success: true, data: rows[0] || null, message: 'Case aprovado na revisão.' });
    } catch (error: any) {
      console.error('[IRPF Produção] submitReview:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro na revisão' });
    }
  }

  /** Lista fechada de motivos para ocorrência pós-entrega (RF-061) */
  static readonly POST_DELIVERY_MOTIVOS = ['MALHA_FINA', 'RETIFICACAO', 'COMPLEMENTACAO', 'OUTROS'] as const;

  /** GET /api/irpf-producao/cases/:id/post-delivery-occurrences — Listar ocorrências pós-entrega (RF-061) */
  async getPostDeliveryOccurrences(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const caseRows = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!caseRows.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      const rows = await executeQuery<any>(
        'SELECT id, case_id, motivo, observacao, document_id, created_by, created_at FROM irpf_producao_post_delivery_occurrences WHERE case_id = ? ORDER BY created_at DESC',
        [id]
      );
      res.json({ success: true, data: rows || [] });
    } catch (error: any) {
      console.error('[IRPF Produção] getPostDeliveryOccurrences:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao listar ocorrências' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/post-delivery-occurrences — Registrar ocorrência pós-entrega (RF-061) */
  async addPostDeliveryOccurrence(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const { motivo, observacao, document_id } = req.body || {};
      const motivoStr = typeof motivo === 'string' ? motivo.trim() : '';
      if (!motivoStr || !CasesController.POST_DELIVERY_MOTIVOS.includes(motivoStr as any)) {
        return res.status(400).json({
          success: false,
          error: `motivo é obrigatório e deve ser um de: ${CasesController.POST_DELIVERY_MOTIVOS.join(', ')}.`,
          code: 'INVALID_MOTIVO'
        });
      }
      const caseRows = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!caseRows.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      const docId = document_id != null ? (typeof document_id === 'number' ? document_id : parseInt(String(document_id), 10)) : null;
      if (docId != null && !isNaN(docId)) {
        const doc = await executeQuery<any>('SELECT id FROM irpf_producao_documents WHERE id = ? AND case_id = ?', [docId, id]);
        if (!doc?.length) {
          return res.status(400).json({ success: false, error: 'document_id deve ser um documento do próprio case.', code: 'INVALID_DOCUMENT' });
        }
      }
      const actor = (req as any).user?.email ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? (req as any).irpfAuth?.profile ?? null;
      await executeQuery(
        `INSERT INTO irpf_producao_post_delivery_occurrences (case_id, motivo, observacao, document_id, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, motivoStr, observacao && typeof observacao === 'string' ? observacao.trim() : null, docId ?? null, actor]
      );
      await executeQuery(
        `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
         VALUES (?, 'post_delivery_occurrence', ?, ?)`,
        [id, actor, JSON.stringify({ motivo: motivoStr, document_id: docId })]
      );
      const rows = await executeQuery<any>(
        'SELECT id, case_id, motivo, observacao, document_id, created_by, created_at FROM irpf_producao_post_delivery_occurrences WHERE case_id = ? ORDER BY created_at DESC LIMIT 1',
        [id]
      );
      res.status(201).json({ success: true, data: rows?.[0] || null });
    } catch (error: any) {
      console.error('[IRPF Produção] addPostDeliveryOccurrence:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao registrar ocorrência' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/process — Task 14: enfileira job process_case (validações iniciais e divergências) */
  async enqueueProcessCase(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const rows = await executeQuery<any>('SELECT id FROM irpf_producao_cases WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Case não encontrado' });
      const jobId = await enqueueProcessCaseJob(id);
      res.status(202).json({ success: true, job_id: jobId, message: 'Processamento do case enfileirado.' });
    } catch (error: any) {
      console.error('[IRPF Produção] enqueueProcessCase:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao enfileirar processamento' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/sync-declaration — Task 18: popula declaration_* a partir de case_people, triagem, dec_layout_version */
  async syncDeclaration(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const result = await populateDeclarationFromCase(id);
      res.status(200).json({
        success: true,
        dependents_inserted: result.dependentsInserted,
        totals_upserted: result.totalsUpserted,
        layout_version_ensured: result.layoutVersionEnsured,
      });
    } catch (error: any) {
      console.error('[IRPF Produção] syncDeclaration:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao sincronizar declaração' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/generate-dec — Task 21/22: gera arquivo .DEC; retorna path e document_id ou erro (RF-071, RF-076) */
  async generateDec(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido', code: 'INVALID_CASE_ID' });
      const isRetificacao = (req.body?.retificacao === true);
      const result = await generateDecForCase(id, isRetificacao);
      if (!result.success) {
        const status = result.code === 'CASE_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ success: false, error: result.error, code: result.code });
      }
      res.status(200).json({
        success: true,
        file_path: result.filePath,
        document_id: result.documentId,
      });
    } catch (error: any) {
      console.error('[IRPF Produção] generateDec:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao gerar .DEC', code: 'DEC_GENERATION_ERROR' });
    }
  }

  /** POST /api/irpf-producao/cases/:id/recalculate-totals — Task 20: recalcula e persiste declaration_totals */
  async recalculateTotals(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });
      const result = await recalculateAndSaveDeclarationTotals(id);
      res.status(200).json({ success: true, totals: result });
    } catch (error: any) {
      console.error('[IRPF Produção] recalculateTotals:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao recalcular totais' });
    }
  }
}
