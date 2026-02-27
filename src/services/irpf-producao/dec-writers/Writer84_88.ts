import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

function write84_88(tipoNum: string) {
  return function (recordLayout: RecordTypeLayout, _ctx: DecWriterContext): string {
    const tam = recordLayout.tamTotal;
    const tipo = padFixed(tipoNum, 2);
    const dados = padFixed('', tam - 2);
    return (tipo + dados).slice(0, tam);
  };
}

export const write84 = write84_88('84');
export const write88 = write84_88('88');
