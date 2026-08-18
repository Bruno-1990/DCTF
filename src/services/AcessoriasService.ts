/**
 * Serviço de leitura (read-only) da carteira do Sistema Acessórias.
 * Doc: https://api.acessorias.com/documentation
 *
 * A listagem é paginada em 20 registros por página (`/companies/ListAll?Pagina=N`)
 * e não devolve total nem header de paginação — varre-se até vir página vazia ou
 * 204. O rate limit é de 100 req/min, então há uma folga entre páginas.
 *
 * Nenhuma escrita é feita na Acessórias.
 */

import {
  getAcessoriasConfig,
  ACESSORIAS_INTERVALO_PAGINA_MS,
  type AcessoriasConfig,
} from '../config/acessorias';
import {
  mapEmpresaRow,
  isSincronizavel,
  type AcessoriasEmpresa,
  type AcessoriasEmpresaRow,
} from './acessorias.mappers';

/** Teto de páginas — trava de segurança contra loop infinito se a API mudar. */
const MAX_PAGINAS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AcessoriasStatus {
  configurada: boolean;
  baseUrl: string;
  /** true se a API respondeu 200/204 na sondagem; false em 401/erro de rede. */
  ativa: boolean;
  erro?: string;
}

export class AcessoriasService {
  private config(): AcessoriasConfig {
    return getAcessoriasConfig();
  }

  /** GET autenticado. Devolve o corpo já parseado, ou null em 204 (sem conteúdo). */
  private async get<T>(path: string): Promise<T | null> {
    const cfg = this.config();
    const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
    });

    if (res.status === 204) return null;
    if (res.status === 401) {
      throw new Error('Token da Acessórias inválido ou expirado (401). Gere um novo em Configurações → API Token.');
    }
    if (res.status === 429) {
      throw new Error('Limite de requisições da Acessórias atingido (429, 100 req/min). Tente novamente em um minuto.');
    }
    if (!res.ok) {
      throw new Error(`Acessórias respondeu HTTP ${res.status} em ${path}.`);
    }
    return (await res.json()) as T;
  }

  /**
   * Varre a carteira inteira (todas as páginas) e devolve as empresas normalizadas,
   * incluindo as inativas — filtrar é decisão do caller.
   */
  async buscarTodasEmpresas(): Promise<AcessoriasEmpresa[]> {
    const todas: AcessoriasEmpresa[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const rows = await this.get<AcessoriasEmpresaRow[]>(`/companies/ListAll?Pagina=${pagina}`);
      if (!rows || !Array.isArray(rows) || rows.length === 0) break;

      todas.push(...rows.map(mapEmpresaRow));
      await sleep(ACESSORIAS_INTERVALO_PAGINA_MS);
    }

    return todas;
  }

  /**
   * Empresas ATIVAS com CNPJ válido — o equivalente ao "Mensais + Ativos" do
   * OneClick. É esse conjunto que a sincronização considera.
   */
  async buscarEmpresasAtivas(): Promise<AcessoriasEmpresa[]> {
    const todas = await this.buscarTodasEmpresas();
    return todas.filter(isSincronizavel).sort((a, b) =>
      (a.razao_social || '').localeCompare(b.razao_social || ''),
    );
  }

  /** Empresas ativas filtradas por id da Acessórias. Usado na importação seletiva. */
  async buscarEmpresasPorIds(ids: string[]): Promise<AcessoriasEmpresa[]> {
    if (ids.length === 0) return [];
    const alvo = new Set(ids.map(String));
    const ativas = await this.buscarEmpresasAtivas();
    return ativas.filter((e) => alvo.has(e.id));
  }

  /**
   * Sondagem barata (1 requisição) para o indicador no frontend: diz se o token
   * está configurado e se a API responde.
   */
  async status(): Promise<AcessoriasStatus> {
    let baseUrl = 'https://api.acessorias.com';
    try {
      const cfg = this.config();
      baseUrl = cfg.baseUrl;
      await this.get<AcessoriasEmpresaRow[]>('/companies/ListAll?Pagina=1');
      return { configurada: true, baseUrl, ativa: true };
    } catch (err: any) {
      return {
        configurada: Boolean(process.env['ACESSORIAS_API_TOKEN']?.trim()),
        baseUrl,
        ativa: false,
        erro: err?.message || 'Falha ao consultar a Acessórias',
      };
    }
  }
}
