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
import EmailService from '../services/EmailService';
import {
  montarHtmlNotificacoesDet,
  TITULO_EMAIL_DET,
  type EmpresaComNotificacoes,
  type NotificacaoDet,
} from '../services/det.email';

/**
 * Domínio único dos destinatários — mesma regra do envio em conferências.
 *
 * Quem usa a tela é sempre alguém de dentro; aceitar endereço externo aqui
 * abriria caminho para a caixa postal de um cliente sair do escritório por um
 * erro de digitação.
 */
const DOMINIO_EMAIL = '@central-rnc.com.br';

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

      // Quando as procurações foram lidas do SPE com sucesso pela última vez.
      // Só coletas com procuracoes_lidas preenchido leram o SPE; se o SPE falha,
      // fica NULL. NÃO se usa verificado_em de det_procuracoes porque aquele
      // campo tem ON UPDATE CURRENT_TIMESTAMP e é tocado pelo marcarColeta a
      // cada cliente — não refletiria a checagem de procurações.
      const [proc] = await executeQuery<any>(
        `SELECT iniciado_em
         FROM det_coletas
         WHERE procuracoes_lidas IS NOT NULL
         ORDER BY iniciado_em DESC
         LIMIT 1`
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
          // data da última checagem de procurações bem-sucedida (SPE lido)
          procuracoesAtualizadasEm: proc?.iniciado_em ?? null,
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
           p.ultima_coleta_msgs,
           -- Quando o ACERVO que está na tela foi visto pela última vez.
           -- Difere de ultima_coleta_em: aquele é sobrescrito pela tentativa
           -- que FALHOU, e aí a data da coleta que de fato trouxe o dado se
           -- perderia — a linha ficava "falhou" ao lado de "1 notif." sem
           -- nada dizer que a notificação era de dias antes.
           n.visto_em
         FROM clientes c
         LEFT JOIN det_procuracoes p ON p.cnpj = c.cnpj_limpo
         LEFT JOIN (
           SELECT cnpj,
                  COUNT(*)                                    AS total,
                  SUM(nao_lida = 1)                           AS nao_lidas,
                  SUM(tipo = 'Notificação')                   AS notificacoes,
                  MAX(ultima_coleta_em)                       AS visto_em
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

  /**
   * POST /api/det/notificacoes/email — manda a lista de empresas com
   * notificação para alguém do escritório.
   *
   * O recorte é `tipo = 'Notificação'`, o MESMO do card e do filtro da tela —
   * Aviso não entra. Notificação já lida entra: abrir a mensagem no portal gera
   * ciência e inicia o prazo, então é justamente aí que ela precisa continuar
   * visível.
   *
   * A lista é relida do banco no momento do envio, e não recebida do navegador:
   * o que sai no e-mail é o estado real da base, não o que estava na tela de
   * quem clicou — que pode ser de horas atrás.
   */
  async enviarEmailNotificacoes(req: Request, res: Response): Promise<void> {
    const destinoBruto = String(req.body?.to ?? req.body?.email ?? '').trim();
    if (!destinoBruto) {
      res.status(400).json({
        success: false,
        message: `Informe o destinatário (ex: ti ou ti${DOMINIO_EMAIL}).`,
      });
      return;
    }
    // Aceita só o prefixo ("ti") ou o endereço inteiro — quem cola o endereço
    // completo não deve receber erro por isso.
    const destino = destinoBruto.includes('@')
      ? destinoBruto.toLowerCase()
      : `${destinoBruto.toLowerCase()}${DOMINIO_EMAIL}`;
    if (!destino.endsWith(DOMINIO_EMAIL)) {
      res.status(400).json({
        success: false,
        message: `Só é permitido enviar para endereços ${DOMINIO_EMAIL}`,
      });
      return;
    }

    try {
      // Uma linha por notificação, já na ordem em que o e-mail as consome
      // (mais recente primeiro dentro de cada cliente). O agrupamento fica em
      // JS: são ~150 linhas, e GROUP_CONCAT truncaria assunto a 1024 bytes.
      const rows = await executeQuery<any>(
        `SELECT c.cnpj_limpo AS cnpj,
                c.razao_social,
                n.assunto, n.remetente, n.data_texto, n.data_envio, n.nao_lida
         FROM det_notificacoes n
         JOIN clientes c ON c.cnpj_limpo = n.cnpj
         WHERE c.ativo = 1
           AND n.tipo = 'Notificação'
         ORDER BY c.razao_social ASC, n.data_envio DESC, n.id DESC`
      );

      const porCnpj = new Map<string, EmpresaComNotificacoes>();
      for (const r of rows) {
        let empresa = porCnpj.get(r.cnpj);
        if (!empresa) {
          empresa = { cnpj: r.cnpj, razao_social: r.razao_social, notificacoes: [] };
          porCnpj.set(r.cnpj, empresa);
        }
        empresa.notificacoes.push({
          assunto: r.assunto,
          remetente: r.remetente,
          data_texto: r.data_texto,
          data_envio: r.data_envio,
          nao_lida: r.nao_lida,
        } as NotificacaoDet);
      }
      const empresas = [...porCnpj.values()];
      const totalNotificacoes = rows.length;

      await EmailService.sendEmail({
        to: destino,
        // Contagem no assunto = empresas, que é a unidade da lista.
        subject: EmailService.montarAssunto(TITULO_EMAIL_DET, empresas.length),
        html: montarHtmlNotificacoesDet(empresas),
      });

      res.json({
        success: true,
        message: `E-mail enviado para ${destino}`,
        data: {
          destinatario: destino,
          empresas: empresas.length,
          notificacoes: totalNotificacoes,
        },
      });
    } catch (e: any) {
      console.error('[DET] falha ao enviar e-mail de notificações:', e?.message ?? e);
      res.status(500).json({
        success: false,
        message: e?.message ?? 'Não foi possível enviar o e-mail.',
      });
    }
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
