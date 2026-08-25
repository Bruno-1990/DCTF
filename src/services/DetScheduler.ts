/**
 * Job diário da caixa postal do DET — 06:00.
 *
 * POR QUE 6H: a varredura dos clientes com procuração leva mais de uma hora
 * (espaçamento de 15 a 28 segundos entre eles, para não parecer rajada num
 * sistema do governo). Começando às 6h, termina antes de o escritório abrir —
 * e o Departamento Pessoal encontra a tela já atualizada, em vez de assistir
 * ao contador subir durante o expediente.
 *
 * POR QUE NÃO node-cron: o projeto já resolve agendamento com um intervalo que
 * confere a hora (CotaAprendizagemScheduler, SubstitutoScheduler). Manter o
 * mesmo mecanismo evita somar uma dependência para fazer o que já é feito.
 *
 * A TRAVA CONTRA RODAR DUAS VEZES é a própria `det_coletas`: se já existe
 * execução `cron` hoje, não roda de novo. Fica no banco de propósito — flag em
 * memória evapora no restart, e um restart às 6h05 dispararia a segunda
 * varredura do dia.
 *
 * Desligado por padrão — precisa de `DET_SCHEDULER_ENABLED=true` no .env.
 */

import { executeQuery } from '../config/mysql';
import { DetColetorService, coletaEmAndamento } from './DetColetorService';

const HORA = Number(process.env['DET_SCHEDULER_HORA'] || 6);
const MINUTO = Number(process.env['DET_SCHEDULER_MINUTO'] || 0);
const HABILITADO = process.env['DET_SCHEDULER_ENABLED'] === 'true';
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

let timer: NodeJS.Timeout | null = null;

async function jaRodouHoje(): Promise<boolean> {
  const r = await executeQuery<any>(
    `SELECT COUNT(*) AS n FROM det_coletas
     WHERE origem = 'cron' AND DATE(iniciado_em) = CURDATE()`
  );
  return Number(r?.[0]?.n ?? 0) > 0;
}

async function verificar(): Promise<void> {
  try {
    const agora = new Date();
    if (agora.getHours() !== HORA || agora.getMinutes() !== MINUTO) return;
    if (coletaEmAndamento()) return;
    if (await jaRodouHoje()) return;

    console.log('[DET-Scheduler] iniciando coleta diária');
    const coletor = new DetColetorService((m) => console.log('[DET]', m));
    const res = await coletor.executar('cron');
    console.log(
      `[DET-Scheduler] concluída: ${res.coletados}/${res.total}, ${res.erros} erro(s), ` +
        `${res.mensagensNovas} nova(s), ${res.reautenticacoes} reautenticação(ões)`
    );
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
    console.log(
      `[DET-Scheduler] ligado — coleta diária às ${String(HORA).padStart(2, '0')}:${String(
        MINUTO
      ).padStart(2, '0')}`
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
