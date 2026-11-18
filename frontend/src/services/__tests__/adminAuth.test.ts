import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVENTO_SESSAO_ADMIN_EXPIRADA,
  instalarCredencialAdmin,
  sair,
  salvarSessao,
  tokenAdmin,
} from '../adminAuth';

/** Instância com um "servidor" falso que registra os cabeçalhos e responde o que mandarmos. */
function instancia(resposta: { status: number; data?: unknown } = { status: 200, data: { ok: true } }) {
  const vistos: Array<Record<string, unknown>> = [];
  const adapter: AxiosAdapter = async (config) => {
    vistos.push({ ...(config.headers as object) });
    const r = { data: resposta.data, status: resposta.status, statusText: '', headers: {}, config };
    if (resposta.status >= 400) {
      const erro: any = new Error(`HTTP ${resposta.status}`);
      erro.response = r;
      erro.config = config;
      throw erro;
    }
    return r;
  };
  const inst: AxiosInstance = axios.create({ adapter });
  instalarCredencialAdmin(inst, ['http://localhost:38572/api']);
  return { inst, vistos };
}

describe('adminAuth (front)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('guarda a sessão e devolve a credencial enquanto vale', () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    expect(tokenAdmin()).toBe('abc.def');
  });

  it('credencial vencida não é devolvida (e é apagada)', () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() - 1 });
    expect(tokenAdmin()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('sair apaga a sessão', () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    sair();
    expect(tokenAdmin()).toBeNull();
  });

  it('não usa localStorage (a sessão acaba ao fechar o navegador)', () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    expect(localStorage.length).toBe(0);
  });

  it('manda Authorization: Bearer quando há sessão', async () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    const { inst, vistos } = instancia();
    await inst.post('/qualquer');
    expect(vistos[0]['Authorization']).toBe('Bearer abc.def');
  });

  it('nunca manda a credencial para outro servidor', async () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    const { inst, vistos } = instancia();
    await inst.get('https://receitaws.com.br/v1/cnpj/123');
    await inst.get(`${window.location.origin}/api/x`);
    await inst.get('http://localhost:38572/api/x');
    expect(vistos[0]['Authorization']).toBeUndefined();
    expect(vistos[1]['Authorization']).toBe('Bearer abc.def');
    expect(vistos[2]['Authorization']).toBe('Bearer abc.def');
  });

  it('não manda Authorization sem sessão', async () => {
    const { inst, vistos } = instancia();
    await inst.get('/qualquer');
    expect(vistos[0]['Authorization']).toBeUndefined();
  });

  it('401 ADMIN_REQUIRED: encerra a sessão e avisa a tela', async () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_SESSAO_ADMIN_EXPIRADA, ouvinte);
    const { inst } = instancia({ status: 401, data: { success: false, code: 'ADMIN_REQUIRED' } });
    await expect(inst.post('/acao')).rejects.toBeTruthy();
    expect(tokenAdmin()).toBeNull();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_SESSAO_ADMIN_EXPIRADA, ouvinte);
  });

  it('outros erros não mexem na sessão', async () => {
    salvarSessao({ token: 'abc.def', expiraEm: Date.now() + 60_000 });
    const { inst } = instancia({ status: 500, data: { success: false } });
    await expect(inst.post('/acao')).rejects.toBeTruthy();
    expect(tokenAdmin()).toBe('abc.def');
  });
});
