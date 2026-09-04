/**
 * Gravação de uma guia emitida no histórico (`darfs_emitidos`).
 *
 * Vive fora do controller porque agora tem dois chamadores: a emissão avulsa da
 * tela (um cliente, alguém clicou) e o lote mensal da Acessórias (a carteira
 * inteira, sem ninguém olhando). Enquanto o INSERT morava dentro do controller,
 * o lote só teria dois caminhos — chamar o próprio endpoint por HTTP, ou copiar
 * o INSERT. O segundo é o que faz as duas versões divergirem no dia em que uma
 * coluna nova entra e só um dos lados é alterado.
 *
 * A REGRA QUE ESTE MÓDULO PRESERVA: falha ao gravar NUNCA derruba a emissão.
 * A guia já custou uma ida ao SERPRO e já existe do lado da Receita; perder o
 * PDF por causa de um banco fora do ar obrigaria a emitir de novo — cobrando
 * cota duas vezes pelo mesmo documento. Por isso o retorno tem `aviso` em vez
 * de exceção: quem chamou decide o que fazer com a falha, mas recebe o PDF.
 */

import type { ResultSetHeader } from 'mysql2';
import { executeQuery, mysqlPool } from '../config/mysql';
import type { DadosGuiaDctfWeb, GuiaEmitida } from './DctfWebService';

/**
 * Tira do payload qualquer campo que carregue o PDF antes de gravá-lo em
 * `resposta_json`. O PDF já tem coluna própria; deixá-lo também no JSON
 * dobraria o tamanho da linha sem acrescentar nada à auditoria.
 */
export const semPdf = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload;
  const copia: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const [k, v] of Object.entries(copia)) {
    if (typeof v === 'string' && v.length > 1000) copia[k] = `<${v.length} chars omitidos>`;
  }
  return copia;
};

export interface ResultadoGravacao {
  /** `null` quando a gravação falhou — a guia existe, o registro não. */
  id: number | null;
  /** Texto para a tela quando `id` é nulo. */
  aviso: string | null;
}

/**
 * Grava a guia e devolve o id. Não lança: erro vira `aviso`.
 */
export async function gravarNoHistorico(
  dados: DadosGuiaDctfWeb,
  guia: GuiaEmitida,
  emitidoPor: string | null
): Promise<ResultadoGravacao> {
  try {
    const env = guia.dadosEnviados as Record<string, any>;

    const [cliente] = await executeQuery<any>(
      'SELECT razao_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
      [dados.contribuinte]
    );

    const [resultado] = await mysqlPool.execute<ResultSetHeader>(
      `INSERT INTO darfs_emitidos
         (cnpj, razao_social,
          categoria, categoria_numero, ano_pa, mes_pa, dia_pa,
          cno_afericao, num_proc_reclamatoria, numero_recibo,
          valor_imposto, valor_total, vencimento,
          numero_documento, pdf_base64, emitido_por, resposta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dados.contribuinte,
        cliente?.razao_social ?? null,
        dados.categoria,
        env['categoria'] ?? null,
        env['anoPA'] ?? null,
        env['mesPA'] ?? null,
        env['diaPA'] ?? null,
        env['cnoAfericao'] != null ? String(env['cnoAfericao']) : null,
        env['numProcReclamatoria'] ?? null,
        // O recibo lido do PDF vale mais do que o enviado: quando o pedido
        // omite o recibo, a RFB escolhe o mais recente, e é o dela que conta.
        guia.lidos.numeroRecibo ??
          (env['numeroReciboEntrega'] != null ? String(env['numeroReciboEntrega']) : null),
        // Lidos do PDF — a API não devolve nenhum valor.
        guia.lidos.valorPrincipal,
        guia.lidos.valorTotal,
        guia.lidos.vencimento,
        guia.numeroDocumento || null,
        guia.pdf,
        emitidoPor,
        // Sem o PDF: são ~150 KB de base64 que já estão na coluna própria, e
        // duplicá-los dentro do JSON dobraria o tamanho de cada linha à toa.
        JSON.stringify(semPdf(guia.respostaBruta)),
      ]
    );

    return { id: resultado?.insertId ?? null, aviso: null };
  } catch (erro) {
    console.error('[Darf] Guia emitida mas não gravada no histórico:', erro);
    return {
      id: null,
      aviso: 'A guia foi emitida, mas não foi possível gravá-la no histórico. Baixe o PDF agora.',
    };
  }
}
