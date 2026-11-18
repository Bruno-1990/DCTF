import { api } from './api';

export type SituacaoParticipacao = 'sem_sitf' | 'desatualizada' | 'em_dia' | 'atualizar' | 'revisar';

export interface MudancaSocio {
  socioId: string;
  nome: string;
  casadoPor: 'cpf' | 'nome';
  cpf?: { de: string | null; para: string };
  percentual?: { de: number | null; para: number };
  /** Estava marcado fora do quadro e voltou na Situação Fiscal. */
  volta?: true;
}

export interface PlanoParticipacao {
  mudancas: MudancaSocio[];
  conflitos: Array<{ socioId: string; nome: string; cpfCadastro: string; cpfSitf: string }>;
  ambiguos: string[];
  soNaSitf: Array<{ nome: string; cpf: string | null; participacao_percentual: number | null }>;
  soNoCadastro: Array<{ socioId: string; nome: string }>;
  /** Sócios que serão criados (quadro da Situação Fiscal completo). */
  entradas: Array<{ nome: string; cpf: string; participacao_percentual: number | null; qual: string }>;
  /** Sócios que saíram do quadro: ficam marcados como fora do quadro (não são apagados). */
  saidas: Array<{ socioId: string; nome: string }>;
  somaSitf: number | null;
  alertas: string[];
}

export interface ItemPrevia {
  clienteId: string;
  razaoSocial: string;
  cnpj: string;
  situacao: SituacaoParticipacao;
  extraidoEm: string | null;
  /** Quando o relatório veio do SERPRO: só vale a do mês corrente. */
  consultadoEm: string | null;
  vigente: boolean;
  plano: PlanoParticipacao | null;
}

export interface ResultadoAplicar {
  aplicados: Array<{ clienteId: string; sociosAtualizados: number }>;
  ignorados: Array<{ clienteId: string; motivo: string }>;
}

export interface EventoLote {
  tipo: 'lote';
  progressId: string;
  status: string;
  total: number;
  processados: number;
  sucessos: number;
  erros: number;
  porcentagem: number;
  cnpjAtual: string | null;
}

export interface LoteInterrompido extends EventoLote {
  iniciadoEm: string | null;
  finalizadoEm: string | null;
}

export interface OuvintesParticipacao {
  onPronto?: (lote: EventoLote | null, interrompido: LoteInterrompido | null) => void;
  onLote?: (e: EventoLote) => void;
  onExtracao?: (e: { cnpj: string; sucesso: boolean }) => void;
  onAplicado?: (e: { clienteId: string; sociosAtualizados: number }) => void;
  onCliente?: (item: ItemPrevia) => void;
  onConexao?: (aoVivo: boolean) => void;
}

// EventSource precisa da URL absoluta do backend (o baseURL do axios não vale aqui).
const SSE_BASE: string =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  ((import.meta as any).env?.VITE_API_URL
    ? `${(import.meta as any).env.VITE_API_URL.replace(/\/$/, '')}/api`
    : 'http://localhost:38572/api');

/** Assina o SSE da participação. O EventSource reconecta sozinho se a conexão cair. */
export function ouvirParticipacao(ouvintes: OuvintesParticipacao): { fechar: () => void } {
  const es = new EventSource(`${SSE_BASE}/participacao-sitf/eventos`);
  const ler = <T,>(e: MessageEvent): T | null => {
    try {
      return JSON.parse(e.data) as T;
    } catch {
      return null;
    }
  };
  es.addEventListener('pronto', (e) => {
    ouvintes.onConexao?.(true);
    const d = ler<{ lote: EventoLote | null; interrompido?: LoteInterrompido | null }>(e as MessageEvent);
    ouvintes.onPronto?.(d?.lote ?? null, d?.interrompido ?? null);
  });
  es.addEventListener('lote', (e) => {
    const d = ler<EventoLote>(e as MessageEvent);
    if (d) ouvintes.onLote?.(d);
  });
  es.addEventListener('extracao', (e) => {
    const d = ler<{ cnpj: string; sucesso: boolean }>(e as MessageEvent);
    if (d) ouvintes.onExtracao?.(d);
  });
  es.addEventListener('aplicado', (e) => {
    const d = ler<{ clienteId: string; sociosAtualizados: number }>(e as MessageEvent);
    if (d) ouvintes.onAplicado?.(d);
  });
  es.addEventListener('cliente', (e) => {
    const d = ler<{ item: ItemPrevia }>(e as MessageEvent);
    if (d?.item) ouvintes.onCliente?.(d.item);
  });
  es.onerror = () => ouvintes.onConexao?.(false);
  return { fechar: () => es.close() };
}

export const participacaoSitfService = {
  async previa(clienteId?: string): Promise<{ resumo: Partial<Record<SituacaoParticipacao, number>>; itens: ItemPrevia[] }> {
    const r = await api.get('/participacao-sitf/previa', { params: clienteId ? { clienteId } : undefined });
    return r.data.data;
  },

  async aplicar(clienteIds: string[]): Promise<ResultadoAplicar> {
    const r = await api.post('/participacao-sitf/aplicar', { clienteIds });
    return r.data.data;
  },

  /**
   * Consulta obrigatória do mês: põe na fila quem não tem Situação Fiscal do mês corrente e
   * dispara o lote de pendentes (o progresso chega pelo SSE).
   */
  async consultarObrigatorias(): Promise<{
    enfileirados: number;
    emProcessamento: number;
    mesVigente: string;
    progressId?: string;
    total?: number;
  }> {
    const fila = (await api.post('/participacao-sitf/fila-consulta')).data.data;
    if (!fila.enfileirados) return fila;
    const lote = (await api.post('/situacao-fiscal/lote/iniciar-pendentes')).data;
    return { ...fila, progressId: lote?.progressId, total: lote?.total };
  },

  /**
   * Depois de uma consulta individual: a extração roda em segundo plano no servidor. Espera ela
   * gravar (extraidoEm depois do início da consulta, até ~20 s) e aplica no cadastro.
   * Se a extração não ficar mais nova (o SERPRO devolveu o relatório já pronto), aplica a última.
   */
  async aplicarDepoisDaConsulta(clienteId: string, inicioConsulta: Date): Promise<{ resultado: ResultadoAplicar; extracaoNova: boolean }> {
    let extracaoNova = false;
    for (let i = 0; i < 10; i++) {
      const { itens } = await this.previa(clienteId);
      const em = itens[0]?.extraidoEm ? new Date(itens[0].extraidoEm) : null;
      if (em && em.getTime() >= inicioConsulta.getTime() - 5000) {
        extracaoNova = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return { resultado: await this.aplicar([clienteId]), extracaoNova };
  },
};
