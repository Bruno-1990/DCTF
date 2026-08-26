/**
 * Garante que a coleta do DET dispara SÓ em dias úteis (seg-sex) no horário
 * configurado — e nunca no fim de semana ou fora da hora. Testa a decisão pura
 * `janelaDeDisparo`, sem tocar banco nem navegador.
 */
import { janelaDeDisparo } from '../../src/services/DetSchedulerRegras';

// Helper: cria uma data num dia da semana específico às hh:mm.
// 2026-08-24 é uma SEGUNDA-feira; somando dias chega-se aos demais.
function em(diaSemana: number, hh: number, mm: number): Date {
  // 24/08/2026 = segunda (getDay()===1). Ajusta o dia do mês pelo alvo.
  const base = 24 + (diaSemana - 1); // seg=24, ter=25, ... dom=30
  return new Date(2026, 7, base, hh, mm, 0);
}

describe('DetScheduler — janela seg-sex 06:00', () => {
  const HORA = 6;
  const MIN = 0;
  const UTEIS = [1, 2, 3, 4, 5];

  it.each([1, 2, 3, 4, 5])('dispara na segunda..sexta (dia %i) às 06:00', (d) => {
    expect(janelaDeDisparo(em(d, HORA, MIN), HORA, MIN, UTEIS)).toBe(true);
  });

  it('NÃO dispara no sábado às 06:00', () => {
    expect(janelaDeDisparo(em(6, HORA, MIN), HORA, MIN, UTEIS)).toBe(false);
  });

  it('NÃO dispara no domingo às 06:00', () => {
    // domingo = getDay() 0; 30/08/2026 é domingo
    expect(janelaDeDisparo(new Date(2026, 7, 30, HORA, MIN), HORA, MIN, UTEIS)).toBe(false);
  });

  it('NÃO dispara em dia útil fora da hora', () => {
    expect(janelaDeDisparo(em(3, 7, 0), HORA, MIN, UTEIS)).toBe(false); // 07:00
    expect(janelaDeDisparo(em(3, 5, 0), HORA, MIN, UTEIS)).toBe(false); // 05:00
  });

  it('NÃO dispara no minuto errado', () => {
    expect(janelaDeDisparo(em(3, HORA, 1), HORA, MIN, UTEIS)).toBe(false);
  });

  it('respeita config que inclui sábado', () => {
    expect(janelaDeDisparo(em(6, HORA, MIN), HORA, MIN, [1, 2, 3, 4, 5, 6])).toBe(true);
  });
});

describe('DetScheduler — dois horários (procurações 22h, caixas 06h)', () => {
  const UTEIS = [1, 2, 3, 4, 5];
  // quarta-feira (dia 3) = 26/08/2026
  const quarta = (hh: number, mm: number) => new Date(2026, 7, 26, hh, mm, 0);

  it('procurações dispara às 22:00 em dia útil', () => {
    expect(janelaDeDisparo(quarta(22, 0), 22, 0, UTEIS)).toBe(true);
  });
  it('caixas dispara às 06:00 em dia útil', () => {
    expect(janelaDeDisparo(quarta(6, 0), 6, 0, UTEIS)).toBe(true);
  });
  it('às 22:00 NÃO cai na janela das caixas (06:00)', () => {
    expect(janelaDeDisparo(quarta(22, 0), 6, 0, UTEIS)).toBe(false);
  });
  it('às 06:00 NÃO cai na janela das procurações (22:00)', () => {
    expect(janelaDeDisparo(quarta(6, 0), 22, 0, UTEIS)).toBe(false);
  });
  it('nenhuma das duas dispara no sábado', () => {
    const sab = new Date(2026, 7, 29, 22, 0, 0); // sábado
    expect(janelaDeDisparo(sab, 22, 0, UTEIS)).toBe(false);
    expect(janelaDeDisparo(new Date(2026, 7, 29, 6, 0, 0), 6, 0, UTEIS)).toBe(false);
  });
});
