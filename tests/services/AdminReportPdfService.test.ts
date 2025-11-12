import { AdminReportPdfService } from '../../src/services/AdminReportPdfService';
import ReportPdfService from '../../src/services/reports/ReportPdfService';

jest.mock('../../src/services/reports/ReportPdfService', () => {
  const generate = jest.fn();
  return {
    __esModule: true,
    default: {
      generate,
    },
  };
});

describe('AdminReportPdfService', () => {
  const generateMock = ReportPdfService.generate as jest.Mock;

  beforeEach(() => {
    generateMock.mockResolvedValue(Buffer.from('fake-pdf'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates generation to ReportPdfService with provided options', async () => {
    const options = {
      months: 6,
      title: 'Relatório Teste',
      period: '10/2025',
      identification: '00.111.222/0001-33',
      responsible: 'Fulano',
      notes: 'Observação',
    };

    await AdminReportPdfService.generateGerencialReport(options);

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock).toHaveBeenCalledWith('gerencial', options);
  });

  it('retorna o buffer gerado pelo serviço base', async () => {
    const fakeBuffer = Buffer.from('fake-pdf');
    generateMock.mockResolvedValueOnce(fakeBuffer);

    const result = await AdminReportPdfService.generateGerencialReport();

    expect(result).toBe(fakeBuffer);
  });
});
