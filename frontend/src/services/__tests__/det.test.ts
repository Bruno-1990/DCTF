/**
 * Rótulo e tooltip da coluna de coleta da aba DET.
 *
 * O que se protege aqui é a leitura de uma linha que já confundiu na prática:
 * "1 notif." ao lado de "falhou" parece contradição — se falhou, de onde veio a
 * notificação? O rótulo curto não tem espaço para explicar; o tooltip tem, e
 * precisa dizer de quando é o registro que está na tela.
 */

import { describe, it, expect } from 'vitest';
import { rotuloColeta, tituloColeta } from '../det';

describe('rotuloColeta', () => {
  it('distingue caixa vazia conferida de nunca varrida', () => {
    expect(rotuloColeta({ ultima_coleta: null })).toBe('nunca');
    expect(
      rotuloColeta({ ultima_coleta: '2026-08-31T09:28:00Z', ultima_coleta_status: 'vazia' })
    ).toBe('sem mensagens');
  });

  it('falha na última tentativa vira "falhou"', () => {
    expect(
      rotuloColeta({ ultima_coleta: '2026-08-31T09:28:00Z', ultima_coleta_status: 'erro' })
    ).toBe('falhou');
  });
});

describe('tituloColeta', () => {
  it('em caso de falha, diz de quando é o registro que está na tela', () => {
    const t = tituloColeta({
      ultima_coleta: '2026-08-31T12:28:15Z',
      ultima_coleta_status: 'erro',
      visto_em: '2026-08-26T12:28:48Z',
      mensagens: 20,
    });
    expect(t).toContain('Falhou na última tentativa');
    expect(t).toContain('31/08');
    // A data do acervo é o ponto todo: sem ela a linha parece contraditória.
    expect(t).toContain('26/08');
    expect(t).toContain('20 mensagens');
    expect(t).toContain('não se perdeu');
  });

  it('falha sem nada coletado antes não promete registro que não existe', () => {
    const t = tituloColeta({
      ultima_coleta: '2026-08-31T12:28:15Z',
      ultima_coleta_status: 'erro',
      visto_em: null,
    });
    expect(t).toContain('Nada foi coletado');
    expect(t).not.toContain('não se perdeu');
  });

  it('uma mensagem só não vira "1 mensagens"', () => {
    const t = tituloColeta({
      ultima_coleta: '2026-08-31T12:28:15Z',
      ultima_coleta_status: 'erro',
      visto_em: '2026-08-26T12:28:48Z',
      mensagens: 1,
    });
    expect(t).toContain('1 mensagem');
    expect(t).not.toContain('1 mensagens');
  });

  it('caixa vazia conferida é diferente de nunca varrida', () => {
    expect(
      tituloColeta({ ultima_coleta: '2026-08-31T12:28:15Z', ultima_coleta_status: 'vazia' })
    ).toContain('caixa postal estava vazia');
    expect(tituloColeta({ ultima_coleta: null })).toContain('Nunca coletado');
  });

  it('coleta bem-sucedida só informa quando foi', () => {
    const t = tituloColeta({
      ultima_coleta: '2026-08-31T12:28:15Z',
      ultima_coleta_status: 'ok',
      visto_em: '2026-08-31T12:28:15Z',
      mensagens: 3,
    });
    expect(t).toContain('Coletado em');
    expect(t).not.toContain('Falhou');
  });
});
