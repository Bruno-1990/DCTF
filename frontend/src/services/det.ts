import api from './api';

export interface DetResumo {
  total: number;
  deferidos: number;
  indeferidos: number;
  matrizes: number;
  filiais: number;
  mensagens: number;
  naoLidas: number;
  /** Só tipo='Notificação'. Aviso não entra: chega todo mês e não tem prazo. */
  notificacoesNovas: number;
  vigenciasVencendo: number;
  ultimaColeta: {
    iniciado_em: string;
    concluido_em: string | null;
    total_clientes: number;
    coletados: number;
    erros: number;
    mensagens_novas: number;
    notificacoes_novas: number;
    origem: 'cron' | 'manual';
    /** Linhas lidas na aba Recebidas do SPE. null = o SPE não foi lido nesta
     *  rodada — e aí a lista de quem foi varrido é a da vez anterior. */
    procuracoes_lidas: number | null;
    procuracoes_alteradas: number | null;
    procuracoes_ganharam: number | null;
    procuracoes_perderam: number | null;
    /** Preenchido = o SPE falhou e a coleta usou a lista antiga. */
    spe_erro: string | null;
  } | null;
}

export interface DetCliente {
  cnpj: string;
  razao_social: string;
  tipo: 'Matriz' | 'Filial';
  situacao: 'deferido' | 'indeferido';
  origem: 'spe' | 'manual' | 'proprio' | null;
  /** Difere de `cnpj` quando a cobertura vem da procuração da matriz. */
  outorgante_cnpj: string | null;
  vigencia_fim: string | null;
  observacao: string | null;
  verificado_em: string | null;
  mensagens: number;
  nao_lidas: number | string;
  notificacoes: number | string;
  ultima_coleta: string | null;
  /** ok = coletado com mensagens · vazia = coletado sem mensagens ·
   *  erro = tentou e falhou · null = nunca coletado. Distingue "sem mensagens"
   *  de "nunca", que antes eram o mesmo "nunca". */
  ultima_coleta_status?: 'ok' | 'vazia' | 'erro' | null;
  ultima_coleta_msgs?: number | null;
}

export interface DetNotificacao {
  id: number;
  tipo: string;
  remetente: string | null;
  data_texto: string | null;
  data_envio: string | null;
  assunto: string | null;
  nao_lida: number;
  primeira_coleta_em: string;
  ultima_coleta_em: string;
}

export const detService = {
  async resumo(): Promise<DetResumo> {
    const { data } = await api.get('/det/resumo');
    return data.data;
  },

  async clientes(): Promise<DetCliente[]> {
    const { data } = await api.get('/det/clientes');
    return data.data;
  },

  async notificacoes(cnpj: string): Promise<DetNotificacao[]> {
    const { data } = await api.get(`/det/clientes/${cnpj}/notificacoes`);
    return data.data;
  },

  /**
   * Varre o SPE e reconcilia quem tem procuração, sem varrer as caixas postais.
   * `dry` devolve o diff sem gravar — serve para conferir antes de aplicar.
   */
  async sincronizarProcuracoes(dry = false) {
    const { data } = await api.post(`/det/procuracoes/sincronizar${dry ? '?dry=1' : ''}`);
    return data;
  },

  async informarProcuracao(cnpj: string, temProcuracao: boolean, usuario?: string) {
    const { data } = await api.post(`/det/procuracoes/${cnpj}`, { temProcuracao, usuario });
    return data;
  },
};

export const formatCnpj = (cnpj: string): string => {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** "há 3 h", "há 2 dias" — o absoluto fica no title, para conferência. */
export const desde = (iso: string | null): string => {
  if (!iso) return 'nunca';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
};

/**
 * Rótulo da última coleta de UM cliente, distinguindo os três estados que antes
 * viravam todos "nunca":
 *   - coletado com mensagens → "há 3 h" (o tempo)
 *   - coletado sem mensagens → "sem mensagens" (conferido, nada a fazer)
 *   - falhou na última        → "falhou"
 *   - nunca coletado          → "nunca"
 */
export const rotuloColeta = (c: {
  ultima_coleta: string | null;
  ultima_coleta_status?: 'ok' | 'vazia' | 'erro' | null;
}): string => {
  if (!c.ultima_coleta) return 'nunca';
  if (c.ultima_coleta_status === 'vazia') return 'sem mensagens';
  if (c.ultima_coleta_status === 'erro') return 'falhou';
  return desde(c.ultima_coleta);
};

export const formatData = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
