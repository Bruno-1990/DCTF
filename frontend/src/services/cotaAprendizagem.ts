import api from './api';

/**
 * Cota de aprendizagem — classificação de porte ME/EPP/Demais.
 * Interfaces espelhando os DTOs de `src/services/CotaAprendizagemService.ts`.
 */

export type Porte = 'ME' | 'EPP' | 'DEMAIS' | 'SEM_DADOS';

export type SituacaoFaixa =
  | 'DENTRO_DA_FAIXA'
  | 'MUDA_EM_JANEIRO'
  | 'MUDOU_NO_ANO'
  | 'JA_SUJEITA'
  | 'INDETERMINADO';

/** Leitura pronta: onde a empresa está, para onde vai e em que prazo. */
export interface Diagnostico {
  porteAtual: Porte;
  proximoPorte: Porte | null;
  situacao: SituacaoFaixa;
  /** Teto da faixa atual, em centavos. */
  limiteDaFaixaCentavos: number | null;
  /** Quanto ainda cabe antes de estourar. Negativo = já passou. */
  folgaCentavos: number | null;
  percentualDoLimite: number | null;
  dataEfeito: string | null;
  resumo: string;
  sujeitaCota: boolean | null;
}

export interface LinhaClassificacao {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_sci: number | null;
  uf: string | null;
  porte_declarado: string | null;
  abertura: string | null;
  /** Registro só na OAB: o porte "Demais" do CNPJ é imposto, não desatualizado. */
  sociedade_advogados: boolean;
  ano: number;
  mes: number;
  bdref: number;
  rbaa: number | null;
  rba: number | null;
  porte: Porte;
  porte_base: Porte;
  motivo: string;
  /** Tri-estado: null = não foi possível concluir (≠ isenta). */
  sujeita_cota: boolean | null;
  excede_teto_epp: boolean;
  excede_teto_me: boolean;
  mes_excesso_limite: number | null;
  mes_excesso_20pct: number | null;
  data_efeito: string | null;
  meses_faltantes: number;
  meses_faltantes_lista: string | null;
  dado_confiavel: boolean;
  impedimento_societario: boolean;
  inicio_atividade: boolean;
  revisar_juridico: boolean;
  /** SOCIO_PJ | SOCIO_EXTERIOR | SOCIO_OAB | INICIO_ATIVIDADE | MES_EXCESSO_DIVERGENTE */
  revisar_motivos: string[];
  porte_anterior: Porte | null;
  mudou: boolean;
  diagnostico: Diagnostico;
}

export interface ResumoClassificacao {
  total: number;
  sujeitas: number;
  isentas: number;
  semDados: number;
  mudancas: number;
  projecoes: number;
  revisarJuridico: number;
}

export interface Classificacao {
  bdref: number | null;
  clientes: LinhaClassificacao[];
  resumo: ResumoClassificacao;
}

/**
 * Os dois avisos da competência, com públicos distintos: ENQUADRAMENTO vai
 * para o Fiscal (porte ME/EPP/Demais) e COTA, para o Departamento Pessoal.
 */
export type TipoAviso = 'ENQUADRAMENTO' | 'COTA';

export interface ResultadoEnvio {
  tipo: TipoAviso;
  enviado: boolean;
  motivo?: string;
  erro?: string;
  bdref: number | null;
  destinatarios: string[];
}

export interface StatusSincronizacao {
  rodando: boolean;
  processados: number;
  total: number;
  bdref: number | null;
  iniciadoEm: number | null;
  ultimoResumo: {
    bdref: number;
    ano: number;
    mes: number;
    total: number;
    processados: number;
    semCodigoSci: number;
    erros: number;
    mudancas: number;
    semDados: number;
    duracaoMs: number;
  } | null;
}

export interface HistoricoCliente {
  cliente: {
    id: string;
    razao_social: string;
    cnpj: string;
    codigo_sci: number | null;
    porte_declarado: string | null;
  };
  faturamento: Array<{
    ano: number;
    mes: number;
    bdref: number;
    faturamento: number;
    base_receita: string;
    consultado_em: string;
  }>;
  classificacoes: Array<{
    ano: number;
    mes: number;
    bdref: number;
    rbaa: number | null;
    rba: number | null;
    porte: Porte;
    porte_base: Porte;
    motivo: string;
    sujeita_cota: boolean | null;
    excede_teto_epp: boolean;
    excede_teto_me: boolean;
    data_efeito: string | null;
    meses_faltantes: number;
    dado_confiavel: boolean;
    porte_anterior: Porte | null;
    mudou: boolean;
    calculado_em: string;
  }>;
}

export const cotaAprendizagemService = {
  async classificacao(bdref?: number): Promise<Classificacao> {
    const qs = bdref ? `?bdref=${bdref}` : '';
    const r = await api.get(`/cota-aprendizagem/classificacao${qs}`);
    return r.data.data;
  },

  async status(): Promise<StatusSincronizacao> {
    const r = await api.get('/cota-aprendizagem/status');
    return r.data.data;
  },

  /** Responde 202 — a apuração roda em background; acompanhe por `status()`. */
  async sincronizar(opts?: {
    clienteIds?: string[];
    ano?: number;
    mes?: number;
    enviarEmail?: boolean;
  }) {
    const r = await api.post('/cota-aprendizagem/sincronizar', opts ?? {});
    return r.data;
  },

  /**
   * Reaplica as regras sobre o faturamento já coletado — não consulta o SCI.
   *
   * Síncrono: responde com o resultado pronto, porque sem o SCI a operação é
   * questão de segundos.
   */
  async reclassificar(opts?: { bdref?: number; clienteIds?: string[] }) {
    const r = await api.post('/cota-aprendizagem/reclassificar', opts ?? {});
    return r.data.data as {
      bdref: number;
      ano: number;
      mes: number;
      total: number;
      mudancas: number;
      semDados: number;
      duracaoMs: number;
    };
  },

  async historico(clienteId: string, ano?: number): Promise<HistoricoCliente> {
    const qs = ano ? `?ano=${ano}` : '';
    const r = await api.get(`/cota-aprendizagem/historico/${clienteId}${qs}`);
    return r.data.data;
  },

  /**
   * Dispara os avisos da competência.
   *
   * Sem `tipo`, manda os DOIS (enquadramento para o Fiscal, cota para o
   * Departamento Pessoal) — por isso a resposta é uma LISTA, com um resultado
   * por aviso.
   */
  async enviarAviso(opts?: {
    bdref?: number;
    destinatarios?: string[];
    forcar?: boolean;
    tipo?: TipoAviso;
  }) {
    const r = await api.post('/cota-aprendizagem/aviso', opts ?? {});
    return r.data.data as ResultadoEnvio[];
  },

  async exportarXlsx(bdref?: number): Promise<Blob> {
    const qs = bdref ? `?bdref=${bdref}` : '';
    const r = await api.get(`/cota-aprendizagem/exportar${qs}`, { responseType: 'blob' });
    return r.data as Blob;
  },
};

export default cotaAprendizagemService;
