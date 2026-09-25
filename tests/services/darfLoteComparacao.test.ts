/**
 * Comparação do lote de DARF com o mês anterior.
 *
 * A carteira é toda de pró-labore, que não muda de mês para mês — por isso o
 * lote guarda o valor da guia do mês passado ao lado da atual, sem manter uma
 * série histórica: só a pergunta "mudou de repente?" importa aqui.
 */
const executeQuery = jest.fn();

jest.mock('../../src/config/mysql', () => ({
  executeQuery: (...a: unknown[]) => executeQuery(...a),
  mysqlPool: { execute: jest.fn() },
}));
jest.mock('../../src/services/DctfWebService', () => ({}));
jest.mock('../../src/services/darf.historico', () => ({}));
jest.mock('../../src/services/integraContador', () => ({ soDigitos: (v: string) => v.replace(/\D/g, '') }));
jest.mock('../../src/services/darfLote.email', () => ({ enviarRelatorioLote: jest.fn() }));

import darfLoteService, {
  competenciaAnterior,
  valorDivergente,
  type ItemLote,
} from '../../src/services/DarfLoteService';

const item = (cnpj: string, status: ItemLote['status'], valorTotal: number | null): ItemLote => ({
  cnpj,
  razaoSocial: null,
  codigoSci: null,
  status,
  darfId: null,
  numeroDocumento: null,
  valorTotal,
  vencimento: null,
  arquivo: null,
  erro: null,
  valorAnterior: null,
});

describe('competenciaAnterior', () => {
  it('recua um mês dentro do mesmo ano', () => {
    expect(competenciaAnterior('2026', '09')).toEqual({ anoPA: '2026', mesPA: '08' });
  });

  it('janeiro vira dezembro do ano anterior', () => {
    expect(competenciaAnterior('2026', '01')).toEqual({ anoPA: '2025', mesPA: '12' });
  });
});

describe('valorDivergente', () => {
  it('mesmo valor não é divergente', () => {
    expect(valorDivergente(502.51, 502.51)).toBe(false);
  });

  it('valor diferente é divergente', () => {
    expect(valorDivergente(4374.75, 3980.1)).toBe(true);
  });

  it('diferença de ponto flutuante abaixo do centavo não conta', () => {
    // 0.1 + 0.2 não é exatamente 0.3 em ponto flutuante — é exatamente o tipo
    // de falso positivo que a comparação em centavos existe para evitar.
    expect(valorDivergente(0.3, 0.1 + 0.2)).toBe(false);
  });

  it('sem valor anterior não há o que comparar', () => {
    expect(valorDivergente(100, null)).toBe(false);
  });

  it('sem valor atual não há o que comparar', () => {
    expect(valorDivergente(null, 100)).toBe(false);
  });
});

describe('DarfLoteService.valoresDaCompetenciaAnterior (privado)', () => {
  const chamar = (anoPA: string, mesPA: string) =>
    (darfLoteService as any).valoresDaCompetenciaAnterior(anoPA, mesPA) as Promise<Map<string, number>>;

  beforeEach(() => executeQuery.mockReset());

  it('busca a competência do mês anterior, não a mesma', async () => {
    executeQuery.mockResolvedValue([]);
    await chamar('2026', '09');
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY iniciado_em DESC/);
    expect(params).toEqual(['2026', '08']);
  });

  it('mapeia cnpj → valor só de quem tinha guia entregue', async () => {
    executeQuery.mockResolvedValue([
      {
        itens: [
          item('11111111000191', 'emitido', 502.51),
          item('22222222000102', 'reaproveitado', 8123.44),
          item('33333333000113', 'falha', null),
        ],
      },
    ]);
    const mapa = await chamar('2026', '09');
    expect(mapa.get('11111111000191')).toBe(502.51);
    expect(mapa.get('22222222000102')).toBe(8123.44);
    expect(mapa.has('33333333000113')).toBe(false);
  });

  it('rodada abortada (itens em formato {abortadoPor, itens}) também é lida', async () => {
    executeQuery.mockResolvedValue([
      { itens: { abortadoPor: 'pasta fora do ar', itens: [item('11111111000191', 'emitido', 502.51)] } },
    ]);
    const mapa = await chamar('2026', '09');
    expect(mapa.get('11111111000191')).toBe(502.51);
  });

  it('sem rodada no mês anterior, o mapa vem vazio', async () => {
    executeQuery.mockResolvedValue([]);
    const mapa = await chamar('2026', '09');
    expect(mapa.size).toBe(0);
  });
});
