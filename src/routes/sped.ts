/**
 * Rotas para validação de SPED Fiscal
 * Endpoints para processamento e validação de arquivos SPED e XMLs
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { SpedValidationService } from '../services/SpedValidationService';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const spedValidationService = new SpedValidationService();

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB por arquivo
    files: 10001 // Máximo de 10001 arquivos (1 SPED + até 10000 XMLs)
  }
});

// Middleware de sanitização global
router.use(sanitizeData);

/**
 * POST /api/sped/detectar-setor
 * Detecta automaticamente o setor baseado no arquivo SPED e XMLs
 */
router.post('/detectar-setor', upload.fields([
  { name: 'sped', maxCount: 1 },
  { name: 'xmls', maxCount: 10000 }
]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files || !files.sped || files.sped.length === 0) {
      return res.status(400).json({
        error: 'Arquivo SPED é obrigatório'
      });
    }

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const execAsync = promisify(exec);

    // Salvar arquivos temporariamente
    const tmpDir = path.join(os.tmpdir(), 'sped_detection', `detection_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const tmpSpedPath = path.join(tmpDir, 'sped.txt');
    fs.writeFileSync(tmpSpedPath, files.sped[0].buffer);

    // Salvar XMLs se houver
    const xmlDir = path.join(tmpDir, 'xmls');
    if (files.xmls && files.xmls.length > 0) {
      fs.mkdirSync(xmlDir, { recursive: true });
      files.xmls.forEach((xml, index) => {
        const xmlPath = path.join(xmlDir, `xml_${index}.xml`);
        fs.writeFileSync(xmlPath, xml.buffer);
      });
    }

    // Executar script Python de detecção (atualizado para aceitar XMLs também)
    const pythonScript = path.join(__dirname, '../../python/sped/detectar_setor.py');
    const command = `python "${pythonScript}" "${tmpSpedPath}" "${xmlDir}"`;

    try {
      const { stdout } = await execAsync(command, {
        cwd: path.join(__dirname, '../../python/sped'),
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      const setor = stdout.trim();
      
      // Limpar arquivos temporários
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignorar erro ao deletar
      }

      if (setor) {
        res.json({ setor });
      } else {
        res.json({ setor: null });
      }
    } catch (execError: any) {
      // Limpar arquivos temporários em caso de erro
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignorar erro ao deletar
      }

      // Se não conseguir detectar, retornar null (não é erro)
      res.json({ setor: null });
    }
  } catch (error: any) {
    console.error('Erro ao detectar setor:', error);
    res.status(500).json({
      error: 'Erro ao detectar setor',
      message: error.message
    });
  }
});

/**
 * POST /api/sped/validar
 * Inicia validação de SPED e XMLs
 */
router.post('/validar', upload.fields([
  { name: 'sped', maxCount: 1 },
  { name: 'xmls', maxCount: 10000 }
]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files || !files.sped || files.sped.length === 0) {
      return res.status(400).json({
        error: 'Arquivo SPED é obrigatório'
      });
    }
    
    const spedFile = files.sped[0];
    const xmlFiles = files.xmls || [];
    
    // Obter setores (pode ser array ou string única para compatibilidade)
    let setores: string[] = [];
    if (Array.isArray(req.body.setores)) {
      setores = req.body.setores.filter((s: string) => s && s.trim() !== '');
    } else if (req.body.setor) {
      // Compatibilidade com formato antigo (string única)
      setores = [req.body.setor].filter((s: string) => s && s.trim() !== '');
    } else if (Array.isArray(req.body.setor)) {
      setores = req.body.setor.filter((s: string) => s && s.trim() !== '');
    }
    
    // Validar número de XMLs
    if (xmlFiles.length > 10000) {
      return res.status(400).json({
        error: `Número máximo de arquivos XML excedido. Máximo permitido: 10.000, recebido: ${xmlFiles.length}`
      });
    }

    // Validar tipo de arquivo SPED
    if (!spedFile.originalname.endsWith('.txt')) {
      return res.status(400).json({
        error: 'Arquivo SPED deve ser um arquivo .txt'
      });
    }

    // Gerar ID de validação
    const validationId = uuidv4();

    // Processar validação em background
    spedValidationService.processarValidacao(
      validationId,
      spedFile.buffer,
      xmlFiles.map(f => f.buffer),
      setores.length > 0 ? setores : undefined
    ).catch(error => {
      console.error(`Erro ao processar validação ${validationId}:`, error);
    });

    res.status(202).json({
      validationId,
      message: 'Validação iniciada com sucesso',
      status: 'processing'
    });
  } catch (error: any) {
    console.error('Erro ao iniciar validação:', error);
    
    // Tratamento específico para erros do Multer
    if (error.name === 'MulterError') {
      if (error.code === 'LIMIT_FILE_COUNT' || error.message.includes('Too many files')) {
        return res.status(400).json({
          error: 'Número máximo de arquivos excedido',
          message: 'O limite máximo é de 1 arquivo SPED e 10.000 arquivos XML (10.001 arquivos no total)'
        });
      }
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'Arquivo muito grande',
          message: 'O tamanho máximo por arquivo é de 50MB'
        });
      }
    }
    
    res.status(500).json({
      error: 'Erro ao iniciar validação',
      message: error.message
    });
  }
});

/**
 * GET /api/sped/validacao/:validationId
 * Obtém status e resultado da validação
 */
router.get('/validacao/:validationId', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;
    
    const status = await spedValidationService.obterStatus(validationId);
    
    if (!status) {
      return res.status(404).json({
        error: 'Validação não encontrada'
      });
    }

    // Se completou, retornar resultado completo
    if (status.status === 'completed') {
      const resultado = await spedValidationService.obterResultado(validationId);
      return res.json({
        ...status,
        resultado
      });
    }

    // Retornar status atual
    res.json(status);
  } catch (error: any) {
    console.error('Erro ao obter status da validação:', error);
    res.status(500).json({
      error: 'Erro ao obter status da validação',
      message: error.message
    });
  }
});

/**
 * GET /api/sped/validacao/:validationId/export/excel
 * Exporta resultado da validação para Excel
 */
router.get('/validacao/:validationId/export/excel', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;
    
    const filePath = await spedValidationService.exportarExcel(validationId);
    
    if (!filePath) {
      return res.status(404).json({
        error: 'Resultado não disponível para exportação'
      });
    }

    res.download(filePath, `sped_validacao_${validationId}.xlsx`, (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo Excel:', err);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Erro ao gerar arquivo Excel'
          });
        }
      }
    });
  } catch (error: any) {
    console.error('Erro ao exportar Excel:', error);
    res.status(500).json({
      error: 'Erro ao exportar resultado para Excel',
      message: error.message
    });
  }
});

/**
 * GET /api/sped/validacao/:validationId/export/pdf
 * Exporta resultado da validação para PDF
 */
router.get('/validacao/:validationId/export/pdf', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;
    
    const filePath = await spedValidationService.exportarPDF(validationId);
    
    if (!filePath) {
      return res.status(404).json({
        error: 'Resultado não disponível para exportação PDF'
      });
    }

    res.download(filePath, `sped_validacao_${validationId}.pdf`, (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Erro ao gerar arquivo PDF'
          });
        }
      }
    });
  } catch (error: any) {
    console.error('Erro ao exportar PDF:', error);
    res.status(500).json({
      error: 'Erro ao exportar resultado para PDF',
      message: error.message
    });
  }
});

/**
 * GET /api/sped/historico
 * Lista histórico de validações
 */
router.get('/historico', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const historico = await spedValidationService.listarHistorico(limit, offset);
    
    res.json(historico);
  } catch (error: any) {
    console.error('Erro ao listar histórico:', error);
    res.status(500).json({
      error: 'Erro ao listar histórico de validações',
      message: error.message
    });
  }
});

/**
 * DELETE /api/sped/validacao/:validationId
 * Deleta uma validação
 */
router.delete('/validacao/:validationId', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;
    
    await spedValidationService.deletarValidacao(validationId);
    
    res.json({
      message: 'Validação deletada com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao deletar validação:', error);
    res.status(500).json({
      error: 'Erro ao deletar validação',
      message: error.message
    });
  }
});

export default router;

