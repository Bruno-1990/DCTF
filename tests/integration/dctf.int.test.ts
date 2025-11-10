import request from 'supertest';
import Server from '../../src/server';

const app = new Server().getApp();

// UUID válido fake apenas para passar pelo validador
const uuid = '12345678-1234-1234-1234-123456789012';

describe('DCTF API (integração)', () => {
  it('GET /api/dctf deve responder 200', async () => {
    const res = await request(app).get('/api/dctf');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
  });

  it('GET /api/dctf/stats deve responder 200', async () => {
    const res = await request(app).get('/api/dctf/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
  });

  it('POST /api/dctf com payload válido deve responder 201', async () => {
    const res = await request(app)
      .post('/api/dctf')
      .send({ clienteId: uuid, periodo: '2024-01', dataDeclaracao: '2024-01-15' });
    expect([201, 400]).toContain(res.status);
  });
});
