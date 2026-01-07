/**
 * Serviço para consulta de CNPJ via ReceitaWS (https://receitaws.com.br/)
 * - Usado para auto-preenchimento do cadastro do cliente na aba Clientes
 * - Importante: respeitar rate limit e tratar erros de forma robusta
 */

import axios from 'axios';

export type ReceitaWSAtividade = { code: string; text: string };
export type ReceitaWSSocio = { nome: string; qual: string };

export interface ReceitaWSResponseOk {
  status: 'OK';
  cnpj: string; // pode vir formatado
  abertura?: string | null;
  situacao?: string | null;
  tipo?: string | null;
  nome?: string | null;
  fantasia?: string | null;
  porte?: string | null;
  natureza_juridica?: string | null;
  atividade_principal?: ReceitaWSAtividade[];
  atividades_secundarias?: ReceitaWSAtividade[];
  qsa?: ReceitaWSSocio[];
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  email?: string | null;
  telefone?: string | null;
  data_situacao?: string | null;
  motivo_situacao?: string | null;
  situacao_especial?: string | null;
  data_situacao_especial?: string | null;
  efr?: string | null;
  capital_social?: string | number | null;
  simples?: {
    optante?: boolean;
    data_opcao?: string | null;
    data_exclusao?: string | null;
    ultima_atualizacao?: string | null;
  };
  simei?: {
    optante?: boolean;
    data_opcao?: string | null;
    data_exclusao?: string | null;
    ultima_atualizacao?: string | null;
  };
  ultima_atualizacao?: string | null;
}

export interface ReceitaWSResponseErro {
  status: string; // ex: "ERROR"
  message?: string;
}

export type ReceitaWSResponse = ReceitaWSResponseOk | ReceitaWSResponseErro;

export class ReceitaWSService {
  private baseUrl = 'https://receitaws.com.br/v1/cnpj';

  private normalizarCNPJ(cnpj: string): string {
    return String(cnpj || '').replace(/\D/g, '');
  }

  async consultarCNPJ(cnpj: string): Promise<ReceitaWSResponseOk> {
    const cnpjLimpo = this.normalizarCNPJ(cnpj);
    if (cnpjLimpo.length !== 14) {
      throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
    }

    const url = `${this.baseUrl}/${cnpjLimpo}`;

    try {
      const resp = await axios.get<ReceitaWSResponse>(url, {
        timeout: 20000,
        headers: {
          Accept: 'application/json',
          // alguns ambientes bloqueiam sem UA; manter simples e identificável
          'User-Agent': 'DCTF-MPC/1.0 (Cadastro Clientes)',
        },
      });

      const data = resp.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Resposta inválida da ReceitaWS (payload vazio).');
      }

      if ((data as any).status !== 'OK') {
        const msg = (data as any).message || 'Falha na consulta do CNPJ na ReceitaWS.';
        throw new Error(String(msg));
      }

      return data as ReceitaWSResponseOk;
    } catch (err: any) {
      // Melhorar mensagem para UI
      const status = err?.response?.status;
      const msgApi = err?.response?.data?.message;
      if (status) {
        throw new Error(`Erro ao consultar ReceitaWS (HTTP ${status})${msgApi ? `: ${msgApi}` : ''}`);
      }
      throw new Error(err?.message || 'Erro ao consultar ReceitaWS.');
    }
  }
}


