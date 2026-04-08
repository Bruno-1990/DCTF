// Tipos globais para o frontend
export interface Cliente {
  id: string;
  nome?: string; // Mantido para compatibilidade
  razao_social?: string; // Campo real do banco
  cnpj?: string; // CNPJ formatado
  cnpj_limpo?: string; // CNPJ sem formatação
  codigo_sci?: string; // Código SCI do sistema
  email?: string;
  telefone?: string;
  endereco?: string;
  /** Nome da pasta na rede. Label na UI: Rede. */
  nome_pasta_rede?: string | null;
  cidade?: string;
  estado?: string;
  cep?: string;
  // Campos ampliados (ReceitaWS)
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
  // `cep` já existe acima como campo genérico; manter compatibilidade

  receita_email?: string | null;
  receita_telefone?: string | null;

  tipo_empresa?: string | null; // Matriz ou Filial
  capital_social?: number | string | null;
  regime_tributario?: string | null; // Simples Nacional, Lucro Presumido, Lucro Real, A Definir
  beneficios_fiscais?: string | null; // Ex: SUBSTITUTO, FUNDAP, COMPETE ATACADISTA
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
  createdAt?: Date;
  updatedAt?: Date;
  // Indicadores de pagamento (enviados pelo backend em /api/clientes)
  hasPayments?: boolean;
  paymentsCount?: number;
  // Porcentagem de participação do sócio filtrado (enviado pelo backend quando há filtro por sócio)
  socio_participacao_percentual?: number | null;
}

export interface ClienteSocio {
  id: string;
  cliente_id: string;
  nome: string;
  cpf?: string | null;
  qual?: string | null;
  participacao_percentual?: number | null; // Porcentagem de participação no capital social
  participacao_valor?: number | null; // Valor da participação calculado
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

// ── e-BEF (Beneficiários Finais) ──

export interface EBEFSocioFilho {
  id: string;
  nome: string;
  qual?: string | null;
}

export interface EBEFConsulta {
  id: string;
  cnpj_filho: string;
  nome_filho?: string | null;
  situacao_filho?: string | null;
  capital_social_filho?: number | null;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  erro_mensagem?: string | null;
  consultado_em?: string | null;
  socios: EBEFSocioFilho[];
}

export interface EBEFSocioPJ {
  socio_id: string;
  nome: string;
  cnpj_filho: string;
  qual?: string | null;
  consulta?: EBEFConsulta | null;
}

export interface EBEFParent {
  id: string;
  razao_social: string;
  cnpj_limpo: string;
  socios_pj: EBEFSocioPJ[];
}

export interface EBEFProgress {
  total: number;
  concluidos: number;
  pendentes: number;
  processando: number;
  erros: number;
  em_andamento: boolean;
  cnpj_atual?: string | null;
}

