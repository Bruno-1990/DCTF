import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface ValidationResponse {
  validationId: string;
  message: string;
  status: string;
}

export interface ValidationStatus {
  validationId: string;
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  resultado?: any;
  error?: string;
}

export interface ValidationResult {
  empresa?: {
    cnpj?: string;
    razao?: string;
    dt_ini?: string;
    dt_fin?: string;
  };
  validacoes?: Record<string, any[]>;
  reports?: Record<string, any[]>;
}

class SpedService {
  /**
   * Detecta automaticamente o setor baseado no arquivo SPED e XMLs
   */
  async detectarSetor(spedFile: File, xmlFiles: File[] = []): Promise<string[]> {
    const formData = new FormData();
    formData.append('sped', spedFile);
    
    // Adicionar XMLs se houver (limitado a 100 para análise rápida)
    xmlFiles.slice(0, 100).forEach((file) => {
      formData.append('xmls', file);
    });

    try {
      const response = await axios.post<{ setores: string[], setor?: string | null }>(
        `${API_BASE_URL}/api/sped/detectar-setor`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Retornar lista de setores (novo formato) ou compatibilidade com formato antigo
      if (response.data.setores && Array.isArray(response.data.setores)) {
        return response.data.setores;
      } else if (response.data.setor) {
        return [response.data.setor];
      }
      return [];
    } catch (error) {
      console.error('Erro ao detectar setor:', error);
      return [];
    }
  }

  /**
   * Inicia validação de SPED e XMLs
   */
  async validar(
    spedFile: File,
    xmlFiles: File[],
    setores?: string[]
  ): Promise<string> {
    const formData = new FormData();
    formData.append('sped', spedFile);
    
    xmlFiles.forEach((file) => {
      formData.append('xmls', file);
    });
    
    if (setores && setores.length > 0) {
      // Enviar setores como array (múltiplos valores com mesmo nome)
      setores.forEach((setor) => {
        formData.append('setores', setor);
      });
    }

    const response = await axios.post<ValidationResponse>(
      `${API_BASE_URL}/api/sped/validar`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.validationId;
  }

  /**
   * Obtém status da validação
   */
  async obterStatus(validationId: string): Promise<ValidationStatus | null> {
    try {
      const response = await axios.get<ValidationStatus>(
        `${API_BASE_URL}/api/sped/validacao/${validationId}`
      );
      return response.data;
    } catch (error) {
      console.error('Erro ao obter status:', error);
      return null;
    }
  }

  /**
   * Obtém resultado da validação
   */
  async obterResultado(validationId: string): Promise<ValidationResult> {
    try {
      const response = await axios.get<ValidationStatus & { resultado?: ValidationResult }>(
        `${API_BASE_URL}/api/sped/validacao/${validationId}`
      );
      
      console.log('Resposta completa do backend:', response.data);
      
      // Se o status é completed, o resultado vem dentro do objeto de resposta
      if (response.data.status === 'completed') {
        if (response.data.resultado) {
          console.log('Resultado encontrado no response.data.resultado');
          return response.data.resultado;
        }
        // Se não tem resultado mas está completed, pode ser que o resultado está no próprio objeto
        if (response.data.empresa || response.data.validacoes || response.data.reports) {
          console.log('Resultado encontrado diretamente no response.data');
          return response.data as ValidationResult;
        }
      }
      
      // Se não há resultado ainda, retornar estrutura vazia
      console.warn('Nenhum resultado encontrado na resposta');
      return response.data.resultado || {};
    } catch (error: any) {
      console.error('Erro ao obter resultado:', error);
      throw error;
    }
  }

  /**
   * Exporta resultado para Excel
   */
  async exportarExcel(validationId: string): Promise<void> {
    const response = await axios.get(
      `${API_BASE_URL}/api/sped/validacao/${validationId}/export/excel`,
      {
        responseType: 'blob',
      }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sped_validacao_${validationId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Exporta resultado para PDF
   */
  async exportarPDF(validationId: string): Promise<void> {
    const response = await axios.get(
      `${API_BASE_URL}/api/sped/validacao/${validationId}/export/pdf`,
      {
        responseType: 'blob',
      }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sped_validacao_${validationId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Lista histórico de validações
   */
  async listarHistorico(limit: number = 50, offset: number = 0): Promise<any[]> {
    const response = await axios.get(
      `${API_BASE_URL}/api/sped/historico`,
      {
        params: { limit, offset },
      }
    );
    return response.data;
  }

  /**
   * Deleta validação
   */
  async deletarValidacao(validationId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/api/sped/validacao/${validationId}`);
  }

  /**
   * Obtém lista de ajustes identificados
   */
  async obterAjustes(validationId: string): Promise<any[]> {
    try {
      const response = await axios.get<any[]>(
        `${API_BASE_URL}/api/sped/validacao/${validationId}/ajustes`
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao obter ajustes:', error);
      throw error;
    }
  }

  /**
   * Aplica ajustes selecionados e retorna arquivo SPED ajustado
   */
  async aplicarAjustes(validationId: string, ajustes: any[]): Promise<Blob> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/sped/validacao/${validationId}/aplicar-ajustes`,
        { ajustes },
        {
          responseType: 'blob',
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao aplicar ajustes:', error);
      throw error;
    }
  }
}

export const spedService = new SpedService();

