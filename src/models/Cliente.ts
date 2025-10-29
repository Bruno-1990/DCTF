/**
 * Modelo Cliente - Representa um cliente do sistema DCTF
 * Implementa validações e operações CRUD específicas
 */

import { DatabaseService } from '../services/DatabaseService';
import { Cliente as ICliente, ApiResponse } from '../types';
import Joi from 'joi';

// Schema de validação para Cliente
const clienteSchema = Joi.object({
  nome: Joi.string().min(2).max(255).required().messages({
    'string.min': 'Nome deve ter pelo menos 2 caracteres',
    'string.max': 'Nome deve ter no máximo 255 caracteres',
    'any.required': 'Nome é obrigatório',
  }),
  cnpj: Joi.string()
    .pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'CNPJ deve estar no formato 00.000.000/0000-00',
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
  constructor() {
    super('clientes');
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
   * Formatar CNPJ para armazenamento
   */
  private formatCNPJ(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  }

  /**
   * Validar CNPJ usando algoritmo oficial
   */
  private validateCNPJ(cnpj: string): boolean {
    const cleanCNPJ = this.formatCNPJ(cnpj);
    
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

    // Validar CNPJ
    if (clienteData.cnpj && !this.validateCNPJ(clienteData.cnpj)) {
      return {
        success: false,
        error: 'CNPJ inválido',
      };
    }

    // Verificar se CNPJ já existe
    if (clienteData.cnpj) {
      const existingCliente = await this.findBy({ cnpj: clienteData.cnpj });
      if (existingCliente.success && existingCliente.data!.length > 0) {
        return {
          success: false,
          error: 'Cliente com este CNPJ já existe',
        };
      }
    }

    // Preparar dados para inserção
    const dataToInsert = {
      ...clienteData,
      cnpj: clienteData.cnpj ? this.formatCNPJ(clienteData.cnpj) : undefined,
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

    // Validar CNPJ se fornecido
    if (updates.cnpj && !this.validateCNPJ(updates.cnpj)) {
      return {
        success: false,
        error: 'CNPJ inválido',
      };
    }

    // Verificar se CNPJ já existe em outro cliente
    if (updates.cnpj) {
      const existingClientes = await this.findBy({ cnpj: updates.cnpj });
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
      cnpj: updates.cnpj ? this.formatCNPJ(updates.cnpj) : undefined,
    };

    return this.update(id, dataToUpdate);
  }

  /**
   * Buscar cliente por CNPJ
   */
  async findByCNPJ(cnpj: string): Promise<ApiResponse<ICliente>> {
    const cleanCNPJ = this.formatCNPJ(cnpj);
    const result = await this.findBy({ cnpj: cleanCNPJ });
    
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

  /**
   * Buscar clientes por nome (busca parcial)
   */
  async searchByName(nome: string): Promise<ApiResponse<ICliente[]>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .ilike('nome', `%${nome}%`)
        .order('nome');

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
   * Obter estatísticas dos clientes
   */
  async getStats(): Promise<ApiResponse<{ total: number; ativos: number }>> {
    try {
      const totalResult = await this.count();
      if (!totalResult.success) {
        return totalResult;
      }

      // Aqui você pode adicionar lógica para calcular clientes ativos
      // Por enquanto, retornamos o total como ativos
      return {
        success: true,
        data: {
          total: totalResult.data!,
          ativos: totalResult.data!,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}
