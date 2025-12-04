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
  async gerarRelatorio(params: GerarRelatorioParams): Promise<{ relatorioId?: string; blob?: Blob }> {
    try {
      const response = await api.post('/sci/banco-horas/gerar', params, {
        responseType: 'blob',
        validateStatus: (status) => status < 500, // Aceitar 200-499
      });
      
      // Verificar se a resposta é JSON (relatório em background)
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await new Response(response.data).text();
        const jsonData = JSON.parse(text);
        return { relatorioId: jsonData.relatorioId };
      }
      
      // Se a resposta é um blob (relatório pronto imediatamente)
      return { blob: response.data };
    } catch (error: any) {
      // Se for erro 400/500, tentar extrair mensagem JSON do blob
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const json = JSON.parse(text);
          throw { ...error, response: { ...error.response, data: json } };
        } catch {
          throw error;
        }
      }
      throw error;
    }
  },

  async baixarArquivo(id: string): Promise<Blob> {
    try {
      const response = await api.get(`/sci/banco-horas/download/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      });
      
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await new Response(response.data).text();
        const jsonData = JSON.parse(text);
        throw new Error(jsonData.error || 'Erro ao baixar relatório');
      }
      
      return response.data;
    } catch (error: any) {
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const json = JSON.parse(text);
          throw new Error(json.error || 'Erro ao baixar relatório');
        } catch {
          throw error;
        }
      }
      throw error;
    }
  },

  async baixarArquivoFormatado(id: string): Promise<Blob> {
    try {
      const response = await api.get(`/sci/banco-horas/download-formatado/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      });
      
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await new Response(response.data).text();
        const jsonData = JSON.parse(text);
        throw new Error(jsonData.error || 'Erro ao baixar relatório formatado');
      }
      
      return response.data;
    } catch (error: any) {
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const json = JSON.parse(text);
          throw new Error(json.error || 'Erro ao baixar relatório formatado');
        } catch {
          throw error;
        }
      }
      throw error;
    }
  },
};

