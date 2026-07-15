/**
 * Resolve, no Portal da Transparência do ES, qual é a planilha vigente de cada
 * programa de benefício fiscal.
 *
 * Por que existe: o portal não tem deep-link nem API. Cada seção é um acordeão
 * que carrega o conteúdo por AJAX de `ObterFilhos/<id>`, e o id do arquivo muda
 * a cada publicação mensal. Fixar a URL do CSV no código funcionaria hoje e
 * apontaria em silêncio para a planilha do mês passado depois — num sistema
 * fiscal isso é pior que um erro visível. Então resolvemos na hora.
 *
 * Roda no backend porque o portal não envia CORS: o navegador não consegue.
 */

import axios from 'axios';

const PORTAL_BASE = 'https://transparencia.es.gov.br';
export const PORTAL_PAGINA = `${PORTAL_BASE}/Comum/IncentivosFiscais`;

export type ProgramaBeneficio = 'compete' | 'invest';

/** Seções do portal (conferidas em 07/2026). `secao` é o rótulo mostrado ao operador. */
const PROGRAMAS: Record<ProgramaBeneficio, { itemId: number; secao: string; descricao: string }> = {
  compete: { itemId: 341, secao: '04', descricao: 'Lista de Beneficiários do programa Compete' },
  invest: { itemId: 240, secao: '05', descricao: 'Lista de Beneficiários do programa Invest' },
};

export interface FontePlanilha {
  programa: ProgramaBeneficio;
  secao: string;
  descricao: string;
  /** Página do portal — sempre presente, serve de fallback no frontend. */
  portalUrl: string;
  /** Link direto do CSV vigente. Null quando não foi possível resolver. */
  arquivoUrl: string | null;
  /** Rótulo do arquivo como publicado (ex.: 'Programa Compete - ES - Ativos em 07.2026'). */
  arquivoLabel: string | null;
  /** Null quando arquivoUrl é null — diz ao operador por que só sobrou o link do portal. */
  erro: string | null;
}

export class FontePlanilhaService {
  private readonly timeoutMs = 10_000;

  /**
   * Nunca lança: se o portal mudar, cair ou demorar, devolve `arquivoUrl: null`
   * e o frontend degrada para o link da página. Uma falha aqui não pode
   * derrubar a tela de importação.
   */
  async obter(programa: ProgramaBeneficio): Promise<FontePlanilha> {
    const { itemId, secao, descricao } = PROGRAMAS[programa];
    const base: FontePlanilha = {
      programa,
      secao,
      descricao,
      portalUrl: PORTAL_PAGINA,
      arquivoUrl: null,
      arquivoLabel: null,
      erro: null,
    };

    try {
      const { data } = await axios.get<string>(
        `${PORTAL_PAGINA}/ObterFilhos/${itemId}?NivelAnterior=0`,
        {
          timeout: this.timeoutMs,
          responseType: 'text',
          headers: { 'User-Agent': 'DCTF-Analyzer/1.0', Accept: 'text/html' },
        }
      );

      const arquivo = this.extrairAtivos(String(data));
      if (!arquivo) {
        return { ...base, erro: 'Não encontrei o arquivo de ativos na seção do portal.' };
      }

      return { ...base, arquivoUrl: `${PORTAL_BASE}${arquivo.href}`, arquivoLabel: arquivo.label };
    } catch (error: any) {
      return { ...base, erro: error?.message || 'Portal indisponível.' };
    }
  }

  /**
   * O fragmento é uma lista de <li><a href="/Comum/IncentivosFiscais/Download/N">rótulo</a></li>.
   * A seção publica "Ativos" e "Excluidos_cancelados"; só o primeiro interessa.
   * Casar por rótulo (e não por posição) evita pegar o arquivo errado caso o
   * portal inverta a ordem.
   */
  private extrairAtivos(html: string): { href: string; label: string } | null {
    const links = [...html.matchAll(/<a[^>]*href="([^"]*\/Download\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({
      href: m[1] as string,
      label: (m[2] as string).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    }));

    return links.find(l => /ativos/i.test(l.label) && !/exclu|cancel/i.test(l.label)) ?? null;
  }
}
