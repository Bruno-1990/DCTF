/**
 * Config e decisão de disparo do scheduler do DET — SEM dependências pesadas
 * (nada de puppeteer/banco), para ser importável em teste sem carregar o
 * coletor inteiro. O DetScheduler consome daqui.
 */

// Coleta das CAIXAS postais. Roda de manhã cedo (padrão 06:00) para o
// Departamento Pessoal já encontrar a tela atualizada ao chegar.
export const HORA = Number(process.env['DET_SCHEDULER_HORA'] || 6);
export const MINUTO = Number(process.env['DET_SCHEDULER_MINUTO'] || 0);
export const HABILITADO = process.env['DET_SCHEDULER_ENABLED'] === 'true';

// Checagem das PROCURAÇÕES no SPE. Roda à NOITE (padrão 22:00), separada da
// coleta de caixas: assim são dois logins gov.br em horários distintos (cada um
// frio), e a coleta de caixas da manhã já parte da lista atualizada da véspera.
export const PROC_HORA = Number(process.env['DET_PROCURACOES_HORA'] || 22);
export const PROC_MINUTO = Number(process.env['DET_PROCURACOES_MINUTO'] || 0);

// Dias em que roda. getDay(): 0=dom, 1..5=seg..sex, 6=sáb. Padrão dias úteis.
export const DIAS_SEMANA = (process.env['DET_SCHEDULER_DIAS'] || '1,2,3,4,5')
  .split(',')
  .map((d) => Number(d.trim()))
  .filter((d) => !isNaN(d));

/**
 * `agora` está na janela de disparo? Dispara quando é um dos dias configurados
 * E bate hora:minuto exatos. Pura e determinística — a base do teste.
 */
export function janelaDeDisparo(
  agora: Date,
  hora = HORA,
  minuto = MINUTO,
  dias = DIAS_SEMANA
): boolean {
  if (!dias.includes(agora.getDay())) return false;
  if (agora.getHours() !== hora) return false;
  if (agora.getMinutes() !== minuto) return false;
  return true;
}

/** Nomes curtos dos dias para o log de start. */
export function nomesDias(dias = DIAS_SEMANA): string {
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias.map((d) => nomes[d] ?? String(d)).join(', ');
}

// ─── Trava contra rodar duas vezes no mesmo dia ─────────────────────────────

/** Linha de `det_coletas` do dia, no mínimo que a decisão precisa. */
export interface RodadaDoDia {
  total_clientes: number | null;
  procuracoes_lidas: number | null;
}

/** A coleta de CAIXAS já rodou hoje? A marca é ter varrido algum cliente. */
export function jaColetouCaixas(rodadas: RodadaDoDia[]): boolean {
  return rodadas.some((r) => Number(r.total_clientes ?? 0) > 0);
}

/**
 * A checagem de PROCURAÇÕES já rodou hoje? A marca é o SPE LIDO — não a mera
 * ausência de caixas varridas.
 *
 * Uma coleta de caixas que morre no login grava `total_clientes = 0` e, pela
 * regra antiga, se disfarçava de procuração feita: em 27/08/2026 a falha das
 * 6h teria calado a rodada das 22h do mesmo dia, sem erro nenhum à vista.
 */
export function jaChecouProcuracoes(rodadas: RodadaDoDia[]): boolean {
  return rodadas.some(
    (r) => Number(r.total_clientes ?? 0) === 0 && r.procuracoes_lidas != null
  );
}
