/**
 * Regras puras do painel de agendamentos.
 *
 * São puras de propósito (nada de banco, nada de Date.now implícito): é o que
 * o painel mostra na coluna "quando roda" e o que impede salvar um horário
 * impossível. Com o relógio injetado, o teste não fica intermitente à meia-noite.
 *
 * As três janelas existentes no projeto têm semânticas DIFERENTES, e o painel
 * precisa respeitar cada uma (ver os cabeçalhos dos schedulers):
 *   mensal  — `dia >= DIA`, hora exigida só no dia exato (recupera dia perdido)
 *   diario  — `hora >= HORA`, roda assim que o servidor voltar no mesmo dia
 *   semanal — hora E minuto exatos, só nos dias da semana configurados (DET)
 */
import {
  descreverJanela,
  proximaExecucao,
  validarConfig,
  normalizarEmails,
  ErroValidacaoAgendamento,
} from '../../src/services/agendamentos/regras';
import type { AgendamentoCatalogo, AgendamentoConfig } from '../../src/services/agendamentos/tipos';

const catalogo = (over: Partial<AgendamentoCatalogo> = {}): AgendamentoCatalogo =>
  ({
    id: 'teste',
    nome: 'Teste',
    descricao: 'Job de teste',
    tipo: 'mensal',
    arquivoScheduler: 'src/services/TesteScheduler.ts',
    editavel: true,
    listasEmail: [],
    ...over,
  }) as AgendamentoCatalogo;

const cfg = (over: Partial<AgendamentoConfig> = {}): AgendamentoConfig =>
  ({ id: 'teste', ativo: true, dia: 5, hora: 1, minuto: 0, diasSemana: null, ...over }) as AgendamentoConfig;

describe('descreverJanela — texto que o painel mostra', () => {
  it('mensal vira "Todo dia X às HH:MM"', () => {
    expect(descreverJanela(catalogo({ tipo: 'mensal' }), cfg({ dia: 5, hora: 1 }))).toBe(
      'Todo dia 5 às 01:00'
    );
  });

  it('diário não cita dia do mês', () => {
    expect(descreverJanela(catalogo({ tipo: 'diario' }), cfg({ dia: null, hora: 4 }))).toBe(
      'Todos os dias às 04:00'
    );
  });

  it('semanal lista os dias em português', () => {
    const c = catalogo({ tipo: 'semanal' });
    expect(descreverJanela(c, cfg({ dia: null, hora: 6, minuto: 0, diasSemana: [1, 2, 3, 4, 5] }))).toBe(
      'Seg, ter, qua, qui e sex às 06:00'
    );
    expect(descreverJanela(c, cfg({ dia: null, hora: 22, minuto: 30, diasSemana: [1] }))).toBe(
      'Seg às 22:30'
    );
  });

  it('sob demanda e externo não inventam horário', () => {
    expect(descreverJanela(catalogo({ tipo: 'sob-demanda' }), cfg())).toBe('Sob demanda');
    expect(descreverJanela(catalogo({ tipo: 'externo' }), cfg({ dia: 25, hora: 6 }))).toBe(
      'Todo dia 25 às 06:00 (agendado fora do sistema)'
    );
  });

  it('desligado é dito na cara, sem esconder o horário configurado', () => {
    expect(descreverJanela(catalogo({ tipo: 'diario' }), cfg({ ativo: false, hora: 4 }))).toBe(
      'Desligado (rodaria todos os dias às 04:00)'
    );
  });
});

describe('proximaExecucao', () => {
  it('mensal: antes do dia, é neste mês', () => {
    const agora = new Date(2026, 8, 3, 10, 0); // 03/09 10:00
    expect(proximaExecucao(catalogo({ tipo: 'mensal' }), cfg({ dia: 5, hora: 1 }), agora)).toEqual(
      new Date(2026, 8, 5, 1, 0)
    );
  });

  it('mensal: no dia mas depois da hora, é no mês que vem', () => {
    const agora = new Date(2026, 8, 5, 2, 0);
    expect(proximaExecucao(catalogo({ tipo: 'mensal' }), cfg({ dia: 5, hora: 1 }), agora)).toEqual(
      new Date(2026, 9, 5, 1, 0)
    );
  });

  it('diário: passou da hora hoje, é amanhã', () => {
    const agora = new Date(2026, 8, 16, 9, 30);
    expect(proximaExecucao(catalogo({ tipo: 'diario' }), cfg({ dia: null, hora: 4 }), agora)).toEqual(
      new Date(2026, 8, 17, 4, 0)
    );
  });

  it('semanal: sexta depois da hora pula o fim de semana', () => {
    const sexta = new Date(2026, 8, 18, 7, 0); // 18/09/2026 é sexta
    expect(sexta.getDay()).toBe(5);
    const prox = proximaExecucao(
      catalogo({ tipo: 'semanal' }),
      cfg({ dia: null, hora: 6, minuto: 0, diasSemana: [1, 2, 3, 4, 5] }),
      sexta
    );
    expect(prox).toEqual(new Date(2026, 8, 21, 6, 0)); // segunda
  });

  it('desligado, sob demanda e externo não têm próxima execução', () => {
    const agora = new Date(2026, 8, 16, 9, 0);
    expect(proximaExecucao(catalogo({ tipo: 'diario' }), cfg({ ativo: false }), agora)).toBeNull();
    expect(proximaExecucao(catalogo({ tipo: 'sob-demanda' }), cfg(), agora)).toBeNull();
    expect(proximaExecucao(catalogo({ tipo: 'externo' }), cfg({ dia: 25, hora: 6 }), agora)).toBeNull();
  });
});

describe('validarConfig — impede salvar horário impossível', () => {
  const mensal = catalogo({ tipo: 'mensal' });

  it('aceita o que está em produção hoje', () => {
    expect(() => validarConfig(mensal, { dia: 5, hora: 1, minuto: 0 })).not.toThrow();
  });

  it.each([
    [{ hora: 24 }, /hora/i],
    [{ hora: -1 }, /hora/i],
    [{ minuto: 60 }, /minuto/i],
    [{ dia: 0 }, /dia/i],
    [{ dia: 29 }, /dia/i], // 29 a 31 não existem em todo mês: competência pulada
  ])('rejeita %p', (patch, mensagem) => {
    expect(() => validarConfig(mensal, patch as any)).toThrow(ErroValidacaoAgendamento);
    expect(() => validarConfig(mensal, patch as any)).toThrow(mensagem);
  });

  it('semanal exige ao menos um dia da semana válido', () => {
    const semanal = catalogo({ tipo: 'semanal' });
    expect(() => validarConfig(semanal, { diasSemana: [] })).toThrow(/dia da semana/i);
    expect(() => validarConfig(semanal, { diasSemana: [7] })).toThrow(/dia da semana/i);
    expect(() => validarConfig(semanal, { diasSemana: [1, 5] })).not.toThrow();
  });

  it('agendamento não editável recusa mudança de horário, mas aceita ligar/desligar', () => {
    const externo = catalogo({ tipo: 'externo', editavel: false });
    expect(() => validarConfig(externo, { hora: 7 })).toThrow(/fora do sistema|não pode/i);
    expect(() => validarConfig(externo, { ativo: false })).not.toThrow();
  });
});

describe('normalizarEmails', () => {
  it('aceita string com vírgula ou ponto e vírgula, apara e põe em minúsculo', () => {
    expect(normalizarEmails(' DP@Central-RNC.com.br ; lideres@central-rnc.com.br,')).toEqual([
      'dp@central-rnc.com.br',
      'lideres@central-rnc.com.br',
    ]);
  });

  it('remove repetidos preservando a ordem', () => {
    expect(normalizarEmails(['a@x.com', 'A@X.com', 'b@x.com'])).toEqual(['a@x.com', 'b@x.com']);
  });

  it('recusa endereço inválido dizendo qual', () => {
    expect(() => normalizarEmails('dp@central-rnc.com.br, semarroba')).toThrow(
      ErroValidacaoAgendamento
    );
    expect(() => normalizarEmails('semarroba')).toThrow(/semarroba/);
  });

  it('lista vazia é permitida (job sem aviso)', () => {
    expect(normalizarEmails('')).toEqual([]);
    expect(normalizarEmails([])).toEqual([]);
  });
});
