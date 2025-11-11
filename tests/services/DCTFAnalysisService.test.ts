import { DCTFAnalysisService, AnalysisFinding } from '../../src/services/DCTFAnalysisService';
import { WebSocketGateway } from '../../src/services/WebSocketGateway';

const datasetDeclaracao = {
  id: 'd1',
  clienteId: 'c1',
  periodo: '2025-07',
  dataDeclaracao: new Date('2025-09-20T12:00:00Z').toISOString(),
  situacao: 'Em andamento',
  status: 'concluido',
  debitoApurado: 20000,
  saldoAPagar: 1000,
  cliente: {
    id: 'c1',
    razaoSocial: 'Empresa Exemplo Ltda',
    cnpj: '12.345.678/0001-90',
    cnpjLimpo: '12345678000190',
    regime: 'Lucro Real',
    cnaes: ['6201-5/01'],
  },
  dados: [
    { id: 'l1', linha: 1, codigo: '001', descricao: 'Receita', valor: 15000 },
    { id: 'l2', linha: 2, codigo: '001', descricao: 'Receita', valor: 5000 },
    { id: 'l3', linha: 3, codigo: '101', descricao: 'Dedução', valor: 18000 },
    { id: 'l4', linha: 4, codigo: '201', descricao: 'Retenção', valor: 8000 },
    { id: 'l5', linha: 5, codigo: '001', descricao: 'Receita', valor: -200 },
    { id: 'l6', linha: 6, codigo: '001', descricao: 'Receita', valor: 1000, cnpjCpf: '003333444455556' },
  ],
  stats: {
    receitaTotal: 18800,
    deducaoTotal: 18000,
    retencaoTotal: 8000,
    linhas: 6,
  },
  metadata: {
    createdAt: new Date('2025-08-01T12:00:00Z').toISOString(),
    updatedAt: new Date('2025-09-20T12:00:00Z').toISOString(),
  },
};

const clienteDataset = {
  declaracoes: [
    datasetDeclaracao,
    { ...datasetDeclaracao, periodo: '2025-05' },
  ],
  generatedAt: new Date().toISOString(),
  filters: {},
  totals: { declaracoes: 2, clientes: 1, periodos: 2 },
};

jest.mock('../../src/models/DCTF', () => ({
  DCTF: jest.fn().mockImplementation(() => ({
    findBy: jest.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'd1' }, { id: 'd2' }],
    }),
  })),
}));

const upsertFlagMock = jest.fn().mockResolvedValue({ success: true });

jest.mock('../../src/models/Flag', () => ({
  Flag: jest.fn().mockImplementation(() => ({
    criarFlagAutomatica: jest.fn().mockResolvedValue({ success: true }),
    upsertFlag: upsertFlagMock,
  })),
}));

const buildDatasetMock = jest.fn((params: any) => {
  if (params?.declaracaoId) {
    return Promise.resolve({ success: true, data: { ...clienteDataset, declaracoes: [datasetDeclaracao] } });
  }
  return Promise.resolve({ success: true, data: clienteDataset });
});

jest.mock('../../src/services/DCTFIngestionService', () => ({
  DCTFIngestionService: jest.fn().mockImplementation(() => ({
    buildDataset: buildDatasetMock,
  })),
}));

describe('DCTFAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upsertFlagMock.mockClear();
  });

  it('deve gerar achados com risco e multa estimada', async () => {
    const service = new DCTFAnalysisService();
    const result = await service.analyzeDeclaracao('d1');

    expect(result.success).toBe(true);
    const data = result.data!;
    expect(data.summary.numFindings).toBeGreaterThan(0);
    expect(data.riskScore).toBeGreaterThan(0);
    expect(data.estimatedPenalty).toBeGreaterThan(0);

    const codes = data.findings.map((f: AnalysisFinding) => f.code);
    expect(codes).toContain('ENTREGA_FORA_DO_PRAZO');
    expect(codes).toContain('RETENCAO_SUPERIOR_RECEITA_LIQUIDA');
    expect(codes).toContain('OMISSAO_DECLARACAO');
  });

  it('deve emitir eventos em tempo real ao concluir análise e gerar flags críticas', async () => {
    const emitToClient = jest.fn();
    const emitToAnalysis = jest.fn();
    const broadcastCritical = jest.fn();

    const gatewayMock = {
      emitToClient,
      emitToAnalysis,
      broadcastCritical,
      getMetrics: jest.fn(),
    } as unknown as WebSocketGateway;

    const getInstanceSpy = jest.spyOn(WebSocketGateway, 'getInstance').mockReturnValue(gatewayMock);

    const service = new DCTFAnalysisService();
    const result = await service.analyzeDeclaracao('d1');

    expect(result.success).toBe(true);
    expect(getInstanceSpy).toHaveBeenCalled();

    expect(emitToClient).toHaveBeenCalledWith(
      'analysis.completed',
      'c1',
      expect.objectContaining({
        dctfId: 'd1',
        clienteId: 'c1',
        periodo: expect.any(String),
        riskScore: expect.any(Number),
        summary: expect.objectContaining({
          critical: expect.any(Number),
          high: expect.any(Number),
        }),
      }),
    );

    expect(emitToAnalysis).toHaveBeenCalledWith(
      'analysis.completed',
      'd1',
      expect.objectContaining({
        findings: expect.any(Array),
        estimatedPenalty: expect.any(Number),
      }),
    );

    expect(broadcastCritical).toHaveBeenCalledWith(
      'flags.created',
      expect.objectContaining({
        severidade: 'critica',
        clienteId: 'c1',
      }),
    );
    expect(upsertFlagMock).toHaveBeenCalled();

    getInstanceSpy.mockRestore();
  });
});


