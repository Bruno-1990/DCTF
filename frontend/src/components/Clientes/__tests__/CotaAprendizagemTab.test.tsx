import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CotaAprendizagemTab, {
  agruparPorAno,
  rotuloMotivo,
  portePorAno,
  normalizarPorteDeclarado,
  SELO_REVISAO,
} from '../CotaAprendizagemTab';
import type { Classificacao, LinhaClassificacao } from '../../../services/cotaAprendizagem';

/**
 * O que estes testes protegem na tela:
 *  - "sem dados" não pode ser apresentado como "isenta";
 *  - mudança que JÁ vale tem de aparecer separada da que só vale em 1º/jan;
 *  - o porte apurado e o declarado na Receita aparecem lado a lado, sem um
 *    sobrescrever o outro.
 */

const mockClassificacao = vi.fn();
const mockStatus = vi.fn();
const mockReclassificar = vi.fn();
const mockSincronizar = vi.fn();
const mockHistorico = vi.fn();
const mockEnviarAviso = vi.fn();

vi.mock('../../../services/cotaAprendizagem', async () => {
  const actual = await vi.importActual<any>('../../../services/cotaAprendizagem');
  return {
    ...actual,
    default: {
      classificacao: (...a: any[]) => mockClassificacao(...a),
      status: (...a: any[]) => mockStatus(...a),
      reclassificar: (...a: any[]) => mockReclassificar(...a),
      sincronizar: (...a: any[]) => mockSincronizar(...a),
      historico: (...a: any[]) => mockHistorico(...a),
      enviarAviso: (...a: any[]) => mockEnviarAviso(...a),
      exportarXlsx: vi.fn(),
    },
  };
});

function linha(over: Partial<LinhaClassificacao> = {}): LinhaClassificacao {
  return {
    id: 'c1',
    razao_social: 'EMPRESA TESTE LTDA',
    cnpj: '11222333000181',
    codigo_sci: 396,
    uf: 'ES',
    porte_declarado: 'EMPRESA DE PEQUENO PORTE',
    abertura: null,
    ano: 2026,
    mes: 7,
    bdref: 202607,
    rbaa: 500000,
    rba: 400000,
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
    diagnostico: {
      porteAtual: 'EPP',
      proximoPorte: null,
      situacao: 'DENTRO_DA_FAIXA',
      limiteDaFaixaCentavos: 480_000_000,
      folgaCentavos: 440_000_000,
      percentualDoLimite: 8.33,
      dataEfeito: null,
      resumo: 'Dentro do teto de EPP.',
      sujeitaCota: false,
    },
    ...over,
  };
}

function resposta(clientes: LinhaClassificacao[]): Classificacao {
  return {
    bdref: 202607,
    clientes,
    resumo: {
      total: clientes.length,
      sujeitas: clientes.filter((c) => c.sujeita_cota === true).length,
      isentas: clientes.filter((c) => c.sujeita_cota === false).length,
      semDados: clientes.filter((c) => c.porte === 'SEM_DADOS').length,
      mudancas: clientes.filter((c) => c.mudou).length,
      projecoes: clientes.filter((c) => c.excede_teto_epp || c.excede_teto_me).length,
      revisarJuridico: clientes.filter((c) => c.revisar_juridico).length,
    },
  };
}

describe('normalizarPorteDeclarado', () => {
  it('traduz o texto por extenso da Receita para a sigla apurada', () => {
    // Sem isso, comparar "EMPRESA DE PEQUENO PORTE" com o selo "EPP" ficaria
    // por conta do leitor.
    expect(normalizarPorteDeclarado('MICRO EMPRESA')).toBe('ME');
    expect(normalizarPorteDeclarado('EMPRESA DE PEQUENO PORTE')).toBe('EPP');
    expect(normalizarPorteDeclarado('DEMAIS')).toBe('DEMAIS');
  });

  it('tolera variações de caixa e espaço', () => {
    expect(normalizarPorteDeclarado('  microempresa ')).toBe('ME');
    expect(normalizarPorteDeclarado('Empresa de Pequeno Porte')).toBe('EPP');
  });

  it('devolve null para vazio ou desconhecido, sem forçar equivalência', () => {
    expect(normalizarPorteDeclarado(null)).toBeNull();
    expect(normalizarPorteDeclarado('')).toBeNull();
    expect(normalizarPorteDeclarado('ALGO NOVO')).toBeNull();
  });
});

describe('portePorAno', () => {
  const hist = (
    faturamento: Array<{ ano: number; mes: number; faturamento: number }>,
    classificacoes: Array<{ ano: number; mes: number; porte: any }> = []
  ) =>
    ({
      cliente: { id: 'c1', razao_social: 'X', cnpj: '1', codigo_sci: 1, porte_declarado: null },
      faturamento: faturamento.map((f) => ({
        ...f,
        bdref: f.ano * 100 + f.mes,
        base_receita: 'faturamento_total',
        consultado_em: '',
      })),
      classificacoes: classificacoes.map((c) => ({
        ...c,
        bdref: c.ano * 100 + c.mes,
        rbaa: null,
        rba: null,
        porte_base: c.porte,
        motivo: 'RBAA',
        sujeita_cota: false,
        excede_teto_epp: false,
        excede_teto_me: false,
        data_efeito: null,
        meses_faltantes: 0,
        dado_confiavel: true,
        porte_anterior: null,
        mudou: false,
        calculado_em: '',
      })),
    }) as any;

  it('a classificação gravada tem prioridade', () => {
    const m = portePorAno(hist([{ ano: 2026, mes: 1, faturamento: 10 }], [{ ano: 2026, mes: 7, porte: 'DEMAIS' }]));
    expect(m.get(2026)).toBe('DEMAIS');
  });

  it('usa a competência mais recente do ano quando há várias', () => {
    const m = portePorAno(
      hist(
        [{ ano: 2026, mes: 1, faturamento: 10 }],
        [
          { ano: 2026, mes: 3, porte: 'EPP' },
          { ano: 2026, mes: 7, porte: 'DEMAIS' },
        ]
      )
    );
    expect(m.get(2026)).toBe('DEMAIS');
  });

  it('deriva o porte de um ano não apurado pela receita do ano anterior', () => {
    // 2024 fechou em R$ 500 mil -> em 2025 a empresa é EPP, não ME.
    const m = portePorAno(
      hist([
        { ano: 2024, mes: 1, faturamento: 500_000 },
        { ano: 2025, mes: 1, faturamento: 400_000 },
      ])
    );
    expect(m.get(2025)).toBe('EPP');
  });

  it('ano sem base fica FORA do mapa — não vira "ME" por omissão', () => {
    // Sem o ano anterior coletado, não há como saber o porte de 2024. Assumir
    // ME faria uma EPP receber o aviso de R$ 360 mil num ano antigo.
    const m = portePorAno(hist([{ ano: 2024, mes: 1, faturamento: 500_000 }]));
    expect(m.has(2024)).toBe(false);
  });

  it('sem porte conhecido, o agrupamento não marca limite nenhum', () => {
    const grupos = agruparPorAno(
      [
        { ano: 2024, mes: 1, bdref: 202401, faturamento: 300_000 },
        { ano: 2024, mes: 2, bdref: 202402, faturamento: 100_000 }, // passaria de 360 mil
      ],
      new Map() // nenhum porte conhecido
    );
    expect(grupos[0]!.meses.every((m) => m.marco === null)).toBe(true);
  });
});

describe('rotuloMotivo', () => {
  it('traduz o código gravado no banco para frase legível', () => {
    expect(rotuloMotivo('EXCESSO_20PCT')).toBe('Excedeu os 20%');
    expect(rotuloMotivo('RBAA')).toBe('Receita do ano anterior');
    expect(rotuloMotivo('SEM_DADOS')).toBe('Sem dados suficientes');
  });

  it('devolve o código quando não conhece o motivo, em vez de esconder', () => {
    // Motivo novo no backend não pode virar célula vazia na tela.
    expect(rotuloMotivo('MOTIVO_NOVO')).toBe('MOTIVO_NOVO');
  });
});

describe('agruparPorAno', () => {
  const fat = (ano: number, mes: number, valor: number) => ({
    ano,
    mes,
    bdref: ano * 100 + mes,
    faturamento: valor,
  });

  it('ano mais recente em cima e, dentro dele, mês mais recente em cima', () => {
    const grupos = agruparPorAno([
      fat(2025, 3, 10),
      fat(2026, 2, 20),
      fat(2025, 1, 30),
      fat(2026, 1, 40),
    ]);
    expect(grupos.map((g) => g.ano)).toEqual([2026, 2025]);
    expect(grupos[0]!.meses.map((m) => m.mes)).toEqual([2, 1]);
    expect(grupos[1]!.meses.map((m) => m.mes)).toEqual([3, 1]);
  });

  it('o acumulado soma de janeiro para frente, mesmo exibindo ao contrário', () => {
    // A inversão é só de exibição. Se o acumulado fosse calculado na ordem
    // exibida, dezembro apareceria com o valor de janeiro.
    const grupos = agruparPorAno([
      fat(2026, 1, 100),
      fat(2026, 2, 200),
      fat(2026, 3, 300),
    ]);
    const meses = grupos[0]!.meses;
    expect(meses.map((m) => m.mes)).toEqual([3, 2, 1]);
    expect(meses.map((m) => m.acumulado)).toEqual([600, 300, 100]);
    // O mês do topo carrega o acumulado do ano inteiro coletado.
    expect(meses[0]!.acumulado).toBe(grupos[0]!.total);
  });

  it('acumula dentro do ano e zera na virada', () => {
    // O acumulado é por ano-calendário: 2025 não pode vazar para 2026.
    const grupos = agruparPorAno([
      fat(2025, 1, 100),
      fat(2025, 2, 200),
      fat(2026, 1, 50),
    ]);
    const g2026 = grupos.find((g) => g.ano === 2026)!;
    const g2025 = grupos.find((g) => g.ano === 2025)!;
    expect(g2025.meses.map((m) => m.acumulado)).toEqual([300, 100]);
    expect(g2025.total).toBe(300);
    expect(g2026.meses[0]!.acumulado).toBe(50);
    expect(g2026.total).toBe(50);
  });

  const escada = [
    fat(2026, 1, 300_000),
    fat(2026, 2, 100_000), // acumulado 400 mil -> passa de 360 mil
    fat(2026, 3, 4_500_000), // acumulado 4,9 mi -> passa de 4,8 mi
    fat(2026, 4, 1_000_000), // acumulado 5,9 mi -> passa de 5,76 mi
  ];

  it('para uma ME, marca o mês exato em que cada limite foi cruzado', () => {
    const grupos = agruparPorAno(escada, new Map([[2026, 'ME' as const]]));
    const porMes = new Map(grupos[0]!.meses.map((m) => [m.mes, m]));
    expect(porMes.get(1)!.marco).toBeNull();
    expect(porMes.get(2)!.marco).toMatch(/360 mil/);
    expect(porMes.get(3)!.marco).toMatch(/4,8 mi/);
    expect(porMes.get(4)!.marco).toMatch(/5,76 mi/);
    // O aviso mais grave fica no topo da lista, que é o ponto da inversão.
    expect(grupos[0]!.meses[0]!.marco).toMatch(/5,76 mi/);
  });

  it('uma EPP NÃO é avisada sobre os R$ 360 mil — está dentro da faixa dela', () => {
    const grupos = agruparPorAno(escada, new Map([[2026, 'EPP' as const]]));
    const porMes = new Map(grupos[0]!.meses.map((m) => [m.mes, m]));
    expect(porMes.get(2)!.marco).toBeNull(); // o aviso de 360 mil some
    expect(porMes.get(3)!.marco).toMatch(/4,8 mi/); // estes seguem valendo
    expect(porMes.get(4)!.marco).toMatch(/5,76 mi/);
  });

  it('para quem já é Demais, o marco responde se ela segue Demais no ano seguinte', () => {
    // "Passou do teto de EPP" não dizia nada a uma empresa que nunca foi EPP —
    // essa faixa não é régua dela. A única pergunta em aberto para uma Demais é
    // se ela continua Demais no ano que vem, e cruzar R$ 4,8 mi já responde:
    // receita só acumula, então o ano fecha acima.
    const grupos = agruparPorAno(escada, new Map([[2026, 'DEMAIS' as const]]));
    const marcados = grupos[0]!.meses.filter((m) => m.marco !== null);
    expect(marcados).toHaveLength(1);
    expect(marcados[0]!.mes).toBe(3); // mês em que passou de 4,8 mi
    expect(marcados[0]!.marco).toMatch(/segue Demais em 2027/);
    expect(marcados[0]!.marco).not.toMatch(/teto de EPP/); // faixa que não é dela
    expect(marcados[0]!.marco).not.toMatch(/vira Demais/); // não promete transição
    // Nem o limite de ME nem o de 20% geram aviso para quem já é Demais.
    expect(grupos[0]!.meses.some((m) => m.marco?.includes('360 mil'))).toBe(false);
    expect(grupos[0]!.meses.some((m) => m.marco?.includes('5,76'))).toBe(false);
  });

  it('a gravidade escala com o limite cruzado, para o destaque da linha', () => {
    const grupos = agruparPorAno(escada, new Map([[2026, 'ME' as const]]));
    const porMes = new Map(grupos[0]!.meses.map((m) => [m.mes, m]));
    expect(porMes.get(2)!.gravidade).toBe('aviso'); // 360 mil
    expect(porMes.get(3)!.gravidade).toBe('alerta'); // 4,8 mi
    expect(porMes.get(4)!.gravidade).toBe('critico'); // 5,76 mi
    expect(porMes.get(1)!.gravidade).toBeNull();
  });

  it('cada ano é lido com a régua do porte que valia nele', () => {
    // A mesma empresa foi EPP em 2025 e Demais em 2026.
    const dados = [
      fat(2025, 1, 400_000), // passa de 360 mil — irrelevante para EPP
      fat(2026, 1, 400_000),
    ];
    const grupos = agruparPorAno(
      dados,
      new Map([
        [2025, 'EPP' as const],
        [2026, 'DEMAIS' as const],
      ])
    );
    // Em 2025 era EPP: R$ 400 mil não é evento para ela.
    expect(grupos.find((g) => g.ano === 2025)!.meses[0]!.marco).toBeNull();
    // Em 2026 já era Demais: R$ 400 mil também não diz nada.
    expect(grupos.find((g) => g.ano === 2026)!.meses[0]!.marco).toBeNull();
  });

  it('marca o limite uma única vez, não em todo mês acima dele', () => {
    // Sem isso, todo mês a partir do estouro repetiria o aviso.
    const grupos = agruparPorAno(
      [fat(2026, 1, 6_000_000), fat(2026, 2, 1_000_000), fat(2026, 3, 1_000_000)],
      new Map([[2026, 'EPP' as const]])
    );
    const comMarco = grupos[0]!.meses.filter((m) => m.marco !== null);
    expect(comMarco).toHaveLength(1);
    expect(comMarco[0]!.mes).toBe(1);
  });
});

describe('CotaAprendizagemTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.mockResolvedValue({
      rodando: false,
      processados: 0,
      total: 0,
      bdref: null,
      iniciadoEm: null,
      ultimoResumo: null,
    });
  });

  it('mostra a competência e os clientes apurados', async () => {
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/jul\/2026/).length).toBeGreaterThan(0);
  });

  it('mostra a transição declarado → apurado quando divergem', async () => {
    // Divergir é normal; a tela não deve esconder um nem "corrigir" o outro.
    // Busca dentro da linha da tabela — "Demais"/"ME" também existem como
    // <option> nos filtros, então getByText global acharia vários.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({ porte: 'DEMAIS', sujeita_cota: true, porte_declarado: 'MICRO EMPRESA' }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    // O declarado aparece normalizado (ME), não por extenso.
    expect(within(linhaTabela).getByText('ME')).toBeInTheDocument();
    expect(within(linhaTabela).getByText('Demais')).toBeInTheDocument();
    expect(within(linhaTabela).getByText('Sujeita')).toBeInTheDocument();
  });

  it('quando declarado e apurado coincidem, mostra um selo só', async () => {
    // Não há divergência a comunicar — repetir "EPP → EPP" seria ruído.
    mockClassificacao.mockResolvedValue(
      resposta([linha({ porte: 'EPP', porte_declarado: 'EMPRESA DE PEQUENO PORTE' })])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    expect(within(linhaTabela).getAllByText('EPP')).toHaveLength(1);
  });

  it('sinaliza quando a Receita não informou o porte', async () => {
    mockClassificacao.mockResolvedValue(resposta([linha({ porte_declarado: null })]));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('(sem RFB)')).toBeInTheDocument();
    });
  });

  it('a Situação diz QUANDO muda, sem repetir o porte', async () => {
    // "Já é Demais" competia com a coluna de enquadramento e confundia; o que
    // esta coluna responde é o prazo.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          porte: 'DEMAIS',
          sujeita_cota: true,
          porte_declarado: 'DEMAIS',
          diagnostico: {
            porteAtual: 'DEMAIS',
            proximoPorte: null,
            situacao: 'JA_SUJEITA',
            limiteDaFaixaCentavos: null,
            folgaCentavos: null,
            percentualDoLimite: null,
            dataEfeito: null,
            resumo: 'Enquadrada como Demais pela receita do ano anterior.',
            sujeitaCota: true,
          },
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('Permanece')).toBeInTheDocument();
    });
    expect(screen.getByText('segue Demais')).toBeInTheDocument();
    expect(screen.queryByText('Já é Demais')).not.toBeInTheDocument();
  });

  it('cliente sem dados fica "A conferir", nunca "Não precisa"', async () => {
    mockClassificacao.mockResolvedValue(
      resposta([linha({ porte: 'SEM_DADOS', sujeita_cota: null, rba: null, rbaa: null })])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('A conferir')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    expect(within(linhaTabela).queryByText('Isenta')).not.toBeInTheDocument();
  });

  it('destaca em faixa própria quem virou Demais com a cota já exigível', async () => {
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          mudou: true,
          porte: 'DEMAIS',
          porte_anterior: 'EPP',
          motivo: 'EXCESSO_20PCT',
          sujeita_cota: true,
          rba: 5800000,
          data_efeito: '2026-08-01',
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText(/a cota já é exigível/)).toBeInTheDocument();
    });
    expect(screen.getByText(/01\/08\/2026/)).toBeInTheDocument();
  });

  it('projeção de 1º de janeiro não é anunciada como obrigação que já vale', async () => {
    // A distinção continua sendo o ponto: passar do teto não é a mesma coisa
    // que dever a cota. Quem só muda em janeiro fica na linha da tabela, com o
    // prazo na coluna Situação — sem faixa de alerta, que é reservada ao que
    // já é exigível.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          excede_teto_epp: true,
          rba: 5000000,
          data_efeito: '2027-01-01',
          diagnostico: {
            porteAtual: 'EPP',
            proximoPorte: 'DEMAIS',
            situacao: 'MUDA_EM_JANEIRO',
            limiteDaFaixaCentavos: 480_000_000,
            folgaCentavos: -20_000_000,
            percentualDoLimite: 104,
            dataEfeito: '2027-01-01',
            resumo: 'Passou do teto de EPP.',
            sujeitaCota: false,
          },
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('Próximo ano')).toBeInTheDocument();
    });
    expect(screen.getByText('passa a Demais')).toBeInTheDocument();
    expect(screen.queryByText(/a cota já é exigível/)).not.toBeInTheDocument();
    // E enquanto não vira, a resposta da coluna do aprendiz é "Não".
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    expect(within(linhaTabela).getByText('Isenta')).toBeInTheDocument();
  });

  it('sinaliza meses faltantes para não confundir acumulado parcial com total', async () => {
    mockClassificacao.mockResolvedValue(
      resposta([linha({ dado_confiavel: false, meses_faltantes: 4, meses_faltantes_lista: '1,2,3,4' })])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText(/4 mês\(es\) sem dado/)).toBeInTheDocument();
    });
  });

  it('com sócio PJ, o porte não é afirmado nem a isenção é declarada', async () => {
    // O art. 3º §4º, I afasta ME/EPP independentemente da receita. A tela não
    // pode dizer "EPP, não precisa de aprendiz" na mesma linha em que marca
    // sócio PJ — as duas afirmações se contradizem, e a errada é justamente a
    // que dispensa o cliente da cota. Também não pode afirmar o contrário: o
    // quadro societário vem de um retrato que pode estar desatualizado.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          impedimento_societario: true,
          sujeita_cota: null,
          revisar_juridico: true,
          revisar_motivos: ['SOCIO_PJ'],
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('sócio PJ')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    // O porte pela receita continua visível, mas marcado como pendente.
    expect(within(linhaTabela).getByText('EPP?')).toBeInTheDocument();
    expect(within(linhaTabela).getByText('a confirmar')).toBeInTheDocument();
    // E a coluna do aprendiz não responde nem "Sim" nem "Não".
    expect(within(linhaTabela).getByText('A conferir')).toBeInTheDocument();
    expect(within(linhaTabela).queryByText('Isenta')).not.toBeInTheDocument();
  });

  it('retoma o acompanhamento quando a página abre com apuração já em andamento', async () => {
    // A apuração roda no servidor e sobrevive a um F5; o que se perde é só o
    // intervalo de polling. Sem esta retomada, a tela mostraria "Sincronizar
    // agora" disponível enquanto o backend ainda processa — e o clique tomaria
    // 409.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockStatus.mockResolvedValue({
      rodando: true,
      processados: 46,
      total: 220,
      bdref: 202607,
      iniciadoEm: 1,
      ultimoResumo: null,
    });

    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText(/Apurando 46\/220/)).toBeInTheDocument();
    });
  });

  it('marca a divergência com o Simples sem alterar o porte', async () => {
    // O teto do Simples é o mesmo teto de EPP: optante com receita acima dele é
    // contradição entre cadastro e faturamento, e uma das duas fontes está
    // errada. Sinaliza — não decide.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          porte: 'DEMAIS',
          sujeita_cota: true,
          rba: 18258335.68,
          revisar_juridico: true,
          revisar_motivos: ['SIMPLES_ACIMA_TETO'],
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('Simples acima do teto')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    expect(within(linhaTabela).getByText('Demais')).toBeInTheDocument();
  });

  it('não conhece mais selo de sócio no exterior nem de sociedade de advogados', async () => {
    // Nenhum dos dois impede ME/EPP: o art. 3º não veda por domicílio de sócio
    // (a vedação do exterior é do art. 17, II, e alcança só o ingresso no
    // Simples), e sociedade de advogados pode ser ME/EPP (art. 3º-A). Marcar
    // os dois enchia a fila do jurídico de caso que a lei não questiona.
    expect(SELO_REVISAO['SOCIO_EXTERIOR']).toBeUndefined();
    expect(SELO_REVISAO['SOCIO_OAB']).toBeUndefined();
    expect(SELO_REVISAO['SOCIO_PJ']).toBeDefined();
  });

  it('clicar no cartão filtra a tabela para aquele porte, e clicar de novo desfaz', async () => {
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({ id: 'a', razao_social: 'PEQUENA LTDA', porte: 'ME' }),
        linha({ id: 'b', razao_social: 'GRANDE LTDA', porte: 'DEMAIS', sujeita_cota: true }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('PEQUENA LTDA')).toBeInTheDocument();
    });

    const cartaoDemais = screen.getByRole('button', { name: /sujeitas a contratar aprendiz/i });
    fireEvent.click(cartaoDemais);
    expect(screen.getByText('GRANDE LTDA')).toBeInTheDocument();
    expect(screen.queryByText('PEQUENA LTDA')).not.toBeInTheDocument();

    fireEvent.click(cartaoDemais);
    expect(screen.getByText('PEQUENA LTDA')).toBeInTheDocument();
    expect(screen.getByText('GRANDE LTDA')).toBeInTheDocument();
  });

  it('o cartão zera o filtro de situação, para o número bater com a tabela', async () => {
    // Com "A conferir" ligado, clicar no cartão que diz 2 mostraria 1 linha — e
    // o usuário concluiria, com razão, que o cartão está mentindo.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({ id: 'a', razao_social: 'PRIMEIRA LTDA', porte: 'ME' }),
        linha({
          id: 'b',
          razao_social: 'SEGUNDA LTDA',
          porte: 'ME',
          revisar_juridico: true,
          revisar_motivos: ['SOCIO_PJ'],
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('PRIMEIRA LTDA')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Todas as situações'), {
      target: { value: 'revisar' },
    });
    expect(screen.queryByText('PRIMEIRA LTDA')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /isenta da cota/ })[0]!);
    expect(screen.getByText('PRIMEIRA LTDA')).toBeInTheDocument();
    expect(screen.getByText('SEGUNDA LTDA')).toBeInTheDocument();
  });

  it('atualizar pelo cadastro não consulta o SCI e recarrega a tela', async () => {
    // O caminho para quando muda o cadastro (regime, sócios, abertura): nada
    // disso depende de faturamento novo, e a coleta do SCI leva minutos.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockReclassificar.mockResolvedValue({
      bdref: 202607,
      ano: 2026,
      mes: 7,
      total: 217,
      mudancas: 3,
      semDados: 0,
      duracaoMs: 469,
    });
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    fireEvent.click(screen.getByRole('button', { name: /Atualizar Dados Cadastrais/ }));

    await waitFor(() => {
      expect(screen.getByText(/217 cliente\(s\) reclassificados/)).toBeInTheDocument();
    });
    expect(mockReclassificar).toHaveBeenCalledTimes(1);
    expect(mockSincronizar).not.toHaveBeenCalled();
    // Recarrega para a tela mostrar o resultado, não o estado anterior.
    expect(mockClassificacao).toHaveBeenCalledTimes(2);
    // E deixa explícito que o faturamento não foi buscado de novo.
    expect(screen.getByText(/não foi consultado novamente/)).toBeInTheDocument();
  });

  it('o modal oferece os dois caminhos, com o custo de cada um', async () => {
    // A escolha só é possível se a diferença de custo estiver escrita: as duas
    // deixam a tela em dia, mas uma leva segundos e a outra ocupa o SCI.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(screen.getByRole('button', { name: /Atualizar Dados Cadastrais/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar Faturamento SCI/ })).toBeInTheDocument();
    expect(screen.getByText(/não consulta o SCI/)).toBeInTheDocument();
    expect(screen.getByText(/ocupa o SCI durante a apuração/)).toBeInTheDocument();
    // A opção do SCI avisa que dispensa rodar a outra — não há terceira opção.
    expect(screen.getByText(/Já inclui os dados cadastrais/)).toBeInTheDocument();
  });

  it('enquanto uma atualização roda, o botão não abre o modal de novo', async () => {
    // As duas escrevem nas mesmas linhas; deixar disparar em paralelo seria
    // pedir corrida de escrita.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    let liberar: (v: any) => void = () => {};
    mockReclassificar.mockImplementation(() => new Promise((r) => (liberar = r)));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    fireEvent.click(screen.getByRole('button', { name: /Atualizar Dados Cadastrais/ }));

    // O modal fecha e o botão vira indicador de progresso.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Atualizando/ })).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: /Atualizar Dados Cadastrais/ })).toBeNull();

    liberar({ bdref: 202607, ano: 2026, mes: 7, total: 1, mudancas: 0, semDados: 0, duracaoMs: 10 });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
    });
  });

  it('sócio PJ fora de Demais entra no filtro de sujeitas à cota', async () => {
    // Pela receita cairia em ME/EPP, mas o art. 3º §4º, I afasta esse
    // enquadramento — logo ela NÃO é isenta. Quem for analisar os CBOs precisa
    // vê-la; deixá-la fora dispensaria da análise justamente o caso duvidoso.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({ id: 'a', razao_social: 'ISENTA LTDA', porte: 'ME', sujeita_cota: false }),
        linha({ id: 'b', razao_social: 'DEMAIS LTDA', porte: 'DEMAIS', sujeita_cota: true }),
        linha({
          id: 'c',
          razao_social: 'COM SOCIO PJ LTDA',
          porte: 'EPP',
          sujeita_cota: null,
          impedimento_societario: true,
          revisar_juridico: true,
          revisar_motivos: ['SOCIO_PJ'],
        }),
      ])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('ISENTA LTDA')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Todas as situações'), {
      target: { value: 'sujeitas' },
    });

    expect(screen.getByText('DEMAIS LTDA')).toBeInTheDocument();
    expect(screen.getByText('COM SOCIO PJ LTDA')).toBeInTheDocument();
    expect(screen.queryByText('ISENTA LTDA')).not.toBeInTheDocument();
  });

  it('a tela diz "sujeita", nunca que a empresa já deve contratar', async () => {
    // O porte só coloca a empresa dentro da regra; quantos aprendizes — ou se
    // algum — sai da análise de CBO, que é do Departamento Pessoal.
    mockClassificacao.mockResolvedValue(
      resposta([linha({ porte: 'DEMAIS', sujeita_cota: true })])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });
    const linhaTabela = screen.getByText('EMPRESA TESTE LTDA').closest('tr')!;
    expect(within(linhaTabela).getByText('Sujeita')).toBeInTheDocument();
    expect(screen.queryByText(/deve contratar aprendiz/)).not.toBeInTheDocument();
    expect(screen.queryByText(/precisa contratar/)).not.toBeInTheDocument();
  });

  it('ao abrir o cliente, a divergência com a Receita continua visível', async () => {
    // Na tabela a linha mostra "ME → Demais"; abrindo o cliente, o modal só
    // dizia "Demais" e a divergência sumia — justamente na tela em que a
    // pessoa foi conferir o caso.
    mockClassificacao.mockResolvedValue(
      resposta([
        linha({
          razao_social: 'ILHA DAS FERRAMENTAS LTDA',
          porte: 'DEMAIS',
          porte_declarado: 'MICRO EMPRESA',
          sujeita_cota: true,
          diagnostico: {
            porteAtual: 'DEMAIS',
            proximoPorte: null,
            situacao: 'JA_SUJEITA',
            limiteDaFaixaCentavos: null,
            folgaCentavos: null,
            percentualDoLimite: null,
            dataEfeito: null,
            resumo: 'Enquadrada como Demais pela receita do ano anterior.',
            sujeitaCota: true,
          },
        }),
      ])
    );
    mockHistorico.mockResolvedValue({
      cliente: {
        id: 'c1',
        razao_social: 'ILHA DAS FERRAMENTAS LTDA',
        cnpj: '11222333000181',
        codigo_sci: 320,
        porte_declarado: 'MICRO EMPRESA',
      },
      faturamento: [],
      classificacoes: [],
    });

    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('ILHA DAS FERRAMENTAS LTDA')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('ILHA DAS FERRAMENTAS LTDA'));

    await waitFor(() => {
      expect(screen.getByText(/Na Receita Federal consta/)).toBeInTheDocument();
    });
    expect(screen.getByText(/vale conferir qual dos dois está desatualizado/)).toBeInTheDocument();
  });

  it('o envio deixa escolher qual dos dois relatórios sai e para quem', async () => {
    // São dois relatórios com recortes diferentes; mandar ambos sempre colocaria
    // na caixa de quem pediu um assunto que ele não pediu.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockEnviarAviso.mockResolvedValue([
      { tipo: 'COTA', enviado: true, bdref: 202607, destinatarios: ['bruno@central-rnc.com.br'] },
    ]);
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar e-mail/ }));
    expect(screen.getByRole('checkbox', { name: /Enquadramento de Porte/ })).toBeInTheDocument();

    // Passo 1: sem nada marcado, não dá para avançar.
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Cota de Aprendizagem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));

    // Passo 2: só o prefixo; o domínio é fixo e não é digitado.
    fireEvent.change(screen.getByLabelText('Enviar para'), { target: { value: 'bruno' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(mockEnviarAviso).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'COTA',
          destinatarios: ['bruno@central-rnc.com.br'],
        })
      );
    });
    // A confirmação fica no próprio modal, onde o clique aconteceu.
    expect(await screen.findByText('Enviado com sucesso')).toBeInTheDocument();
    expect(screen.getByText('bruno@central-rnc.com.br')).toBeInTheDocument();
  });

  it('enquanto envia, o modal segura a espera e não deixa fechar', async () => {
    // Fechar no clique mandava o usuário de volta à listagem sem retorno — e o
    // reflexo era clicar de novo, gerando e-mail duplicado.
    let liberar: (v: unknown) => void = () => {};
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockEnviarAviso.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      })
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar e-mail/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cota de Aprendizagem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    fireEvent.change(screen.getByLabelText('Enviar para'), { target: { value: 'bruno' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    // Espera visível no modal, e sem saída: o × some enquanto o envio corre.
    expect(await screen.findByText('Isso pode levar alguns segundos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '×' })).not.toBeInTheDocument();

    liberar([
      { tipo: 'COTA', enviado: true, bdref: 202607, destinatarios: ['bruno@central-rnc.com.br'] },
    ]);

    expect(await screen.findByText('Enviado com sucesso')).toBeInTheDocument();
    expect(screen.queryByText('Isso pode levar alguns segundos.')).not.toBeInTheDocument();
  });

  it('com os dois marcados, a chamada vai sem tipo (o backend manda os dois)', async () => {
    // Ler `enviado` de um array dava `undefined` e a tela anunciava falha mesmo
    // com os dois enviados.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockEnviarAviso.mockResolvedValue([
      { tipo: 'ENQUADRAMENTO', enviado: true, bdref: 202607, destinatarios: ['fiscal@x.com'] },
      { tipo: 'COTA', enviado: false, motivo: 'sem_destinatario', bdref: 202607, destinatarios: [] },
    ]);
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar e-mail/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Enquadramento de Porte/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cota de Aprendizagem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    fireEvent.change(screen.getByLabelText('Enviar para'), { target: { value: 'bruno' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    // Um foi e o outro não: "enviado com sucesso" genérico esconderia a falha.
    expect(await screen.findByText('Enviado em parte')).toBeInTheDocument();
    expect(screen.getByText('fiscal@x.com')).toBeInTheDocument();
    expect(screen.getByText('sem_destinatario')).toBeInTheDocument();
    expect(mockEnviarAviso).toHaveBeenCalledWith(
      expect.not.objectContaining({ tipo: expect.anything() })
    );
  });

  it('colar o endereço inteiro no prefixo não duplica o domínio', async () => {
    // O campo é de prefixo, mas o reflexo de quem usa e-mail é digitar tudo.
    // Sem normalizar, sairia "ti@central-rnc.com.br@central-rnc.com.br".
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    mockEnviarAviso.mockResolvedValue([
      { tipo: 'COTA', enviado: true, bdref: 202607, destinatarios: ['ti@central-rnc.com.br'] },
    ]);
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar e-mail/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cota de Aprendizagem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    fireEvent.change(screen.getByLabelText('Enviar para'), {
      target: { value: 'TI@central-rnc.com.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => {
      expect(mockEnviarAviso).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarios: ['ti@central-rnc.com.br'] })
      );
    });
  });

  it('a explicação da regra fica recolhida até alguém pedir', async () => {
    // Quem abre a tela uma vez por mês não guarda a regra; quem usa todo dia
    // não quer o texto ocupando a tela. Um clique resolve os dois.
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('Como o porte é apurado')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Quando a mudança passa a valer/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Como o porte é apurado'));
    expect(screen.getByText(/Quando a mudança passa a valer/)).toBeInTheDocument();
    // E o ponto que mais gera erro de leitura está lá dentro.
    expect(screen.getByText(/Sujeita não é o mesmo que obrigada/)).toBeInTheDocument();
  });

  it('sem motivo detalhado, cai no selo genérico de revisar', async () => {
    mockClassificacao.mockResolvedValue(
      resposta([linha({ revisar_juridico: true, revisar_motivos: [] })])
    );
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText('revisar')).toBeInTheDocument();
    });
  });

  it('sem apuração em andamento, o botão fica disponível', async () => {
    mockClassificacao.mockResolvedValue(resposta([linha()]));
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
    });
  });

  it('sem apuração, orienta a sincronizar', async () => {
    mockClassificacao.mockResolvedValue({
      bdref: null,
      clientes: [],
      resumo: {
        total: 0,
        sujeitas: 0,
        isentas: 0,
        semDados: 0,
        mudancas: 0,
        projecoes: 0,
        revisarJuridico: 0,
      },
    });
    render(<CotaAprendizagemTab />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma apuração ainda/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });
});
