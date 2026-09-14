/**
 * Testes das regras da sincronização SCI → host_dados.
 *
 * Zero mocks, zero I/O. Os números do primeiro describe são reais: empresa 94
 * em 07/2026, exatamente como o script antigo gravou — é o gabarito contra o
 * qual as consultas foram reconstruídas.
 */

import {
  mesAnterior,
  limitesDoMes,
  mesesDoIntervalo,
  montarLinhas,
  indexarEmpresas,
  ContagensSci,
} from '../hostDadosSci.rules';

const vazio: ContagensSci = { entradas: [], saidas: [], contabil: [], admissoes: [], rescisoes: [] };
const empresas = indexarEmpresas([[94, 'MARCIA SANTOS', '10.788.657/0003-80']]);

describe('montarLinhas', () => {
  it('reproduz o gabarito da empresa 94 em 07/2026', () => {
    const linhas = montarLinhas(
      { ano: 2026, mes: 7 },
      {
        ...vazio,
        entradas: [[94, 'NFe', 41], [94, 'CTe', 2]],
        saidas: [[94, 'NFe', 97], [94, 'NFCe', 184]],
        contabil: [[94, 743]],
      },
      empresas
    );

    const resumo = linhas
      .map((l) => `${l.relatorio}/${l.tipo}/${l.especie ?? '-'}=${l.movimentacao}`)
      .sort();
    expect(resumo).toEqual([
      'CTB/CTB/-=743',
      'FISE/CTe/CTe=2',
      'FISE/NFe/NFe=41',
      'FISS/NFCe/NFCe=184',
      'FISS/NFe/NFe=97',
    ]);
    for (const l of linhas) {
      expect(l).toMatchObject({ cod_emp: 94, razao: 'MARCIA SANTOS', cnpj: '10788657000380', ano: 2026, mes: 7 });
    }
  });

  it('FPG soma admissões e rescisões da mesma empresa numa linha só', () => {
    const linhas = montarLinhas({ ano: 2026, mes: 7 }, { ...vazio, admissoes: [[14, 7]], rescisoes: [[14, 3], [96, 1]] }, empresas);
    const fpg = Object.fromEntries(linhas.filter((l) => l.relatorio === 'FPG').map((l) => [l.cod_emp, l.movimentacao]));
    expect(fpg).toEqual({ 14: 10, 96: 1 });
    expect(linhas.every((l) => l.tipo === 'FPG' && l.especie === null)).toBe(true);
  });

  it('espécie com espaços ou repetida é normalizada e somada', () => {
    const linhas = montarLinhas({ ano: 2026, mes: 7 }, { ...vazio, saidas: [[94, 'NFe ', 3], [94, 'NFe', 2]] }, empresas);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tipo: 'NFe', especie: 'NFe', movimentacao: 5 });
  });

  it('espécie vazia vira OUTROS e espécie longa é cortada no tipo (VARCHAR 10)', () => {
    const linhas = montarLinhas(
      { ano: 2026, mes: 7 },
      { ...vazio, entradas: [[94, null, 1], [94, 'ESPECIE-MUITO-LONGA', 1]] },
      empresas
    );
    const porEspecie = Object.fromEntries(linhas.map((l) => [l.especie, l.tipo]));
    expect(porEspecie).toEqual({ OUTROS: 'OUTROS', 'ESPECIE-MUITO-LONGA': 'ESPECIE-MU' });
  });

  it('descarta contagem zerada e mantém empresa fora do cadastro do SCI', () => {
    const linhas = montarLinhas({ ano: 2026, mes: 7 }, { ...vazio, contabil: [[94, 0], [999, 5]] }, empresas);
    expect(linhas).toEqual([
      expect.objectContaining({ cod_emp: 999, razao: 'EMPRESA 999', cnpj: '', relatorio: 'CTB', movimentacao: 5 }),
    ]);
  });
});

describe('competências', () => {
  it('mês anterior vira o ano em janeiro', () => {
    expect(mesAnterior(new Date(2026, 8, 11))).toEqual({ ano: 2026, mes: 8 });
    expect(mesAnterior(new Date(2027, 0, 3))).toEqual({ ano: 2026, mes: 12 });
  });

  it('limites do mês respeitam fevereiro bissexto', () => {
    expect(limitesDoMes({ ano: 2026, mes: 7 })).toEqual({ ini: '2026-07-01', fim: '2026-07-31' });
    expect(limitesDoMes({ ano: 2028, mes: 2 })).toEqual({ ini: '2028-02-01', fim: '2028-02-29' });
  });

  it('intervalo que corta o mês vira o mês inteiro, atravessando o ano', () => {
    expect(mesesDoIntervalo('2026-07-10', '2026-07-20')).toEqual([{ ano: 2026, mes: 7 }]);
    expect(mesesDoIntervalo('2025-11-15', '2026-02-03')).toEqual([
      { ano: 2025, mes: 11 },
      { ano: 2025, mes: 12 },
      { ano: 2026, mes: 1 },
      { ano: 2026, mes: 2 },
    ]);
  });

  it('intervalo invertido ou mal formatado é recusado', () => {
    expect(() => mesesDoIntervalo('2026-08-01', '2026-07-31')).toThrow('maior que data final');
    expect(() => mesesDoIntervalo('2026-08-20', '2026-08-10')).toThrow('maior que data final');
    expect(() => mesesDoIntervalo('01/07/2026', '2026-07-31')).toThrow('YYYY-MM-DD');
  });
});
