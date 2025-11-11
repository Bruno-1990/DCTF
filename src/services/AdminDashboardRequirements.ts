export interface AdminPersona {
  id: string;
  name: string;
  goals: string[];
  keyMetrics: string[];
  authentication: 'api-key' | 'jwt' | 'public';
}

export interface AdminModule {
  id: string;
  title: string;
  description: string;
  widgets: string[];
}

export interface AccessControlModel {
  requiresPassword: boolean;
  authenticationModes: Array<'api-key' | 'jwt' | 'public'>;
  notes: string;
}

export interface AdminDashboardRequirements {
  personas: AdminPersona[];
  modules: AdminModule[];
  accessControl: AccessControlModel;
}

export function buildAdminDashboardRequirements(): AdminDashboardRequirements {
  const personas: AdminPersona[] = [
    {
      id: 'executive',
      name: 'Gestor Executivo',
      goals: [
        'Visão consolidada de risco fiscal',
        'Monitorar saldo pendente e multas potenciais',
      ],
      keyMetrics: ['risk-score', 'pending-balance', 'total-declarations'],
      authentication: 'api-key',
    },
    {
      id: 'fiscal-analyst',
      name: 'Analista Fiscal',
      goals: [
        'Identificar obrigações em atraso',
        'Priorizar ações corretivas',
      ],
      keyMetrics: ['missing-period-alerts', 'processing-status', 'retification-series'],
      authentication: 'api-key',
    },
    {
      id: 'controller',
      name: 'Controller Financeiro',
      goals: [
        'Conferir impacto financeiro de débitos x pagamentos',
        'Planejar fluxo de caixa fiscal',
      ],
      keyMetrics: ['balance-by-identification', 'debit-total', 'balance-ratio'],
      authentication: 'api-key',
    },
    {
      id: 'compliance',
      name: 'Compliance / Auditoria',
      goals: [
        'Acompanhar reincidência de retificações',
        'Documentar plano de ação de alertas',
      ],
      keyMetrics: ['alert-severity-distribution', 'realtime-events'],
      authentication: 'api-key',
    },
  ];

  const modules: AdminModule[] = [
    {
      id: 'dashboard-overview',
      title: 'Visão Geral',
      description: 'Resumo executivo com indicadores chave e tendências.',
      widgets: ['risk-score', 'pending-balance', 'declarations-trend'],
    },
    {
      id: 'obligation-tracking',
      title: 'Monitoramento de Obrigações',
      description: 'Controle de entregas, omissões e status de processamento.',
      widgets: ['timeline-transmissions', 'omission-heatmap', 'processing-table'],
    },
    {
      id: 'financial-monitoring',
      title: 'Visão Financeira',
      description: 'Análises de débitos, saldos e ranking por contribuinte.',
      widgets: ['balance-ranking', 'financial-summary'],
    },
    {
      id: 'alerts-management',
      title: 'Alertas e Risco',
      description: 'Tratamento de alertas automáticos e acompanhamento de planos de ação.',
      widgets: ['alert-severity-cards', 'alert-detailed-table'],
    },
    {
      id: 'configuration',
      title: 'Configurações e Integrações',
      description: 'Gerenciamento de chaves de API, webhooks e preferências do painel.',
      widgets: ['api-key-management', 'webhook-settings'],
    },
  ];

  const accessControl: AccessControlModel = {
    requiresPassword: false,
    authenticationModes: ['api-key'],
    notes:
      'Acesso centralizado via API key emitida pela plataforma. Sem armazenamento ou fluxo de senhas.',
  };

  return {
    personas,
    modules,
    accessControl,
  };
}
