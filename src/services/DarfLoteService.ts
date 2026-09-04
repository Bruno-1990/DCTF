/**
 * Lote mensal de DARF previdenciário para a Acessórias.
 *
 * Emite a guia da DCTFWeb de cada cliente da carteira, deposita o PDF na pasta
 * que o robô da Acessórias lê e manda um relatório do que aconteceu.
 *
 * TRÊS DECISÕES QUE VALE ENTENDER ANTES DE MEXER:
 *
 * 1. GUIA JÁ EMITIDA É REAPROVEITADA, NÃO REEMITIDA.
 *    Cada ida ao SERPRO é cota contratada. Se a competência já tem guia viva no
 *    histórico (não excluída e com PDF), o lote copia aquele PDF para a pasta em
 *    vez de pedir outro. Isso é o que torna a rodada repetível: rodar de novo
 *    depois de corrigir um cliente não cobra pelos dezesseis que já deram certo.
 *    `forcar: true` existe para o caso oposto — a declaração foi retificada e a
 *    guia velha não vale mais.
 *
 * 2. PASTA INACESSÍVEL ABORTA ANTES DE EMITIR.
 *    Emitir dezessete guias que não têm onde ser entregues gasta cota para
 *    produzir nada. Quando o compartilhamento não responde, a rodada para antes
 *    da primeira emissão e o e-mail avisa — em vez de morrer calada.
 *
 * 3. FALHA DE UM CLIENTE NÃO PARA O LOTE.
 *    "Não há débitos com saldo a pagar" é resposta legítima da Receita, não
 *    defeito: acontece com quem não teve movimento no mês. O cliente entra no
 *    relatório como falha, com o motivo, e o lote segue. Interromper no primeiro
 *    tropeço deixaria os seguintes sem guia por causa de um que nem devia ter.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ResultSetHeader } from 'mysql2';
import { executeQuery, mysqlPool } from '../config/mysql';
import { gerarGuia, type CategoriaDctfWeb, type DadosGuiaDctfWeb } from './DctfWebService';
import { gravarNoHistorico } from './darf.historico';
import { soDigitos } from './integraContador';
import { enviarRelatorioLote } from './darfLote.email';

/** Onde o robô da Acessórias lê os arquivos. */
const PASTA_DESTINO =
  process.env['DARF_ACESSORIAS_DIR']?.trim() || '\\\\192.168.0.1\\Envio_Acessorias';

/**
 * Folga entre uma emissão e a próxima. Não é exigência documentada do SERPRO:
 * é para não despejar a carteira inteira de uma vez num serviço que responde em
 * segundos e cuja indisponibilidade custaria a rodada toda.
 */
const INTERVALO_MS = 1500;

export interface ClienteLote {
  id: number;
  cnpj: string;
  razaoSocial: string | null;
  codigoSci: string | null;
  ativo: boolean;
  observacao: string | null;
  criadoEm: string;
}

export type StatusItem = 'emitido' | 'reaproveitado' | 'falha';

export interface ItemLote {
  cnpj: string;
  razaoSocial: string | null;
  codigoSci: string | null;
  status: StatusItem;
  darfId: number | null;
  numeroDocumento: string | null;
  valorTotal: number | null;
  vencimento: string | null;
  /** Nome do arquivo gravado na pasta. Nulo quando falhou. */
  arquivo: string | null;
  erro: string | null;
}

export interface ResultadoLote {
  execucaoId: number | null;
  anoPA: string;
  mesPA: string;
  categoria: CategoriaDctfWeb;
  pastaDestino: string;
  itens: ItemLote[];
  total: number;
  emitidos: number;
  reaproveitados: number;
  falhas: number;
  valorTotal: number;
  emailEnviado: boolean;
  emailErro: string | null;
  /** Preenchido quando a rodada nem começou (pasta fora do ar). */
  abortadoPor: string | null;
}

export interface OpcoesLote {
  anoPA: string;
  mesPA: string;
  categoria?: CategoriaDctfWeb;
  /** Quem pediu. 'agendador' quando ninguém clicou. */
  disparadoPor?: string;
  /** Ignora a guia já existente e emite outra. Use após retificação. */
  forcar?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `47306185000120_DARF_PREVIDENCIARIO_082026.pdf`
 *
 * O nome é contrato com o robô da Acessórias, que casa arquivo, empresa e
 * competência por ele — não é escolha estética. CNPJ só dígitos porque a barra
 * do CNPJ formatado não é caractere válido em nome de arquivo, e mês antes do
 * ano porque é como a competência se lê na guia.
 */
export function nomeArquivo(cnpj: string, anoPA: string, mesPA: string): string {
  const mm = String(mesPA).padStart(2, '0');
  return `${soDigitos(cnpj)}_DARF_PREVIDENCIARIO_${mm}${anoPA}.pdf`;
}

export class DarfLoteService {
  /** Trava simples contra duas rodadas ao mesmo tempo (agendador + manual). */
  private rodando = false;

  // ─── Carteira ────────────────────────────────────────────────────────────

  /**
   * A lista com razão social e código SCI vindos de `clientes`.
   *
   * LEFT JOIN, e não INNER: um CNPJ que ainda não está no cadastro precisa
   * aparecer na tela mesmo assim — some-lo seria esconder justamente o cliente
   * que alguém acabou de incluir errado.
   */
  async listar(incluirInativos = true): Promise<ClienteLote[]> {
    const linhas = await executeQuery<any>(
      `SELECT l.id, l.cnpj, l.ativo, l.observacao, l.criado_em,
              c.razao_social, c.codigo_sci
         FROM darf_lote_acessorias l
         LEFT JOIN clientes c ON c.cnpj_limpo = l.cnpj
        ${incluirInativos ? '' : 'WHERE l.ativo = 1'}
        ORDER BY CAST(NULLIF(c.codigo_sci, '') AS UNSIGNED), c.razao_social, l.cnpj`
    );
    return linhas.map((r: any) => ({
      id: r.id,
      cnpj: r.cnpj,
      razaoSocial: r.razao_social ?? null,
      codigoSci: r.codigo_sci ?? null,
      ativo: r.ativo === 1,
      observacao: r.observacao ?? null,
      criadoEm: r.criado_em,
    }));
  }

  async adicionar(cnpjBruto: string, criadoPor: string | null): Promise<ClienteLote> {
    const cnpj = soDigitos(cnpjBruto);
    if (cnpj.length !== 14) throw new Error('CNPJ inválido — informe os 14 dígitos.');

    // Reativar em vez de recusar: o caso comum de "adicionar de novo" é um
    // cliente que tinha sido desligado, e mandar o usuário procurar a linha
    // inativa para religá-la é atrito sem motivo.
    await mysqlPool.execute(
      `INSERT INTO darf_lote_acessorias (cnpj, criado_por, ativo)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ativo = 1, atualizado_em = CURRENT_TIMESTAMP`,
      [cnpj, criadoPor]
    );

    const lista = await this.listar();
    const item = lista.find((c) => c.cnpj === cnpj);
    if (!item) throw new Error('Cliente incluído, mas não foi possível relê-lo.');
    return item;
  }

  /** Liga/desliga sem apagar — ver o comentário da coluna `ativo` na 052. */
  async alternarAtivo(id: number, ativo: boolean): Promise<void> {
    const [r] = await mysqlPool.execute<ResultSetHeader>(
      'UPDATE darf_lote_acessorias SET ativo = ? WHERE id = ?',
      [ativo ? 1 : 0, id]
    );
    if (!r.affectedRows) throw new Error('Cliente não encontrado no lote.');
  }

  async remover(id: number): Promise<void> {
    const [r] = await mysqlPool.execute<ResultSetHeader>(
      'DELETE FROM darf_lote_acessorias WHERE id = ?',
      [id]
    );
    if (!r.affectedRows) throw new Error('Cliente não encontrado no lote.');
  }

  // ─── Execuções ───────────────────────────────────────────────────────────

  async execucoes(limit = 24): Promise<any[]> {
    const lim = Math.min(Math.max(1, Math.trunc(limit)), 200);
    return executeQuery<any>(
      `SELECT id, ano_pa, mes_pa, categoria, disparado_por, iniciado_em, concluido_em,
              total, emitidos, reaproveitados, falhas, valor_total,
              email_enviado, email_erro, itens
         FROM darf_lote_execucoes
        ORDER BY iniciado_em DESC
        LIMIT ${lim}`
    );
  }

  // ─── A rodada ────────────────────────────────────────────────────────────

  async executar(opcoes: OpcoesLote): Promise<ResultadoLote> {
    if (this.rodando) {
      throw new Error('Já existe uma rodada do lote em andamento. Aguarde ela terminar.');
    }
    this.rodando = true;
    try {
      return await this.rodar(opcoes);
    } finally {
      this.rodando = false;
    }
  }

  private async rodar(opcoes: OpcoesLote): Promise<ResultadoLote> {
    const anoPA = String(opcoes.anoPA).trim();
    const mesPA = String(opcoes.mesPA).padStart(2, '0');
    const categoria = opcoes.categoria ?? 'GERAL_MENSAL';
    const disparadoPor = opcoes.disparadoPor ?? 'agendador';

    const base: ResultadoLote = {
      execucaoId: null,
      anoPA,
      mesPA,
      categoria,
      pastaDestino: PASTA_DESTINO,
      itens: [],
      total: 0,
      emitidos: 0,
      reaproveitados: 0,
      falhas: 0,
      valorTotal: 0,
      emailEnviado: false,
      emailErro: null,
      abortadoPor: null,
    };

    const clientes = (await this.listar()).filter((c) => c.ativo);
    base.total = clientes.length;

    if (clientes.length === 0) {
      base.abortadoPor = 'A carteira do lote está vazia — nenhum cliente ativo para emitir.';
      await this.finalizar(base, disparadoPor);
      return base;
    }

    // Antes de gastar a primeira cota: a pasta responde?
    const problemaNaPasta = await this.verificarPasta();
    if (problemaNaPasta) {
      base.abortadoPor = problemaNaPasta;
      await this.finalizar(base, disparadoPor);
      return base;
    }

    console.log(
      `[DarfLote] ${clientes.length} clientes — competência ${mesPA}/${anoPA}, categoria ${categoria}.`
    );

    for (const cliente of clientes) {
      const item = await this.processar(cliente, { anoPA, mesPA, categoria }, opcoes.forcar === true, disparadoPor);
      base.itens.push(item);

      if (item.status === 'falha') base.falhas++;
      else {
        if (item.status === 'emitido') base.emitidos++;
        else base.reaproveitados++;
        base.valorTotal += Number(item.valorTotal ?? 0);
      }

      // Só quem foi ao SERPRO precisa da folga; cópia de PDF do banco não.
      if (item.status === 'emitido') await sleep(INTERVALO_MS);
    }

    await this.finalizar(base, disparadoPor);
    return base;
  }

  /**
   * Um cliente: acha ou emite a guia, grava o PDF na pasta.
   *
   * Nunca lança — a falha vira um item com `erro`, porque o lote continua.
   */
  private async processar(
    cliente: ClienteLote,
    comp: { anoPA: string; mesPA: string; categoria: CategoriaDctfWeb },
    forcar: boolean,
    disparadoPor: string
  ): Promise<ItemLote> {
    const item: ItemLote = {
      cnpj: cliente.cnpj,
      razaoSocial: cliente.razaoSocial,
      codigoSci: cliente.codigoSci,
      status: 'falha',
      darfId: null,
      numeroDocumento: null,
      valorTotal: null,
      vencimento: null,
      arquivo: null,
      erro: null,
    };

    try {
      let pdfBase64: string | null = null;

      if (!forcar) {
        const existente = await this.guiaExistente(cliente.cnpj, comp);
        if (existente) {
          pdfBase64 = existente.pdf_base64;
          item.status = 'reaproveitado';
          item.darfId = existente.id;
          item.numeroDocumento = existente.numero_documento;
          item.valorTotal = existente.valor_total == null ? null : Number(existente.valor_total);
          item.vencimento = existente.vencimento;
        }
      }

      if (!pdfBase64) {
        const dados: DadosGuiaDctfWeb = {
          contribuinte: cliente.cnpj,
          categoria: comp.categoria,
          anoPA: comp.anoPA,
          mesPA: comp.mesPA,
        };
        const guia = await gerarGuia(dados);
        const gravacao = await gravarNoHistorico(dados, guia, disparadoPor);

        pdfBase64 = guia.pdf;
        item.status = 'emitido';
        item.darfId = gravacao.id;
        item.numeroDocumento = guia.numeroDocumento || null;
        item.valorTotal = guia.lidos.valorTotal;
        item.vencimento = guia.lidos.vencimento;
        // A guia existe mesmo sem o registro; o aviso vai junto para o
        // relatório em vez de virar sucesso silencioso.
        if (gravacao.aviso) item.erro = gravacao.aviso;
      }

      const nome = nomeArquivo(cliente.cnpj, comp.anoPA, comp.mesPA);
      await fs.writeFile(path.join(PASTA_DESTINO, nome), Buffer.from(pdfBase64, 'base64'));
      item.arquivo = nome;

      console.log(`[DarfLote] ${item.status.padEnd(14)} ${cliente.cnpj} -> ${nome}`);
      return item;
    } catch (erro) {
      item.status = 'falha';
      item.arquivo = null;
      item.erro = (erro as Error)?.message || 'Erro desconhecido.';
      console.warn(`[DarfLote] falha         ${cliente.cnpj}: ${item.erro}`);
      return item;
    }
  }

  /**
   * Guia viva da mesma competência: não excluída e com PDF.
   *
   * `pdf_base64 IS NOT NULL` não é preciosismo — a 051 apaga o PDF de guia
   * excluída, então uma linha sem PDF é registro histórico, não documento
   * entregável. Sem esta condição o lote copiaria `null` para a pasta.
   */
  private async guiaExistente(
    cnpj: string,
    comp: { anoPA: string; mesPA: string; categoria: CategoriaDctfWeb }
  ): Promise<any | null> {
    const linhas = await executeQuery<any>(
      `SELECT id, numero_documento, valor_total, vencimento, pdf_base64
         FROM darfs_emitidos
        WHERE cnpj = ? AND categoria = ? AND ano_pa = ? AND mes_pa = ?
          AND excluido_em IS NULL
          AND pdf_base64 IS NOT NULL
        ORDER BY criado_em DESC
        LIMIT 1`,
      [cnpj, comp.categoria, comp.anoPA, comp.mesPA]
    );
    return linhas[0] ?? null;
  }

  /**
   * Confere que dá para escrever na pasta, escrevendo de verdade.
   *
   * `fs.access` responde sobre permissão, não sobre um compartilhamento de rede
   * que aceita a conexão e falha na escrita. O arquivo de teste é apagado em
   * seguida; se sobrar um, é sinal de que a remoção falhou e vale investigar.
   */
  private async verificarPasta(): Promise<string | null> {
    const teste = path.join(PASTA_DESTINO, `.darf-lote-${Date.now()}.tmp`);
    try {
      await fs.mkdir(PASTA_DESTINO, { recursive: true });
      await fs.writeFile(teste, 'ok');
      await fs.unlink(teste);
      return null;
    } catch (erro) {
      const msg = (erro as Error)?.message ?? String(erro);
      console.error(`[DarfLote] Pasta de destino indisponível (${PASTA_DESTINO}):`, msg);
      return `A pasta de destino não respondeu (${PASTA_DESTINO}). Nenhuma guia foi emitida. Detalhe técnico: ${msg}`;
    }
  }

  /** Grava a execução e dispara o relatório. */
  private async finalizar(r: ResultadoLote, disparadoPor: string): Promise<void> {
    try {
      const email = await enviarRelatorioLote(r);
      r.emailEnviado = email.enviado;
      r.emailErro = email.erro;
    } catch (erro) {
      r.emailEnviado = false;
      r.emailErro = (erro as Error)?.message ?? 'Falha ao enviar o relatório.';
      console.error('[DarfLote] Relatório não enviado:', r.emailErro);
    }

    try {
      const [res] = await mysqlPool.execute<ResultSetHeader>(
        `INSERT INTO darf_lote_execucoes
           (ano_pa, mes_pa, categoria, disparado_por, concluido_em,
            total, emitidos, reaproveitados, falhas, valor_total,
            email_enviado, email_erro, itens)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.anoPA,
          r.mesPA,
          r.categoria,
          disparadoPor,
          r.total,
          r.emitidos,
          r.reaproveitados,
          r.falhas,
          r.valorTotal || null,
          r.emailEnviado ? 1 : 0,
          // Mensagem de erro de SMTP passa fácil dos 255 da coluna.
          r.emailErro ? r.emailErro.slice(0, 255) : null,
          JSON.stringify(r.abortadoPor ? { abortadoPor: r.abortadoPor, itens: r.itens } : r.itens),
        ]
      );
      r.execucaoId = res?.insertId ?? null;
    } catch (erro) {
      // Mesma regra do histórico de guias: o trabalho já foi feito e os PDFs já
      // estão na pasta. Não registrar a rodada é ruim, perder o resultado por
      // causa disso seria pior.
      console.error('[DarfLote] Rodada concluída mas não registrada:', erro);
    }
  }
}

export default new DarfLoteService();
