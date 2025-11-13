import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import PdfDocumentBuilder from './pdf/PdfDocumentBuilder';
import pastelTheme from './pdf/PdfTheme';
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
  DashboardConferenceIssue,
} from '../../types';

export interface PdfReportOptions extends ReportFilterOptions {
  title?: string;
  logoUrl?: string;
  responsible?: string;
  notes?: string;
}

interface GenerateContext {
  builder: PdfDocumentBuilder;
  title: string;
  options: PdfReportOptions;
  logo?: Buffer;
}

type ReportRenderer<T extends ReportDataEnvelope> = (context: GenerateContext, envelope: T) => void;

export class ReportPdfService {
  private static readonly TITLE_BY_TYPE: Record<ReportType, string> = {
    gerencial: 'Relatório Gerencial DCTF',
    clientes: 'Relatório de Clientes',
    dctf: 'Relatório de Declarações DCTF',
    conferencia: 'Relatório de Conferências Legais',
    pendentes: 'Relatório de Declarações Pendentes',
  };

  private static readonly RENDERERS: Record<ReportType, ReportRenderer<any>> = {
    gerencial: (context, envelope) => this.renderGerencial(context, envelope),
    clientes: (context, envelope) => this.renderClientes(context, envelope),
    dctf: (context, envelope) => this.renderDctf(context, envelope),
    conferencia: (context, envelope) => this.renderConference(context, envelope),
    pendentes: (context, envelope) => this.renderPendentes(context, envelope),
  };

  static async generate(type: ReportType, options: PdfReportOptions = {}): Promise<Buffer> {
    const title = options.title ?? this.TITLE_BY_TYPE[type];
    const envelope = await ReportDataFactory.build(type, options);
    const builder = new PdfDocumentBuilder(pastelTheme);
    const logo = options.logoUrl ? await this.loadLogo(options.logoUrl).catch(() => undefined) : undefined;

    if (logo) {
      builder.addLogo(logo);
    }

    const subtitle = `Emitido em ${new Date().toLocaleString('pt-BR')}`;
    builder.addTitle(title, subtitle);

    const filtersSummary = this.describeFilters(options);
    if (filtersSummary.length > 0) {
      filtersSummary.forEach(line => builder.addCenteredText(line));
    }
    if (options.responsible) {
      builder.addCenteredText(`Responsável: ${options.responsible}`);
    }
    if (options.notes) {
      builder.addCenteredText(`Observações: ${options.notes}`);
    }

    const context: GenerateContext = {
      builder,
      title,
      options,
      logo,
    };

    const renderer = this.RENDERERS[type];
    renderer(context, envelope);

    return builder.finalize();
  }

  private static renderGerencial(
    { builder }: GenerateContext,
    envelope: ReportDataEnvelope<GerencialReportData>,
  ) {
    const { metrics, conferences, summary } = envelope.data;
    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const percentageFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    builder.addSection('Sumário Executivo');
    builder.addKeyValueList([
      { label: 'Declarações monitoradas', value: numberFormatter.format(metrics.totals.declarations) },
      { label: 'Competências analisadas', value: summary.monthsConsidered ? String(summary.monthsConsidered) : 'Todas disponíveis' },
      { label: 'Saldo acumulado', value: currencyFormatter.format(metrics.financial.balanceTotal) },
      { label: 'Percentual pendente', value: `${percentageFormatter.format(metrics.financial.balanceRatio * 100)}%` },
      { label: 'Alertas ativos', value: numberFormatter.format(metrics.alerts.length) },
    ]);

    builder.addSection('Status Operacional');
    builder.addKeyValueList([
      { label: 'Entregues', value: numberFormatter.format(metrics.statusSummary.delivered) },
      { label: 'Recebidas', value: numberFormatter.format(metrics.statusSummary.received) },
      { label: 'Em andamento', value: numberFormatter.format(metrics.statusSummary.inProgress) },
      { label: 'Erros', value: numberFormatter.format(metrics.statusSummary.errors) },
    ]);

    builder.addSection('Visão Financeira');
    builder.addKeyValueList([
      { label: 'Débito apurado total', value: currencyFormatter.format(metrics.financial.debitTotal) },
      { label: 'Saldo médio por declaração', value: currencyFormatter.format(metrics.financial.averageBalance) },
    ]);

    if (metrics.financial.balanceByIdentification.length > 0) {
      builder.addParagraph('Top contribuintes com saldo em aberto:', { small: true });
      metrics.financial.balanceByIdentification.slice(0, 10).forEach((item, index) => {
        const label = item.businessName ? `${item.businessName} (${item.identification})` : item.identification;
        builder.addParagraph(`${index + 1}. ${label} — ${currencyFormatter.format(item.balance)}`, { small: true });
      });
    }

    builder.addSection('Alertas Prioritários');
    if (metrics.alerts.length === 0) {
      builder.addParagraph('Nenhum alerta registrado para os filtros aplicados.');
    } else {
      const severityLabels: Record<string, string> = {
        high: 'Alta',
        medium: 'Média',
        low: 'Baixa',
      };

      metrics.alerts
        .sort((a, b) => {
          const ranking = { high: 0, medium: 1, low: 2 } as const;
          return ranking[a.severity] - ranking[b.severity];
        })
        .slice(0, 15)
        .forEach((alert, index) => {
          const severity = severityLabels[alert.severity] ?? alert.severity;
          const subject = alert.businessName ? `${alert.businessName} (${alert.identification})` : alert.identification;
          builder.addParagraph(`${index + 1}. [${severity}] ${subject}`, { align: 'left' });
          builder.addParagraph(alert.message, { small: true, align: 'left' });
        });
    }

    builder.addSection('Conferência de Prazos Legais');
    const dueDateIssues = conferences.rules.dueDate;
    if (dueDateIssues.length === 0) {
      builder.addParagraph('Todas as competências avaliadas estão dentro do prazo legal.');
    } else {
      dueDateIssues.slice(0, 20).forEach((issue, index) => {
        const business = issue.businessName ? `${issue.businessName} (${issue.identification})` : issue.identification;
        builder.addParagraph(`${index + 1}. ${business}`, { align: 'left' });
        builder.addKeyValueList([
          { label: 'Competência', value: issue.period ?? '—' },
          { label: 'Prazo legal', value: this.formatDate(issue.dueDate) },
          { label: 'Entrega', value: this.formatDate(issue.transmissionDate) },
          { label: 'Dias em atraso', value: issue.daysLate ? String(issue.daysLate) : '—' },
        ]);
        builder.addParagraph(issue.message, { small: true, align: 'left' });
      });
    }

    builder.newPage();
    builder.addSection('Resumo por Contribuinte');
    const contributors = this.buildContributorSummary(envelope);
    if (contributors.length === 0) {
      builder.addParagraph('Nenhum registro encontrado para os filtros aplicados.');
    } else {
      contributors.forEach((item, index) => {
        builder.addParagraph(`${index + 1}. ${item.contribuinte}`, { align: 'left' });
        builder.addKeyValueList([
          { label: 'Períodos analisados', value: item.periods || '—' },
          { label: 'Total de declarações', value: numberFormatter.format(item.count) },
          { label: 'Débito total', value: currencyFormatter.format(item.debitTotal) },
          { label: 'Saldo em aberto', value: currencyFormatter.format(item.balanceTotal) },
        ]);
      });
    }

    builder.addSection('Linha do Tempo de Transmissões');
    const timeline = this.buildTimeline(envelope);
    if (timeline.length === 0) {
      builder.addParagraph('Sem eventos registrados nas competências selecionadas.');
    } else {
      timeline.forEach(entry => {
        builder.addParagraph(`${entry.dateLabel} — ${entry.businessLabel}`, { align: 'left' });
        builder.addKeyValueList([
          { label: 'Competência', value: entry.period },
          { label: 'Status', value: entry.status ?? '—' },
          { label: 'Saldo', value: currencyFormatter.format(entry.balanceDue ?? 0) },
        ]);
      });
    }

    builder.newPage();
    builder.addSection('Pendências Detalhadas (Prazo Legal)');
    if (dueDateIssues.length === 0) {
      builder.addParagraph('Não há pendências cadastradas.');
    } else {
      dueDateIssues.forEach((issue, index) => {
        builder.addParagraph(`${index + 1}. ${issue.businessName ? `${issue.businessName} (${issue.identification})` : issue.identification}`, { small: false });
        builder.addKeyValueList([
          { label: 'Competência', value: issue.period ?? '—' },
          { label: 'Prazo legal', value: this.formatDate(issue.dueDate) },
          { label: 'Entrega', value: this.formatDate(issue.transmissionDate) },
          { label: 'Dias em atraso', value: issue.daysLate ? String(issue.daysLate) : '—' },
        ]);
        builder.addParagraph(issue.message);
      });
    }
  }

  private static renderClientes(
    { builder }: GenerateContext,
    envelope: ReportDataEnvelope<ClientesReportData>,
  ) {
    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    builder.addSection('Resumo Geral');
    builder.addKeyValueList([
      { label: 'Clientes monitorados', value: numberFormatter.format(envelope.data.totals.clientes) },
      { label: 'Declarações', value: numberFormatter.format(envelope.data.totals.declaracoes) },
      { label: 'Débito total', value: currencyFormatter.format(envelope.data.totals.debitoTotal) },
      { label: 'Saldo total', value: currencyFormatter.format(envelope.data.totals.saldoTotal) },
    ]);

    if (envelope.data.items.length === 0) {
      builder.addParagraph('Nenhum cliente encontrado para os filtros selecionados.');
      return;
    }

    builder.addSection('Clientes');
    envelope.data.items.forEach((item, index) => {
      const title = item.businessName ?? '—';
      builder.addParagraph(`${index + 1}. ${title}`);
      builder.addKeyValueList([
        { label: 'CNPJ', value: item.cnpj ?? item.cnpjLimpo ?? '—' },
        { label: 'Declarações', value: numberFormatter.format(item.totalDeclaracoes) },
        { label: 'Débito total', value: currencyFormatter.format(item.valores.debitoTotal) },
        { label: 'Saldo total', value: currencyFormatter.format(item.valores.saldoTotal) },
        { label: 'Último período', value: item.ultimoPeriodo ?? '—' },
        { label: 'Último envio', value: this.formatDate(item.ultimoEnvio) },
        { label: 'Conc. / Pend. / Proc. / Erro', value: `${item.statusSummary.concluido}/${item.statusSummary.pendente}/${item.statusSummary.processando}/${item.statusSummary.erro}` },
      ]);
    });
  }

  private static renderDctf(
    { builder }: GenerateContext,
    envelope: ReportDataEnvelope<DCTFReportData>,
  ) {
    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    builder.addSection('Totais');
    builder.addKeyValueList([
      { label: 'Declarações', value: numberFormatter.format(envelope.data.totals.declaracoes) },
      { label: 'Débito total', value: currencyFormatter.format(envelope.data.totals.debitoTotal) },
      { label: 'Saldo total', value: currencyFormatter.format(envelope.data.totals.saldoTotal) },
    ]);

    if (envelope.data.items.length === 0) {
      builder.addParagraph('Nenhuma declaração encontrada para os filtros selecionados.');
      return;
    }

    builder.addSection('Declarações');
    envelope.data.items.forEach((item, index) => {
      builder.addParagraph(`${index + 1}. ${item.businessName ? `${item.businessName} (${item.identification})` : item.identification}`);
      builder.addKeyValueList([
        { label: 'Competência', value: item.period ?? '—' },
        { label: 'Entrega', value: this.formatDate(item.transmissionDate) },
        { label: 'Status', value: item.status ?? '—' },
        { label: 'Situação', value: item.situation ?? '—' },
        { label: 'Débito apurado', value: currencyFormatter.format(this.toNumber(item.debitAmount)) },
        { label: 'Saldo em aberto', value: currencyFormatter.format(this.toNumber(item.balanceDue)) },
      ]);
    });
  }

  private static renderConference(
    { builder }: GenerateContext,
    envelope: ReportDataEnvelope<ConferenceReportData>,
  ) {
    const totals = envelope.data.totals;
    builder.addSection('Resumo');
    builder.addKeyValueList([
      { label: 'Pendências totais', value: String(totals.totalIssues) },
      { label: 'Pendências críticas', value: String(totals.bySeverity.high) },
      { label: 'Pendências médias', value: String(totals.bySeverity.medium) },
      { label: 'Pendências baixas', value: String(totals.bySeverity.low) },
    ]);

    const issues = envelope.data.summary.rules.dueDate;
    if (issues.length === 0) {
      builder.addParagraph('Nenhuma inconsistência encontrada para os filtros aplicados.');
      return;
    }

    builder.addSection('Pendências');
    issues.forEach((issue, index) => {
      const business = issue.businessName ? `${issue.businessName} (${issue.identification})` : issue.identification;
      builder.addParagraph(`${index + 1}. ${business}`, { align: 'left' });
      builder.addKeyValueList([
        { label: 'Competência', value: issue.period ?? '—' },
        { label: 'Prazo legal', value: this.formatDate(issue.dueDate) },
        { label: 'Entrega', value: this.formatDate(issue.transmissionDate) },
        { label: 'Dias em atraso', value: issue.daysLate ? String(issue.daysLate) : '—' },
        { label: 'Severidade', value: this.translateSeverity(issue.severity) },
      ]);
      builder.addParagraph(issue.message, { small: true, align: 'left' });
    });
  }

  private static renderPendentes(
    { builder }: GenerateContext,
    envelope: ReportDataEnvelope<PendentesReportData>,
  ) {
    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    builder.addSection('Resumo');
    builder.addKeyValueList([
      { label: 'Declarações pendentes', value: numberFormatter.format(envelope.data.totals.totalPendentes) },
      { label: 'Total de registros relacionados', value: numberFormatter.format(envelope.data.totals.totalRegistros) },
    ]);

    if (envelope.data.items.length === 0) {
      builder.addParagraph('Nenhuma declaração pendente encontrada.');
      return;
    }

    builder.addSection('Declarações Pendentes com Últimos Registros');
    envelope.data.items.forEach((item, index) => {
      const business = item.businessName ? `${item.businessName} (${item.identification})` : item.identification;
      builder.addParagraph(`${index + 1}. ${business}`, { align: 'left' });
      builder.addKeyValueList([
        { label: 'Competência pendente', value: item.period },
        { label: 'Prazo de vencimento', value: this.formatDate(item.dueDate) },
        { label: 'Dias restantes', value: `${item.daysUntilDue} ${item.daysUntilDue === 1 ? 'dia' : 'dias'}` },
        { label: 'Severidade', value: this.translateSeverity(item.severity) },
        { label: 'Mensagem', value: item.message },
      ]);

      if (item.ultimosRegistros.length > 0) {
        builder.addParagraph('Últimos registros DCTF:', { small: true, align: 'left' });
        item.ultimosRegistros.forEach((registro, regIndex) => {
          builder.addParagraph(`  ${regIndex + 1}. Competência: ${registro.period}`, { small: true, align: 'left' });
          builder.addKeyValueList([
            { label: 'Data de transmissão', value: this.formatDate(registro.transmissionDate) },
            { label: 'Status', value: registro.status ?? '—' },
            { label: 'Situação', value: registro.situation ?? '—' },
            { label: 'Débito apurado', value: currencyFormatter.format(this.toNumber(registro.debitAmount)) },
            { label: 'Saldo em aberto', value: currencyFormatter.format(this.toNumber(registro.balanceDue)) },
          ]);
        });
      } else {
        builder.addParagraph('Nenhum registro DCTF encontrado para este CNPJ.', { small: true, align: 'left' });
      }
      
      // Adicionar espaçamento entre itens
      builder.addParagraph('');
    });
  }

  private static buildContributorSummary(envelope: ReportDataEnvelope<GerencialReportData>) {
    const { records } = envelope.data;
    const contributorsMap = new Map<string, {
      contribuinte: string;
      periods: Set<string>;
      count: number;
      debitTotal: number;
      balanceTotal: number;
    }>();

    records.forEach(record => {
      const key = record.identification;
      if (!key) return;
      if (!contributorsMap.has(key)) {
        contributorsMap.set(key, {
          contribuinte: record.businessName ? `${record.businessName} (${record.identification})` : record.identification,
          periods: new Set(),
          count: 0,
          debitTotal: 0,
          balanceTotal: 0,
        });
      }
      const store = contributorsMap.get(key)!;
      if (record.period) store.periods.add(record.period);
      store.count += 1;
      store.debitTotal += this.toNumber(record.debitAmount);
      store.balanceTotal += this.toNumber(record.balanceDue);
    });

    return Array.from(contributorsMap.values()).map(item => ({
      contribuinte: item.contribuinte,
      periods: Array.from(item.periods).join(', '),
      count: item.count,
      debitTotal: item.debitTotal,
      balanceTotal: item.balanceTotal,
    }));
  }

  private static buildTimeline(envelope: ReportDataEnvelope<GerencialReportData>) {
    const formatter = new Intl.DateTimeFormat('pt-BR');
    return envelope.data.records
      .filter(record => record.transmissionDate)
      .map(record => {
        const date = record.transmissionDate ? new Date(record.transmissionDate) : null;
        const timestamp = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
        return {
          timestamp,
          dateLabel: date && !Number.isNaN(date.getTime()) ? formatter.format(date) : '—',
          businessLabel: record.businessName ? `${record.businessName} (${record.identification})` : record.identification,
          period: record.period ?? '—',
          status: record.status ?? record.situation ?? '—',
          balanceDue: this.toNumber(record.balanceDue),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  private static translateSeverity(severity: DashboardConferenceIssue['severity']): string {
    switch (severity) {
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Média';
      default:
        return 'Baixa';
    }
  }

  private static formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('pt-BR');
  }

  private static toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const normalized = value.replace(/\./g, '').replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private static describeFilters(options: PdfReportOptions): string[] {
    const lines: string[] = [];
    if (options.period) {
      lines.push(`Competência filtrada: ${options.period}`);
    }
    if (options.identification) {
      lines.push(`Contribuinte: ${options.identification}`);
    }
    if (options.months) {
      lines.push(`Janela de análise: últimas ${options.months} competências`);
    }
    return lines;
  }

  private static async loadLogo(logoUrl: string): Promise<Buffer> {
    const parsed = new URL(logoUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise<Buffer>((resolve, reject) => {
      client
        .get(parsed, response => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Falha ao carregar logotipo. Status ${response.statusCode}`));
            return;
          }

          const data: Buffer[] = [];
          response.on('data', chunk => data.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          response.on('end', () => resolve(Buffer.concat(data)));
        })
        .on('error', reject);
    });
  }
}

export default ReportPdfService;

