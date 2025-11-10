import { DCTFIngestionService } from '../../src/services/DCTFIngestionService';

jest.mock('../../src/services/AuditTrailService', () => ({
  AuditTrailService: {
    record: jest.fn().mockResolvedValue(undefined),
  },
}));

const sampleDeclaracao = {
  id: 'd1',
  clienteId: 'c1',
  periodo: '2025-08',
  dataDeclaracao: new Date('2025-10-05T12:00:00Z'),
  situacao: 'Ativa',
  status: 'concluido',
  debito_apurado: 18000,
  saldo_a_pagar: 500,
  createdAt: new Date('2025-09-01T00:00:00Z'),
  updatedAt: new Date('2025-10-05T12:00:00Z'),
};

const sampleDados = [
  { id: 'l1', linha: 1, codigo: '001', descricao: 'Receita', valor: 25000 },
  { id: 'l2', linha: 2, codigo: '101', descricao: 'Dedução', valor: 3000 },
  { id: 'l3', linha: 3, codigo: '201', descricao: 'Retenção', valor: 500 },
  { id: 'l4', linha: 4, codigo: '001', descricao: 'Receita', valor: 12000 },
];

const sampleCliente = {
  id: 'c1',
  razao_social: 'Empresa Exemplo Ltda',
  cnpj: '12.345.678/0001-90',
  cnpj_limpo: '12345678000190',
  regime_tributario: 'Lucro Real',
  cnaes: ['6201-5/01'],
};

jest.mock('../../src/models/DCTF', () => ({
  DCTF: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue({ success: true, data: [sampleDeclaracao] }),
    findById: jest.fn().mockResolvedValue({ success: true, data: sampleDeclaracao }),
    findBy: jest.fn().mockResolvedValue({ success: true, data: [sampleDeclaracao] }),
  })),
}));

jest.mock('../../src/models/DCTFDados', () => ({
  DCTFDados: jest.fn().mockImplementation(() => ({
    findByDeclaracao: jest.fn().mockResolvedValue({ success: true, data: sampleDados }),
  })),
}));

jest.mock('../../src/models/Cliente', () => ({
  Cliente: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockResolvedValue({ success: true, data: sampleCliente }),
  })),
}));

describe('DCTFIngestionService', () => {
  it('deve consolidar dados normalizados com estatísticas agregadas', async () => {
    const service = new DCTFIngestionService();
    const response = await service.buildDataset({ includeDados: true, includeCliente: true });

    expect(response.success).toBe(true);
    const dataset = response.data!;
    expect(dataset.totals.declaracoes).toBe(1);
    expect(dataset.declaracoes[0].cliente?.razaoSocial).toBe('Empresa Exemplo Ltda');
    expect(dataset.declaracoes[0].stats.receitaTotal).toBe(37000);
    expect(dataset.declaracoes[0].stats.deducaoTotal).toBe(3000);
    expect(dataset.declaracoes[0].stats.retencaoTotal).toBe(500);
  });

  it('deve registrar metadados de geração', async () => {
    const service = new DCTFIngestionService();
    const response = await service.buildDataset({ declaracaoId: 'd1' });
    expect(response.success).toBe(true);
    expect(response.data?.generatedAt).toBeDefined();
    expect(response.data?.filters.declaracaoId).toBe('d1');
  });
});


