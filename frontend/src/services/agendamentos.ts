import { api } from './api';

export type TipoJanela = 'mensal' | 'diario' | 'semanal' | 'sob-demanda' | 'externo';

export interface AgendamentoConfig {
  id: string;
  ativo: boolean;
  dia: number | null;
  hora: number | null;
  minuto: number | null;
  diasSemana: number[] | null;
  atualizadoEm?: string | null;
  atualizadoPor?: string | null;
}

export interface ListaEmail {
  chave: string;
  rotulo: string;
  quando: string;
  enderecos: string[];
}

export interface UltimaExecucao {
  inicio: string;
  fim: string | null;
  situacao: 'concluida' | 'em-andamento' | 'erro';
  erro?: string | null;
}

export interface Agendamento {
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoJanela;
  editavel: boolean;
  alerta?: string | null;
  config: AgendamentoConfig;
  janela: string;
  proximaExecucao: string | null;
  ultimaExecucao: UltimaExecucao | null;
  podeExecutarAgora: boolean;
  emails: ListaEmail[];
}

export interface AlteracaoAgendamento {
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  alterado_por: string | null;
  alterado_em: string;
}

const mensagemErro = (err: any, padrao: string): string =>
  err?.response?.data?.error || err?.message || padrao;

export const agendamentosService = {
  async listar(): Promise<Agendamento[]> {
    try {
      const { data } = await api.get('/agendamentos');
      return data.data as Agendamento[];
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível carregar os agendamentos.'));
    }
  },

  async salvar(
    id: string,
    patch: Partial<Pick<AgendamentoConfig, 'ativo' | 'dia' | 'hora' | 'minuto' | 'diasSemana'>>
  ): Promise<{ config: AgendamentoConfig; janela: string; proximaExecucao: string | null }> {
    try {
      const { data } = await api.patch(`/agendamentos/${id}`, patch);
      return data.data;
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível salvar o agendamento.'));
    }
  },

  async adicionarEmail(id: string, lista: string, email: string): Promise<string[]> {
    try {
      const { data } = await api.post(`/agendamentos/${id}/emails`, { lista, email });
      return data.data.enderecos as string[];
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível adicionar o e-mail.'));
    }
  },

  async removerEmail(id: string, lista: string, email: string): Promise<string[]> {
    try {
      const { data } = await api.delete(`/agendamentos/${id}/emails`, { params: { lista, email } });
      return data.data.enderecos as string[];
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível remover o e-mail.'));
    }
  },

  async executarAgora(id: string): Promise<void> {
    try {
      await api.post(`/agendamentos/${id}/executar`);
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível iniciar a execução.'));
    }
  },

  async historico(id: string): Promise<AlteracaoAgendamento[]> {
    try {
      const { data } = await api.get(`/agendamentos/${id}/historico`);
      return data.data as AlteracaoAgendamento[];
    } catch (err: any) {
      throw new Error(mensagemErro(err, 'Não foi possível carregar o histórico.'));
    }
  },
};

export default agendamentosService;
