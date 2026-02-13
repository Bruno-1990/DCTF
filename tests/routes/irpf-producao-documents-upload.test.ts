/**
 * Testes de upload de documentos IRPF Produção (Task 6)
 * 6.1: Recepção multipart e validação MIME/tamanho máximo
 * 6.2: Validação pré-persistência (corrupção, páginas, tamanho mínimo)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';

describe('IRPF Produção - Upload documentos (Task 6.1)', () => {
  let app: express.Express;

  beforeAll(() => {
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  it('deve rejeitar arquivo com MIME não permitido com 400 e código DOC_MIME_NOT_ALLOWED', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'sample.txt');
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'test');
    }
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', filePath)
      .field('docType', 'CADASTRO')
      .field('source', 'N/A');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('DOC_MIME_NOT_ALLOWED');
  });

  it('deve rejeitar arquivo acima do tamanho máximo com 400 e código DOC_SIZE_EXCEEDED', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'large.pdf');
    const size = 60 * 1024 * 1024;
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.alloc(size));
    }
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', filePath)
      .field('docType', 'CADASTRO')
      .field('source', 'N/A');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('DOC_SIZE_EXCEEDED');
  });
});

describe('IRPF Produção - Upload documentos (Task 6.2)', () => {
  let app: express.Express;

  beforeAll(() => {
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  it('deve rejeitar PDF corrompido com 400 e código DOC_CORRUPTED', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    const corruptedPath = path.join(fixturesDir, 'corrupted.pdf');
    fs.writeFileSync(corruptedPath, Buffer.from('not a valid pdf content'));
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', corruptedPath)
      .field('docType', 'CADASTRO')
      .field('source', 'N/A');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('DOC_CORRUPTED');
  });
});
