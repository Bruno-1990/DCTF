import { Request, Response } from 'express';
import { ConferenciaService } from '../services/ConferenciaService';

export class ConferenciaController {
  private service = new ConferenciaService();

  async resumo(req: Request, res: Response) {
    try {
      const { cnpj, clienteId, inicio, fim } = req.query as any;
      const data = await this.service.getResumo({ cnpj, clienteId, inicio, fim });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Falha ao carregar resumo de conferências', details: error?.message });
    }
  }

  async detalhe(req: Request, res: Response) {
    try {
      const { cnpj, competencia } = req.query as any;
      if (!cnpj || !competencia) {
        res.status(400).json({ success: false, error: 'Parâmetros cnpj e competencia são obrigatórios' });
        return;
      }
      const data = await this.service.getDetalhe({ cnpj, competencia });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Falha ao carregar detalhe de conferência', details: error?.message });
    }
  }
}


