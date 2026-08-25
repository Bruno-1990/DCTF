/**
 * A REGRA DE QUEM TEM PROCURAÇÃO — fonte única.
 *
 * Nasceu dentro de `scripts/run-det-migration.ts`, que fazia a carga inicial a
 * partir de um retrato do SPE em arquivo. Agora que a varredura do SPE é ao
 * vivo e roda antes de toda coleta, a mesma regra precisa valer nos dois
 * caminhos — duas cópias divergiriam em silêncio, e o efeito só apareceria
 * como cliente varrido à toa ou, pior, cliente esquecido.
 *
 * A regra foi validada no DET em 21/08/2026 sobre uma amostra de 12 casos
 * (11 confirmados + 1 caso especial explicado), nesta ordem:
 *   1. o próprio escritório      -> acessa sem procuração
 *   2. procuração ATIVA no CNPJ  -> deferido
 *   3. procuração ATIVA na RAIZ  -> deferido (matriz cobre filial, confirmado
 *                                   com a filial 03.597.050/0002-77)
 *   4. senão                     -> indeferido, distinguindo "nunca teve" de
 *                                   "revogada/expirada", porque a conversa com
 *                                   o cliente é diferente em cada caso
 */

export const CNPJ_ESCRITORIO = '32401481000133';

/** Uma linha da aba "Recebidas (sou Outorgado)" do SPE. */
export interface ProcSpe {
  cnpj: string;
  nome: string;
  nivel: string;
  vigencia: string;
  situacao: string; // 'Ativa' | 'Revogada' | 'Expirada'
}

export interface Classificacao {
  situacao: 'deferido' | 'indeferido';
  origem: 'spe' | 'manual' | 'proprio';
  outorgante: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  situacaoSpe: string | null;
  observacao: string;
}

export interface IndiceSpe {
  porCnpj: Map<string, ProcSpe[]>;
  porRaiz: Map<string, ProcSpe[]>;
  total: number;
}

export const soDigitos = (s: string): string => String(s ?? '').replace(/\D/g, '');

/** "19/01/2024 a 18/01/2029" -> ['2024-01-19', '2029-01-18'] */
export function parseVigencia(v: string): [string | null, string | null] {
  const m = String(v ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return [null, null];
  return [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`];
}

/** Indexa o retrato do SPE por CNPJ completo e por raiz (8 primeiros dígitos). */
export function indexar(procs: ProcSpe[]): IndiceSpe {
  const porCnpj = new Map<string, ProcSpe[]>();
  const porRaiz = new Map<string, ProcSpe[]>();
  let total = 0;
  for (const p of procs) {
    const d = soDigitos(p.cnpj);
    if (d.length !== 14) continue;
    total++;
    if (!porCnpj.has(d)) porCnpj.set(d, []);
    porCnpj.get(d)!.push(p);
    const r = d.slice(0, 8);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r)!.push(p);
  }
  return { porCnpj, porRaiz, total };
}

const ativas = (l: ProcSpe[] = []): ProcSpe[] =>
  l.filter((x) => String(x.situacao ?? '').trim().toLowerCase() === 'ativa');

/** Aplica a regra a UM estabelecimento. Não toca em banco nem em navegador. */
export function classificar(cnpj: string, idx: IndiceSpe): Classificacao {
  const d = soDigitos(cnpj);

  if (d === CNPJ_ESCRITORIO) {
    return {
      situacao: 'deferido',
      origem: 'proprio',
      outorgante: null,
      vigenciaInicio: null,
      vigenciaFim: null,
      situacaoSpe: null,
      observacao: 'Próprio escritório — acessa sem procuração',
    };
  }

  const exatas = ativas(idx.porCnpj.get(d));
  if (exatas.length) {
    const [ini, fim] = parseVigencia(exatas[0]!.vigencia);
    return {
      situacao: 'deferido',
      origem: 'spe',
      outorgante: d,
      vigenciaInicio: ini,
      vigenciaFim: fim,
      situacaoSpe: exatas[0]!.situacao,
      observacao: 'Procuração no próprio CNPJ',
    };
  }

  const raizes = ativas(idx.porRaiz.get(d.slice(0, 8)));
  if (raizes.length) {
    const [ini, fim] = parseVigencia(raizes[0]!.vigencia);
    return {
      situacao: 'deferido',
      origem: 'spe',
      outorgante: soDigitos(raizes[0]!.cnpj),
      vigenciaInicio: ini,
      vigenciaFim: fim,
      situacaoSpe: raizes[0]!.situacao,
      observacao: `Coberto pela procuração da raiz (${raizes[0]!.cnpj})`,
    };
  }

  // Sem procuração ativa. Se existe histórico, o texto diz o que fazer.
  const antigas = idx.porCnpj.get(d) ?? idx.porRaiz.get(d.slice(0, 8)) ?? [];
  if (antigas.length) {
    const [ini, fim] = parseVigencia(antigas[0]!.vigencia);
    return {
      situacao: 'indeferido',
      origem: 'spe',
      outorgante: null,
      vigenciaInicio: ini,
      vigenciaFim: fim,
      situacaoSpe: antigas[0]!.situacao,
      observacao: `Procuração ${String(antigas[0]!.situacao).toLowerCase()} — precisa renovar`,
    };
  }

  return {
    situacao: 'indeferido',
    origem: 'spe',
    outorgante: null,
    vigenciaInicio: null,
    vigenciaFim: null,
    situacaoSpe: null,
    observacao: 'Nenhuma procuração no SPE — precisa ser outorgada',
  };
}
