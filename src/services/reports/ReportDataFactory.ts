import {
  ReportType,
  ReportFilterOptions,
  ReportDataEnvelope,
  GerencialReportData,
  ClientesReportData,
  ClientesReportItem,
  ClientesReportStatusSummary,
  DCTFReportData,
  DCTFReportItem,
  ConferenceReportData,
  PendentesReportData,
  PendentesReportItem,
  DashboardConferenceSummary,
  DashboardDCTFRecord,
  DashboardConferenceIssue,
  DCTF as IDCTF,
} from '../../types';
import {
  buildAdminDashboardSnapshot,
  fetchAllAdminDashboardRecords,
  formatPeriod,
  mapToDashboardRecord,
} from '../AdminDashboardService';
import { getConferenceSummary } from '../AdminDashboardConferenceService';
import { Cliente } from '../../models/Cliente';
import { DCTF } from '../../models/DCTF';

type NormalizedStatus = 'concluido' | 'pendente' | 'processando' | 'erro';

interface NormalizedDctfReportRecord {
  id: string;
  clienteId?: string;
  identification: string;
  businessName?: string;
  period?: string;
  transmissionDate?: string;
  status?: string;
  normalizedStatus: NormalizedStatus;
  situation?: string | null;
  debitAmount?: number | null;
  balanceDue?: number | null;
}

interface ClientesAggregation extends ClientesReportItem {
  lastPeriodOrder?: number;
  lastTransmissionTimestamp?: number;
}

const clienteModel = new Cliente();
const dctfModel = new DCTF();

export class ReportDataFactory {
  static async build(type: ReportType, filters: ReportFilterOptions = {}): Promise<ReportDataEnvelope> {
    switch (type) {
      case 'gerencial':
        return this.buildGerencialData(filters);
      case 'clientes':
        return this.buildClientesData(filters);
      case 'dctf':
        return this.buildDctfData(filters);
      case 'conferencia':
        return this.buildConferenceData(filters);
      case 'pendentes':
        return this.buildPendentesData(filters);
      default:
        throw new Error(`Tipo de relatório não suportado: ${type satisfies never}`);
    }
  }

  private static async buildGerencialData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<GerencialReportData>> {
    const months = filters.months && filters.months > 0 ? filters.months : undefined;
    const allRecords = await fetchAllAdminDashboardRecords();
    const filteredRecords = this.filterDashboardRecords(allRecords, filters);
    const snapshot = buildAdminDashboardSnapshot({ records: filteredRecords });
    const conferenceSummary = await getConferenceSummary(months);
    const filteredConferenceSummary = this.filterConferenceSummary(conferenceSummary, filters);

    return {
      type: 'gerencial',
      generatedAt: new Date().toISOString(),
      filters,
      meta: {
        layoutVersion: snapshot.architecture.blueprintMeta.version,
        requiresPassword: snapshot.meta.requiresPassword,
        authenticationModes: snapshot.meta.authenticationModes,
      },
      data: {
        records: filteredRecords,
        metrics: snapshot.metrics,
        conferences: filteredConferenceSummary,
        summary: {
          monthsConsidered: months ?? null,
          totalRecords: filteredRecords.length,
        },
      },
    };
  }

  private static async buildClientesData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<ClientesReportData>> {
    const [clientesResponse, dctfResponse] = await Promise.all([
      clienteModel.findAll(),
      dctfModel.findAll(),
    ]);

    const clientes = clientesResponse.success && clientesResponse.data ? clientesResponse.data : [];
    const dctfRecords = dctfResponse.success && dctfResponse.data ? dctfResponse.data : [];
    const normalizedRecords = dctfRecords
      .map(record => this.normalizeDctfRecord(record))
      .filter(record => record.identification.length > 0)
      .filter(record => this.matchRecordFilters(record, filters));

    const itemsMap = new Map<string, ClientesAggregation>();

    clientes.forEach(cliente => {
      const aggregation: ClientesAggregation = {
        id: cliente.id,
        businessName: cliente.razao_social ?? cliente.nome ?? undefined,
        // cnpj formatado não existe mais, apenas cnpj_limpo
        cnpjLimpo: cliente.cnpj_limpo ?? undefined,
        email: cliente.email ?? undefined,
        telefone: cliente.telefone ?? undefined,
        endereco: cliente.endereco ?? undefined,
        totalDeclaracoes: 0,
        ultimoPeriodo: undefined,
        ultimoEnvio: undefined,
        valores: {
          debitoTotal: 0,
          saldoTotal: 0,
        },
        statusSummary: this.createEmptyStatusSummary(),
      };
      itemsMap.set(cliente.id, aggregation);
    });

    for (const record of normalizedRecords) {
      const targetId = record.clienteId ?? record.identification;
      const existingEntry = itemsMap.get(targetId);

      if (!existingEntry) {
        const fallbackEntry: ClientesAggregation = {
          id: targetId,
          businessName: record.businessName ?? undefined,
          cnpj: this.formatIdentifier(record.identification),
          cnpjLimpo: this.cleanIdentification(record.identification),
          totalDeclaracoes: 0,
          ultimoPeriodo: undefined,
          ultimoEnvio: undefined,
          valores: {
            debitoTotal: 0,
            saldoTotal: 0,
          },
          statusSummary: this.createEmptyStatusSummary(),
        };
        itemsMap.set(targetId, fallbackEntry);
      }

      const entry = itemsMap.get(targetId)!;
      entry.totalDeclaracoes += 1;
      entry.valores.debitoTotal += record.debitAmount ?? 0;
      entry.valores.saldoTotal += record.balanceDue ?? 0;
      entry.statusSummary[record.normalizedStatus] += 1;

      if (!entry.businessName && record.businessName) {
        entry.businessName = record.businessName;
      }
      if (!entry.cnpj) {
        entry.cnpj = this.formatIdentifier(record.identification);
      }
      if (!entry.cnpjLimpo) {
        entry.cnpjLimpo = this.cleanIdentification(record.identification);
      }

      const currentPeriodOrder = this.periodToOrder(record.period);
      if (currentPeriodOrder != null) {
        if (entry.lastPeriodOrder == null || currentPeriodOrder > entry.lastPeriodOrder) {
          entry.lastPeriodOrder = currentPeriodOrder;
          entry.ultimoPeriodo = record.period;
        }
      }

      const transmissionTimestamp = record.transmissionDate ? Date.parse(record.transmissionDate) : null;
      if (transmissionTimestamp != null && !Number.isNaN(transmissionTimestamp)) {
        if (
          entry.lastTransmissionTimestamp == null ||
          transmissionTimestamp > entry.lastTransmissionTimestamp
        ) {
          entry.lastTransmissionTimestamp = transmissionTimestamp;
          entry.ultimoEnvio = new Date(transmissionTimestamp).toISOString();
        }
      }
    }

    const items = Array.from(itemsMap.values())
      .filter(item => {
        if (filters.identification) {
          const normalized = this.cleanIdentification(filters.identification);
          return (
            this.cleanIdentification(item.cnpj ?? '') === normalized ||
            (item.cnpjLimpo ? item.cnpjLimpo === normalized : false) ||
            item.id === normalized
          );
        }
        if (filters.clientId) {
          return item.id === filters.clientId;
        }
        return true;
      })
      .map(item => this.stripAggregationMetadata(item))
      .sort((a, b) => {
        const aPeriod = this.periodToOrder(a.ultimoPeriodo);
        const bPeriod = this.periodToOrder(b.ultimoPeriodo);
        if (aPeriod != null && bPeriod != null) {
          return bPeriod - aPeriod;
        }
        if (aPeriod != null) return -1;
        if (bPeriod != null) return 1;
        return (b.totalDeclaracoes ?? 0) - (a.totalDeclaracoes ?? 0);
      });

    const totals = items.reduce(
      (acc, item) => {
        acc.declaracoes += item.totalDeclaracoes;
        acc.debitoTotal += item.valores.debitoTotal;
        acc.saldoTotal += item.valores.saldoTotal;
        return acc;
      },
      {
        clientes: items.length,
        declaracoes: 0,
        debitoTotal: 0,
        saldoTotal: 0,
      },
    );

    return {
      type: 'clientes',
      generatedAt: new Date().toISOString(),
      filters,
      data: {
        items,
        totals,
      },
    };
  }

  private static async buildDctfData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<DCTFReportData>> {
    const dctfResponse = await dctfModel.findAll();
    const dctfRecords = dctfResponse.success && dctfResponse.data ? dctfResponse.data : [];

    const normalizedRecords = dctfRecords
      .map(record => this.normalizeDctfRecord(record))
      .filter(record => record.identification.length > 0)
      .filter(record => this.matchRecordFilters(record, filters));

    const items: DCTFReportItem[] = normalizedRecords
      .map(record => ({
        id: record.id,
        identification: this.formatIdentifier(record.identification),
        businessName: record.businessName,
        period: record.period ?? '',
        transmissionDate: record.transmissionDate,
        status: record.status,
        situation: record.situation ?? undefined,
        debitAmount: record.debitAmount,
        balanceDue: record.balanceDue,
        origin: 'Plataforma',
      }))
      .sort((a, b) => {
        const aPeriod = this.periodToOrder(a.period);
        const bPeriod = this.periodToOrder(b.period);
        if (aPeriod != null && bPeriod != null && aPeriod !== bPeriod) {
          return bPeriod - aPeriod;
        }
        const aDate = a.transmissionDate ? Date.parse(a.transmissionDate) : 0;
        const bDate = b.transmissionDate ? Date.parse(b.transmissionDate) : 0;
        return bDate - aDate;
      });

    const totals = items.reduce(
      (acc, item) => {
        acc.declaracoes += 1;
        const debit = this.toNumber(item.debitAmount);
        const balance = this.toNumber(item.balanceDue);
        acc.debitoTotal += debit;
        acc.saldoTotal += balance;
        return acc;
      },
      { declaracoes: 0, debitoTotal: 0, saldoTotal: 0 },
    );

    return {
      type: 'dctf',
      generatedAt: new Date().toISOString(),
      filters,
      data: {
        items,
        totals,
      },
    };
  }

  private static async buildConferenceData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<ConferenceReportData>> {
    const months = filters.months && filters.months > 0 ? filters.months : undefined;
    const summary = await getConferenceSummary(months);
    const filteredSummary = this.filterConferenceSummary(summary, filters);
    const totals = this.buildConferenceTotals(filteredSummary);

    return {
      type: 'conferencia',
      generatedAt: new Date().toISOString(),
      filters,
      data: {
        summary: filteredSummary,
        totals,
      },
    };
  }

  private static filterDashboardRecords(records: DashboardDCTFRecord[], filters: ReportFilterOptions): DashboardDCTFRecord[] {
    if (!filters.identification && !filters.period) {
      return records;
    }
    const normalizedId = filters.identification ? this.cleanIdentification(filters.identification) : null;
    const normalizedPeriod = filters.period ? this.normalizePeriod(filters.period) : null;

    return records.filter(record => {
      const recordId = this.cleanIdentification(record.identification ?? '');
      const recordPeriod = record.period ? this.normalizePeriod(record.period) : null;
      const matchesId = normalizedId ? recordId === normalizedId : true;
      const matchesPeriod = normalizedPeriod ? recordPeriod === normalizedPeriod : true;
      return matchesId && matchesPeriod;
    });
  }

  private static filterConferenceSummary(summary: DashboardConferenceSummary, filters: ReportFilterOptions): DashboardConferenceSummary {
    const normalizedId = filters.identification ? this.cleanIdentification(filters.identification) : null;
    const normalizedPeriod = filters.period ? this.normalizePeriod(filters.period) : null;

    if (!normalizedId && !normalizedPeriod) {
      return summary;
    }

    return {
      ...summary,
      rules: {
        ...summary.rules,
        dueDate: summary.rules.dueDate.filter(issue => {
          const issueId = this.cleanIdentification(issue.identification);
          const issuePeriod = issue.period ? this.normalizePeriod(issue.period) : null;
          const matchesId = normalizedId ? issueId === normalizedId : true;
          const matchesPeriod = normalizedPeriod ? issuePeriod === normalizedPeriod : true;
          return matchesId && matchesPeriod;
        }),
      },
    };
  }

  private static buildConferenceTotals(summary: DashboardConferenceSummary): ConferenceReportData['totals'] {
    const totals: ConferenceReportData['totals'] = {
      totalIssues: summary.rules.dueDate.length,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };

    summary.rules.dueDate.forEach(issue => {
      totals.bySeverity[issue.severity]++;
    });

    return totals;
  }

  private static normalizeDctfRecord(record: IDCTF): NormalizedDctfReportRecord {
    const dashboardRecord = mapToDashboardRecord(record);
    const normalizedStatus = this.normalizeStatus(record.status ?? record.situacao ?? '');

    return {
      id: record.id,
      clienteId: record.clienteId,
      identification: dashboardRecord.identification ?? '',
      businessName: dashboardRecord.businessName,
      period: dashboardRecord.period,
      transmissionDate: dashboardRecord.transmissionDate,
      status: record.status ?? dashboardRecord.status ?? undefined,
      normalizedStatus,
      situation: record.situacao ?? dashboardRecord.situation ?? null,
      debitAmount: typeof dashboardRecord.debitAmount === 'number' ? dashboardRecord.debitAmount : Number(dashboardRecord.debitAmount ?? 0),
      balanceDue: typeof dashboardRecord.balanceDue === 'number' ? dashboardRecord.balanceDue : Number(dashboardRecord.balanceDue ?? 0),
    };
  }

  private static matchRecordFilters(record: NormalizedDctfReportRecord, filters: ReportFilterOptions): boolean {
    const normalizedId = filters.identification ? this.cleanIdentification(filters.identification) : null;
    const normalizedPeriod = filters.period ? this.normalizePeriod(filters.period) : null;

    const matchesId = normalizedId ? this.cleanIdentification(record.identification) === normalizedId : true;
    const matchesPeriod = normalizedPeriod ? this.normalizePeriod(record.period ?? '') === normalizedPeriod : true;
    const matchesClient = filters.clientId ? record.clienteId === filters.clientId : true;

    return matchesId && matchesPeriod && matchesClient;
  }

  private static createEmptyStatusSummary(): ClientesReportStatusSummary {
    return {
      concluido: 0,
      pendente: 0,
      processando: 0,
      erro: 0,
    };
  }

  private static stripAggregationMetadata(entry: ClientesAggregation): ClientesReportItem {
    const { lastPeriodOrder, lastTransmissionTimestamp, ...rest } = entry;
    return rest;
  }

  private static normalizeStatus(value: string): NormalizedStatus {
    const normalized = value ? value.toLowerCase() : '';
    if (normalized.includes('conclu')) return 'concluido';
    if (normalized.includes('process')) return 'processando';
    if (normalized.includes('erro')) return 'erro';
    return 'pendente';
  }

  private static normalizePeriod(value: string): string {
    return formatPeriod(value);
  }

  private static periodToOrder(period?: string): number | null {
    if (!period) return null;
    const normalized = this.normalizePeriod(period);
    const match = /^(\d{2})\/(\d{4})$/.exec(normalized);
    if (!match) {
      return null;
    }
    const month = Number.parseInt(match[1], 10);
    const year = Number.parseInt(match[2], 10);
    if (Number.isNaN(month) || Number.isNaN(year)) {
      return null;
    }
    return year * 12 + month;
  }

  private static cleanIdentification(value: string): string {
    return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  }

  private static formatIdentifier(value: string): string {
    const cleaned = this.cleanIdentification(value);
    if (cleaned.length === 14) {
      return cleaned
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return value;
  }

  private static async buildPendentesData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<PendentesReportData>> {
    const months = filters.months && filters.months > 0 ? filters.months : 6;
    const conferenceSummary = await getConferenceSummary(months);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtrar declarações pendentes com prazo vigente (mesma lógica do dashboard)
    const pendentes: DashboardConferenceIssue[] = conferenceSummary.rules.dueDate.filter((issue) => {
      const status = (issue.status ?? '').toLowerCase();
      const notCompleted = status !== 'concluido';
      
      const dueDate = new Date(issue.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const stillValid = dueDate >= today;
      
      const hasValidDueDate = issue.severity === 'medium';
      
      return notCompleted && stillValid && hasValidDueDate;
    });

    // Buscar todos os registros DCTF para poder filtrar por CNPJ
    const dctfResponse = await dctfModel.findAll();
    const allDctfRecords = dctfResponse.success && dctfResponse.data ? dctfResponse.data : [];

    // Para cada declaração pendente, buscar os últimos registros DCTF do CNPJ
    const items: PendentesReportItem[] = await Promise.all(
      pendentes.map(async (pendente) => {
        const cnpjLimpo = this.cleanIdentification(pendente.identification);
        
        // Buscar cliente pelo CNPJ
        const clientesResponse = await clienteModel.findAll();
        const clientes = clientesResponse.success && clientesResponse.data ? clientesResponse.data : [];
        const cliente = clientes.find(c => c.cnpj_limpo === cnpjLimpo);

        // Buscar registros DCTF deste CNPJ (através do cliente ou pelo identification)
        let registrosDctf: IDCTF[] = [];
        if (cliente) {
          const dctfPorCliente = await dctfModel.findByCliente(cliente.id);
          if (dctfPorCliente.success && dctfPorCliente.data) {
            registrosDctf = dctfPorCliente.data;
          }
        } else {
          // Se não encontrou cliente, buscar por identification nos registros
          registrosDctf = allDctfRecords.filter(record => {
            const dashboardRecord = mapToDashboardRecord(record);
            const recordId = this.cleanIdentification(dashboardRecord.identification ?? '');
            return recordId === cnpjLimpo;
          });
        }

        // Ordenar por data de transmissão (mais recentes primeiro) e pegar os últimos 5
        const ultimosRegistros = registrosDctf
          .map(record => this.normalizeDctfRecord(record))
          .sort((a, b) => {
            const aDate = a.transmissionDate ? Date.parse(a.transmissionDate) : 0;
            const bDate = b.transmissionDate ? Date.parse(b.transmissionDate) : 0;
            return bDate - aDate;
          })
          .slice(0, 5)
          .map(record => ({
            id: record.id,
            identification: this.formatIdentifier(record.identification),
            businessName: record.businessName,
            period: record.period ?? '',
            transmissionDate: record.transmissionDate,
            status: record.status,
            situation: record.situation ?? undefined,
            debitAmount: record.debitAmount,
            balanceDue: record.balanceDue,
            origin: 'Plataforma',
          }));

        const dueDate = new Date(pendente.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: pendente.id,
          identification: pendente.identification,
          businessName: pendente.businessName || cliente?.razao_social,
          period: pendente.period,
          dueDate: pendente.dueDate,
          daysUntilDue,
          severity: pendente.severity,
          message: pendente.message,
          ultimosRegistros,
        };
      })
    );

    const totals = {
      totalPendentes: items.length,
      totalRegistros: items.reduce((acc, item) => acc + item.ultimosRegistros.length, 0),
    };

    return {
      type: 'pendentes',
      generatedAt: new Date().toISOString(),
      filters,
      data: {
        items,
        totals,
      },
    };
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
}

export default ReportDataFactory;

