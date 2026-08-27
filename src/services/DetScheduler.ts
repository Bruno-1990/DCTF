/**
 * Dois jobs do DET, em horários diferentes de propósito — seg a sex:
 *
 *   PROCURAÇÕES (padrão 22:00): login DET + leitura do SPE, atualiza quem tem
 *     procuração. Não varre caixas.
 *   CAIXAS (padrão 06:00): varre as caixas postais usando a lista de procuração
 *     já atualizada na véspera. Não refaz o SPE.
 *
 * POR QUE SEPARADOS: o SPE (spe.sistema.gov.br) e o DET fazem logins gov.br
 * distintos. Rodando os dois juntos, o segundo login em minutos disparava o
 * antiabuse (captcha). Em horários afastados, cada rodada é UM login, frio, e
 * uma nunca atrasa nem contamina a outra. A de caixas às 6h já parte da lista
 * atualizada às 22h da véspera. (Solução do operador em 26/08/2026.)
 *
 * POR QUE 6H PARA AS CAIXAS: a varredura dos ~132 clientes passa de uma hora
 * (espaçamento de 15 a 28s entre eles). Às 6h termina antes do expediente — o
 * Departamento Pessoal encontra a tela pronta.
 *
 * POR QUE NÃO node-cron: o projeto já agenda com um intervalo que confere a hora
 * (CotaAprendizagem, Substituto). Manter o mecanismo evita uma dependência.
 *
 * TRAVA CONTRA RODAR DUAS VEZES: a própria `det_coletas`. Cada tipo tem sua
 * marca (caixas = total_clientes > 0; procurações = total_clientes = 0 com
 * procuracoes_lidas), então uma não bloqueia a outra e um restart no minuto
 * seguinte não dispara a segunda rodada do mesmo tipo.
 *
 * Desligado por padrão — precisa de `DET_SCHEDULER_ENABLED=true` no .env.
 */

import { executeQuery } from '../config/mysql';
import { DetColetorService, coletaEmAndamento } from './DetColetorService';
import {
  HORA,
  MINUTO,
  PROC_HORA,
  PROC_MINUTO,
  HABILITADO,
  janelaDeDisparo,
  jaChecouProcuracoes,
  jaColetouCaixas,
  nomesDias,
} from './DetSchedulerRegras';
import type { RodadaDoDia } from './DetSchedulerRegras';

const INTERVALO_MS = 60 * 1000; // confere a cada minuto

let timer: NodeJS.Timeout | null = null;

/**
 * Rodadas do cron de hoje — UMA consulta que alimenta as duas travas. Quem
 * decide o que cada registro significa é `DetSchedulerRegras`, onde a regra é
 * pura e coberta por teste (contar linhas em SQL escondia a distinção entre
 * "procuração feita" e "coleta que morreu no login").
 */
async function rodadasCronDeHoje(): Promise<RodadaDoDia[]> {
  const r = await executeQuery<any>(
    `SELECT total_clientes, procuracoes_lidas FROM det_coletas
     WHERE origem = 'cron' AND DATE(iniciado_em) = CURDATE()`
  );
  return Array.isArray(r) ? (r as RodadaDoDia[]) : [];
}

async function verificar(): Promise<void> {
  try {
    if (coletaEmAndamento()) return; // nunca duas rodadas ao mesmo tempo
    const agora = new Date();

    // ─── PROCURAÇÕES (noite) ───────────────────────────────────────────────
    if (janelaDeDisparo(agora, PROC_HORA, PROC_MINUTO)) {
      if (jaChecouProcuracoes(await rodadasCronDeHoje())) return;
      console.log('[DET-Scheduler] iniciando checagem de procurações (SPE)');
      const coletor = new DetColetorService((m) => console.log('[DET]', m));
      await coletor.executarProcuracoes('cron');
      console.log('[DET-Scheduler] procurações atualizadas');
      return;
    }

    // ─── CAIXAS (manhã) ────────────────────────────────────────────────────
    if (janelaDeDisparo(agora, HORA, MINUTO)) {
      if (jaColetouCaixas(await rodadasCronDeHoje())) return;
      console.log('[DET-Scheduler] iniciando coleta das caixas (sem refazer SPE)');
      const coletor = new DetColetorService((m) => console.log('[DET]', m));
      const res = await coletor.executar('cron', undefined, { pularSpe: true });
      console.log(
        `[DET-Scheduler] caixas: ${res.coletados}/${res.total}, ${res.erros} erro(s), ` +
          `${res.mensagensNovas} nova(s), ${res.reautenticacoes} reautenticação(ões)`
      );
      return;
    }
  } catch (e: any) {
    // Não retenta sozinho: se o portal derrubou a rodada, repetir no minuto
    // seguinte só repete a queda. A saída é a execução manual, com alguém
    // olhando o motivo.
    console.error('[DET-Scheduler] falhou:', e?.message ?? e);
  }
}

export const detScheduler = {
  start(): void {
    if (!HABILITADO) {
      console.log('[DET-Scheduler] desligado (DET_SCHEDULER_ENABLED != true)');
      return;
    }
    if (timer) return;
    timer = setInterval(verificar, INTERVALO_MS);
    const hhmm = (h: number, m: number) =>
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    console.log(
      `[DET-Scheduler] ligado (${nomesDias()}) — procurações ${hhmm(
        PROC_HORA,
        PROC_MINUTO
      )}, caixas ${hhmm(HORA, MINUTO)}`
    );
  },
  stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
};

export default detScheduler;
