/**
 * Controlador para Validação de Planilhas DCTF
 * Gerencia upload, validação e processamento de planilhas
 */

import { Request, Response } from 'express';
import { DCTFSpreadsheetService } from '../services/DCTFSpreadsheetService';
import { ValidationService } from '../services/ValidationService';
import multer from 'multer';
import path from 'path';
import { UploadHistory } from '../models/UploadHistory';
import { Cliente } from '../models/Cliente';
import { DCTFDados } from '../models/DCTFDados';

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

interface UploadHistoryItem {
  id: string;
  clienteId: string;
  periodo: string;
  filename: string;
  totalLinhas: number;
  processadas: number;
  status: 'sucesso' | 'erro';
  mensagem?: string;
  timestamp: string; // ISO
}

export class SpreadsheetController {
  private static uploadsHistory: UploadHistoryItem[] = [];
  private static historyModel = new UploadHistory();
  private static dctfDadosModel = new DCTFDados();

  /**
   * POST /api/spreadsheet/validate
   * Validar arquivo de planilha DCTF
   */
  static async validateFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo é obrigatório' });
        return;
      }

      const { filename, buffer } = req.file;

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

      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);

      // Formatar datas de ocorrência em pt-BR no preview (se existir campo data_ocorrencia)
      // Apenas linhas válidas no preview
      const validRows = (result.dados || []).filter((r: any) => r.__valid);
      const preview = validRows.slice(0, 10).map((row: any) => {
        const clone = { ...row };
        if (clone.data_ocorrencia) {
          clone.data_ocorrencia = ValidationService.formatData(clone.data_ocorrencia);
        }
        // Remover metadados internos do preview
        delete clone.__valid;
        return clone;
      });

      res.json({
        success: result.isValid,
        data: {
          metadados: result.metadados,
          totalLinhas: result.dados.length,
          validos: validRows.length,
          invalidos: result.dados.length - validRows.length,
          dados: preview
        },
        errors: result.errors,
        warnings: result.warnings
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/spreadsheet/upload
   */
  static async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo é obrigatório' });
        return;
      }

      const { filename, buffer } = req.file;
      const { clienteId, periodo } = req.body;

      if (!clienteId || !periodo) {
        res.status(400).json({ success: false, error: 'clienteId e periodo são obrigatórios' });
        return;
      }

      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);

      // tentar obter nome do cliente
      let clienteNome: string | undefined = undefined;
      try {
        const clienteModel = new Cliente();
        const c = await clienteModel.findById(clienteId);
        if (c.success && c.data) clienteNome = c.data.nome;
      } catch {}

      if (!result.isValid) {
        const record = {
          clienteId,
          clienteNome,
          periodo,
          filename,
          totalLinhas: 0,
          processadas: 0,
          status: 'erro' as const,
          mensagem: (result.errors || []).join(', '),
          timestamp: new Date().toISOString(),
        };
        await SpreadsheetController.historyModel.add(record);
        SpreadsheetController.uploadsHistory.unshift({ id: Date.now().toString(), ...record });
        SpreadsheetController.uploadsHistory = SpreadsheetController.uploadsHistory.slice(0, 200);

        res.status(400).json({ success: false, error: 'Planilha inválida', details: result.errors, warnings: result.warnings });
        return;
      }

      const record = {
        clienteId,
        clienteNome,
        periodo,
        filename,
        totalLinhas: result.dados.length,
        processadas: result.dados.length,
        status: 'sucesso' as const,
        timestamp: new Date().toISOString(),
      };
      await SpreadsheetController.historyModel.add(record);
      SpreadsheetController.uploadsHistory.unshift({ id: Date.now().toString(), ...record });
      SpreadsheetController.uploadsHistory = SpreadsheetController.uploadsHistory.slice(0, 200);

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
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/spreadsheet/template
   */
  static async downloadTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = DCTFSpreadsheetService.gerarTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="template_dctf.xlsx"');
      res.send(template);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/spreadsheet/export
   */
  static async exportData(req: Request, res: Response): Promise<void> {
    try {
      const { dados } = req.body;
      if (!dados || !Array.isArray(dados)) {
        res.status(400).json({ success: false, error: 'Dados são obrigatórios e devem ser um array' });
        return;
      }
      const planilha = DCTFSpreadsheetService.exportarParaPlanilha(dados);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="dctf_exportado.xlsx"');
      res.send(planilha);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/spreadsheet/import
   * Importar e persistir dados válidos em lotes
   * Body: arquivo (multipart/form-data), declaracaoId, chunkSize?
   */
  static async importData(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo é obrigatório' });
        return;
      }
      const { filename, buffer } = req.file;
      const { declaracaoId, chunkSize = 1000 } = req.body as any;

      if (!declaracaoId) {
        res.status(400).json({ success: false, error: 'declaracaoId é obrigatório' });
        return;
      }

      // Processar planilha
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);
      const validRows = (result.dados || []).filter((r: any) => r.__valid);

      // Mapear para o modelo DCTFDados (somente colunas suportadas)
      const rowsToInsert = validRows.map((r: any) => {
        const dataOc = r.data_ocorrencia ? ValidationService.normalizeDate(r.data_ocorrencia) : null;
        return {
          declaracaoId,
          linha: typeof r.linha === 'number' ? r.linha : undefined,
          codigo: r.codigo ? String(r.codigo).trim().toUpperCase() : undefined,
          descricao: r.descricao ? String(r.descricao) : undefined,
          valor: typeof r.valor === 'number' ? r.valor : Number(r.valor ?? 0),
          dataOcorrencia: dataOc || undefined,
          observacoes: r.observacoes ? String(r.observacoes) : undefined,
        };
      });

      // Inserir em chunks
      const size = Math.max(1, Math.min(5000, Number(chunkSize)));
      let persisted = 0;
      let failed = 0;
      const errors: string[] = [];
      for (let i = 0; i < rowsToInsert.length; i += size) {
        const chunk = rowsToInsert.slice(i, i + size);
        const resp = await SpreadsheetController.dctfDadosModel.createBulkDCTFDados(chunk);
        if (resp.success) {
          persisted += (resp.data?.length || 0);
        } else {
          failed += chunk.length;
          if (resp.error) errors.push(resp.error);
        }
      }

      res.json({
        success: errors.length === 0,
        data: {
          totalLinhasArquivo: result.dados.length,
          validos: validRows.length,
          invalidos: result.dados.length - validRows.length,
          persisted,
          failed,
          chunkSize: size,
        },
        errors: result.errors.concat(errors),
        warnings: result.warnings,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/spreadsheet/import-json
   * Body: { declaracaoId: string, dados: Array<{ codigo, descricao, valor, dataOcorrencia, observacoes? } & extras> }
   */
  static async importJson(req: Request, res: Response): Promise<void> {
    try {
      const { declaracaoId, dados } = req.body as any;
      if (!declaracaoId) {
        res.status(400).json({ success: false, error: 'declaracaoId é obrigatório' });
        return;
      }
      if (!Array.isArray(dados) || dados.length === 0) {
        res.status(400).json({ success: false, error: 'Campo "dados" é obrigatório e deve ser um array não-vazio' });
        return;
      }

      // Validação e mapeamento básico
      const rowsToInsert = (dados as any[]).map((r) => ({
        declaracaoId,
        linha: typeof r.linha === 'number' ? r.linha : undefined,
        codigo: r.codigo ? String(r.codigo).trim().toUpperCase() : undefined,
        descricao: r.descricao ? String(r.descricao) : undefined,
        valor: typeof r.valor === 'number' ? r.valor : Number(r.valor ?? 0),
        dataOcorrencia: r.dataOcorrencia ? ValidationService.normalizeDate(r.dataOcorrencia) : undefined,
        observacoes: r.observacoes ? String(r.observacoes) : undefined,
      }));

      const resp = await SpreadsheetController.dctfDadosModel.createBulkDCTFDados(rowsToInsert);
      if (!resp.success) {
        res.status(400).json({ success: false, error: resp.error || 'Falha ao inserir dados' });
        return;
      }

      res.json({ success: true, data: { persisted: resp.data?.length || rowsToInsert.length } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/spreadsheet/validation-rules
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

      res.json({ success: true, data: rules });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/spreadsheet/validate-batch
   */
  static async validateBatch(req: Request, res: Response): Promise<void> {
    try {
      const { arquivos } = req.body;
      if (!arquivos || !Array.isArray(arquivos)) {
        res.status(400).json({ success: false, error: 'Lista de arquivos é obrigatória' });
        return;
      }

      const results = [] as any[];
      for (const arquivo of arquivos) {
        try {
          const { nome, conteudo } = arquivo;
          const buffer = Buffer.from(conteudo, 'base64');
          const result = await DCTFSpreadsheetService.processarPlanilha(buffer, nome);
          results.push({ nome, valido: result.isValid, totalLinhas: result.dados.length, erros: result.errors, avisos: result.warnings });
        } catch (error: any) {
          results.push({ nome: arquivo.nome, valido: false, erro: error.message });
        }
      }

      res.json({ success: true, data: { total: arquivos.length, validos: results.filter(r => r.valido).length, invalidos: results.filter(r => !r.valido).length, resultados: results } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/spreadsheet/uploads
   */
  static async getUploadsHistory(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, clienteId, periodo } = req.query as any;

      // Se supabase, usar modelo; caso contrário, memória
      if (process.env['SUPABASE_URL'] && process.env['SUPABASE_URL'] !== '') {
        const result = await SpreadsheetController.historyModel.list({ page: Number(page), limit: Number(limit), clienteId, periodo });
        if (!result.success || !result.data) {
          res.status(500).json({ success: false, error: result.error || 'Erro ao consultar histórico' });
          return;
        }
        const { items, total } = result.data;
        const itemsPtBr = (items || []).map((i: any) => ({
          ...i,
          timestamp: i.timestamp ? ValidationService.formatData(i.timestamp) : i.timestamp,
        }));

        res.json({
          success: true,
          data: itemsPtBr,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        });
        return;
      }

      let data = SpreadsheetController.uploadsHistory;
      if (clienteId) data = data.filter(i => i.clienteId === String(clienteId));
      if (periodo) data = data.filter(i => i.periodo === String(periodo));
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum;
      const items = data.slice(start, end).map((i: any) => ({
        ...i,
        timestamp: i.timestamp ? ValidationService.formatData(i.timestamp) : i.timestamp,
      }));
      res.json({ success: true, data: items, pagination: { page: pageNum, limit: limitNum, total: data.length, totalPages: Math.ceil(data.length / limitNum) } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

// Middleware de upload
export const uploadMiddleware = upload.single('arquivo');

