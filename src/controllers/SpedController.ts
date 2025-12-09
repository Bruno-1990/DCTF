import { Request, Response } from 'express';
import { SpedValidationService } from '../services/SpedValidationService';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

export class SpedController {
  private spedValidationService: SpedValidationService;

  constructor() {
    this.spedValidationService = new SpedValidationService();
  }

  /**
   * Inicia validação de SPED e XMLs
   * POST /api/sped/validar
   */
  async validar(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const { setor } = req.body;

      if (!files || !files.sped || files.sped.length === 0) {
        res.status(400).json({ error: 'Arquivo SPED é obrigatório' });
        return;
      }

      const spedFile = files.sped[0];
      const xmlFiles = files.xmls || [];

      // Gerar ID único para esta validação
      const validationId = uuidv4();

      // Iniciar processamento assíncrono
      this.spedValidationService.processarValidacao(
        validationId,
        spedFile.buffer,
        xmlFiles.map(f => f.buffer),
        setor
      ).catch((error) => {
        console.error(`Erro no processamento ${validationId}:`, error);
      });

      res.status(202).json({
        validationId,
        message: 'Validação iniciada',
        status: 'processing'
      });
    } catch (error: any) {
      console.error('Erro ao iniciar validação:', error);
      res.status(500).json({ 
        error: 'Erro ao iniciar validação',
        details: error.message 
      });
    }
  }

  /**
   * Obtém resultado da validação
   * GET /api/sped/validacao/:id
   */
  async obterResultado(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const resultado = await this.spedValidationService.obterResultado(id);
      const status = await this.spedValidationService.obterStatus(id);

      if (!status) {
        res.status(404).json({ error: 'Validação não encontrada' });
        return;
      }

      // Se há resultado, retornar; caso contrário, retornar status
      if (resultado) {
        res.json(resultado);
      } else {
        res.json({
          validationId: id,
          status: status.status,
          progress: status.progress,
          message: status.message,
          error: status.error
        });
      }
    } catch (error: any) {
      console.error('Erro ao obter resultado:', error);
      res.status(500).json({ 
        error: 'Erro ao obter resultado',
        details: error.message 
      });
    }
  }

  /**
   * Stream de progresso via Server-Sent Events
   * GET /api/sped/validacao/:id/progress
   */
  async streamProgress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Configurar SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Enviar progresso
      const interval = setInterval(async () => {
        try {
          const status = await this.spedValidationService.obterStatus(id);
          
          if (!status) {
            res.write(`data: ${JSON.stringify({ error: 'Validação não encontrada' })}\n\n`);
            clearInterval(interval);
            res.end();
            return;
          }

          res.write(`data: ${JSON.stringify(status)}\n\n`);

          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(interval);
            res.end();
          }
        } catch (error) {
          console.error('Erro ao enviar progresso:', error);
          clearInterval(interval);
          res.end();
        }
      }, 1000); // Atualizar a cada 1 segundo

      // Limpar intervalo quando cliente desconectar
      req.on('close', () => {
        clearInterval(interval);
      });
    } catch (error: any) {
      console.error('Erro no stream de progresso:', error);
      res.status(500).json({ 
        error: 'Erro no stream de progresso',
        details: error.message 
      });
    }
  }

  /**
   * Exporta resultado para Excel
   * GET /api/sped/validacao/:id/export/excel
   */
  async exportarExcel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const filePath = await this.spedValidationService.exportarExcel(id);

      if (!filePath) {
        res.status(404).json({ error: 'Arquivo não encontrado' });
        return;
      }

      res.download(filePath, `sped_validacao_${id}.xlsx`, (err) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        // Limpar arquivo temporário após envio
        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            console.error('Erro ao limpar arquivo temporário:', e);
          }
        }, 5000);
      });
    } catch (error: any) {
      console.error('Erro ao exportar Excel:', error);
      res.status(500).json({ 
        error: 'Erro ao exportar Excel',
        details: error.message 
      });
    }
  }

  /**
   * Exporta resultado para PDF
   * GET /api/sped/validacao/:id/export/pdf
   */
  async exportarPDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const filePath = await this.spedValidationService.exportarPDF(id);

      if (!filePath) {
        res.status(404).json({ error: 'Arquivo não encontrado' });
        return;
      }

      res.download(filePath, `sped_validacao_${id}.pdf`, (err) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        // Limpar arquivo temporário após envio
        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            console.error('Erro ao limpar arquivo temporário:', e);
          }
        }, 5000);
      });
    } catch (error: any) {
      console.error('Erro ao exportar PDF:', error);
      res.status(500).json({ 
        error: 'Erro ao exportar PDF',
        details: error.message 
      });
    }
  }

  /**
   * Lista histórico de validações
   * GET /api/sped/historico
   */
  async listarHistorico(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const historico = await this.spedValidationService.listarHistorico(
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json(historico);
    } catch (error: any) {
      console.error('Erro ao listar histórico:', error);
      res.status(500).json({ 
        error: 'Erro ao listar histórico',
        details: error.message 
      });
    }
  }

  /**
   * Deleta validação
   * DELETE /api/sped/validacao/:id
   */
  async deletarValidacao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.spedValidationService.deletarValidacao(id);
      res.json({ message: 'Validação deletada com sucesso' });
    } catch (error: any) {
      console.error('Erro ao deletar validação:', error);
      res.status(500).json({ 
        error: 'Erro ao deletar validação',
        details: error.message 
      });
    }
  }
}

