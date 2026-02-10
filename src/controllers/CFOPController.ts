/**
 * Controlador para dados de CFOP de saída (relatório Gelden / extração mensal e anual).
 * Expõe listagem para a aba Clientes / CFOP.
 */

import { Request, Response } from 'express';
import { extrairCFOPCompletoDePdf } from '../services/CFOPPdfExtractorService';

export interface CFOPMensalRow {
  ano: number | null;
  mes: number | null;
  cfop: string;
  descricao: string;
  valor: number;
}

export interface CFOPAnualRow {
  ano: number;
  cfop: string;
  descricao: string;
  valor_soma: number;
}

export class CFOPController {
  /**
   * GET /api/cfop/entrada
   * Lista CFOP de entrada (mensal) e opcionalmente soma anual.
   * CFOP de entrada: 1.xxx, 2.xxx, 3.xxx.
   * Por enquanto retorna listas vazias; quando houver tabela/importação, preencher a partir do banco.
   */
  async listarEntrada(req: Request, res: Response): Promise<void> {
    try {
      const ano = req.query.ano != null ? Number(req.query.ano) : undefined;
      const mes = req.query.mes != null ? Number(req.query.mes) : undefined;

      // TODO: quando existir tabela cfop_entrada ou importação, buscar do banco
      const items: CFOPMensalRow[] = [];
      const somaAnual: CFOPAnualRow[] = [];

      res.status(200).json({
        items,
        somaAnual,
      });
    } catch (error: any) {
      console.error('[CFOP] Erro ao listar CFOP de entrada:', error);
      res.status(500).json({
        error: error?.message || 'Erro ao listar CFOP de entrada',
      });
    }
  }

  /**
   * GET /api/cfop/saida
   * Lista CFOP de saída (mensal) e opcionalmente soma anual.
   * Query: ano (opcional), mes (opcional).
   * Por enquanto retorna listas vazias; quando houver tabela/importação, preencher a partir do banco.
   */
  async listarSaida(req: Request, res: Response): Promise<void> {
    try {
      const ano = req.query.ano != null ? Number(req.query.ano) : undefined;
      const mes = req.query.mes != null ? Number(req.query.mes) : undefined;

      // TODO: quando existir tabela cfop_saida ou importação, buscar do banco
      const items: CFOPMensalRow[] = [];
      const somaAnual: CFOPAnualRow[] = [];

      res.status(200).json({
        items,
        somaAnual,
      });
    } catch (error: any) {
      console.error('[CFOP] Erro ao listar CFOP de saída:', error);
      res.status(500).json({
        error: error?.message || 'Erro ao listar CFOP de saída',
      });
    }
  }

  /**
   * POST /api/cfop/upload-pdf
   * Recebe um único PDF, extrai CFOP de entrada (1.xxx, 2.xxx, 3.xxx) e de saída (5.xxx, 6.xxx, 7.xxx)
   * e retorna { entrada: { items, somaAnual }, saida: { items, somaAnual } } para preencher ambas as abas.
   */
  async uploadPdf(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file?.buffer) {
        res.status(400).json({ error: 'Envie um arquivo PDF (campo "pdf").' });
        return;
      }
      const { entrada, saida } = await extrairCFOPCompletoDePdf(file.buffer);
      res.status(200).json({ entrada, saida });
    } catch (error: any) {
      console.error('[CFOP] Erro ao extrair CFOP do PDF:', error);
      res.status(500).json({
        error: error?.message || 'Erro ao processar o PDF',
      });
    }
  }
}
