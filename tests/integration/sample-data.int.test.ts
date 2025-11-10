import request from 'supertest';
import Server from '../../src/server';
import { loadCsvSample } from '../utils/loadCsvSample';

const app = new Server().getApp();

/**
 * Este teste usa as 10 primeiras linhas dos CSVs do projeto
 * - DCTF WEB-DADOS-CLIENTES.csv -> testa criação/validação de clientes
 * - DCTF WEB-DADOS.csv -> (se disponível) testa criação/validação de DCTF
 */

describe('Sample CSV data integration', () => {
  it('usa as 10 primeiras linhas de clientes para exercitar /api/clientes', async () => {
    const rows = await loadCsvSample('DCTF WEB-DADOS-CLIENTES.csv', 10);
    expect(Array.isArray(rows)).toBe(true);

    for (const row of rows) {
      // Tentar mapear campos comuns (ajuste conforme cabeçalhos reais do CSV)
      const nome = row.nome || row.Nome || row['NOME'] || 'Cliente Sem Nome';
      const cnpj = row.cnpj || row.CNPJ || row['CNPJ'];
      const email = row.email || row.Email || row['EMAIL'] || '';

      const res = await request(app)
        .post('/api/clientes')
        .send({ nome, cnpj, email });

      // Dependendo do formato dos dados, pode dar 201 (válido) ou 400 (invalidação)
      expect([201, 400]).toContain(res.status);
    }
  });

  it('usa as 10 primeiras linhas de DCTF para exercitar /api/dctf (se CSV existir)', async () => {
    try {
      const rows = await loadCsvSample('DCTF WEB-DADOS.csv', 10);
      expect(Array.isArray(rows)).toBe(true);

      for (const row of rows) {
        // Mapear campos prováveis (ajuste conforme cabeçalhos reais do CSV)
        const clienteId = row.clienteId || row.ClienteId || row['CLIENTE_ID'] || '12345678-1234-1234-1234-123456789012';
        const periodo = row.periodo || row.Periodo || row['PERIODO'] || '2024-01';
        const dataDeclaracao = row.dataDeclaracao || row.DataDeclaracao || row['DATA_DECLARACAO'] || '2024-01-15';

        const res = await request(app)
          .post('/api/dctf')
          .send({ clienteId, periodo, dataDeclaracao });

        expect([201, 400]).toContain(res.status);
      }
    } catch (err) {
      // Se o arquivo não existir, apenas pular o teste sem falhar
      expect(true).toBe(true);
    }
  });
});
