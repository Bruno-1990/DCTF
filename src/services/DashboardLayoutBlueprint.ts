export type DashboardWidgetType =
  | 'kpi-card'
  | 'compact-table'
  | 'line-chart'
  | 'bar-chart'
  | 'alert-table'
  | 'timeline'
  | 'heatmap'
  | 'stacked-cards'
  | 'realtime-feed';

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  description?: string;
  dataSource: string;
  layout?: {
    colSpan?: number;
    rowSpan?: number;
  };
  config?: Record<string, any>;
}

export interface DashboardSection {
  id: string;
  title: string;
  description: string;
  widgets: DashboardWidget[];
  integration?: {
    websocket?: {
      namespace: string;
      events: string[];
      rooms?: string[];
    };
  };
}

export interface DashboardBlueprint {
  meta: {
    version: string;
    generatedAt: string;
    source: string;
  };
  sections: DashboardSection[];
}

export function buildDashboardBlueprint(): DashboardBlueprint {
  return {
    meta: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      source: 'DashboardMetricsService',
    },
    sections: [
      {
        id: 'executive-overview',
        title: 'Visão Executiva',
        description:
          'Resumo imediato de risco fiscal, volume de declarações e saldo pendente para apoiar a decisão gerencial.',
        widgets: [
          {
            id: 'kpi-risk-score',
            type: 'kpi-card',
            title: 'Risco Fiscal Médio',
            description: 'Score calculado pelo motor de análise agregando todas as DCTF monitoradas.',
            dataSource: 'metrics.financial.balanceRatio',
            layout: { colSpan: 1 },
            config: {
              format: 'percentage',
              thresholds: [
                { label: 'Baixo', max: 0.2 },
                { label: 'Moderado', max: 0.5 },
                { label: 'Crítico', max: 1 },
              ],
            },
          },
          {
            id: 'kpi-open-balance',
            type: 'kpi-card',
            title: 'Saldo Pendente',
            description: 'Somatório de saldo a pagar das declarações com prazo vencido.',
            dataSource: 'metrics.financial.balanceTotal',
            layout: { colSpan: 1 },
            config: {
              format: 'currency',
            },
          },
          {
            id: 'kpi-declarations',
            type: 'kpi-card',
            title: 'Declarações Monitoradas',
            description: 'Quantidade de DCTF consideradas na janela de 5 meses.',
            dataSource: 'metrics.totals.declarations',
            layout: { colSpan: 1 },
          },
          {
            id: 'chart-declarations-by-period',
            type: 'line-chart',
            title: 'Evolução de Entregas',
            description: 'Declarações transmitidas por competência, destacando originais e retificadoras.',
            dataSource: 'metrics.totals.byPeriod',
            layout: { colSpan: 3 },
            config: {
              series: [
                { key: 'original', source: 'metrics.totals.byType.original' },
                { key: 'retificadora', source: 'metrics.totals.byType.retificadora' },
              ],
            },
          },
        ],
      },
      {
        id: 'obligation-tracking',
        title: 'Monitoramento de Obrigações',
        description:
          'Acompanha tempestividade das entregas, possíveis omissões e status operacional das declarações.',
        widgets: [
          {
            id: 'timeline-transmissions',
            type: 'timeline',
            title: 'Linha do Tempo de Transmissões',
            description: 'Histórico de transmissões com proximidade em relação ao prazo legal.',
            dataSource: 'metrics.operations.transmissionsByDate',
            layout: { colSpan: 3 },
          },
          {
            id: 'heatmap-omissions',
            type: 'heatmap',
            title: 'Possíveis Omissões por CNPJ',
            description: 'Destaca contribuintes com lacunas de competência em sequência.',
            dataSource: 'metrics.alerts',
            config: {
              filter: { type: 'missing_period' },
            },
            layout: { colSpan: 2 },
          },
          {
            id: 'table-processing-status',
            type: 'compact-table',
            title: 'Processamentos em Andamento',
            description: 'Declarações cuja situação ainda consta como em andamento ou pendente.',
            dataSource: 'metrics.alerts',
            config: {
              filter: { type: 'processing' },
              columns: ['identification', 'period', 'severity', 'message'],
            },
            layout: { colSpan: 2 },
          },
        ],
      },
      {
        id: 'financial-view',
        title: 'Visão Financeira',
        description:
          'Conciliação entre débitos apurados e saldos a pagar para cada contribuinte e competência.',
        widgets: [
          {
            id: 'bar-balance-by-identification',
            type: 'bar-chart',
            title: 'Top Exposição por CNPJ',
            description: 'Ranking de contribuintes com maiores saldos pendentes.',
            dataSource: 'metrics.financial.balanceByIdentification',
            layout: { colSpan: 3 },
          },
          {
            id: 'table-financial-summary',
            type: 'compact-table',
            title: 'Resumo Financeiro por Competência',
            description: 'Mostra débito apurado, saldo a pagar e variação em relação ao mês anterior.',
            dataSource: 'metrics.financial',
            layout: { colSpan: 3 },
          },
        ],
      },
      {
        id: 'alerts-and-risk',
        title: 'Alertas e Risco',
        description:
          'Centraliza os alertas inteligentes derivados das regras de severidade (omissão, saldo, retificações).',
        widgets: [
          {
            id: 'alert-summary',
            type: 'stacked-cards',
            title: 'Alertas por Severidade',
            description: 'Distribuição de alertas altos, médios e baixos.',
            dataSource: 'metrics.alerts',
            layout: { colSpan: 2 },
            config: {
              summarizeBy: 'severity',
            },
          },
          {
            id: 'alert-table-detailed',
            type: 'alert-table',
            title: 'Detalhamento de Alertas',
            description: 'Lista os alertas para priorização das ações corretivas.',
            dataSource: 'metrics.alerts',
            layout: { colSpan: 4 },
            config: {
              columns: ['severity', 'type', 'identification', 'period', 'message'],
              actions: ['ver-dctf', 'abrir-plano-acao'],
            },
          },
        ],
      },
      {
        id: 'realtime-events',
        title: 'Eventos em Tempo Real',
        description:
          'Painel de atualizações recebidas via WebSocket (conclusão de análise, flags, health).',
        widgets: [
          {
            id: 'realtime-feed',
            type: 'realtime-feed',
            title: 'Feed de Eventos',
            description: 'Eventos mais recentes originados do backend via WebSocket.',
            dataSource: 'websocket.feed',
            layout: { colSpan: 6 },
            config: {
              highlightSeverities: ['critical', 'high'],
            },
          },
        ],
        integration: {
          websocket: {
            namespace: '/realtime',
            events: ['analysis.completed', 'flags.created', 'flags.updated'],
            rooms: ['client:<id>', 'analysis:<id>', 'global:critical'],
          },
        },
      },
    ],
  };
}
