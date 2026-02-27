import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

/** Registro tipo 16 */
export function write16(recordLayout: RecordTypeLayout, ctx: DecWriterContext): string {
  const tam = recordLayout.tamTotal;
  const tipo = padFixed('16', 2);
  const dados = padFixed('', tam - 2);
  return (tipo + dados).slice(0, tam);
}
