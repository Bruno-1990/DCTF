/**
 * Task 8.2 - Middleware RBAC por perfil (Operador, Preparador, Revisor, Auditor, Admin)
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

const mockExecuteQuery = jest.fn();
jest.mock('../../src/config/mysql', () => ({
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
  getConnection: jest.fn(),
}));

const VALID_PROFILES = ['Operador', 'Preparador', 'Revisor', 'Auditor', 'Admin'];
const caseRow = { id: 1, case_code: 'C0000001', exercicio: 2025, status: 'PENDING_DOCS' };

describe('IRPF Produção - RBAC (Task 8.2)', () => {
  let app: Express;

  beforeAll(() => {
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  beforeEach(() => {
    mockExecuteQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('irpf_producao_issues') && sql.includes('severity = ?')) return [];
      if (sql.includes('irpf_producao_cases')) return [{ ...caseRow }];
      if (sql.includes('irpf_producao_audit_events')) return [];
      if (sql.startsWith('UPDATE') || sql.includes('INSERT')) return [];
      return [];
    });
  });

  it('POST /cases/:id/status sem X-User-Profile deve retornar 403 com code RBAC_FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/status')
      .send({ status: 'READY_FOR_REVIEW' });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('RBAC_FORBIDDEN');
  });

  it('POST /cases/:id/status com X-User-Profile: Revisor deve prosseguir (200)', async () => {
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/status')
      .set('X-User-Profile', 'Revisor')
      .send({ status: 'READY_FOR_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  it('PATCH /cases/:id/triage sem perfil válido deve retornar 403 RBAC_FORBIDDEN', async () => {
    const res = await request(app)
      .patch('/api/irpf-producao/cases/1/triage')
      .send({ marcadores: {}, fontes_esperadas: [] });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('RBAC_FORBIDDEN');
  });

  it('PATCH /cases/:id/triage com X-User-Profile: Preparador deve prosseguir (200)', async () => {
    const res = await request(app)
      .patch('/api/irpf-producao/cases/1/triage')
      .set('X-User-Profile', 'Preparador')
      .send({ marcadores: {}, fontes_esperadas: [] });
    expect(res.status).toBe(200);
  });
});
