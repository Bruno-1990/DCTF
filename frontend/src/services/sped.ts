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
  async detectarSetor(spedFile: File, xmlFiles: File[] = []): Promise<string | null> {
    const formData = new FormData();
    formData.append('sped', spedFile);
    
    // Adicionar XMLs se houver (limitado a 100 para análise rápida)
    xmlFiles.slice(0, 100).forEach((file) => {
      formData.append('xmls', file);
    });

    try {
      const response = await axios.post<{ setor: string | null }>(
        `${API_BASE_URL}/api/sped/detectar-setor`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      return response.data.setor;
    } catch (error) {
      console.error('Erro ao detectar setor:', error);
      return null;
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
    const response = await axios.get<ValidationResult>(
      `${API_BASE_URL}/api/sped/validacao/${validationId}`
    );
    return response.data;
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
}

export const spedService = new SpedService();

