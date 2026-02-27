import type { RecordTypeLayout } from '../dec-layout';
import type { DecWriterContext } from './types';
import { padFixed } from './utils';

function write17_20(tipoNum: string) {
  return function (recordLayout: RecordTypeLayout, _ctx: DecWriterContext): string {
    const tam = recordLayout.tamTotal;
    const tipo = padFixed(tipoNum, 2);
    const dados = padFixed('', tam - 2);
    return (tipo + dados).slice(0, tam);
  };
}

export const write17 = write17_20('17');
export const write18 = write17_20('18');
export const write19 = write17_20('19');
export const write20 = write17_20('20');
