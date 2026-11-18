/**
 * Lote de Situação Fiscal órfão.
 *
 * O lote roda DENTRO do processo da API (um laço em memória, global.sitfLoteProgress) e só
 * espelha o progresso em sitf_lote_progress. Se o processo reinicia no meio (deploy, queda, ou o
 * nodemon recarregando em desenvolvimento), o laço morre e a linha fica 'em_andamento' para sempre:
 * o /lote/em-andamento passava a recusar novos lotes ("já há um lote rodando") sem nada rodando,
 * e a tela não mostrava lote nenhum (o SSE olha a memória).
 *
 * Regra: 'em_andamento' no banco que este processo não tem em memória é órfão. Vira 'interrompida',
 * e os CNPJs da fila de pendentes presos em 'processando' por ele voltam a 'pendente'.
 */
import { executeQuery } from '../../config/mysql';
import { emitirParticipacao, resumirLote, type EventoLote } from './eventos';

export interface LoteInterrompido extends EventoLote {
  iniciadoEm: string | null;
  finalizadoEm: string | null;
}

const marcas = (n: number) => Array(n).fill('?').join(',');
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const emMemoria = (): Record<string, any> => ((global as any).sitfLoteProgress || {}) as Record<string, any>;

export async function fecharLotesOrfaos(): Promise<string[]> {
  const abertos = await executeQuery<any>(
    `SELECT progress_id, total, processados, sucessos, erros, porcentagem, cnpj_atual
       FROM sitf_lote_progress WHERE status = 'em_andamento'`,
  );
  const vivos = emMemoria();
  const orfaos = abertos.filter((l) => vivos[l.progress_id]?.status !== 'em_andamento');
  if (orfaos.length === 0) return [];

  const ids = orfaos.map((l) => l.progress_id as string);
  await executeQuery(
    `UPDATE sitf_lote_progress SET status = 'interrompida', finalizado_em = NOW()
      WHERE status = 'em_andamento' AND progress_id IN (${marcas(ids.length)})`,
    ids,
  );
  await executeQuery(
    `UPDATE sitf_lote_cnpjs_pendentes SET status = 'pendente', progress_id = NULL
      WHERE status = 'processando' AND progress_id IN (${marcas(ids.length)})`,
    ids,
  );
  for (const l of orfaos) {
    console.warn(`[SITF Lote] ${l.progress_id} estava "em andamento" sem rodar (processo reiniciado): marcado como interrompido em ${l.processados}/${l.total}`);
    emitirParticipacao(resumirLote(l.progress_id, { ...l, cnpjAtual: l.cnpj_atual, status: 'interrompida' }));
  }
  return ids;
}

/** O lote mais recente, se ele terminou interrompido (um lote mais novo, de qualquer status, esconde o aviso). */
export async function ultimoLoteInterrompido(): Promise<LoteInterrompido | null> {
  const [l] = await executeQuery<any>(
    `SELECT progress_id, status, total, processados, sucessos, erros, porcentagem, cnpj_atual, iniciado_em, finalizado_em
       FROM sitf_lote_progress ORDER BY iniciado_em DESC LIMIT 1`,
  );
  if (!l || l.status !== 'interrompida') return null;
  return {
    ...resumirLote(l.progress_id, { ...l, cnpjAtual: l.cnpj_atual }),
    iniciadoEm: iso(l.iniciado_em),
    finalizadoEm: iso(l.finalizado_em),
  };
}
