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
  razao_social?: string; // Campo real no banco
  cnpj?: string; // CNPJ formatado
  cnpj_limpo?: string; // CNPJ sem formatação
  email?: string;
  telefone?: string;
  endereco?: string;
}

// Tipos para DCTF
export interface DCTF extends BaseEntity {
  clienteId: string;
  periodo: string;
  dataDeclaracao: Date;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  situacao?: string | null;
  arquivoOriginal: string;
  dadosProcessados?: any;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
  cliente?: Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'cnpj' | 'cnpj_limpo'>;
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
}
