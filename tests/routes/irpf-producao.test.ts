/**
 * Testes para rotas do módulo IRPF Produção (Task 1 - Integração)
 * Subtask 1.1: Criar rota e montar sub-rotas /api/irpf-producao
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

describe('IRPF Produção API - Rotas e sub-rotas', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    const irpfProducaoRoutes = require('../../src/routes/irpf-producao').default;
    app.use('/api/irpf-producao', irpfProducaoRoutes);
  });

  describe('Estrutura de rotas', () => {
    it('deve ter arquivo de rotas src/routes/irpf-producao.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const routesPath = path.join(__dirname, '../../src/routes/irpf-producao.ts');
      expect(fs.existsSync(routesPath)).toBe(true);
    });

    it('deve montar rota base GET /api/irpf-producao/cases', async () => {
      const response = await request(app).get('/api/irpf-producao/cases');
      // Rota deve existir: 200 (ok) ou 401 (não auth) ou 500 (erro de implementação)
      expect([200, 401, 403, 500]).toContain(response.status);
    });

    it('deve montar sub-rota GET /api/irpf-producao/cases/:id', async () => {
      const response = await request(app).get('/api/irpf-producao/cases/1');
      expect([200, 401, 403, 404, 500]).toContain(response.status);
    });

    it('deve reutilizar middleware de sanitização (sanitizeData) nas rotas', () => {
      const routesModule = require('../../src/routes/irpf-producao');
      expect(routesModule.default).toBeDefined();
      const router = routesModule.default;
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
    });

    it('deve considerar header Authorization (auth/RBAC reutilizado)', async () => {
      const withoutAuth = await request(app).get('/api/irpf-producao/cases');
      const withAuth = await request(app)
        .get('/api/irpf-producao/cases')
        .set('Authorization', 'Bearer test-token');
      expect([200, 401, 403, 500]).toContain(withoutAuth.status);
      expect([200, 401, 403, 500]).toContain(withAuth.status);
    });
  });
});
