import { ValidationService } from '../../src/services/ValidationService';

describe('ValidationService - normalizações', () => {
  describe('normalizePeriodo', () => {
    it('normaliza formatos comuns para YYYY-MM', () => {
      expect(ValidationService.normalizePeriodo('2024/01')).toBe('2024-01');
      expect(ValidationService.normalizePeriodo('01-2024')).toBe('2024-01');
      expect(ValidationService.normalizePeriodo('202401')).toBe('2024-01');
      expect(ValidationService.normalizePeriodo(' 2024 - 01 ')).toBe('2024-01');
    });

    it('retorna null para formatos inválidos', () => {
      expect(ValidationService.normalizePeriodo('2024-13')).toBeNull();
      expect(ValidationService.normalizePeriodo('abcd')).toBeNull();
    });
  });

  describe('normalizeDate', () => {
    it('aceita dd/mm/yyyy e retorna Date válida', () => {
      const d = ValidationService.normalizeDate('15/01/2024');
      expect(d).toBeInstanceOf(Date);
      expect(!isNaN((d as Date).getTime())).toBe(true);
    });

    it('aceita ISO yyyy-mm-dd e retorna Date válida', () => {
      const d = ValidationService.normalizeDate('2024-01-15');
      expect(d).toBeInstanceOf(Date);
      expect(!isNaN((d as Date).getTime())).toBe(true);
    });

    it('retorna null para valores inválidos', () => {
      expect(ValidationService.normalizeDate('31/02/2024')).toBeNull();
      expect(ValidationService.normalizeDate('')).toBeNull();
    });
  });
});


