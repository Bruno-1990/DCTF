import ExcelJS from 'exceljs';
import ReportXlsxService from '../../src/services/reports/ReportXlsxService';
import ReportDataFactory from '../../src/services/reports/ReportDataFactory';
import {
  ReportDataEnvelope,
  ClientesReportData,
  ReportFilterOptions,
} from '../../src/types';

jest.mock('../../src/services/reports/ReportDataFactory', () => ({
  __esModule: true,
  default: {
    build: jest.fn(),
  },
}));

describe('ReportXlsxService', () => {
  const buildMock = (ReportDataFactory.build as unknown as jest.Mock).mockImplementation(async (_type: string, _options: ReportFilterOptions) => {
    const envelope: ReportDataEnvelope<ClientesReportData> = {
      type: 'clientes',
      generatedAt: new Date().toISOString(),
      filters: {},
      data: {
        items: [
          {
            id: '1',
            businessName: 'Empresa Alfa',
            cnpj: '00.111.222/0001-33',
            cnpjLimpo: '00111222000133',
            totalDeclaracoes: 4,
            ultimoPeriodo: '10/2025',
            ultimoEnvio: '2025-11-02T00:00:00.000Z',
            valores: {
              debitoTotal: 15000,
              saldoTotal: 5000,
            },
            statusSummary: {
              concluido: 2,
              pendente: 1,
              processando: 1,
              erro: 0,
            },
          },
          {
            id: '2',
            businessName: 'Empresa Beta',
            cnpj: '11.222.333/0001-44',
            cnpjLimpo: '11222333000144',
            totalDeclaracoes: 3,
            ultimoPeriodo: '09/2025',
            ultimoEnvio: undefined,
            valores: {
              debitoTotal: 8000,
              saldoTotal: 1500,
            },
            statusSummary: {
              concluido: 1,
              pendente: 1,
              processando: 0,
              erro: 1,
            },
          },
        ],
        totals: {
          clientes: 2,
          declaracoes: 7,
          debitoTotal: 23000,
          saldoTotal: 6500,
        },
      },
    };
    return envelope;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('gera XLSX com cabeçalho formatado, freeze e alinhamento central', async () => {
    const buffer = await ReportXlsxService.generate('clientes', {});

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    expect(worksheet).toBeDefined();
    expect(worksheet.name).toBe('Relatório');
    expect(worksheet.rowCount).toBe(1 + 2); // Cabeçalho + 2 registros

    const view = worksheet.views?.[0];
    expect(view?.state).toBe('frozen');
    expect((view as any)?.ySplit).toBe(1);

    const headerRow = worksheet.getRow(1);
    expect(headerRow.height).toBe(22);
    headerRow.eachCell(cell => {
      expect(cell.font?.bold).toBe(true);
      if (!cell.fill || cell.fill.type !== 'pattern') {
        throw new Error('Cabeçalho deve possuir preenchimento sólido');
      }
      expect(cell.fill.fgColor?.argb).toBe('FFCCE0FF');
      expect(cell.alignment?.horizontal).toBe('center');
      expect(cell.alignment?.vertical).toBe('middle');
    });

    const dataRow = worksheet.getRow(2);
    expect(dataRow.height).toBe(18);
    dataRow.eachCell(cell => {
      expect(cell.alignment?.horizontal).toBe('center');
      expect(cell.alignment?.vertical).toBe('middle');
    });

    worksheet.columns?.forEach(column => {
      expect(column.width).toBeGreaterThanOrEqual(12);
    });
  });
});
