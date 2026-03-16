import ExcelJS from 'exceljs';
import ReportDataFactory from './ReportDataFactory';
import {
  ReportType,
  ReportFilterOptions,
  ReportDataEnvelope,
  GerencialReportData,
  ClientesReportData,
  DCTFReportData,
  ConferenceReportData,
  PendentesReportData,
} from '../../types';

export interface XlsxReportOptions extends ReportFilterOptions {}

type SheetColumn = {
  key: string;
  header: string;
};

type SheetSchema = {
  columns: SheetColumn[];
  rows: Record<string, string>[];
};

const HEADER_BG = 'FF538DD5';
const HEADER_TEXT = 'FFFFFFFF';
const DCTF_OK_FILL = 'FFC6EFCE';      // verde claro
const DCTF_REVISAR_FILL = 'FFFFF2CC'; // amarelo claro
const LIGHT_BORDER = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } };

export class ReportXlsxService {
  static async generate(type: ReportType, options: XlsxReportOptions = {}): Promise<Buffer> {
    const envelope = await ReportDataFactory.build(type, options);
    const schema = this.buildSchema(type, envelope);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório');

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const isDctf = type === 'dctf';
    const headerHeight = isDctf ? 25 : 30;
    const rowHeight = isDctf ? 20 : 25;

    worksheet.columns = schema.columns.map(column => ({ header: column.header, key: column.key, width: column.header.length + 4 }));
    const headerRow = worksheet.getRow(1);
    headerRow.height = headerHeight;
    headerRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_BG },
      };
      cell.font = {
        bold: true,
        color: { argb: HEADER_TEXT },
        name: 'Calibri',
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      if (isDctf) {
        cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
      }
    });

    const razaoSocialColIndex = schema.columns.findIndex(c => c.key === 'razaoSocial') + 1;
    const descricaoColIndex = schema.columns.findIndex(c => c.key === 'descricao') + 1;

    schema.rows.forEach((rowData, index) => {
      const row = worksheet.addRow(rowData);
      row.height = rowHeight;
      const statusDctf = isDctf && rowData && typeof rowData === 'object' && 'statusDctf' in rowData ? (rowData as { statusDctf?: string }).statusDctf : undefined;
      const rowFill = isDctf && statusDctf === 'OK' ? DCTF_OK_FILL : isDctf && statusDctf === 'REVISAR' ? DCTF_REVISAR_FILL : undefined;
      row.eachCell((cell, colNumber) => {
        const isRazaoSocial = isDctf && razaoSocialColIndex > 0 && colNumber === razaoSocialColIndex;
        const isDescricao = isDctf && descricaoColIndex > 0 && colNumber === descricaoColIndex;
        cell.alignment = {
          vertical: 'middle',
          horizontal: isRazaoSocial || isDescricao ? 'left' : 'center',
          wrapText: false,
        };
        if (rowFill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
        }
        if (isDctf) {
          cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
        }
      });
    });

    this.autoFitColumns(worksheet, schema.columns);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private static autoFitColumns(worksheet: ExcelJS.Worksheet, columns: SheetColumn[]) {
    columns.forEach((column, index) => {
      const excelColumn = worksheet.getColumn(index + 1);
      let maxLength = column.header.length;
      excelColumn.eachCell({ includeEmpty: false }, cell => {
        const value = cell.value === undefined || cell.value === null ? '' : String(cell.value);
        maxLength = Math.max(maxLength, value.length);
      });
      excelColumn.width = Math.min(Math.max(maxLength + 4, 12), 50);
    });
  }

  private static buildSchema(type: ReportType, envelope: ReportDataEnvelope): SheetSchema {
    switch (type) {
      case 'gerencial':
        return this.buildGerencialSchema(envelope as ReportDataEnvelope<GerencialReportData>);
      case 'clientes':
        return this.buildClientesSchema(envelope as ReportDataEnvelope<ClientesReportData>);
      case 'dctf':
        return this.buildDctfSchema(envelope as ReportDataEnvelope<DCTFReportData>);
      case 'conferencia':
        return this.buildConferenceSchema(envelope as ReportDataEnvelope<ConferenceReportData>);
      case 'pendentes':
        return this.buildPendentesSchema(envelope as ReportDataEnvelope<PendentesReportData>);
      default:
        throw new Error(`Tipo de relatório não suportado: ${type satisfies never}`);
    }
  }

  private static buildGerencialSchema(envelope: ReportDataEnvelope<GerencialReportData>): SheetSchema {
    const columns: SheetColumn[] = [
      { key: 'identification', header: 'Identificação' },
      { key: 'businessName', header: 'Razão Social' },
      { key: 'period', header: 'Competência' },
      { key: 'transmissionDate', header: 'Entrega' },
      { key: 'status', header: 'Status' },
      { key: 'situation', header: 'Situação' },
      { key: 'debitAmount', header: 'Débito Apurado' },
      { key: 'balanceDue', header: 'Saldo em Aberto' },
      { key: 'alerts', header: 'Alertas Ativos' },
    ];

    const alertsById = new Map<string, string[]>();
    envelope.data.metrics.alerts.forEach(alert => {
      const key = alert.identification ?? '';
      const existing = alertsById.get(key) ?? [];
      existing.push(`${alert.severity.toUpperCase()}: ${alert.message}`);
      alertsById.set(key, existing);
    });

    const rows = envelope.data.records.map(record => {
      const alertMessages = alertsById.get(record.identification ?? '') ?? [];
      return {
        identification: record.identification ?? '—',
        businessName: record.businessName ?? '—',
        period: record.period ?? '—',
        transmissionDate: this.formatDate(record.transmissionDate),
        status: record.status ?? '—',
        situation: record.situation ?? '—',
        debitAmount: this.formatCurrency(record.debitAmount),
        balanceDue: this.formatCurrency(record.balanceDue),
        alerts: alertMessages.join('; ') || '—',
      };
    });

    return { columns, rows };
  }

  private static buildClientesSchema(envelope: ReportDataEnvelope<ClientesReportData>): SheetSchema {
    const columns: SheetColumn[] = [
      { key: 'businessName', header: 'Razão Social' },
      { key: 'cnpj', header: 'CNPJ' },
      { key: 'totalDeclarations', header: 'Declarações' },
      { key: 'debitTotal', header: 'Débito Total' },
      { key: 'balanceTotal', header: 'Saldo Total' },
      { key: 'lastPeriod', header: 'Último Período' },
      { key: 'lastSubmission', header: 'Último Envio' },
      { key: 'statusSummary', header: 'Conc. / Pend. / Proc. / Erro' },
    ];

    const rows = envelope.data.items.map(item => ({
      businessName: item.businessName ?? '—',
      cnpj: item.cnpj ?? item.cnpjLimpo ?? '—',
      totalDeclarations: String(item.totalDeclaracoes ?? 0),
      debitTotal: this.formatCurrency(item.valores.debitoTotal),
      balanceTotal: this.formatCurrency(item.valores.saldoTotal),
      lastPeriod: item.ultimoPeriodo ?? '—',
      lastSubmission: this.formatDate(item.ultimoEnvio),
      statusSummary: `${item.statusSummary.concluido}/${item.statusSummary.pendente}/${item.statusSummary.processando}/${item.statusSummary.erro}`,
    }));

    return { columns, rows };
  }

  private static formatMovimentacao(value: boolean | string | undefined): string {
    if (value === true || value === 'Sim' || value === 'sim' || value === 'S') return 'Sim';
    if (value === false || value === 'Não' || value === 'nao' || value === 'N') return 'Não';
    return '—';
  }

  private static buildDctfSchema(envelope: ReportDataEnvelope<DCTFReportData>): SheetSchema {
    const columns: SheetColumn[] = [
      { key: 'cnpj', header: 'CNPJ' },
      { key: 'razaoSocial', header: 'Razão Social' },
      { key: 'codSci', header: 'Cod SCI' },
      { key: 'competencia', header: 'Competência' },
      { key: 'periodoApuracao', header: 'Período de Apuração' },
      { key: 'statusDctf', header: 'Status DCTF' },
      { key: 'movimentacaoFiscal', header: 'Fisc.' },
      { key: 'movimentacaoContabil', header: 'Cont.' },
      { key: 'movimentacaoTrabalhista', header: 'Trab.' },
      { key: 'totalMovimentacoes', header: 'QTD' },
      { key: 'descricao', header: 'Descrição' },
    ];

    const rows = envelope.data.items.map(item => ({
      cnpj: item.cnpj ?? '—',
      razaoSocial: item.razaoSocial ?? '—',
      codSci: item.codSci ?? '—',
      competencia: item.competencia ?? '—',
      periodoApuracao: item.periodoApuracao ?? '—',
      statusDctf: item.statusDctf,
      movimentacaoFiscal: this.formatMovimentacao(item.movimentacaoFiscal),
      movimentacaoTrabalhista: this.formatMovimentacao(item.movimentacaoTrabalhista),
      movimentacaoContabil: this.formatMovimentacao(item.movimentacaoContabil),
      totalMovimentacoes: item.totalMovimentacoes != null ? String(item.totalMovimentacoes) : '—',
      descricao: item.descricao ?? '—',
    }));

    return { columns, rows };
  }

  private static buildConferenceSchema(envelope: ReportDataEnvelope<ConferenceReportData>): SheetSchema {
    const columns: SheetColumn[] = [
      { key: 'identification', header: 'Identificação' },
      { key: 'businessName', header: 'Razão Social' },
      { key: 'period', header: 'Competência' },
      { key: 'dueDate', header: 'Prazo Legal' },
      { key: 'transmissionDate', header: 'Entrega' },
      { key: 'severity', header: 'Severidade' },
      { key: 'daysLate', header: 'Dias em Atraso' },
      { key: 'message', header: 'Mensagem' },
    ];

    const rows = envelope.data.summary.rules.dueDate.map(issue => ({
      identification: issue.identification,
      businessName: issue.businessName ?? '—',
      period: issue.period ?? '—',
      dueDate: this.formatDate(issue.dueDate),
      transmissionDate: this.formatDate(issue.transmissionDate),
      severity: this.translateSeverity(issue.severity),
      daysLate: issue.daysLate != null ? String(issue.daysLate) : '—',
      message: issue.message,
    }));

    return { columns, rows };
  }

  private static formatDate(value?: string | null): string {
    if (!value || value === '—' || value === null) {
      return '—';
    }
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      // Se a string original contém hora (T ou Z), formatar com hora
      if (typeof value === 'string' && (value.includes('T') || value.includes('Z'))) {
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
      return date.toLocaleDateString('pt-BR');
    } catch {
      return value;
    }
  }

  private static formatCurrency(value: unknown): string {
    const numberValue = this.toNumber(value);
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return formatter.format(numberValue);
  }

  private static formatIdentifier(value: string): string {
    if (!value) return '—';
    const cleaned = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (cleaned.length === 14) {
      return cleaned
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return value;
  }

  private static toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/[^0-9,-]+/g, '').replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value == null) {
      return 0;
    }
    return Number(value) || 0;
  }

  private static buildPendentesSchema(envelope: ReportDataEnvelope<PendentesReportData>): SheetSchema {
    // Ordem das colunas: CNPJ, Contribuinte, e depois as outras
    const columns: SheetColumn[] = [
      { key: 'identification', header: 'CNPJ' },
      { key: 'businessName', header: 'Contribuinte' },
      { key: 'periodoApuracao', header: 'PERÍODO DE APURAÇÃO' },
      { key: 'dataTransmissao', header: 'DATA TRANSMISSÃO' },
      { key: 'categoria', header: 'CATEGORIA' },
      { key: 'origem', header: 'ORIGEM' },
      { key: 'tipoDeclaracao', header: 'TIPO' },
      { key: 'situation', header: 'SITUAÇÃO' },
      { key: 'debitAmount', header: 'DÉBITO APURADO' },
      { key: 'balanceDue', header: 'SALDO A PAGAR' },
    ];

    const rows: Record<string, string>[] = [];

    // Gerar apenas uma linha por registro DCTF encontrado
    // Não incluir linha "PENDENTE" separada - apenas os registros
    envelope.data.items.forEach((item) => {
      // Para cada registro DCTF encontrado, criar uma linha individual
      if (item.ultimosRegistros.length > 0) {
        item.ultimosRegistros.forEach((registro) => {
          // Formatar CNPJ (usar numeroIdentificacao se disponível, senão usar identification)
          const cnpjParaFormatar = registro.numeroIdentificacao || registro.identification || '';
          const cnpjFormatado = cnpjParaFormatar ? this.formatIdentifier(cnpjParaFormatar) : '—';
          
          // Nome da empresa
          const businessName = registro.businessName || item.businessName || '—';
          
          // Formatar data de transmissão com hora se disponível
          let dataTransmissaoFormatada = '—';
          if (registro.dataTransmissao || registro.transmissionDate) {
            const dataTransmissao = registro.dataTransmissao || registro.transmissionDate;
            dataTransmissaoFormatada = this.formatDate(dataTransmissao);
            // Se já não incluiu hora na formatação e temos horaTransmissao, adicionar
            if (registro.horaTransmissao && !dataTransmissaoFormatada.includes(':')) {
              dataTransmissaoFormatada += `, ${registro.horaTransmissao}`;
            }
          }
          
          rows.push({
            // Colunas na ordem: CNPJ, Contribuinte, e depois as outras
            identification: cnpjFormatado,
            businessName: businessName,
            periodoApuracao: registro.periodoApuracao || registro.period || '—',
            dataTransmissao: dataTransmissaoFormatada,
            categoria: registro.categoria || '—',
            origem: registro.origem || registro.origin || '—',
            tipoDeclaracao: registro.tipo || '—',
            situation: registro.situation || '—',
            debitAmount: this.formatCurrency(registro.debitAmount),
            balanceDue: this.formatCurrency(registro.balanceDue),
          });
        });
      }
      // Se não houver registros, não adicionar linha (não mostrar "Nenhum registro encontrado")
    });

    return { columns, rows };
  }

  private static translateSeverity(value: string): string {
    switch (value) {
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Média';
      case 'low':
      default:
        return 'Baixa';
    }
  }
}

export default ReportXlsxService;
