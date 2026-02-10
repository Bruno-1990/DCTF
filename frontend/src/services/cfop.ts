/**
 * Serviço para dados de CFOP de saída (relatório Gelden / extração mensal e anual).
 */

import api from './api';

export interface CFOPMensal {
  ano: number | null;
  mes: number | null;
  cfop: string;
  descricao: string;
  valor: number;
}

export interface CFOPAnual {
  ano: number;
  cfop: string;
  descricao: string;
  valor_soma: number;
}

export interface CFOPListResponse {
  items: CFOPMensal[];
  somaAnual?: CFOPAnual[];
}

/** Resposta do upload único: entrada e saída preenchidas de uma vez. */
export interface CFOPUploadResponse {
  entrada: CFOPListResponse;
  saida: CFOPListResponse;
}

export const cfopService = {
  /**
   * Lista CFOP de entrada (mensal). Filtros opcionais: ano, mes.
   * CFOP de entrada: 1.xxx, 2.xxx, 3.xxx.
   */
  async getEntrada(params?: { ano?: number; mes?: number }): Promise<CFOPListResponse> {
    const response = await api.get<CFOPListResponse>('/cfop/entrada', { params });
    const body = response.data;
    if (body && Array.isArray(body.items)) {
      return {
        items: body.items,
        somaAnual: body.somaAnual ?? [],
      };
    }
    return { items: [], somaAnual: [] };
  },

  /**
   * Lista CFOP de saída (mensal). Filtros opcionais: ano, mes.
   * CFOP de saída: 5.xxx, 6.xxx, 7.xxx.
   */
  async getSaida(params?: { ano?: number; mes?: number }): Promise<CFOPListResponse> {
    const response = await api.get<CFOPListResponse>('/cfop/saida', { params });
    const body = response.data;
    if (body && Array.isArray(body.items)) {
      return {
        items: body.items,
        somaAnual: body.somaAnual ?? [],
      };
    }
    return { items: [], somaAnual: [] };
  },

  /**
   * Envia um único PDF; o backend extrai CFOP de entrada (1.xxx, 2.xxx, 3.xxx) e de saída (5.xxx, 6.xxx, 7.xxx)
   * e retorna { entrada, saida } para preencher ambas as abas.
   */
  async uploadPdf(file: File): Promise<CFOPUploadResponse> {
    const formData = new FormData();
    formData.append('pdf', file);
    const response = await api.post<CFOPUploadResponse>('/cfop/upload-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = response.data;
    return {
      entrada: {
        items: body?.entrada?.items ?? [],
        somaAnual: body?.entrada?.somaAnual ?? [],
      },
      saida: {
        items: body?.saida?.items ?? [],
        somaAnual: body?.saida?.somaAnual ?? [],
      },
    };
  },
};
