/**
 * GET /api/darf/historico — o filtro livre (`busca`) que a tela de DARFs
 * emitidos usa para achar uma guia por nome ou CNPJ.
 *
 * O que se testa aqui é a MONTAGEM DO SQL: qual condição entra, com que
 * parâmetro, para cada formato de termo digitado. A tabela real e a
 * autenticação do SERPRO (que o controller também usa noutros métodos) não
 * entram — por isso os módulos de emissão são mockados vazios.
 */
const executeQuery = jest.fn();

jest.mock('../../src/config/mysql', () => ({ executeQuery: (...a: unknown[]) => executeQuery(...a) }));
jest.mock('../../src/services/DctfWebService', () => ({
  CATEGORIAS: [],
  ROTULO_CATEGORIA: {},
  REGRAS_CATEGORIA: {},
}));
jest.mock('../../src/services/integraContador', () => ({
  soDigitos: (v: unknown) => String(v ?? '').replace(/\D/g, ''),
  IntegraContadorError: class IntegraContadorError extends Error {},
}));
jest.mock('../../src/services/darf.historico', () => ({ gravarNoHistorico: jest.fn() }));
jest.mock('../../src/services/DarfLoteService', () => ({ __esModule: true, default: {} }));

import { DarfController } from '../../src/controllers/DarfController';

const resposta = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() }) as any;
const requisicao = (query: Record<string, string>) => ({ query }) as any;

describe('DarfController.historico — filtro de busca', () => {
  const controller = new DarfController();

  beforeEach(() => {
    executeQuery.mockReset();
    executeQuery.mockResolvedValue([]);
  });

  it('sem busca, só filtra por excluído (comportamento de sempre)', async () => {
    await controller.historico(requisicao({}), resposta());
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE excluido_em IS NULL/);
    expect(params).toEqual([]);
  });

  it('busca só com letras filtra por razão social', async () => {
    await controller.historico(requisicao({ busca: 'soma' }), resposta());
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/razao_social LIKE \?/);
    expect(sql).not.toMatch(/cnpj LIKE/);
    expect(params).toEqual(['%soma%']);
  });

  it('busca com CNPJ formatado compara os dígitos com a coluna (só dígitos)', async () => {
    await controller.historico(requisicao({ busca: '32.663.680/0001-10' }), resposta());
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/razao_social LIKE \? OR cnpj LIKE \?/);
    expect(params).toEqual(['%32.663.680/0001-10%', '%32663680000110%']);
  });

  it('cnpj exato (seletor de cliente) e busca livre convivem', async () => {
    await controller.historico(requisicao({ cnpj: '32663680000110', busca: 'soma' }), resposta());
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/cnpj = \?/);
    expect(sql).toMatch(/razao_social LIKE \?/);
    expect(params).toEqual(['32663680000110', '%soma%']);
  });

  it('incluirExcluidos=1 tira a condição de excluído', async () => {
    await controller.historico(requisicao({ incluirExcluidos: '1' }), resposta());
    const [sql] = executeQuery.mock.calls[0];
    expect(sql).not.toMatch(/excluido_em IS NULL/);
  });
});
