/**
 * Sessão da Administração no navegador.
 *
 * A senha é conferida no servidor (POST /api/admin/login), que devolve uma credencial com prazo.
 * Ela fica no sessionStorage (acaba ao fechar o navegador) e vai em `Authorization: Bearer` em
 * toda chamada. Se o servidor recusar (401 ADMIN_REQUIRED), a sessão é encerrada e a tela avisada.
 */
import type { AxiosInstance } from 'axios';

const CHAVE = 'dctf_admin_sessao';
export const EVENTO_SESSAO_ADMIN_EXPIRADA = 'admin:sessao-expirada';

export interface SessaoAdmin {
  token: string;
  expiraEm: number;
}

const ler = (): SessaoAdmin | null => {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as SessaoAdmin;
    return typeof s?.token === 'string' && typeof s?.expiraEm === 'number' ? s : null;
  } catch {
    return null;
  }
};

export function salvarSessao(s: SessaoAdmin): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* navegador sem storage: a sessão vale só até recarregar */
  }
}

export function sair(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}

export function tokenAdmin(): string | null {
  const s = ler();
  if (!s) return null;
  if (Date.now() >= s.expiraEm) {
    sair();
    return null;
  }
  return s.token;
}

const origem = (url: string): string | null => {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
};

/**
 * @param basesDaApi endereços da nossa API além da própria página (ex.: VITE_API_BASE_URL).
 *   A credencial só vai para essas origens: nunca para um serviço de fora.
 */
export function instalarCredencialAdmin(inst: AxiosInstance, basesDaApi: string[] = []): void {
  const permitidas = new Set([window.location.origin, ...basesDaApi.map(origem).filter((o): o is string => !!o)]);
  inst.interceptors.request.use((config) => {
    const t = tokenAdmin();
    const destino = origem(inst.getUri(config));
    if (t && destino && permitidas.has(destino)) config.headers.set('Authorization', `Bearer ${t}`);
    return config;
  });
  inst.interceptors.response.use(undefined, (erro) => {
    // Erro cru do axios (error.response) ou o "amigável" do services/api (status/data no próprio erro).
    const status = erro?.response?.status ?? erro?.status;
    const codigo = erro?.response?.data?.code ?? erro?.data?.code;
    if (status === 401 && codigo === 'ADMIN_REQUIRED') {
      sair();
      window.dispatchEvent(new Event(EVENTO_SESSAO_ADMIN_EXPIRADA));
    }
    return Promise.reject(erro);
  });
}
