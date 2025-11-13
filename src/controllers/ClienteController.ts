/**
 * Controlador para operações de Cliente
 * Gerencia as requisições HTTP relacionadas aos clientes
 */

import { Request, Response } from 'express';
import { Cliente } from '../models/Cliente';
import { ApiResponse } from '../types';
import * as XLSX from 'xlsx';
import multer from 'multer';
import path from 'path';
import ExcelJS from 'exceljs';

// Configuração do multer para upload de arquivos de clientes
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

export class ClienteController {
  private clienteModel: Cliente;

  constructor() {
    this.clienteModel = new Cliente();
  }

  // Middleware de upload para exportar
  static get uploadMiddleware() {
    return upload.single('arquivo');
  }

  /**
   * Listar todos os clientes
   */
  async listarClientes(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, search, nome, cnpj } = req.query;

      let result: ApiResponse<any> = await this.clienteModel.findAll();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      let data = result.data || [];

      // Filtros (compatível com 'search' legado e novos 'nome'/'cnpj')
      const q = (nome as string) || (search as string) || '';
      if (q) {
        const qLower = q.toLowerCase();
        data = data.filter((c: any) => 
          (c.razao_social || c.nome || '').toLowerCase().includes(qLower)
        );
      }

      if (cnpj) {
        const cnpjStr = String(cnpj).replace(/\D/g, '');
        data = data.filter((c: any) => 
          String(c.cnpj_limpo || c.cnpj || '').replace(/\D/g, '').includes(cnpjStr)
        );
      }

      // Paginação
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedData = data.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: paginatedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: data.length,
          totalPages: Math.ceil(data.length / limitNum),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter cliente por ID
   */
  async obterCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findById(id);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Criar novo cliente
   */
  async criarCliente(req: Request, res: Response): Promise<void> {
    try {
      const clienteData = req.body;

      const result = await this.clienteModel.createCliente(clienteData);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar cliente
   */
  async atualizarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.updateCliente(id, updates);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Deletar cliente
   */
  async deletarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.delete(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        message: 'Cliente deletado com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Importar clientes em lote via JSON
   * Body esperado: { clientes: [{ nome: string, cnpj: string, email?, telefone?, endereco? }, ...] }
   * Verifica duplicatas por CNPJ e processa apenas os registros que ainda não existem
   */
  async importarClientesJson(req: Request, res: Response): Promise<void> {
    try {
      const { clientes } = req.body as any;
      if (!Array.isArray(clientes) || clientes.length === 0) {
        res.status(400).json({ success: false, error: 'Campo "clientes" é obrigatório e deve ser um array não-vazio' });
        return;
      }

      // Normalizar CNPJ e preparar dados
      const clientesNormalizados = clientes.map((item: any) => {
        const cnpjLimpo = (item.cnpj_limpo || item.cnpj || '').replace(/\D/g, '');
        return {
          ...item,
          cnpj_limpo: cnpjLimpo,
          razao_social: item.razao_social || item.nome || '',
        };
      }).filter((item: any) => item.cnpj_limpo && item.cnpj_limpo.length === 14);

      if (clientesNormalizados.length === 0) {
        res.status(400).json({ success: false, error: 'Nenhum cliente válido encontrado. Verifique os CNPJs.' });
        return;
      }

      // Buscar todos os CNPJs existentes
      const cnpjsParaVerificar = clientesNormalizados.map((c: any) => c.cnpj_limpo);
      const clientesExistentes = new Set<string>();
      
      // Verificar quais CNPJs já existem
      for (const cnpj of cnpjsParaVerificar) {
        const result = await this.clienteModel.findByCNPJ(cnpj);
        if (result.success && result.data) {
          clientesExistentes.add(cnpj);
        }
      }

      // Filtrar apenas os clientes que não existem
      const clientesNovos = clientesNormalizados.filter((c: any) => !clientesExistentes.has(c.cnpj_limpo));
      const totalExistentes = clientesExistentes.size;
      const totalNovos = clientesNovos.length;

      const resultados: { 
        ok: number; 
        fail: number; 
        erros: string[];
        totalProcessados: number;
        jaExistentes: number;
        criados: number;
      } = { 
        ok: 0, 
        fail: 0, 
        erros: [],
        totalProcessados: clientesNormalizados.length,
        jaExistentes: totalExistentes,
        criados: 0,
      };

      // Criar apenas os clientes novos
      for (const item of clientesNovos) {
        try {
          const resp = await this.clienteModel.createCliente(item);
          if (resp.success) {
            resultados.ok += 1;
            resultados.criados += 1;
          } else {
            resultados.fail += 1;
            if (resp.error) resultados.erros.push(`CNPJ ${item.cnpj_limpo}: ${resp.error}`);
          }
        } catch (e: any) {
          resultados.fail += 1;
          resultados.erros.push(`CNPJ ${item.cnpj_limpo || 'desconhecido'}: ${e?.message || 'Erro desconhecido'}`);
        }
      }

      res.json({ 
        success: resultados.fail === 0, 
        data: resultados,
        message: `Processados: ${resultados.totalProcessados} | Já existentes: ${resultados.jaExistentes} | Criados: ${resultados.criados} | Falhas: ${resultados.fail}`
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
    }
  }

  /**
   * Upload e processamento de planilha de clientes
   * Verifica duplicatas por CNPJ e processa apenas os registros que ainda não existem
   */
  async uploadPlanilhaClientes(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo é obrigatório' });
        return;
      }

      const { buffer, originalname } = req.file;
      const ext = originalname.split('.').pop()?.toLowerCase();

      if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
        res.status(400).json({ 
          success: false, 
          error: `Formato de arquivo não suportado: ${ext || 'desconhecido'}. Use .xlsx, .xls ou .csv` 
        });
        return;
      }

      let dados: any[] = [];

      try {
        // Processar arquivo Excel ou CSV
        if (ext === 'xlsx' || ext === 'xls') {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            res.status(400).json({ success: false, error: 'Arquivo Excel não contém planilhas válidas' });
            return;
          }
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          if (!worksheet) {
            res.status(400).json({ success: false, error: 'Não foi possível ler a planilha do arquivo' });
            return;
          }
          
          dados = XLSX.utils.sheet_to_json(worksheet, { 
            defval: '', // Valor padrão para células vazias
            raw: false // Retornar valores como strings
          });
        } else if (ext === 'csv') {
          const csvString = buffer.toString('utf-8');
          
          if (!csvString || csvString.trim().length === 0) {
            res.status(400).json({ success: false, error: 'Arquivo CSV está vazio' });
            return;
          }
          
          const workbook = XLSX.read(csvString, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          dados = XLSX.utils.sheet_to_json(worksheet, { 
            defval: '',
            raw: false 
          });
        }
      } catch (parseError: any) {
        console.error('Erro ao processar arquivo:', parseError);
        res.status(400).json({ 
          success: false, 
          error: `Erro ao processar arquivo: ${parseError?.message || 'Formato de arquivo inválido'}` 
        });
        return;
      }

      if (!dados || dados.length === 0) {
        res.status(400).json({ 
          success: false, 
          error: 'Planilha vazia ou sem dados válidos. Verifique se a planilha contém dados além do cabeçalho.' 
        });
        return;
      }

      // Debug: Log das primeiras linhas para diagnóstico
      console.log('Total de linhas lidas da planilha:', dados.length);
      if (dados.length > 0) {
        console.log('Primeira linha (exemplo):', JSON.stringify(dados[0], null, 2));
        console.log('Chaves disponíveis na primeira linha:', Object.keys(dados[0]));
      }

      // Normalizar dados da planilha
      const clientesNormalizados = dados.map((item: any, index: number) => {
        // Tentar encontrar CNPJ em diferentes colunas possíveis
        const cnpj = item.cnpj || item.CNPJ || item.cnpj_limpo || item.CNPJ_LIMPO || item['CNPJ'] || '';
        // SEMPRE limpar caracteres especiais do CNPJ
        const cnpjLimpo = String(cnpj).replace(/\D/g, '');
        
        // Tentar encontrar razão social em diferentes colunas
        const razaoSocial = (item.razao_social || item.RAZAO_SOCIAL || item.nome || item.NOME || item['Razão Social'] || item['Nome'] || '').trim();
        
        // Validar campos obrigatórios: CNPJ (14 dígitos) e Razão Social
        if (!cnpjLimpo || cnpjLimpo.length !== 14) {
          console.log(`Linha ${index + 1}: CNPJ inválido - valor: "${cnpj}", limpo: "${cnpjLimpo}", tamanho: ${cnpjLimpo.length}`);
          return null; // CNPJ inválido
        }
        
        if (!razaoSocial || razaoSocial.length === 0) {
          console.log(`Linha ${index + 1}: Razão Social vazia`);
          return null; // Razão Social obrigatória
        }
        
        return {
          cnpj_limpo: cnpjLimpo, // Sempre salvar limpo no banco
          razao_social: razaoSocial,
          // Não salvar cnpj formatado, apenas gerar na exibição
          email: (item.email || item.EMAIL || item['Email'] || '').trim() || undefined,
          telefone: (item.telefone || item.TELEFONE || item['Telefone'] || '').trim() || undefined,
          endereco: (item.endereco || item.ENDERECO || item['Endereço'] || item['Endereco'] || '').trim() || undefined,
        };
      }).filter((item: any) => item !== null); // Filtrar apenas registros válidos

      console.log('Clientes normalizados válidos:', clientesNormalizados.length, 'de', dados.length);

      if (clientesNormalizados.length === 0) {
        res.status(400).json({ 
          success: false, 
          error: `Nenhum cliente válido encontrado na planilha. Total de linhas processadas: ${dados.length}. Campos obrigatórios: CNPJ (14 dígitos, com ou sem formatação) e Razão Social. Email, Telefone e Endereço são opcionais. Verifique se a planilha contém dados além do cabeçalho e se os campos estão nomeados corretamente.` 
        });
        return;
      }

      // Buscar todos os CNPJs existentes
      const cnpjsParaVerificar = [...new Set(clientesNormalizados.map((c: any) => c.cnpj_limpo))];
      const clientesExistentes = new Set<string>();
      
      // Verificar quais CNPJs já existem
      for (const cnpj of cnpjsParaVerificar) {
        const result = await this.clienteModel.findByCNPJ(cnpj);
        if (result.success && result.data) {
          clientesExistentes.add(cnpj);
        }
      }

      // Filtrar apenas os clientes que não existem
      const clientesNovos = clientesNormalizados.filter((c: any) => !clientesExistentes.has(c.cnpj_limpo));
      const totalExistentes = clientesExistentes.size;
      const totalNovos = clientesNovos.length;

      const resultados: { 
        ok: number; 
        fail: number; 
        erros: string[];
        totalProcessados: number;
        jaExistentes: number;
        criados: number;
      } = { 
        ok: 0, 
        fail: 0, 
        erros: [],
        totalProcessados: clientesNormalizados.length,
        jaExistentes: totalExistentes,
        criados: 0,
      };

      // Criar apenas os clientes novos
      for (const item of clientesNovos) {
        try {
          console.log(`[Upload] Tentando criar: CNPJ=${item.cnpj_limpo}, Razão Social="${item.razao_social}"`);
          const resp = await this.clienteModel.createCliente(item);
          if (resp.success) {
            resultados.ok += 1;
            resultados.criados += 1;
            console.log(`[Upload] ✅ Sucesso: CNPJ=${item.cnpj_limpo}`);
          } else {
            resultados.fail += 1;
            const errorMsg = resp.error || 'Erro desconhecido';
            resultados.erros.push(`CNPJ ${item.cnpj_limpo}: ${errorMsg}`);
            console.error(`[Upload] ❌ Falha: CNPJ=${item.cnpj_limpo}, Erro="${errorMsg}"`);
          }
        } catch (e: any) {
          resultados.fail += 1;
          const errorMsg = e?.message || 'Erro desconhecido';
          resultados.erros.push(`CNPJ ${item.cnpj_limpo || 'desconhecido'}: ${errorMsg}`);
          console.error(`[Upload] ❌ Exceção: CNPJ=${item.cnpj_limpo}, Erro="${errorMsg}"`, e);
        }
      }
      
      console.log('[Upload] Resumo final:', {
        totalProcessados: resultados.totalProcessados,
        jaExistentes: resultados.jaExistentes,
        criados: resultados.criados,
        falhas: resultados.fail,
        primeirosErros: resultados.erros.slice(0, 5)
      });
      
      // Limitar número de erros retornados
      if (resultados.erros.length > 20) {
        const errosLimitados = resultados.erros.slice(0, 20);
        errosLimitados.push(`... e mais ${resultados.fail - 20} erros (total: ${resultados.fail} falhas)`);
        resultados.erros = errosLimitados;
      }

      res.json({ 
        success: resultados.fail === 0, 
        data: resultados,
        message: `Processados: ${resultados.totalProcessados} | Já existentes: ${resultados.jaExistentes} | Criados: ${resultados.criados} | Falhas: ${resultados.fail}`
      });
    } catch (error) {
      console.error('Erro no upload de planilha:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: error instanceof Error ? error.message : 'Erro ao processar upload da planilha'
      });
    }
  }

  /**
   * Formatar CNPJ para exibição
   */
  private formatCNPJ(cnpj: string): string {
    const clean = cnpj.replace(/\D/g, '');
    return clean
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  /**
   * Gerar modelo de planilha para upload de clientes
   */
  async downloadModelo(req: Request, res: Response): Promise<void> {
    try {
      // Criar workbook com ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Clientes');

      // Definir cabeçalhos - apenas CNPJ e Razão Social
      worksheet.columns = [
        { header: 'CNPJ', key: 'cnpj', width: 20 },
        { header: 'Razão Social', key: 'razao_social', width: 50 },
      ];

      // Estilizar cabeçalho
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF538DD5' }, // Azul claro
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 22;

      // Adicionar linha de exemplo
      worksheet.addRow({
        cnpj: '12.345.678/0001-90',
        razao_social: 'Empresa Exemplo Ltda',
      });

      // Estilizar linha de exemplo (cinza claro)
      const exampleRow = worksheet.getRow(2);
      exampleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' },
      };
      exampleRow.font = { italic: true, color: { argb: 'FF666666' } };

      // Configurar altura das linhas
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 18;
        }
        row.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      // Gerar buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Configurar headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="modelo-clientes.xlsx"');
      
      // Converter ArrayBuffer para Buffer do Node.js
      const nodeBuffer = Buffer.from(buffer);
      res.setHeader('Content-Length', nodeBuffer.length);
      
      // Enviar o buffer
      res.end(nodeBuffer);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar modelo',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Buscar cliente por CNPJ
   */
  async buscarPorCNPJ(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.params;

      if (!cnpj) {
        res.status(400).json({
          success: false,
          error: 'CNPJ é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findByCNPJ(cnpj);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter estatísticas dos clientes
   */
  async obterEstatisticas(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.clienteModel.getStats();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }
}
