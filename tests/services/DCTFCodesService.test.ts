/**
 * Testes para DCTFCodesService
 */

import { DCTFCodesService } from '../../src/services/DCTFCodesService';

// Mock dos modelos
jest.mock('../../src/models/DCTFCode', () => ({
  DCTFCode: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue([
      { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true, categoria: 'Receitas' },
      { codigo: '101', descricao: 'Deduções Legais', tipo: 'deducao', ativo: true, categoria: 'Deduções' },
      { codigo: '201', descricao: 'IRRF', tipo: 'retencao', ativo: true, categoria: 'Retenções' }
    ]),
    findById: jest.fn().mockImplementation((id) => {
      if (id === '001') {
        return Promise.resolve({
          codigo: '001',
          descricao: 'Receita Bruta',
          tipo: 'receita',
          ativo: true,
          categoria: 'Receitas'
        });
      }
      return Promise.resolve(null);
    }),
    findActiveInPeriod: jest.fn().mockResolvedValue([
      { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true, categoria: 'Receitas' }
    ]),
    findByTipo: jest.fn().mockImplementation((tipo) => {
      const all = [
        { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true, categoria: 'Receitas' },
        { codigo: '101', descricao: 'Deduções Legais', tipo: 'deducao', ativo: true, categoria: 'Deduções' },
        { codigo: '201', descricao: 'IRRF', tipo: 'retencao', ativo: true, categoria: 'Retenções' }
      ];
      return Promise.resolve(all.filter(c => (tipo ? c.tipo === tipo : true)));
    }),
    isActiveInPeriod: jest.fn().mockResolvedValue(true),
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          ilike: jest.fn(() => ({
            eq: jest.fn(() => ({
              data: [
                { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true, categoria: 'Receitas' }
              ],
              error: null
            }))
          }))
        }))
      }))
    }
  })),
  DCTFReceitaCode: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue([
      { codigo: '1.1.1.01.01', descricao: 'Vendas de Produtos', categoria: 'Vendas', ativo: true }
    ]),
    findById: jest.fn().mockResolvedValue(null)
  })),
  DCTFAliquota: jest.fn().mockImplementation(() => ({
    findByCodeAndPeriod: jest.fn().mockResolvedValue({
      aliquota: 0.0150,
      baseCalculo: 'Valor da Operação'
    }),
    findByPeriod: jest.fn().mockResolvedValue([
      { codigoDctf: '201', aliquota: 0.0150, baseCalculo: 'Valor da Operação' }
    ]),
    findAll: jest.fn().mockResolvedValue([
      { codigoDctf: '201', aliquota: 0.0150, baseCalculo: 'Valor da Operação' }
    ])
  }))
}));

// Mock do DCTFValidationService
jest.mock('../../src/services/DCTFValidationService', () => ({
  DCTFValidationService: {
    validateDCTFCode: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    })
  }
}));

describe('DCTFCodesService', () => {
  describe('getCodeHierarchy', () => {
    it('deve retornar hierarquia de códigos', async () => {
      const hierarchy = await DCTFCodesService.getCodeHierarchy();
      
      expect(hierarchy).toBeDefined();
      expect(Array.isArray(hierarchy)).toBe(true);
      expect(hierarchy.length).toBeGreaterThan(0);
      
      // Verificar estrutura
      hierarchy.forEach(category => {
        expect(category).toHaveProperty('categoria');
        expect(category).toHaveProperty('subcategorias');
        expect(Array.isArray(category.subcategorias)).toBe(true);
      });
    });
  });

  describe('validateCode', () => {
    it('deve validar código válido', async () => {
      const result = await DCTFCodesService.validateCode('001', '2024-01');
      
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('deve retornar informações do código', async () => {
      const result = await DCTFCodesService.validateCode('001', '2024-01');
      
      expect(result.codeInfo).toBeDefined();
      expect(result.codeInfo?.codigo).toBe('001');
      expect(result.codeInfo?.descricao).toBe('Receita Bruta');
    });

    it('deve rejeitar código inválido', async () => {
      // Mock para código inválido
      const { DCTFValidationService } = require('../../src/services/DCTFValidationService');
      DCTFValidationService.validateDCTFCode.mockReturnValueOnce({
        isValid: false,
        errors: ['Código inválido'],
        warnings: []
      });

      const result = await DCTFCodesService.validateCode('999', '2024-01');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Código inválido');
    });
  });

  describe('getCodeInfo', () => {
    it('deve retornar informações do código DCTF', async () => {
      const codeInfo = await DCTFCodesService.getCodeInfo('001');
      
      expect(codeInfo).toBeDefined();
      expect(codeInfo?.codigo).toBe('001');
      expect(codeInfo?.descricao).toBe('Receita Bruta');
      expect(codeInfo?.tipo).toBe('receita');
    });

    it('deve retornar null para código não encontrado', async () => {
      const codeInfo = await DCTFCodesService.getCodeInfo('999');
      
      expect(codeInfo).toBeNull();
    });
  });

  describe('getActiveCodesInPeriod', () => {
    it('deve retornar códigos ativos no período', async () => {
      const codes = await DCTFCodesService.getActiveCodesInPeriod('2024-01');
      
      expect(codes).toBeDefined();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      
      codes.forEach(code => {
        expect(code).toHaveProperty('codigo');
        expect(code).toHaveProperty('descricao');
        expect(code).toHaveProperty('tipo');
        expect(code).toHaveProperty('categoria');
        expect(code).toHaveProperty('ativo');
      });
    });

    it('deve filtrar por tipo quando especificado', async () => {
      const codes = await DCTFCodesService.getActiveCodesInPeriod('2024-01', 'receita');
      
      expect(codes).toBeDefined();
      expect(Array.isArray(codes)).toBe(true);
    });
  });

  describe('getAliquotaForCode', () => {
    it('deve retornar alíquota para código e período', async () => {
      const aliquota = await DCTFCodesService.getAliquotaForCode('201', '2024-01');
      
      expect(aliquota).toBeDefined();
      expect(aliquota?.aliquota).toBe(0.0150);
      expect(aliquota?.baseCalculo).toBe('Valor da Operação');
    });

    it('deve retornar null para código sem alíquota', async () => {
      const { DCTFAliquota } = require('../../src/models/DCTFCode');
      const mockAliquota = new DCTFAliquota();
      mockAliquota.findByCodeAndPeriod.mockResolvedValueOnce(null);

      const aliquota = await DCTFCodesService.getAliquotaForCode('999', '2024-01');
      
      expect(aliquota).toBeNull();
    });
  });

  describe('searchCodesByDescription', () => {
    it('deve buscar códigos por descrição', async () => {
      const codes = await DCTFCodesService.searchCodesByDescription('Receita');
      
      expect(codes).toBeDefined();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      
      codes.forEach(code => {
        expect(code).toHaveProperty('codigo');
        expect(code).toHaveProperty('descricao');
        expect(code).toHaveProperty('tipo');
        expect(code).toHaveProperty('categoria');
      });
    });

    it('deve filtrar por tipo quando especificado', async () => {
      const codes = await DCTFCodesService.searchCodesByDescription('Receita', 'receita');
      
      expect(codes).toBeDefined();
      expect(Array.isArray(codes)).toBe(true);
    });
  });

  describe('getCodeStatistics', () => {
    it('deve retornar estatísticas dos códigos', async () => {
      const stats = await DCTFCodesService.getCodeStatistics();
      
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalCodes');
      expect(stats).toHaveProperty('codesByType');
      expect(stats).toHaveProperty('activeCodes');
      expect(stats).toHaveProperty('inactiveCodes');
      
      expect(typeof stats.totalCodes).toBe('number');
      expect(typeof stats.activeCodes).toBe('number');
      expect(typeof stats.inactiveCodes).toBe('number');
      expect(typeof stats.codesByType).toBe('object');
    });
  });

  describe('validateCodeSet', () => {
    it('deve validar conjunto de códigos', async () => {
      const codes = ['001', '101', '201'];
      const result = await DCTFCodesService.validateCodeSet(codes, '2024-01');
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('validCodes');
      expect(result).toHaveProperty('invalidCodes');
      expect(result).toHaveProperty('warnings');
      
      expect(Array.isArray(result.validCodes)).toBe(true);
      expect(Array.isArray(result.invalidCodes)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('exportCodesToCSV', () => {
    it('deve exportar códigos para CSV', async () => {
      const csv = await DCTFCodesService.exportCodesToCSV();
      
      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('Código,Descrição,Tipo,Ativo');
    });

    it('deve filtrar por tipo quando especificado', async () => {
      const csv = await DCTFCodesService.exportCodesToCSV('receita');
      
      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
    });
  });
});

