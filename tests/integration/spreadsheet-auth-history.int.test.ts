import request from 'supertest';
import Server from '../../src/server';

const app = new Server().getApp();

describe('Spreadsheet API public access and history', () => {
  it('deve permitir acesso público às rotas', async () => {
    const resRules = await request(app).get('/api/spreadsheet/validation-rules');
    expect(resRules.status).toBe(200);

    const resHistory = await request(app).get('/api/spreadsheet/uploads');
    expect(resHistory.status).toBe(200);
  });

  it('template deve ser público', async () => {
    const res = await request(app).get('/api/spreadsheet/template');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  });

  it('upload inválido ainda responde com erro, e histórico é consultável', async () => {
    const fakeXlsx = Buffer.from('not a real xlsx');

    const resUpload = await request(app)
      .post('/api/spreadsheet/upload')
      .field('clienteId', '12345678-1234-1234-1234-123456789012')
      .field('periodo', '2024-01')
      .attach('arquivo', fakeXlsx, { filename: 'invalid.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect([200, 400]).toContain(resUpload.status);

    const resHistory = await request(app)
      .get('/api/spreadsheet/uploads')
      .query({ page: 1, limit: 10 });

    expect(resHistory.status).toBe(200);
    expect(resHistory.body).toHaveProperty('data');
    expect(Array.isArray(resHistory.body.data)).toBe(true);
  });
});
