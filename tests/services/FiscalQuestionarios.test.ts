/**
 * A definição do questionário é o contrato entre a tela e o banco: a tela monta
 * o formulário a partir dela e o backend valida a resposta contra ela. Um id
 * duplicado ou um `valor` repetido dentro da mesma pergunta não quebra nada na
 * hora — só faz a resposta de uma pergunta sobrescrever a da outra no JSON,
 * silenciosamente. Estes testes existem para isso aparecer aqui, e não seis
 * meses depois quando alguém for ler o consolidado.
 */

import {
  QUESTIONARIOS,
  listarQuestionarios,
  perguntasDe,
  questionarioPorSlug,
} from '../../src/services/FiscalQuestionarios';
import {
  validarObservacoes,
  validarRespostas,
} from '../../src/services/FiscalQuestionarioService';
import { ErroValidacao } from '../../src/services/FiscalFichaService';

describe('FiscalQuestionarios — definição', () => {
  it('não tem slug repetido', () => {
    const slugs = QUESTIONARIOS.map((q) => q.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(QUESTIONARIOS.map((q) => [q.slug, q] as const))('%s', (_slug, questionario) => {
    const perguntas = perguntasDe(questionario);

    it('tem ids de pergunta únicos', () => {
      const ids = perguntas.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('numera as perguntas de 1 até o total, sem buraco', () => {
      const numeros = perguntas.map((p) => p.numero);
      expect(numeros).toEqual(Array.from({ length: perguntas.length }, (_, i) => i + 1));
    });

    it('dá a toda pergunta de opção pelo menos duas alternativas, com valores únicos', () => {
      for (const p of perguntas) {
        if (p.tipo === 'texto') continue;
        const valores = (p.opcoes ?? []).map((o) => o.valor);
        expect(valores.length).toBeGreaterThanOrEqual(2);
        expect(new Set(valores).size).toBe(valores.length);
        expect(valores.every((v) => v.trim() !== '')).toBe(true);
      }
    });

    it('não deixa enunciado nem texto de opção em branco', () => {
      for (const p of perguntas) {
        expect(p.enunciado.trim()).not.toBe('');
        for (const o of p.opcoes ?? []) expect(o.texto.trim()).not.toBe('');
      }
    });

    it('usa letras de seção únicas', () => {
      const codigos = questionario.secoes.map((s) => s.codigo);
      expect(new Set(codigos).size).toBe(codigos.length);
    });
  });

  it('o questionário do CFOP tem as 21 perguntas e as oito seções do original', () => {
    const q = questionarioPorSlug('cfop-xml-ou-sped');
    expect(q).not.toBeNull();
    expect(perguntasDe(q!)).toHaveLength(21);
    expect(q!.secoes.map((s) => s.codigo)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    // A 2 é a única de marcar mais de uma; o resto é escolha única.
    expect(perguntasDe(q!).filter((p) => p.tipo === 'multipla').map((p) => p.id)).toEqual(['q2']);
    // A H não tem pergunta: é só a caixa de observações gerais.
    const h = q!.secoes.find((s) => s.codigo === 'H')!;
    expect(h.perguntas).toHaveLength(0);
    expect(h.observacoesGerais?.placeholder).toBeTruthy();
  });

  it('resume cada questionário com o total de perguntas', () => {
    const resumos = listarQuestionarios();
    expect(resumos).toHaveLength(QUESTIONARIOS.length);
    expect(resumos[0]).toMatchObject({ slug: 'cfop-xml-ou-sped', versao: 1, totalPerguntas: 21 });
  });

  it('devolve null para slug que não existe', () => {
    expect(questionarioPorSlug('nao-existe')).toBeNull();
  });
});

describe('validarRespostas', () => {
  const q = questionarioPorSlug('cfop-xml-ou-sped')!;

  it('aceita opção única que está na lista', () => {
    expect(validarRespostas(q, { q1: 'sped_sempre' })).toEqual({ q1: 'sped_sempre' });
  });

  it('recusa valor fora das opções', () => {
    expect(() => validarRespostas(q, { q1: 'talvez' })).toThrow(ErroValidacao);
  });

  it('recusa pergunta que não existe', () => {
    expect(() => validarRespostas(q, { q99: 'sped_sempre' })).toThrow(/q99/);
  });

  it('aceita múltipla escolha como subconjunto das opções, sem repetir', () => {
    expect(validarRespostas(q, { q2: ['1126', '1653', '1126'] })).toEqual({
      q2: ['1126', '1653'],
    });
  });

  it('recusa item inválido dentro da múltipla escolha', () => {
    expect(() => validarRespostas(q, { q2: ['1126', 'xpto'] })).toThrow(ErroValidacao);
  });

  it('recusa string onde a pergunta é de múltipla escolha', () => {
    expect(() => validarRespostas(q, { q2: '1126' })).toThrow(ErroValidacao);
  });

  it('guarda a observação por pergunta sob a chave obs:<id>', () => {
    expect(validarRespostas(q, { 'obs:q1': 'ver art. 20' })).toEqual({ 'obs:q1': 'ver art. 20' });
  });

  it('recusa observação de pergunta inexistente', () => {
    expect(() => validarRespostas(q, { 'obs:q99': 'nada' })).toThrow(ErroValidacao);
  });

  it('recusa observação maior que o limite', () => {
    expect(() => validarRespostas(q, { 'obs:q1': 'x'.repeat(4001) })).toThrow(/4000/);
  });

  it('descarta o vazio: não respondido não vira chave gravada', () => {
    expect(validarRespostas(q, { q1: '', q2: [], 'obs:q1': '' })).toEqual({});
  });

  it('recusa respostas que não são objeto', () => {
    expect(() => validarRespostas(q, ['q1'])).toThrow(ErroValidacao);
  });
});

describe('validarObservacoes', () => {
  it('transforma vazio e espaços em null', () => {
    expect(validarObservacoes('   ')).toBeNull();
    expect(validarObservacoes(null)).toBeNull();
    expect(validarObservacoes(undefined)).toBeNull();
  });

  it('apara o texto', () => {
    expect(validarObservacoes('  nota  ')).toBe('nota');
  });

  it('recusa o que não é texto e o que passa do limite', () => {
    expect(() => validarObservacoes(42)).toThrow(ErroValidacao);
    expect(() => validarObservacoes('x'.repeat(4001))).toThrow(ErroValidacao);
  });
});
