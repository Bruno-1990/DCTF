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
        dataDeclaracao: new Date('2024-01-15'),
        status: 'concluido',
        arquivoOriginal: 'http://example.com/dctf-2024-01.xlsx',
        debitoApurado: 1500.75,
        saldoAPagar: 950.5,
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: {
          id: '1',
          razao_social: 'Empresa Exemplo Ltda',
          cnpj: '12.345.678/0001-90',
          cnpj_limpo: '12345678000190',
        },
      },
      {
        id: '2',
        clienteId: '2',
        periodo: '2024-02',
        dataDeclaracao: new Date('2024-02-15'),
        status: 'pendente',
        arquivoOriginal: 'http://example.com/dctf-2024-02.xlsx',
        debitoApurado: 3200.1,
        saldoAPagar: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: {
          id: '2',
          razao_social: 'Comércio Teste S.A.',
          cnpj: '98.765.432/0001-10',
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

      // Buscar registros
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*');

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
          .select('id, razao_social, cnpj, cnpj_limpo')
          .in('id', clienteIds);
        
        if (!clientesError && clientesData) {
          clientesMap = new Map(clientesData.map((c: any) => [c.id, c]));
        }
      }

      // Mapear resultado para camelCase e incluir dados do cliente
      const mappedData = data.map((item: any) => {
        const statusRaw = item.status || item.situacao;
        let statusNormalized = 'pendente';
        if (statusRaw) {
          const statusLower = statusRaw.toLowerCase();
          if (statusLower === 'ativa' || statusLower === 'concluido' || statusLower === 'concluída') {
            statusNormalized = 'concluido';
          } else if (statusLower === 'processando') {
            statusNormalized = 'processando';
          } else if (statusLower === 'erro' || statusLower === 'erros') {
            statusNormalized = 'erro';
          }
        }
        
        return {
          id: item.id,
          clienteId: item.cliente_id,
          periodo: item.periodo || item.periodo_apuracao,
          dataDeclaracao: item.data_declaracao || item.data_transmissao || new Date(),
          status: statusNormalized as 'pendente' | 'processando' | 'concluido' | 'erro',
        situacao: item.situacao || item.status || statusNormalized,
          arquivoOriginal: item.arquivo_original,
          observacoes: item.observacoes,
          debitoApurado: item.debito_apurado != null ? Number(item.debito_apurado) : null,
          saldoAPagar: item.saldo_a_pagar != null ? Number(item.saldo_a_pagar) : null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          cliente: item.cliente_id && clientesMap.has(item.cliente_id) ? {
            id: clientesMap.get(item.cliente_id).id,
            razao_social: clientesMap.get(item.cliente_id).razao_social,
            cnpj: clientesMap.get(item.cliente_id).cnpj,
            cnpj_limpo: clientesMap.get(item.cliente_id).cnpj_limpo,
          } : undefined,
        };
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

      return super.findById(id);
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

    // Verificar se já existe declaração para o mesmo cliente e período
    if (dctfData.clienteId && dctfData.periodo) {
      const existingDCTF = await this.findBy({
        cliente_id: dctfData.clienteId,
        periodo: dctfData.periodo,
      });
      
      if (existingDCTF.success && existingDCTF.data!.length > 0) {
        return {
          success: false,
          error: 'Já existe declaração DCTF para este cliente e período',
        };
      }
    }

    return this.create(dctfData);
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

    return this.update(id, updates);
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
        .select('id, razao_social, cnpj, cnpj_limpo')
        .eq('id', clienteId)
        .single();

      if (!clienteError && clienteData) {
        cliente = {
          id: clienteData.id,
          razao_social: clienteData.razao_social,
          cnpj: clienteData.cnpj,
          cnpj_limpo: clienteData.cnpj_limpo,
        };
      }

      // Mapear resultado para camelCase e incluir dados do cliente
      const mappedData = data.map((item: any) => ({
        id: item.id,
        clienteId: item.cliente_id,
        periodo: item.periodo_apuracao || item.periodo,
        dataDeclaracao: item.data_transmissao || item.data_declaracao || new Date(),
        status: item.situacao || item.status,
        situacao: item.situacao || item.status,
        arquivoOriginal: item.arquivo_original,
        observacoes: item.observacoes,
        debitoApurado: item.debito_apurado != null ? Number(item.debito_apurado) : null,
        saldoAPagar: item.saldo_a_pagar != null ? Number(item.saldo_a_pagar) : null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        cliente,
      }));

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
