/**
 * Controlador para Validação de Planilhas DCTF
 * Gerencia upload, validação e processamento de planilhas
 */

import { Request, Response } from 'express';
import { DCTFSpreadsheetService } from '../services/DCTFSpreadsheetService';
import multer from 'multer';
import path from 'path';

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xls', '.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido. Use: ${allowedTypes.join(', ')}`));
    }
  }
});

export class SpreadsheetController {
  /**
   * POST /api/spreadsheet/validate
   * Validar arquivo de planilha DCTF
   */
  static async validateFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Arquivo é obrigatório'
        });
        return;
      }

      const { filename, mimetype, size, buffer } = req.file;

      // Validar arquivo
      const fileValidation = DCTFSpreadsheetService.validateFile(buffer, filename);
      
      if (!fileValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Arquivo inválido',
          details: fileValidation.errors,
          warnings: fileValidation.warnings
        });
        return;
      }

      // Processar planilha
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);

      res.json({
        success: result.isValid,
        data: {
          metadados: result.metadados,
          totalLinhas: result.dados.length,
          dados: result.dados.slice(0, 10) // Primeiras 10 linhas para preview
        },
        errors: result.errors,
        warnings: result.warnings
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/spreadsheet/upload
   * Upload e processamento completo de planilha DCTF
   */
  static async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Arquivo é obrigatório'
        });
        return;
      }

      const { filename, buffer } = req.file;
      const { clienteId, periodo } = req.body;

      if (!clienteId || !periodo) {
        res.status(400).json({
          success: false,
          error: 'clienteId e periodo são obrigatórios'
        });
        return;
      }

      // Processar planilha
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);

      if (!result.isValid) {
        res.status(400).json({
          success: false,
          error: 'Planilha inválida',
          details: result.errors,
          warnings: result.warnings
        });
        return;
      }

      // TODO: Salvar dados no banco
      // Aqui seria onde os dados processados seriam salvos no banco de dados

      res.json({
        success: true,
        data: {
          metadados: result.metadados,
          totalLinhas: result.dados.length,
          processadas: result.dados.length,
          clienteId,
          periodo
        },
        warnings: result.warnings
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/spreadsheet/template
   * Download do template de planilha DCTF
   */
  static async downloadTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = DCTFSpreadsheetService.gerarTemplate();
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="template_dctf.xlsx"');
      res.send(template);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/spreadsheet/export
   * Exportar dados para planilha
   */
  static async exportData(req: Request, res: Response): Promise<void> {
    try {
      const { dados } = req.body;

      if (!dados || !Array.isArray(dados)) {
        res.status(400).json({
          success: false,
          error: 'Dados são obrigatórios e devem ser um array'
        });
        return;
      }

      const planilha = DCTFSpreadsheetService.exportarParaPlanilha(dados);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="dctf_exportado.xlsx"');
      res.send(planilha);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/spreadsheet/validation-rules
   * Obter regras de validação de planilhas
   */
  static async getValidationRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = {
        colunasObrigatorias: [
          { nome: 'codigo', tipo: 'string', obrigatoria: true, descricao: 'Código DCTF' },
          { nome: 'descricao', tipo: 'string', obrigatoria: true, descricao: 'Descrição do item' },
          { nome: 'valor', tipo: 'number', obrigatoria: true, descricao: 'Valor monetário' },
          { nome: 'periodo', tipo: 'string', obrigatoria: true, descricao: 'Período (YYYY-MM)' },
          { nome: 'data_ocorrencia', tipo: 'date', obrigatoria: true, descricao: 'Data da ocorrência' },
          { nome: 'cnpj_cpf', tipo: 'string', obrigatoria: true, descricao: 'CNPJ ou CPF' },
          { nome: 'codigo_receita', tipo: 'string', obrigatoria: false, descricao: 'Código de receita' },
          { nome: 'observacoes', tipo: 'string', obrigatoria: false, descricao: 'Observações' }
        ],
        tiposPermitidos: ['.xls', '.xlsx', '.csv'],
        tamanhoMaximo: '10MB',
        formatos: {
          codigo: '3 dígitos (ex: 001, 101, 201)',
          periodo: 'YYYY-MM (ex: 2024-01)',
          data_ocorrencia: 'DD/MM/YYYY ou YYYY-MM-DD',
          cnpj_cpf: '11 dígitos (CPF) ou 14 dígitos (CNPJ)',
          codigo_receita: 'X.X.X.XX.XX (ex: 1.1.1.01.01)'
        },
        exemplos: {
          codigo: ['001', '101', '201', '301'],
          periodo: ['2024-01', '2024-02', '2024-12'],
          data_ocorrencia: ['15/01/2024', '2024-01-15'],
          cnpj_cpf: ['12345678901', '12345678000195'],
          codigo_receita: ['1.1.1.01.01', '1.1.2.01.01']
        }
      };

      res.json({
        success: true,
        data: rules
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/spreadsheet/validate-batch
   * Validar múltiplos arquivos
   */
  static async validateBatch(req: Request, res: Response): Promise<void> {
    try {
      const { arquivos } = req.body;

      if (!arquivos || !Array.isArray(arquivos)) {
        res.status(400).json({
          success: false,
          error: 'Lista de arquivos é obrigatória'
        });
        return;
      }

      const results = [];

      for (const arquivo of arquivos) {
        try {
          const { nome, conteudo } = arquivo;
          const buffer = Buffer.from(conteudo, 'base64');
          
          const result = await DCTFSpreadsheetService.processarPlanilha(buffer, nome);
          
          results.push({
            nome,
            valido: result.isValid,
            totalLinhas: result.dados.length,
            erros: result.errors,
            avisos: result.warnings
          });
        } catch (error: any) {
          results.push({
            nome: arquivo.nome,
            valido: false,
            erro: error.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          total: arquivos.length,
          validos: results.filter(r => r.valido).length,
          invalidos: results.filter(r => !r.valido).length,
          resultados: results
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

// Middleware de upload
export const uploadMiddleware = upload.single('arquivo');
