// Tipos globais para o frontend
export interface Cliente {
  id: string;
  nome?: string; // Mantido para compatibilidade
  razao_social?: string; // Campo real do banco
  cnpj?: string; // CNPJ formatado
  cnpj_limpo?: string; // CNPJ sem formatação
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DCTF {
  id: string;
  clienteId: string;
  periodo: string;
  dataDeclaracao: Date;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  situacao?: string | null;
  observacoes?: string;
  debitoApurado?: number | null;
  saldoAPagar?: number | null;
  createdAt: Date;
  updatedAt: Date;
  cliente?: Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'cnpj' | 'cnpj_limpo'>;
}

export interface DCTFDados {
  id: string;
  dctfId: string;
  codigo: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'deducao' | 'retencao' | 'outros';
  createdAt: Date;
  updatedAt: Date;
}

export interface Analise {
  id: string;
  dctfId: string;
  tipo: 'validacao' | 'inconsistencia' | 'alerta';
  descricao: string;
  status: 'pendente' | 'resolvido' | 'ignorado';
  createdAt: Date;
  updatedAt: Date;
}

export interface Flag {
  id: string;
  dctfId: string;
  tipo: 'erro' | 'aviso' | 'info';
  descricao: string;
  status: 'ativo' | 'resolvido' | 'ignorado';
  createdAt: Date;
  updatedAt: Date;
}

export interface Relatorio {
  id: string;
  clienteId: string;
  tipo: 'dctf' | 'analise' | 'consolidado';
  titulo: string;
  conteudo: string;
  formato: 'pdf' | 'excel' | 'csv';
  createdAt: Date;
  updatedAt: Date;
}

