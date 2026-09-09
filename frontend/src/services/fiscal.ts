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
};

export default fiscalService;
