/**
 * Utilitários para writers: linha fixa em Latin-1 (Task 19.2).
 */

const ENCODING = 'latin1';

/**
 * Preenche uma string até o tamanho esperado (pad right com espaço) e garante Latin-1.
 * Corta se exceder. Encoding fixo Latin-1.
 */
export function padFixed(str: string, length: number): string {
  const normalized = String(str ?? '');
  let out = normalized.slice(0, length);
  while (out.length < length) out += ' ';
  return out;
}

/**
 * Converte linha de texto para Buffer Latin-1 (para gravação em arquivo .DEC).
 */
export function toLatin1Buffer(line: string): Buffer {
  return Buffer.from(line, ENCODING);
}

/**
 * Junta linhas com quebra de linha e retorna Buffer Latin-1.
 */
export function linesToLatin1Buffer(lines: string[]): Buffer {
  const text = lines.join('\r\n');
  return Buffer.from(text, ENCODING);
}
