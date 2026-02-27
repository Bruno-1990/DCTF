import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

/** Registro DR */
export function writeDR(recordLayout: RecordTypeLayout, _ctx: DecWriterContext): string {
  const tam = recordLayout.tamTotal;
  const tipo = padFixed('DR', 2);
  const dados = padFixed('', tam - 2);
  return (tipo + dados).slice(0, tam);
}
