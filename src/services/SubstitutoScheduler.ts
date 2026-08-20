/**
 * Job mensal do REOA (grupo SUBSTITUTO).
 *
 * O PROBLEMA QUE ELE RESOLVE. A janela da conferência são os 12 meses fechados
 * contados do relógio, mas os dados só entravam quando alguém abria um card.
 * As duas coisas andam em velocidades diferentes: a cada mês, um mês real sai
 * da janela e um vazio entra. Sem uma coleta que ande junto, a conferência
 * degrada sozinha — e antes do status tri-estado ela degradava para VERDE, o
 * que é o pior desfecho possível: quanto mais velho o dado, mais conforme o
 * relatório parecia.
 *
 * Roda no dia 5 por padrão, e não no dia 1º, pelo mesmo motivo do job da cota:
 * o faturamento do mês fechado só aparece no SCI depois que o fiscal termina os
 * lançamentos. Coletar cedo demais grava mês pela metade — e, aqui, mês pela
 * metade abaixo de R$ 300 mil vira alerta falso na caixa de entrada do Fiscal.
 *
 * DUAS ETAPAS, nesta ordem:
 *
 *   1. COLETA — puxa o SCI de todos os clientes do grupo, um a um (a SP_BI_FAT
 *      é serializada por `comLockSci`). É o que fecha o mês novo na janela.
 *   2. E-MAIL — avisa quem ficou abaixo do limite. Depois da coleta, nunca
 *      antes: avisar sobre a janela velha é avisar sobre o mês errado.
 *
 * Desligado por padrão — precisa de `REOA_SCHEDULER_ENABLED=true` no .env.
 */

import { executeQuery, mysqlPool } from '../config/mysql';
import { SubstitutoService, construirJanela } from './SubstitutoService';

const DIA_PADRAO = Number(process.env['REOA_SCHEDULER_DIA'] || 5);
/**
 * 2h, uma hora depois do job da cota.
 *
 * Os dois consultam o SCI e compartilham o mesmo lock, então rodar junto não
 * corromperia nada — apenas empilharia a fila e faria os dois demorarem o dobro.
 * Escalonar mantém cada janela de execução curta o bastante para caber na
 * madrugada.
 */
const HORA_PADRAO = Number(process.env['REOA_SCHEDULER_HORA'] || 2);
const HABILITADO = process.env['REOA_SCHEDULER_ENABLED'] === 'true';
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

let logTableReady = false;

/**
 * Registro de execução por competência. É a trava que impede rodar duas vezes
 * no mesmo mês — inclusive depois de um restart, que zeraria qualquer flag em
 * memória.
 */
async function ensureLogTable(): Promise<void> {
  if (logTableReady) return;
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS reoa_execucao_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      bdref INT NOT NULL,
      iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      concluido_em TIMESTAMP NULL DEFAULT NULL,
      total_clientes INT NOT NULL DEFAULT 0,
      coletados INT NOT NULL DEFAULT 0,
      erros INT NOT NULL DEFAULT 0,
      com_alerta INT NOT NULL DEFAULT 0,
      email_enviado TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uk_reoa_exec_bdref (bdref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  logTableReady = true;
}

export class SubstitutoScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rodandoAgora = false;
  private readonly service = new SubstitutoService();

  start(): void {
    if (!HABILITADO) {
      console.log(
        '[REOA Scheduler] Desabilitado. Para ligar, defina REOA_SCHEDULER_ENABLED=true no .env.'
      );
      return;
    }
    if (this.intervalId) return;

    console.log(
      `[REOA Scheduler] Ativo — coleta todo dia ${DIA_PADRAO} às ${String(HORA_PADRAO).padStart(2, '0')}:00.`
    );
    this.intervalId = setInterval(() => {
      void this.verificar();
    }, INTERVALO_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[REOA Scheduler] Parado.');
    }
  }

  /**
   * Dispara a coleta da competência, uma vez por mês.
   *
   * A janela é `dia >= DIA_PADRAO`, e não `dia === DIA_PADRAO`: com igualdade
   * exata, o servidor fora do ar naquela hora faria a competência inteira ser
   * PULADA até o mês seguinte — e mês pulado é buraco permanente na janela, que
   * é exatamente o que este job existe para evitar. Com `>=`, o dia 5 perdido
   * vira dia 6, 7, e assim por diante.
   *
   * A hora só é exigida na primeira oportunidade (dia exato), para a coleta
   * cair na madrugada quando tudo corre bem. Nos dias seguintes qualquer hora
   * serve: recuperar o mês vale mais do que respeitar o horário.
   */
  private async verificar(): Promise<void> {
    if (this.rodandoAgora || this.service.statusColeta.rodando) return;

    const agora = new Date();
    const dia = agora.getDate();
    if (dia < DIA_PADRAO) return;
    if (dia === DIA_PADRAO && agora.getHours() !== HORA_PADRAO) return;

    const janela = construirJanela(agora);
    const bdref = janela[janela.length - 1].bdref;

    try {
      await ensureLogTable();

      /*
       * A reserva vem ANTES da coleta, por INSERT IGNORE no UNIQUE(bdref).
       * Reservar depois deixaria uma janela em que um restart no meio da coleta
       * — que leva minutos — faria tudo recomeçar do zero na volta. Se a coleta
       * falhar, a linha fica com `concluido_em` nulo e o mês não é tentado de
       * novo automaticamente: é a execução manual que resolve, com alguém
       * olhando o motivo da falha.
       */
      const [res]: any = await mysqlPool.query(
        `INSERT IGNORE INTO reoa_execucao_log (bdref) VALUES (?)`,
        [bdref]
      );
      if (!res?.affectedRows) return; // competência já processada

      this.rodandoAgora = true;
      const atrasado = dia > DIA_PADRAO;
      console.log(
        `[REOA Scheduler] Iniciando coleta da competência ${bdref}` +
          (atrasado ? ` (recuperando — o dia ${DIA_PADRAO} foi perdido)` : '') +
          '...'
      );

      await this.executar(bdref);
    } catch (err: any) {
      console.error('[REOA Scheduler] Erro na coleta automática:', err?.message || err);
    } finally {
      this.rodandoAgora = false;
    }
  }

  /**
   * As duas etapas, com o resultado gravado no log.
   *
   * O e-mail sai por último e só quando há cliente ABAIXO — `enviarAviso` já
   * devolve `enviado: false` quando não há nada a avisar. Indeterminado não
   * entra: falta de coleta é pendência nossa, não do cliente, e mandá-la para o
   * Fiscal treinaria todo mundo a ignorar o aviso.
   */
  private async executar(bdref: number): Promise<void> {
    const coleta = await this.service.coletarTodos();

    let comAlerta = 0;
    let emailEnviado = false;
    try {
      const aviso: any = await this.service.enviarAviso();
      comAlerta = Number(aviso?.totalNaoOk ?? 0);
      emailEnviado = !!aviso?.enviado;
      console.log(
        `[REOA Scheduler] Aviso: ${emailEnviado ? 'enviado' : 'não enviado'} — ` +
          `${comAlerta} cliente(s) abaixo do limite.`
      );
    } catch (err: any) {
      // A coleta é o que não pode se perder; falha de e-mail fica registrada e
      // não desfaz o mês coletado.
      console.error('[REOA Scheduler] Falha ao enviar o aviso:', err?.message || err);
    }

    await mysqlPool.query(
      `UPDATE reoa_execucao_log
          SET concluido_em = CURRENT_TIMESTAMP, total_clientes = ?, coletados = ?,
              erros = ?, com_alerta = ?, email_enviado = ?
        WHERE bdref = ?`,
      [coleta.total, coleta.coletados, coleta.erros, comAlerta, emailEnviado ? 1 : 0, bdref]
    );
  }

  /**
   * Execução manual, ignorando dia, hora e a trava de competência.
   *
   * É o que resolve o estado de hoje — cliente do grupo que nunca foi coletado
   * — sem esperar o dia 5, e o que dá saída para um mês cuja coleta automática
   * falhou no meio.
   */
  async forcar(): Promise<{ bdref: number; total: number; coletados: number; erros: number }> {
    await ensureLogTable();
    const janela = construirJanela(new Date());
    const bdref = janela[janela.length - 1].bdref;
    await mysqlPool.query(`INSERT IGNORE INTO reoa_execucao_log (bdref) VALUES (?)`, [bdref]);
    const coleta = await this.service.coletarTodos();
    await mysqlPool.query(
      `UPDATE reoa_execucao_log
          SET concluido_em = CURRENT_TIMESTAMP, total_clientes = ?, coletados = ?, erros = ?
        WHERE bdref = ?`,
      [coleta.total, coleta.coletados, coleta.erros, bdref]
    );
    return { bdref, total: coleta.total, coletados: coleta.coletados, erros: coleta.erros };
  }
}

export const substitutoScheduler = new SubstitutoScheduler();
export default substitutoScheduler;
