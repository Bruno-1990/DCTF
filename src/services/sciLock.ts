/**
 * Lock global das consultas ao SCI (Firebird).
 *
 * Serializa as chamadas à `SP_BI_FAT`: no máximo UMA ativa por vez em todo o
 * processo — cautela para não sobrecarregar/travar a procedure no Firebird.
 *
 * Mora num módulo próprio, e não dentro de um serviço, porque a cadeia precisa
 * ser ÚNICA. Se cada serviço tivesse a sua, duas consultas rodariam
 * concorrentes — exatamente o que o lock existe para impedir.
 *
 * Consequência prática para quem chama: com o lock ativo, disparar N consultas
 * de uma vez (`Promise.all`) não paraleliza nada — só enfileira N promessas
 * cujo timeout corre NA FILA, não na execução, gerando timeouts espúrios.
 * Processe sequencialmente (`for...of`).
 */

let sciChain: Promise<unknown> = Promise.resolve();

export function comLockSci<T>(fn: () => Promise<T>): Promise<T> {
  const run = sciChain.then(fn, fn);
  sciChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
