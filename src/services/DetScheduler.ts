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
import { janelaDeDisparo, nomesDias } from './DetSchedulerRegras';
import agendamentoConfigService from './agendamentos/AgendamentoConfigService';

/**
 * Os dois jobs do DET são itens separados no painel: têm horários diferentes e
 * podem ser ligados e desligados de forma independente (a checagem noturna do
 * SPE não precisa parar quando só a varredura da manhã incomoda).
 */
const ID_PROCURACOES = 'det-procuracoes';
const ID_CAIXAS = 'det-caixas';
const DIAS_FALLBACK = [1, 2, 3, 4, 5];

const INTERVALO_MS = 60 * 1000; // confere a cada minuto

let timer: NodeJS.Timeout | null = null;

/** Já rodou a coleta de CAIXAS hoje? (registro cron com clientes varridos) */
async function jaColetouCaixasHoje(): Promise<boolean> {
  const r = await executeQuery<any>(
    `SELECT COUNT(*) AS n FROM det_coletas
     WHERE origem = 'cron' AND total_clientes > 0 AND DATE(iniciado_em) = CURDATE()`
  );
  return Number(r?.[0]?.n ?? 0) > 0;
}

/** Já checou as PROCURAÇÕES hoje? (registro cron sem caixas: total_clientes = 0) */
async function jaChecouProcuracoesHoje(): Promise<boolean> {
  const r = await executeQuery<any>(
    `SELECT COUNT(*) AS n FROM det_coletas
     WHERE origem = 'cron' AND total_clientes = 0 AND DATE(iniciado_em) = CURDATE()`
  );
  return Number(r?.[0]?.n ?? 0) > 0;
}

async function verificar(): Promise<void> {
  try {
    if (coletaEmAndamento()) return; // nunca duas rodadas ao mesmo tempo
    const agora = new Date();

    const [proc, caixas] = await Promise.all([
      agendamentoConfigService.obter(ID_PROCURACOES),
      agendamentoConfigService.obter(ID_CAIXAS),
    ]);

    // ─── PROCURAÇÕES (noite) ───────────────────────────────────────────────
    if (
      proc.ativo &&
      janelaDeDisparo(agora, proc.hora ?? 22, proc.minuto ?? 0, proc.diasSemana ?? DIAS_FALLBACK)
    ) {
      if (await jaChecouProcuracoesHoje()) return;
      console.log('[DET-Scheduler] iniciando checagem de procurações (SPE)');
      const coletor = new DetColetorService((m) => console.log('[DET]', m));
      await coletor.executarProcuracoes('cron');
      console.log('[DET-Scheduler] procurações atualizadas');
      return;
    }

    // ─── CAIXAS (manhã) ────────────────────────────────────────────────────
    if (
      caixas.ativo &&
      janelaDeDisparo(agora, caixas.hora ?? 6, caixas.minuto ?? 0, caixas.diasSemana ?? DIAS_FALLBACK)
    ) {
      if (await jaColetouCaixasHoje()) return;
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
  /** O intervalo sobe sempre; horários, dias e liga/desliga vêm do painel (ver Cota). */
  start(): void {
    if (timer) return;
    timer = setInterval(verificar, INTERVALO_MS);
    console.log(
      `[DET-Scheduler] verificando a cada minuto (padrão ${nomesDias()}) — horários e liga/desliga vêm do painel de agendamentos`
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
