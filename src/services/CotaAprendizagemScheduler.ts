/**
 * Job mensal da cota de aprendizagem.
 *
 * Roda no dia 5 por padrão, e não no dia 1º: o faturamento do mês fechado só
 * aparece no SCI depois que o fiscal/contábil termina os lançamentos. Ler cedo
 * demais significa classificar com o mês pela metade e disparar alerta falso
 * de mudança de porte.
 *
 * SÃO TRÊS ETAPAS, NESTA ORDEM, e a ordem é o ponto:
 *
 *   1. CADASTRO — varredura pela ReceitaWS (~1h15 no ritmo do plano gratuito).
 *      A classificação lê abertura, tipo de estabelecimento, situação e sócios
 *      do cadastro; atualizar depois de classificar não conserta nada.
 *   2. FATURAMENTO — a apuração coleta do SCI de 1º de janeiro do ano ANTERIOR
 *      até o fim do mês de referência e grava por UPSERT: o mês novo entra sem
 *      apagar os que já estavam, e é assim que os 12 meses se completam. A RBAA
 *      só é usada quando o ano anterior tem os 12 meses fechados — ano pela
 *      metade não é "receita baixa", é receita desconhecida.
 *   3. E-MAIL — os dois avisos, cada um para o seu público.
 *
 * Desligado por padrão — precisa de `COTA_SCHEDULER_ENABLED=true` no .env.
 */

import { executeQuery } from '../config/mysql';
import cotaAprendizagemService from './CotaAprendizagemService';
import cadastroRefreshService from './CadastroRefreshService';
import { mesReferencia, bdrefDe } from './cotaAprendizagem.rules';

const DIA_PADRAO = Number(process.env['COTA_SCHEDULER_DIA'] || 5);
const HORA_PADRAO = Number(process.env['COTA_SCHEDULER_HORA'] || 1);
const HABILITADO = process.env['COTA_SCHEDULER_ENABLED'] === 'true';
/** Ligada por padrão; `COTA_REFRESH_CADASTRO=false` pula a etapa 1. */
const REFRESH_CADASTRO = process.env['COTA_REFRESH_CADASTRO'] !== 'false';
const INTERVALO_MS = 60 * 1000; // confere a cada minuto

export class CotaAprendizagemScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rodandoAgora = false;

  start(): void {
    if (!HABILITADO) {
      console.log(
        '[Cota Scheduler] Desabilitado. Para ligar, defina COTA_SCHEDULER_ENABLED=true no .env.'
      );
      return;
    }
    if (this.intervalId) return;

    console.log(
      `[Cota Scheduler] Ativo — apuração todo dia ${DIA_PADRAO} às ${String(HORA_PADRAO).padStart(2, '0')}:00.`
    );
    this.intervalId = setInterval(() => {
      void this.verificar();
    }, INTERVALO_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Cota Scheduler] Parado.');
    }
  }

  /**
   * Dispara a apuração da competência do mês, uma vez por mês.
   *
   * A janela é `dia >= DIA_PADRAO`, e não `dia === DIA_PADRAO`, de propósito:
   * com igualdade exata, um servidor fora do ar naquela hora específica faria a
   * competência inteira ser PULADA até o mês seguinte — e a regra dos 20%
   * depende de acompanhar todo mês, sem buraco. Com `>=`, se o dia 5 for
   * perdido, a apuração acontece no dia 6, 7, e assim por diante.
   *
   * O que impede rodar de novo todo dia depois disso é a checagem no banco: a
   * competência já apurada encerra a verificação. Essa checagem também é o que
   * evita reprocessar após um restart do processo (o flag em memória não
   * sobrevive a restart).
   *
   * A hora só é exigida na PRIMEIRA oportunidade (dia exato), para a apuração
   * cair na madrugada quando tudo corre bem. Nos dias seguintes, qualquer hora
   * serve — recuperar o mês vale mais do que respeitar o horário.
   */
  private async verificar(): Promise<void> {
    if (this.rodandoAgora || cotaAprendizagemService.status.rodando) return;

    const agora = new Date();
    const dia = agora.getDate();
    if (dia < DIA_PADRAO) return;
    if (dia === DIA_PADRAO && agora.getHours() !== HORA_PADRAO) return;

    const ref = mesReferencia(agora);
    const bdref = bdrefDe(ref.ano, ref.mes);

    try {
      const jaApurado = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) AS total FROM cota_classificacao_mensal WHERE bdref = ?`,
        [bdref]
      );
      if (Number(jaApurado[0]?.total ?? 0) > 0) return;

      this.rodandoAgora = true;
      const atrasado = dia > DIA_PADRAO;
      console.log(
        `[Cota Scheduler] Iniciando apuração da competência ${bdref}` +
          (atrasado ? ` (recuperando — o dia ${DIA_PADRAO} foi perdido)` : '') +
          '...'
      );

      await this.atualizarCadastro();

      await cotaAprendizagemService.sincronizar({
        mesReferencia: ref,
        enviarEmail: true,
      });
    } catch (err: any) {
      console.error('[Cota Scheduler] Erro na apuração automática:', err?.message || err);
    } finally {
      this.rodandoAgora = false;
    }
  }

  /**
   * Etapa 1 — cadastro em dia antes de classificar.
   *
   * Best-effort de propósito: ReceitaWS fora do ar, 429 teimoso ou qualquer
   * outra falha NÃO pode impedir a apuração. Apurar com o cadastro do mês
   * passado é ruim; não apurar o mês é pior, porque a regra dos 20% depende de
   * acompanhar todos os meses sem buraco.
   */
  private async atualizarCadastro(): Promise<void> {
    if (!REFRESH_CADASTRO) {
      console.log('[Cota Scheduler] Etapa de cadastro pulada (COTA_REFRESH_CADASTRO=false).');
      return;
    }

    try {
      console.log('[Cota Scheduler] Etapa 1/3 — atualizando o cadastro pela ReceitaWS...');
      const r = await cadastroRefreshService.atualizarTodos();
      console.log(
        `[Cota Scheduler] Cadastro atualizado: ${r.atualizados} mudança(s) em ` +
          `${r.processados} cliente(s), ${r.erros} erro(s).`
      );
    } catch (err: any) {
      console.error(
        '[Cota Scheduler] Varredura cadastral falhou — a apuração segue com o cadastro atual:',
        err?.message || err
      );
    }
  }

  /** Execução manual, ignorando dia/hora. Usada pelo endpoint de sincronizar. */
  async forcar(enviarEmail = false): Promise<void> {
    await cotaAprendizagemService.sincronizar({ enviarEmail });
  }
}

export const cotaAprendizagemScheduler = new CotaAprendizagemScheduler();
export default cotaAprendizagemScheduler;
