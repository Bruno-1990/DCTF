/**
 * Testes para DCTFCalculationService
 */

import { DCTFCalculationService } from '../../src/services/DCTFCalculationService';

// Mock do DCTFAliquota
jest.mock('../../src/models/DCTFCode', () => ({
  DCTFAliquota: jest.fn().mockImplementation(() => ({
    findByCodeAndPeriod: jest.fn().mockResolvedValue({
      aliquota: 0.015,
      baseCalculo: 'Valor da Operação'
    })
  }))
}));

describe('DCTFCalculationService', () => {
  describe('calcularImposto', () => {
    it('deve calcular imposto corretamente', async () => {
      const result = await DCTFCalculationService.calcularImposto(
        1000,
        '201',
        '2024-01'
      );

      expect(result).toBeDefined();
      expect(result.baseCalculo).toBe(1000);
      expect(result.aliquota).toBe(0.015);
      expect(result.valorCalculado).toBe(15);
      expect(result.valorArredondado).toBe(15);
      expect(Array.isArray(result.observacoes)).toBe(true);
    });

    it('deve arredondar valor corretamente', async () => {
      const result = await DCTFCalculationService.calcularImposto(
        1000.123,
        '201',
        '2024-01'
      );

      expect(result.valorArredondado).toBe(15.00);
    });

    it('deve lançar erro para base de cálculo inválida', async () => {
      await expect(
        DCTFCalculationService.calcularImposto(-100, '201', '2024-01')
      ).rejects.toThrow('Base de cálculo inválida');
    });

    it('deve lançar erro para alíquota não encontrada', async () => {
      const { DCTFAliquota } = require('../../src/models/DCTFCode');
      const mockAliquota = new DCTFAliquota();
      mockAliquota.findByCodeAndPeriod.mockResolvedValueOnce(null);

      await expect(
        DCTFCalculationService.calcularImposto(1000, '999', '2024-01')
      ).rejects.toThrow('Alíquota não encontrada');
    });
  });

  describe('arredondarValor', () => {
    it('deve arredondar para 2 casas decimais por padrão', () => {
      const result = DCTFCalculationService.arredondarValor(15.123456);
      expect(result).toBe(15.12);
    });

    it('deve arredondar para número específico de casas decimais', () => {
      const result = DCTFCalculationService.arredondarValor(15.123456, 4);
      expect(result).toBe(15.1235);
    });

    it('deve arredondar corretamente valores negativos', () => {
      const result = DCTFCalculationService.arredondarValor(-15.123456);
      expect(result).toBe(-15.12);
    });
  });

  describe('validarTotal', () => {
    it('deve validar total correto', () => {
      const itens = [
        { valor: 100, codigo: '001' },
        { valor: 200, codigo: '002' },
        { valor: 300, codigo: '003' }
      ];

      const result = DCTFCalculationService.validarTotal(600, itens, '2024-01');

      expect(result.isValid).toBe(true);
      expect(result.totalCalculado).toBe(600);
      expect(result.totalInformado).toBe(600);
      expect(result.diferenca).toBe(0);
    });

    it('deve rejeitar total incorreto', () => {
      const itens = [
        { valor: 100, codigo: '001' },
        { valor: 200, codigo: '002' }
      ];

      const result = DCTFCalculationService.validarTotal(500, itens, '2024-01');

      expect(result.isValid).toBe(false);
      expect(result.totalCalculado).toBe(300);
      expect(result.totalInformado).toBe(500);
      expect(result.diferenca).toBe(200);
    });

    it('deve aceitar diferença dentro da tolerância', () => {
      const itens = [
        { valor: 100.005, codigo: '001' },
        { valor: 200.005, codigo: '002' }
      ];

      const result = DCTFCalculationService.validarTotal(300.01, itens, '2024-01');

      expect(result.isValid).toBe(true);
      expect(result.diferenca).toBeLessThanOrEqual(0.01);
    });
  });

  describe('calcularCompensacao', () => {
    it('deve calcular compensação corretamente', () => {
      const result = DCTFCalculationService.calcularCompensacao(1000, 500);

      expect(result.valorCompensado).toBe(500);
      expect(result.valorRestante).toBe(500);
      expect(Array.isArray(result.observacoes)).toBe(true);
    });

    it('deve aplicar limite de compensação', () => {
      const result = DCTFCalculationService.calcularCompensacao(1000, 500, 200);

      expect(result.valorCompensado).toBe(200);
      expect(result.valorRestante).toBe(800);
      expect(result.observacoes).toContain('Valor a compensar limitado a 200 conforme regras');
    });

    it('deve rejeitar valor devido negativo', () => {
      expect(() => {
        DCTFCalculationService.calcularCompensacao(-100, 500);
      }).toThrow('Valor devido não pode ser negativo');
    });

    it('deve rejeitar valor a compensar negativo', () => {
      expect(() => {
        DCTFCalculationService.calcularCompensacao(1000, -500);
      }).toThrow('Valor a compensar não pode ser negativo');
    });
  });

  describe('calcularAliquotaEfetiva', () => {
    it('deve calcular alíquota efetiva corretamente', () => {
      const result = DCTFCalculationService.calcularAliquotaEfetiva(1000, 150);

      expect(result.aliquotaEfetiva).toBe(0.15);
      expect(Array.isArray(result.observacoes)).toBe(true);
    });

    it('deve retornar zero para base de cálculo zero', () => {
      const result = DCTFCalculationService.calcularAliquotaEfetiva(0, 150);

      expect(result.aliquotaEfetiva).toBe(0);
      expect(result.observacoes).toContain('Base de cálculo zero - alíquota efetiva não aplicável');
    });

    it('deve avisar sobre alíquota negativa', () => {
      const result = DCTFCalculationService.calcularAliquotaEfetiva(1000, -150);

      expect(result.observacoes).toContain('Alíquota efetiva negativa - verificar valores');
    });

    it('deve avisar sobre alíquota superior a 100%', () => {
      const result = DCTFCalculationService.calcularAliquotaEfetiva(1000, 1500);

      expect(result.observacoes).toContain('Alíquota efetiva superior a 100% - verificar valores');
    });
  });

  describe('validarConsistenciaDCTF', () => {
    it('deve validar dados consistentes', () => {
      const result = DCTFCalculationService.validarConsistenciaDCTF({
        receitaBruta: 1000,
        deducoes: 100,
        receitaLiquida: 900,
        impostos: 150,
        periodo: '2024-01'
      });

      expect(result.isValid).toBe(true);
      expect(result.erros).toHaveLength(0);
    });

    it('deve rejeitar receita líquida inconsistente', () => {
      const result = DCTFCalculationService.validarConsistenciaDCTF({
        receitaBruta: 1000,
        deducoes: 100,
        receitaLiquida: 800, // Deveria ser 900
        impostos: 150,
        periodo: '2024-01'
      });

      expect(result.isValid).toBe(false);
      expect(result.erros.length).toBeGreaterThan(0);
    });

    it('deve rejeitar deduções que excedem receita bruta', () => {
      const result = DCTFCalculationService.validarConsistenciaDCTF({
        receitaBruta: 1000,
        deducoes: 1500, // Excede receita bruta
        receitaLiquida: -500,
        impostos: 150,
        periodo: '2024-01'
      });

      expect(result.isValid).toBe(false);
      expect(result.erros).toContain('Deduções não podem exceder receita bruta');
    });

    it('deve avisar sobre receita líquida negativa', () => {
      const result = DCTFCalculationService.validarConsistenciaDCTF({
        receitaBruta: 1000,
        deducoes: 1200,
        receitaLiquida: -200,
        impostos: 150,
        periodo: '2024-01'
      });

      expect(result.avisos).toContain('Receita líquida negativa - verificar se está correto');
    });
  });

  describe('calcularTotalImpostosPorCategoria', () => {
    it('deve calcular totais por categoria', () => {
      const itens = [
        { valor: 100, codigo: '201', categoria: 'IRRF' },
        { valor: 200, codigo: '202', categoria: 'CSLL' },
        { valor: 150, codigo: '201', categoria: 'IRRF' }
      ];

      const result = DCTFCalculationService.calcularTotalImpostosPorCategoria(itens);

      expect(result.get('IRRF')).toBe(250);
      expect(result.get('CSLL')).toBe(200);
    });

    it('deve arredondar totais corretamente', () => {
      const itens = [
        { valor: 100.123, codigo: '201', categoria: 'IRRF' },
        { valor: 200.456, codigo: '202', categoria: 'CSLL' }
      ];

      const result = DCTFCalculationService.calcularTotalImpostosPorCategoria(itens);

      expect(result.get('IRRF')).toBe(100.12);
      expect(result.get('CSLL')).toBe(200.46);
    });
  });

  describe('validarArredondamento', () => {
    it('deve validar arredondamento correto', () => {
      const result = DCTFCalculationService.validarArredondamento(15.123, 15.12);

      expect(result.isValid).toBe(true);
      expect(result.diferenca).toBeLessThanOrEqual(0.005);
    });

    it('deve rejeitar arredondamento incorreto', () => {
      const result = DCTFCalculationService.validarArredondamento(15.123, 15.10);

      expect(result.isValid).toBe(false);
      expect(result.observacoes.length).toBeGreaterThan(0);
    });
  });

  describe('calcularPercentualVariacao', () => {
    it('deve calcular percentual de variação corretamente', () => {
      const result = DCTFCalculationService.calcularPercentualVariacao(1000, 1200);

      expect(result.percentual).toBe(20);
      expect(Array.isArray(result.observacoes)).toBe(true);
    });

    it('deve calcular variação negativa', () => {
      const result = DCTFCalculationService.calcularPercentualVariacao(1000, 800);

      expect(result.percentual).toBe(-20);
    });

    it('deve lidar com valor anterior zero', () => {
      const result = DCTFCalculationService.calcularPercentualVariacao(0, 1000);

      expect(result.percentual).toBe(100);
      expect(result.observacoes).toContain('Valor anterior zero - percentual baseado apenas no valor atual');
    });

    it('deve avisar sobre variação significativa', () => {
      const result = DCTFCalculationService.calcularPercentualVariacao(1000, 2000);

      expect(result.observacoes).toContain('Variação significativa de 100.00%');
    });

    it('deve avisar sobre variação extrema', () => {
      const result = DCTFCalculationService.calcularPercentualVariacao(1000, 5000);

      expect(result.observacoes).toContain('Variação extrema de 400.00% - verificar dados');
    });
  });
});
