/**
 * Modelo Cliente - Representa um cliente do sistema DCTF
 * Implementa validações e operações CRUD específicas
 */

import { DatabaseService } from '../services/DatabaseService';
import { Cliente as ICliente, ApiResponse } from '../types';
import { supabase } from '../config/database';
import Joi from 'joi';

// Schema de validação para Cliente
const clienteSchema = Joi.object({
  razao_social: Joi.string().min(2).max(255).required().messages({
    'string.min': 'Razão Social deve ter pelo menos 2 caracteres',
    'string.max': 'Razão Social deve ter no máximo 255 caracteres',
    'any.required': 'Razão Social é obrigatória',
  }),
  cnpj: Joi.string()
    .pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'CNPJ deve estar no formato 00.000.000/0000-00',
    }),
  cnpj_limpo: Joi.string()
    .pattern(/^\d{14}$/)
    .required()
    .messages({
      'string.pattern.base': 'CNPJ Limpo deve conter 14 dígitos',
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
        cnpj: '12.345.678/0001-90',
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
        cnpj: '98.765.432/0001-10',
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

      return super.findAll();
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

      return super.findById(id);
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

      return {
        success: true,
        data: data || [],
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
        cnpj: this.formatCNPJDisplay(clienteData.cnpj_limpo!),
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
    const dataToInsert = {
      razao_social: clienteData.razao_social,
      cnpj_limpo: clienteData.cnpj_limpo,
      cnpj: clienteData.cnpj_limpo ? this.formatCNPJDisplay(clienteData.cnpj_limpo) : undefined,
      email: clienteData.email,
      telefone: clienteData.telefone,
      endereco: clienteData.endereco,
    };

    return this.create(dataToInsert);
  }

  /**
   * Atualizar cliente com validações
   */
  async updateCliente(id: string, updates: Partial<ICliente>): Promise<ApiResponse<ICliente>> {
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
    const dataToUpdate = {
      ...updates,
      cnpj: updates.cnpj_limpo ? this.formatCNPJDisplay(updates.cnpj_limpo) : updates.cnpj,
    };

    return this.update(id, dataToUpdate);
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
        const cliente = mockData.data.find(c => this.cleanCNPJ(c.cnpj || '') === cleanCNPJ);
        if (cliente) {
          return { success: true, data: cliente };
        }
      }
      return { success: false, error: 'Cliente não encontrado' };
    }

    // Buscar por cnpj_limpo em vez de cnpj formatado
    const result = await this.findBy({ cnpj_limpo: cleanCNPJ });
    
    if (result.success && result.data!.length > 0) {
      return {
        success: true,
        data: result.data![0],
      };
    }
    
    return {
      success: false,
      error: 'Cliente não encontrado',
    };
  }

}
