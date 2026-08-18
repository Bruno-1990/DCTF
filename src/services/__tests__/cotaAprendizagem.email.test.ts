/**
 * Testes da montagem do e-mail mensal da cota de aprendizagem.
 *
 * Função pura — nenhum SMTP é tocado aqui. O que estes testes protegem é o
 * conteúdo: separar o que JÁ é obrigação do que ainda é aviso, e nunca
 * apresentar cliente sem dado como cliente isento.
 */

import {
  separarSecoes,
  calcularTotalizadores,
  avaliarSuscetibilidade,
  mediaMensalCentavos,
  montarHtmlCota,
  montarHtmlEnquadramento,
  labelCompetencia,
  formatCnpj,
  esc,
  COTA_PAGE_URL,
} from '../cotaAprendizagem.email';
import type { LinhaClassificacao } from '../CotaAprendizagemService';

function linha(over: Partial<LinhaClassificacao> = {}): LinhaClassificacao {
  return {
    id: 'c1',
    razao_social: 'EMPRESA TESTE LTDA',
    cnpj: '11222333000181',
    codigo_sci: 85,
    uf: 'ES',
    porte_declarado: 'DEMAIS',
    abertura: null,
    ano: 2026,
    mes: 7,
    bdref: 202607,
    rbaa: 100000,
    rba: 200000,
    porte: 'EPP',
    porte_base: 'EPP',
    motivo: 'RBAA',
    sujeita_cota: false,
    excede_teto_epp: false,
    excede_teto_me: false,
    mes_excesso_limite: null,
    mes_excesso_20pct: null,
    data_efeito: null,
    meses_faltantes: 0,
    meses_faltantes_lista: null,
    dado_confiavel: true,
    impedimento_societario: false,
    inicio_atividade: false,
    revisar_juridico: false,
    revisar_motivos: [],
    porte_anterior: 'EPP',
    mudou: false,
    eventos: [],
    diagnostico: {
      porteAtual: 'EPP',
      proximoPorte: null,
      situacao: 'DENTRO_DA_FAIXA',
      limiteDaFaixaCentavos: 480_000_000,
      folgaCentavos: 460_000_000,
      percentualDoLimite: 4.17,
      dataEfeito: null,
      resumo: 'Dentro do teto de EPP.',
      sujeitaCota: false,
    },
    ...over,
  };
}

/**
 * Monta os e-mails do jeito que o serviço monta — separando seções e
 * calculando totalizadores a partir da MESMA lista. Rodar as etapas juntas é o
 * que garante que os números do cabeçalho batem com as listas logo abaixo.
 */
function entrada(clientes: LinhaClassificacao[], semCodigoSci = 0) {
  const secoes = separarSecoes(clientes);
  return {
    ano: 2026,
    mes: 7,
    secoes,
    totais: calcularTotalizadores(clientes, secoes, semCodigoSci),
  };
}

/** E-mail do Fiscal. */
const renderPorte = (clientes: LinhaClassificacao[], semCodigoSci = 0): string =>
  montarHtmlEnquadramento(entrada(clientes, semCodigoSci));

/** E-mail do Departamento Pessoal. */
const renderCota = (clientes: LinhaClassificacao[], semCodigoSci = 0): string =>
  montarHtmlCota(entrada(clientes, semCodigoSci));

describe('helpers de formatação', () => {
  it('labelCompetencia usa o mês por extenso', () => {
    expect(labelCompetencia(2026, 7)).toBe('julho de 2026');
    expect(labelCompetencia(2026, 12)).toBe('dezembro de 2026');
  });

  it('formatCnpj mascara 14 dígitos e devolve o original quando não dá', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('123')).toBe('123');
    expect(formatCnpj(null)).toBe('—');
  });

  it('esc neutraliza HTML vindo do cadastro', () => {
    // Razão social é texto livre digitado por gente.
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(esc('CIA & CIA')).toBe('CIA &amp; CIA');
  });
});

describe('separarSecoes', () => {
  it('quem virou Demais pela regra dos 20% entra na seção de efeito imediato', () => {
    const c = linha({
      mudou: true,
      porte: 'DEMAIS',
      motivo: 'EXCESSO_20PCT',
      porte_anterior: 'EPP',
      data_efeito: '2026-10-01',
    });
    const s = separarSecoes([c]);
    expect(s.viraramDemais).toHaveLength(1);
    expect(s.projecaoDemais).toHaveLength(0);
  });

  it('quem passou de 4,8 mi sem estourar 20% é projeção, não virada', () => {
    const c = linha({ excede_teto_epp: true, porte: 'EPP', data_efeito: '2027-01-01' });
    const s = separarSecoes([c]);
    expect(s.viraramDemais).toHaveLength(0);
    expect(s.projecaoDemais).toHaveLength(1);
  });

  it('quem já virou Demais não aparece também como projeção', () => {
    // Sem isso o mesmo cliente sairia duas vezes no e-mail, em seções que se
    // contradizem ("já vale" e "vai valer em janeiro").
    const c = linha({
      mudou: true,
      porte: 'DEMAIS',
      motivo: 'EXCESSO_20PCT',
      excede_teto_epp: true,
      porte_anterior: 'EPP',
    });
    const s = separarSecoes([c]);
    expect(s.viraramDemais).toHaveLength(1);
    expect(s.projecaoDemais).toHaveLength(0);
    expect(s.projecaoEpp).toHaveLength(0);
  });

  it('ME que passou de 360 mil entra na projeção ME→EPP', () => {
    const s = separarSecoes([linha({ porte: 'ME', excede_teto_me: true })]);
    expect(s.projecaoEpp).toHaveLength(1);
  });

  it('quem deixou de ser Demais entra em regressões', () => {
    const s = separarSecoes([
      linha({ mudou: true, porte: 'EPP', porte_anterior: 'DEMAIS' }),
    ]);
    expect(s.regressoes).toHaveLength(1);
  });

  it('separa os sem dados e os marcados para o jurídico', () => {
    const s = separarSecoes([
      linha({ porte: 'SEM_DADOS', sujeita_cota: null }),
      linha({ id: 'c2', revisar_juridico: true }),
    ]);
    expect(s.semDados).toHaveLength(1);
    expect(s.revisarJuridico).toHaveLength(1);
  });

  it('ME que passou dos 4,8 mi vai para Demais, não para EPP', () => {
    // Os dois tetos foram ultrapassados no mesmo ano; anunciar "passa a EPP"
    // em 1º/jan seria dar dois destinos diferentes para a mesma data.
    const s = separarSecoes([
      linha({ porte: 'ME', rba: 4_900_000, excede_teto_me: true, excede_teto_epp: true }),
    ]);
    expect(s.projecaoDemais).toHaveLength(1);
    expect(s.projecaoEpp).toHaveLength(0);
  });

  it('suscetível não aparece também na projeção de 1º/jan', () => {
    // Ele está nas duas rotas (antecipa ou vira em janeiro), mas listá-lo duas
    // vezes faria parecer dois clientes e inflaria a contagem.
    const c = linha({ porte: 'EPP', rba: 5_500_000, excede_teto_epp: true });
    const s = separarSecoes([c]);
    expect(s.suscetiveis).toHaveLength(1);
    expect(s.projecaoDemais).toHaveLength(0);
  });

  it('ordena as listas pelo acumulado, do maior para o menor', () => {
    const s = separarSecoes([
      // Valores cuja projeção ainda não alcança R$ 5,76 mi — senão eles saem
      // desta lista e vão para a seção de suscetíveis.
      linha({ id: 'a', razao_social: 'MENOR', rba: 4_500_000, excede_teto_epp: true }),
      linha({ id: 'b', razao_social: 'MAIOR', rba: 4_700_000, excede_teto_epp: true }),
    ]);
    expect(s.projecaoDemais.map((c) => c.razao_social)).toEqual(['MAIOR', 'MENOR']);
  });
});

describe('suscetibilidade — pode virar Demais já no mês seguinte', () => {
  it('a média mensal divide pelos meses COM dado, não pelo mês de referência', () => {
    // Dividir por 7 quando só 4 meses vieram produz média baixa demais e
    // esconde justamente quem está prestes a estourar.
    const c = linha({ rba: 400_000, mes: 7, meses_faltantes: 3, dado_confiavel: false });
    expect(mediaMensalCentavos(c)).toBe(10_000_000); // 400.000 / 4 = 100.000
  });

  it('acusa quem, pela própria média, passa de R$ 5,76 mi no mês seguinte', () => {
    const s = avaliarSuscetibilidade(linha({ porte: 'EPP', rba: 5_500_000, mes: 7 }));
    expect(s).not.toBeNull();
    // Média 5.500.000/7 ≈ 785.714 → projeção acima do limite dos 20%.
    expect(s!.projecaoCentavos).toBeGreaterThan(576_000_000);
    expect(s!.faltaCentavos).toBe(576_000_000 - 550_000_000);
    // Estourando em agosto, a cota passa a ser exigível em 1º de setembro.
    expect(s!.dataEfeitoPrevista).toBe('2026-09-01');
  });

  it('acusa quem para a poucos milhares do limite — o corte estrito erraria aqui', () => {
    // Caso real de julho/2026: R$ 5,03 mi em 7 meses. A média projeta R$ 5,749
    // mi — R$ 11 mil abaixo do limite. Sem margem de variação, o cliente que
    // mais precisa do aviso é justamente o que fica de fora.
    const s = avaliarSuscetibilidade(linha({ porte: 'EPP', rba: 5_030_323.27, mes: 7 }));
    expect(s).not.toBeNull();
    expect(s!.projecaoCentavos).toBeLessThan(576_000_000); // a média sozinha não estoura
  });

  it('não acusa quem precisaria de mais de um mês típico para estourar', () => {
    // 4.500.000/7 ≈ 642.857 → faltam 1,26 mi, quase o dobro de um mês.
    expect(avaliarSuscetibilidade(linha({ porte: 'EPP', rba: 4_500_000, mes: 7 }))).toBeNull();
  });

  it('quem já passou de R$ 5,76 mi não é suscetibilidade, é fato consumado', () => {
    expect(avaliarSuscetibilidade(linha({ porte: 'EPP', rba: 5_800_000, mes: 7 }))).toBeNull();
  });

  it('em dezembro não há mês seguinte dentro do ano-calendário', () => {
    // A RBA zera em janeiro — projetar a virada aqui seria inventar um fato.
    expect(
      avaliarSuscetibilidade(linha({ porte: 'EPP', rba: 5_500_000, mes: 12, bdref: 202612 }))
    ).toBeNull();
  });

  it('não projeta quem já é Demais nem quem está sem dados', () => {
    expect(
      avaliarSuscetibilidade(linha({ porte: 'DEMAIS', sujeita_cota: true, rba: 5_500_000 }))
    ).toBeNull();
    expect(
      avaliarSuscetibilidade(linha({ porte: 'SEM_DADOS', sujeita_cota: null, rba: 5_500_000 }))
    ).toBeNull();
  });
});

describe('calcularTotalizadores', () => {
  it('conta o mês inteiro por porte e por situação da cota', () => {
    const clientes = [
      linha({ id: '1', porte: 'ME', sujeita_cota: false }),
      linha({ id: '2', porte: 'EPP', sujeita_cota: false }),
      linha({ id: '3', porte: 'DEMAIS', sujeita_cota: true, rba: 6_000_000 }),
      linha({ id: '4', porte: 'SEM_DADOS', sujeita_cota: null }),
    ];
    const t = calcularTotalizadores(clientes, separarSecoes(clientes), 5);
    expect(t).toMatchObject({
      avaliados: 4,
      me: 1,
      epp: 1,
      demais: 1,
      semDados: 1,
      sujeitas: 1,
      isentas: 2,
      semCodigoSci: 5,
    });
  });

  it('sem dados não entra em isentas — nem em sujeitas', () => {
    const clientes = [linha({ porte: 'SEM_DADOS', sujeita_cota: null })];
    const t = calcularTotalizadores(clientes, separarSecoes(clientes));
    expect(t.isentas).toBe(0);
    expect(t.sujeitas).toBe(0);
    expect(t.semDados).toBe(1);
  });

  it('soma a receita acumulada ignorando quem não tem RBA', () => {
    const clientes = [
      linha({ id: '1', rba: 1_000_000 }),
      linha({ id: '2', rba: 500_000 }),
      linha({ id: '3', rba: null, porte: 'SEM_DADOS', sujeita_cota: null }),
    ];
    expect(calcularTotalizadores(clientes, separarSecoes(clientes)).rbaTotal).toBe(1_500_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A SEPARAÇÃO EM DOIS AVISOS
//
// A apuração é uma só, mas quem lê é diferente: o Fiscal cuida do porte, o
// Departamento Pessoal cuida da obrigação de contratar aprendiz. Estes testes
// protegem justamente o que a separação promete — que nenhum dos dois receba o
// assunto do outro.
// ─────────────────────────────────────────────────────────────────────────────

describe('separação entre os dois avisos', () => {
  const meEpp = linha({ razao_social: 'SOBE PARA EPP LTDA', porte: 'ME', excede_teto_me: true });

  it('ME→EPP entra no e-mail do Fiscal e NÃO no do DP', () => {
    // É a linha que mais confundia: para a cota, ME e EPP são igualmente
    // isentas, então essa transição não muda nada para o Departamento Pessoal.
    expect(renderPorte([meEpp])).toContain('SOBE PARA EPP LTDA');
    expect(renderCota([meEpp])).not.toContain('SOBE PARA EPP LTDA');
    expect(renderCota([meEpp])).not.toContain('ME a EPP');
  });

  it('o e-mail do Fiscal não fala de cota nem de aprendiz', () => {
    const html = renderPorte([
      linha({ mudou: true, porte: 'DEMAIS', motivo: 'EXCESSO_20PCT', porte_anterior: 'EPP' }),
      meEpp,
    ]);
    // A URL da tela é a mesma nos dois avisos (`?tab=cota-aprendizagem`) e não
    // é texto que alguém leia — o que se checa aqui é a cópia visível.
    const copia = html.split(COTA_PAGE_URL).join('');
    expect(copia).not.toMatch(/cota/i);
    expect(copia).not.toMatch(/aprendiz/i);
  });

  it('o e-mail do DP fala de obrigação, não de faixa de porte', () => {
    const html = renderCota([linha({ porte: 'DEMAIS', sujeita_cota: true })]);
    expect(html).toContain('Sujeitas à cota');
    expect(html).toContain('sujeitas à cota');
    // A distribuição ME/EPP é assunto do outro aviso.
    expect(html).not.toContain('até R$ 360 mil');
  });

  it('cada aviso leva o seu título', () => {
    expect(renderPorte([linha()])).toContain('Enquadramento de Porte');
    expect(renderPorte([linha()])).not.toContain('Cota de Aprendizagem');
    expect(renderCota([linha()])).toContain('Cota de Aprendizagem');
    expect(renderCota([linha()])).not.toContain('Enquadramento de Porte');
  });

  it('os dois usam a mesma moldura e o mesmo botão', () => {
    for (const html of [renderPorte([linha()]), renderCota([linha()])]) {
      expect(html).toContain('Sistema DCTF');
      expect(html).toContain('Totalizadores');
      expect(html).toContain('Movimento da competência');
      expect(html).toContain('Se o botão não funcionar');
    }
  });
});

describe('montarHtmlEnquadramento (Fiscal)', () => {
  it('sem mudanças, envia mensagem curta em vez de silêncio', () => {
    // Silêncio é ambíguo entre "nada mudou" e "o job morreu".
    const html = renderPorte(Array.from({ length: 3 }, (_, i) => linha({ id: `c${i}` })), 3);
    expect(html).toContain('Nenhuma mudança de porte em julho de 2026');
  });

  it('o painel mostra a distribuição por porte', () => {
    const html = renderPorte([
      linha({ id: '1', porte: 'ME', sujeita_cota: false }),
      linha({ id: '2', porte: 'DEMAIS', sujeita_cota: true }),
    ]);
    expect(html).toContain('2 clientes avaliados');
    expect(html).toContain('até R$ 360 mil'); // faixa da ME
    expect(html).toContain('Demais');
    
  });

  it('no quadro de movimento o zero também é informação', () => {
    // Diferente das seções: aqui a linha existe para dizer "conferido, nenhum".
    const html = renderPorte([linha()]);
    expect(html).toContain('Podem virar Demais já no mês seguinte');
    expect(html).toContain('Viram Demais em 1º/jan/2027');
    expect(html).toContain('Passam de ME a EPP em 1º/jan/2027');
  });

  it('mostra a data em que o enquadramento foi perdido', () => {
    const html = renderPorte([
      linha({
        mudou: true,
        porte: 'DEMAIS',
        motivo: 'EXCESSO_20PCT',
        porte_anterior: 'EPP',
        rba: 5800000,
        data_efeito: '2026-10-01',
      }),
    ]);
    expect(html).toContain('01/10/2026');
    expect(html).toContain('perderam o enquadramento de EPP');
  });

  it('detalha quem pode virar Demais no mês seguinte, com o quanto falta', () => {
    const html = renderPorte([
      linha({ razao_social: 'PERTO DO LIMITE LTDA', porte: 'EPP', rba: 5_500_000 }),
    ]);
    expect(html).toContain('Podem virar Demais já em agosto');
    expect(html).toContain('PERTO DO LIMITE LTDA');
    expect(html).toContain('faltam');
    expect(html).toContain('01/09/2026'); // efeito se o excesso se confirmar
    // E deixa explícito que é projeção — ninguém deve tratar isso como fato.
    expect(html).toContain('Projeção, não fato');
  });

  it('lista de mudança de enquadramento é COMPLETA, nunca truncada', () => {
    // Saber quantas são não basta: o analista precisa saber quais avisar.
    const muitos = Array.from({ length: 12 }, (_, i) =>
      linha({ id: `c${i}`, razao_social: `EMPRESA ${i}`, porte: 'ME', excede_teto_me: true })
    );
    const html = renderPorte(muitos);
    expect(html).toContain('EMPRESA 11');
    expect(html).not.toContain('e mais');
  });

  it('o que é só registro continua truncado', () => {
    // Regressão não gera ação nem prazo — aqui o que importa é o número.
    const muitos = Array.from({ length: 12 }, (_, i) =>
      linha({
        id: `c${i}`,
        razao_social: `REGREDIU ${i}`,
        mudou: true,
        porte: 'EPP',
        porte_anterior: 'DEMAIS',
      })
    );
    const html = renderPorte(muitos);
    expect(html).toContain('e mais 4');
    expect(html).not.toContain('REGREDIU 11');
  });

  it('não renderiza seção vazia — os zeros ficam só nos totalizadores', () => {
    const html = renderPorte([
      linha({ mudou: true, porte: 'DEMAIS', motivo: 'EXCESSO_20PCT', porte_anterior: 'EPP' }),
    ]);
    expect(html).toContain('Passaram a Demais neste ano');
    expect(html).not.toContain('· acumulado no ano');
    expect(html).not.toContain('· passaram de R$ 360 mil');
    expect(html).not.toContain('· projeção pela média mensal');
  });

  it('avisa quando o acumulado é um piso por falta de meses', () => {
    const html = renderPorte([
      linha({
        mudou: true,
        porte: 'DEMAIS',
        motivo: 'EXCESSO_20PCT',
        porte_anterior: 'EPP',
        dado_confiavel: false,
        meses_faltantes: 4,
      }),
    ]);
    expect(html).toContain('4 meses sem dado');
  });

  it('deixa explícito que sem dado não é isento', () => {
    const html = renderPorte([linha({ porte: 'SEM_DADOS', sujeita_cota: null })], 2);
    expect(html).toMatch(/não são isentas/);
  });

  it('não mostra ressalva de cobertura quando o número é zero', () => {
    const html = renderPorte([linha()]);
    expect(html).not.toContain('sem código SCI');
    expect(html).not.toContain('a conferir com o jurídico');
  });

  it('escapa a razão social no corpo do e-mail', () => {
    const html = renderPorte([
      linha({
        razao_social: 'ACME <b>&</b> CIA',
        mudou: true,
        porte: 'DEMAIS',
        motivo: 'EXCESSO_20PCT',
        porte_anterior: 'EPP',
      }),
    ]);
    expect(html).toContain('ACME &lt;b&gt;&amp;&lt;/b&gt; CIA');
    expect(html).not.toContain('ACME <b>');
  });
});

describe('montarHtmlCota (Departamento Pessoal)', () => {
  const sujeita = (over = {}) =>
    linha({ porte: 'DEMAIS', sujeita_cota: true, rba: 6_000_000, ...over });

  it('a relação inclui quem tem sócio PJ sem ser Demais', () => {
    // Mesmo critério do filtro "Sujeitas a contratar aprendiz" da tela: pela
    // receita cairia em ME/EPP, mas o art. 3º §4º, I afasta esse enquadramento
    // — ela não é isenta e precisa entrar na análise de CBO. As duas listas
    // têm de dar o mesmo conjunto, senão quem confere numa não acha na outra.
    const clientes = [
      sujeita({ id: '1', razao_social: 'DEMAIS LTDA' }),
      linha({ id: '2', razao_social: 'ISENTA LTDA', porte: 'ME', sujeita_cota: false }),
      linha({
        id: '3',
        razao_social: 'COM SOCIO PJ LTDA',
        porte: 'ME',
        sujeita_cota: null,
        impedimento_societario: true,
        revisar_juridico: true,
        revisar_motivos: ['SOCIO_PJ'],
      }),
    ];
    const secoes = separarSecoes(clientes);
    expect(secoes.sujeitasHoje.map((c) => c.razao_social)).toEqual([
      'COM SOCIO PJ LTDA',
      'DEMAIS LTDA',
    ]);

    const html = renderCota(clientes);
    expect(html).toContain('Para análise de CBO');
    expect(html).toContain('COM SOCIO PJ LTDA');
    expect(html).not.toContain('ISENTA LTDA');
    // O estado de cada uma fica explícito: o caso fechado e o pendente.
    expect(html).toContain('sujeita');
    expect(html).toContain('a conferir');
    expect(html).toContain('sócio PJ afasta ME/EPP');
    expect(html).toContain('confirme o cartão CNPJ');
  });

  it('sem pendência societária, a relação não explica pendência nenhuma', () => {
    const html = renderCota([sujeita({ razao_social: 'SO DEMAIS LTDA' })]);
    expect(html).toContain('Para análise de CBO');
    expect(html).not.toContain('confirme o cartão CNPJ');
  });

  it('traz a relação completa de quem está sujeito hoje', () => {
    // A pergunta do DP não é "o que mudou", é "quem deve cumprir" — e isso não
    // se responde somando as mudanças do mês.
    const html = renderCota([
      sujeita({ id: '1', razao_social: 'JA ERA DEMAIS LTDA' }),
      linha({ id: '2', porte: 'EPP', sujeita_cota: false }),
    ]);
    expect(html).toContain('relação completa');
    expect(html).toContain('JA ERA DEMAIS LTDA');
  });

  it('a relação inclui quem acabou de entrar — lista com buraco não confere', () => {
    const html = renderCota([
      sujeita({
        razao_social: 'ENTROU AGORA LTDA',
        mudou: true,
        motivo: 'EXCESSO_20PCT',
        porte_anterior: 'EPP',
        data_efeito: '2026-08-01',
      }),
    ]);
    expect(html).toContain('Passaram a estar sujeitas à cota neste ano');
    expect(html).toContain('relação completa');
    // Aparece nas duas: uma vez como mudança, outra na relação.
    expect(html.match(/ENTROU AGORA LTDA/g)?.length).toBe(2);
  });

  it('destaca a DATA em que a cota passou a ser exigível', () => {
    // Para o DP a data é o dado principal, não o faturamento.
    const html = renderCota([
      sujeita({
        mudou: true,
        motivo: 'EXCESSO_20PCT',
        porte_anterior: 'EPP',
        data_efeito: '2026-10-01',
      }),
    ]);
    expect(html).toContain('01/10/2026');
    expect(html).toContain('desde 01/10/2026');
  });

  it('quem sai da obrigação vem nominal, não como linha de nomes', () => {
    // Dispensar contratação por engano é caro: aqui o nome tem de estar visível.
    const html = renderCota([
      linha({ razao_social: 'SAIU LTDA', mudou: true, porte: 'EPP', porte_anterior: 'DEMAIS' }),
    ]);
    expect(html).toContain('Deixaram de estar sujeitas à cota');
    expect(html).toContain('SAIU LTDA');
    expect(html).toContain('SAIU LTDA');
  });

  it('avisa que apura QUEM deve, não QUANTOS aprendizes', () => {
    // Sem isso o DP pode ler a lista como se o número já estivesse calculado —
    // e ele depende dos empregados por CBO, que não estão neste sistema.
    const html = renderCota([sujeita()]);
    expect(html).toContain('<strong>quem</strong>');
    expect(html).toContain('<strong>quantos</strong>');
    
  });

  it('sem ninguém sujeito, diz isso em vez de vir vazio', () => {
    const html = renderCota([linha({ porte: 'EPP', sujeita_cota: false })]);
    expect(html).toContain('Nenhuma empresa sujeita à cota em julho de 2026');
  });

  it('a projeção fala em passar a estar SUJEITA, não em mudar de porte', () => {
    const html = renderCota([
      linha({ razao_social: 'PERTO DO LIMITE LTDA', porte: 'EPP', rba: 5_500_000 }),
    ]);
    expect(html).toContain('Podem passar a estar sujeitas já em agosto');
    expect(html).toContain('01/09/2026');
    expect(html).toContain('Projeção, não fato');
  });

  it('escapa a razão social no corpo do e-mail', () => {
    const html = renderCota([sujeita({ razao_social: 'ACME <b>&</b> CIA' })]);
    expect(html).toContain('ACME &lt;b&gt;&amp;&lt;/b&gt; CIA');
    expect(html).not.toContain('ACME <b>');
  });
});
