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
  nome: string;
  cnpj: string;
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
  arquivoOriginal: string;
  dadosProcessados?: any;
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
