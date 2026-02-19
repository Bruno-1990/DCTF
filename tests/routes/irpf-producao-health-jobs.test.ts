/**
 * Testes para endpoints Task 13: health (RNF-033) e jobs (RNF-032)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

describe('IRPF Produção - Health e Jobs', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const irpfProducaoRoutes = require('../../src/routes/irpf-producao').default;
    app.use('/api/irpf-producao', irpfProducaoRoutes);
  });

  describe('GET /api/irpf-producao/health (RNF-033)', () => {
    it('deve existir rota GET /health', async () => {
      const res = await request(app).get('/api/irpf-producao/health');
      expect([200, 503]).toContain(res.status);
    });

    it('deve retornar JSON com status, mysql e share', async () => {
      const res = await request(app).get('/api/irpf-producao/health');
      expect(res.body).toBeDefined();
      expect(typeof res.body.status).toBe('string');
      expect(typeof res.body.mysql).toBe('boolean');
      expect(typeof res.body.share).toBe('boolean');
    });
  });

  describe('GET /api/irpf-producao/jobs (RNF-032)', () => {
    it('sem perfil deve retornar 403', async () => {
      const res = await request(app).get('/api/irpf-producao/jobs');
      expect(res.status).toBe(403);
    });

    it('com x-user-profile deve responder 200 ou 500', async () => {
      const res = await request(app)
        .get('/api/irpf-producao/jobs')
        .set('x-user-profile', 'Operador');
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('success', true);
        expect(Array.isArray(res.body.runs)).toBe(true);
      }
    });
  });
});
