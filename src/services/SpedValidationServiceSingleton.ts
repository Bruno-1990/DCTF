/**
 * Singleton para compartilhar a mesma instância do SpedValidationService
 * entre diferentes rotas. Isso garante que o Map de validações seja compartilhado.
 */

import { SpedValidationService } from './SpedValidationService';

let instance: SpedValidationService | null = null;

export function getSpedValidationService(): SpedValidationService {
  if (!instance) {
    instance = new SpedValidationService();
    console.log('[Singleton] Nova instância do SpedValidationService criada');
  }
  return instance;
}

export function resetInstance(): void {
  instance = null;
}

