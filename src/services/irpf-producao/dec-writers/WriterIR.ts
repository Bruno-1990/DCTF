import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

/** Registro inicial (IR) — identificação do arquivo/exercício */
export function writeIR(recordLayout: RecordTypeLayout, ctx: DecWriterContext): string {
  const tam = recordLayout.tamTotal;
  const tipo = padFixed('IR', 2);
  const exercicio = padFixed(String(ctx.exercicio), 4);
  const resto = padFixed('', tam - 6);
  return (tipo + exercicio + resto).slice(0, tam);
}
