/**
 * Testes para DCTFBusinessRulesService
 */

import { DCTFBusinessRulesService } from '../../src/services/DCTFBusinessRulesService';

// Mock do Supabase
jest.mock('../../src/config/database', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({
            data: null,
            error: null
          }))
        }))
      }))
    }))
  }
}));

describe('DCTFBusinessRulesService', () => {
  describe('validateDCTFCreation', () => {
    it('deve validar criação de DCTF com dados válidos', async () => {
      const dados = {
        clienteId: '123e4567-e89b-12d3-a456-426614174000',
        periodo: '2024-01',
        arquivo: {
          nome: 'dctf_2024_01.xlsx',
          tamanho: 1024 * 1024, // 1MB
          tipo: 'xlsx'
        }
      };

      const result = await DCTFBusinessRulesService.validateDCTFCreation(dados);
      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('deve rejeitar arquivo muito grande', async () => {
      const dados = {
        clienteId: '123e4567-e89b-12d3-a456-426614174000',
        periodo: '2024-01',
        arquivo: {
          nome: 'dctf_2024_01.xlsx',
          tamanho: 11 * 1024 * 1024, // 11MB
          tipo: 'xlsx'
        }
      };

      const result = await DCTFBusinessRulesService.validateDCTFCreation(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Arquivo excede o limite de 10MB');
    });

    it('deve rejeitar tipo de arquivo inválido', async () => {
      const dados = {
        clienteId: '123e4567-e89b-12d3-a456-426614174000',
        periodo: '2024-01',
        arquivo: {
          nome: 'dctf_2024_01.pdf',
          tamanho: 1024 * 1024,
          tipo: 'pdf'
        }
      };

      const result = await DCTFBusinessRulesService.validateDCTFCreation(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tipo de arquivo não permitido. Use: xls, xlsx, csv');
    });

    it('deve rejeitar período inválido', async () => {
      const dados = {
        clienteId: '123e4567-e89b-12d3-a456-426614174000',
        periodo: '2024/01',
        arquivo: {
          nome: 'dctf_2024_01.xlsx',
          tamanho: 1024 * 1024,
          tipo: 'xlsx'
        }
      };

      const result = await DCTFBusinessRulesService.validateDCTFCreation(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Período deve estar no formato YYYY-MM');
    });
  });

  describe('validateDCTFData', () => {
    it('deve validar dados DCTF válidos', async () => {
      const dados = {
        codigo: '001',
        valor: 1000.50,
        periodo: '2024-01',
        cnpjCpf: '11.222.333/0001-81',
        codigoReceita: '1.1.1.01.01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });

    it('deve rejeitar valor negativo para receita', async () => {
      const dados = {
        codigo: '001',
        valor: -100,
        periodo: '2024-01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valores de receita devem ser positivos');
    });

    it('deve rejeitar valor negativo para dedução', async () => {
      const dados = {
        codigo: '101',
        valor: -50,
        periodo: '2024-01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valores de dedução não podem ser negativos');
    });

    it('deve rejeitar valor negativo para retenção', async () => {
      const dados = {
        codigo: '201',
        valor: -25,
        periodo: '2024-01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valores de retenção não podem ser negativos');
    });

    it('deve sugerir verificação para valor zero', async () => {
      const dados = {
        codigo: '001',
        valor: 0,
        periodo: '2024-01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result.suggestions).toContain('Valor zero - verificar se está correto');
    });

    it('deve sugerir verificação para valor muito baixo', async () => {
      const dados = {
        codigo: '001',
        valor: 0.50,
        periodo: '2024-01'
      };

      const result = await DCTFBusinessRulesService.validateDCTFData(dados);
      expect(result.suggestions).toContain('Valor muito baixo - verificar se está em reais');
    });
  });

  describe('validateAnalysisCreation', () => {
    it('deve validar criação de análise com DCTF válido', async () => {
      const result = await DCTFBusinessRulesService.validateAnalysisCreation(
        '123e4567-e89b-12d3-a456-426614174000',
        'consistencia'
      );
      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });

    it('deve sugerir verificação baseada no tipo de análise', async () => {
      const result = await DCTFBusinessRulesService.validateAnalysisCreation(
        '123e4567-e89b-12d3-a456-426614174000',
        'consistencia'
      );
      expect(result.suggestions).toContain('Análise de consistência - verificar cálculos e totais');
    });
  });

  describe('validateReportGeneration', () => {
    it('deve validar geração de relatório com DCTF processado', async () => {
      const result = await DCTFBusinessRulesService.validateReportGeneration(
        '123e4567-e89b-12d3-a456-426614174000',
        'executivo'
      );
      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });

    it('deve sugerir conteúdo baseado no tipo de relatório', async () => {
      const result = await DCTFBusinessRulesService.validateReportGeneration(
        '123e4567-e89b-12d3-a456-426614174000',
        'executivo'
      );
      expect(result.suggestions).toContain('Relatório executivo - incluir resumo e principais indicadores');
    });
  });

  describe('validateStatusTransition', () => {
    it('deve validar transição válida de status', async () => {
      const result = await DCTFBusinessRulesService.validateStatusTransition(
        '123e4567-e89b-12d3-a456-426614174000',
        'rascunho',
        'validando'
      );
      expect(result.isValid).toBe(true);
    });

    it('deve rejeitar transição inválida de status', async () => {
      const result = await DCTFBusinessRulesService.validateStatusTransition(
        '123e4567-e89b-12d3-a456-426614174000',
        'rascunho',
        'processado'
      );
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transição de status inválida: rascunho → processado');
    });

    it('deve permitir voltar do erro para correção', async () => {
      const result = await DCTFBusinessRulesService.validateStatusTransition(
        '123e4567-e89b-12d3-a456-426614174000',
        'erro',
        'rascunho'
      );
      expect(result.isValid).toBe(true);
    });
  });
});

