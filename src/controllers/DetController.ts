/**
 * DET — Domicílio Eletrônico Trabalhista.
 *
 * Serve a aba Trabalhista > DTE: quem tem procuração para o escritório acessar
 * a caixa postal do cliente, e o que já foi coletado de lá.
 *
 * Leitura da base, disparo da coleta e a varredura de procurações no SPE.
 *
 * O registro manual de procuração continua existindo, mas deixou de ser o
 * mecanismo: a coleta agora abre lendo a aba "Recebidas (sou Outorgado)" do SPE
 * e descobre sozinha quem tem procuração. O manual virou escape para o intervalo
 * entre o cliente outorgar e o SPE refletir.
 */

import { Request, Response } from 'express';
import { executeQuery } from '../config/mysql';
import { DetColetorService, coletaEmAndamento } from '../services/DetColetorService';

const soDigitos = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

export class DetController {
  /**
   * GET /api/det/resumo — os números dos cards.
   *
   * `notificacoes_novas` conta SÓ tipo='Notificação'. Aviso e Notificação não
   * têm o mesmo peso: na caixa de referência havia 10 Avisos (Crédito do
   * Trabalhador, mensal) para 1 Notificação (FGTS Digital, com prazo). Somar os
   * dois no mesmo card faria o número subir todo mês sem nada ter acontecido.
   */
  async resumo(_req: Request, res: Response): Promise<void> {
    try {
      const [tot] = await executeQuery<any>(
        `SELECT
           COUNT(*) AS total,
           SUM(COALESCE(p.situacao,'indeferido') = 'deferido')   AS deferidos,
           SUM(COALESCE(p.situacao,'indeferido') = 'indeferido') AS indeferidos,
           SUM(SUBSTRING(c.cnpj_limpo,9,4) =  '0001')            AS matrizes,
           SUM(SUBSTRING(c.cnpj_limpo,9,4) <> '0001')            AS filiais
         FROM clientes c
         LEFT JOIN det_procuracoes p ON p.cnpj = c.cnpj_limpo
         WHERE c.ativo = 1`
      );

      const [msg] = await executeQuery<any>(
        `SELECT
           COUNT(*)                                  AS mensagens,
           SUM(nao_lida = 1)                         AS nao_lidas,
           SUM(tipo = 'Notificação' AND nao_lida = 1) AS notificacoes_novas
         FROM det_notificacoes`
      );

      const [coleta] = await executeQuery<any>(
        `SELECT iniciado_em, concluido_em, total_clientes, coletados, erros,
                mensagens_novas, notificacoes_novas, origem,
                procuracoes_lidas, procuracoes_alteradas,
                procuracoes_ganharam, procuracoes_perderam, spe_erro
         FROM det_coletas
         ORDER BY iniciado_em DESC
         LIMIT 1`
      );

      // Vigências que vencem nos próximos 90 dias — perder uma procuração
      // silenciosamente tira o cliente da coleta sem ninguém notar.
      const [venc] = await executeQuery<any>(
        `SELECT COUNT(*) AS n
         FROM det_procuracoes
         WHERE situacao = 'deferido'
           AND vigencia_fim IS NOT NULL
           AND vigencia_fim <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)`
      );

      res.json({
        success: true,
        data: {
          total: Number(tot?.total ?? 0),
          deferidos: Number(tot?.deferidos ?? 0),
          indeferidos: Number(tot?.indeferidos ?? 0),
          matrizes: Number(tot?.matrizes ?? 0),
          filiais: Number(tot?.filiais ?? 0),
          mensagens: Number(msg?.mensagens ?? 0),
          naoLidas: Number(msg?.nao_lidas ?? 0),
          notificacoesNovas: Number(msg?.notificacoes_novas ?? 0),
          vigenciasVencendo: Number(venc?.n ?? 0),
          ultimaColeta: coleta ?? null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? 'erro no resumo' });
    }
  }

  /**
   * GET /api/det/clientes — a lista da tela.
   *
   * Parte de `clientes` (não de `det_procuracoes`) porque cliente ativo sem
   * linha de procuração precisa aparecer como indeferido, e não sumir.
   */
  async listar(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await executeQuery<any>(
        `SELECT
           c.cnpj_limpo                                          AS cnpj,
           c.razao_social,
           CASE WHEN SUBSTRING(c.cnpj_limpo,9,4) = '0001'
                THEN 'Matriz' ELSE 'Filial' END                  AS tipo,
           COALESCE(p.situacao,'indeferido')                     AS situacao,
           p.origem,
           p.outorgante_cnpj,
           p.vigencia_fim,
           p.observacao,
           p.verificado_em,
           COALESCE(n.total, 0)                                  AS mensagens,
           COALESCE(n.nao_lidas, 0)                              AS nao_lidas,
           COALESCE(n.notificacoes, 0)                           AS notificacoes,
           -- Fonte da "última coleta": det_procuracoes (carimbo POR CLIENTE),
           -- não mais MAX(det_notificacoes). O carimbo distingue caixa vazia
           -- conferida ("vazia") de nunca varrida (NULL) — antes as duas viravam
           -- "nunca". As colunas de mensagem seguem vindo de det_notificacoes.
           p.ultima_coleta_em                                    AS ultima_coleta,
           p.ultima_coleta_status,
           p.ultima_coleta_msgs
         FROM clientes c
         LEFT JOIN det_procuracoes p ON p.cnpj = c.cnpj_limpo
         LEFT JOIN (
           SELECT cnpj,
                  COUNT(*)                                    AS total,
                  SUM(nao_lida = 1)                           AS nao_lidas,
                  SUM(tipo = 'Notificação')                   AS notificacoes
           FROM det_notificacoes
           GROUP BY cnpj
         ) n ON n.cnpj = c.cnpj_limpo
         WHERE c.ativo = 1
         ORDER BY c.razao_social ASC, c.cnpj_limpo ASC`
      );

      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? 'erro ao listar' });
    }
  }

  /** GET /api/det/clientes/:cnpj/notificacoes — o painel de detalhe. */
  async notificacoes(req: Request, res: Response): Promise<void> {
    try {
      const cnpj = soDigitos(req.params.cnpj);
      if (cnpj.length !== 14) {
        res.status(400).json({ success: false, message: 'CNPJ inválido' });
        return;
      }
      const rows = await executeQuery<any>(
        `SELECT id, tipo, remetente, data_texto, data_envio, assunto, nao_lida,
                primeira_coleta_em, ultima_coleta_em
         FROM det_notificacoes
         WHERE cnpj = ?
         ORDER BY data_envio DESC, id DESC`,
        [cnpj]
      );
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? 'erro' });
    }
  }

  /**
   * POST /api/det/procuracoes/:cnpj — usuário informa que o cliente outorgou.
   *
   * Grava como origem='manual'. A verificação ao vivo contra o DET entra junto
   * com o coletor (fase seguinte); até lá a marcação é declaratória e a tela
   * diz isso. Marcar como manual importa mesmo assim: a releitura diária do SPE
   * não sobrescreve linha manual, então a informação não se perde.
   */
  /**
   * POST /api/det/procuracoes/sincronizar — varre o SPE e reconcilia a tabela.
   *
   * A coleta já faz isto sozinha no início de cada rodada; este endpoint existe
   * para atualizar a lista SEM pagar a varredura das caixas postais, que passa
   * de uma hora. Aceita `?dry=1` para devolver o diff sem gravar nada.
   *
   * Responde de forma SÍNCRONA, ao contrário de `coletar`: a leitura do SPE é
   * de segundos, não de horas, e devolver o diff na resposta é o que torna o
   * modo seco útil na tela.
   */
  async sincronizarProcuracoes(req: Request, res: Response): Promise<void> {
    if (coletaEmAndamento()) {
      res.status(409).json({
        success: false,
        message: 'Há uma coleta em andamento — ela já atualiza as procurações.',
      });
      return;
    }
    const dryRun = req.query?.dry === '1' || req.body?.dryRun === true;
    try {
      const coletor = new DetColetorService((m) => console.log('[DET-SPE]', m));
      const r = await coletor.sincronizarProcuracoes({ dryRun });
      res.json({
        success: true,
        dryRun,
        data: r,
        message: dryRun
          ? `Modo seco: ${r.mudancas.length} mudança(s) seriam aplicadas.`
          : `${r.lidasNoSpe} procuração(ões) lida(s); ${r.mudancas.length} mudança(s).`,
      });
    } catch (e: any) {
      // 502 e não 500: quem falhou foi o portal do governo, não este serviço.
      // A distinção importa para quem lê o log depois.
      res.status(502).json({
        success: false,
        message: `Não foi possível ler o SPE: ${e?.message ?? e}`,
      });
    }
  }

  async informarProcuracao(req: Request, res: Response): Promise<void> {
    try {
      const cnpj = soDigitos(req.params.cnpj);
      if (cnpj.length !== 14) {
        res.status(400).json({ success: false, message: 'CNPJ inválido' });
        return;
      }
      const usuario = String(req.body?.usuario ?? '').slice(0, 120) || null;
      const temProcuracao = req.body?.temProcuracao !== false;

      await executeQuery(
        `INSERT INTO det_procuracoes (cnpj, situacao, origem, observacao, informado_por, verificado_em)
         VALUES (?, ?, 'manual', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           situacao = VALUES(situacao),
           origem = 'manual',
           observacao = VALUES(observacao),
           informado_por = VALUES(informado_por),
           verificado_em = NOW()`,
        [
          cnpj,
          temProcuracao ? 'deferido' : 'indeferido',
          temProcuracao
            ? 'Informado manualmente — ainda não confirmado no DET'
            : 'Marcado manualmente como sem procuração',
          usuario,
        ]
      );

      res.json({ success: true, message: 'Registrado.' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? 'erro' });
    }
  }

  /**
   * POST /api/det/coletar — dispara a coleta manualmente.
   *
   * Responde na hora e deixa a varredura correndo: ela leva mais de uma hora,
   * e segurar a requisição aberta só faria o navegador do usuário desistir no
   * meio. O acompanhamento é por /coleta/status.
   *
   * `limite` existe para teste: coletar 3 clientes antes de soltar os 132.
   */
  async coletar(req: Request, res: Response): Promise<void> {
    if (coletaEmAndamento()) {
      res.status(409).json({ success: false, message: 'Já existe uma coleta em andamento.' });
      return;
    }
    const limite = Number(req.body?.limite) || undefined;

    const coletor = new DetColetorService((m) => console.log('[DET]', m));
    coletor.executar('manual', limite).catch((e) => {
      console.error('[DET] coleta manual falhou:', e?.message ?? e);
    });

    res.json({
      success: true,
      message: limite
        ? `Coleta iniciada (limitada a ${limite} cliente(s)).`
        : 'Coleta iniciada.',
    });
  }

  /** GET /api/det/coleta/status — acompanha a rodada em curso ou a última. */
  async statusColeta(_req: Request, res: Response): Promise<void> {
    try {
      const [ultima] = await executeQuery<any>(
        `SELECT id, iniciado_em, concluido_em, origem, total_clientes, coletados,
                erros, mensagens_novas, notificacoes_novas, reautenticacoes, mensagem_erro,
                procuracoes_lidas, procuracoes_alteradas,
                procuracoes_ganharam, procuracoes_perderam, spe_erro
         FROM det_coletas ORDER BY iniciado_em DESC LIMIT 1`
      );
      res.json({
        success: true,
        data: { emAndamento: coletaEmAndamento(), ultima: ultima ?? null },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? 'erro' });
    }
  }
}
