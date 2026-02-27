/**
 * Leiaute .DEC por exercício (Task 19.1, PRD 11.4).
 * Tipos de registro: Inicio, Fim, Tam, Formato (N/NN/C/A/I).
 * Fonte: DOC/IRPF-LeiauteTXT-20XX ou config interno.
 */

export type FormatoCampo = 'N' | 'NN' | 'C' | 'A' | 'I';

export interface CampoLayout {
  nome: string;
  inicio: number;  // posição inicial (1-based)
  fim: number;     // posição final (inclusive)
  tam: number;     // tamanho
  formato: FormatoCampo;  // N=número, NN=decimal, C=caracter, A=alfanumerico, I=inteiro
}

export interface RecordTypeLayout {
  tipo: string;    // ex: IR, 01, 16, 17, 18, 19, 20, 21..92, 84, 88, T9, HR, DR, R9
  tamTotal: number;
  campos: CampoLayout[];
}

export interface DecLayout {
  exercicio: number;
  layoutVersion: string;
  recordTypes: RecordTypeLayout[];
}

/** Configuração mínima de leiaute por exercício (sem PDF; expandível quando houver Anexo D completo) */
const LAYOUT_BY_EXERCICIO: Map<number, DecLayout> = new Map();

function buildDefaultLayout(exercicio: number): DecLayout {
  const layoutVersion = `IRPF-LeiauteTXT-${exercicio}`;
  const recordTypes: RecordTypeLayout[] = [
    { tipo: 'IR', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'C' }, { nome: 'EXERCICIO', inicio: 3, fim: 6, tam: 4, formato: 'N' }, { nome: 'RESTO', inicio: 7, fim: 250, tam: 244, formato: 'A' }] },
    { tipo: '01', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '16', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '17', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '18', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '19', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '20', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    ...Array.from({ length: 72 }, (_, i) => ({
      tipo: String(21 + i),
      tamTotal: 250,
      campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' as const }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' as const }],
    })),
    { tipo: '84', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: '88', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'N' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: 'T9', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'C' }, { nome: 'TOTAIS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: 'HR', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'C' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: 'DR', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'C' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
    { tipo: 'R9', tamTotal: 250, campos: [{ nome: 'TIPO', inicio: 1, fim: 2, tam: 2, formato: 'C' }, { nome: 'DADOS', inicio: 3, fim: 250, tam: 248, formato: 'A' }] },
  ];
  return { exercicio, layoutVersion, recordTypes };
}

/**
 * Retorna o leiaute para o exercício (config interna; pode ser estendido para DB/PDF).
 */
export function getLayoutForExercicio(exercicio: number): DecLayout {
  if (!LAYOUT_BY_EXERCICIO.has(exercicio)) {
    LAYOUT_BY_EXERCICIO.set(exercicio, buildDefaultLayout(exercicio));
  }
  return LAYOUT_BY_EXERCICIO.get(exercicio)!;
}

/**
 * Retorna o layout de um tipo de registro pelo identificador.
 */
export function getRecordTypeLayout(layout: DecLayout, tipo: string): RecordTypeLayout | null {
  return layout.recordTypes.find(r => r.tipo === tipo) ?? null;
}
