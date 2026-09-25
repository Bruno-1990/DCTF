/**
 * Job mensal do lote de DARF para a Acessórias — agendador INTERNO.
 *
 * Dia, hora e liga/desliga vêm do painel de agendamentos (tabela
 * `agendamentos`, id 'darf-lote'), lidos a cada verificação. Desde 16/09/2026 é
 * ESTE o agendador em uso; a tarefa `darf-lote-acessorias` do Server Manager
 * está desabilitada. NÃO LIGUE OS DOIS AO MESMO TEMPO — não chega a emitir guia
 * duplicada (a segunda rodada reaproveita a primeira), mas produz duas
 * execuções e dois e-mails para o DP no mesmo dia.
 *
 * QUAL COMPETÊNCIA ELE EMITE: decidido por `DARF_LOTE_COMPETENCIA`, em
 * `DarfLoteService` — 'vigente' (o próprio mês) ou 'anterior' (o mês fechado).
 *
 * A JANELA É `dia >= DIA`, E NÃO `dia === DIA`: com igualdade exata, um
 * servidor fora do ar naquela hora faria a competência inteira ser pulada — e
 * ninguém descobriria antes do cliente reclamar da guia que não chegou. Com
 * `>=`, o dia perdido vira o dia seguinte. O que impede rodar de novo todo dia
 * é a consulta ao banco: uma rodada DO AGENDADOR iniciada a partir do dia
 * agendado encerra a verificação — rodadas manuais/de teste anteriores não. Essa consulta também é o que sobrevive a um restart do
 * processo, coisa que um flag em memória não faz.
 */

import { executeQuery } from '../config/mysql';
import darfLoteService, { competenciaAlvo, modoCompetencia } from './DarfLoteService';
import agendamentoConfigService from './agendamentos/AgendamentoConfigService';

const ID_AGENDAMENTO = 'darf-lote';
const DIA_FALLBACK = 25;
const HORA_FALLBACK = 6;
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

export { competenciaAlvo };

/** 'YYYY-MM-DD' do dia agendado no mês de `agora` — início da janela da rodada. */
export function inicioDaJanela(agora: Date, dia: number): string {
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${agora.getFullYear()}-${mm}-${dd}`;
}

export class DarfLoteScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rodandoAgora = false;

  start(): void {
    if (this.intervalId) return;

    console.log(
      `[DarfLote Scheduler] Verificando a cada minuto — liga/desliga vem do painel de agendamentos, competência ${modoCompetencia()}.`
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

    let cfg;
    try {
      cfg = await agendamentoConfigService.obter(ID_AGENDAMENTO);
    } catch (err: any) {
      console.error('[DarfLote Scheduler] Não consegui ler a configuração:', err?.message || err);
      return;
    }
    if (!cfg.ativo) return;

    const DIA_PADRAO = cfg.dia ?? DIA_FALLBACK;
    const HORA_PADRAO = cfg.hora ?? HORA_FALLBACK;

    const agora = new Date();
    const dia = agora.getDate();
    if (dia < DIA_PADRAO) return;
    // A hora só é exigida na primeira oportunidade, para a rodada cair de
    // madrugada quando tudo corre bem. Recuperando um dia perdido, qualquer
    // hora serve — entregar a guia vale mais que respeitar o horário.
    if (dia === DIA_PADRAO && agora.getHours() !== HORA_PADRAO) return;

    const { anoPA, mesPA } = competenciaAlvo(agora);

    try {
      // O que conta como "este mês já rodou" é SÓ a rodada do próprio
      // agendador, iniciada a partir do dia agendado. Rodada manual, de teste
      // ou do Server Manager — mesmo da mesma competência e com guia emitida —
      // não substitui a agendada: em 25/09/2026 um teste de 04/09 (1 guia, 16
      // "Não foi encontrada Declaração") fez o mês ser dado como feito e o lote
      // não rodou. As guias vivas dessas rodadas continuam sendo reaproveitadas
      // pelo serviço, então rodar de novo não gasta cota com elas.
      //
      // Rodada que abortou antes de processar alguém (pasta fora do ar, carteira
      // vazia) não conta: transformaria falha de rede em competência perdida.
      const feito = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) AS total
           FROM darf_lote_execucoes
          WHERE ano_pa = ? AND mes_pa = ?
            AND disparado_por = 'agendador'
            AND iniciado_em >= ?
            AND (emitidos + reaproveitados + falhas) > 0`,
        [anoPA, mesPA, inicioDaJanela(agora, DIA_PADRAO)]
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
