import {
  diferencaEmDias,
  calcularDiasAteVencimento,
  calcularVencimento,
} from '../../src/services/conferences/utils/dateUtils';

/**
 * O bug que motivou estes testes: no PRÓPRIO dia do vencimento a tela
 * anunciava "1 dia vencido". A conta comparava instantes — vencimento fixado
 * ao meio-dia UTC contra o horário atual — e arredondava para baixo, então
 * bastava passar das 9h da manhã para a diferença virar negativa.
 *
 * Anunciar atraso a quem ainda está no prazo é pior que não avisar: convida a
 * ignorar o alerta.
 */
describe('diferencaEmDias', () => {
  // Vencimento de 06/2026 = 31/07/2026 (último dia útil do mês seguinte).
  const vencimento = calcularVencimento(2026, 6);

  it('devolve 0 no próprio dia do vencimento, a qualquer hora', () => {
    for (const hora of [0, 9, 12, 18, 23]) {
      const hoje = new Date(2026, 6, 31, hora, 30, 0); // 31/07/2026, hora local
      expect(diferencaEmDias(vencimento, hoje)).toBe(0);
    }
  });

  it('devolve positivo antes do vencimento', () => {
    expect(diferencaEmDias(vencimento, new Date(2026, 6, 30, 23, 59))).toBe(1);
    expect(diferencaEmDias(vencimento, new Date(2026, 6, 24, 0, 1))).toBe(7);
  });

  it('devolve negativo depois do vencimento', () => {
    expect(diferencaEmDias(vencimento, new Date(2026, 7, 1, 0, 1))).toBe(-1);
    expect(diferencaEmDias(vencimento, new Date(2026, 7, 5, 18, 0))).toBe(-5);
  });

  it('não depende da hora do dia — a virada é à meia-noite, não ao meio-dia', () => {
    const vespera23h = diferencaEmDias(vencimento, new Date(2026, 6, 30, 23, 59, 59));
    const diaSeguinte0h = diferencaEmDias(vencimento, new Date(2026, 6, 31, 0, 0, 1));
    expect(vespera23h).toBe(1);
    expect(diaSeguinte0h).toBe(0);
  });
});

describe('calcularDiasAteVencimento', () => {
  it('no dia do vencimento não acusa atraso', () => {
    // 31/07/2026 é sexta-feira: o vencimento de 06/2026 cai nele.
    expect(calcularDiasAteVencimento(2026, 6, new Date(2026, 6, 31, 14, 0))).toBe(0);
  });

  it('acusa atraso só a partir do dia seguinte', () => {
    expect(calcularDiasAteVencimento(2026, 6, new Date(2026, 7, 1, 0, 5))).toBe(-1);
  });
});
