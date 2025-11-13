/**
 * Modelo Cliente - Representa um cliente do sistema DCTF
 * Implementa validações e operações CRUD específicas
 */

import { DatabaseService } from '../services/DatabaseService';
import { Cliente as ICliente, ApiResponse } from '../types';
import { supabase } from '../config/database';
import Joi from 'joi';

// Schema de validação para Cliente
// IMPORTANTE: Apenas cnpj_limpo é salvo no banco. CNPJ formatado é gerado apenas na exibição.
const clienteSchema = Joi.object({
  razao_social: Joi.string().min(2).max(255).required().messages({
    'string.min': 'Razão Social deve ter pelo menos 2 caracteres',
    'string.max': 'Razão Social deve ter no máximo 255 caracteres',
    'any.required': 'Razão Social é obrigatória',
  }),
  cnpj_limpo: Joi.string()
    .pattern(/^\d{14}$/)
    .required()
    .messages({
      'string.pattern.base': 'CNPJ deve conter exatamente 14 dígitos (sem formatação)',
      'any.required': 'CNPJ é obrigatório',
    }),
  email: Joi.string().email().optional().allow('').messages({
    'string.email': 'Email deve ter um formato válido',
  }),
  telefone: Joi.string()
    .pattern(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Telefone deve estar no formato (00) 0000-0000',
    }),
  endereco: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Endereço deve ter no máximo 500 caracteres',
  }),
});

export class Cliente extends DatabaseService<ICliente> {
  private static mockStore: ICliente[] = [];
  constructor() {
    super('clientes');
  }

  /**
   * Dados mock para teste (temporário)
   */
  private getMockData(): ApiResponse<ICliente[]> {
    const mockClientes: ICliente[] = [
      {
        id: '1',
        razao_social: 'Empresa Exemplo Ltda',
        cnpj_limpo: '12345678000190',
        email: 'contato@empresaexemplo.com.br',
        telefone: '(11) 99999-9999',
        endereco: 'Rua das Flores, 123 - São Paulo/SP',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        razao_social: 'Comércio Teste S.A.',
        cnpj_limpo: '98765432000110',
        email: 'vendas@comercioteste.com.br',
        telefone: '(21) 88888-8888',
        endereco: 'Av. Principal, 456 - Rio de Janeiro/RJ',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const merged = [...mockClientes, ...Cliente.mockStore];

    return {
      success: true,
      data: merged,
    };
  }

  /**
   * Buscar todos os registros (com mock temporário)
   */
  async findAll(): Promise<ApiResponse<ICliente[]>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        return this.getMockData();
      }

      const result = await super.findAll();
      
      if (!result.success || !result.data) {
        return result;
      }

      // Mapear dados do Supabase (snake_case) para camelCase
      const mappedData = result.data.map((item: any) => this.mapSupabaseRow(item));

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
  async findById(id: string): Promise<ApiResponse<ICliente>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          const cliente = mockData.data.find(c => c.id === id);
          if (cliente) {
            return {
              success: true,
              data: cliente,
            };
          } else {
            return {
              success: false,
              error: 'Cliente não encontrado',
            };
          }
        }
      }

      const result = await super.findById(id);
      
      if (!result.success || !result.data) {
        return result;
      }

      // Mapear dados do Supabase (snake_case) para camelCase
      return {
        success: true,
        data: this.mapSupabaseRow(result.data),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar por nome/razão social (com mock temporário)
   */
  async searchByName(nome: string): Promise<ApiResponse<ICliente[]>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          const clientesFiltrados = mockData.data.filter(cliente =>
            (cliente.razao_social || cliente.nome || '').toLowerCase().includes(nome.toLowerCase())
          );
          return {
            success: true,
            data: clientesFiltrados,
          };
        }
      }

      // Implementação real do searchByName quando Supabase estiver configurado
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .ilike('razao_social', `%${nome}%`)
        .order('razao_social');

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      // Mapear dados do Supabase (snake_case) para camelCase
      const mappedData = (data || []).map((item: any) => this.mapSupabaseRow(item));

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
   * Obter estatísticas (com mock temporário)
   */
  async getStats(): Promise<ApiResponse<{ total: number; ativos: number }>> {
    try {
      // Mock temporário se Supabase não estiver configurado
      if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
        const mockData = this.getMockData();
        if (mockData.success && mockData.data) {
          return {
            success: true,
            data: {
              total: mockData.data.length,
              ativos: mockData.data.length, // Todos ativos no mock
            },
          };
        }
      }

      // Implementação real do getStats quando Supabase estiver configurado
      const totalResult = await this.count();
      if (!totalResult.success) {
        return {
          success: false,
          error: totalResult.error || 'Erro ao obter estatísticas'
        };
      }

      return {
        success: true,
        data: {
          total: totalResult.data!,
          ativos: totalResult.data!, // Por enquanto, todos são considerados ativos
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
   * Valida os dados do cliente
   */
  private validateCliente(data: Partial<ICliente>): { isValid: boolean; error?: string } {
    const { error } = clienteSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  /**
   * Mapear dados do Supabase (snake_case) para camelCase
   */
  private mapSupabaseRow(row: any): ICliente {
    return {
      id: row.id,
      razao_social: row.razao_social || row.nome || '',
      cnpj_limpo: row.cnpj_limpo || (row.cnpj ? this.cleanCNPJ(row.cnpj) : ''),
      email: row.email || undefined,
      telefone: row.telefone || undefined,
      endereco: row.endereco || undefined,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  }

  /**
   * Limpar CNPJ removendo formatação
   */
  private cleanCNPJ(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  }

  /**
   * Formatar CNPJ para exibição
   */
  private formatCNPJDisplay(cnpj: string): string {
    const clean = this.cleanCNPJ(cnpj);
    return clean
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  /**
   * Validar CNPJ usando algoritmo oficial
   */
  private validateCNPJ(cnpj: string): boolean {
    const cleanCNPJ = this.cleanCNPJ(cnpj);
    
    if (cleanCNPJ.length !== 14) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cleanCNPJ)) return false;
    
    // Calcular primeiro dígito verificador
    let sum = 0;
    let weight = 5;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cleanCNPJ[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const firstDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    
    if (parseInt(cleanCNPJ[12]) !== firstDigit) return false;
    
    // Calcular segundo dígito verificador
    sum = 0;
    weight = 6;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(cleanCNPJ[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const secondDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    
    return parseInt(cleanCNPJ[13]) === secondDigit;
  }

  /**
   * Criar cliente com validações
   */
  async createCliente(clienteData: Partial<ICliente>): Promise<ApiResponse<ICliente>> {
    // SEMPRE limpar CNPJ antes de processar (aceita formatado ou limpo)
    if (clienteData.cnpj_limpo) {
      clienteData.cnpj_limpo = String(clienteData.cnpj_limpo).replace(/\D/g, '');
    }
    
    // Validar dados
    const validation = this.validateCliente(clienteData);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Validar CNPJ usando cnpj_limpo
    if (clienteData.cnpj_limpo && !this.validateCNPJ(clienteData.cnpj_limpo)) {
      return {
        success: false,
        error: 'CNPJ inválido',
      };
    }

    // Mock temporário se Supabase não estiver configurado
    if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
      const novoCliente: ICliente = {
        id: Date.now().toString(),
        razao_social: clienteData.razao_social!,
        cnpj_limpo: clienteData.cnpj_limpo!,
        // cnpj formatado não é salvo, apenas gerado na exibição
        email: clienteData.email || '',
        telefone: clienteData.telefone || '',
        endereco: clienteData.endereco || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Persistir em memória para testes
      Cliente.mockStore.push(novoCliente);

      return {
        success: true,
        data: novoCliente,
      };
    }

    // Verificar se CNPJ já existe usando cnpj_limpo
    if (clienteData.cnpj_limpo) {
      const existingCliente = await this.findBy({ cnpj_limpo: clienteData.cnpj_limpo });
      if (existingCliente.success && existingCliente.data!.length > 0) {
        return {
          success: false,
          error: 'Cliente com este CNPJ já existe',
        };
      }
    }

    // Preparar dados para inserção
    // IMPORTANTE: Salvar apenas cnpj_limpo no banco, cnpj formatado é gerado apenas na exibição
    const dataToInsert: any = {
      razao_social: clienteData.razao_social,
      cnpj_limpo: clienteData.cnpj_limpo, // Sempre limpo
      // Não salvar cnpj formatado no banco, será gerado na exibição
      email: clienteData.email || undefined,
      telefone: clienteData.telefone || undefined,
      endereco: clienteData.endereco || undefined,
    };

    const result = await this.create(dataToInsert);
    
    if (!result.success || !result.data) {
      return result;
    }

    // Mapear dados do Supabase (snake_case) para camelCase
    return {
      success: true,
      data: this.mapSupabaseRow(result.data),
    };
  }

  /**
   * Atualizar cliente com validações
   */
  async updateCliente(id: string, updates: Partial<ICliente>): Promise<ApiResponse<ICliente>> {
    // SEMPRE limpar CNPJ antes de processar (aceita formatado ou limpo)
    if (updates.cnpj_limpo) {
      updates.cnpj_limpo = String(updates.cnpj_limpo).replace(/\D/g, '');
    }
    
    // Validar dados
    const validation = this.validateCliente(updates);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Validar CNPJ se fornecido usando cnpj_limpo
    if (updates.cnpj_limpo && !this.validateCNPJ(updates.cnpj_limpo)) {
      return {
        success: false,
        error: 'CNPJ inválido',
      };
    }

    // Verificar se CNPJ já existe em outro cliente usando cnpj_limpo
    if (updates.cnpj_limpo) {
      const existingClientes = await this.findBy({ cnpj_limpo: updates.cnpj_limpo });
      if (existingClientes.success && existingClientes.data!.length > 0) {
        const otherCliente = existingClientes.data!.find(c => c.id !== id);
        if (otherCliente) {
          return {
            success: false,
            error: 'Cliente com este CNPJ já existe',
          };
        }
      }
    }

    // Preparar dados para atualização
    // IMPORTANTE: Não salvar cnpj formatado no banco, apenas cnpj_limpo
    const dataToUpdate: any = {
      ...updates,
      cnpj_limpo: updates.cnpj_limpo, // Sempre limpo
      // Não incluir cnpj formatado, será gerado na exibição
    };
    
    // Remover cnpj se estiver presente (não salvar formatado)
    delete dataToUpdate.cnpj;

    const result = await this.update(id, dataToUpdate);
    
    if (!result.success || !result.data) {
      return result;
    }

    // Mapear dados do Supabase (snake_case) para camelCase
    return {
      success: true,
      data: this.mapSupabaseRow(result.data),
    };
  }

  /**
   * Buscar cliente por CNPJ
   */
  async findByCNPJ(cnpj: string): Promise<ApiResponse<ICliente>> {
    const cleanCNPJ = this.cleanCNPJ(cnpj);

    // Mock temporário se Supabase não estiver configurado
    if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
      const mockData = this.getMockData();
      if (mockData.success && mockData.data) {
        const cliente = mockData.data.find(c => c.cnpj_limpo === cleanCNPJ);
        if (cliente) {
          return { success: true, data: cliente };
        }
      }
      return { success: false, error: 'Cliente não encontrado' };
    }

    // Buscar por cnpj_limpo em vez de cnpj formatado
    const result = await this.findBy({ cnpj_limpo: cleanCNPJ });
    
    if (result.success && result.data!.length > 0) {
      // Mapear dados do Supabase (snake_case) para camelCase
      return {
        success: true,
        data: this.mapSupabaseRow(result.data![0]),
      };
    }
    
    return {
      success: false,
      error: 'Cliente não encontrado',
    };
  }

}
