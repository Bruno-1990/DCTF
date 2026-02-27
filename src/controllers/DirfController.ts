/**
 * Controller para o módulo DIRF: parse de XMLs eSocial S-5002 e agregação por CPF/mês/ano.
 */

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { parseAndAggregate, TP_INFO_IR_DESCRICAO } from '../services/dirf';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB por arquivo
    files: 100,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xml') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xml são permitidos.'));
    }
  },
});

export const dirfUploadMiddleware = upload.array('arquivos', 100);

export class DirfController {
  /**
   * POST /api/dirf/parse
   * Recebe múltiplos XMLs (multipart arquivos[]), processa S-5002 e retorna agregação por CPF, mês e ano.
   */
  static async parse(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Nenhum arquivo enviado. Envie um ou mais arquivos .xml (campo: arquivos).',
        });
        return;
      }

      const inputs = files.map((f) => ({
        nome: f.originalname,
        conteudo: f.buffer.toString('utf-8'),
      }));

      const result = parseAndAggregate(inputs);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao processar XMLs DIRF.';
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * GET /api/dirf/verbas
   * Retorna o mapa de códigos tpInfoIR → descrição (para exibição na UI).
   */
  static verbas(_req: Request, res: Response): void {
    res.status(200).json({ success: true, data: TP_INFO_IR_DESCRICAO });
  }
}
