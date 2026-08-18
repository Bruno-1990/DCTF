/**
 * Varredura cadastral que antecede a apuração da cota.
 *
 * O que se protege aqui é o comportamento que só apareceria em produção às 2h
 * da manhã do dia 5: um CNPJ que estoura o limite da ReceitaWS não pode levar
 * os outros 219 junto, e a pausa entre consultas não pode sumir num refactor —
 * sem ela a API bloqueia a varredura inteira depois da terceira empresa.
 *
 * Nada de rede e nada de banco: o model e o `executeQuery` são mockados, e a
 * espera é injetada, senão o teste levaria 1h15 como a varredura real.
 */

const executeQueryMock = jest.fn();
const atualizarCadastroMock = jest.fn();

jest.mock('../../config/mysql', () => ({
  executeQuery: (...args: any[]) => executeQueryMock(...args),
  mysqlPool: { query: jest.fn() },
}));

jest.mock('../../models/Cliente', () => ({
  Cliente: class {
    atualizarCadastroViaReceitaWS(...args: any[]) {
      return atualizarCadastroMock(...args);
    }
  },
}));

import { CadastroRefreshService, BACKOFF_429_MS } from '../CadastroRefreshService';

const ok = (status: string, alteracoes: Array<{ campo: string }> = []) => ({
  success: true,
  data: { status, alteracoes, socios_novos: [], socios_qualificacao: [] },
});

const clientes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    cnpj_limpo: String(10000000000000 + i),
    razao_social: `EMPRESA ${i + 1}`,
  }));

describe('CadastroRefreshService', () => {
  let esperas: number[];
  let esperar: (ms: number) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    esperas = [];
    esperar = async (ms: number) => {
      esperas.push(ms);
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('percorre todos os clientes e separa os desfechos', async () => {
    executeQueryMock.mockResolvedValue(clientes(4));
    atualizarCadastroMock
      .mockResolvedValueOnce(ok('atualizado', [{ campo: 'situacao_cadastral' }]))
      .mockResolvedValueOnce(ok('sem_alteracao'))
      .mockResolvedValueOnce(ok('nao_encontrado'))
      .mockResolvedValueOnce({ success: false, error: 'CNPJ inválido' });

    const r = await new CadastroRefreshService().atualizarTodos({ intervaloMs: 20000, esperar });

    expect(r.total).toBe(4);
    expect(r.processados).toBe(4);
    expect(r.atualizados).toBe(1);
    expect(r.semAlteracao).toBe(1);
    expect(r.naoEncontrados).toBe(1);
    expect(r.erros).toBe(1);
    expect(r.itens[0]?.alteracoes).toEqual(['situacao_cadastral']);
  });

  it('espera entre as consultas — e não depois da última', async () => {
    executeQueryMock.mockResolvedValue(clientes(3));
    atualizarCadastroMock.mockResolvedValue(ok('sem_alteracao'));

    await new CadastroRefreshService().atualizarTodos({ intervaloMs: 20000, esperar });

    // Três consultas, duas pausas. Uma pausa a mais no fim seria 20s de
    // madrugada jogados fora a cada varredura.
    expect(esperas).toEqual([20000, 20000]);
  });

  it('um erro no meio não interrompe a varredura', async () => {
    executeQueryMock.mockResolvedValue(clientes(3));
    atualizarCadastroMock
      .mockResolvedValueOnce(ok('sem_alteracao'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(ok('atualizado'));

    const r = await new CadastroRefreshService().atualizarTodos({ intervaloMs: 0, esperar });

    expect(r.processados).toBe(3);
    expect(r.erros).toBe(1);
    expect(r.atualizados).toBe(1);
    expect(r.itens[1]?.erro).toContain('socket hang up');
  });

  it('no 429 espera o backoff e tenta o mesmo CNPJ de novo', async () => {
    executeQueryMock.mockResolvedValue(clientes(1));
    atualizarCadastroMock
      .mockRejectedValueOnce(new Error('Erro ao consultar ReceitaWS (HTTP 429)'))
      .mockResolvedValueOnce(ok('atualizado'));

    const r = await new CadastroRefreshService().atualizarTodos({ intervaloMs: 0, esperar });

    expect(atualizarCadastroMock).toHaveBeenCalledTimes(2);
    expect(esperas).toContain(BACKOFF_429_MS);
    expect(r.atualizados).toBe(1);
    expect(r.erros).toBe(0);
  });

  it('429 que persiste vira erro daquele cliente, não da varredura', async () => {
    executeQueryMock.mockResolvedValue(clientes(2));
    atualizarCadastroMock
      .mockRejectedValueOnce(new Error('Erro ao consultar ReceitaWS (HTTP 429)'))
      .mockRejectedValueOnce(new Error('Erro ao consultar ReceitaWS (HTTP 429)'))
      .mockResolvedValueOnce(ok('sem_alteracao'));

    const r = await new CadastroRefreshService().atualizarTodos({ intervaloMs: 0, esperar });

    expect(r.erros).toBe(1);
    expect(r.processados).toBe(2);
    expect(r.semAlteracao).toBe(1);
  });

  it('grava de verdade: a varredura do job não roda em simulação', async () => {
    executeQueryMock.mockResolvedValue(clientes(1));
    atualizarCadastroMock.mockResolvedValue(ok('atualizado'));

    await new CadastroRefreshService().atualizarTodos({ intervaloMs: 0, esperar });

    expect(atualizarCadastroMock).toHaveBeenCalledWith(
      '10000000000000',
      expect.objectContaining({ dryRun: false, ignorarCaixa: true })
    );
  });

  it('para no meio quando mandam parar', async () => {
    executeQueryMock.mockResolvedValue(clientes(5));
    atualizarCadastroMock.mockResolvedValue(ok('sem_alteracao'));
    let n = 0;

    const r = await new CadastroRefreshService().atualizarTodos({
      intervaloMs: 0,
      esperar,
      sinalParar: () => ++n > 2,
    });

    expect(r.interrompido).toBe(true);
    expect(r.processados).toBe(2);
  });

  it('recusa uma segunda varredura simultânea', async () => {
    executeQueryMock.mockResolvedValue(clientes(2));
    let liberar!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    atualizarCadastroMock.mockImplementation(async () => {
      await bloqueio;
      return ok('sem_alteracao');
    });

    const servico = new CadastroRefreshService();
    const primeira = servico.atualizarTodos({ intervaloMs: 0, esperar });

    // Espera a primeira varredura realmente entrar em execução — antes disso
    // ainda não há concorrência para recusar.
    while (!servico.status.rodando) await new Promise((r) => setImmediate(r));

    await expect(servico.atualizarTodos({ intervaloMs: 0, esperar })).rejects.toThrow(
      /já em andamento/
    );

    liberar();
    await primeira;
  });
});
