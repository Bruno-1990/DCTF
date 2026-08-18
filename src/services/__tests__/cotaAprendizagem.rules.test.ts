/**
 * Testes do motor de classificação de porte (cota de aprendizagem).
 *
 * Zero mocks, zero I/O — as funções são puras e a data entra por parâmetro.
 *
 * O que estes testes congelam, além do óbvio:
 *  - As fronteiras EXATAS. A lei diz "superior a", então o valor no limite fica
 *    na faixa de baixo. R$ 4.800.000,00 cravado é EPP, não Demais.
 *  - O caso contra-intuitivo do §9º-A: uma ME que fatura R$ 5 milhões no ano
 *    corrente PERMANECE ME até 31/12. Parece errado e é o que a lei diz.
 *  - Dado incompleto nunca produz "isenta".
 */

import {
  LIMITE_ME_CENTAVOS,
  LIMITE_EPP_CENTAVOS,
  LIMITE_20PCT_CENTAVOS,
  parseValorParaCentavos,
  centavosParaReais,
  acumularSerie,
  acumular,
  mesesFaltantes,
  mesReferencia,
  bdrefDe,
  classificarPorReceita,
  portePorRBAA,
  detectarExcesso,
  calcularDataEfeito,
  classificar,
  detectarEventos,
  diagnosticar,
  divergenciaComSimples,
  receitaZeradaSuspeita,
  limitesRelevantes,
  type MesReceita,
} from '../cotaAprendizagem.rules';

/** Gera meses 1..n todos com o mesmo valor (em centavos). */
function mesesIguais(qtd: number, centavosPorMes: number): MesReceita[] {
  return Array.from({ length: qtd }, (_, i) => ({ mes: i + 1, centavos: centavosPorMes }));
}

/** 12 meses somando exatamente `total` centavos, concentrados no mês 1. */
function anoCompleto(totalCentavos: number): MesReceita[] {
  return Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    centavos: i === 0 ? totalCentavos : 0,
  }));
}

describe('constantes legais', () => {
  it('espelham os limites da LC 123/2006 art. 3º', () => {
    expect(LIMITE_ME_CENTAVOS).toBe(36_000_000); // R$ 360.000,00
    expect(LIMITE_EPP_CENTAVOS).toBe(480_000_000); // R$ 4.800.000,00
    expect(LIMITE_20PCT_CENTAVOS).toBe(576_000_000); // R$ 5.760.000,00
    expect(LIMITE_20PCT_CENTAVOS).toBe(LIMITE_EPP_CENTAVOS * 1.2);
  });
});

describe('parseValorParaCentavos', () => {
  it('converte a string DECIMAL que o mysql2 devolve', () => {
    expect(parseValorParaCentavos('4800000.00')).toBe(480_000_000);
    expect(parseValorParaCentavos('0.01')).toBe(1);
    expect(parseValorParaCentavos('1234.56')).toBe(123456);
  });

  it('aceita vírgula decimal', () => {
    expect(parseValorParaCentavos('1234,56')).toBe(123456);
  });

  it('converte number sem o erro de float da multiplicação direta', () => {
    expect(parseValorParaCentavos(1234.56)).toBe(123456);
    // Math.round(1234.565 * 100) daria 123456 por causa do float;
    // via toFixed(2) o arredondamento é o decimal esperado.
    expect(parseValorParaCentavos(0.1 + 0.2)).toBe(30);
  });

  it('lança em entrada inválida em vez de devolver 0 silencioso', () => {
    // Um zero silencioso viraria "sem faturamento" → "ME isenta".
    expect(() => parseValorParaCentavos(null)).toThrow();
    expect(() => parseValorParaCentavos(undefined)).toThrow();
    expect(() => parseValorParaCentavos('')).toThrow();
    expect(() => parseValorParaCentavos('abc')).toThrow();
  });

  it('centavosParaReais faz o caminho de volta', () => {
    expect(centavosParaReais(480_000_000)).toBe(4_800_000);
    expect(centavosParaReais(1)).toBe(0.01);
  });
});

describe('classificarPorReceita — fronteiras exatas ("superior a")', () => {
  it('R$ 360.000,00 cravado ainda é ME', () => {
    // art. 3º, I: "receita bruta igual ou inferior a R$ 360.000,00"
    expect(classificarPorReceita(36_000_000)).toBe('ME');
  });

  it('R$ 360.000,01 já é EPP', () => {
    expect(classificarPorReceita(36_000_001)).toBe('EPP');
  });

  it('R$ 4.800.000,00 cravado ainda é EPP', () => {
    // art. 3º, II: "igual ou inferior a R$ 4.800.000,00"
    expect(classificarPorReceita(480_000_000)).toBe('EPP');
  });

  it('R$ 4.800.000,01 é Demais', () => {
    expect(classificarPorReceita(480_000_001)).toBe('DEMAIS');
  });

  it('receita zero é ME', () => {
    expect(classificarPorReceita(0)).toBe('ME');
  });
});

describe('portePorRBAA', () => {
  it('RBAA null é SEM_DADOS, nunca ME', () => {
    // Ausência de dado ≠ receita zero. Tratar como ME diria "isenta".
    expect(portePorRBAA(null)).toBe('SEM_DADOS');
  });

  it('RBAA zero (declarado) é ME', () => {
    expect(portePorRBAA(0)).toBe('ME');
  });
});

describe('acumularSerie', () => {
  it('acumula mês a mês', () => {
    const serie = acumularSerie(mesesIguais(12, 10_000_000), 12);
    expect(serie).toHaveLength(12);
    expect(serie[0]?.rbaCentavos).toBe(10_000_000);
    expect(serie[11]?.rbaCentavos).toBe(120_000_000);
    expect(serie.every((s) => !s.ausente)).toBe(true);
  });

  it('mês ausente vira null e não zero, e não interrompe o acumulado', () => {
    const meses: MesReceita[] = [
      { mes: 1, centavos: 100 },
      { mes: 3, centavos: 300 },
    ];
    const serie = acumularSerie(meses, 3);
    expect(serie[0]?.receitaMesCentavos).toBe(100);
    expect(serie[1]?.receitaMesCentavos).toBeNull();
    expect(serie[1]?.ausente).toBe(true);
    expect(serie[1]?.rbaCentavos).toBe(100); // segue com o que existe
    expect(serie[2]?.rbaCentavos).toBe(400);
  });

  it('mês presente com 0 conta como presente (zero declarado ≠ ausente)', () => {
    const serie = acumularSerie([{ mes: 1, centavos: 0 }], 1);
    expect(serie[0]?.ausente).toBe(false);
    expect(serie[0]?.receitaMesCentavos).toBe(0);
  });

  it('soma exata em centavos onde o float erraria', () => {
    // 12 × R$ 400.000,01 = R$ 4.800.000,12 exatos.
    // Em float: 12 * 400000.01 = 4800000.119999999
    const total = acumular(mesesIguais(12, 40_000_001));
    expect(total).toBe(480_000_012);
    expect(total > LIMITE_EPP_CENTAVOS).toBe(true);
  });
});

describe('mesesFaltantes', () => {
  it('lista os meses ausentes', () => {
    const meses: MesReceita[] = [
      { mes: 3, centavos: 1 },
      { mes: 4, centavos: 1 },
    ];
    expect(mesesFaltantes(meses, 6)).toEqual([1, 2, 5, 6]);
  });

  it('respeita o limite do ano corrente', () => {
    expect(mesesFaltantes(mesesIguais(7, 1), 7)).toEqual([]);
  });
});

describe('mesReferencia', () => {
  it('devolve o último mês fechado', () => {
    expect(mesReferencia(new Date(2026, 7, 14))).toEqual({ ano: 2026, mes: 7 });
  });

  it('em janeiro volta para dezembro do ano anterior', () => {
    expect(mesReferencia(new Date(2027, 0, 5))).toEqual({ ano: 2026, mes: 12 });
  });

  it('bdrefDe monta YYYYMM', () => {
    expect(bdrefDe(2026, 1)).toBe(202601);
    expect(bdrefDe(2026, 12)).toBe(202612);
  });
});

describe('progressão mês a mês (o que o job do dia 5 apura)', () => {
  /**
   * O job roda todo dia 5 e apura o último mês fechado. A cada rodada a janela
   * é: ano anterior COMPLETO (vira a RBAA) + ano corrente até o mês fechado
   * (vira a RBA). É essa RBA crescente que dispara a regra dos 20%.
   */
  it('a cada mês avança o corte do ano corrente', () => {
    const rodadas = [
      { hoje: new Date(2026, 2, 5), esperado: { ano: 2026, mes: 2 } }, // 05/mar → fev
      { hoje: new Date(2026, 7, 5), esperado: { ano: 2026, mes: 7 } }, // 05/ago → jul
      { hoje: new Date(2026, 11, 5), esperado: { ano: 2026, mes: 11 } }, // 05/dez → nov
    ];
    for (const r of rodadas) {
      expect(mesReferencia(r.hoje)).toEqual(r.esperado);
    }
  });

  it('na virada do ano, a rodada de janeiro fecha dezembro do ano anterior', () => {
    // 05/01/2027 apura dez/2026 — a última competência do ano que fechou.
    expect(mesReferencia(new Date(2027, 0, 5))).toEqual({ ano: 2026, mes: 12 });
    // Só em fevereiro o ano corrente passa a ser 2027 (e a RBAA passa a ser 2026).
    expect(mesReferencia(new Date(2027, 1, 5))).toEqual({ ano: 2027, mes: 1 });
  });

  it('a RBA acumula conforme os meses entram, e o porte só vira ao passar de 5,76 mi', () => {
    // R$ 700 mil/mês. Passa de 4,8 mi no mês 7 (4,9 mi) e de 5,76 mi no 9 (6,3 mi).
    const mensal = 70_000_000;
    const ate = (n: number) => mesesIguais(n, mensal);

    const jul = classificar({ ano: 2026, rbaaCentavos: 100_000_000, mesesAnoCorrente: ate(7), ateMes: 7 });
    expect(jul.porte).toBe('EPP'); // passou de 4,8 mi, mas ainda não de 5,76
    expect(jul.excedeTetoEpp).toBe(true);
    expect(jul.dataEfeito).toBe('2027-01-01'); // projeção, não obrigação

    const ago = classificar({ ano: 2026, rbaaCentavos: 100_000_000, mesesAnoCorrente: ate(8), ateMes: 8 });
    expect(ago.porte).toBe('EPP'); // 5,6 mi — ainda dentro dos 20%

    const set = classificar({ ano: 2026, rbaaCentavos: 100_000_000, mesesAnoCorrente: ate(9), ateMes: 9 });
    expect(set.porte).toBe('DEMAIS'); // 6,3 mi — estourou
    expect(set.motivo).toBe('EXCESSO_20PCT');
    expect(set.dataEfeito).toBe('2026-10-01'); // obrigação nasce no mês seguinte

    // E a virada aparece como evento na rodada em que aconteceu — não antes.
    expect(detectarEventos(ago, set).some((e) => e.tipo === 'VIRADA_PORTE')).toBe(true);
    expect(detectarEventos(jul, ago).some((e) => e.tipo === 'VIRADA_PORTE')).toBe(false);
  });
});

describe('detectarExcesso — os dois meses candidatos', () => {
  it('acha o mês de 4,8 mi e o de 5,76 mi separadamente', () => {
    // R$ 600.000,00/mês: passa de 4,8 mi no mês 9 (5,4 mi) e de 5,76 mi no 10 (6,0 mi)
    const serie = acumularSerie(mesesIguais(12, 60_000_000), 12);
    const r = detectarExcesso(serie);
    expect(r.mesExcessoLimite).toBe(9);
    expect(r.mesExcesso20pct).toBe(10);
    expect(r.rbaFinalCentavos).toBe(720_000_000);
  });

  it('devolve null quando nunca ultrapassa', () => {
    const r = detectarExcesso(acumularSerie(mesesIguais(12, 1_000_000), 12));
    expect(r.mesExcessoLimite).toBeNull();
    expect(r.mesExcesso20pct).toBeNull();
  });

  it('RBA exatamente em 5.760.000,00 NÃO conta como excesso acima de 20%', () => {
    // §9º-A: "não for superior a 20%" — o valor cravado fica de fora.
    const serie = acumularSerie([{ mes: 1, centavos: LIMITE_20PCT_CENTAVOS }], 1);
    const r = detectarExcesso(serie);
    expect(r.mesExcesso20pct).toBeNull();
    expect(r.mesExcessoLimite).toBe(1); // mas passou de 4,8 mi
  });

  it('R$ 5.760.000,01 conta como excesso acima de 20%', () => {
    const serie = acumularSerie([{ mes: 1, centavos: LIMITE_20PCT_CENTAVOS + 1 }], 1);
    expect(detectarExcesso(serie).mesExcesso20pct).toBe(1);
  });
});

describe('calcularDataEfeito', () => {
  it('excesso acima de 20% vale no 1º dia do mês seguinte', () => {
    expect(calcularDataEfeito({ ano: 2026, mesFato: 9, imediato: true })).toBe('2026-10-01');
  });

  it('fato em dezembro rola para 1º de janeiro do ano seguinte', () => {
    expect(calcularDataEfeito({ ano: 2026, mesFato: 12, imediato: true })).toBe('2027-01-01');
  });

  it('excesso até 20% e ME→EPP valem só em 1º de janeiro', () => {
    expect(calcularDataEfeito({ ano: 2026, mesFato: null, imediato: false })).toBe('2027-01-01');
  });
});

describe('classificar — regra dos 20% (LC 123 art. 3º §9º-A)', () => {
  it('CONTRA-INTUITIVO: ME com RBA de R$ 5 milhões PERMANECE ME no ano', () => {
    // RBAA R$ 300 mil → ME. No ano corrente fatura R$ 5,0 mi: passou de 4,8 mi,
    // mas o excesso é de 4,2% — abaixo dos 20%. Pelo §9º-A o efeito só vem em
    // 1º/jan do ano seguinte. Congelado em teste porque parece erro e não é.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: anoCompleto(500_000_000),
      ateMes: 12,
    });
    expect(r.porte).toBe('ME');
    expect(r.sujeitaCota).toBe(false);
    expect(r.excedeTetoEpp).toBe(true);
    expect(r.dataEfeito).toBe('2027-01-01');
    expect(r.motivo).toBe('RBAA');
  });

  it('RBA de R$ 5,8 milhões vira Demais dentro do ano', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: anoCompleto(580_000_000),
      ateMes: 12,
    });
    expect(r.porte).toBe('DEMAIS');
    expect(r.motivo).toBe('EXCESSO_20PCT');
    expect(r.sujeitaCota).toBe(true);
    expect(r.dataEfeito).toBe('2026-02-01'); // fato no mês 1 → efeito em fevereiro
  });

  it('a regra dos 20% vale mesmo sem RBAA — o §9º-A não depende do ano anterior', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: null,
      mesesAnoCorrente: anoCompleto(600_000_000),
      ateMes: 12,
    });
    expect(r.porteBase).toBe('SEM_DADOS');
    expect(r.porte).toBe('DEMAIS');
    expect(r.sujeitaCota).toBe(true);
  });

  it('guarda os dois meses: o que originou o enquadramento e o que antecipa a data', () => {
    // Cruza 4,8 mi no mês 9 (passa a Demais) e 5,76 mi no mês 10 (antecipa).
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: mesesIguais(12, 60_000_000),
      ateMes: 12,
    });
    expect(r.mesExcessoLimite).toBe(9);
    expect(r.mesExcesso20pct).toBe(10);
    // A data sai do mês dos 20%: 1º dia do mês SEGUINTE a ele.
    expect(r.mesFatoAplicado).toBe(10);
    expect(r.dataEfeito).toBe('2026-11-01');
    // Meses diferentes NÃO são motivo de revisão — a regra é determinada.
    expect(r.revisarJuridico).toBe(false);
  });

  it('passar de 4,8 mi já determina Demais; o excesso só define a partir de quando', () => {
    const base = { ano: 2026, rbaaCentavos: 100_000_000, ateMes: 12 };

    // Até 20% acima do teto: é Demais, mas só a partir de 1º/jan.
    const ate20 = classificar({ ...base, mesesAnoCorrente: anoCompleto(500_000_000) });
    expect(ate20.excedeTetoEpp).toBe(true);
    expect(ate20.dataEfeito).toBe('2027-01-01');
    expect(ate20.porte).toBe('EPP'); // ainda EPP durante 2026
    expect(ate20.sujeitaCota).toBe(false);

    // Acima de 20%: antecipa para o mês seguinte ao excesso, dentro do ano.
    const acima20 = classificar({
      ...base,
      mesesAnoCorrente: [{ mes: 6, centavos: 600_000_000 }],
    });
    expect(acima20.porte).toBe('DEMAIS');
    expect(acima20.dataEfeito).toBe('2026-07-01');
    expect(acima20.sujeitaCota).toBe(true);
  });
});

describe('classificar — ME → EPP (art. 3º §7º, sem regra de 20%)', () => {
  it('ME que passa de 360 mil segue ME no ano e sinaliza a virada para 1º/jan', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000, // R$ 300 mil → ME
      mesesAnoCorrente: anoCompleto(50_000_000), // R$ 500 mil no ano corrente
      ateMes: 12,
    });
    expect(r.porte).toBe('ME');
    expect(r.excedeTetoMe).toBe(true);
    expect(r.dataEfeito).toBe('2027-01-01');
  });

  it('a transição ME→EPP não muda a isenção: ambas são isentas da cota', () => {
    // IN 146/2018 art. 3º, I isenta ME e EPP igualmente.
    const me = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: anoCompleto(0),
      ateMes: 12,
    });
    const epp = classificar({
      ano: 2026,
      rbaaCentavos: 100_000_000,
      mesesAnoCorrente: anoCompleto(0),
      ateMes: 12,
    });
    expect(me.sujeitaCota).toBe(false);
    expect(epp.sujeitaCota).toBe(false);
  });
});

describe('classificar — dado incompleto', () => {
  it('RBA parcial ACIMA do limite conclui Demais com segurança (monotonicidade)', () => {
    // Faltam meses, mas o que já existe passa de 5,76 mi. Como as parcelas são
    // não-negativas, a receita real só pode ser maior — a conclusão é segura.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: [{ mes: 1, centavos: 600_000_000 }],
      ateMes: 12,
    });
    expect(r.porte).toBe('DEMAIS');
    expect(r.sujeitaCota).toBe(true);
    expect(r.dadoConfiavel).toBe(false);
    expect(r.mesesFaltantes).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('RBA parcial ABAIXO do limite NÃO conclui isenção', () => {
    // O erro caro: dizer "ME isenta" só porque faltaram meses.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: [{ mes: 1, centavos: 20_000_000 }],
      ateMes: 12,
    });
    expect(r.porte).toBe('SEM_DADOS');
    expect(r.sujeitaCota).toBeNull(); // tri-estado: não é false
  });

  it('RBAA de ano fechado em Demais mantém Demais mesmo com coleta incompleta', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 600_000_000,
      mesesAnoCorrente: [{ mes: 1, centavos: 1_000_000 }],
      ateMes: 12,
    });
    expect(r.porte).toBe('DEMAIS');
    expect(r.sujeitaCota).toBe(true);
  });

  it('sem RBAA e sem receita relevante fica SEM_DADOS', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: null,
      mesesAnoCorrente: [],
      ateMes: 12,
    });
    expect(r.porte).toBe('SEM_DADOS');
    expect(r.sujeitaCota).toBeNull();
  });

  it('ano corrente parcial (ateMes menor) não conta os meses futuros como faltantes', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 30_000_000,
      mesesAnoCorrente: mesesIguais(7, 1_000_000),
      ateMes: 7,
    });
    expect(r.mesesFaltantes).toEqual([]);
    expect(r.dadoConfiavel).toBe(true);
    expect(r.porte).toBe('ME');
  });
});

describe('classificar — impedimento societário e início de atividade', () => {
  it('sócio PJ não derruba o porte, mas impede afirmar isenção', () => {
    // Derrubar para Demais por inferência criaria obrigação real de contratar
    // aprendizes a partir de um retrato do QSA possivelmente desatualizado. Mas
    // dizer "isenta" contrariaria o art. 3º §4º, I na mesma linha em que a
    // ressalva de sócio PJ aparece. Nem sim nem não: conferir.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 10_000_000,
      mesesAnoCorrente: anoCompleto(10_000_000),
      ateMes: 12,
      impedimentoSuspeita: true,
    });
    expect(r.porte).toBe('ME');
    expect(r.sujeitaCota).toBeNull();
    expect(r.revisarJuridico).toBe(true);
    expect(r.impedimentoSocietario).toBe(true);
  });

  it('quem já é Demais não fica indefinido por causa do sócio PJ', () => {
    // A conclusão dele não dependia do quadro societário: a receita já o tirou
    // do enquadramento diferenciado, e o §4º só reforça o mesmo resultado.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 600_000_000,
      mesesAnoCorrente: anoCompleto(10_000_000),
      ateMes: 12,
      impedimentoSuspeita: true,
    });
    expect(r.porte).toBe('DEMAIS');
    expect(r.sujeitaCota).toBe(true);
  });

  it('o diagnóstico do sócio PJ manda conferir o cartão, sem afirmar faixa', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 10_000_000,
      mesesAnoCorrente: anoCompleto(10_000_000),
      ateMes: 12,
      impedimentoSuspeita: true,
    });
    const d = diagnosticar({ resultado: r, ano: 2026 });
    expect(d.situacao).toBe('INDETERMINADO');
    expect(d.sujeitaCota).toBeNull();
    expect(d.resumo).toMatch(/sócio pessoa jurídica/i);
    expect(d.resumo).toMatch(/cartão CNPJ/i);
    // E não promete folga nem prazo: não há faixa concluída para medir.
    expect(d.folgaCentavos).toBeNull();
    expect(d.dataEfeito).toBeNull();
  });

  it('início de atividade sinaliza para conferência do limite proporcional', () => {
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 10_000_000,
      mesesAnoCorrente: anoCompleto(10_000_000),
      ateMes: 12,
      inicioAtividade: true,
    });
    expect(r.revisarJuridico).toBe(true);
  });
});

describe('limitesRelevantes — cada porte só acompanha os limites que lhe dizem respeito', () => {
  it('EPP não acompanha o limite de ME', () => {
    // Avisar uma EPP de que "passou de R$ 360 mil" é ruído: esse valor está
    // dentro da faixa dela e não representa evento nenhum.
    const limites = limitesRelevantes('EPP');
    expect(limites).not.toContain(LIMITE_ME_CENTAVOS);
    expect(limites).toEqual([LIMITE_EPP_CENTAVOS, LIMITE_20PCT_CENTAVOS]);
  });

  it('ME acompanha o próprio teto e também os de EPP', () => {
    // Uma ME que estoure 20% acima de 4,8 mi vai direto a Demais no ano.
    expect(limitesRelevantes('ME')).toEqual([
      LIMITE_ME_CENTAVOS,
      LIMITE_EPP_CENTAVOS,
      LIMITE_20PCT_CENTAVOS,
    ]);
  });

  it('quem já é Demais não acompanha limite nenhum', () => {
    expect(limitesRelevantes('DEMAIS')).toEqual([]);
    expect(limitesRelevantes('SEM_DADOS')).toEqual([]);
  });
});

describe('diagnosticar — onde está, para onde vai e em que prazo', () => {
  const diag = (entrada: Parameters<typeof classificar>[0]) =>
    diagnosticar({ resultado: classificar(entrada), ano: entrada.ano });

  it('ME dentro do teto informa quanto ainda cabe', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 20_000_000, // R$ 200 mil → ME
      mesesAnoCorrente: anoCompleto(10_000_000), // R$ 100 mil no ano
      ateMes: 12,
    });
    expect(d.porteAtual).toBe('ME');
    expect(d.situacao).toBe('DENTRO_DA_FAIXA');
    expect(d.proximoPorte).toBeNull();
    expect(d.limiteDaFaixaCentavos).toBe(LIMITE_ME_CENTAVOS);
    expect(d.folgaCentavos).toBe(26_000_000); // R$ 260 mil de folga
    expect(d.sujeitaCota).toBe(false);
    expect(d.resumo).toMatch(/Ainda cabem/);
  });

  it('EPP dentro do teto mede a folga contra 4,8 mi, não contra 360 mil', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 100_000_000, // R$ 1 mi → EPP
      mesesAnoCorrente: anoCompleto(200_000_000), // R$ 2 mi
      ateMes: 12,
    });
    expect(d.porteAtual).toBe('EPP');
    expect(d.situacao).toBe('DENTRO_DA_FAIXA');
    expect(d.limiteDaFaixaCentavos).toBe(LIMITE_EPP_CENTAVOS);
    expect(d.folgaCentavos).toBe(280_000_000); // R$ 2,8 mi
    // Não pode mencionar o limite de ME em lugar nenhum.
    expect(d.resumo).not.toMatch(/360/);
  });

  it('ME que passa de 360 mil avisa a virada para EPP, e que segue isenta', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 20_000_000,
      mesesAnoCorrente: anoCompleto(50_000_000), // R$ 500 mil
      ateMes: 12,
    });
    expect(d.situacao).toBe('MUDA_EM_JANEIRO');
    expect(d.proximoPorte).toBe('EPP');
    expect(d.dataEfeito).toBe('2027-01-01');
    expect(d.sujeitaCota).toBe(false); // ME e EPP são igualmente isentas
    expect(d.resumo).toMatch(/igualmente isentas/);
  });

  it('EPP que passa de 4,8 mi avisa a virada e o prazo, mais o gatilho de antecipação', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 100_000_000,
      mesesAnoCorrente: anoCompleto(500_000_000), // R$ 5 mi — dentro dos 20%
      ateMes: 12,
    });
    expect(d.situacao).toBe('MUDA_EM_JANEIRO');
    expect(d.proximoPorte).toBe('DEMAIS');
    expect(d.dataEfeito).toBe('2027-01-01');
    expect(d.sujeitaCota).toBe(false); // ainda isenta em 2026
    expect(d.resumo).toMatch(/1º de janeiro de 2027/);
    expect(d.resumo).toMatch(/antecipa/); // avisa o que muda o prazo
  });

  it('quem estourou os 20% recebe a data em que a cota passou a ser exigível', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 100_000_000,
      mesesAnoCorrente: [{ mes: 3, centavos: 600_000_000 }],
      ateMes: 12,
    });
    expect(d.porteAtual).toBe('DEMAIS');
    expect(d.situacao).toBe('MUDOU_NO_ANO');
    expect(d.sujeitaCota).toBe(true);
    expect(d.dataEfeito).toBe('2026-04-01');
    expect(d.resumo).toMatch(/março/);
    expect(d.resumo).toMatch(/exigível/);
  });

  it('quem já era Demais pela RBAA não recebe aviso de "vai virar"', () => {
    const d = diag({
      ano: 2026,
      rbaaCentavos: 600_000_000, // ano anterior já fechou Demais
      mesesAnoCorrente: anoCompleto(10_000_000),
      ateMes: 12,
    });
    expect(d.porteAtual).toBe('DEMAIS');
    expect(d.situacao).toBe('JA_SUJEITA');
    expect(d.proximoPorte).toBeNull();
    expect(d.sujeitaCota).toBe(true);
  });

  it('quem JÁ ERA Demais e fatura alto não é descrito como "deixou de ser EPP"', () => {
    // Caso real: empresa fechou o ano anterior com R$ 28 mi e no ano corrente
    // segue faturando muito. Ela não perdeu enquadramento neste ano — já tinha
    // perdido. Rotular como EXCESSO_20PCT descreveria uma transição inexistente
    // e ainda produziria uma data de efeito no meio do ano.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 2_811_983_098, // R$ 28,1 mi no ano anterior
      mesesAnoCorrente: [{ mes: 3, centavos: 1_825_833_568 }], // R$ 18,2 mi
      ateMes: 7,
    });
    expect(r.porte).toBe('DEMAIS');
    expect(r.porteBase).toBe('DEMAIS');
    expect(r.motivo).toBe('RBAA'); // e não EXCESSO_20PCT
    expect(r.dataEfeito).toBeNull(); // não há transição a datar

    const d = diagnosticar({ resultado: r, ano: 2026 });
    expect(d.situacao).toBe('JA_SUJEITA');
    expect(d.resumo).not.toMatch(/Deixou de ser EPP/);
    expect(d.resumo).toMatch(/receita do ano anterior/i);
  });

  it('a regra dos 20% continua valendo para quem ERA EPP', () => {
    // A ressalva acima não pode desligar a regra para quem de fato era EPP.
    const r = classificar({
      ano: 2026,
      rbaaCentavos: 100_000_000, // R$ 1 mi -> EPP
      mesesAnoCorrente: [{ mes: 3, centavos: 600_000_000 }],
      ateMes: 12,
    });
    expect(r.motivo).toBe('EXCESSO_20PCT');
    expect(r.dataEfeito).toBe('2026-04-01');
  });

  it('sem dados não é apresentado como isento', () => {
    const d = diag({ ano: 2026, rbaaCentavos: null, mesesAnoCorrente: [], ateMes: 12 });
    expect(d.situacao).toBe('INDETERMINADO');
    expect(d.sujeitaCota).toBeNull();
    expect(d.resumo).toMatch(/Não é o mesmo que estar isenta/);
  });
});

describe('detectarEventos', () => {
  const base = { ano: 2026, ateMes: 12 };

  it('sem classificação anterior não inventa evento de virada', () => {
    const atual = classificar({ ...base, rbaaCentavos: 600_000_000, mesesAnoCorrente: anoCompleto(0) });
    const eventos = detectarEventos(null, atual);
    expect(eventos.filter((e) => e.tipo === 'VIRADA_PORTE')).toHaveLength(0);
  });

  it('EPP → Demais pela regra dos 20% é virada que já vale', () => {
    const anterior = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(0) });
    const atual = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(600_000_000) });
    const eventos = detectarEventos(anterior, atual);
    const virada = eventos.find((e) => e.tipo === 'VIRADA_PORTE');
    expect(virada).toBeDefined();
    expect(virada?.de).toBe('EPP');
    expect(virada?.para).toBe('DEMAIS');
    expect(virada?.vigencia).toBe('MES_SEGUINTE');
  });

  it('passar de 4,8 mi sem estourar os 20% é PROJEÇÃO, não virada', () => {
    const anterior = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(0) });
    const atual = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(500_000_000) });
    const eventos = detectarEventos(anterior, atual);
    expect(eventos.some((e) => e.tipo === 'VIRADA_PORTE')).toBe(false);
    const proj = eventos.find((e) => e.tipo === 'PROJECAO_EPP_DEMAIS');
    expect(proj?.vigencia).toBe('PRIMEIRO_JAN');
  });

  it('ME que passa de 360 mil gera projeção ME→EPP', () => {
    const anterior = classificar({ ...base, rbaaCentavos: 30_000_000, mesesAnoCorrente: anoCompleto(0) });
    const atual = classificar({ ...base, rbaaCentavos: 30_000_000, mesesAnoCorrente: anoCompleto(50_000_000) });
    const proj = detectarEventos(anterior, atual).find((e) => e.tipo === 'PROJECAO_ME_EPP');
    expect(proj).toBeDefined();
    expect(proj?.vigencia).toBe('PRIMEIRO_JAN');
  });

  it('projeção NÃO se repete enquanto o valor segue acima do limite', () => {
    // Sem isso, o mesmo cliente reapareceria no e-mail todo mês até dezembro.
    const mes1 = classificar({ ...base, rbaaCentavos: 30_000_000, mesesAnoCorrente: anoCompleto(50_000_000) });
    const mes2 = classificar({ ...base, rbaaCentavos: 30_000_000, mesesAnoCorrente: anoCompleto(60_000_000) });
    expect(detectarEventos(mes1, mes2).some((e) => e.tipo === 'PROJECAO_ME_EPP')).toBe(false);
  });

  it('queda de porte é registrada como regressão', () => {
    const anterior = classificar({ ...base, rbaaCentavos: 600_000_000, mesesAnoCorrente: anoCompleto(0) });
    const atual = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(0) });
    const evento = detectarEventos(anterior, atual)[0];
    expect(evento?.tipo).toBe('REGRESSAO');
    expect(evento?.de).toBe('DEMAIS');
    expect(evento?.para).toBe('EPP');
  });

  it('entrar ou sair de SEM_DADOS não vira evento de mudança', () => {
    // Perder a coleta de um cliente não é "a empresa mudou de porte".
    const comDado = classificar({ ...base, rbaaCentavos: 100_000_000, mesesAnoCorrente: anoCompleto(0) });
    const semDado = classificar({ ...base, rbaaCentavos: null, mesesAnoCorrente: [] });
    expect(detectarEventos(comDado, semDado)).toHaveLength(0);
    expect(detectarEventos(semDado, comDado)).toHaveLength(0);
  });
});

describe('divergência com o Simples Nacional', () => {
  // O teto do Simples é o MESMO teto de EPP (R$ 4,8 mi), então o regime do
  // cadastro e a receita apurada falam do mesmo fato — e não podem discordar.
  const div = (regimeTributario: string | null, reais: number | null) =>
    divergenciaComSimples({
      regimeTributario,
      rbaCentavos: reais === null ? null : reais * 100,
    });

  it('acusa optante do Simples com receita acima do teto', () => {
    // Caso real: cadastro em SIMPLES NACIONAL com R$ 18,2 mi apurados. Ou o
    // regime está desatualizado, ou o faturamento veio do lugar errado.
    expect(div('SIMPLES NACIONAL', 18_258_335.68)).toBe(true);
  });

  it('não acusa optante dentro do teto', () => {
    expect(div('SIMPLES NACIONAL', 4_800_000)).toBe(false);
    expect(div('SIMPLES NACIONAL', 100_000)).toBe(false);
  });

  it('não acusa quem não é optante — a recíproca não vale', () => {
    // Estar fora do Simples não diz nada sobre porte: a opção é facultativa e
    // o art. 17 tem vedações que nada têm a ver com receita.
    expect(div('LUCRO PRESUMIDO', 18_000_000)).toBe(false);
    expect(div('LUCRO REAL', 90_000)).toBe(false);
    expect(div(null, 18_000_000)).toBe(false);
  });

  it('sem receita apurada não há o que confrontar', () => {
    expect(div('SIMPLES NACIONAL', null)).toBe(false);
  });

  it('reconhece a grafia do cadastro sem depender de maiúsculas', () => {
    expect(div('Simples Nacional', 9_000_000)).toBe(true);
    expect(div('SIMPLES', 9_000_000)).toBe(true);
  });

  it('o sublimite de R$ 3,6 mi não entra nesta conta', () => {
    // Ele só regula a saída do ICMS/ISS do DAS — não muda porte nem cota.
    expect(div('SIMPLES NACIONAL', 3_700_000)).toBe(false);
  });
});

describe('receita zerada — ausência de dado disfarçada de fato', () => {
  // Doze meses de zeros e doze meses ausentes chegam ao motor como coisas
  // diferentes, mas o SCI produz zero também quando simplesmente não tem o
  // histórico: cliente que entrou no escritório depois, ou código trocado.
  const z = (over: Partial<Parameters<typeof receitaZeradaSuspeita>[0]> = {}) =>
    receitaZeradaSuspeita({
      ano: 2026,
      aberturaIso: '2017-12-08',
      rbaaCentavos: 0,
      rbaCentavos: 503_032_327,
      mesesFaltantes: [],
      ...over,
    });

  it('acusa ano anterior zerado quando a empresa já existia', () => {
    // Caso real: aberta em 2017, R$ 5,03 mi em 2026 e "zero" em 2025 inteiro.
    // Sem a ressalva, essa RBAA zerada a classifica como ME — logo, isenta.
    expect(z().anoAnterior).toBe(true);
  });

  it('não acusa quem abriu no meio do ano anterior', () => {
    // Fechar em zero o ano em que se abriu é o esperado, não a exceção.
    expect(z({ aberturaIso: '2025-03-13' }).anoAnterior).toBe(false);
  });

  it('não acusa quem abriu no ano corrente', () => {
    expect(z({ aberturaIso: '2026-01-27' }).anoAnterior).toBe(false);
    expect(z({ aberturaIso: '2026-01-27' }).anoCorrente).toBe(false);
  });

  it('ano anterior AUSENTE não é ano anterior zerado', () => {
    // `null` já é tratado pelo motor como desconhecido; a ressalva é para o
    // zero, que passa por fato consumado.
    expect(z({ rbaaCentavos: null }).anoAnterior).toBe(false);
  });

  it('acusa o ano corrente zerado de quem faturou no ano anterior', () => {
    expect(z({ rbaCentavos: 0, rbaaCentavos: 50_000_000 }).anoCorrente).toBe(true);
  });

  it('zerado nos DOIS anos é cobertura de dados, não contradição', () => {
    // Sem essa separação, 47 dos 217 clientes caíam na mesma fila dos casos
    // realmente contraditórios — e fila cheia é fila que ninguém confere.
    const r = z({ rbaCentavos: 0, rbaaCentavos: 0 });
    expect(r.semFaturamento).toBe(true);
    expect(r.anoAnterior).toBe(false);
    expect(r.anoCorrente).toBe(false);
  });

  it('com meses faltando, zero no ano corrente não conclui nada', () => {
    // Sem os meses, o zero é só ausência — e disso o motor já cuida.
    expect(z({ rbaCentavos: 0, mesesFaltantes: [3, 4] }).anoCorrente).toBe(false);
  });

  it('sem data de abertura não há como julgar', () => {
    expect(z({ aberturaIso: null })).toEqual({
      anoAnterior: false,
      anoCorrente: false,
      semFaturamento: false,
    });
  });

  it('receita real no ano anterior não gera ressalva', () => {
    expect(z({ rbaaCentavos: 50_000_000 }).anoAnterior).toBe(false);
  });
});
