/**
 * Login da Administração: troca a senha por uma credencial; tentativas têm limite.
 */
import express from 'express';
import request from 'supertest';
import { criarAdminAuthRouter } from '../../src/routes/admin-auth';
import { validarToken } from '../../src/services/AdminAuthService';

const SENHA = 'senha-de-teste-123';

function app(maxTentativas = 5) {
  const a = express();
  a.use(express.json());
  a.use('/api/admin', criarAdminAuthRouter({ maxTentativasPorMinuto: maxTentativas }));
  return a;
}

describe('rotas /api/admin (login)', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env['ADMIN_PASSWORD'] = SENHA;
    process.env['ADMIN_TOKEN_SECRET'] = 'segredo-de-teste-com-mais-de-32-caracteres!!';
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('senha certa devolve credencial válida e o prazo', async () => {
    const r = await request(app()).post('/api/admin/login').send({ senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(validarToken(r.body.data.token)).toBe(true);
    expect(r.body.data.expiraEm).toBeGreaterThan(Date.now());
  });

  it('senha errada: 401 sem credencial', async () => {
    const r = await request(app()).post('/api/admin/login').send({ senha: 'errada' });
    expect(r.status).toBe(401);
    expect(r.body.success).toBe(false);
    expect(r.body.data).toBeUndefined();
  });

  it('sem senha no corpo: 400', async () => {
    const r = await request(app()).post('/api/admin/login').send({});
    expect(r.status).toBe(400);
  });

  it('servidor sem ADMIN_PASSWORD: 503, nunca entra', async () => {
    delete process.env['ADMIN_PASSWORD'];
    const r = await request(app()).post('/api/admin/login').send({ senha: '' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('ADMIN_NOT_CONFIGURED');
  });

  it('limita as tentativas de senha (429 depois do máximo)', async () => {
    const a = app(3);
    for (let i = 0; i < 3; i++) {
      expect((await request(a).post('/api/admin/login').send({ senha: 'errada' })).status).toBe(401);
    }
    const r = await request(a).post('/api/admin/login').send({ senha: SENHA });
    expect(r.status).toBe(429);
  });

  it('GET /sessao: 200 com credencial válida, 401 sem', async () => {
    const a = app();
    const login = await request(a).post('/api/admin/login').send({ senha: SENHA });
    const ok = await request(a).get('/api/admin/sessao').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(ok.status).toBe(200);
    expect((await request(a).get('/api/admin/sessao')).status).toBe(401);
  });
});
