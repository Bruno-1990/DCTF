import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

/** Factory: registro 21 a 92 (um writer por número) */
export function write21to92(tipoNum: string) {
  return function (recordLayout: RecordTypeLayout, _ctx: DecWriterContext): string {
    const tam = recordLayout.tamTotal;
    const tipo = padFixed(tipoNum, 2);
    const dados = padFixed('', tam - 2);
    return (tipo + dados).slice(0, tam);
  };
}
