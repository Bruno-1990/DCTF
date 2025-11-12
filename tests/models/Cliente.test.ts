/**
 * Testes para o modelo Cliente
 */

import { Cliente } from '../../src/models/Cliente';
import { Cliente as ICliente } from '../../src/types';

// Mock do Supabase
jest.mock('../../src/config/database', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: {
              id: 'test-id',
              razao_social: 'Cliente Teste',
              cnpj_limpo: '12345678000195',
              cnpj: '12.345.678/0001-95',
              email: 'teste@exemplo.com',
              created_at: new Date(),
              updated_at: new Date(),
            },
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: {
                id: 'test-id',
                razao_social: 'Cliente Atualizado',
                cnpj_limpo: '12345678000195',
                cnpj: '12.345.678/0001-95',
                email: 'atualizado@exemplo.com',
                created_at: new Date(),
                updated_at: new Date(),
              },
              error: null,
            })),
          })),
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: null,
        })),
      })),
    })),
  },
}));

describe('Cliente Model', () => {
  let clienteModel: Cliente;

  beforeEach(() => {
    clienteModel = new Cliente();
  });

  describe('Validação de CNPJ', () => {
    it('deve validar CNPJ válido', () => {
      const cnpjValido = '11.222.333/0001-81';
      const result = (clienteModel as any).validateCNPJ(cnpjValido);
      expect(result).toBe(true);
    });

    it('deve rejeitar CNPJ inválido', () => {
      const cnpjInvalido = '11.222.333/0001-82';
      const result = (clienteModel as any).validateCNPJ(cnpjInvalido);
      expect(result).toBe(false);
    });

    it('deve rejeitar CNPJ com dígitos iguais', () => {
      const cnpjInvalido = '11.111.111/1111-11';
      const result = (clienteModel as any).validateCNPJ(cnpjInvalido);
      expect(result).toBe(false);
    });
  });

  describe('Formatação de CNPJ', () => {
    it('deve limpar CNPJ removendo caracteres especiais', () => {
      const cnpjFormatado = '11.222.333/0001-81';
      const result = (clienteModel as any).cleanCNPJ(cnpjFormatado);
      expect(result).toBe('11222333000181');
    });
  });

  describe('Criação de Cliente', () => {
    it('deve criar cliente com dados válidos', async () => {
      const clienteData: Partial<ICliente> = {
        razao_social: 'Cliente Teste',
        cnpj_limpo: '11222333000181',
        email: 'teste@exemplo.com',
      };

      const result = await clienteModel.createCliente(clienteData);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar cliente com CNPJ inválido', async () => {
      const clienteData: Partial<ICliente> = {
        razao_social: 'Cliente Teste',
        cnpj_limpo: '11222333000182', // CNPJ inválido
        email: 'teste@exemplo.com',
      };

      const result = await clienteModel.createCliente(clienteData);
      expect(result.success).toBe(false);
      expect(result.error).toBe('CNPJ inválido');
    });

    it('deve rejeitar cliente sem nome', async () => {
      const clienteData: Partial<ICliente> = {
        cnpj_limpo: '11222333000181',
        email: 'teste@exemplo.com',
      };

      const result = await clienteModel.createCliente(clienteData);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Razão Social é obrigatória');
    });

    it('deve rejeitar cliente com email inválido', async () => {
      const clienteData: Partial<ICliente> = {
        razao_social: 'Cliente Teste',
        cnpj_limpo: '11222333000181',
        email: 'email-invalido',
      };

      const result = await clienteModel.createCliente(clienteData);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email deve ter um formato válido');
    });
  });

  describe('Busca por CNPJ', () => {
    it('deve buscar cliente por CNPJ', async () => {
      const cnpj = '12.345.678/0001-90';
      const result = await clienteModel.findByCNPJ(cnpj);
      expect(result.success).toBe(true);
    });
  });

  describe('Busca por Nome', () => {
    it('deve buscar clientes por nome', async () => {
      const nome = 'Cliente';
      const result = await clienteModel.searchByName(nome);
      expect(result.success).toBe(true);
    });
  });

  describe('Estatísticas', () => {
    it('deve retornar estatísticas dos clientes', async () => {
      const result = await clienteModel.getStats();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('ativos');
    });
  });
});
