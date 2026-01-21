import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface SpedV2ValidationRequest {
  clienteId?: string;
  competencia?: string;
  perfilFiscal?: {
    segmento?: string;
    regime?: string;
    operaST?: boolean;
    regimeEspecial?: boolean;
    operaInterestadualDIFAL?: boolean;
  };
}

export interface SpedV2ValidationResponse {
  success: boolean;
  validationId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  message: string;
}

export interface SpedV2Status {
  success: boolean;
  validationId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface SpedV2Result {
  success: boolean;
  validationId: string;
  resultado?: any;
  completedAt?: string;
}

export interface SpedV2Validation {
  validationId: string;
  status: string;
  progress: number;
  message: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SpedMetadata {
  cnpj: string | null;
  razao_social?: string | null;
  competencia: string | null;
  regime_tributario: string | null;
  opera_st: boolean;
  opera_difal: boolean;
  opera_fcp: boolean;
  opera_interestadual: boolean;
  segmento: string | null;
  stats?: {
    total_registros: number;
    total_c100: number;
    total_c170: number;
    cfops: string[];
    ncms_top_10: string[];
  };
}

class SpedV2Service {
  /**
   * Inicia uma nova validação SPED v2.0
   */
  async validar(
    spedFile: File,
    xmlFiles: File[],
    request?: SpedV2ValidationRequest
  ): Promise<string> {
    const formData = new FormData();
    formData.append('sped', spedFile);
    
    xmlFiles.forEach((file) => {
      formData.append('xmls', file);
    });
    
    if (request?.clienteId) {
      formData.append('clienteId', request.clienteId);
    }
    
    if (request?.competencia) {
      formData.append('competencia', request.competencia);
    }
    
    if (request?.perfilFiscal) {
      formData.append('perfilFiscal', JSON.stringify(request.perfilFiscal));
    }

    const response = await axios.post<SpedV2ValidationResponse>(
      `${API_BASE_URL}/api/sped/v2/validar`,
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
   * Obtém status de uma validação
   */
  async obterStatus(validationId: string): Promise<SpedV2Status | null> {
    try {
      const response = await axios.get<SpedV2Status>(
        `${API_BASE_URL}/api/sped/v2/status/${validationId}`,
        {
          timeout: 10000,
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao obter status:', error);
      return null;
    }
  }

  /**
   * Obtém resultado de uma validação concluída
   */
  async obterResultado(validationId: string): Promise<SpedV2Result> {
    try {
      const response = await axios.get<SpedV2Result>(
        `${API_BASE_URL}/api/sped/v2/resultado/${validationId}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao obter resultado:', error);
      throw error;
    }
  }

  /**
   * Lista todas as validações
   */
  async listarValidacoes(): Promise<SpedV2Validation[]> {
    try {
      const response = await axios.get<{ success: boolean; validacoes: SpedV2Validation[] }>(
        `${API_BASE_URL}/api/sped/v2/validacoes`
      );
      return response.data.validacoes || [];
    } catch (error: any) {
      console.error('Erro ao listar validações:', error);
      return [];
    }
  }

  /**
   * Remove uma validação
   */
  async removerValidacao(validationId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/api/sped/v2/validacoes/${validationId}`);
  }

  /**
   * Extrai metadados do arquivo SPED (CNPJ, competência, regime, etc)
   */
  async extrairMetadados(spedFile: File): Promise<SpedMetadata> {
    const formData = new FormData();
    formData.append('sped', spedFile);

    const response = await axios.post(
      `${API_BASE_URL}/api/sped/v2/extract-metadata`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.metadata;
  }
}

export const spedV2Service = new SpedV2Service();


