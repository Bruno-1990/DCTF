/**
 * Parser do evento eSocial S-5002 (evtIrrfBenef) a partir do envelope retornoEventoCompleto.
 * Extrai por CPF: ideEvento.perApur, ideEmpregador, dmDev (perRef, infoIR) e agrega por CPF → período → tpInfoIR.
 */

import { XMLParser } from 'fast-xml-parser';

export interface IdeEmpregador {
  tpInsc?: string;
  nrInsc?: string;
}

export interface InfoIR {
  tpInfoIR: string;
  valor: number;
}

export interface DmDev {
  perRef: string;
  ideDmDev?: string;
  tpPgto?: string;
  dtPgto?: string;
  codCateg?: string;
  infoIR: InfoIR[];
}

export interface EvtIrrfBenefExtract {
  perApur?: string;
  ideEmpregador?: IdeEmpregador;
  cpfBenef: string;
  dmDevList: DmDev[];
}

export interface MesAgregado {
  verbas: Record<string, number>;
  totalMes: number;
}

export interface CpfAgregado {
  meses: Record<string, MesAgregado>;
  totalAno: number;
}

export interface DirfParseResult {
  porCpf: Record<string, CpfAgregado>;
  arquivosProcessados: number;
  errosPorArquivo: Record<string, string>;
}

const defaultOptions = {
  ignoreDeclaration: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
};

/**
 * Encontra o primeiro elemento evtIrrfBenef no objeto parseado.
 * O XML pode ser retornoEventoCompleto > evento > eSocial > evtIrrfBenef
 * ou ter namespaces (eSocial com prefixo). O parser com ignoreNamespace remove prefixos.
 */
function findEvtIrrfBenef(obj: unknown): Record<string, unknown> | null {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  if (o.evtIrrfBenef) {
    const evt = o.evtIrrfBenef as Record<string, unknown>;
    return Array.isArray(evt) ? (evt[0] as Record<string, unknown>) : evt;
  }

  if (o.retornoEventoCompleto) {
    const ret = o.retornoEventoCompleto as Record<string, unknown>;
    const evento = ret.evento as Record<string, unknown> | undefined;
    if (evento) {
      const eSocial = evento.eSocial as Record<string, unknown> | undefined;
      if (eSocial && eSocial.evtIrrfBenef) {
        const evt = eSocial.evtIrrfBenef as Record<string, unknown>;
        return Array.isArray(evt) ? (evt[0] as Record<string, unknown>) : evt;
      }
    }
  }

  for (const key of Object.keys(o)) {
    const child = findEvtIrrfBenef(o[key]);
    if (child) return child;
  }
  return null;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const n = Number(String(val).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function str(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

/** Códigos tpInfoIR de plano de saúde (separar titular/dependente quando houver indTitular ou tpDep). */
const TP_INFO_IR_PLANO_SAUDE = new Set(['67', '9067']);

/** tpInfoIR 7900 = Verba diversa (convênio, consignações, etc.). No XSD, descRendimento (dscRubr S-1010) pode detalhar. */
const TP_INFO_IR_VERBA_DIVERSA = '7900';

/**
 * Normaliza descRendimento para sufixo de chave: minúsculas, sem acentos, espaços → underscore, max 50 chars.
 * Ver S-5002_evtIrrfBenef.xsd: infoIR/descRendimento (origem: dscRubr em S-1010).
 */
function normalizeDescRendimento(desc: string): string {
  if (!desc || !desc.trim()) return '';
  const s = desc.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

/**
 * Chave da verba para agregação.
 * - Plano de saúde (67, 9067): usa _titular / _dependente quando indTitular ou tpDep informado.
 * - Verba diversa (7900): quando descRendimento estiver presente, usa 7900_<descrição normalizada> para destrinchar.
 * - Demais: retorna o próprio tpInfoIR.
 */
function verbaKey(tpInfoIR: string, ir: Record<string, unknown>): string {
  if (TP_INFO_IR_PLANO_SAUDE.has(tpInfoIR)) {
    const indTitular = str(ir.indTitular).toUpperCase();
    const tpDep = str(ir.tpDep);
    if (indTitular === 'S') return `${tpInfoIR}_titular`;
    if (indTitular === 'N') return `${tpInfoIR}_dependente`;
    if (tpDep && tpDep !== '00') return `${tpInfoIR}_dependente`;
    return tpInfoIR;
  }
  if (tpInfoIR === TP_INFO_IR_VERBA_DIVERSA) {
    const desc = str(ir.descRendimento);
    const suffix = normalizeDescRendimento(desc);
    if (suffix) return `${TP_INFO_IR_VERBA_DIVERSA}_${suffix}`;
  }
  return tpInfoIR;
}

/**
 * Extrai um único evento evtIrrfBenef para estrutura EvtIrrfBenefExtract.
 */
function extractEvent(evt: Record<string, unknown>): EvtIrrfBenefExtract | null {
  const ideTrabalhador = evt.ideTrabalhador as Record<string, unknown> | undefined;
  if (!ideTrabalhador) return null;

  const cpfBenef = str(ideTrabalhador.cpfBenef);
  if (!cpfBenef) return null;

  const ideEvento = evt.ideEvento as Record<string, unknown> | undefined;
  const perApur = ideEvento ? str(ideEvento.perApur) : undefined;

  const ideEmpregador = evt.ideEmpregador as Record<string, unknown> | undefined;
  const emp: IdeEmpregador | undefined = ideEmpregador
    ? { tpInsc: str(ideEmpregador.tpInsc), nrInsc: str(ideEmpregador.nrInsc) }
    : undefined;

  const dmDevRaw = ideTrabalhador.dmDev;
  const dmDevList: DmDev[] = [];

  for (const dev of asArray(dmDevRaw)) {
    const d = dev as Record<string, unknown>;
    const perRef = str(d.perRef);
    const infoIRRaw = d.infoIR;
    const infoIR: InfoIR[] = [];
    for (const ir of asArray(infoIRRaw)) {
      const i = ir as Record<string, unknown>;
      const tpInfoIR = str(i.tpInfoIR);
      if (!tpInfoIR) continue;
      const key = verbaKey(tpInfoIR, i);
      infoIR.push({ tpInfoIR: key, valor: num(i.valor) });
    }
    dmDevList.push({
      perRef,
      ideDmDev: str(d.ideDmDev) || undefined,
      tpPgto: str(d.tpPgto) || undefined,
      dtPgto: str(d.dtPgto) || undefined,
      codCateg: str(d.codCateg) || undefined,
      infoIR,
    });
  }

  // Extrair plano de saúde de infoIRComplem/planSaude (vlrSaudeTit, infoDepSau/vlrSaudeDep) e incluir como 67_titular e 67_dependente
  injectPlanSaudeFromInfoIRComplem(ideTrabalhador, ideEvento, dmDevList);

  return {
    perApur,
    ideEmpregador: emp,
    cpfBenef,
    dmDevList,
  };
}

/**
 * Lê infoIRComplem/planSaude (vlrSaudeTit, infoDepSau/vlrSaudeDep) do XML e adiciona verbas 67_titular e 67_dependente
 * ao DmDev do período correspondente, para exibir plano de saúde separado por Titular e Dependente.
 * Ver S-5002: ideTrabalhador > infoIRComplem[] > planSaude[] (vlrSaudeTit, infoDepSau[].vlrSaudeDep).
 */
function injectPlanSaudeFromInfoIRComplem(
  ideTrabalhador: Record<string, unknown>,
  ideEvento: Record<string, unknown> | undefined,
  dmDevList: DmDev[]
): void {
  const perApur = ideEvento ? str(ideEvento.perApur) : '';
  for (const compl of asArray(ideTrabalhador.infoIRComplem)) {
    const c = compl as Record<string, unknown>;
    const perAnt = c.perAnt as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const perRefAjuste = Array.isArray(perAnt)
      ? (perAnt[0] as Record<string, unknown>)?.perRefAjuste
      : (perAnt as Record<string, unknown>)?.perRefAjuste;
    const perRef = str(perRefAjuste) || perApur || (dmDevList[0]?.perRef ?? '');

    let vlrTit = 0;
    let vlrDep = 0;
    for (const ps of asArray(c.planSaude)) {
      const plan = ps as Record<string, unknown>;
      vlrTit += num(plan.vlrSaudeTit);
      for (const dep of asArray(plan.infoDepSau)) {
        const infoDep = dep as Record<string, unknown>;
        vlrDep += num(infoDep.vlrSaudeDep);
      }
    }

    if (vlrTit === 0 && vlrDep === 0) continue;

    let dm = dmDevList.find((d) => d.perRef === perRef);
    if (!dm) {
      dm = {
        perRef,
        infoIR: [],
      };
      dmDevList.push(dm);
    }
    if (vlrTit > 0) {
      dm.infoIR.push({ tpInfoIR: '67_titular', valor: vlrTit });
    }
    if (vlrDep > 0) {
      dm.infoIR.push({ tpInfoIR: '67_dependente', valor: vlrDep });
    }
  }
}

/**
 * Agrega listas de EvtIrrfBenefExtract em porCpf → meses → verbas (tpInfoIR → soma valor); totalMes e totalAno.
 */
function aggregate(extracts: EvtIrrfBenefExtract[]): DirfParseResult['porCpf'] {
  const porCpf: Record<string, CpfAgregado> = {};

  for (const ex of extracts) {
    const cpf = ex.cpfBenef;
    if (!porCpf[cpf]) {
      porCpf[cpf] = { meses: {}, totalAno: 0 };
    }
    const agg = porCpf[cpf];

    for (const dm of ex.dmDevList) {
      const perRef = dm.perRef;
      if (!agg.meses[perRef]) {
        agg.meses[perRef] = { verbas: {}, totalMes: 0 };
      }
      const mes = agg.meses[perRef];

      for (const ir of dm.infoIR) {
        const key = ir.tpInfoIR; // já pode ser 67_titular, 67_dependente, etc.
        mes.verbas[key] = (mes.verbas[key] ?? 0) + ir.valor;
        mes.totalMes += ir.valor;
      }
    }
  }

  for (const cpf of Object.keys(porCpf)) {
    let totalAno = 0;
    for (const perRef of Object.keys(porCpf[cpf].meses)) {
      totalAno += porCpf[cpf].meses[perRef].totalMes;
    }
    porCpf[cpf].totalAno = totalAno;
  }

  return porCpf;
}

/**
 * Parse de um único XML (string ou buffer) e extração de evtIrrfBenef.
 * Retorna array de evts extraídos (normalmente 1 por arquivo) e erro se não encontrar evento válido.
 */
export function parseSingleXml(xmlContent: string): { extracts: EvtIrrfBenefExtract[]; error?: string } {
  const parser = new XMLParser({
    ...defaultOptions,
    ignoreDeclaration: true,
    removeNSPrefix: true,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(xmlContent);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { extracts: [], error: `XML inválido: ${msg}` };
  }

  const evt = findEvtIrrfBenef(parsed);
  if (!evt) {
    return { extracts: [], error: 'Nenhum evento evtIrrfBenef (S-5002) encontrado no XML.' };
  }

  const extract = extractEvent(evt);
  if (!extract) {
    return { extracts: [], error: 'Evento evtIrrfBenef sem ideTrabalhador ou cpfBenef.' };
  }

  return { extracts: [extract] };
}

/**
 * Processa múltiplos conteúdos XML e retorna resultado agregado por CPF, mês e verba.
 */
export function parseAndAggregate(
  files: { nome: string; conteudo: string }[]
): DirfParseResult {
  const errosPorArquivo: Record<string, string> = {};
  const allExtracts: EvtIrrfBenefExtract[] = [];
  let arquivosProcessados = 0;

  for (const file of files) {
    const { extracts, error } = parseSingleXml(file.conteudo);
    if (error) {
      errosPorArquivo[file.nome] = error;
      continue;
    }
    allExtracts.push(...extracts);
    arquivosProcessados += 1;
  }

  const porCpf = aggregate(allExtracts);

  return {
    porCpf,
    arquivosProcessados,
    errosPorArquivo,
  };
}
