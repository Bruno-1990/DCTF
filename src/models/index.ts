/**
 * Exportações dos modelos do sistema DCTF
 */

// Modelos principais
export { Cliente } from './Cliente';
export { DCTF } from './DCTF';
export { DCTFDados } from './DCTFDados';
export { Analise } from './Analise';
export { Flag } from './Flag';
export { Relatorio } from './Relatorio';
export { DCTFCode, DCTFReceitaCode, DCTFAliquota } from './DCTFCode';

// Interfaces e tipos
export type { DCTFDados as IDCTFDados } from './DCTFDados';
export type { Flag as IFlag } from './Flag';
export type { Relatorio as IRelatorio } from './Relatorio';

// Re-exportar tipos base
export type { Cliente as ICliente, DCTF as IDCTF, Analise as IAnalise } from '../types';
