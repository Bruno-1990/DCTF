import api from './api';

interface BuscaParams {
  query: string;
  domain?: string;
  type?: 'VIEW' | 'TABLE';
  top_k: number;
}

interface ObjetoEncontrado {
  object: string;
  type: 'VIEW' | 'TABLE';
  score: number;
  layer?: string;
  metadata: {
    name: string;
    domain_tags?: string[];
    total_colunas: number;
    colunas: Array<{
      nome: string;
      tipo: string;
      tags?: string[];
    }>;
  };
}

interface GerarSQLParams {
  objeto: string;
  tipo: 'VIEW' | 'TABLE';
  colunas: Array<{
    nome: string;
    tipo: string;
    tags?: string[];
  }>;
}

export const geradorSQLService = {
  async buscarTabelas(params: BuscaParams): Promise<{ objetos: ObjetoEncontrado[] }> {
    try {
      const response = await api.post('/sci/catalog/buscar', params);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || 
        error.message || 
        'Erro ao buscar no catálogo'
      );
    }
  },

  async gerarSQL(params: GerarSQLParams): Promise<string> {
    try {
      const response = await api.post('/sci/catalog/gerar-sql', params);
      return response.data.sql;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || 
        error.message || 
        'Erro ao gerar SQL'
      );
    }
  },

  async executarSQL(sql: string, limit?: number): Promise<{ rows: any[]; columns: string[]; rowCount: number }> {
    try {
      const response = await api.post('/sci/catalog/executar-sql', { sql, limit });
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || 
        error.message || 
        'Erro ao executar SQL'
      );
    }
  },

  async consultaCentroCusto(params: {
    cod_cc?: string;
    cod_col?: string;
    nome_col?: string;
    view?: string;
  }): Promise<{ success: boolean; resultados: any[]; total_views: number }> {
    try {
      const response = await api.post('/sci/catalog/consulta-centro-custo', params);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || 
        error.message || 
        'Erro ao consultar centro de custo'
      );
    }
  },
};

