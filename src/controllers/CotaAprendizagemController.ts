/**
 * CotaAprendizagemController — endpoints da classificação de porte
 * (cota de aprendizagem). A regra e a coleta vivem no serviço; aqui só
 * validação de entrada e formato de resposta.
 */

import { Request, Response } from 'express';
import cotaAprendizagemService from '../services/CotaAprendizagemService';
import type { LinhaClassificacao } from '../services/CotaAprendizagemService';
import { buildStandardSheet } from '../services/reports/XlsxStandardSheet';
import type { ColumnFormat, CellValue } from '../services/reports/XlsxStandardSheet';
import { labelCompetencia, formatCnpj } from '../services/cotaAprendizagem.email';
import { normalizarPorteDeclarado, rotuloSituacao } from '../services/cotaAprendizagem.rules';

type LinhaExport = LinhaClassificacao;

/** Moeda com separador de milhar — é comparando valores que a planilha é usada. */
const FMT_MOEDA = 'R$ #,##0.00';

/**
 * `YYYY-MM-DD` → `Date` em UTC, ou `''` quando não há data.
 *
 * UTC pelo mesmo motivo de `dataParaIso` no serviço: montar a data em horário
 * local faz 01/09 virar 31/08 em fuso negativo — justamente a data em que a
 * cota passa a ser exigível.
 */
function dataParaCelula(iso: string | null): Date | string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Códigos gravados no banco (estáveis, pesquisáveis) viram frase na planilha,
 * igual à tela — quem abre o Excel está conferindo obrigação fiscal, não lendo
 * enum de sistema.
 */
const ROTULO_MOTIVO: Record<string, string> = {
  RBAA: 'Receita do ano anterior',
  EXCESSO_20PCT: 'Excedeu os 20%',
  SEM_DADOS: 'Sem dados suficientes',
};

const ROTULO_RESSALVA: Record<string, string> = {
  SOCIO_PJ: 'Sócio pessoa jurídica',
  SIMPLES_ACIMA_TETO: 'Simples acima do teto',
  INICIO_ATIVIDADE: 'Limite proporcional (aberta no ano)',
  RECEITA_ZERADA_ANTERIOR: 'Ano anterior zerado no SCI',
  RECEITA_ZERADA_CORRENTE: 'Ano atual zerado no SCI',
  SEM_FATURAMENTO_SCI: 'Sem faturamento no SCI (dois anos)',
  MATRIZ_NAO_CADASTRADA: 'Matriz não cadastrada (filial representa a PJ)',
};

export class CotaAprendizagemController {
  /**
   * Reaplica as regras sobre o faturamento já coletado.
   *
   * Síncrono, ao contrário de `sincronizar`: sem o SCI no caminho, a operação é
   * questão de segundos mesmo com a base inteira — e responder com o resultado
   * pronto evita que a tela tenha de ficar consultando status para saber se
   * pode recarregar.
   */
  async reclassificar(req: Request, res: Response): Promise<void> {
    try {
      const { bdref, clienteIds } = req.body ?? {};
      if (clienteIds !== undefined && !Array.isArray(clienteIds)) {
        res.status(400).json({ success: false, error: 'clienteIds deve ser um array' });
        return;
      }
      const resumo = await cotaAprendizagemService.reclassificar({
        ...(bdref !== undefined ? { bdref: Number(bdref) } : {}),
        ...(Array.isArray(clienteIds) ? { clienteIds } : {}),
      });
      res.json({ success: true, data: resumo });
    } catch (error: any) {
      const status = error?.status || 500;
      console.error('[COTA] Erro reclassificar:', error);
      res.status(status).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  /**
   * Dispara a apuração. Responde 202 e roda em background.
   *
   * A apuração percorre todos os clientes com código SCI consultando uma
   * procedure lenta e serializada por lock — leva de minutos a horas. Um
   * request síncrono morreria no proxy antes de terminar, então o cliente
   * acompanha por GET /status.
   */
  async sincronizar(req: Request, res: Response): Promise<void> {
    try {
      const { clienteIds, ano, mes, enviarEmail } = req.body ?? {};

      if (cotaAprendizagemService.status.rodando) {
        res.status(409).json({
          success: false,
          error: 'Já existe uma sincronização em andamento.',
          status: cotaAprendizagemService.status,
        });
        return;
      }

      if (clienteIds !== undefined && !Array.isArray(clienteIds)) {
        res.status(400).json({ success: false, error: 'clienteIds deve ser um array' });
        return;
      }

      const mesReferencia =
        ano !== undefined && mes !== undefined
          ? { ano: Number(ano), mes: Number(mes) }
          : undefined;

      if (mesReferencia && (!mesReferencia.ano || mesReferencia.mes < 1 || mesReferencia.mes > 12)) {
        res.status(400).json({ success: false, error: 'ano/mes de referência inválidos' });
        return;
      }

      // Sem await de propósito: a resposta sai antes de a apuração terminar.
      void cotaAprendizagemService
        .sincronizar({
          clienteIds: Array.isArray(clienteIds) ? clienteIds : undefined,
          mesReferencia,
          enviarEmail: enviarEmail === true,
        })
        .catch((err: any) => {
          console.error('[COTA] Erro na sincronização:', err?.message || err);
        });

      res.status(202).json({
        success: true,
        iniciado: true,
        message: 'Sincronização iniciada. Acompanhe em GET /api/cota-aprendizagem/status.',
      });
    } catch (error: any) {
      console.error('[COTA] Erro sincronizar:', error);
      res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  async status(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, data: cotaAprendizagemService.status });
    } catch (error: any) {
      console.error('[COTA] Erro status:', error);
      res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  async classificacao(req: Request, res: Response): Promise<void> {
    try {
      const bdrefParam = req.query['bdref'];
      const bdref = bdrefParam !== undefined ? Number(bdrefParam) : undefined;
      if (bdref !== undefined && !Number.isFinite(bdref)) {
        res.status(400).json({ success: false, error: 'bdref inválido' });
        return;
      }
      const data = await cotaAprendizagemService.classificacao(bdref);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('[COTA] Erro classificacao:', error);
      res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  async historico(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = req.params['clienteId'];
      if (!clienteId) {
        res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        return;
      }
      const anoParam = req.query['ano'];
      const ano = anoParam !== undefined ? Number(anoParam) : undefined;
      // ?todos=1 devolve todos os anos coletados; por padrão vem só a janela
      // que a regra usa (ano corrente + anterior fechado).
      const todos = req.query['todos'] === '1' || req.query['todos'] === 'true';
      const data = await cotaAprendizagemService.historico(clienteId, ano, todos);
      res.json({ success: true, data });
    } catch (error: any) {
      const status = error?.status || 500;
      console.error('[COTA] Erro historico:', error);
      res.status(status).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  /**
   * Dispara os avisos da competência.
   *
   * Sem `tipo`, manda os DOIS (enquadramento para o Fiscal, cota para o
   * Departamento Pessoal) e devolve um resultado por aviso. Com `tipo`, manda
   * só aquele — útil para reenviar um que falhou sem incomodar o outro time.
   */
  async enviarAviso(req: Request, res: Response): Promise<void> {
    try {
      const { bdref, destinatarios, forcar, tipo } = req.body ?? {};
      const tipoNormalizado = String(tipo ?? '').toUpperCase();
      if (tipo !== undefined && tipoNormalizado !== 'ENQUADRAMENTO' && tipoNormalizado !== 'COTA') {
        res
          .status(400)
          .json({ success: false, error: 'tipo deve ser ENQUADRAMENTO ou COTA' });
        return;
      }
      const resultado = await cotaAprendizagemService.enviarResumoMensal({
        bdref: bdref !== undefined ? Number(bdref) : undefined,
        destinatarios: Array.isArray(destinatarios) ? destinatarios : undefined,
        forcar: forcar === true,
        ...(tipo !== undefined ? { tipo: tipoNormalizado as 'ENQUADRAMENTO' | 'COTA' } : {}),
      });
      res.json({ success: true, data: resultado });
    } catch (error: any) {
      console.error('[COTA] Erro enviarAviso:', error);
      res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }

  /**
   * Exporta a competência em XLSX.
   *
   * Gerado no servidor com o mesmo helper das outras planilhas do sistema
   * (`buildStandardSheet`) — evita mandar o dataset inteiro ao browser e
   * replicar formatação no frontend.
   */
  async exportar(req: Request, res: Response): Promise<void> {
    try {
      const bdrefParam = req.query['bdref'];
      const bdref = bdrefParam !== undefined ? Number(bdrefParam) : undefined;
      const dados = await cotaAprendizagemService.classificacao(bdref);

      if (!dados.bdref) {
        res.status(404).json({ success: false, error: 'Nenhuma apuração encontrada' });
        return;
      }

      const ano = Math.floor(dados.bdref / 100);
      const mes = dados.bdref % 100;

      // Colunas agrupadas pelo que respondem: quem é a empresa, em que faixa
      // está, o que isso implica na cota, de onde saiu o número e o que ficou
      // em aberto. Antes vinham 22 colunas na ordem em que existiam no banco.
      const colunas: Array<{
        titulo: string;
        valor: (c: LinhaExport) => CellValue;
        fmt?: ColumnFormat;
      }> = [
        // ── Identificação ──
        {
          titulo: 'Razão Social',
          valor: (c) => c.razao_social,
          fmt: { align: 'center', width: 42 },
        },
        { titulo: 'CNPJ', valor: (c) => formatCnpj(c.cnpj), fmt: { align: 'center', width: 20 } },
        {
          titulo: 'SCI',
          valor: (c) => c.codigo_sci ?? '',
          fmt: { align: 'center', width: 8 },
        },
        { titulo: 'UF', valor: (c) => c.uf ?? '', fmt: { align: 'center', width: 6 } },

        // ── Enquadramento ──
        { titulo: 'Porte apurado', valor: (c) => c.porte, fmt: { align: 'center', width: 14 } },
        {
          titulo: 'Porte na Receita',
          valor: (c) => c.porte_declarado ?? '',
          fmt: { align: 'center', width: 24 },
        },
        {
          // A mesma frase da tela, e pelo mesmo motivo: "Permanece" só quando a
          // empresa já está no porte em que deveria estar. Enquanto a Receita
          // registrar outro porte, a coluna descreve a providência que falta,
          // não o prazo — senão a planilha declara que está tudo no lugar
          // justamente nas linhas que precisam de alguém.
          titulo: 'Situação',
          valor: (c) =>
            rotuloSituacao({
              situacao: c.diagnostico.situacao,
              porteApurado: c.porte,
              declarado: normalizarPorteDeclarado(c.porte_declarado),
              sociedadeAdvogados: c.sociedade_advogados,
            }),
          fmt: { align: 'center', width: 24 },
        },
        {
          titulo: 'Muda para',
          valor: (c) => c.diagnostico.proximoPorte ?? '',
          fmt: { align: 'center', width: 12 },
        },
        {
          titulo: 'A partir de',
          // Data de verdade, não texto: assim o Excel ordena e filtra por
          // período. Célula vazia quando não há data — "—" viraria um valor
          // como outro qualquer na coluna e sujaria o filtro.
          valor: (c) => dataParaCelula(c.data_efeito),
          fmt: { numFmt: 'dd/mm/yyyy', align: 'center', width: 13 },
        },

        // ── Cota ──
        {
          // Tri-estado: "Não" diria "verificamos e está isenta", que é
          // diferente de "não foi possível concluir".
          titulo: 'Sujeita à cota',
          valor: (c) =>
            c.sujeita_cota === null ? 'A conferir' : c.sujeita_cota ? 'Sujeita' : 'Isenta',
          fmt: { align: 'center', width: 15 },
        },

        // ── Receita que sustenta a conclusão ──
        {
          titulo: `Receita ${ano - 1}`,
          valor: (c) => c.rbaa,
          fmt: { numFmt: FMT_MOEDA, align: 'right', width: 18 },
        },
        {
          titulo: `Receita ${ano} (até ${String(mes).padStart(2, '0')}/${ano})`,
          valor: (c) => c.rba,
          fmt: { numFmt: FMT_MOEDA, align: 'right', width: 22 },
        },
        {
          titulo: 'Base do porte',
          valor: (c) => ROTULO_MOTIVO[c.motivo] ?? c.motivo,
          fmt: { align: 'center', width: 24 },
        },
        {
          titulo: 'Mês que passou de R$ 4,8 mi',
          valor: (c) => c.mes_excesso_limite ?? '',
          fmt: { align: 'center', width: 14 },
        },
        {
          titulo: 'Mês que passou de R$ 5,76 mi',
          valor: (c) => c.mes_excesso_20pct ?? '',
          fmt: { align: 'center', width: 14 },
        },

        // ── Movimento do mês ──
        {
          titulo: 'Mudou de porte',
          valor: (c) => (c.mudou ? 'Sim' : ''),
          fmt: { align: 'center', width: 14 },
        },
        {
          titulo: 'Porte anterior',
          valor: (c) => c.porte_anterior ?? '',
          fmt: { align: 'center', width: 14 },
        },

        // ── O que ficou em aberto ──
        {
          titulo: 'Ressalvas',
          valor: (c) =>
            c.revisar_motivos.map((m) => ROTULO_RESSALVA[m] ?? m).join('; ') ||
            (c.revisar_juridico ? 'Revisar' : ''),
          fmt: { align: 'center', width: 34 },
        },
        {
          titulo: 'Meses sem dado',
          valor: (c) => c.meses_faltantes || '',
          fmt: { align: 'center', width: 14 },
        },
      ];

      const buffer = await buildStandardSheet({
        sheetName: `Enquadramento ${String(mes).padStart(2, '0')}-${ano}`,
        titulo: `Enquadramento de Porte — ${labelCompetencia(ano, mes)}`,
        subtitulo:
          `${dados.resumo.total} cliente(s) · ${dados.resumo.sujeitas} sujeita(s) à cota · ` +
          `${dados.resumo.isentas} isenta(s) · ${dados.resumo.semDados} sem dados. ` +
          'Receita bruta consolidada (matriz + filiais) apurada do faturamento do SCI.',
        headers: colunas.map((c) => c.titulo),
        columnFormats: colunas.map((c) => c.fmt),
        rows: dados.clientes.map((c) => colunas.map((col) => col.valor(c))),
      });

      const nomeArquivo = `Enquadramento_de_Porte_${dados.bdref}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('[COTA] Erro exportar:', error);
      res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
    }
  }
}

export default CotaAprendizagemController;
