/**
 * Testes para o modelo Cliente
 */

import { Cliente } from '../../src/models/Cliente';
import { Cliente as ICliente } from '../../src/types';

/**
 * BANCO SIMULADO — nada aqui encosta no MySQL de verdade.
 *
 * O mock anterior era do SUPABASE, de quando o projeto usava aquele banco. Como
 * o Cliente hoje vai por DatabaseService → MySQLDatabaseService → config/mysql,
 * aquele mock não interceptava nada: o teste "deve criar cliente com dados
 * válidos" gravava um registro REAL na base de produção a cada rodada (foi o
 * que aconteceu em 03/08/2026 — um "Cliente Teste" cadastrado sem querer).
 *
 * Simular o config/mysql resolve na raiz, porque é o único ponto por onde toda
 * consulta passa: `executeQuery` para leitura e `mysqlPool.getConnection()`
 * para a escrita do create.
 */
const COLUNAS_CLIENTES = [
  'id', 'razao_social', 'nome_fantasia', 'cnpj_limpo', 'email', 'telefone',
  'tipo_empresa', 'regime_tributario', 'created_at', 'updated_at',
];

const CLIENTE_CRIADO = {
  id: 'test-id',
  razao_social: 'Cliente Teste',
  cnpj_limpo: '11222333000181',
  email: 'teste@exemplo.com',
  created_at: new Date(),
  updated_at: new Date(),
};

/**
 * Um cliente SEMEADO na base falsa. Existe porque dois testes fazem exigências
 * opostas: o de criação precisa que o CNPJ ainda NÃO exista (senão o model
 * recusa por duplicidade) e o de busca precisa encontrar alguém. Um banco que
 * responde igual a tudo não atende os dois — este responde pelo CNPJ, como o
 * banco real faria.
 */
const CNPJ_EXISTENTE = '12345678000190';
const CLIENTE_EXISTENTE = {
  id: 'cliente-existente',
  razao_social: 'Empresa Já Cadastrada',
  cnpj_limpo: CNPJ_EXISTENTE,
  email: 'contato@existente.com',
  created_at: new Date(),
  updated_at: new Date(),
};

/** Responde como o banco responderia, olhando o SQL e os parâmetros. */
const responder = (sql: string, params: any[] = []): any[] => {
  if (/^\s*SHOW COLUMNS/i.test(sql)) {
    return COLUNAS_CLIENTES.map(Field => ({ Field }));
  }
  if (/COUNT\(/i.test(sql)) return [{ total: 1, count: 1 }];
  // O create relê o registro recém-inserido pelo id
  if (/WHERE\s+`?id`?\s*=/i.test(sql)) return [CLIENTE_CRIADO];
  // Busca por CNPJ: só o semeado existe
  if (/cnpj_limpo/i.test(sql)) {
    return params.includes(CNPJ_EXISTENTE) ? [CLIENTE_EXISTENTE] : [];
  }
  if (/^\s*SELECT/i.test(sql)) return [CLIENTE_EXISTENTE];
  return [];
};

jest.mock('../../src/config/mysql', () => {
  const conexao = {
    execute: jest.fn(async (sql: string, params?: any[]) => [responder(sql, params), []]),
    release: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
  };
  return {
    __esModule: true,
    executeQuery: jest.fn(async (sql: string, params?: any[]) => responder(sql, params)),
    executeTransaction: jest.fn(async (fn: any) => fn(conexao)),
    getConnection: jest.fn(async () => conexao),
    mysqlPool: { getConnection: jest.fn(async () => conexao) },
    testMySQLConnection: jest.fn(async () => true),
    default: { getConnection: jest.fn(async () => conexao) },
  };
});

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
      // O texto exato ganhou o motivo entre parênteses ("dígito verificador
      // incorreto") depois que o teste foi escrito, e a asserção literal
      // quebrou. O contrato que importa é recusar dizendo que o CNPJ é
      // inválido — o detalhe pode ser refinado sem quebrar o teste de novo.
      expect(result.error).toContain('CNPJ inválido');
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
