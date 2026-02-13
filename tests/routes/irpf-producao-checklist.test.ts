/**
 * Testes Task 7 - Checklist e pendências (INFO/WARN/BLOCKER)
 * 7.1: Geração de checklist automático por perfil e marcadores (Anexo B)
 * 7.2: Modelo de pendências: severidade INFO/WARN/BLOCKER, dono, prazo, status
 * 7.3: Gates de workflow com BLOCKER
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

const VALID_SEVERITIES = ['INFO', 'WARN', 'BLOCKER'];
const VALID_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'];

const mockIssues: {
  id: number;
  case_id: number;
  code: string;
  message: string;
  severity: string;
  status: string;
  owner?: string | null;
  due_date?: string | null;
}[] = [];
const mockExecuteQuery = jest.fn();

jest.mock('../../src/config/mysql', () => ({
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
  getConnection: jest.fn(),
}));

describe('IRPF Produção - Checklist automático (Task 7.1)', () => {
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
    mockIssues.length = 0;
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO irpf_producao_issues')) {
        const p = (params || []) as unknown[];
        mockIssues.push({
          id: mockIssues.length + 1,
          case_id: Number(p[0]),
          code: String(p[1]),
          message: String(p[2]),
          severity: String(p[3]),
          status: String(p[4]),
        });
        return [];
      }
      if (sql.includes('irpf_producao_issues') && sql.includes('SELECT')) {
        return mockIssues.map(({ id, case_id, code, message, severity, status, owner, due_date }) => ({
          id,
          case_id,
          code,
          message,
          severity,
          status,
          owner: owner ?? null,
          due_date: due_date ?? null,
        }));
      }
      if (sql.includes('irpf_producao_case_people')) return [];
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) {
        return [{ ...caseRow }];
      }
      if (sql.includes('SELECT id FROM irpf_producao_cases')) return [{ id: 1 }];
      if (sql.startsWith('UPDATE') || sql.includes('DELETE')) return [];
      return [];
    });
  });

  it('deve gerar itens de checklist (CHECKLIST_SAUDE, CHECKLIST_INFORME) após PATCH triage com marcadores e fontes_esperadas', async () => {
    const patchRes = await request(app)
      .patch('/api/irpf-producao/cases/1/triage')
      .send({ marcadores: { saude: true }, fontes_esperadas: ['ITAU'] });
    expect(patchRes.status).toBe(200);

    const getRes = await request(app).get('/api/irpf-producao/cases/1');
    expect(getRes.status).toBe(200);
    expect(getRes.body?.data?.issues).toBeDefined();
    const issues = getRes.body.data.issues as { code: string; message: string }[];
    expect(Array.isArray(issues)).toBe(true);

    const hasChecklistSaude = issues.some((i) => i.code === 'CHECKLIST_SAUDE');
    const hasChecklistInforme = issues.some((i) => i.code === 'CHECKLIST_INFORME' && i.message && i.message.includes('ITAU'));
    expect(hasChecklistSaude).toBe(true);
    expect(hasChecklistInforme).toBe(true);
  });
});

describe('IRPF Produção - Modelo de pendências (Task 7.2)', () => {
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
    mockIssues.length = 0;
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO irpf_producao_issues')) {
        const p = (params || []) as unknown[];
        mockIssues.push({
          id: mockIssues.length + 1,
          case_id: Number(p[0]),
          code: String(p[1]),
          message: String(p[2]),
          severity: String(p[3]),
          status: String(p[4]),
          owner: undefined,
          due_date: undefined,
        });
        return [];
      }
      if (sql.includes('irpf_producao_issues') && sql.includes('SELECT')) {
        return mockIssues.map(({ id, case_id, code, message, severity, status, owner, due_date }) => ({
          id,
          case_id,
          code,
          message,
          severity,
          status,
          created_at: new Date(),
          owner: owner ?? null,
          due_date: due_date ?? null,
        }));
      }
      if (sql.includes('irpf_producao_case_people')) return [];
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) {
        return [{ ...caseRow }];
      }
      if (sql.includes('SELECT id FROM irpf_producao_cases')) return [{ id: 1 }];
      if (sql.startsWith('UPDATE') || sql.includes('DELETE')) return [];
      return [];
    });
  });

  it('GET /cases/:id deve retornar issues com severity INFO|WARN|BLOCKER, status, owner e due_date', async () => {
    mockIssues.push({
      id: 1,
      case_id: 1,
      code: 'CHECKLIST_SAUDE',
      message: 'Comprovar despesas',
      severity: 'WARN',
      status: 'OPEN',
      owner: 'user@test.com',
      due_date: '2025-03-01',
    });
    const res = await request(app).get('/api/irpf-producao/cases/1');
    expect(res.status).toBe(200);
    expect(res.body?.data?.issues).toBeDefined();
    const issues = res.body.data.issues as { code?: string; severity: string; status: string; owner?: string | null; due_date?: string | null }[];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    for (const issue of issues) {
      expect(VALID_SEVERITIES).toContain(issue.severity);
      expect(VALID_STATUSES).toContain(issue.status);
      expect(issue).toHaveProperty('owner');
      expect(issue).toHaveProperty('due_date');
    }
    const first = issues.find((i) => (i as { code?: string }).code === 'CHECKLIST_SAUDE') || issues[0];
    expect(first.owner).toBe('user@test.com');
    expect(first.due_date).toBe('2025-03-01');
  });
});

describe('IRPF Produção - Gate BLOCKER (Task 7.3)', () => {
  let app: Express;
  const caseRow = {
    id: 1,
    case_code: 'C0000001',
    exercicio: 2025,
    ano_base: 2024,
    status: 'PENDING_DOCS',
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
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      const p = (params || []) as unknown[];
      if (sql.includes('irpf_producao_issues') && sql.includes('severity = ?') && p[1] === 'BLOCKER' && p[2] === 'OPEN') {
        return [{ id: 1 }];
      }
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) {
        return [{ ...caseRow }];
      }
      if (sql.includes('SELECT id, status FROM irpf_producao_cases')) return [{ id: 1, status: 'PENDING_DOCS' }];
      if (sql.startsWith('UPDATE') || sql.includes('INSERT INTO irpf_producao_audit')) return [];
      if (sql.includes('SELECT * FROM irpf_producao_cases')) return [{ ...caseRow, status: 'READY_FOR_REVIEW' }];
      return [];
    });
  });

  it('POST /cases/:id/status com READY_FOR_REVIEW deve retornar 400 e code BLOCKER_GATE quando houver issue BLOCKER OPEN', async () => {
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/status')
      .send({ status: 'READY_FOR_REVIEW' });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('BLOCKER_GATE');
    expect(res.body?.error).toMatch(/BLOCKER|revisão/);
  });

  it('POST /cases/:id/status com READY_FOR_REVIEW deve retornar 200 quando não houver BLOCKER OPEN', async () => {
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      const p = (params || []) as unknown[];
      if (sql.includes('irpf_producao_issues') && sql.includes('severity = ?') && p[1] === 'BLOCKER') return [];
      if (sql.includes('irpf_producao_cases') && sql.includes('WHERE id')) return [{ ...caseRow }];
      if (sql.includes('SELECT id, status FROM irpf_producao_cases')) return [{ id: 1, status: 'PENDING_DOCS' }];
      if (sql.startsWith('UPDATE') || sql.includes('INSERT INTO irpf_producao_audit')) return [];
      if (sql.includes('SELECT * FROM irpf_producao_cases')) return [{ ...caseRow, status: 'READY_FOR_REVIEW' }];
      return [];
    });
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/status')
      .send({ status: 'READY_FOR_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });
});
