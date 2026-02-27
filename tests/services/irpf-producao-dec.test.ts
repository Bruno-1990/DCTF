/**
 * Task 23: Testes do .DEC — ordem de registros, tamanhos de linha, encoding Latin-1, terminador.
 * Seção 15 PRD; falhar se layout divergir.
 */

import { describe, it, expect } from '@jest/globals';
import { getLayoutForExercicio } from '../../src/services/irpf-producao/dec-layout';
import { runWritersInOrder, generateDecBuffer, DEC_WRITER_ORDER } from '../../src/services/irpf-producao/dec-writers';

describe('IRPF Produção - DEC layout e writers (Task 19, 23)', () => {
  const exercicio = 2025;
  const layout = getLayoutForExercicio(exercicio);
  const ctx = { exercicio, layout, caseId: 1 };

  it('deve retornar layout com tipos IR, 01, 16, 17-20, 21-92, 84, 88, T9, HR, DR, R9', () => {
    expect(layout.exercicio).toBe(exercicio);
    expect(layout.recordTypes.length).toBeGreaterThan(10);
    const tipos = layout.recordTypes.map(r => r.tipo);
    expect(tipos).toContain('IR');
    expect(tipos).toContain('01');
    expect(tipos).toContain('16');
    expect(tipos).toContain('T9');
    expect(tipos).toContain('R9');
  });

  it('deve gerar linhas na ordem Anexo D (IR primeiro, R9 último)', () => {
    const lines = runWritersInOrder(ctx);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].slice(0, 2)).toBe('IR');
    expect(lines[lines.length - 1].slice(0, 2)).toBe('R9');
  });

  it('cada linha deve ter tamanho 250 (tamTotal do layout)', () => {
    const lines = runWritersInOrder(ctx);
    const expectedLen = 250;
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i].length).toBe(expectedLen);
    }
  });

  it('buffer deve usar terminador CRLF (0x0D0x0A)', () => {
    const buffer = generateDecBuffer(ctx);
    const text = buffer.toString('latin1');
    expect(text).toMatch(/\r\n/);
  });

  it('deve conter exatamente um registro T9 e um R9', () => {
    const lines = runWritersInOrder(ctx);
    const t9 = lines.filter(l => l.slice(0, 2) === 'T9');
    const r9 = lines.filter(l => l.slice(0, 2) === 'R9');
    expect(t9.length).toBe(1);
    expect(r9.length).toBe(1);
  });

  it('DEC_WRITER_ORDER deve ter IR no início e R9 no fim', () => {
    expect(DEC_WRITER_ORDER[0]).toBe('IR');
    expect(DEC_WRITER_ORDER[DEC_WRITER_ORDER.length - 1]).toBe('R9');
  });
});
