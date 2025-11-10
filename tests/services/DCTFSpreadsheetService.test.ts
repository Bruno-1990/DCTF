/**
 * Testes para DCTFSpreadsheetService
 */

import { DCTFSpreadsheetService } from '../../src/services/DCTFSpreadsheetService';

// Mock do XLSX
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
    aoa_to_sheet: jest.fn(),
    book_new: jest.fn(),
    book_append_sheet: jest.fn()
  },
  write: jest.fn()
}));

// Mock do DCTFValidationService
jest.mock('../../src/services/DCTFValidationService', () => ({
  DCTFValidationService: {
    validateDCTFCode: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    }),
    validatePeriodoFiscal: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    }),
    validateValorMonetario: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    }),
    validateCNPJCPF: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    }),
    validateCodigoReceita: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    }),
    validateDCTFLinha: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    })
  }
}));

describe('DCTFSpreadsheetService', () => {
  describe('validateFile', () => {
    it('deve validar arquivo válido', () => {
      const buffer = Buffer.from('test content');
      const filename = 'test.xlsx';
      
      const result = DCTFSpreadsheetService.validateFile(buffer, filename);
      
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('deve rejeitar arquivo muito grande', () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const filename = 'large.xlsx';
      
      const result = DCTFSpreadsheetService.validateFile(buffer, filename);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Arquivo excede tamanho máximo de 10MB');
    });

    it('deve rejeitar tipo de arquivo inválido', () => {
      const buffer = Buffer.from('test content');
      const filename = 'test.pdf';
      
      const result = DCTFSpreadsheetService.validateFile(buffer, filename);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tipo de arquivo não permitido. Use: .xls, .xlsx, .csv');
    });

    it('deve aceitar tipos de arquivo válidos', () => {
      const validTypes = ['test.xls', 'test.xlsx', 'test.csv'];
      
      validTypes.forEach(filename => {
        const buffer = Buffer.from('test content');
        const result = DCTFSpreadsheetService.validateFile(buffer, filename);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('processarPlanilha', () => {
    it('deve processar planilha válida', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      };

      const mockJsonData = [
        ['codigo', 'descricao', 'valor', 'periodo', 'data_ocorrencia', 'cnpj_cpf'],
        ['001', 'Receita Bruta', 1000, '2024-01', '2024-01-15', '12345678000195']
      ];

      const { read, utils } = require('xlsx');
      read.mockReturnValue(mockWorkbook);
      utils.sheet_to_json.mockReturnValue(mockJsonData);

      const buffer = Buffer.from('test content');
      const filename = 'test.xlsx';
      
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);
      
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(Array.isArray(result.dados)).toBe(true);
      expect(result.metadados).toBeDefined();
      expect(result.metadados.totalLinhas).toBe(1);
    });

    it('deve rejeitar planilha sem dados', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      };

      const mockJsonData = [['codigo', 'descricao']]; // Apenas cabeçalho

      const { read, utils } = require('xlsx');
      read.mockReturnValue(mockWorkbook);
      utils.sheet_to_json.mockReturnValue(mockJsonData);

      const buffer = Buffer.from('test content');
      const filename = 'test.xlsx';
      
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Planilha deve ter pelo menos 2 linhas (cabeçalho + dados)');
    });

    it('deve validar colunas obrigatórias', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      };

      const mockJsonData = [
        ['codigo', 'descricao'], // Faltam colunas obrigatórias
        ['001', 'Receita Bruta']
      ];

      const { read, utils } = require('xlsx');
      read.mockReturnValue(mockWorkbook);
      utils.sheet_to_json.mockReturnValue(mockJsonData);

      const buffer = Buffer.from('test content');
      const filename = 'test.xlsx';
      
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('marca linhas inválidas e mantém isValid=false quando existirem', async () => {
      const mockWorkbook = { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } };
      const mockJsonData = [
        ['codigo', 'descricao', 'valor', 'periodo', 'data_ocorrencia', 'cnpj_cpf'],
        ['001', 'Receita Bruta', 1000, '2024-01', '2024-01-15', '12345678000195'],
        ['XYZ', 'Invalida', -10, '2024-13', '31/02/2024', '']
      ];

      const { read, utils } = require('xlsx');
      read.mockReturnValue(mockWorkbook);
      utils.sheet_to_json.mockReturnValue(mockJsonData);

      const { DCTFValidationService } = require('../../src/services/DCTFValidationService');
      (DCTFValidationService.validateDCTFLinha as jest.Mock).mockImplementation(({ codigo }: any) => ({
        isValid: codigo === '001',
        errors: codigo === '001' ? [] : ['Código inválido'],
        warnings: []
      }));

      const buffer = Buffer.from('test content');
      const filename = 'test.xlsx';
      const result = await DCTFSpreadsheetService.processarPlanilha(buffer, filename);

      expect(result.isValid).toBe(false);
      expect(Array.isArray(result.dados)).toBe(true);
      const invalid = result.dados.filter((r: any) => !r.__valid);
      expect(invalid.length).toBeGreaterThan(0);
    });
  });

  describe('gerarTemplate', () => {
    it('deve gerar template válido', () => {
      const template = DCTFSpreadsheetService.gerarTemplate();
      
      expect(template).toBeDefined();
      expect(Buffer.isBuffer(template)).toBe(true);
      expect(template.length).toBeGreaterThan(0);
    });
  });

  describe('exportarParaPlanilha', () => {
    it('deve exportar dados válidos', () => {
      const dados = [
        { codigo: '001', descricao: 'Receita Bruta', valor: 1000 },
        { codigo: '101', descricao: 'Deduções', valor: 100 }
      ];

      const planilha = DCTFSpreadsheetService.exportarParaPlanilha(dados);
      
      expect(planilha).toBeDefined();
      expect(Buffer.isBuffer(planilha)).toBe(true);
      expect(planilha.length).toBeGreaterThan(0);
    });

    it('deve rejeitar dados vazios', () => {
      expect(() => {
        DCTFSpreadsheetService.exportarParaPlanilha([]);
      }).toThrow('Nenhum dado para exportar');
    });
  });
});

