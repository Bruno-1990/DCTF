import api from './api';

/** As três listas fechadas dos selects — vêm do backend, que é quem valida. */
export interface OpcoesFicha {
  perfis: string[];
  volumesNf: string[];
  opcoesSped: string[];
  particularidadeMax: number;
}

export interface Colaborador {
  id: number;
  nome: string;
  ordem: number;
  total: number;
  preenchidas: number;
  inutilizadas: number;
}

export interface LinhaFicha {
  id: number;
  clienteId: string;
  cnpj: string | null;
  razaoSocial: string;
  codigoSci: string | null;
  regimeTributario: string | null;
  beneficiosFiscais: string | null;
  clienteAtivo: boolean;
  municipio: string | null;
  uf: string | null;
  perfil: string | null;
  volumeNf: string | null;
  enviaSped: string | null;
  particularidade: string | null;
  inutilizado: boolean;
  inutilizadoEm: string | null;
  inutilizadoMotivo: string | null;
  origem: string;
  atualizadoEm: string | null;
}

export interface ClienteDisponivel {
  id: string;
  cnpj: string | null;
  razaoSocial: string;
  codigoSci: string | null;
  regimeTributario: string | null;
  ativo: boolean;
  jaCom: string[];
}

/**
 * Lembra quem estava preenchendo — ninguém quer reescolher o nome a cada
 * visita. Fica aqui, e não numa página, porque a aba Fiscal e o questionário
 * compartilham a escolha: quem selecionou o nome numa tela não reescolhe na
 * outra.
 */
export const CHAVE_COLABORADOR = 'fiscal:colaboradorId';

// ─── Questionários ───
// Estes tipos são uma CÓPIA de src/services/FiscalQuestionarios.ts (backend).
// O front não importa do backend — são dois pacotes com tsconfig próprio — e
// duplicar a forma é mais barato que montar um pacote compartilhado só para
// isto. A fonte da verdade continua sendo o backend: ele valida a resposta.

export interface LinhaCaso {
  rotulo: string;
  texto: string;
}

export interface OpcaoPergunta {
  valor: string;
  texto: string;
}

export type TipoPergunta = 'unica' | 'multipla' | 'texto';

export interface PerguntaDefinicao {
  id: string;
  numero: number;
  enunciado: string;
  caso?: LinhaCaso[];
  tipo: TipoPergunta;
  opcoes?: OpcaoPergunta[];
  defineNoMotor?: string;
  placeholderObs?: string;
}

export interface SecaoDefinicao {
  codigo: string;
  titulo: string;
  intro?: string;
  perguntas: PerguntaDefinicao[];
  observacoesGerais?: { placeholder: string };
}

export interface QuestionarioDefinicao {
  slug: string;
  chapeu?: string;
  titulo: string;
  lead: string;
  comoResponder: string[];
  versao: number;
  secoes: SecaoDefinicao[];
}

export interface QuestionarioResumo {
  slug: string;
  titulo: string;
  versao: number;
  totalPerguntas: number;
}

/** String em pergunta de opção única/texto; array em múltipla escolha. */
export type ValorResposta = string | string[];

/** Mapa `id da pergunta` (ou `obs:<id>`) → valor. */
export type MapaRespostas = Record<string, ValorResposta>;

export interface RespostaQuestionario {
  id: number;
  questionarioSlug: string;
  questionarioVersao: number;
  colaboradorId: number;
  colaboradorNome: string;
  respostas: MapaRespostas;
  observacoes: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

/** Prefixo das chaves de observação por pergunta — igual ao do backend. */
export const PREFIXO_OBSERVACAO = 'obs:';

/** Campos editáveis. Ausente = não mexe; `null` = limpa. */
export interface EdicaoFicha {
  perfil?: string | null;
  volumeNf?: string | null;
  enviaSped?: string | null;
  particularidade?: string | null;
}

/**
 * Extrai a mensagem que o backend mandou, sem cair no "Request failed with
 * status code 400" do axios — que não diz nada a quem está preenchendo.
 */
function mensagemErro(err: any, padrao: string): string {
  return err?.response?.data?.error || err?.message || padrao;
}

export const fiscalService = {
  async opcoes(): Promise<OpcoesFicha> {
    const { data } = await api.get('/fiscal/opcoes');
    return data.data;
  },

  async colaboradores(): Promise<Colaborador[]> {
    const { data } = await api.get('/fiscal/colaboradores');
    return data.data;
  },

  async ficha(colaboradorId: number): Promise<LinhaFicha[]> {
    const { data } = await api.get('/fiscal/ficha', { params: { colaboradorId } });
    return data.data;
  },

  async salvar(fichaId: number, edicao: EdicaoFicha): Promise<LinhaFicha> {
    try {
      const { data } = await api.patch(`/fiscal/ficha/${fichaId}`, edicao);
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível salvar.'));
    }
  },

  async adicionar(
    colaboradorId: number,
    clienteId: string
  ): Promise<{ linha: LinhaFicha; aviso: string | null }> {
    try {
      const { data } = await api.post('/fiscal/ficha', { colaboradorId, clienteId });
      return { linha: data.data, aviso: data.aviso ?? null };
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível adicionar a empresa.'));
    }
  },

  async inutilizar(fichaId: number, motivo: string | null): Promise<LinhaFicha> {
    try {
      const { data } = await api.post(`/fiscal/ficha/${fichaId}/inutilizar`, { motivo });
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível marcar a empresa.'));
    }
  },

  async reativar(fichaId: number): Promise<LinhaFicha> {
    try {
      const { data } = await api.post(`/fiscal/ficha/${fichaId}/reativar`);
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível desfazer.'));
    }
  },

  async clientesDisponiveis(colaboradorId: number, q: string): Promise<ClienteDisponivel[]> {
    const { data } = await api.get('/fiscal/clientes-disponiveis', {
      params: { colaboradorId, q },
    });
    return data.data;
  },

  // ─── Questionários ───

  async questionarios(): Promise<QuestionarioResumo[]> {
    const { data } = await api.get('/fiscal/questionarios');
    return data.data;
  },

  async questionario(slug: string): Promise<QuestionarioDefinicao> {
    try {
      const { data } = await api.get(`/fiscal/questionarios/${slug}`);
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível carregar o questionário.'));
    }
  },

  /** Todas as respostas — é o que a visão consolidada consome. */
  async questionarioRespostas(slug: string): Promise<RespostaQuestionario[]> {
    try {
      const { data } = await api.get(`/fiscal/questionarios/${slug}/respostas`);
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível carregar as respostas.'));
    }
  },

  /** `null` quando o colaborador ainda não respondeu — não é erro. */
  async questionarioResposta(
    slug: string,
    colaboradorId: number
  ): Promise<RespostaQuestionario | null> {
    try {
      const { data } = await api.get(`/fiscal/questionarios/${slug}/respostas/${colaboradorId}`);
      return data.data ?? null;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível carregar suas respostas.'));
    }
  },

  async salvarQuestionario(
    slug: string,
    colaboradorId: number,
    respostas: MapaRespostas,
    observacoes: string | null
  ): Promise<RespostaQuestionario> {
    try {
      const { data } = await api.put(`/fiscal/questionarios/${slug}/respostas/${colaboradorId}`, {
        respostas,
        observacoes,
      });
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível salvar.'));
    }
  },
};

export default fiscalService;
