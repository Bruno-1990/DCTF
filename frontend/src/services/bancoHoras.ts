import api from './api';

interface GerarRelatorioParams {
  cnpj: string;
  dataInicial: string;
  dataFinal: string;
}

export interface BancoHorasRelatorio {
  id?: string;
  cnpj: string;
  razaoSocial?: string;
  dataInicial: string;
  dataFinal: string;
  arquivoPath: string;
  nomeArquivo: string;
  tamanhoArquivo?: number;
  arquivoFormatadoPath?: string;
  arquivoFormatadoNome?: string;
  status: 'gerando' | 'concluido' | 'erro';
  erro?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const bancoHorasService = {
  async gerarRelatorio(params: GerarRelatorioParams): Promise<Blob> {
    const response = await api.post('/sci/banco-horas/gerar', params, {
      responseType: 'blob',
    });
    return response.data;
  },

  async listarHistorico(): Promise<BancoHorasRelatorio[]> {
    const response = await api.get<{ success: boolean; data: BancoHorasRelatorio[] }>('/sci/banco-horas/historico');
    return response.data.data || [];
  },

  async baixarDoHistorico(id: string): Promise<Blob> {
    const response = await api.get(`/sci/banco-horas/historico/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async baixarFormatadoDoHistorico(id: string): Promise<Blob> {
    const response = await api.get(`/sci/banco-horas/historico/${id}/download-formatado`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async deletarHistorico(id: string): Promise<void> {
    await api.delete(`/sci/banco-horas/historico/${id}`);
  },
};

