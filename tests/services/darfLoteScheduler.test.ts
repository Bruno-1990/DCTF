/**
 * Quando o lote de DARF agendado roda.
 *
 * Regra: no dia agendado (ou depois, se o dia foi perdido) o lote roda inteiro,
 * a menos que o PRÓPRIO agendador já tenha rodado a competência a partir do dia
 * agendado. Rodada manual/de teste anterior não conta — em 25/09/2026 um teste
 * de 04/09 com 1 guia emitida fez o mês ser dado como feito e o lote não rodou.
 */
const executeQuery = jest.fn();
const executar = jest.fn();
const obter = jest.fn();

jest.mock('../../src/config/mysql', () => ({ executeQuery: (...a: unknown[]) => executeQuery(...a) }));
jest.mock('../../src/services/DarfLoteService', () => ({
  __esModule: true,
  default: { executar: (...a: unknown[]) => executar(...a) },
  competenciaAlvo: (d: Date) => ({ anoPA: String(d.getFullYear()), mesPA: String(d.getMonth() + 1).padStart(2, '0') }),
  modoCompetencia: () => 'vigente',
}));
jest.mock('../../src/services/agendamentos/AgendamentoConfigService', () => ({
  __esModule: true,
  default: { obter: (...a: unknown[]) => obter(...a) },
}));

import { DarfLoteScheduler, inicioDaJanela } from '../../src/services/DarfLoteScheduler';

const verificarEm = async (iso: string) => {
  jest.setSystemTime(new Date(iso));
  await (new DarfLoteScheduler() as any).verificar();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  obter.mockResolvedValue({ id: 'darf-lote', ativo: true, dia: 25, hora: 4, minuto: 0, diasSemana: null });
  executar.mockResolvedValue({ emitidos: 0, reaproveitados: 17, falhas: 0, emailEnviado: true });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.useRealTimers());

describe('DarfLoteScheduler.verificar', () => {
  it('só conta como feita a rodada do agendador iniciada a partir do dia agendado', async () => {
    executeQuery.mockResolvedValue([{ total: 0 }]);
    await verificarEm('2026-09-25T04:00:30');

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/disparado_por = 'agendador'/);
    expect(sql).toMatch(/iniciado_em >= \?/);
    expect(params).toEqual(['2026', '09', '2026-09-25']);
    expect(executar).toHaveBeenCalledWith({ anoPA: '2026', mesPA: '09', disparadoPor: 'agendador' });
  });

  it('não roda de novo depois que o agendador já rodou a competência', async () => {
    executeQuery.mockResolvedValue([{ total: 1 }]);
    await verificarEm('2026-09-25T04:10:00');
    expect(executar).not.toHaveBeenCalled();
  });

  it('no dia agendado, fora da hora, não roda', async () => {
    await verificarEm('2026-09-25T03:59:00');
    expect(executeQuery).not.toHaveBeenCalled();
    expect(executar).not.toHaveBeenCalled();
  });

  it('dia perdido: recupera no dia seguinte em qualquer hora', async () => {
    executeQuery.mockResolvedValue([{ total: 0 }]);
    await verificarEm('2026-09-26T15:00:00');
    expect(executar).toHaveBeenCalled();
  });

  it('job desligado no painel não roda', async () => {
    obter.mockResolvedValue({ id: 'darf-lote', ativo: false, dia: 25, hora: 4 });
    await verificarEm('2026-09-25T04:00:00');
    expect(executar).not.toHaveBeenCalled();
  });
});

describe('inicioDaJanela', () => {
  it('monta a data do dia agendado no mês corrente', () => {
    expect(inicioDaJanela(new Date(2026, 0, 30), 5)).toBe('2026-01-05');
  });
});
