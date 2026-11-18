/**
 * Trava das rotas da Administração: sem credencial válida, a ação não roda.
 */
import express from 'express';
import request from 'supertest';
import { requireAdmin } from '../../src/middleware/requireAdmin';
import { emitirToken } from '../../src/services/AdminAuthService';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';

function app() {
  const a = express();
  const acao = jest.fn((_req, res) => res.json({ ok: true }));
  a.post('/acao', requireAdmin, acao);
  return { a, acao };
}

describe('requireAdmin', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env['ADMIN_PASSWORD'] = 'senha-de-teste-123';
    process.env['ADMIN_TOKEN_SECRET'] = SEGREDO;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('deixa passar com credencial válida', async () => {
    const { a, acao } = app();
    const { token } = emitirToken();
    const r = await request(a).post('/acao').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('401 sem credencial, e a ação não roda', async () => {
    const { a, acao } = app();
    const r = await request(a).post('/acao');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: expect.stringMatching(/administra/i), code: 'ADMIN_REQUIRED' });
    expect(acao).not.toHaveBeenCalled();
  });

  it.each([['Bearer lixo'], ['Bearer '], ['Basic YWRtaW46YWRtaW4='], ['lixo']])('401 com Authorization %p', async (h) => {
    const { a, acao } = app();
    const r = await request(a).post('/acao').set('Authorization', h);
    expect(r.status).toBe(401);
    expect(acao).not.toHaveBeenCalled();
  });

  it('401 com credencial vencida', async () => {
    const { a, acao } = app();
    const { token } = emitirToken(Date.now() - 24 * 60 * 60 * 1000);
    const r = await request(a).post('/acao').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
    expect(acao).not.toHaveBeenCalled();
  });

  it('503 quando a senha de administrador não está configurada no servidor (falha fechada)', async () => {
    delete process.env['ADMIN_PASSWORD'];
    const { a, acao } = app();
    const r = await request(a).post('/acao');
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('ADMIN_NOT_CONFIGURED');
    expect(acao).not.toHaveBeenCalled();
  });
});
