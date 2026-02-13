/**
 * Task 8.1 - Registrar audit_event em toda ação sensível
 * Task 8.3 - Endpoint listagem trilha de auditoria por case
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';

const auditCalls: { sql: string; params?: unknown[] }[] = [];
const mockExecuteQuery = jest.fn();

jest.mock('../../src/config/mysql', () => ({
  executeQuery: (...args: unknown[]) => {
    const [sql, params] = args as [string, unknown[]?];
    if (typeof sql === 'string' && sql.includes('irpf_producao_audit_events')) {
      auditCalls.push({ sql, params });
    }
    return mockExecuteQuery(...args);
  },
  getConnection: jest.fn(),
}));

describe('IRPF Produção - Audit events (Task 8.1)', () => {
  let app: Express;
  const caseRow = {
    id: 1,
    case_code: 'C0000001',
    exercicio: 2025,
    ano_base: 2024,
    status: 'NEW',
    triagem_json: null,
    risk_score: null,
    assigned_to: null,
    cliente_id: null,
    perfil: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeAll(() => {
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  beforeEach(() => {
    auditCalls.length = 0;
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('irpf_producao_audit_events')) return [];
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) return [{ ...caseRow }];
      if (sql.includes('SELECT id FROM irpf_producao_cases')) return [{ id: 1 }];
      if (sql.includes('SELECT id, status FROM irpf_producao_cases')) return [{ id: 1, status: 'PENDING_DOCS' }];
      if (sql.startsWith('UPDATE') && sql.includes('irpf_producao_cases')) return [];
      if (sql.includes('irpf_producao_issues')) return [];
      if (sql.includes('SELECT * FROM irpf_producao_cases')) return [{ ...caseRow, status: 'READY_FOR_REVIEW' }];
      return [];
    });
  });

  it('PATCH /cases/:id/triage deve registrar audit_event com event_type triage_updated', async () => {
    await request(app)
      .patch('/api/irpf-producao/cases/1/triage')
      .set('X-User-Profile', 'Preparador')
      .send({ marcadores: { saude: true }, fontes_esperadas: ['ITAU'] });
    const triageAudit = auditCalls.find((c) => c.sql.includes('triage_updated'));
    expect(triageAudit).toBeDefined();
    expect(triageAudit!.sql).toContain('triage_updated');
  });

  it('POST /cases/:id/status deve registrar audit_event com event_type status_change', async () => {
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('irpf_producao_audit_events')) return [];
      if (sql.includes('irpf_producao_issues') && sql.includes('severity = ?')) return [];
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) return [{ ...caseRow }];
      if (sql.includes('SELECT id, status FROM irpf_producao_cases')) return [{ id: 1, status: 'PENDING_DOCS' }];
      if (sql.startsWith('UPDATE') || sql.includes('INSERT INTO irpf_producao_audit')) return [];
      if (sql.includes('SELECT * FROM irpf_producao_cases')) return [{ ...caseRow, status: 'READY_FOR_REVIEW' }];
      return [];
    });
    await request(app)
      .post('/api/irpf-producao/cases/1/status')
      .set('X-User-Profile', 'Revisor')
      .send({ status: 'READY_FOR_REVIEW' });
    const statusAudit = auditCalls.find((c) => c.sql.includes('status_change'));
    expect(statusAudit).toBeDefined();
    expect(statusAudit!.sql).toContain('status_change');
  });

  it('POST /cases/:id/documents (upload) deve registrar audit_event com event_type document_upload', async () => {
    const { tmpdir } = require('os');
    const storageDir = path.join(tmpdir(), `irpf-audit-test-${Date.now()}`);
    fs.mkdirSync(storageDir, { recursive: true });
    process.env.IRPF_STORAGE_PATH = storageDir;
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pngPath = path.join(fixturesDir, 'minimal-audit.png');
    fs.writeFileSync(pngPath, Buffer.from(minimalPngBase64, 'base64'));

    const getConn = require('../../src/config/mysql').getConnection as jest.Mock;
    getConn.mockResolvedValue({
      execute: jest.fn()
        .mockResolvedValueOnce([[{ id: 1, case_code: 'C0000001', exercicio: 2025 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ v: 1 }]])
        .mockResolvedValueOnce([{ insertId: 1 }]),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', pngPath)
      .field('docType', 'CADASTRO')
      .field('source', 'N/A');
    expect(res.status).toBe(201);
    const uploadAudit = auditCalls.find((c) => c.sql.includes('document_upload'));
    expect(uploadAudit).toBeDefined();
  });
});

describe('IRPF Produção - Listagem auditoria por case (Task 8.3)', () => {
  let app: Express;

  beforeAll(() => {
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  beforeEach(() => {
    mockExecuteQuery.mockImplementation((sql: string) => {
      if (sql.includes('irpf_producao_audit_events') && sql.includes('ORDER BY created_at DESC')) {
        return [
          { id: 1, case_id: 1, event_type: 'status_change', actor: 'user@test.com', payload: '{"from":"PENDING_DOCS","to":"READY_FOR_REVIEW"}', created_at: new Date('2025-02-01T12:00:00Z') },
          { id: 2, case_id: 1, event_type: 'triage_updated', actor: 'user@test.com', payload: '{}', created_at: new Date('2025-02-01T11:00:00Z') },
        ];
      }
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) {
        return [{ id: 1, case_code: 'C0000001' }];
      }
      return [];
    });
  });

  it('GET /cases/:id/audit deve retornar 200 com events ordenados por created_at desc', async () => {
    const res = await request(app).get('/api/irpf-producao/cases/1/audit');
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(Array.isArray(res.body?.data?.events)).toBe(true);
    expect(res.body.data.events.length).toBe(2);
    expect(res.body.data.events[0].event_type).toBe('status_change');
    expect(res.body.data.events[0]).toHaveProperty('actor');
    expect(res.body.data.events[0]).toHaveProperty('payload');
    expect(res.body.data.events[0]).toHaveProperty('created_at');
  });

  it('GET /cases/:id/audit para case inexistente deve retornar 404', async () => {
    mockExecuteQuery.mockImplementation((sql: string) => {
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) return [];
      if (sql.includes('irpf_producao_audit_events')) return [];
      return [];
    });
    const res = await request(app).get('/api/irpf-producao/cases/999/audit');
    expect(res.status).toBe(404);
  });
});
