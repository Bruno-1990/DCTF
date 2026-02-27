import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

/** Registro T9 — totais */
export function writeT9(recordLayout: RecordTypeLayout, _ctx: DecWriterContext): string {
  const tam = recordLayout.tamTotal;
  const tipo = padFixed('T9', 2);
  const totais = padFixed('', tam - 2);
  return (tipo + totais).slice(0, tam);
}
