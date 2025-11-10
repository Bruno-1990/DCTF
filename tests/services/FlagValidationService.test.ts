import { FlagValidationService } from '../../src/services/FlagValidationService';
import { AuditTrailService } from '../../src/services/AuditTrailService';

const analysisMock = {
  analyzeDeclaracao: jest.fn(),
};

const ingestionMock = {
  buildDataset: jest.fn(),
};

const flagModelMock = {
  findByDeclaracao: jest.fn(),
};

const alertMock = {
  notifyCritical: jest.fn().mockResolvedValue(undefined),
  notifyHigh: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/services/DCTFAnalysisService', () => ({
  DCTFAnalysisService: jest.fn().mockImplementation(() => analysisMock),
}));

jest.mock('../../src/services/DCTFIngestionService', () => ({
  DCTFIngestionService: jest.fn().mockImplementation(() => ingestionMock),
}));

jest.mock('../../src/models/Flag', () => ({
  Flag: jest.fn().mockImplementation(() => flagModelMock),
}));

jest.mock('../../src/services/FlagAlertService', () => ({
  FlagAlertService: jest.fn().mockImplementation(() => alertMock),
}));

jest.mock('../../src/services/AuditTrailService', () => ({
  AuditTrailService: {
    record: jest.fn().mockResolvedValue(undefined),
  },
}));

const sampleAnalysis = {
  dctfId: 'd1',
  findings: [],
  summary: { numFindings: 0, critical: 0, high: 0, medium: 0, low: 0 },
  riskScore: 0,
  estimatedPenalty: 0,
};

describe('FlagValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    analysisMock.analyzeDeclaracao.mockResolvedValue({ success: true, data: sampleAnalysis });
    flagModelMock.findByDeclaracao.mockResolvedValue({
      success: true,
      data: [
        { id: 'f1', declaracaoId: 'd1', codigoFlag: 'FLAG_ATRASO_ENVIO', descricao: 'Atraso', severidade: 'critica', resolvido: false },
        { id: 'f2', declaracaoId: 'd1', codigoFlag: 'FLAG_VALOR_NEGATIVO', descricao: 'Valor negativo', severidade: 'alta', resolvido: false },
      ],
    });
  });

  it('deve validar flags para uma declaração específica', async () => {
    const service = new FlagValidationService();
    const result = await service.runForDeclaracao('d1');
    expect(result.dctfId).toBe('d1');
    expect(AuditTrailService.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'flags.validation.success' })
    );
    expect(alertMock.notifyCritical).toHaveBeenCalled();
    expect(alertMock.notifyHigh).toHaveBeenCalled();
  });

  it('deve rodar validação em lote por cliente', async () => {
    ingestionMock.buildDataset.mockResolvedValue({
      success: true,
      data: {
        declaracoes: [{ id: 'd1' }, { id: 'd2' }],
        totals: { declaracoes: 2, clientes: 1, periodos: 2 },
      },
    });

    const service = new FlagValidationService();
    const results = await service.runForCliente('c1');
    expect(results).toHaveLength(2);
    expect(analysisMock.analyzeDeclaracao).toHaveBeenCalledTimes(2);
  });
});


