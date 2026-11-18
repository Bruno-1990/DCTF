import { describe, expect, it } from 'vitest';
import { capitalZeradoEnquadrado, codigoNaturezaJuridica, naturezaPermiteCapitalZerado } from '../naturezaJuridica';

describe('naturezaJuridica', () => {
  it('lê o código nos formatos da ReceitaWS e do cadastro', () => {
    expect(codigoNaturezaJuridica('215-1 - Consórcio de Sociedades')).toBe('2151');
    expect(codigoNaturezaJuridica('2151')).toBe('2151');
    expect(codigoNaturezaJuridica('')).toBeNull();
    expect(codigoNaturezaJuridica(null)).toBeNull();
  });

  it('grupos 1, 3, 4 e 5 permitem capital zerado', () => {
    expect(naturezaPermiteCapitalZerado('103-1 - Órgão Público do Poder Executivo Federal')).toBe(true);
    expect(naturezaPermiteCapitalZerado('399-9 - Associação Privada')).toBe(true);
    expect(naturezaPermiteCapitalZerado('408-0 - Contribuinte individual')).toBe(true);
    expect(naturezaPermiteCapitalZerado('501-0 - Organização Internacional')).toBe(true);
  });

  it('no grupo 2 só as específicas (consórcio, empresário individual...)', () => {
    expect(naturezaPermiteCapitalZerado('215-1 - Consórcio de Sociedades')).toBe(true);
    expect(naturezaPermiteCapitalZerado('213-5 - Empresário (Individual)')).toBe(true);
    expect(naturezaPermiteCapitalZerado('206-2 - Sociedade Empresária Limitada')).toBe(false);
    expect(naturezaPermiteCapitalZerado('205-4 - Sociedade Anônima Fechada')).toBe(false);
    expect(naturezaPermiteCapitalZerado('224-0 - Sociedade Simples Limitada')).toBe(false);
  });

  it('enquadrado só com capital zerado ou vazio', () => {
    expect(capitalZeradoEnquadrado({ natureza_juridica: '215-1 - Consórcio de Sociedades', capital_social: '0.00' })).toBe(true);
    expect(capitalZeradoEnquadrado({ natureza_juridica: '215-1 - Consórcio de Sociedades', capital_social: null })).toBe(true);
    expect(capitalZeradoEnquadrado({ natureza_juridica: '215-1 - Consórcio de Sociedades', capital_social: 1000 })).toBe(false);
    expect(capitalZeradoEnquadrado({ natureza_juridica: '206-2 - Sociedade Empresária Limitada', capital_social: 0 })).toBe(false);
  });
});
