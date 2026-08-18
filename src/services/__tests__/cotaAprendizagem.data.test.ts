/**
 * Conversão de coluna DATE do MySQL para 'YYYY-MM-DD'.
 *
 * Existe por causa de um bug real e de dois estágios:
 *
 *  1. A data de efeito aparecia como "Tue Mar 31" na tela — `mysql2` devolve
 *     DATE como objeto `Date`, e o `String(date).slice(0,10)` que estava no
 *     lugar cortava o formato textual do JS em vez da data ISO.
 *  2. Corrigido isso, a data virava 31/03 quando o banco tinha 01/04. O pool
 *     está fixado em `timezone: '+00:00'` (src/config/mysql.ts:28), então o
 *     driver entrega meia-noite UTC; lida em UTC−3, é 21h do dia anterior.
 *
 * O segundo é o mais perigoso dos dois: erra em um dia justamente a data em
 * que a cota passa a ser exigível.
 */

import { dataParaIso } from '../CotaAprendizagemService';

describe('dataParaIso', () => {
  it('converte o objeto Date que o mysql2 devolve', () => {
    // Era este caso que produzia "Tue Mar 31".
    expect(dataParaIso(new Date('2026-03-31T00:00:00.000Z'))).toBe('2026-03-31');
    expect(dataParaIso(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    expect(dataParaIso(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31');
  });

  it('NÃO volta um dia em fuso negativo — lê em UTC, como o pool entrega', () => {
    // Com o pool em '+00:00', a DATE 2026-04-01 chega como meia-noite UTC.
    // Lendo componentes locais em UTC−3, daria 2026-03-31: um dia a menos na
    // data em que a empresa passa a dever a cota.
    const efeitoPrimeiroDeAbril = new Date('2026-04-01T00:00:00.000Z');
    expect(dataParaIso(efeitoPrimeiroDeAbril)).toBe('2026-04-01');

    // Mesmo caso na virada do ano, que é quando o erro seria mais visível.
    expect(dataParaIso(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');
  });

  it('preserva string que já vem no formato ISO', () => {
    expect(dataParaIso('2026-03-31')).toBe('2026-03-31');
    expect(dataParaIso('2026-03-31T00:00:00.000Z')).toBe('2026-03-31');
  });

  it('devolve null para ausência, sem inventar data', () => {
    expect(dataParaIso(null)).toBeNull();
    expect(dataParaIso(undefined)).toBeNull();
    expect(dataParaIso('')).toBeNull();
  });

  it('zera à esquerda mês e dia de um dígito', () => {
    expect(dataParaIso(new Date('2026-05-07T00:00:00.000Z'))).toBe('2026-05-07');
  });
});
