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

export class ReportXlsxService {
  static async generate(type: ReportType, options: XlsxReportOptions = {}): Promise<Buffer> {
    const envelope = await ReportDataFactory.build(type, options);
    const schema = this.buildSchema(type, envelope);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório');

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    worksheet.columns = schema.columns.map(column => ({ header: column.header, key: column.key, width: column.header.length + 4 }));
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
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
    });

    schema.rows.forEach(rowData => {
      const row = worksheet.addRow(rowData);
      row.height = 18;
      row.eachCell(cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
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

  private static buildDctfSchema(envelope: ReportDataEnvelope<DCTFReportData>): SheetSchema {
    const columns: SheetColumn[] = [
      { key: 'identification', header: 'Identificação' },
      { key: 'businessName', header: 'Razão Social' },
      { key: 'period', header: 'Competência' },
      { key: 'transmissionDate', header: 'Entrega' },
      { key: 'status', header: 'Status' },
      { key: 'situation', header: 'Situação' },
      { key: 'debitAmount', header: 'Débito Apurado' },
      { key: 'balanceDue', header: 'Saldo em Aberto' },
    ];

    const rows = envelope.data.items.map(item => ({
      identification: item.identification,
      businessName: item.businessName ?? '—',
      period: item.period ?? '—',
      transmissionDate: this.formatDate(item.transmissionDate),
      status: item.status ?? '—',
      situation: item.situation ?? '—',
      debitAmount: this.formatCurrency(item.debitAmount),
      balanceDue: this.formatCurrency(item.balanceDue),
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

  private static formatDate(value?: string): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('pt-BR');
  }

  private static formatCurrency(value: unknown): string {
    const numberValue = this.toNumber(value);
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return formatter.format(numberValue);
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
    const columns: SheetColumn[] = [
      { key: 'tipo', header: 'Tipo' },
      { key: 'identification', header: 'CNPJ' },
      { key: 'businessName', header: 'Contribuinte' },
      { key: 'period', header: 'Competência' },
      { key: 'dueDate', header: 'Prazo de Vencimento' },
      { key: 'transmissionDate', header: 'Data Transmissão' },
      { key: 'daysUntilDue', header: 'Dias Restantes' },
      { key: 'severity', header: 'Severidade' },
      { key: 'status', header: 'Status' },
      { key: 'situation', header: 'Situação' },
      { key: 'debitAmount', header: 'Débito Apurado' },
      { key: 'balanceDue', header: 'Saldo a Pagar' },
      { key: 'message', header: 'Mensagem' },
    ];

    const rows: Record<string, string>[] = [];

    envelope.data.items.forEach((item, itemIndex) => {
      // Linha do registro pendente
      rows.push({
        tipo: 'PENDENTE',
        identification: item.identification,
        businessName: item.businessName || '—',
        period: item.period,
        dueDate: this.formatDate(item.dueDate),
        transmissionDate: '—',
        daysUntilDue: `${item.daysUntilDue} ${item.daysUntilDue === 1 ? 'dia' : 'dias'}`,
        severity: this.translateSeverity(item.severity),
        status: '—',
        situation: '—',
        debitAmount: '—',
        balanceDue: '—',
        message: item.message,
      });

      // Linhas dos últimos registros DCTF
      if (item.ultimosRegistros.length > 0) {
        item.ultimosRegistros.forEach((registro) => {
          rows.push({
            tipo: 'REGISTRO',
            identification: registro.identification,
            businessName: registro.businessName || '—',
            period: registro.period,
            dueDate: '—',
            transmissionDate: this.formatDate(registro.transmissionDate),
            daysUntilDue: '—',
            severity: '—',
            status: registro.status || '—',
            situation: registro.situation || '—',
            debitAmount: this.formatCurrency(registro.debitAmount),
            balanceDue: this.formatCurrency(registro.balanceDue),
            message: '—',
          });
        });
      } else {
        // Se não houver registros, adicionar uma linha indicando isso
        rows.push({
          tipo: 'REGISTRO',
          identification: item.identification,
          businessName: 'Nenhum registro DCTF encontrado',
          period: '—',
          dueDate: '—',
          transmissionDate: '—',
          daysUntilDue: '—',
          severity: '—',
          status: '—',
          situation: '—',
          debitAmount: '—',
          balanceDue: '—',
          message: '—',
        });
      }

      // Adicionar 2 linhas vazias entre grupos (exceto no último item)
      if (itemIndex < envelope.data.items.length - 1) {
        rows.push({
          tipo: '',
          identification: '',
          businessName: '',
          period: '',
          dueDate: '',
          transmissionDate: '',
          daysUntilDue: '',
          severity: '',
          status: '',
          situation: '',
          debitAmount: '',
          balanceDue: '',
          message: '',
        });
        rows.push({
          tipo: '',
          identification: '',
          businessName: '',
          period: '',
          dueDate: '',
          transmissionDate: '',
          daysUntilDue: '',
          severity: '',
          status: '',
          situation: '',
          debitAmount: '',
          balanceDue: '',
          message: '',
        });
      }
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
