/**
 * Job mensal do lote de DARF para a Acessórias — agendador INTERNO.
 *
 * DESLIGADO NESTA INSTALAÇÃO: o agendamento mora no Server Manager (:9000),
 * como tarefa que chama `npm run darf:lote`. Este módulo continua aqui porque
 * é a alternativa para uma instalação sem Server Manager, e porque ligá-lo é
 * uma variável de ambiente. NÃO LIGUE OS DOIS AO MESMO TEMPO — não chega a
 * emitir guia duplicada (a segunda rodada reaproveita a primeira), mas produz
 * duas execuções e dois e-mails para o DP no mesmo dia.
 *
 * QUAL COMPETÊNCIA ELE EMITE: decidido por `DARF_LOTE_COMPETENCIA`, em
 * `DarfLoteService` — 'vigente' (o próprio mês) ou 'anterior' (o mês fechado).
 *
 * A JANELA É `dia >= DIA`, E NÃO `dia === DIA`: com igualdade exata, um
 * servidor fora do ar naquela hora faria a competência inteira ser pulada — e
 * ninguém descobriria antes do cliente reclamar da guia que não chegou. Com
 * `>=`, o dia perdido vira o dia seguinte. O que impede rodar de novo todo dia
 * é a consulta ao banco: competência já executada com sucesso encerra a
 * verificação. Essa consulta também é o que sobrevive a um restart do
 * processo, coisa que um flag em memória não faz.
 *
 * Desligado por padrão — precisa de `DARF_LOTE_ENABLED=true` no .env.
 */

import { executeQuery } from '../config/mysql';
import darfLoteService, { competenciaAlvo, modoCompetencia } from './DarfLoteService';

const HABILITADO = process.env['DARF_LOTE_ENABLED'] === 'true';
const DIA_PADRAO = Number(process.env['DARF_LOTE_DIA'] || 25);
const HORA_PADRAO = Number(process.env['DARF_LOTE_HORA'] || 6);
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

export { competenciaAlvo };

export class DarfLoteScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rodandoAgora = false;

  start(): void {
    if (!HABILITADO) {
      console.log(
        '[DarfLote Scheduler] Desabilitado. Para ligar, defina DARF_LOTE_ENABLED=true no .env.'
      );
      return;
    }
    if (this.intervalId) return;

    console.log(
      `[DarfLote Scheduler] Ativo — todo dia ${DIA_PADRAO} às ` +
        `${String(HORA_PADRAO).padStart(2, '0')}:00, competência ${modoCompetencia()}.`
    );
    this.intervalId = setInterval(() => {
      void this.verificar();
    }, INTERVALO_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[DarfLote Scheduler] Parado.');
    }
  }

  private async verificar(): Promise<void> {
    if (this.rodandoAgora) return;

    const agora = new Date();
    const dia = agora.getDate();
    if (dia < DIA_PADRAO) return;
    // A hora só é exigida na primeira oportunidade, para a rodada cair de
    // madrugada quando tudo corre bem. Recuperando um dia perdido, qualquer
    // hora serve — entregar a guia vale mais que respeitar o horário.
    if (dia === DIA_PADRAO && agora.getHours() !== HORA_PADRAO) return;

    const { anoPA, mesPA } = competenciaAlvo(agora);

    try {
      // Só execução que entregou alguma guia conta como feita. Uma rodada que
      // abortou porque a pasta estava fora do ar não pode bloquear a próxima
      // tentativa — seria transformar uma falha de rede em competência perdida.
      const feito = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) AS total
           FROM darf_lote_execucoes
          WHERE ano_pa = ? AND mes_pa = ?
            AND (emitidos + reaproveitados) > 0`,
        [anoPA, mesPA]
      );
      if (Number(feito[0]?.total ?? 0) > 0) return;

      this.rodandoAgora = true;
      const atrasado = dia > DIA_PADRAO;
      console.log(
        `[DarfLote Scheduler] Iniciando lote da competência ${mesPA}/${anoPA}` +
          (atrasado ? ` (recuperando — o dia ${DIA_PADRAO} foi perdido)` : '') +
          '...'
      );

      const r = await darfLoteService.executar({ anoPA, mesPA, disparadoPor: 'agendador' });
      console.log(
        `[DarfLote Scheduler] Concluído: ${r.emitidos} emitida(s), ` +
          `${r.reaproveitados} reaproveitada(s), ${r.falhas} falha(s). ` +
          `Relatório ${r.emailEnviado ? 'enviado' : 'NÃO enviado'}.`
      );
    } catch (err: any) {
      console.error('[DarfLote Scheduler] Erro na rodada automática:', err?.message || err);
    } finally {
      this.rodandoAgora = false;
    }
  }
}

export const darfLoteScheduler = new DarfLoteScheduler();
export default darfLoteScheduler;
