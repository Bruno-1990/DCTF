/**
 * Testes de upload de documentos IRPF Produção (Task 6)
 * 6.1: Recepção multipart e validação MIME/tamanho máximo
 * 6.2: Validação pré-persistência (corrupção, páginas, tamanho mínimo)
 * 6.4: Persistência atômica e resposta 201 (mock MySQL)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'os';

jest.mock('../../src/config/mysql', () => ({
  getConnection: jest.fn().mockResolvedValue({
    execute: jest.fn()
      .mockResolvedValueOnce([[{ id: 1, case_code: 'C0000001', exercicio: 2025 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ v: 1 }]])
      .mockResolvedValueOnce([{ insertId: 100 }]),
    release: jest.fn(),
  }),
}));

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

  it('deve rejeitar docType fora da lista 8.3 com 400 e código DOC_TYPE_REQUIRED (Task 6.3)', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    const corruptedPath = path.join(fixturesDir, 'corrupted.pdf');
    fs.writeFileSync(corruptedPath, Buffer.from('not a valid pdf content'));
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', corruptedPath)
      .field('docType', 'INVALID_DOCTYPE')
      .field('source', 'N/A');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('DOC_TYPE_REQUIRED');
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

describe('IRPF Produção - Upload documentos (Task 6.4)', () => {
  let app: express.Express;
  const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  beforeAll(() => {
    const storageDir = path.join(tmpdir(), `irpf-upload-test-${Date.now()}`);
    fs.mkdirSync(storageDir, { recursive: true });
    process.env.IRPF_STORAGE_PATH = storageDir;
    const expressApp = express();
    expressApp.use(express.json());
    const irpfRoutes = require('../../src/routes/irpf-producao').default;
    expressApp.use('/api/irpf-producao', irpfRoutes);
    app = expressApp;
  });

  it('deve aceitar upload válido e retornar 201 com document_id, file_path e version', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    const pngPath = path.join(fixturesDir, 'minimal.png');
    fs.writeFileSync(pngPath, Buffer.from(minimalPngBase64, 'base64'));
    const res = await request(app)
      .post('/api/irpf-producao/cases/1/documents')
      .attach('file', pngPath)
      .field('docType', 'CADASTRO')
      .field('source', 'N/A');
    expect(res.status).toBe(201);
    expect(res.body?.success).toBe(true);
    expect(typeof res.body?.document_id).toBe('number');
    expect(typeof res.body?.file_path).toBe('string');
    expect(res.body?.file_path.length).toBeGreaterThan(0);
    expect(typeof res.body?.version).toBe('number');
  });
});
