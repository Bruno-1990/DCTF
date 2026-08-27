/**
 * A trava de "já rodou hoje" precisa distinguir o que ACONTECEU do que apenas
 * ficou registrado. Em 27/08/2026 a coleta das 6h morreu no login do DET e
 * gravou uma rodada com total_clientes = 0 — que a regra antiga leu como
 * "procurações já checadas", o que calaria a rodada das 22h do mesmo dia.
 *
 * Decisão pura: sem banco, sem navegador.
 */
import {
  jaChecouProcuracoes,
  jaColetouCaixas,
  type RodadaDoDia,
} from '../../src/services/DetSchedulerRegras';

const caixasOk: RodadaDoDia = { total_clientes: 132, procuracoes_lidas: null };
const caixasFalhouNoLogin: RodadaDoDia = { total_clientes: 0, procuracoes_lidas: null };
const procuracoesOk: RodadaDoDia = { total_clientes: 0, procuracoes_lidas: 133 };

describe('DetScheduler — trava de rodada única por dia', () => {
  describe('caixas', () => {
    it('só conta como rodada quando algum cliente foi varrido', () => {
      expect(jaColetouCaixas([caixasOk])).toBe(true);
      expect(jaColetouCaixas([caixasFalhouNoLogin])).toBe(false);
      expect(jaColetouCaixas([])).toBe(false);
    });

    it('a checagem de procurações não conta como coleta de caixas', () => {
      expect(jaColetouCaixas([procuracoesOk])).toBe(false);
    });
  });

  describe('procurações', () => {
    it('conta quando o SPE foi lido', () => {
      expect(jaChecouProcuracoes([procuracoesOk])).toBe(true);
    });

    it('coleta de caixas que morreu no login NÃO conta (o caso de 27/08/2026)', () => {
      expect(jaChecouProcuracoes([caixasFalhouNoLogin])).toBe(false);
    });

    it('coleta de caixas bem-sucedida não conta', () => {
      expect(jaChecouProcuracoes([caixasOk])).toBe(false);
    });

    it('no dia inteiro, o que vale é existir a rodada do SPE', () => {
      expect(jaChecouProcuracoes([caixasFalhouNoLogin, caixasOk, procuracoesOk])).toBe(true);
      expect(jaChecouProcuracoes([caixasFalhouNoLogin, caixasOk])).toBe(false);
    });
  });
});
