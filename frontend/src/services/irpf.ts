import api from './api';

export interface FaturamentoMensal {
  mes: number;
  ano: number;
  valor: number;
  [key: string]: any; // Para outros campos que possam vir da SP
}

export interface FaturamentoAnual {
  ano: number;
  valorTotal: number;
  mediaMensal: number;
  meses: FaturamentoMensal[];
}

export interface IrpfClienteData {
  clienteId: string;
  cnpj: string;
  razaoSocial: string;
  capitalSocial: number;
  socios: Array<{
    nome: string;
    cpf: string;
    qualificacao: string;
    participacao: number;
    valor: number;
  }>;
  faturamento: {
    [ano: string]: FaturamentoAnual;
  };
}

export const irpfService = {
  /**
   * Busca faturamento do SCI para um cliente (com cache)
   * @param clienteId ID do cliente
   * @param anos Anos para buscar (padrão: últimos 2 anos)
   */
  async buscarFaturamentoCliente(
    clienteId: string,
    anos?: number[]
  ): Promise<FaturamentoAnual[]> {
    const response = await api.get(`/irpf/faturamento/${clienteId}`, {
      params: anos ? { anos: anos.join(',') } : undefined,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao buscar faturamento');
    }

    return response.data.data || [];
  },

  /**
   * Buscar faturamento apenas do cache (sem consultar SCI)
   * @param clienteId ID do cliente
   * @param anos Anos para buscar
   */
  async buscarApenasCache(
    clienteId: string,
    anos?: number[]
  ): Promise<{ data: FaturamentoAnual[]; ultimaAtualizacao?: string | null }> {
    const response = await api.get(`/irpf/faturamento/${clienteId}/cache`, {
      params: anos ? { anos: anos.join(',') } : undefined,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao buscar cache');
    }

    return {
      data: response.data.data || [],
      ultimaAtualizacao: response.data.ultimaAtualizacao || null,
    };
  },

  /**
   * Forçar atualização do cache de faturamento
   * @param clienteId ID do cliente
   * @param anos Anos para atualizar
   */
  async atualizarCache(clienteId: string, anos?: number[]): Promise<FaturamentoAnual[]> {
    const response = await api.post(`/irpf/faturamento/${clienteId}/atualizar`, {
      anos,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao atualizar cache');
    }

    // Retornar os dados atualizados
    return response.data.data || [];
  },

  /**
   * Atualizar cache de todos os clientes
   */
  async atualizarTodosClientes(): Promise<{ sucesso: number; erros: number; total: number }> {
    const response = await api.post('/irpf/faturamento/atualizar-todos');

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao atualizar todos os clientes');
    }

    return response.data.data;
  },

  /**
   * Consulta personalizada de faturamento
   * @param params Parâmetros da consulta
   */
  async consultaPersonalizada(params: {
    busca: string;
    dataInicial: string;
    dataFinal: string;
    tipoFaturamento: 'detalhado' | 'consolidado';
    somarMatrizFilial: boolean;
  }): Promise<{
    cliente: {
      id: string;
      razao_social: string;
      cnpj: string;
      codigo_sci: number;
    };
    periodo: {
      dataInicial: string;
      dataFinal: string;
    };
    tipoFaturamento: string;
    somarMatrizFilial: boolean;
    total: number;
    detalhes: Array<{
      codigoEmpresa: number;
      referencia: string;
      ordem: number;
      descricao: string;
      valor: number;
    }>;
  }> {
    console.log('[IRPF Service] Enviando requisição:', params);
    const response = await api.post('/irpf/consulta-personalizada', params);
    console.log('[IRPF Service] Resposta completa:', response.data);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao executar consulta personalizada');
    }

    const data = response.data.data;
    console.log('[IRPF Service] Dados extraídos:', {
      cliente: data?.cliente,
      total: data?.total,
      detalhesCount: data?.detalhes?.length || 0,
      tipoFaturamento: data?.tipoFaturamento,
      somarMatrizFilial: data?.somarMatrizFilial
    });
    
    return data;
  },

  /**
   * Busca faturamento do SCI para um cliente (método legado - usar buscarFaturamentoCliente)
   * @param codigoSci Código da empresa no SCI
   * @param ano Ano do faturamento (ex: 2024, 2025)
   * @deprecated Use buscarFaturamentoCliente em vez disso
   */
  async buscarFaturamentoAno(
    codigoSci: number,
    ano: number
  ): Promise<FaturamentoMensal[]> {
    const dataInicio = `01.01.${ano}`;
    const dataFim = `31.12.${ano}`;

    const response = await api.post('/sci/catalog/sp-bi-fat', {
      cod_emp: codigoSci,
      param1: 2,
      param2: 2,
      data_inicio: dataInicio,
      data_fim: dataFim,
      param3: 1,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao buscar faturamento');
    }

    // Processar os dados retornados
    const rows = response.data.rows || [];
    
    // A SP retorna dados mensais de faturamento
    // Mapear os campos conforme a estrutura retornada (Firebird geralmente retorna em maiúsculas)
    return rows.map((row: any) => {
      // Tentar diferentes nomes de campos comuns
      const mesValue = 
        row.MES || row.mes || 
        row.MES_REF || row.mes_ref ||
        row.MES_REFERENCIA || row.mes_referencia ||
        parseInt(String(row.MES || row.mes || row.MES_REF || row.mes_ref || '0'));
      
      const valorValue = 
        row.VALOR || row.valor || 
        row.VALOR_FAT || row.valor_fat ||
        row.VALOR_FATURAMENTO || row.valor_faturamento ||
        row.FATURAMENTO || row.faturamento ||
        row.VALOR_TOTAL || row.valor_total ||
        0;
      
      // Extrair mês e ano da data se houver campo de data
      let mes = mesValue;
      let anoCalculado = ano;
      
      if (row.DATA || row.data || row.DATA_REF || row.data_ref) {
        const dataStr = String(row.DATA || row.data || row.DATA_REF || row.data_ref || '');
        // Tentar parsear data no formato DD.MM.YYYY ou similar
        const dataMatch = dataStr.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
        if (dataMatch) {
          mes = parseInt(dataMatch[2]);
          anoCalculado = parseInt(dataMatch[3]);
        }
      }
      
      return {
        mes: typeof mes === 'number' ? mes : parseInt(String(mes)) || 0,
        ano: anoCalculado,
        valor: parseFloat(String(valorValue)) || 0,
        ...row, // Incluir outros campos para debug
      };
    });
  },

  /**
   * Busca faturamento dos últimos 2 anos
   */
  async buscarFaturamentoUltimosAnos(
    codigoSci: number,
    anoAtual: number = new Date().getFullYear()
  ): Promise<FaturamentoAnual[]> {
    const anos = [anoAtual - 1, anoAtual]; // Últimos 2 anos

    const resultados = await Promise.all(
      anos.map(async (ano) => {
        try {
          const meses = await this.buscarFaturamentoAno(codigoSci, ano);
          const valorTotal = meses.reduce((sum, mes) => sum + (mes.valor || 0), 0);

          return {
            ano,
            valorTotal,
            meses,
          };
        } catch (error) {
          console.error(`Erro ao buscar faturamento de ${ano}:`, error);
          return {
            ano,
            valorTotal: 0,
            meses: [],
          };
        }
      })
    );

    return resultados;
  },

  /**
   * Buscar faturamento detalhado do cache por tipo
   * @param clienteId ID do cliente
   * @param tipo Tipo de visualização: 'detalhado' | 'consolidado' | 'mini'
   * @param anos Anos para buscar
   */
  async buscarFaturamentoPorTipo(
    clienteId: string,
    tipo: 'detalhado' | 'consolidado' | 'mini',
    anos?: number[]
  ): Promise<any> {
    console.log(`[IRPF Service] Buscando faturamento por tipo: clienteId=${clienteId}, tipo=${tipo}, anos=${anos?.join(',')}`);
    
    const params: any = {};
    if (anos && anos.length > 0) {
      params.anos = anos.join(',');
    }
    
    const response = await api.get(`/irpf/faturamento/${clienteId}/cache/${tipo}`, { params });

    console.log(`[IRPF Service] Resposta recebida:`, response.data);

    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro ao buscar faturamento do cache');
    }

    const data = response.data.data || [];
    console.log(`[IRPF Service] Dados retornados:`, data);
    return data;
  },
};

