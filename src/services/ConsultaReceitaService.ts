/**
 * Serviço para validação de token e acesso à Receita Federal.
 */

import { ReceitaFederalService } from './ReceitaFederalService';

export class ConsultaReceitaService {
  private receitaService: ReceitaFederalService;

  constructor() {
    this.receitaService = new ReceitaFederalService();
  }

  /**
   * Valida o token de acesso com a API da Receita.
   * Se cnpj for informado, apenas valida a obtenção do token.
   */
  async validarAcesso(cnpj?: string): Promise<{ ok: boolean; mensagem: string }> {
    try {
      await this.receitaService.obterToken(true);
      if (!cnpj) {
        return { ok: true, mensagem: 'Token válido' };
      }
      return { ok: true, mensagem: 'Token válido. Para validar autorização por CNPJ, use a aba Situação Fiscal.' };
    } catch (err: any) {
      return { ok: false, mensagem: err?.message || 'Falha ao obter token de acesso da Receita.' };
    }
  }

  configurarAutenticacao(_token: string): void {
    // Token é obtido automaticamente via obterToken() no ReceitaFederalService
  }
}
