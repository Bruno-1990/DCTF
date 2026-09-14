/**
 * Job diário dos Lançamentos (SCI): faz sozinho o que o botão "Atualizar" da
 * aba Clientes > Lançamentos faz — sincroniza a competência anterior do SCI
 * para host_dados.
 *
 * POR QUE DIÁRIO E NÃO MENSAL: os lançamentos do mês fechado continuam
 * entrando no SCI durante o mês seguinte inteiro, que é justamente quando a
 * DCTFWeb dele é conferida. Sincronizar uma vez só deixa a conferência olhando
 * para um mês pela metade.
 *
 * POR QUE 4H: longe do expediente (a rodada leva ~1 min de consultas pesadas
 * no Firebird) e fora das janelas da cota (1h) e do REOA (2h), que usam o
 * mesmo lock do SCI.
 *
 * TRAVA CONTRA RODAR DUAS VEZES: `host_dados_sync_log`, uma linha por dia,
 * reservada por INSERT IGNORE antes de rodar — sobrevive a restart. Se a
 * rodada falhar, o dia não é tentado de novo sozinho (mesma política do DET e
 * do REOA): quem resolve é o botão "Atualizar", e no dia seguinte o mês é
 * sincronizado inteiro de novo de qualquer forma.
 *
 * Desligado por padrão — precisa de `HOST_DADOS_SCHEDULER_ENABLED=true` no .env.
 */

import { executeQuery, mysqlPool } from '../config/mysql';
import { FirebirdSyncService, sincronizacaoEmAndamento } from './FirebirdSyncService';

const HORA_PADRAO = Number(process.env['HOST_DADOS_SCHEDULER_HORA'] || 4);
const HABILITADO = process.env['HOST_DADOS_SCHEDULER_ENABLED'] === 'true';
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

let logTableReady = false;

async function ensureLogTable(): Promise<void> {
  if (logTableReady) return;
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS host_dados_sync_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      dia DATE NOT NULL,
      competencia VARCHAR(20) NULL DEFAULT NULL,
      iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      concluido_em TIMESTAMP NULL DEFAULT NULL,
      linhas INT NOT NULL DEFAULT 0,
      erro TEXT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_host_dados_sync_dia (dia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  logTableReady = true;
}

export class HostDadosScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rodandoAgora = false;
  private readonly sync = new FirebirdSyncService();

  start(): void {
    if (!HABILITADO) {
      console.log(
        '[Lançamentos SCI Scheduler] Desabilitado. Para ligar, defina HOST_DADOS_SCHEDULER_ENABLED=true no .env.'
      );
      return;
    }
    if (this.intervalId) return;

    console.log(
      `[Lançamentos SCI Scheduler] Ativo — sincroniza a competência anterior todo dia às ${String(HORA_PADRAO).padStart(2, '0')}:00.`
    );
    this.intervalId = setInterval(() => {
      void this.verificar();
    }, INTERVALO_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Lançamentos SCI Scheduler] Parado.');
    }
  }

  /**
   * Janela `hora >= HORA_PADRAO`, e não igualdade: servidor desligado às 4h
   * roda assim que voltar, no mesmo dia. Uma sincronização manual em curso só
   * adia a checagem para o minuto seguinte — o dia não é reservado sem rodar.
   */
  private async verificar(): Promise<void> {
    if (this.rodandoAgora || sincronizacaoEmAndamento()) return;
    if (new Date().getHours() < HORA_PADRAO) return;

    try {
      await ensureLogTable();
      const [res]: any = await mysqlPool.query(`INSERT IGNORE INTO host_dados_sync_log (dia) VALUES (CURDATE())`);
      if (!res?.affectedRows) return; // hoje já rodou

      this.rodandoAgora = true;
      console.log('[Lançamentos SCI Scheduler] Iniciando sincronização da competência anterior...');
      const r = await this.sync.sincronizarAutomatico();

      await mysqlPool.query(
        `UPDATE host_dados_sync_log
            SET concluido_em = CURRENT_TIMESTAMP, competencia = ?, linhas = ?, erro = ?
          WHERE dia = CURDATE()`,
        [r.periodo, r.total ?? 0, r.success ? null : r.error || 'falha sem mensagem']
      );
      if (r.success) {
        console.log(`[Lançamentos SCI Scheduler] ${r.periodo}: ${r.total} linha(s) gravada(s).`);
      } else {
        console.error(`[Lançamentos SCI Scheduler] ${r.periodo} falhou: ${r.error}`);
      }
    } catch (err: any) {
      console.error('[Lançamentos SCI Scheduler] Erro na sincronização automática:', err?.message || err);
    } finally {
      this.rodandoAgora = false;
    }
  }
}

export const hostDadosScheduler = new HostDadosScheduler();
export default hostDadosScheduler;
