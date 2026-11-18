/**
 * Barramento em memória dos eventos da participação dos sócios, lido pelo SSE
 * GET /api/participacao-sitf/eventos.
 *
 * Quem emite:
 * - o lote de Situação Fiscal, a cada passo salvo (tipo 'lote');
 * - a extração do PDF, ao terminar (tipo 'extracao');
 * - a gravação da participação (tipo 'aplicado').
 * O replanejamento transforma 'extracao' e 'aplicado' na linha da prévia refeita (tipo 'cliente'),
 * calculada uma vez no servidor, não uma vez por aba aberta.
 *
 * Este módulo não importa banco nem serviço em tempo de execução: quem emite (orquestrador do SITF,
 * rota do lote) pode importá-lo sem custo e sem dependência circular.
 */
import { EventEmitter } from 'events';
import type { ItemPrevia } from './ParticipacaoSitfService';

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

export type EventoParticipacao =
  | EventoLote
  | { tipo: 'extracao'; cnpj: string; sucesso: boolean }
  | { tipo: 'aplicado'; clienteId: string; sociosAtualizados: number }
  | { tipo: 'cliente'; item: ItemPrevia };

export function criarBarramento(): EventEmitter {
  const bus = new EventEmitter();
  bus.setMaxListeners(100); // uma escuta por aba aberta
  return bus;
}

export const barramentoParticipacao = criarBarramento();

/** Nunca deixa um problema no aviso atrapalhar quem emitiu (lote, extração, gravação). */
export function emitirParticipacao(evento: EventoParticipacao): void {
  try {
    barramentoParticipacao.emit('evento', evento);
  } catch (e: any) {
    console.error('[Participação SITF] Erro ao avisar a tela:', e?.message);
  }
}

export function resumirLote(progressId: string, p: any): EventoLote {
  return {
    tipo: 'lote',
    progressId,
    status: String(p?.status ?? ''),
    total: Number(p?.total ?? 0),
    processados: Number(p?.processados ?? 0),
    sucessos: Number(p?.sucessos ?? 0),
    erros: Number(p?.erros ?? 0),
    porcentagem: Number(p?.porcentagem ?? 0),
    cnpjAtual: p?.cnpjAtual ?? null,
  };
}

interface Replanejador {
  previaDoCnpj(cnpj: string): Promise<ItemPrevia[]>;
  previaDoCliente(clienteId: string): Promise<ItemPrevia[]>;
}

export function ligarReplanejamento(bus: EventEmitter, service: Replanejador): void {
  const reemitir = (itens: ItemPrevia[]) => {
    for (const item of itens) bus.emit('evento', { tipo: 'cliente', item } satisfies EventoParticipacao);
  };
  bus.on('evento', (e: EventoParticipacao) => {
    let pendente: Promise<ItemPrevia[]> | null = null;
    if (e.tipo === 'extracao' && e.sucesso) pendente = service.previaDoCnpj(String(e.cnpj).replace(/\D/g, ''));
    if (e.tipo === 'aplicado') pendente = service.previaDoCliente(e.clienteId);
    pendente?.then(reemitir).catch((err: any) => console.error('[Participação SITF] Erro ao refazer a prévia:', err?.message));
  });
}
