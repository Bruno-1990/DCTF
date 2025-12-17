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

export interface CorrecaoAutomatica {
  registro_corrigir: string;
  campo: string;
  valor_correto: number;
  chave?: string;
  cfop?: string;
  cst?: string;
  linha_sped?: number;
}

export interface ResultadoCorrecao {
  success: boolean;
  message: string;
  arquivo_corrigido?: string;
  resumo?: any;
  correcoes_aplicadas?: number;
  total_correcoes?: number;
  resultados?: any[];
}

class SpedService {
  // Cache para detecção de setor (baseado em nome e tamanho dos arquivos)
  private detectarSetorCache: Map<string, { setores: string[]; timestamp: number }> = new Map();
  private readonly DETECTAR_SETOR_CACHE_TTL = 30000; // 30 segundos de cache

  /**
   * Detecta automaticamente o setor baseado no arquivo SPED e XMLs
   */
  async detectarSetor(spedFile: File, xmlFiles: File[] = []): Promise<string[]> {
    // Criar chave de cache baseada em nome e tamanho dos arquivos
    const cacheKey = `${spedFile.name}-${spedFile.size}-${xmlFiles.length}-${xmlFiles.slice(0, 5).map(f => `${f.name}-${f.size}`).join('-')}`;
    
    // Verificar cache
    const cached = this.detectarSetorCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.DETECTAR_SETOR_CACHE_TTL) {
      return cached.setores;
    }

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
          timeout: 30000, // 30 segundos de timeout
        }
      );

      // Retornar lista de setores (novo formato) ou compatibilidade com formato antigo
      let setores: string[] = [];
      if (response.data.setores && Array.isArray(response.data.setores)) {
        setores = response.data.setores;
      } else if (response.data.setor) {
        setores = [response.data.setor];
      }

      // Atualizar cache
      this.detectarSetorCache.set(cacheKey, {
        setores,
        timestamp: Date.now()
      });

      return setores;
    } catch (error: any) {
      // Não logar erro 429 repetidamente
      if (error.response?.status !== 429) {
      console.error('Erro ao detectar setor:', error);
      }
      
      // Em caso de erro, retornar array vazio mas não cachear
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

  // Cache para evitar requisições duplicadas
  private statusCache: Map<string, { data: ValidationStatus | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 2000; // 2 segundos de cache

  /**
   * Obtém status da validação com cache e throttling
   */
  async obterStatus(validationId: string, forceRefresh: boolean = false): Promise<ValidationStatus | null> {
    // Verificar cache se não for refresh forçado
    if (!forceRefresh) {
      const cached = this.statusCache.get(validationId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get<ValidationStatus>(
        `${API_BASE_URL}/api/sped/validacao/${validationId}`,
        {
          // Adicionar timeout para evitar requisições pendentes
          timeout: 10000
        }
      );
      
      // Atualizar cache
      this.statusCache.set(validationId, {
        data: response.data,
        timestamp: Date.now()
      });
      
      return response.data;
    } catch (error: any) {
      // Não logar erro 429 repetidamente para evitar spam no console
      if (error.response?.status !== 429) {
      console.error('Erro ao obter status:', error);
      }
      
      // Atualizar cache mesmo em caso de erro (para evitar requisições repetidas)
      this.statusCache.set(validationId, {
        data: null,
        timestamp: Date.now()
      });
      
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

  /**
   * Aplica uma correção automática específica
   */
  async aplicarCorrecao(validationId: string, correcao: CorrecaoAutomatica): Promise<ResultadoCorrecao> {
    try {
      const response = await axios.post<ResultadoCorrecao>(
        `${API_BASE_URL}/api/sped/correcoes/aplicar`,
        { validationId, correcao }
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao aplicar correção:', error);
      throw error;
    }
  }

  /**
   * Aplica todas as correções automáticas disponíveis
   */
  async aplicarTodasCorrecoes(validationId: string): Promise<ResultadoCorrecao> {
    try {
      const response = await axios.post<ResultadoCorrecao>(
        `${API_BASE_URL}/api/sped/correcoes/aplicar-todas`,
        { validationId }
      );
      return response.data;
    } catch (error: any) {
      console.error('Erro ao aplicar todas as correções:', error);
      throw error;
    }
  }

  /**
   * Baixa o arquivo SPED corrigido
   */
  async baixarSpedCorrigido(validationId: string): Promise<void> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/sped/correcoes/${validationId}/download`,
        {
          responseType: 'blob',
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sped_corrigido_${validationId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao baixar SPED corrigido:', error);
      throw error;
    }
  }
}

export const spedService = new SpedService();

