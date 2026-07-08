/**
 * Controlador de Benefícios Fiscais (Compete + Invest)
 */

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { BeneficiosService } from '../services/BeneficiosService';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xls', '.xlsx'].includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido. Use: .csv, .xls, .xlsx'));
  },
});

export const beneficiosUploadMiddleware = upload.single('arquivo');

export class BeneficiosController {
  private service = new BeneficiosService();

  // ─── Compete ───

  async listarCompete(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const busca = (req.query['busca'] as string) || undefined;
      res.json(await this.service.listarCompete(page, limit, busca));
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro listarCompete:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async importarCompete(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) { res.status(400).json({ error: 'Arquivo é obrigatório' }); return; }
      const result = await this.service.importarCompete(req.file.buffer, req.file.originalname);
      res.json({ success: true, message: `${result.importados} registro(s) importado(s).`, ...result });
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro importarCompete:', error);
      res.status(500).json({ error: error?.message || 'Erro ao importar' });
    }
  }

  async comparacaoCompete(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const busca = (req.query['busca'] as string) || undefined;
      res.json(await this.service.comparacaoCompete(page, limit, busca));
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro comparacaoCompete:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async limparCompete(_req: Request, res: Response): Promise<void> {
    try {
      await this.service.limparCompete();
      res.json({ success: true, message: 'Registros Compete excluídos.' });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  // ─── Invest ───

  async listarInvest(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const busca = (req.query['busca'] as string) || undefined;
      res.json(await this.service.listarInvest(page, limit, busca));
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro listarInvest:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async importarInvest(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) { res.status(400).json({ error: 'Arquivo é obrigatório' }); return; }
      const result = await this.service.importarInvest(req.file.buffer, req.file.originalname);
      res.json({ success: true, message: `${result.importados} registro(s) importado(s).`, ...result });
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro importarInvest:', error);
      res.status(500).json({ error: error?.message || 'Erro ao importar' });
    }
  }

  async comparacaoInvest(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const busca = (req.query['busca'] as string) || undefined;
      res.json(await this.service.comparacaoInvest(page, limit, busca));
    } catch (error: any) {
      console.error('[BENEFICIOS] Erro comparacaoInvest:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async limparInvest(_req: Request, res: Response): Promise<void> {
    try {
      await this.service.limparInvest();
      res.json({ success: true, message: 'Registros Invest excluídos.' });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }
}
