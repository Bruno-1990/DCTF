import {
  ReportType,
  ReportFilterOptions,
  ReportDataEnvelope,
  GerencialReportData,
  ClientesReportData,
  ClientesReportItem,
  ClientesReportStatusSummary,
  DCTFReportData,
  DCTFConferenciaReportItem,
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
import { gerarResumoConferencias } from '../conferences/ConferenceModulesService';
import { HostDadosObrigacaoService } from '../HostDadosObrigacaoService';
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

  /** Normaliza CNPJ para apenas dígitos (mesma regra da conferência). */
  private static normalizarCnpj(cnpj: string | null | undefined): string | null {
    if (!cnpj) return null;
    const limpo = String(cnpj).replace(/\D/g, '');
    return limpo.length >= 11 ? limpo : null;
  }

  /**
   * Verifica se tipos_movimento contém o tipo (fiscal, trabalhista, contábil).
   * Usa a mesma classificação da conferência e de Cliente > Lançamentos SCI:
   * Fiscal: fiscal, FISE, FISS, FISCAL ENTRADA, FISCAL SAÍDA
   * Trabalhista: trabalhista, FPG (folha)
   * Contábil: contábil, contabil, CTB
   */
  private static temMovimentacaoTipo(tiposMovimento: string[], tipo: string): boolean {
    const lower = tipo.toLowerCase();
    const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const keywords: Record<string, string[]> = {
      fiscal: ['fiscal', 'fise', 'fiss'],
      trabalhista: ['trabalhista', 'fpg'],
      contábil: ['contábil', 'contabil', 'ctb'],
      contabil: ['contábil', 'contabil', 'ctb'],
    };
    const keys = keywords[lower] ?? [lower];
    return tiposMovimento.some((t) => {
      const n = normalized(t);
      return keys.some((k) => n === k || n.includes(k));
    });
  }

  private static async buildDctfData(filters: ReportFilterOptions): Promise<ReportDataEnvelope<DCTFReportData>> {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const competenciaMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const competenciaYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const competenciaVigente = `${String(competenciaMonth).padStart(2, '0')}/${competenciaYear}`;
    // Movimento que gera obrigação: mês anterior à competência (igual à lógica da conferência "sem DCTF com movimento")
    const mesMovimento = competenciaMonth === 1 ? 12 : competenciaMonth - 1;
    const anoMovimento = competenciaMonth === 1 ? competenciaYear - 1 : competenciaYear;

    const hostDados = new HostDadosObrigacaoService();
    const [clientesResult, resumoConferencia, movimentacaoMes] = await Promise.all([
      clienteModel.findAll(),
      gerarResumoConferencias(),
      hostDados.listarMovimentacaoPorCompetenciaPorCliente(anoMovimento, mesMovimento),
    ]);

    const clientes = clientesResult.success && clientesResult.data ? clientesResult.data : [];
    const { clientesDispensadosDCTF, clientesSemDCTFComMovimento, clientesSemDCTFVigente, dctfsForaDoPrazo, dctfsPeriodoInconsistente } =
      resumoConferencia.modulos;

    const setOkDispensados = new Set<string>();
    const mapDescricaoOk = new Map<string, string>();
    for (const item of clientesDispensadosDCTF) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm) {
        setOkDispensados.add(norm);
        mapDescricaoOk.set(norm, item.mensagem || 'Dispensado - Original sem movimento (obrigação retorna quando houver movimentação).');
      }
    }

    const mapRevisar = new Map<string, string>();
    for (const item of clientesSemDCTFComMovimento) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm && !setOkDispensados.has(norm)) {
        mapRevisar.set(norm, 'Cliente sem DCTF mas com movimento no mês anterior. Precisam enviar a declaração.');
      }
    }
    for (const item of clientesSemDCTFVigente) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm && !setOkDispensados.has(norm) && !mapRevisar.has(norm)) {
        mapRevisar.set(norm, item.mensagem || 'Cliente sem DCTF na competência vigente. Verificar se houve movimento.');
      }
    }
    for (const item of dctfsForaDoPrazo) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm && !setOkDispensados.has(norm) && !mapRevisar.has(norm)) {
        mapRevisar.set(norm, item.mensagem || 'DCTF enviada fora do prazo.');
      }
    }
    for (const item of dctfsPeriodoInconsistente) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm && !setOkDispensados.has(norm) && !mapRevisar.has(norm)) {
        mapRevisar.set(norm, item.mensagem || 'DCTF com período inconsistente.');
      }
    }

    const mapMovimentacao = new Map<string, { tipos: string[]; total: number }>();
    for (const item of movimentacaoMes) {
      const norm = this.normalizarCnpj(item.cnpj);
      if (norm) {
        mapMovimentacao.set(norm, {
          tipos: item.tipos_movimento ?? [],
          total: item.total_movimentacoes ?? 0,
        });
      }
    }

    const items: DCTFConferenciaReportItem[] = clientes.map((cliente) => {
      const cnpjNorm = this.normalizarCnpj(cliente.cnpj_limpo);
      const isDispensado = cnpjNorm ? setOkDispensados.has(cnpjNorm) : false;
      const revisarMsg = cnpjNorm ? mapRevisar.get(cnpjNorm) : undefined;
      const statusDctf: 'OK' | 'REVISAR' = isDispensado ? 'OK' : revisarMsg ? 'REVISAR' : 'OK';
      const descricao = isDispensado
        ? (cnpjNorm ? mapDescricaoOk.get(cnpjNorm) : null) ?? 'Dispensado - Original sem movimento (obrigação retorna quando houver movimentação).'
        : revisarMsg ?? 'Sem pendências na competência vigente.';

      const mov = cnpjNorm ? mapMovimentacao.get(cnpjNorm) : undefined;
      const tiposMovimento = mov?.tipos ?? [];
      let movimentacaoFiscal = this.temMovimentacaoTipo(tiposMovimento, 'fiscal');
      let movimentacaoTrabalhista = this.temMovimentacaoTipo(tiposMovimento, 'trabalhista');
      let movimentacaoContabil =
        this.temMovimentacaoTipo(tiposMovimento, 'contábil') || this.temMovimentacaoTipo(tiposMovimento, 'contabil');
      const totalMovimentacoes = mov?.total ?? 0;

      // Se há total de movimentações mas nenhum tipo foi classificado (ex.: relatorio NULL no banco),
      // marcar ao menos um como Sim para não exibir "Não" com total > 0
      if (totalMovimentacoes > 0 && !movimentacaoFiscal && !movimentacaoTrabalhista && !movimentacaoContabil) {
        movimentacaoContabil = true;
      }

      return {
        cnpj: this.formatIdentifier(cliente.cnpj_limpo ?? ''),
        razaoSocial: cliente.razao_social,
        codSci: cliente.codigo_sci ?? undefined,
        statusDctf,
        descricao,
        competencia: competenciaVigente,
        periodoApuracao: competenciaVigente,
        movimentacaoFiscal,
        movimentacaoTrabalhista,
        movimentacaoContabil,
        totalMovimentacoes,
      };
    });

    items.sort((a, b) => (a.razaoSocial ?? '').localeCompare(b.razaoSocial ?? '', 'pt-BR'));

    return {
      type: 'dctf',
      generatedAt: new Date().toISOString(),
      filters,
      data: {
        items,
        totals: { clientes: items.length },
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
    // Buscar todas as pendentes, independente da vigência
    const months = filters.months && filters.months > 0 ? filters.months : 12; // Buscar 12 meses por padrão
    const conferenceSummary = await getConferenceSummary(months);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('[ReportDataFactory] Total de issues encontradas:', conferenceSummary.rules.dueDate.length);

    // Filtrar apenas declarações pendentes (em aberto)
    // Inclui: low (vigente), medium (próximo do vencimento) e high (vencidas)
    // Não filtra por mês - traz todas as pendentes
    const pendentes: DashboardConferenceIssue[] = conferenceSummary.rules.dueDate.filter((issue) => {
      // Não estão concluídas (status não é 'concluido')
      const status = (issue.status ?? '').toLowerCase();
      const notCompleted = status !== 'concluido';
      
      // Incluir todas as severidades -
      // low = vigente, medium = próximo do vencimento, high = vencido
      const isPending = issue.severity === 'low' || issue.severity === 'medium' || issue.severity === 'high';
      
      return notCompleted && isPending;
    });

    console.log('[ReportDataFactory] Total de pendentes (todas):', pendentes.length);

    // Buscar todos os registros DCTF para poder filtrar por CNPJ
    const dctfResponse = await dctfModel.findAll();
    const allDctfRecords = dctfResponse.success && dctfResponse.data ? dctfResponse.data : [];

    // Para cada declaração pendente, buscar os últimos registros DCTF do CNPJ
    const items: PendentesReportItem[] = await Promise.all(
      pendentes.map(async (pendente) => {
        const cnpjLimpo = this.cleanIdentification(pendente.identification);
        
        console.log('[ReportDataFactory] Buscando registros para CNPJ:', cnpjLimpo, 'Identification original:', pendente.identification);
        
        // Buscar cliente pelo CNPJ
        const clientesResponse = await clienteModel.findAll();
        const clientes = clientesResponse.success && clientesResponse.data ? clientesResponse.data : [];
        const cliente = clientes.find(c => {
          const clienteCnpjLimpo = String(c.cnpj_limpo || '').replace(/\D/g, '');
          return clienteCnpjLimpo === cnpjLimpo;
        });

        console.log('[ReportDataFactory] Cliente encontrado:', cliente ? `Sim (ID: ${cliente.id})` : 'Não');

        // Buscar registros DCTF deste CNPJ (através do cliente E por identification para garantir)
        let registrosDctf: IDCTF[] = [];
        const registrosPorCliente: IDCTF[] = [];
        const registrosPorId: IDCTF[] = [];
        
        // Buscar via cliente se existir
        // FILTRAR APENAS REGISTROS COM SITUAÇÃO "EM ANDAMENTO"
        if (cliente) {
          const dctfPorCliente = await dctfModel.findByCliente(cliente.id);
          if (dctfPorCliente.success && dctfPorCliente.data) {
            // Filtrar apenas registros com situação "Em andamento"
            const registrosFiltrados = dctfPorCliente.data.filter(record => {
              const situacao = (record.situacao || '').toLowerCase().trim();
              // Verificar se contém "andamento" (case-insensitive)
              return situacao.includes('andamento');
            });
            registrosPorCliente.push(...registrosFiltrados);
            console.log('[ReportDataFactory] Registros encontrados via cliente (em andamento):', registrosPorCliente.length, 'de', dctfPorCliente.data.length);
          }
        }
        
        // SEMPRE buscar também por identification nos registros (mesmo se encontrou via cliente)
        // Isso garante que pegamos todos os registros, mesmo se houver inconsistências
        // FILTRAR APENAS REGISTROS COM SITUAÇÃO "EM ANDAMENTO"
        registrosPorId.push(...allDctfRecords.filter(record => {
          // Filtrar apenas registros com situação "Em andamento"
          const situacao = (record.situacao || '').toLowerCase().trim();
          const isEmAndamento = situacao.includes('andamento');
          
          if (!isEmAndamento) {
            return false; // Pular registros que não estão em andamento
          }
          
          // Tentar múltiplas formas de identificar o CNPJ
          const dashboardRecord = mapToDashboardRecord(record);
          const recordId = this.cleanIdentification(dashboardRecord.identification ?? '');
          
          // Também verificar numeroIdentificacao se existir
          const recordNumId = record.numeroIdentificacao ? this.cleanIdentification(record.numeroIdentificacao) : '';
          
          // Verificar se o clienteId corresponde (se tiver cliente)
          const matchesId = recordId === cnpjLimpo;
          const matchesNumId = recordNumId && recordNumId === cnpjLimpo;
          const matchesCliente = cliente && record.clienteId === cliente.id;
          
          return matchesId || matchesNumId || matchesCliente;
        }));
        console.log('[ReportDataFactory] Registros encontrados via identification:', registrosPorId.length);
        
        // Combinar ambos os resultados e remover duplicatas por ID
        const registrosMap = new Map<string, IDCTF>();
        [...registrosPorCliente, ...registrosPorId].forEach(record => {
          if (!registrosMap.has(record.id)) {
            registrosMap.set(record.id, record);
          }
        });
        registrosDctf = Array.from(registrosMap.values());
        
        console.log('[ReportDataFactory] Total de registros únicos encontrados:', registrosDctf.length);
        
        // Log de amostra dos registros encontrados
        if (registrosDctf.length > 0) {
          console.log('[ReportDataFactory] Amostra de registros encontrados:', registrosDctf.slice(0, 2).map(r => ({
            id: r.id,
            periodo: r.periodo,
            status: r.status,
            numeroIdentificacao: r.numeroIdentificacao,
          })));
        } else {
          console.log('[ReportDataFactory] ⚠️ Nenhum registro encontrado para CNPJ:', cnpjLimpo);
        }

        // Ordenar por data de transmissão (mais recentes primeiro) e pegar os últimos registros
        // Aumentar para 10 registros para garantir que temos dados suficientes
        const ultimosRegistros = registrosDctf
          .map(record => {
            try {
              const normalized = this.normalizeDctfRecord(record);
              const dashboardRecord = mapToDashboardRecord(record);
              
              // Formatar datas
              const formatDateValue = (date: Date | string | null | undefined): string | null => {
                if (!date) return null;
                if (typeof date === 'string') {
                  // Se já é uma string ISO, retornar como está
                  if (date.includes('T') || date.includes('Z')) return date;
                  // Tentar parsear e formatar
                  try {
                    const parsed = new Date(date);
                    if (!isNaN(parsed.getTime())) return parsed.toISOString();
                  } catch {
                    return date; // Retornar string original se não conseguir parsear
                  }
                  return date;
                }
                try {
                  return date.toISOString();
                } catch {
                  return null;
                }
              };
              
              return {
                id: normalized.id,
                identification: this.formatIdentifier(normalized.identification),
                businessName: normalized.businessName,
                period: normalized.period ?? '',
                transmissionDate: normalized.transmissionDate,
                status: normalized.status,
                situation: normalized.situation ?? undefined,
                debitAmount: normalized.debitAmount,
                balanceDue: normalized.balanceDue,
                origin: 'Plataforma',
                // Incluir todos os campos disponíveis do record original
                tipo: record.tipo || record.tipoDeclaracao || dashboardRecord.declarationType || null,
                periodoApuracao: record.periodoApuracao || dashboardRecord.periodApuracao || null,
                dataDeclaracao: formatDateValue(record.dataDeclaracao),
                dataTransmissao: formatDateValue(record.dataTransmissao) || normalized.transmissionDate || null,
                horaTransmissao: record.horaTransmissao || null,
                tipoNi: record.tipoNi || null,
                numeroIdentificacao: record.numeroIdentificacao || null,
                categoria: record.categoria || dashboardRecord.category || null,
                origem: record.origem || dashboardRecord.origin || null,
                observacoes: record.observacoes || null,
                statusPagamento: record.statusPagamento || null,
                dataPagamento: formatDateValue(record.dataPagamento),
              };
            } catch (error) {
              console.error('[ReportDataFactory] Erro ao processar registro DCTF:', error, record);
              return null;
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => {
            // Ordenar por data de transmissão (mais recentes primeiro)
            // Se não tiver data de transmissão, usar data de declaração
            const aDate = a.transmissionDate ? Date.parse(a.transmissionDate) : 
                         (a.dataTransmissao ? Date.parse(a.dataTransmissao) : 
                         (a.dataDeclaracao ? Date.parse(a.dataDeclaracao) : 0));
            const bDate = b.transmissionDate ? Date.parse(b.transmissionDate) : 
                         (b.dataTransmissao ? Date.parse(b.dataTransmissao) : 
                         (b.dataDeclaracao ? Date.parse(b.dataDeclaracao) : 0));
            return bDate - aDate;
          })
          .slice(0, 10); // Aumentar para 10 registros

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

