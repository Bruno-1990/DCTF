/**
 * Tipos para writers .DEC (Task 19.2).
 * Encoding fixo Latin-1; ordem Anexo D.
 */

import type { DecLayout, RecordTypeLayout } from '../dec-layout';

export interface DecWriterContext {
  exercicio: number;
  layout: DecLayout;
  caseId: number;
  /** Dados agregados do case (declaration_*, case_people) — preenchido pelo fluxo de geração */
  payload?: Record<string, unknown>;
}

/** Ordem dos writers conforme Anexo D: IR, [01], 16, 17/18 ou 19/20, 21-92, 84/88, T9, HR, DR, R9 */
export const DEC_WRITER_ORDER: string[] = [
  'IR', '01', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
  '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
  '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80',
  '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91', '92',
  'T9', 'HR', 'DR', 'R9',
];

export type DecWriterFn = (recordLayout: RecordTypeLayout, ctx: DecWriterContext) => string;
