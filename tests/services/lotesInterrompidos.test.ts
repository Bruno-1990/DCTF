jest.mock('../../src/config/mysql', () => ({ executeQuery: jest.fn() }));

import { executeQuery } from '../../src/config/mysql';
import { fecharLotesOrfaos, ultimoLoteInterrompido } from '../../src/services/participacaoSitf/lotesInterrompidos';
import { barramentoParticipacao } from '../../src/services/participacaoSitf/eventos';

const q = executeQuery as jest.Mock;

beforeEach(() => {
  q.mockReset();
  (global as any).sitfLoteProgress = {};
});

describe('fecharLotesOrfaos', () => {
  it('lote "em andamento" no banco que este processo não conhece vira interrompido, e a fila dele volta a pendente', async () => {
    (global as any).sitfLoteProgress = { 'sitf-lote-vivo': { status: 'em_andamento' } };
    q.mockResolvedValueOnce([
      { progress_id: 'sitf-lote-morto', total: 66, processados: 3, sucessos: 3, erros: 0, porcentagem: 5, cnpj_atual: 'x' },
      { progress_id: 'sitf-lote-vivo', total: 10, processados: 1, sucessos: 1, erros: 0, porcentagem: 10, cnpj_atual: 'y' },
    ]).mockResolvedValue([]);
    const avisos: any[] = [];
    const ouvir = (e: any) => avisos.push(e);
    barramentoParticipacao.on('evento', ouvir);

    expect(await fecharLotesOrfaos()).toEqual(['sitf-lote-morto']);
    barramentoParticipacao.off('evento', ouvir);

    const sqls = q.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
    expect(sqls[1]).toContain("SET status = 'interrompida'");
    expect(q.mock.calls[1][1]).toEqual(['sitf-lote-morto']);
    expect(sqls[2]).toContain("SET status = 'pendente'");
    expect(sqls[2]).toContain("status = 'processando'");
    expect(q.mock.calls[2][1]).toEqual(['sitf-lote-morto']);
    expect(avisos).toContainEqual(expect.objectContaining({ tipo: 'lote', progressId: 'sitf-lote-morto', status: 'interrompida', processados: 3 }));
  });

  it('sem órfão não escreve nada', async () => {
    q.mockResolvedValueOnce([]);
    expect(await fecharLotesOrfaos()).toEqual([]);
    expect(q).toHaveBeenCalledTimes(1);
  });
});

describe('ultimoLoteInterrompido', () => {
  it('devolve o último lote só se ele terminou interrompido (um lote mais novo esconde o aviso)', async () => {
    q.mockResolvedValueOnce([
      { progress_id: 'sitf-lote-morto', status: 'interrompida', total: 66, processados: 3, sucessos: 3, erros: 0, porcentagem: 5, cnpj_atual: null, iniciado_em: '2026-11-17T18:26:38Z', finalizado_em: '2026-11-17T18:40:00Z' },
    ]);
    expect(await ultimoLoteInterrompido()).toEqual(
      expect.objectContaining({ progressId: 'sitf-lote-morto', status: 'interrompida', processados: 3, total: 66, iniciadoEm: '2026-11-17T18:26:38.000Z' }),
    );

    q.mockResolvedValueOnce([{ progress_id: 'novo', status: 'concluida', total: 1, processados: 1 }]);
    expect(await ultimoLoteInterrompido()).toBeNull();
  });
});
