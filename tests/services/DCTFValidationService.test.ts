/**
 * Testes para DCTFValidationService
 */

import { DCTFValidationService } from '../../src/services/DCTFValidationService';

describe('DCTFValidationService', () => {
  describe('validateDCTFCode', () => {
    it('deve validar código DCTF válido', () => {
      const result = DCTFValidationService.validateDCTFCode('001');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve rejeitar código DCTF inválido', () => {
      const result = DCTFValidationService.validateDCTFCode('999');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Código DCTF '999' não é válido");
    });

    it('deve rejeitar código vazio', () => {
      const result = DCTFValidationService.validateDCTFCode('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Código DCTF é obrigatório');
    });

    it('deve validar código com período', () => {
      const result = DCTFValidationService.validateDCTFCode('001', '2024-01');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validatePeriodoFiscal', () => {
    it('deve validar período no formato correto', () => {
      const result = DCTFValidationService.validatePeriodoFiscal('2024-01');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve rejeitar período em formato incorreto', () => {
      const result = DCTFValidationService.validatePeriodoFiscal('2024/01');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Período deve estar no formato YYYY-MM');
    });

    it('deve rejeitar período vazio', () => {
      const result = DCTFValidationService.validatePeriodoFiscal('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Período fiscal é obrigatório');
    });

    it('deve rejeitar ano muito antigo', () => {
      const result = DCTFValidationService.validatePeriodoFiscal('2019-01');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Ano deve ser maior ou igual a 2020');
    });

    it('deve rejeitar mês inválido', () => {
      const result = DCTFValidationService.validatePeriodoFiscal('2024-13');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Mês deve estar entre 01 e 12');
    });
  });

  describe('validateValorMonetario', () => {
    it('deve validar valor monetário válido', () => {
      const result = DCTFValidationService.validateValorMonetario(1000.50);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve rejeitar valor negativo', () => {
      const result = DCTFValidationService.validateValorMonetario(-100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valor não pode ser negativo');
    });

    it('deve rejeitar valor não numérico', () => {
      const result = DCTFValidationService.validateValorMonetario('abc' as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valor deve ser um número válido');
    });

    it('deve rejeitar valor que excede limite', () => {
      const result = DCTFValidationService.validateValorMonetario(9999999999999);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valor excede o limite máximo permitido');
    });

    it('deve validar valor zero para receita', () => {
      const result = DCTFValidationService.validateValorMonetario(0, '001');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Receita com valor zero - verificar se está correto');
    });
  });

  describe('validateCNPJCPF', () => {
    it('deve validar CNPJ válido', () => {
      const result = DCTFValidationService.validateCNPJCPF('11.222.333/0001-81');
      expect(result.isValid).toBe(true);
    });

    it('deve validar CPF válido', () => {
      const result = DCTFValidationService.validateCNPJCPF('123.456.789-09');
      expect(result.isValid).toBe(true);
    });

    it('deve rejeitar CNPJ inválido', () => {
      const result = DCTFValidationService.validateCNPJCPF('11.222.333/0001-82');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CNPJ inválido');
    });

    it('deve rejeitar CPF inválido', () => {
      const result = DCTFValidationService.validateCNPJCPF('123.456.789-10');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CPF inválido');
    });

    it('deve rejeitar documento com tamanho incorreto', () => {
      const result = DCTFValidationService.validateCNPJCPF('123456789');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)');
    });

    it('deve rejeitar documento vazio', () => {
      const result = DCTFValidationService.validateCNPJCPF('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CNPJ/CPF é obrigatório');
    });
  });

  describe('validateCodigoReceita', () => {
    it('deve validar código de receita no formato correto', () => {
      const result = DCTFValidationService.validateCodigoReceita('1.1.1.01.01');
      expect(result.isValid).toBe(true);
    });

    it('deve rejeitar código de receita em formato incorreto', () => {
      const result = DCTFValidationService.validateCodigoReceita('1.1.1.1.1');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Código de receita deve estar no formato X.X.X.XX.XX');
    });

    it('deve rejeitar código vazio', () => {
      const result = DCTFValidationService.validateCodigoReceita('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Código de receita é obrigatório');
    });
  });

  describe('validateDCTFLinha', () => {
    it('deve validar linha DCTF completa válida', () => {
      const dados = {
        codigo: '001',
        descricao: 'Receita Bruta',
        valor: 1000.50,
        dataOcorrencia: '2024-01-15',
        cnpjCpf: '11.222.333/0001-81',
        codigoReceita: '1.1.1.01.01',
        periodo: '2024-01'
      };

      const result = DCTFValidationService.validateDCTFLinha(dados);
      expect(result.isValid).toBe(true);
    });

    it('deve rejeitar linha com dados inválidos', () => {
      const dados = {
        codigo: '999',
        valor: -100,
        cnpjCpf: '123',
        periodo: '2024/01'
      };

      const result = DCTFValidationService.validateDCTFLinha(dados);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getValidCodes', () => {
    it('deve retornar códigos válidos por tipo', () => {
      const receitaCodes = DCTFValidationService.getValidCodes('receita');
      expect(receitaCodes.length).toBeGreaterThan(0);
      expect(receitaCodes.every(code => code.tipo === 'receita')).toBe(true);
    });

    it('deve retornar todos os códigos válidos', () => {
      const allCodes = DCTFValidationService.getValidCodes();
      expect(allCodes.length).toBeGreaterThan(0);
    });
  });

  describe('isCodeActiveInPeriod', () => {
    it('deve verificar se código está ativo no período', () => {
      const isActive = DCTFValidationService.isCodeActiveInPeriod('001', '2024-01');
      expect(isActive).toBe(true);
    });
  });
});
