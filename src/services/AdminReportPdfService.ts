import PDFDocument from 'pdfkit';
import type { DashboardConferenceSummary, DashboardDCTFRecord } from '../types';
import {
  buildAdminDashboardSnapshot,
  fetchAdminDashboardRecords,
  type AdminDashboardSnapshot,
} from './AdminDashboardService';
import { getConferenceSummary } from './AdminDashboardConferenceService';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import AdminReportHistoryService from './AdminReportHistoryService';

export interface GenerateAdminReportOptions {
  months?: number;
  title?: string;
  period?: string;
  identification?: string;
  logoUrl?: string;
  responsible?: string;
  notes?: string;
}

export class AdminReportPdfService {
  static async generateGerencialReport(options: GenerateAdminReportOptions = {}): Promise<Buffer> {
    const months = options.months ?? 6;
    const title = options.title ?? 'Relatório Gerencial DCTF';

    const [records, conferences] = await Promise.all([
      fetchAdminDashboardRecords(months),
      getConferenceSummary(months),
    ]);

    const filteredRecords = this.applyRecordFilters(records, options);
    const snapshot = buildAdminDashboardSnapshot({ records: filteredRecords });
    const filteredConferences = this.applyConferenceFilters(conferences, options);
    const logoBuffer = await this.loadLogoBuffer(options.logoUrl);
    const buffer = await this.buildReportBuffer(title, snapshot, filteredConferences, months, options, filteredRecords, logoBuffer ?? undefined);

    const normalizedPeriod = options.period ? this.normalizePeriod(options.period) : undefined;
    AdminReportHistoryService.register({
      title,
      reportType: 'gerencial',
      buffer,
      period: normalizedPeriod,
      identification: options.identification,
      responsible: options.responsible,
      notes: options.notes,
      filters: {
        months,
        period: normalizedPeriod,
        identification: options.identification,
      },
    });

    return buffer;
  }

  private static buildReportBuffer(
    title: string,
    snapshot: AdminDashboardSnapshot,
    conferences: DashboardConferenceSummary,
    months: number,
    options: GenerateAdminReportOptions,
    records: DashboardDCTFRecord[],
    logo?: Buffer,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48, compress: false });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });

    const result = new Promise<Buffer>((resolve, reject) => {
      doc.on('error', reject);
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    const { metrics, meta } = snapshot;
    const formatDate = (value?: string) => {
      if (!value) return '-';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleDateString('pt-BR');
    };

    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const filtersDescription = this.buildFiltersDescription(options);

    const writeSectionHeader = (label: string) => {
      doc.moveDown(1.2);
      doc.fillColor('#12355B').font('Helvetica-Bold').fontSize(14).text(label.toUpperCase());
      doc.moveDown(0.5);
      doc.fillColor('#1F2933').font('Helvetica').fontSize(11);
    };

    const writeKeyValue = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
      doc.font('Helvetica').text(` ${value}`);
    };

    if (logo && logo.length > 0) {
      try {
        doc.image(logo, doc.x, doc.y, { width: 120 });
        doc.moveDown(2);
      } catch (error) {
        console.warn('Não foi possível renderizar o logotipo no PDF:', error);
      }
    }

    doc.fillColor('#1F2933').font('Helvetica-Bold').fontSize(20).text(title, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#4B5563');
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} · Últimas ${months} competências analisadas.`, {
      align: 'center',
    });
    if (filtersDescription) {
      doc.moveDown(0.3);
      doc.text(`Filtros aplicados: ${filtersDescription}`, { align: 'center' });
    }
    if (options.responsible) {
      doc.moveDown(0.2);
      doc.text(`Responsável: ${options.responsible}`, { align: 'center' });
    }
    if (options.notes) {
      doc.moveDown(0.2);
      doc.text(`Observações: ${options.notes}`, {
        align: 'center',
      });
    }
    doc.moveDown(0.8);
    doc.fillColor('#1F2933').font('Helvetica').fontSize(11);

    // Sumário Executivo
    writeSectionHeader('Sumário Executivo');
    const summaryLines = [
      `Declarações monitoradas: ${numberFormatter.format(metrics.totals.declarations)}`,
      `Saldo em aberto: ${currencyFormatter.format(metrics.financial.balanceTotal)}`,
      `Percentual pendente: ${(metrics.financial.balanceRatio * 100).toFixed(1)}%`,
      `Alertas ativos: ${numberFormatter.format(metrics.alerts.length)}`,
    ];
    summaryLines.forEach(line => doc.text(line));

    // Status operacional
    writeSectionHeader('Status Operacional');
    const status = metrics.statusSummary;
    doc.text(`Entregues: ${numberFormatter.format(status.delivered)}`);
    doc.text(`Recebidas: ${numberFormatter.format(status.received)}`);
    doc.text(`Em andamento: ${numberFormatter.format(status.inProgress)}`);
    doc.text(`Erros: ${numberFormatter.format(status.errors)}`);

    // Visão financeira
    writeSectionHeader('Visão Financeira');
    doc.text(`Débito apurado: ${currencyFormatter.format(metrics.financial.debitTotal)}`);
    doc.text(`Saldo médio por declaração: ${currencyFormatter.format(metrics.financial.averageBalance)}`);

    const topBalances = (metrics.financial.balanceByIdentification ?? []).slice(0, 10);
    if (topBalances.length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Top saldos em aberto');
      doc.font('Helvetica');
      topBalances.forEach((item, index) => {
        const label = item.businessName && item.businessName.trim().length > 0
          ? `${item.businessName} (${item.identification})`
          : item.identification;
        doc.text(`${index + 1}. ${label} — ${currencyFormatter.format(item.balance)}`);
      });
    }

    // Alertas relevantes
    const sortedAlerts = [...metrics.alerts].sort((a, b) => {
      const severityRank = { high: 0, medium: 1, low: 2 } as const;
      return severityRank[a.severity] - severityRank[b.severity];
    }).slice(0, 10);

    writeSectionHeader('Alertas Prioritários');
    if (sortedAlerts.length === 0) {
      doc.text('Nenhum alerta relevante no período.');
    } else {
      sortedAlerts.forEach((alert, index) => {
        const severityLabel = alert.severity === 'high' ? 'ALTA' : alert.severity === 'medium' ? 'MÉDIA' : 'BAIXA';
        const subject = alert.businessName && alert.businessName.trim().length > 0
          ? `${alert.businessName} (${alert.identification})`
          : alert.identification;
        doc.text(`${index + 1}. [${severityLabel}] ${subject}`);
        if (alert.period) {
          doc.text(`    Competência: ${alert.period}`);
        }
        doc.text(`    ${alert.message}`);
        doc.moveDown(0.2);
      });
    }

    // Pendências de prazo
    writeSectionHeader('Conferência de Prazos Legais');
    const dueDateIssues = conferences.rules.dueDate.slice(0, 10);
    if (dueDateIssues.length === 0) {
      doc.text('Todas as competências analisadas estão dentro do prazo legal.');
    } else {
      dueDateIssues.forEach((issue, index) => {
        const severityLabel = issue.severity === 'high' ? 'ALTA' : issue.severity === 'medium' ? 'MÉDIA' : 'BAIXA';
        const business = issue.businessName && issue.businessName.trim().length > 0
          ? `${issue.businessName} (${issue.identification})`
          : issue.identification;
        doc.text(`${index + 1}. [${severityLabel}] ${business}`);
        writeKeyValue('Competência', issue.period ?? '—');
        writeKeyValue('Vencimento', formatDate(issue.dueDate));
        writeKeyValue('Entrega', formatDate(issue.transmissionDate));
        if (issue.daysLate && issue.daysLate > 0) {
          writeKeyValue('Dias em atraso', `${issue.daysLate}`);
        }
        doc.text(issue.message);
        doc.moveDown(0.4);
      });
    }

    // Resumo por contribuinte
    doc.addPage();
    writeSectionHeader('Resumo por Contribuinte');
    const contributors = this.buildContributorSummary(records);
    if (contributors.length === 0) {
      doc.text('Nenhum registro encontrado para os filtros aplicados.');
    } else {
      contributors.forEach((item, index) => {
        doc.text(`${index + 1}. ${item.label}`);
        writeKeyValue('Períodos analisados', item.periods.join(', '));
        writeKeyValue('Total de declarações', numberFormatter.format(item.count));
        writeKeyValue('Débito apurado', currencyFormatter.format(item.debitTotal));
        writeKeyValue('Saldo em aberto', currencyFormatter.format(item.balanceTotal));
        doc.moveDown(0.3);
      });
    }

    // Linha do tempo detalhada
    writeSectionHeader('Linha do Tempo de Transmissões');
    const timeline = this.buildTimeline(records);
    if (timeline.length === 0) {
      doc.text('Sem transmissões registradas nas competências filtradas.');
    } else {
      timeline.forEach(entry => {
        doc.text(`${entry.dateLabel} · ${entry.businessLabel}`);
        writeKeyValue('Competência', entry.period);
        writeKeyValue('Data de transmissão', entry.transmissionDate ?? '—');
        writeKeyValue('Status', entry.status ?? '—');
        writeKeyValue('Saldo', currencyFormatter.format(entry.balanceDue ?? 0));
        doc.moveDown(0.2);
      });
    }

    // Pendências completas
    doc.addPage();
    writeSectionHeader('Pendências completas (prazo legal)');
    if (conferences.rules.dueDate.length === 0) {
      doc.text('Não há pendências registradas.');
    } else {
      conferences.rules.dueDate.forEach((issue, index) => {
        const severityLabel = issue.severity === 'high' ? 'ALTA' : issue.severity === 'medium' ? 'MÉDIA' : 'BAIXA';
        const business = issue.businessName && issue.businessName.trim().length > 0
          ? `${issue.businessName} (${issue.identification})`
          : issue.identification;
        doc.text(`${index + 1}. [${severityLabel}] ${business}`);
        writeKeyValue('Competência', issue.period ?? '—');
        writeKeyValue('Vencimento', formatDate(issue.dueDate));
        writeKeyValue('Entrega', formatDate(issue.transmissionDate));
        if (issue.daysLate && issue.daysLate > 0) {
          writeKeyValue('Dias em atraso', `${issue.daysLate}`);
        }
        if (issue.details) {
          Object.entries(issue.details).forEach(([key, value]) => {
            writeKeyValue(this.formatDetailKey(key), String(value));
          });
        }
        doc.text(issue.message);
        doc.moveDown(0.4);
      });
    }

    // Metadados finais
    doc.addPage();
    writeSectionHeader('Metadados do Painel');
    doc.text(`Versão do layout: ${snapshot.architecture.blueprintMeta.version}`);
    doc.text(`Requer senha: ${snapshot.meta.requiresPassword ? 'Sim' : 'Não'}`);
    doc.text(`Modos de autenticação: ${snapshot.meta.authenticationModes.join(', ')}`);
    if (snapshot.meta.notes) {
      doc.text(`Notas: ${snapshot.meta.notes}`);
    }
    if (options.responsible) {
      doc.text(`Responsável pela emissão: ${options.responsible}`);
    }
    if (options.notes) {
      doc.text(`Observações adicionais: ${options.notes}`);
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280')
      .text('Relatório gerado automaticamente pelo módulo administrativo do DCTF Analyzer.', {
        align: 'center',
      });

    doc.end();
    return result;
  }

  private static applyRecordFilters(
    records: DashboardDCTFRecord[],
    options: GenerateAdminReportOptions,
  ): DashboardDCTFRecord[] {
    const { period, identification } = options;
    const normalizedPeriod = period ? this.normalizePeriod(period) : null;
    const normalizedId = identification ? this.cleanIdentification(identification) : null;

    return records.filter(record => {
      const matchesPeriod = normalizedPeriod ? this.normalizePeriod(record.period) === normalizedPeriod : true;
      const matchesId = normalizedId
        ? this.cleanIdentification(record.identification || '') === normalizedId
        : true;
      return matchesPeriod && matchesId;
    });
  }

  private static applyConferenceFilters(
    summary: DashboardConferenceSummary,
    options: GenerateAdminReportOptions,
  ): DashboardConferenceSummary {
    const normalizedPeriod = options.period ? this.normalizePeriod(options.period) : null;
    const normalizedId = options.identification ? this.cleanIdentification(options.identification) : null;

    if (!normalizedPeriod && !normalizedId) {
      return summary;
    }

    return {
      ...summary,
      rules: {
        ...summary.rules,
        dueDate: summary.rules.dueDate.filter(issue => {
          const issuePeriod = issue.period ? this.normalizePeriod(issue.period) : null;
          const issueId = this.cleanIdentification(issue.identification);
          const periodOk = normalizedPeriod ? issuePeriod === normalizedPeriod : true;
          const idOk = normalizedId ? issueId === normalizedId : true;
          return periodOk && idOk;
        }),
      },
    };
  }

  private static buildFiltersDescription(options: GenerateAdminReportOptions): string | null {
    const parts: string[] = [];
    if (options.identification) {
      parts.push(`Contribuinte ${options.identification}`);
    }
    if (options.period) {
      parts.push(`Competência ${this.normalizePeriod(options.period)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  private static normalizePeriod(period: string): string {
    const trimmed = period.trim();
    if (/^\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      const [year, month] = trimmed.split('-');
      return `${month}/${year}`;
    }
    if (/^\d{1,2}-\d{4}$/.test(trimmed)) {
      const [month, year] = trimmed.split('-');
      return `${month.padStart(2, '0')}/${year}`;
    }
    if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [month, year] = trimmed.split('/');
      return `${month.padStart(2, '0')}/${year}`;
    }
    return trimmed;
  }

  private static cleanIdentification(value: string): string {
    return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  }

  private static parseCurrency(value: string | number | undefined): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const numericValue = parseFloat(value.replace(/[^0-9,.]/g, '').replace(',', '.'));
      if (!isNaN(numericValue)) {
        return numericValue;
      }
    }
    return 0;
  }

  private static buildContributorSummary(records: DashboardDCTFRecord[]) {
    const groups = new Map<string, {
      label: string;
      periods: Set<string>;
      count: number;
      debitTotal: number;
      balanceTotal: number;
    }>();

    records.forEach(record => {
      const key = this.cleanIdentification(record.identification || '');
      if (!key) return;
      const existing = groups.get(key) ?? {
        label: record.businessName && record.businessName.trim().length > 0
          ? `${record.businessName} (${record.identification})`
          : record.identification ?? key,
        periods: new Set<string>(),
        count: 0,
        debitTotal: 0,
        balanceTotal: 0,
      };

      existing.periods.add(this.normalizePeriod(record.period));
      existing.count += 1;
      existing.debitTotal += this.parseCurrency(record.debitAmount);
      existing.balanceTotal += this.parseCurrency(record.balanceDue);

      groups.set(key, existing);
    });

    return Array.from(groups.values()).map(item => ({
      label: item.label,
      periods: Array.from(item.periods).sort(),
      count: item.count,
      debitTotal: item.debitTotal,
      balanceTotal: item.balanceTotal,
    })).sort((a, b) => b.balanceTotal - a.balanceTotal);
  }

  private static buildTimeline(records: DashboardDCTFRecord[]) {
    return records
      .map(record => {
        const businessLabel = record.businessName && record.businessName.trim().length > 0
          ? `${record.businessName} (${record.identification})`
          : record.identification ?? '';
        const transmissionDate = record.transmissionDate
          ? new Date(record.transmissionDate).toLocaleDateString('pt-BR')
          : undefined;
        return {
          dateLabel: transmissionDate ?? 'Sem registro de envio',
          period: this.normalizePeriod(record.period),
          status: record.status,
          balanceDue: this.parseCurrency(record.balanceDue),
          businessLabel,
          transmissionDate,
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private static formatDetailKey(key: string) {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (match: string) => match.toUpperCase());
  }

  private static async loadLogoBuffer(logoUrl?: string): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      const parsed = new URL(logoUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }

      const client = parsed.protocol === 'https:' ? https : http;

      const data = await new Promise<Buffer>((resolve, reject) => {
        const request = client.get(parsed, response => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            // Redirecionamento simples (uma camada)
            this.loadLogoBuffer(response.headers.location!).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Status code inválido: ${response.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const currentSize = chunks.reduce((acc, item) => acc + item.length, 0);
            if (currentSize > 2 * 1024 * 1024) {
              response.destroy(new Error('Imagem do logotipo excede 2MB.'));
            }
          });
          response.on('end', () => resolve(Buffer.concat(chunks)));
        });

        request.on('error', reject);
      });

      return data;
    } catch (error) {
      console.warn('Não foi possível carregar o logotipo do relatório:', error);
      return null;
    }
  }
}
