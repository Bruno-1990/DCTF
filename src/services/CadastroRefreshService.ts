/**
 * Varredura cadastral pela ReceitaWS — o passo que antecede a apuração mensal.
 *
 * POR QUE EXISTE: a classificação de porte não sai só do faturamento. Ela lê do
 * CADASTRO a data de abertura (início de atividade tem regra própria), o
 * `tipo_estabelecimento` (é ele, e não o sufixo do CNPJ, que diz quem é matriz),
 * a situação cadastral e o quadro societário (sócio PJ derruba o enquadramento
 * de ME/EPP independentemente da receita). Apurar sobre cadastro velho é apurar
 * com regra velha — e o erro só aparece meses depois, quando alguém confere.
 *
 * RITMO: o plano gratuito da ReceitaWS aceita 3 consultas por minuto, então são
 * 20s entre CNPJs. Com os ~220 clientes da base a varredura leva ~1h15 — motivo
 * de ela rodar de madrugada, antes da apuração, e não sob demanda na tela.
 *
 * NÃO É DESTRUTIVA: cada CNPJ passa pelo mesmo caminho da tela de Administração
 * (`atualizarCadastroViaReceitaWS`), que preenche/corrige campo a campo e
 * registra o histórico das alterações. Nada é apagado, ninguém é cadastrado.
 *
 * FALHA AQUI NÃO PODE PARAR A APURAÇÃO: se a ReceitaWS estiver fora do ar ou
 * limitar as consultas, o pior cenário aceitável é apurar com o cadastro do mês
 * passado. Por isso todo erro é contado e seguido em frente, nunca propagado.
 */

import { executeQuery } from '../config/mysql';
import { Cliente } from '../models/Cliente';

/** 3 consultas/min no plano gratuito da ReceitaWS. */
export const INTERVALO_PADRAO_MS = Number(process.env['CADASTRO_REFRESH_INTERVALO_MS'] || 20000);

/**
 * Espera extra quando a ReceitaWS responde 429.
 *
 * Um minuto inteiro, e não os 20s de sempre: o 429 diz que a janela de
 * consultas já estourou, e reentrar nela no mesmo ritmo só rende outro 429.
 */
export const BACKOFF_429_MS = 60000;

export interface ItemRefresh {
  cnpj: string;
  razaoSocial: string;
  status: 'atualizado' | 'sem_alteracao' | 'nao_encontrado' | 'sem_nome_receita' | 'erro';
  alteracoes?: string[];
  erro?: string;
}

export interface ResumoRefreshCadastral {
  total: number;
  processados: number;
  atualizados: number;
  semAlteracao: number;
  naoEncontrados: number;
  erros: number;
  duracaoMs: number;
  interrompido: boolean;
  itens: ItemRefresh[];
}

const dormir = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export class CadastroRefreshService {
  private clienteModel = new Cliente();
  private rodando = false;
  private processados = 0;
  private total = 0;

  get status(): { rodando: boolean; processados: number; total: number } {
    return { rodando: this.rodando, processados: this.processados, total: this.total };
  }

  /**
   * Percorre os clientes e atualiza o cadastro de cada um pelo cartão CNPJ.
   *
   * `esperar` é injetável para o teste não precisar de 20s por CNPJ; em
   * produção é o `setTimeout` de sempre.
   */
  async atualizarTodos(opts?: {
    cnpjs?: string[];
    intervaloMs?: number;
    limite?: number;
    dryRun?: boolean;
    sinalParar?: () => boolean;
    esperar?: (ms: number) => Promise<void>;
  }): Promise<ResumoRefreshCadastral> {
    if (this.rodando) {
      throw Object.assign(new Error('Varredura cadastral já em andamento.'), { status: 409 });
    }

    const intervaloMs = opts?.intervaloMs ?? INTERVALO_PADRAO_MS;
    const esperar = opts?.esperar ?? dormir;
    const inicio = Date.now();

    const resumo: ResumoRefreshCadastral = {
      total: 0,
      processados: 0,
      atualizados: 0,
      semAlteracao: 0,
      naoEncontrados: 0,
      erros: 0,
      duracaoMs: 0,
      interrompido: false,
      itens: [],
    };

    this.rodando = true;
    this.processados = 0;
    this.total = 0;

    try {
      // Inclui BAIXADA e INAPTA de propósito: é justamente a varredura que
      // descobre a baixa nova, e empresa baixada sai da obrigação.
      const linhas = await executeQuery<{ cnpj_limpo: string; razao_social: string }>(
        `SELECT cnpj_limpo, razao_social FROM clientes
          WHERE cnpj_limpo IS NOT NULL AND CHAR_LENGTH(cnpj_limpo) = 14
          ORDER BY razao_social ASC`
      );

      const filtrados = opts?.cnpjs?.length
        ? linhas.filter((l) => opts.cnpjs!.includes(l.cnpj_limpo))
        : linhas;
      const alvos = opts?.limite ? filtrados.slice(0, opts.limite) : filtrados;

      resumo.total = alvos.length;
      this.total = alvos.length;

      console.log(
        `[Cadastro ReceitaWS] Varredura de ${alvos.length} cliente(s) — ` +
          `~${Math.round((alvos.length * intervaloMs) / 60000)} min no ritmo de ` +
          `${intervaloMs / 1000}s por CNPJ.`
      );

      for (let i = 0; i < alvos.length; i++) {
        if (opts?.sinalParar?.()) {
          resumo.interrompido = true;
          break;
        }

        const alvo = alvos[i]!;
        const item = await this.atualizarUm(alvo, { dryRun: opts?.dryRun, esperar });
        resumo.itens.push(item);

        if (item.status === 'atualizado') resumo.atualizados++;
        else if (item.status === 'erro') resumo.erros++;
        else if (item.status === 'nao_encontrado') resumo.naoEncontrados++;
        else resumo.semAlteracao++;

        resumo.processados++;
        this.processados = resumo.processados;

        if (resumo.processados % 25 === 0 || resumo.processados === alvos.length) {
          console.log(
            `[Cadastro ReceitaWS] ${resumo.processados}/${alvos.length} — ` +
              `${resumo.atualizados} atualizado(s), ${resumo.erros} erro(s).`
          );
        }

        // Sem pausa depois do último: ela existe para respeitar o limite da
        // próxima consulta, e não há próxima.
        if (i < alvos.length - 1) await esperar(intervaloMs);
      }

      resumo.duracaoMs = Date.now() - inicio;
      console.log(
        `[Cadastro ReceitaWS] Fim: ${resumo.processados}/${resumo.total} processados, ` +
          `${resumo.atualizados} atualizado(s), ${resumo.semAlteracao} sem alteração, ` +
          `${resumo.naoEncontrados} não encontrado(s), ${resumo.erros} erro(s), ` +
          `${Math.round(resumo.duracaoMs / 60000)} min.`
      );
      return resumo;
    } finally {
      this.rodando = false;
    }
  }

  /**
   * Um CNPJ. O 429 ganha uma segunda tentativa depois do backoff — perder o
   * cliente por causa de um limite de janela desperdiçaria a varredura inteira,
   * que já foi paga em tempo de espera.
   */
  private async atualizarUm(
    alvo: { cnpj_limpo: string; razao_social: string },
    opts: { dryRun?: boolean; esperar: (ms: number) => Promise<void> }
  ): Promise<ItemRefresh> {
    const base = { cnpj: alvo.cnpj_limpo, razaoSocial: alvo.razao_social };

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const r = await this.clienteModel.atualizarCadastroViaReceitaWS(alvo.cnpj_limpo, {
          dryRun: opts.dryRun === true,
          ignorarCaixa: true,
        });

        if (!r.success || !r.data) {
          const erro = r.error || 'Falha sem mensagem.';
          if (tentativa === 1 && /HTTP 429/.test(erro)) {
            await opts.esperar(BACKOFF_429_MS);
            continue;
          }
          return { ...base, status: 'erro', erro };
        }

        return {
          ...base,
          status: r.data.status,
          alteracoes: (r.data.alteracoes || []).map((a) => a.campo),
        };
      } catch (err: any) {
        const erro = err?.message || 'Erro ao consultar a ReceitaWS.';
        if (tentativa === 1 && /HTTP 429/.test(erro)) {
          await opts.esperar(BACKOFF_429_MS);
          continue;
        }
        return { ...base, status: 'erro', erro };
      }
    }

    return { ...base, status: 'erro', erro: 'Limite de consultas da ReceitaWS persistente.' };
  }
}

export const cadastroRefreshService = new CadastroRefreshService();
export default cadastroRefreshService;
