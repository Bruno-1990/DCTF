/**
 * Modelo DCTF - Representa declarações DCTF do sistema
 * Implementa processamento e validação de dados DCTF
 */

import { DatabaseService } from '../services/DatabaseService';
import { ValidationService } from '../services/ValidationService';
import { DCTF as IDCTF, ApiResponse } from '../types';
import Joi from 'joi';

// Schema de validação para DCTF
const dctfSchema = Joi.object({
  clienteId: Joi.string().uuid().required().messages({
    'string.guid': 'ID do cliente deve ser um UUID válido',
    'any.required': 'ID do cliente é obrigatório',
  }),
  periodo: Joi.string()
    .pattern(/^\d{4}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'Período deve estar no formato YYYY-MM',
      'any.required': 'Período é obrigatório',
    }),
  dataDeclaracao: Joi.date().required().messages({
    'date.base': 'Data da declaração deve ser uma data válida',
    'any.required': 'Data da declaração é obrigatória',
  }),
  status: Joi.string()
    .valid('pendente', 'processando', 'concluido', 'erro')
    .default('pendente')
    .messages({
      'any.only': 'Status deve ser: pendente, processando, concluido ou erro',
    }),
  arquivoOriginal: Joi.string().uri().optional().messages({
    'string.uri': 'Arquivo original deve ser uma URI válida',
  }),
  observacoes: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Observações devem ter no máximo 1000 caracteres',
  }),
});

export class DCTF extends DatabaseService<IDCTF> {
  constructor() {
    super('dctf_declaracoes');
  }

  /**
   * Dados mock para teste (temporário)
   */
  private getMockData(): ApiResponse<IDCTF[]> {
    const mockDCTFs: IDCTF[] = [
      {
        id: '1',
        clienteId: '1',
        periodo: '2024-01',
        periodoApuracao: '2024-01',
        dataDeclaracao: new Date('2024-01-15'),
        dataTransmissao: new Date('2024-01-15T18:52:47Z'),
        status: 'concluido',
        arquivoOriginal: 'http://example.com/dctf-2024-01.xlsx',
        debitoApurado: 1500.75,
        saldoAPagar: 950.5,
        tipoNi: 'CNPJ',
        numeroIdentificacao: '12.345.678/0001-90',
        categoria: 'Geral',
        origem: 'MIT',
        tipoDeclaracao: 'Original',
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: {
          id: '1',
          razao_social: 'Empresa Exemplo Ltda',
          cnpj_limpo: '12345678000190',
        },
      },
      {
        id: '2',
        clienteId: '2',
        periodo: '2024-02',
        periodoApuracao: '2024-02',
        dataDeclaracao: new Date('2024-02-15'),
        dataTransmissao: new Date('2024-02-15T14:00:00Z'),
        status: 'pendente',
        arquivoOriginal: 'http://example.com/dctf-2024-02.xlsx',
        debitoApurado: 3200.1,
        saldoAPagar: 0,
        tipoNi: 'CNPJ',
        numeroIdentificacao: '98.765.432/0001-10',
        categoria: 'Geral',
        origem: 'eSocial',
        tipoDeclaracao: 'Retificadora',
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: {
          id: '2',
          razao_social: 'Comércio Teste S.A.',
          cnpj_limpo: '98765432000110',
        },
      },
    ];

    return {
      success: true,
      data: mockDCTFs,
    };
  }

  /**
   * Buscar todos os registros (com mock temporário)
   */
  async findAll(): Promise<ApiResponse<IDCTF[]>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        return this.getMockData();
      }

      // Buscar registros - garantir que periodo_apuracao e hora_transmissao sejam incluídos
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, periodo_apuracao, hora_transmissao');

      if (error) {
        console.error('Erro ao buscar DCTF:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // Buscar dados dos clientes em batch usando os IDs únicos
      const clienteIds = [...new Set(data.map((item: any) => item.cliente_id).filter(Boolean))];
      let clientesMap = new Map();
      
      if (clienteIds.length > 0) {
        const { data: clientesData, error: clientesError } = await this.supabase
          .from('clientes')
          .select('id, razao_social, cnpj_limpo')
          .in('id', clienteIds);
        
        if (!clientesError && clientesData) {
          clientesMap = new Map(clientesData.map((c: any) => [c.id, c]));
        }
      }

      // Mapear resultado para camelCase e incluir dados do cliente
      const mappedData = data.map((item: any) => {
        const clienteRecord = item.cliente_id && clientesMap.has(item.cliente_id)
          ? clientesMap.get(item.cliente_id)
          : undefined;
        return this.mapSupabaseRow(item, clienteRecord);
      });

      return {
        success: true,
        data: mappedData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar registro por ID (com mock temporário)
   */
  async findById(id: string): Promise<ApiResponse<IDCTF>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          const dctf = mockData.data.find(d => d.id === id);
          if (dctf) {
            return {
              success: true,
              data: dctf,
            };
          } else {
            return {
              success: false,
              error: 'Declaração DCTF não encontrada',
            };
          }
        }
      }

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'Declaração DCTF não encontrada',
        };
      }

      let clienteRecord = undefined;
      if (data.cliente_id) {
        const { data: clienteData } = await this.supabase
          .from('clientes')
          .select('id, razao_social, nome, cnpj_limpo')
          .eq('id', data.cliente_id)
          .single();
        clienteRecord = clienteData || undefined;
      }

      return {
        success: true,
        data: this.mapSupabaseRow(data, clienteRecord),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Valida os dados da declaração DCTF
   */
  private validateDCTF(data: Partial<IDCTF>): { isValid: boolean; error?: string } {
    const { error } = dctfSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Validar período no formato YYYY-MM
   */
  private validatePeriodo(periodo: string): boolean {
    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(periodo)) return false;
    
    const [ano, mes] = periodo.split('-').map(Number);
    const anoAtual = new Date().getFullYear();
    
    return ano >= 2020 && ano <= anoAtual + 1 && mes >= 1 && mes <= 12;
  }

  /**
   * Criar declaração DCTF com validações
   */
  async createDCTF(dctfData: Partial<IDCTF>): Promise<ApiResponse<IDCTF>> {
    // Normalizar período se fornecido
    if (dctfData.periodo) {
      const normalized = ValidationService.normalizePeriodo(dctfData.periodo);
      if (!normalized) {
        return {
          success: false,
          error: 'Período inválido. Use o formato YYYY-MM',
        };
      }
      dctfData.periodo = normalized;
    }

    // Normalizar data de declaração (aceita dd/mm/yyyy) e permitir vazio
    if ((dctfData as any).dataDeclaracao !== undefined) {
      const raw = (dctfData as any).dataDeclaracao;
      if (typeof raw === 'string' && raw.trim() === '') {
        delete (dctfData as any).dataDeclaracao;
      } else {
        const normalizedDate = ValidationService.normalizeDate(raw);
        if (!normalizedDate) {
          return {
            success: false,
            error: 'Data da declaração inválida',
          };
        }
        dctfData.dataDeclaracao = normalizedDate;
      }
    }

    // Validar dados
    const validation = this.validateDCTF(dctfData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Validar período
    if (dctfData.periodo && !this.validatePeriodo(dctfData.periodo)) {
      return {
        success: false,
        error: 'Período inválido. Use o formato YYYY-MM',
      };
    }

    // Mock temporário se Supabase não estiver configurado
    if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
      const novaDeclaracao: IDCTF = {
        id: Date.now().toString(),
        clienteId: dctfData.clienteId!,
        periodo: dctfData.periodo!,
        dataDeclaracao: dctfData.dataDeclaracao || new Date(),
        status: dctfData.status || 'pendente',
        situacao: dctfData.situacao || dctfData.status || 'pendente',
        arquivoOriginal: dctfData.arquivoOriginal || '',
        dadosProcessados: dctfData.dadosProcessados,
        debitoApurado: dctfData.debitoApurado ?? null,
        saldoAPagar: dctfData.saldoAPagar ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        success: true,
        data: novaDeclaracao,
      };
    }

    // Converter camelCase para snake_case antes de salvar
    const supabaseData: any = {
      cliente_id: dctfData.clienteId,
      periodo: dctfData.periodo,
      periodo_apuracao: dctfData.periodoApuracao || dctfData.periodo,
      data_declaracao: dctfData.dataDeclaracao,
      data_transmissao: dctfData.dataTransmissao && dctfData.dataTransmissao.toString().trim() !== '' ? dctfData.dataTransmissao : null,
      hora_transmissao: dctfData.horaTransmissao && dctfData.horaTransmissao.toString().trim() !== '' ? dctfData.horaTransmissao : null,
      status: dctfData.status || 'pendente',
      situacao: dctfData.situacao || null,
      tipo_ni: dctfData.tipoNi || null,
      numero_identificacao: dctfData.numeroIdentificacao || null,
      categoria: dctfData.categoria || null,
      origem: dctfData.origem || null,
      tipo_declaracao: dctfData.tipoDeclaracao || null,
      debito_apurado: dctfData.debitoApurado || null,
      saldo_a_pagar: dctfData.saldoAPagar || null,
      observacoes: dctfData.observacoes || null,
    };

    return this.create(supabaseData);
  }

  /**
   * Atualizar declaração DCTF
   */
  async updateDCTF(id: string, updates: Partial<IDCTF>): Promise<ApiResponse<IDCTF>> {
    // Normalizar período se fornecido
    if (updates.periodo) {
      const normalized = ValidationService.normalizePeriodo(updates.periodo);
      if (!normalized) {
        return {
          success: false,
          error: 'Período inválido. Use o formato YYYY-MM',
        };
      }
      updates.periodo = normalized;
    }

    // Normalizar data de declaração se fornecida (permitir vazio)
    if ((updates as any).dataDeclaracao !== undefined) {
      const raw = (updates as any).dataDeclaracao;
      if (typeof raw === 'string' && raw.trim() === '') {
        delete (updates as any).dataDeclaracao;
      } else {
        const normalizedDate = ValidationService.normalizeDate(raw);
        if (!normalizedDate) {
          return {
            success: false,
            error: 'Data da declaração inválida',
          };
        }
        updates.dataDeclaracao = normalizedDate;
      }
    }

    // Validar dados
    const validation = this.validateDCTF(updates);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Validar período se fornecido
    if (updates.periodo && !this.validatePeriodo(updates.periodo)) {
      return {
        success: false,
        error: 'Período inválido. Use o formato YYYY-MM',
      };
    }

    // Converter camelCase para snake_case antes de atualizar
    const supabaseUpdates: any = {};
    if (updates.clienteId !== undefined) supabaseUpdates.cliente_id = updates.clienteId;
    if (updates.periodo !== undefined) supabaseUpdates.periodo = updates.periodo;
    if (updates.periodoApuracao !== undefined) supabaseUpdates.periodo_apuracao = updates.periodoApuracao;
    if (updates.dataDeclaracao !== undefined) supabaseUpdates.data_declaracao = updates.dataDeclaracao;
    if (updates.dataTransmissao !== undefined) {
      supabaseUpdates.data_transmissao = updates.dataTransmissao && updates.dataTransmissao.toString().trim() !== '' ? updates.dataTransmissao : null;
    }
    if (updates.horaTransmissao !== undefined) {
      supabaseUpdates.hora_transmissao = updates.horaTransmissao && updates.horaTransmissao.toString().trim() !== '' ? updates.horaTransmissao : null;
    }
    if (updates.status !== undefined) supabaseUpdates.status = updates.status;
    if (updates.situacao !== undefined) supabaseUpdates.situacao = updates.situacao;
    if (updates.tipoNi !== undefined) supabaseUpdates.tipo_ni = updates.tipoNi;
    if (updates.numeroIdentificacao !== undefined) supabaseUpdates.numero_identificacao = updates.numeroIdentificacao;
    if (updates.categoria !== undefined) supabaseUpdates.categoria = updates.categoria;
    if (updates.origem !== undefined) supabaseUpdates.origem = updates.origem;
    if (updates.tipoDeclaracao !== undefined) supabaseUpdates.tipo_declaracao = updates.tipoDeclaracao;
    if (updates.debitoApurado !== undefined) supabaseUpdates.debito_apurado = updates.debitoApurado;
    if (updates.saldoAPagar !== undefined) supabaseUpdates.saldo_a_pagar = updates.saldoAPagar;
    if (updates.observacoes !== undefined) supabaseUpdates.observacoes = updates.observacoes;

    return this.update(id, supabaseUpdates);
  }

  /**
   * Buscar declarações por cliente (com mock temporário)
   */
  async findByCliente(clienteId: string): Promise<ApiResponse<IDCTF[]>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          const dctfsPorCliente = mockData.data.filter(d => d.clienteId === clienteId);
          return {
            success: true,
            data: dctfsPorCliente,
          };
        }
      }

      // Buscar registros por cliente
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('cliente_id', clienteId);

      if (error) {
        console.error('Erro ao buscar DCTF por cliente:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // Buscar dados do cliente
      let cliente = undefined;
      const { data: clienteData, error: clienteError } = await this.supabase
        .from('clientes')
        .select('id, razao_social, cnpj_limpo')
        .eq('id', clienteId)
        .single();

      if (!clienteError && clienteData) {
        cliente = {
          id: clienteData.id,
          razao_social: clienteData.razao_social,
          cnpj_limpo: clienteData.cnpj_limpo,
        };
      }

      // Mapear resultado para camelCase e incluir dados do cliente
      const mappedData = data.map((item: any) => this.mapSupabaseRow(item, cliente));

      return {
        success: true,
        data: mappedData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar declarações por período
   */
  async findByPeriodo(periodo: string): Promise<ApiResponse<IDCTF[]>> {
    const normalized = ValidationService.normalizePeriodo(periodo);
    if (!normalized || !this.validatePeriodo(normalized)) {
      return {
        success: false,
        error: 'Período inválido. Use o formato YYYY-MM',
      };
    }

    return this.findBy({ periodo: normalized });
  }

  /**
   * Buscar declarações por status
   */
  async findByStatus(status: string): Promise<ApiResponse<IDCTF[]>> {
    const validStatuses = ['pendente', 'processando', 'concluido', 'erro'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: 'Status inválido',
      };
    }

    return this.findBy({ status });
  }

  /**
   * Atualizar status da declaração
   */
  async updateStatus(id: string, status: string): Promise<ApiResponse<IDCTF>> {
    const validStatuses = ['pendente', 'processando', 'concluido', 'erro'] as const;
    if (!validStatuses.includes(status as any)) {
      return {
        success: false,
        error: 'Status inválido',
      };
    }

    return this.update(id, { status: status as 'pendente' | 'processando' | 'concluido' | 'erro' });
  }

  /**
   * Obter estatísticas das declarações
   */
  async getStats(): Promise<ApiResponse<{
    total: number;
    porStatus: Record<string, number>;
    porPeriodo: Record<string, number>;
  }>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          const porStatus: Record<string, number> = {
            pendente: 0,
            processando: 0,
            concluido: 0,
            erro: 0,
          };
          
          mockData.data.forEach(d => {
            porStatus[d.status] = (porStatus[d.status] || 0) + 1;
          });

          const porPeriodo: Record<string, number> = {};
          mockData.data.forEach(d => {
            porPeriodo[d.periodo] = (porPeriodo[d.periodo] || 0) + 1;
          });

          return {
            success: true,
            data: {
              total: mockData.data.length,
              porStatus,
              porPeriodo,
            },
          };
        }
      }

      const totalResult = await this.count();
      if (!totalResult.success) {
        return {
          success: false,
          error: totalResult.error,
        };
      }

      // Buscar declarações por status
      const statuses = ['pendente', 'processando', 'concluido', 'erro'];
      const porStatus: Record<string, number> = {};
      
      for (const status of statuses) {
        const statusResult = await this.count({ status });
        porStatus[status] = statusResult.success ? statusResult.data! : 0;
      }

      // Buscar declarações dos últimos 12 meses
      const porPeriodo: Record<string, number> = {};
      const currentDate = new Date();
      
      for (let i = 0; i < 12; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const periodoResult = await this.count({ periodo });
        porPeriodo[periodo] = periodoResult.success ? periodoResult.data! : 0;
      }

      return {
        success: true,
        data: {
          total: totalResult.data!,
          porStatus,
          porPeriodo,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  private normalizeStatus(statusRaw: any): 'pendente' | 'processando' | 'concluido' | 'erro' {
    if (!statusRaw) return 'pendente';
    const value = String(statusRaw).toLowerCase();
    if (['ativa', 'ativo', 'concluido', 'concluída', 'concluida', 'entregue'].includes(value)) {
      return 'concluido';
    }
    if (['processando', 'em andamento', 'em_andamento', 'andamento', 'em_andamento'].includes(value)) {
      return 'processando';
    }
    if (['erro', 'erros', 'com erro', 'falha'].includes(value)) {
      return 'erro';
    }
    return 'pendente';
  }

  private mapSupabaseRow(item: any, clienteRecord?: any): IDCTF {
    const statusNormalized = this.normalizeStatus(item.status || item.situacao);
    const periodo = item.periodo || item.periodo_apuracao || item.periodoApuracao;
    const dataDeclaracaoRaw = item.data_declaracao || item.dataDeclaracao || item.data_transmissao || item.dataTransmissao;
    
    // Combinar data_transmissao com hora_transmissao se ambos existirem
    let dataTransmissaoRaw = item.data_transmissao || item.dataTransmissao || null;
    const horaTransmissaoRaw = item.hora_transmissao || item.horaTransmissao || null;
    
    // Se temos data e hora separados, concatenar
    if (dataTransmissaoRaw && horaTransmissaoRaw) {
      // Extrair apenas a data (sem hora) do campo data_transmissao
      let dataStr: string | null = null;
      if (typeof dataTransmissaoRaw === 'string') {
        // Se já tem hora, remover; se não, usar como está
        dataStr = dataTransmissaoRaw.includes('T') 
          ? dataTransmissaoRaw.split('T')[0]
          : dataTransmissaoRaw.split(' ')[0];
      } else if (dataTransmissaoRaw instanceof Date) {
        dataStr = dataTransmissaoRaw.toISOString().split('T')[0];
      }
      
      // Garantir formato correto da hora (HH:MM:SS)
      let horaStr: string | null = null;
      if (typeof horaTransmissaoRaw === 'string') {
        const horaTrimmed = horaTransmissaoRaw.trim();
        // Se já está no formato HH:MM:SS, usar; se não, tentar parsear
        if (/^\d{2}:\d{2}:\d{2}/.test(horaTrimmed)) {
          horaStr = horaTrimmed;
        } else {
          // Tentar outros formatos
          horaStr = horaTrimmed;
        }
      } else if (horaTransmissaoRaw instanceof Date) {
        horaStr = horaTransmissaoRaw.toTimeString().split(' ')[0];
      }
      
      if (dataStr && horaStr) {
        // Criar timestamp completo: YYYY-MM-DDTHH:MM:SS
        dataTransmissaoRaw = `${dataStr}T${horaStr}`;
      }
    }

    const dataDeclaracao = dataDeclaracaoRaw ? new Date(dataDeclaracaoRaw) : new Date();
    const dataTransmissao = dataTransmissaoRaw ? new Date(dataTransmissaoRaw) : null;

    const tipoNi =
      item.tipo_ni ||
      item.identificacao_tipo ||
      item.identification_type ||
      (clienteRecord?.cnpj_limpo ? 'CNPJ' : null);

    let numeroIdentificacao =
      item.numero_identificacao ||
      item.identificacao ||
      item.identification ||
      item.numeroIdentificacao;

    if (!numeroIdentificacao && clienteRecord) {
      numeroIdentificacao = clienteRecord.cnpj_limpo || null;
    }

    const debitoApuradoRaw = item.debitoApurado ?? item.debito_apurado;
    const saldoAPagarRaw = item.saldoAPagar ?? item.saldo_a_pagar;

    const cliente =
      clienteRecord && typeof clienteRecord === 'object'
        ? {
            id: clienteRecord.id,
            razao_social: clienteRecord.razao_social || clienteRecord.nome,
            cnpj_limpo: clienteRecord.cnpj_limpo,
          }
        : item.cliente;

    return {
      id: item.id,
      clienteId: item.cliente_id || item.clienteId,
      periodo: periodo,
      periodoApuracao: (item.periodo_apuracao && item.periodo_apuracao.trim() !== '') 
        ? item.periodo_apuracao.trim() 
        : (item.periodoApuracao && item.periodoApuracao.trim() !== '') 
          ? item.periodoApuracao.trim() 
          : null,
      dataDeclaracao,
      dataTransmissao,
      status: statusNormalized,
      situacao: item.situacao || item.status || statusNormalized,
      tipoNi: tipoNi || null,
      numeroIdentificacao: numeroIdentificacao || null,
      categoria: item.categoria || item.category || null,
      origem: item.origem || item.source || null,
      tipoDeclaracao: item.tipo_declaracao || item.tipo || item.tipoDeclaracao || null,
      arquivoOriginal: item.arquivo_original,
      dadosProcessados: item.dados_processados || item.dadosProcessados,
      debitoApurado: debitoApuradoRaw != null ? Number(debitoApuradoRaw) : null,
      saldoAPagar: saldoAPagarRaw != null ? Number(saldoAPagarRaw) : null,
      observacoes: item.observacoes ?? null,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(),
      updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
      cliente,
    };
  }

  /**
   * Limpar todas as declarações DCTF (operação administrativa)
   * ATENÇÃO: Esta operação é irreversível e deve ser usada com cuidado
   * Retorna o número de registros deletados
   */
  async clearAll(): Promise<ApiResponse<{ deletedDeclarations: number; deletedData: number }>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        return {
          success: true,
          data: {
            deletedDeclarations: 0,
            deletedData: 0,
          },
          message: 'Operação simulada (Supabase não configurado)',
        };
      }

      // Primeiro, contar os registros antes de deletar
      const { count: dadosCount } = await this.supabase
        .from('dctf_dados')
        .select('*', { count: 'exact', head: true });

      const { count: declaracoesCount } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      // Deletar todos os dados relacionados (dctf_dados)
      const { error: dadosError } = await this.supabase
        .from('dctf_dados')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Condição sempre verdadeira para deletar tudo

      if (dadosError) {
        console.error('Erro ao limpar dados DCTF:', dadosError);
        return {
          success: false,
          error: `Erro ao limpar dados DCTF: ${dadosError.message}`,
        };
      }

      // Deletar todas as declarações
      const { error: declaracoesError } = await this.supabase
        .from(this.tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Condição sempre verdadeira para deletar tudo

      if (declaracoesError) {
        console.error('Erro ao limpar declarações DCTF:', declaracoesError);
        return {
          success: false,
          error: `Erro ao limpar declarações DCTF: ${declaracoesError.message}`,
        };
      }

      return {
        success: true,
        data: {
          deletedDeclarations: declaracoesCount ?? 0,
          deletedData: dadosCount ?? 0,
        },
        message: `Limpeza concluída: ${declaracoesCount ?? 0} declarações e ${dadosCount ?? 0} registros de dados deletados`,
      };
    } catch (error) {
      console.error('Erro ao limpar declarações DCTF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao limpar declarações',
      };
    }
  }

  /**
   * Processar arquivo DCTF (placeholder para implementação futura)
   */
  async processarArquivo(declaracaoId: string, arquivoPath: string): Promise<ApiResponse<boolean>> {
    try {
      // TODO: Implementar processamento do arquivo
      // 1. Ler arquivo (XLS, XLSX, CSV)
      // 2. Validar estrutura
      // 3. Processar dados
      // 4. Salvar na tabela dctf_dados
      // 5. Atualizar status da declaração

      // Por enquanto, apenas atualizar status
      const result = await this.updateStatus(declaracaoId, 'processando');
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // Simular processamento
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Atualizar para concluído
      await this.updateStatus(declaracaoId, 'concluido');

      return {
        success: true,
        data: true,
        message: 'Arquivo processado com sucesso',
      };
    } catch (error) {
      // Atualizar status para erro
      await this.updateStatus(declaracaoId, 'erro');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}
