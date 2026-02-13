/**
 * Task 8.1 - Registrar audit_event em toda ação sensível (quem, quando, o quê, de/para, motivo)
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
