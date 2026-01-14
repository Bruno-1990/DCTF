/**
 * Definições de tipos TypeScript para o projeto DCTF
 * Centraliza todas as interfaces e tipos utilizados no sistema
 */

// Tipos base para entidades do sistema
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Tipos para Cliente
export interface Cliente extends BaseEntity {
  nome?: string; // Mantido para compatibilidade com código existente
  razao_social: string; // Campo obrigatório no banco
  cnpj_limpo: string; // CNPJ sem formatação (14 dígitos) - ÚNICA coluna no banco
  // cnpj formatado é gerado apenas na exibição, não é salvo no banco
  codigo_sci?: string; // Código SCI do sistema
  email?: string;
  telefone?: string;
  endereco?: string;

  // Campos ampliados (ReceitaWS / cadastro robusto)
  fantasia?: string;
  tipo_estabelecimento?: string;
  situacao_cadastral?: string;
  porte?: string;
  natureza_juridica?: string;
  abertura?: string | Date | null;
  data_situacao?: string | Date | null;
  motivo_situacao?: string | null;
  situacao_especial?: string | null;
  data_situacao_especial?: string | Date | null;
  efr?: string | null;

  atividade_principal_code?: string | null;
  atividade_principal_text?: string | null;
  atividades_secundarias?: any;

  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;

  receita_email?: string | null;
  receita_telefone?: string | null;

  tipo_empresa?: string | null; // Matriz ou Filial
  capital_social?: number | string | null;
  regime_tributario?: string | null; // Simples Nacional, Lucro Presumido, Lucro Real, A Definir
  simples_optante?: boolean | null;
  simples_data_opcao?: string | Date | null;
  simples_data_exclusao?: string | Date | null;
  simei_optante?: boolean | null;
  simei_data_opcao?: string | Date | null;
  simei_data_exclusao?: string | Date | null;

  receita_ws_status?: string | null;
  receita_ws_message?: string | null;
  receita_ws_consulta_em?: string | Date | null;
  receita_ws_ultima_atualizacao?: string | Date | null;
  receita_ws_payload?: any;

  socios?: ClienteSocio[];
}

export interface ClienteSocio extends BaseEntity {
  cliente_id: string;
  nome: string;
  cpf?: string | null;
  qual?: string | null;
  participacao_percentual?: number | null; // Porcentagem de participação no capital social
  participacao_valor?: number | null; // Valor da participação calculado
}

// Tipos para DCTF
export interface DCTF extends BaseEntity {
  clienteId: string;
  periodo: string;
  dataDeclaracao: Date;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  situacao?: string | null;
  tipo?: string | null;  // ✅ Campo 'tipo' do banco (Original, Retificadora, Original sem movimento, etc.)
  periodoApuracao?: string | null;
  dataTransmissao?: Date | string | null;
  horaTransmissao?: string | null;
  tipoNi?: string | null;
  numeroIdentificacao?: string | null;
  categoria?: string | null;
  origem?: string | null;
  tipoDeclaracao?: string | null;
  arquivoOriginal: string;
  dadosProcessados?: any;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
  observacoes?: string | null;
  // Campos de pagamento
  statusPagamento?: 'pendente' | 'pago' | 'parcelado' | 'cancelado' | 'em_analise' | null;
  dataPagamento?: Date | string | null;
  comprovantePagamento?: string | null;
  observacoesPagamento?: string | null;
  usuarioQueAtualizou?: string | null;
  dataAtualizacaoPagamento?: Date | string | null;
  cliente?: Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'cnpj_limpo'>;
}

// Tipos para dashboard de monitoramento
export interface DashboardDCTFRecord {
  identificationType: string;
  identification: string;
  businessName?: string;
  period: string;
  periodApuracao?: string | null;
  transmissionDate?: string;
  category?: string;
  origin?: string;
  declarationType: string;
  situation?: string;
  status?: string;
  debitAmount?: number | string | null;
  balanceDue?: number | string | null;
}

export type DashboardAlertSeverity = 'low' | 'medium' | 'high';

export type DashboardAlertType =
  | 'missing_period'
  | 'pending_balance'
  | 'zero_debit'
  | 'retification_series'
  | 'processing'
  | 'data_inconsistency';

export interface DashboardAlert {
  type: DashboardAlertType;
  severity: DashboardAlertSeverity;
  identification: string;
  businessName?: string;
  period?: string;
  message: string;
  context?: Record<string, any>;
}

export interface DashboardMetrics {
  totals: {
    declarations: number;
    byPeriod: Record<string, number>;
    byPeriodApuracao?: Record<string, number>;
    byType: Record<string, number>;
    byOrigin: Record<string, number>;
  };
  financial: {
    debitTotal: number;
    balanceTotal: number;
    balanceRatio: number;
    averageBalance: number;
    balanceByIdentification: Array<{ identification: string; businessName?: string; balance: number }>;
  };
  operations: {
    transmissionsByDate: Record<string, number>;
    zeroMovementCount: number;
    retificationRate: number;
  };
  statusSummary: {
    delivered: number;
    received: number;
    inProgress: number;
    errors: number;
    total: number;
  };
  alerts: DashboardAlert[];
}

export type ConferenceIssueSeverity = 'low' | 'medium' | 'high';

export interface DashboardConferenceIssue {
  id: string;
  rule: 'due_date' | 'transmission_obligation' | 'missing_period' | 'retificadora_without_original' | 'duplicate_declaration' | 'future_period' | 'retificadora_sequence' | 'missing_declaration';
  identification: string;
  businessName?: string;
  period: string;
  dueDate: string;
  transmissionDate?: string;
  status?: string;
  severity: ConferenceIssueSeverity;
  daysLate?: number;
  message: string;
  details?: Record<string, any>;
  actionPlan?: string;
}

export interface DashboardConferenceSummary {
  generatedAt: string;
  rules: {
    dueDate: DashboardConferenceIssue[];
    transmissionObligation?: DashboardConferenceIssue[];
    missingPeriod?: DashboardConferenceIssue[];
    retificadoraWithoutOriginal?: DashboardConferenceIssue[];
    duplicateDeclaration?: DashboardConferenceIssue[];
    futurePeriod?: DashboardConferenceIssue[];
    retificadoraSequence?: DashboardConferenceIssue[];
    allSemMovimento?: DashboardConferenceIssue[];  // ✅ Lista simples de todas as declarações "sem movimento"
    clientesSemDCTF?: DashboardConferenceIssue[];  // ✅ Clientes sem DCTF na competência vigente
  };
}

export interface DCTFAnalysisDataset {
  generatedAt: string;
  filters: Record<string, any>;
  declaracoes: NormalizedDCTFDeclaracao[];
  totals: {
    declaracoes: number;
    clientes: number;
    periodos: number;
  };
}

export interface NormalizedDCTFDeclaracao {
  id: string;
  clienteId?: string;
  periodo: string;
  dataDeclaracao?: string;
  situacao?: string | null;
  status: string;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
  cliente?: {
    id: string;
    razaoSocial?: string;
    cnpj?: string;
    cnpjLimpo?: string;
    regime?: string | null;
    cnaes?: string[];
  };
  dados: NormalizedDCTFDado[];
  stats: {
    receitaTotal: number;
    deducaoTotal: number;
    retencaoTotal: number;
    linhas: number;
  };
  metadata: {
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface NormalizedDCTFDado {
  id: string;
  linha?: number;
  codigo?: string;
  descricao?: string;
  valor?: number;
  codigoReceita?: string | null;
  cnpjCpf?: string | null;
  dataOcorrencia?: string | null;
  observacoes?: string | null;
}

// Tipos para Análise
export interface Analise extends BaseEntity {
  dctfId: string;
  tipoAnalise: string;
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  descricao: string;
  recomendacoes: string[];
  status: 'pendente' | 'em_analise' | 'concluida';
}

// Tipos para Relatório
export interface Relatorio extends BaseEntity {
  declaracaoId: string;
  tipoRelatorio: string;
  titulo: string;
  conteudo?: string;
  arquivoPdf?: string;
  parametros?: Record<string, any>;
}

// Tipos para Upload de Arquivos
export interface UploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
  fileName: string;
  fileSize: number;
}

// Tipos para Resposta da API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: string; // Detalhes adicionais do erro para debug
  stack?: string; // Stack trace (apenas em desenvolvimento)
}

export type ReportType = 'gerencial' | 'clientes' | 'dctf' | 'conferencia' | 'pendentes';

export interface ReportFilterOptions {
  months?: number;
  period?: string;
  identification?: string;
  clientId?: string;
}

export interface ReportDataEnvelope<TData = any> {
  type: ReportType;
  generatedAt: string;
  filters: ReportFilterOptions;
  meta?: Record<string, any>;
  data: TData;
}

export interface GerencialReportData {
  records: DashboardDCTFRecord[];
  metrics: DashboardMetrics;
  conferences: DashboardConferenceSummary;
  summary: {
    monthsConsidered?: number | null;
    totalRecords: number;
  };
}

export interface ClientesReportStatusSummary {
  concluido: number;
  pendente: number;
  processando: number;
  erro: number;
}

export interface ClientesReportItem {
  id: string;
  businessName?: string;
  cnpj?: string;
  cnpjLimpo?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  totalDeclaracoes: number;
  ultimoPeriodo?: string;
  ultimoEnvio?: string;
  valores: {
    debitoTotal: number;
    saldoTotal: number;
  };
  statusSummary: ClientesReportStatusSummary;
}

export interface ClientesReportData {
  items: ClientesReportItem[];
  totals: {
    clientes: number;
    declaracoes: number;
    debitoTotal: number;
    saldoTotal: number;
  };
}

export interface DCTFReportItem {
  id: string;
  identification: string;
  businessName?: string;
  period: string;
  transmissionDate?: string;
  status?: string;
  situation?: string | null;
  debitAmount?: number | string | null;
  balanceDue?: number | string | null;
  origin?: string;
  // Campos adicionais da tabela DCTF
  tipo?: string | null;
  periodoApuracao?: string | null;
  dataDeclaracao?: string | null;
  dataTransmissao?: string | null;
  horaTransmissao?: string | null;
  tipoNi?: string | null;
  numeroIdentificacao?: string | null;
  categoria?: string | null;
  origem?: string | null;
  observacoes?: string | null;
  statusPagamento?: string | null;
  dataPagamento?: string | null;
}

export interface DCTFReportData {
  items: DCTFReportItem[];
  totals: {
    declaracoes: number;
    debitoTotal: number;
    saldoTotal: number;
  };
}

export interface ConferenceReportData {
  summary: DashboardConferenceSummary;
  totals: {
    totalIssues: number;
    bySeverity: Record<ConferenceIssueSeverity, number>;
  };
}

export interface PendentesReportItem {
  // Informações da declaração pendente
  id: string;
  identification: string;
  businessName?: string;
  period: string;
  dueDate: string;
  daysUntilDue: number;
  severity: ConferenceIssueSeverity;
  message: string;
  // Últimos registros DCTF deste CNPJ
  ultimosRegistros: DCTFReportItem[];
}

export interface PendentesReportData {
  items: PendentesReportItem[];
  totals: {
    totalPendentes: number;
    totalRegistros: number;
  };
}
