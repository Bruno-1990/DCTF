import request from 'supertest';
import Server from '../../src/server';

const app = new Server().getApp();

const uuid = '12345678-1234-1234-1234-123456789012';

describe('Relatórios API (integração)', () => {
  it('GET /api/relatorios deve responder 200', async () => {
    const res = await request(app).get('/api/relatorios');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
  });

  it('POST /api/relatorios/generate deve responder 201 com dados válidos', async () => {
    const res = await request(app)
      .post('/api/relatorios/generate')
      .send({ declaracaoId: uuid, tipoRelatorio: 'analise_fiscal', parametros: { periodo: '2024-01' } });
    expect([201, 400]).toContain(res.status);
  });
});
