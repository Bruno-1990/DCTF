import request from 'supertest';
import Server from '../../src/server';

const app = new Server().getApp();

describe('e-BEF API (integração)', () => {
  // ── GET /api/clientes/ebef ──
  it('GET /api/clientes/ebef deve responder 200 com array', async () => {
    const res = await request(app).get('/api/clientes/ebef');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
    if (res.body.success) {
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  it('GET /api/clientes/ebef retorna estrutura correta para cada parent', async () => {
    const res = await request(app).get('/api/clientes/ebef');
    expect(res.status).toBe(200);
    if (res.body.success && res.body.data.length > 0) {
      const parent = res.body.data[0];
      expect(parent).toHaveProperty('id');
      expect(parent).toHaveProperty('razao_social');
      expect(parent).toHaveProperty('cnpj_limpo');
      expect(parent).toHaveProperty('socios_pj');
      expect(Array.isArray(parent.socios_pj)).toBe(true);
    }
  });

  it('GET /api/clientes/ebef — sócios PJ têm CNPJ de 14 dígitos', async () => {
    const res = await request(app).get('/api/clientes/ebef');
    if (res.body.success && res.body.data.length > 0) {
      for (const parent of res.body.data) {
        for (const socio of parent.socios_pj) {
          expect(socio).toHaveProperty('cnpj_filho');
          const cnpjLimpo = (socio.cnpj_filho || '').replace(/\D/g, '');
          expect(cnpjLimpo).toHaveLength(14);
        }
      }
    }
  });

  // ── GET /api/clientes/ebef/progresso ──
  it('GET /api/clientes/ebef/progresso deve responder 200 com contadores', async () => {
    const res = await request(app).get('/api/clientes/ebef/progresso');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('concluidos');
    expect(res.body.data).toHaveProperty('pendentes');
    expect(res.body.data).toHaveProperty('erros');
    expect(res.body.data).toHaveProperty('em_andamento');
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.em_andamento).toBe('boolean');
  });

  // ── POST /api/clientes/ebef/consultar ──
  it('POST /api/clientes/ebef/consultar sem consultaId deve responder 400', async () => {
    const res = await request(app)
      .post('/api/clientes/ebef/consultar')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toMatch(/consultaId/i);
  });

  it('POST /api/clientes/ebef/consultar com ID inexistente deve retornar erro', async () => {
    const res = await request(app)
      .post('/api/clientes/ebef/consultar')
      .send({ consultaId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', false);
  });

  // ── POST /api/clientes/ebef/lote ──
  it('POST /api/clientes/ebef/lote deve responder 200 ou 202', async () => {
    const res = await request(app)
      .post('/api/clientes/ebef/lote')
      .send({});
    // 200 se nenhum pendente, 202 se iniciou batch, 409 se já rodando
    expect([200, 202, 409]).toContain(res.status);
    expect(res.body).toHaveProperty('success');
  });

  // ── Rotas existem antes de /:id ──
  it('Rota /ebef não é capturada pelo /:id', async () => {
    const res = await request(app).get('/api/clientes/ebef');
    // Se /:id capturasse, retornaria 400 (UUID inválido) ou 404
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
  });
});
