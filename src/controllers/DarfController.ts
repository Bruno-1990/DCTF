/**
 * DARF numerado — emissão pela DCTFWeb.
 *
 * Serve a aba Trabalhista > DARF.
 *
 * A guia já vem vinculada ao débito da declaração: quem informa o que se paga é
 * a própria declaração, não o formulário. Por isso NÃO existe aqui campo de
 * valor, código de receita, multa ou juros — se um dia aparecer um, é sinal de
 * que quem mexeu queria o Sicalc (o DARF avulso, o "preto"), e o resultado seria
 * um recolhimento que não quita a declaração.
 *
 * O caminho do Sicalc chegou a existir aqui e foi removido a pedido: para a
 * rotina trabalhista ele é sempre o documento errado.
 *
 * A gravação do histórico acontece DEPOIS de o SERPRO devolver o documento, e
 * uma falha ao gravar não derruba a resposta: se a guia foi emitida, o usuário
 * tem que recebê-la mesmo que o banco esteja fora do ar. O contrário — perder o
 * PDF por causa de um INSERT — obrigaria a emitir de novo.
 */

import { Request, Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { executeQuery, mysqlPool } from '../config/mysql';
import {
  gerarGuia,
  CATEGORIAS,
  ROTULO_CATEGORIA,
  REGRAS_CATEGORIA,
  type CategoriaDctfWeb,
  type DadosGuiaDctfWeb,
} from '../services/DctfWebService';
import { IntegraContadorError, soDigitos } from '../services/integraContador';

/**
 * Tira do payload qualquer campo que carregue o PDF antes de gravá-lo em
 * `resposta_json`. O PDF já tem coluna própria; deixá-lo também no JSON
 * dobraria o tamanho da linha sem acrescentar nada à auditoria.
 */
const semPdf = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload;
  const copia: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const [k, v] of Object.entries(copia)) {
    if (typeof v === 'string' && v.length > 1000) copia[k] = `<${v.length} chars omitidos>`;
  }
  return copia;
};

/**
 * Traduz a exceção para status HTTP. O `IntegraContadorError` já vem com a
 * mensagem pronta para a tela; o resto vira 500 genérico de propósito, para
 * não vazar detalhe de infraestrutura numa resposta pública.
 */
function responderErro(res: Response, erro: unknown, contexto: string): void {
  if (erro instanceof IntegraContadorError) {
    // 502 é só para o SERPRO quebrado. Uma recusa de negócio — "não foi
    // encontrada Declaração com os dados informados" — chega com HTTP 200 e é
    // uma resposta legítima: devolvê-la como Bad Gateway enche o console de
    // erro de infraestrutura e faz parecer que o serviço caiu quando não caiu.
    const upstreamQuebrou = !!erro.httpStatus && erro.httpStatus >= 500;
    console.error(`[Darf] ${contexto}:`, erro.message);
    res.status(upstreamQuebrou ? 502 : 400).json({ success: false, message: erro.message });
    return;
  }
  console.error(`[Darf] ${contexto} — erro inesperado:`, erro);
  res.status(500).json({ success: false, message: `Erro ao ${contexto}.` });
}

export class DarfController {
  // ─────────────────────────────────────────────────────────────────────────
  // DCTFWeb — DARF numerado
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/darf/dctfweb/categorias
   *
   * As sete categorias com o número da RFB e o que cada uma exige além do
   * período. Servido pelo backend, e não repetido no frontend, para que a
   * regra ("13º não tem mês", "aferição pede CNO") tenha um dono só.
   */
  async categoriasDctfWeb(_req: Request, res: Response): Promise<void> {
    const itens = (Object.keys(CATEGORIAS) as CategoriaDctfWeb[]).map((k) => ({
      id: k,
      numero: CATEGORIAS[k],
      rotulo: ROTULO_CATEGORIA[k],
      ...REGRAS_CATEGORIA[k],
    }));
    res.json({ success: true, data: itens });
  }

  /**
   * POST /api/darf/dctfweb — gera a guia e grava.
   *
   * Repare no que NÃO existe aqui: valor, código de receita, multa, juros. A
   * guia numerada carrega os valores da declaração, e aceitar um valor do
   * formulário seria abrir espaço para emitir um DARF que não corresponde ao
   * que foi declarado.
   */
  async emitirDctfWeb(req: Request, res: Response): Promise<void> {
    const b = req.body ?? {};

    const dados: DadosGuiaDctfWeb = {
      contribuinte: soDigitos(b.contribuinte),
      categoria: b.categoria,
      anoPA: String(b.anoPA ?? '').trim(),
      mesPA: b.mesPA || undefined,
      diaPA: b.diaPA || undefined,
      cnoAfericao: b.cnoAfericao || undefined,
      numProcReclamatoria: b.numProcReclamatoria || undefined,
      numeroReciboEntrega: b.numeroReciboEntrega || undefined,
      dataAcolhimento: b.dataAcolhimento || undefined,
    };

    let guia;
    try {
      guia = await gerarGuia(dados);
    } catch (erro) {
      responderErro(res, erro, 'gerar a guia da DCTFWeb');
      return;
    }

    let id: number | null = null;
    let avisoHistorico: string | null = null;
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
          (req.headers['x-usuario'] as string) || b.emitidoPor || null,
          // Sem o PDF: são ~150 KB de base64 que já estão na coluna própria, e
          // duplicá-los dentro do JSON dobraria o tamanho de cada linha à toa.
          JSON.stringify(semPdf(guia.respostaBruta)),
        ]
      );
      id = resultado?.insertId ?? null;
    } catch (erro) {
      console.error('[Darf] Guia emitida mas não gravada no histórico:', erro);
      avisoHistorico =
        'A guia foi emitida, mas não foi possível gravá-la no histórico. Baixe o PDF agora.';
    }

    res.json({
      success: true,
      aviso: avisoHistorico,
      data: {
        id,
        numeroDocumento: guia.numeroDocumento,
        lidos: guia.lidos,
        pdfBase64: guia.pdf,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Histórico
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/darf/historico?cnpj=&incluirExcluidos=&limit=
   *
   * Nunca traz `pdf_base64`: um DARF em base64 tem ~100 KB e 50 linhas viravam
   * 5 MB de resposta para uma tabela que só mostra valores e datas.
   */
  async historico(req: Request, res: Response): Promise<void> {
    try {
      const cnpj = soDigitos(req.query['cnpj']);
      // Excluído não some do banco, só sai da lista. `?incluirExcluidos=1`
      // existe para recuperar um documento que alguém tirou por engano.
      const incluirExcluidos = String(req.query['incluirExcluidos'] ?? '') === '1';

      // O limite vai INTERPOLADO, não como placeholder: o mysql2 manda os
      // parâmetros de um prepared statement como string, e `LIMIT '100'` é erro
      // de sintaxe no MySQL. A interpolação é segura porque o valor passa por
      // Math.floor e por um teto — nada do que o usuário digitou chega ao SQL.
      const limite = Math.min(Math.max(Math.floor(Number(req.query['limit']) || 100), 1), 500);

      const condicoes: string[] = [];
      const params: any[] = [];
      if (cnpj) {
        condicoes.push('cnpj = ?');
        params.push(cnpj);
      }
      if (!incluirExcluidos) condicoes.push('excluido_em IS NULL');
      const filtro = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

      const linhas = await executeQuery<any>(
        `SELECT id, cnpj, razao_social,
                categoria, categoria_numero, ano_pa, mes_pa, dia_pa, numero_recibo,
                valor_imposto, valor_total, vencimento,
                numero_documento, emitido_por, criado_em,
                excluido_em, excluido_por, motivo_exclusao,
                (pdf_base64 IS NOT NULL) AS tem_pdf
           FROM darfs_emitidos
           ${filtro}
           ORDER BY criado_em DESC
           LIMIT ${limite}`,
        params
      );

      res.json({ success: true, data: linhas });
    } catch (erro) {
      responderErro(res, erro, 'carregar o histórico');
    }
  }

  /**
   * GET /api/darf/:id/pdf — reimpressão.
   *
   * Devolve o PDF binário, não base64: assim o navegador abre direto no visor,
   * sem a tela ter que decodificar.
   */
  async baixarPdf(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Identificador inválido.' });
        return;
      }

      const [linha] = await executeQuery<any>(
        'SELECT cnpj, numero_documento, pdf_base64 FROM darfs_emitidos WHERE id = ? LIMIT 1',
        [id]
      );

      if (!linha?.pdf_base64) {
        res.status(404).json({ success: false, message: 'DARF não encontrado no histórico.' });
        return;
      }

      const pdf = Buffer.from(linha.pdf_base64, 'base64');
      const nome = `DARF-${linha.cnpj}-${linha.numero_documento || id}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    } catch (erro) {
      responderErro(res, erro, 'baixar o PDF');
    }
  }

  /**
   * DELETE /api/darf/:id — tira da lista, NÃO apaga.
   *
   * Era um DELETE de verdade, e isso custou caro: em 31/08/2026 um DARF sumiu
   * do histórico sem deixar rastro de quem tinha pedido nem quando.
   *
   * O QUE SE APAGA E O QUE FICA:
   *   apaga  → `pdf_base64`, ~150 KB por guia. A esta altura o PDF já foi
   *            baixado e entregue; guardar uma segunda cópia de cada emissão
   *            só engorda a tabela.
   *   fica   → a linha: número do documento, valores, competência, quem emitiu
   *            e quando. São algumas centenas de bytes, e é o que responde
   *            "esta guia chegou a ser emitida?" seis meses depois.
   *
   * A linha some da lista e continua no banco. Quem precisar dela de volta usa
   * `GET /api/darf/historico?incluirExcluidos=1` — mas o PDF não volta, porque
   * foi apagado de verdade; para tê-lo de novo é preciso reemitir a guia (que
   * sai com outro número e outra consolidação).
   */
  async excluir(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Identificador inválido.' });
        return;
      }

      const autor =
        (req.headers['x-usuario'] as string) || (req.body?.excluidoPor as string) || null;
      const motivo = (req.body?.motivo as string) || null;

      const [linha] = await executeQuery<any>(
        'SELECT excluido_em FROM darfs_emitidos WHERE id = ? LIMIT 1',
        [id]
      );
      if (!linha) {
        res.status(404).json({ success: false, message: 'DARF não encontrado.' });
        return;
      }
      // Reexcluir sobrescreveria o autor e a data do primeiro pedido, que são
      // justamente o rastro que esta mudança existe para preservar.
      if (linha.excluido_em) {
        res.json({ success: true, jaEstavaExcluido: true });
        return;
      }

      await executeQuery(
        `UPDATE darfs_emitidos
            SET pdf_base64 = NULL,
                excluido_em = NOW(), excluido_por = ?, motivo_exclusao = ?
          WHERE id = ? AND excluido_em IS NULL`,
        [autor, motivo, id]
      );
      res.json({ success: true });
    } catch (erro) {
      responderErro(res, erro, 'excluir o registro');
    }
  }

  /**
   * DELETE /api/darf/:id/definitivo — apaga o registro do banco.
   *
   * Este é o único caminho que destrói informação sem volta, e por isso exige
   * que a guia JÁ ESTEJA EXCLUÍDA. A ordem obrigatória — excluir, depois apagar
   * em definitivo — não é burocracia: foi um clique só que fez um DARF sumir do
   * histórico em 31/08/2026 sem ninguém saber explicar. Com dois passos, o
   * primeiro é reversível e o segundo é deliberado.
   *
   * A rota é separada do DELETE comum de propósito. Se fosse uma flag no mesmo
   * endpoint, um `definitivo=true` esquecido em algum lugar apagaria registro
   * onde se queria apagar só o PDF.
   */
  async excluirDefinitivo(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Identificador inválido.' });
        return;
      }

      const [linha] = await executeQuery<any>(
        'SELECT excluido_em, numero_documento FROM darfs_emitidos WHERE id = ? LIMIT 1',
        [id]
      );
      if (!linha) {
        res.status(404).json({ success: false, message: 'DARF não encontrado.' });
        return;
      }
      if (!linha.excluido_em) {
        res.status(409).json({
          success: false,
          message: 'Só é possível apagar em definitivo uma guia que já foi excluída.',
        });
        return;
      }

      // Fica no log do servidor porque, depois desta linha, não há mais nenhum
      // outro lugar onde conste que esta guia existiu.
      const autor = (req.headers['x-usuario'] as string) || '(não identificado)';
      console.warn(
        `[Darf] Registro apagado em definitivo: id=${id} ` +
          `documento=${linha.numero_documento ?? '-'} por=${autor}`
      );

      await executeQuery('DELETE FROM darfs_emitidos WHERE id = ? AND excluido_em IS NOT NULL', [
        id,
      ]);
      res.json({ success: true });
    } catch (erro) {
      responderErro(res, erro, 'apagar o registro em definitivo');
    }
  }

  /**
   * POST /api/darf/:id/restaurar — traz o REGISTRO de volta para a lista.
   *
   * Não traz o PDF: ele é apagado na exclusão e não há de onde tirá-lo. O que
   * volta é a linha — número, valores, competência, autor —, que é o suficiente
   * para provar que a guia existiu e para reemiti-la se ainda for preciso.
   */
  async restaurar(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Identificador inválido.' });
        return;
      }
      await executeQuery(
        `UPDATE darfs_emitidos
            SET excluido_em = NULL, excluido_por = NULL, motivo_exclusao = NULL
          WHERE id = ?`,
        [id]
      );
      res.json({ success: true });
    } catch (erro) {
      responderErro(res, erro, 'restaurar o registro');
    }
  }
}
