/**
 * Writers .DEC na ordem Anexo D (Task 19.2). Encoding Latin-1.
 */

import { getRecordTypeLayout } from '../dec-layout';
import type { DecLayout } from '../dec-layout';
import type { DecWriterContext, DecWriterFn } from './types';
import { DEC_WRITER_ORDER } from './types';
import { writeIR } from './WriterIR';
import { write01 } from './Writer01';
import { write16 } from './Writer16';
import { write17, write18, write19, write20 } from './Writer17_20';
import { write21to92 } from './Writer21_92';
import { write84, write88 } from './Writer84_88';
import { writeT9 } from './WriterT9';
import { writeHR } from './WriterHR';
import { writeDR } from './WriterDR';
import { writeR9 } from './WriterR9';
import { linesToLatin1Buffer } from './utils';

const WRITER_MAP: Record<string, DecWriterFn> = {
  IR: writeIR,
  '01': write01,
  '16': write16,
  '17': write17,
  '18': write18,
  '19': write19,
  '20': write20,
  ...Object.fromEntries(
    Array.from({ length: 72 }, (_, i) => [String(21 + i), write21to92(String(21 + i))])
  ),
  '84': write84,
  '88': write88,
  T9: writeT9,
  HR: writeHR,
  DR: writeDR,
  R9: writeR9,
};

/**
 * Executa os writers na ordem Anexo D; retorna linhas (uma por tipo presente no layout).
 */
export function runWritersInOrder(ctx: DecWriterContext): string[] {
  const lines: string[] = [];
  const layout: DecLayout = ctx.layout;

  for (const tipo of DEC_WRITER_ORDER) {
    const recordLayout = getRecordTypeLayout(layout, tipo);
    const writer = WRITER_MAP[tipo];
    if (recordLayout && writer) {
      lines.push(writer(recordLayout, ctx));
    }
  }
  return lines;
}

/**
 * Executa os writers e retorna o conteúdo do arquivo .DEC em Buffer Latin-1 (CRLF).
 */
export function generateDecBuffer(ctx: DecWriterContext): Buffer {
  const lines = runWritersInOrder(ctx);
  return linesToLatin1Buffer(lines);
}

export { DEC_WRITER_ORDER };
export { padFixed, toLatin1Buffer, linesToLatin1Buffer } from './utils';
export type { DecWriterContext, DecWriterFn } from './types';
