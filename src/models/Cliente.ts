/**
 * Modelo Cliente - Representa um cliente do sistema DCTF
 * Implementa validações e operações CRUD específicas
 */

import { DatabaseService, SupabaseAdapterType } from '../services/DatabaseService';
import { Cliente as ICliente, ClienteSocio, ApiResponse } from '../types';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { ReceitaWSService, ReceitaWSResponseOk } from '../services/ReceitaWSService';

// Schema de validação para Cliente
// IMPORTANTE: Apenas cnpj_limpo é salvo no banco. CNPJ formatado é gerado apenas na exibição.
const clienteCreateSchema = Joi.object({
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
  email: Joi.string().email().optional().allow('', null).messages({
    'string.email': 'Email deve ter um formato válido',
  }),
  // Telefone da empresa pode vir em múltiplos formatos (ex: "(27) 2104-8300 / ...")
  telefone: Joi.string().max(255).optional().allow('', null),
  endereco: Joi.string().max(500).optional().allow('', null).messages({
    'string.max': 'Endereço deve ter no máximo 500 caracteres',
  }),
}).unknown(true);

const clienteUpdateSchema = Joi.object({
  razao_social: Joi.string().min(2).max(255).optional(),
  cnpj_limpo: Joi.string().pattern(/^\d{14}$/).optional(),
  email: Joi.string().email().optional().allow('', null),
  telefone: Joi.string().max(255).optional().allow('', null),
  endereco: Joi.string().max(500).optional().allow('', null),
}).unknown(true);

export class Cliente extends DatabaseService<ICliente> {
  private static mockStore: ICliente[] = [];
  private receitaWs = new ReceitaWSService();
  private static tableColumnsCache: Record<string, Set<string>> = {};
  constructor() {
    super('clientes');
  }

  private isNoSuchTableError(err: any): boolean {
    const code = err?.code;
    const errno = err?.errno;
    return code === 'ER_NO_SUCH_TABLE' || errno === 1146;
  }

  private async getTableColumns(table: string): Promise<Set<string>> {
    const key = String(table || '').trim();
    if (!key) return new Set();
    if (Cliente.tableColumnsCache[key]) return Cliente.tableColumnsCache[key];

    try {
      const resp = await this.executeCustomQuery<any>(`SHOW COLUMNS FROM \`${key}\``);
      const cols = new Set<string>();
      if (resp.success && Array.isArray(resp.data)) {
        for (const row of resp.data) {
          const field = row?.Field || row?.field;
          if (field) cols.add(String(field));
        }
      }
      Cliente.tableColumnsCache[key] = cols;
      return cols;
    } catch {
      const empty = new Set<string>();
      Cliente.tableColumnsCache[key] = empty;
      return empty;
    }
  }

  private async filterToExistingColumns(table: string, obj: Record<string, any>): Promise<Record<string, any>> {
    const cols = await this.getTableColumns(table);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (cols.has(k)) out[k] = v;
    }
    return out;
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
      // Usa MySQL através do DatabaseService
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
      // Usa MySQL através do DatabaseService
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
      // Usa MySQL através do adapter Supabase
      // Type assertion necessária devido a problema de inferência TypeScript
      const adapter = this.supabase as any;
      const result = await adapter
        .from(this.tableName)
        .select('*')
        .ilike('razao_social', `%${nome}%`)
        .order('razao_social');
      const { data, error } = result;

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
      // Usa MySQL através do DatabaseService
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
    const { error } = clienteCreateSchema.validate(data);
    return {
      isValid: !error,
      error: error?.details[0]?.message,
    };
  }

  private validateClienteUpdate(data: Partial<ICliente>): { isValid: boolean; error?: string } {
    const { error } = clienteUpdateSchema.validate(data);
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
      fantasia: row.fantasia || undefined,
      tipo_estabelecimento: row.tipo_estabelecimento || undefined,
      situacao_cadastral: row.situacao_cadastral || undefined,
      porte: row.porte || undefined,
      natureza_juridica: row.natureza_juridica || undefined,
      // Normalizar datas DATE para string YYYY-MM-DD (MySQL retorna como Date object)
      abertura: row.abertura ? (row.abertura instanceof Date ? row.abertura.toISOString().slice(0, 10) : String(row.abertura).slice(0, 10)) : undefined,
      data_situacao: row.data_situacao ? (row.data_situacao instanceof Date ? row.data_situacao.toISOString().slice(0, 10) : String(row.data_situacao).slice(0, 10)) : undefined,
      motivo_situacao: row.motivo_situacao || undefined,
      situacao_especial: row.situacao_especial || undefined,
      data_situacao_especial: row.data_situacao_especial ? (row.data_situacao_especial instanceof Date ? row.data_situacao_especial.toISOString().slice(0, 10) : String(row.data_situacao_especial).slice(0, 10)) : undefined,
      efr: row.efr || undefined,
      atividade_principal_code: row.atividade_principal_code || undefined,
      atividade_principal_text: row.atividade_principal_text || undefined,
      atividades_secundarias: row.atividades_secundarias || undefined,
      logradouro: row.logradouro || undefined,
      numero: row.numero || undefined,
      complemento: row.complemento || undefined,
      bairro: row.bairro || undefined,
      municipio: row.municipio || undefined,
      uf: row.uf || undefined,
      cep: row.cep || undefined,
      receita_email: row.receita_email || undefined,
      receita_telefone: row.receita_telefone || undefined,
      tipo_empresa: row.tipo_empresa || undefined,
      capital_social: row.capital_social ?? undefined,
      regime_tributario: row.regime_tributario || undefined,
      simples_optante: row.simples_optante === true || row.simples_optante === 1 ? true : (row.simples_optante === false || row.simples_optante === 0 ? false : undefined),
      // Normalizar datas de regimes para string YYYY-MM-DD
      simples_data_opcao: row.simples_data_opcao ? (row.simples_data_opcao instanceof Date ? row.simples_data_opcao.toISOString().slice(0, 10) : String(row.simples_data_opcao).slice(0, 10)) : undefined,
      simples_data_exclusao: row.simples_data_exclusao ? (row.simples_data_exclusao instanceof Date ? row.simples_data_exclusao.toISOString().slice(0, 10) : String(row.simples_data_exclusao).slice(0, 10)) : undefined,
      simei_optante: row.simei_optante ?? undefined,
      simei_data_opcao: row.simei_data_opcao ? (row.simei_data_opcao instanceof Date ? row.simei_data_opcao.toISOString().slice(0, 10) : String(row.simei_data_opcao).slice(0, 10)) : undefined,
      simei_data_exclusao: row.simei_data_exclusao ? (row.simei_data_exclusao instanceof Date ? row.simei_data_exclusao.toISOString().slice(0, 10) : String(row.simei_data_exclusao).slice(0, 10)) : undefined,
      receita_ws_status: row.receita_ws_status ?? undefined,
      receita_ws_message: row.receita_ws_message ?? undefined,
      receita_ws_consulta_em: row.receita_ws_consulta_em ?? undefined,
      receita_ws_ultima_atualizacao: row.receita_ws_ultima_atualizacao ?? undefined,
      receita_ws_payload: row.receita_ws_payload ?? undefined,
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
   * Normalizar telefone: organiza múltiplos telefones da ReceitaWS
   * - Se vier múltiplos separados por "/" ou "|", pega o primeiro e limpa
   * - Remove espaços extras e limita a 255 caracteres
   */
  private normalizeTelefone(telefone: any): string | null {
    if (!telefone) return null;
    const str = String(telefone).trim();
    if (!str) return null;

    // Se tiver múltiplos telefones separados por "/" ou "|", pegar o primeiro
    const parts = str.split(/[\/|]/).map((p: string) => p.trim()).filter(Boolean);
    const primeiro = parts[0] || str;

    // Limpar espaços extras e limitar tamanho
    const normalized = primeiro.replace(/\s+/g, ' ').trim();
    return normalized.length > 255 ? normalized.substring(0, 252) + '...' : normalized;
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
   * @param clienteData Dados do cliente
   * @param options Opções adicionais (skipCNPJValidation: pular validação do dígito verificador para uploads em massa)
   */
  async createCliente(
    clienteData: Partial<ICliente>, 
    options?: { skipCNPJValidation?: boolean }
  ): Promise<ApiResponse<ICliente>> {
    // SEMPRE limpar CNPJ antes de processar (aceita formatado ou limpo)
    if (clienteData.cnpj_limpo) {
      clienteData.cnpj_limpo = String(clienteData.cnpj_limpo).replace(/\D/g, '');
    }
    
    console.log(`[Cliente.createCliente] Dados recebidos:`, {
      cnpj_limpo: clienteData.cnpj_limpo,
      razao_social: clienteData.razao_social,
      email: clienteData.email,
      telefone: clienteData.telefone,
      skipCNPJValidation: options?.skipCNPJValidation
    });
    
    // Validar dados
    const validation = this.validateCliente(clienteData);
    if (!validation.isValid) {
      console.error(`[Cliente.createCliente] ❌ Validação falhou:`, validation.error);
      return {
        success: false,
        error: validation.error,
      };
    }

    // Validar CNPJ usando cnpj_limpo (pode ser pulado para uploads em massa)
    if (!options?.skipCNPJValidation && clienteData.cnpj_limpo && !this.validateCNPJ(clienteData.cnpj_limpo)) {
      console.error(`[Cliente.createCliente] ❌ CNPJ inválido (dígito verificador): ${clienteData.cnpj_limpo}`);
      return {
        success: false,
        error: 'CNPJ inválido (dígito verificador incorreto)',
      };
    } else if (options?.skipCNPJValidation) {
      console.log(`[Cliente.createCliente] ⚠️ Validação do dígito verificador do CNPJ pulada (upload em massa)`);
    }

    // Usa MySQL através do DatabaseService
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
      id: clienteData.id || uuidv4(),
      razao_social: clienteData.razao_social,
      cnpj_limpo: clienteData.cnpj_limpo, // Sempre limpo
      // Não salvar cnpj formatado no banco, será gerado na exibição
      email: clienteData.email || undefined,
      telefone: clienteData.telefone ? this.normalizeTelefone(clienteData.telefone) : undefined,
      endereco: clienteData.endereco || undefined,
    };

    const safeInsert = await this.filterToExistingColumns('clientes', dataToInsert);
    const result = await this.create(safeInsert as any);
    
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
    
    // Validar dados (update parcial)
    const validation = this.validateClienteUpdate(updates);
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

    // Normalizar telefone se presente
    if (dataToUpdate.telefone !== undefined) {
      dataToUpdate.telefone = this.normalizeTelefone(dataToUpdate.telefone);
    }

    // Normalizar datas para formato DATE (YYYY-MM-DD) antes de salvar
    const normalizeDateForMySQL = (value: any): any => {
      if (!value) return value;
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (typeof value === 'string') {
        // Se for string ISO timestamp, extrair apenas a data
        if (value.includes('T') && (value.includes('Z') || value.includes('+'))) {
          return value.slice(0, 10);
        }
        // Se já for YYYY-MM-DD, manter
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value;
        }
      }
      return value;
    };

    // Normalizar timestamps para formato MySQL (Date object ou string MySQL)
    const normalizeTimestampForMySQL = (value: any): any => {
      if (!value) return value;
      if (value instanceof Date) {
        // Date object é aceito pelo MySQL, manter
        return value;
      }
      if (typeof value === 'string') {
        // Se for string ISO timestamp (com T e Z), converter para Date
        if (value.includes('T') && (value.includes('Z') || value.includes('+'))) {
          return new Date(value);
        }
        // Se já for formato MySQL (YYYY-MM-DD HH:MM:SS), manter
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
          return value;
        }
      }
      return value;
    };

    const dateFields = ['abertura', 'data_situacao', 'data_situacao_especial', 'simples_data_opcao', 'simples_data_exclusao', 'simei_data_opcao', 'simei_data_exclusao'];
    for (const field of dateFields) {
      if (dataToUpdate[field] !== undefined && dataToUpdate[field] !== null) {
        dataToUpdate[field] = normalizeDateForMySQL(dataToUpdate[field]);
      }
    }

    // Normalizar timestamps também no update
    const timestampFields = ['receita_ws_consulta_em', 'receita_ws_ultima_atualizacao'];
    for (const field of timestampFields) {
      if (dataToUpdate[field] !== undefined && dataToUpdate[field] !== null) {
        dataToUpdate[field] = normalizeTimestampForMySQL(dataToUpdate[field]);
      }
    }

    const safeUpdate = await this.filterToExistingColumns('clientes', dataToUpdate);
    const result = await this.update(id, safeUpdate as any);
    
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

    // Usa MySQL através do DatabaseService
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

  /**
   * Listar sócios (QSA) de um cliente
   */
  async listarSocios(clienteId: string): Promise<ApiResponse<ClienteSocio[]>> {
    try {
      const query = 'SELECT * FROM `clientes_socios` WHERE `cliente_id` = ? ORDER BY `created_at` ASC';
      const resp = await this.executeCustomQuery<any>(query, [clienteId]);
      if (!resp.success) return resp as any;
      const socios: ClienteSocio[] = (resp.data || []).map((r: any) => ({
        id: r.id,
        cliente_id: r.cliente_id,
        nome: r.nome,
        cpf: r.cpf ?? null,
        qual: r.qual ?? null,
        participacao_percentual: r.participacao_percentual ? parseFloat(String(r.participacao_percentual)) : null,
        participacao_valor: r.participacao_valor ? parseFloat(String(r.participacao_valor)) : null,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
      }));
      return { success: true, data: socios };
    } catch (e: any) {
      if (this.isNoSuchTableError(e)) {
        // Migração ainda não aplicada: não quebrar UX
        return { success: true, data: [] };
      }
      return { success: false, error: e?.message || 'Erro ao listar sócios' };
    }
  }

  /**
   * Lista DISTINCT de sócios cadastrados (para select box no frontend)
   */
  async listarSociosDistinct(): Promise<ApiResponse<Array<{ nome: string }>>> {
    try {
      const resp = await this.executeCustomQuery<{ nome: string }>(
        'SELECT DISTINCT `nome` FROM `clientes_socios` WHERE `nome` IS NOT NULL AND TRIM(`nome`) <> "" ORDER BY `nome` ASC'
      );
      if (!resp.success) return resp as any;
      return { success: true, data: resp.data || [] };
    } catch (e: any) {
      if (this.isNoSuchTableError(e)) {
        return { success: true, data: [] };
      }
      return { success: false, error: e?.message || 'Erro ao listar sócios' };
    }
  }

  /**
   * Busca IDs de clientes que possuem um sócio com o nome exato (case-insensitive no MySQL)
   * Usado para filtro na listagem de clientes.
   * Retorna também a porcentagem de participação do sócio em cada cliente.
   */
  async buscarClienteIdsPorSocioNome(nomeSocio: string): Promise<ApiResponse<string[]>> {
    try {
      const nome = String(nomeSocio || '').trim();
      if (!nome) return { success: true, data: [] };

      const resp = await this.executeCustomQuery<{ cliente_id: string }>(
        'SELECT DISTINCT `cliente_id` FROM `clientes_socios` WHERE LOWER(TRIM(`nome`)) = LOWER(TRIM(?))',
        [nome]
      );
      if (!resp.success) return resp as any;
      return { success: true, data: (resp.data || []).map((r) => r.cliente_id).filter(Boolean) };
    } catch (e: any) {
      if (this.isNoSuchTableError(e)) {
        return { success: true, data: [] };
      }
      return { success: false, error: e?.message || 'Erro ao filtrar clientes por sócio' };
    }
  }

  /**
   * Busca clientes e porcentagem de participação de um sócio específico
   * Retorna um mapa de cliente_id -> participacao_percentual
   */
  async buscarParticipacaoSocioPorNome(nomeSocio: string): Promise<ApiResponse<Record<string, number | null>>> {
    try {
      const nome = String(nomeSocio || '').trim();
      if (!nome) return { success: true, data: {} };

      const resp = await this.executeCustomQuery<{ cliente_id: string; participacao_percentual: number | null }>(
        'SELECT `cliente_id`, `participacao_percentual` FROM `clientes_socios` WHERE LOWER(TRIM(`nome`)) = LOWER(TRIM(?))',
        [nome]
      );
      if (!resp.success) return resp as any;
      
      const participacoes: Record<string, number | null> = {};
      (resp.data || []).forEach((r) => {
        if (r.cliente_id) {
          participacoes[r.cliente_id] = r.participacao_percentual !== null && r.participacao_percentual !== undefined
            ? parseFloat(String(r.participacao_percentual))
            : null;
        }
      });
      
      return { success: true, data: participacoes };
    } catch (e: any) {
      if (this.isNoSuchTableError(e)) {
        return { success: true, data: {} };
      }
      return { success: false, error: e?.message || 'Erro ao buscar participação do sócio' };
    }
  }

  private parseBRDateToISO(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (!s) return null;
    
    // ReceitaWS costuma retornar DD/MM/AAAA
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const dd = m[1];
      const mm = m[2];
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    
    // Se já vier ISO-like (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss...), extrair apenas a data
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      // Retornar apenas YYYY-MM-DD (primeiros 10 caracteres)
      return s.slice(0, 10);
    }
    
    return null;
  }

  private parseMoney(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  private montarEnderecoLinha(d: ReceitaWSResponseOk): string | null {
    const parts: string[] = [];
    const logradouro = (d.logradouro || '').trim();
    const numero = (d.numero || '').trim();
    const complemento = (d.complemento || '').trim();
    const bairro = (d.bairro || '').trim();
    const municipio = (d.municipio || '').trim();
    const uf = (d.uf || '').trim();
    const cep = (d.cep || '').trim();

    if (logradouro) parts.push(logradouro);
    if (numero) parts.push(numero);
    if (complemento) parts.push(complemento);
    const linha1 = parts.join(', ');

    const linha2Parts: string[] = [];
    if (bairro) linha2Parts.push(bairro);
    if (municipio || uf) linha2Parts.push([municipio, uf].filter(Boolean).join('/'));
    if (cep) linha2Parts.push(cep);
    const linha2 = linha2Parts.join(' - ');

    return [linha1, linha2].filter(Boolean).join(' | ') || null;
  }

  /**
   * Consulta a ReceitaWS e retorna o payload (sem salvar)
   */
  async consultarReceitaWS(cnpj: string): Promise<ApiResponse<ReceitaWSResponseOk>> {
    try {
      const data = await this.receitaWs.consultarCNPJ(cnpj);
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro ao consultar ReceitaWS' };
    }
  }

  /**
   * Importa/atualiza cadastro do cliente via ReceitaWS (inclui sócios)
   * - Se cliente não existir, cria
   * - Se existir, atualiza (com controle de overwrite)
   */
  async importarReceitaWS(
    cnpj: string,
    options?: { overwrite?: boolean }
  ): Promise<ApiResponse<ICliente> & { meta?: any }> {
    const overwrite = options?.overwrite === true;
    const cnpjLimpo = this.cleanCNPJ(cnpj);
    if (cnpjLimpo.length !== 14) {
      return { success: false, error: 'CNPJ inválido. Deve conter 14 dígitos.' };
    }

    const receita = await this.receitaWs.consultarCNPJ(cnpjLimpo);

    // Buscar cliente existente (se houver)
    const existente = await this.findBy({ cnpj_limpo: cnpjLimpo });
    const clienteExistente = existente.success && existente.data && existente.data.length > 0 ? existente.data[0] : null;

    const normalizarValor = (v: any) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (v instanceof Date) return v.toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const s = v.trim();
        // tentar normalizar datas ISO simples
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s;
      }
      // JSON
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    };

    const normalizarJson = (v: any) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return null;
        try {
          return JSON.parse(s);
        } catch {
          return s;
        }
      }
      return v;
    };

    const listarSociosRaw = async (clienteId: string): Promise<Array<{ nome: string; qual: string | null }>> => {
      try {
        const resp = await this.executeCustomQuery<any>(
          'SELECT `nome`,`qual` FROM `clientes_socios` WHERE `cliente_id` = ?',
          [clienteId]
        );
        if (!resp.success) return [];
        return (resp.data || []).map((r: any) => ({
          nome: String(r.nome || '').trim(),
          qual: r.qual !== undefined && r.qual !== null ? String(r.qual).trim() : null,
        })).filter((r: any) => r.nome);
      } catch (e: any) {
        if (this.isNoSuchTableError(e)) return [];
        return [];
      }
    };

    const agora = new Date();
    const aberturaISO = this.parseBRDateToISO(receita.abertura);
    const dataSituacaoISO = this.parseBRDateToISO(receita.data_situacao);
    const dataSituacaoEspecialISO = this.parseBRDateToISO(receita.data_situacao_especial);
    const simplesOpcaoISO = this.parseBRDateToISO(receita.simples?.data_opcao || null);
    const simplesExclusaoISO = this.parseBRDateToISO(receita.simples?.data_exclusao || null);
    const simeiOpcaoISO = this.parseBRDateToISO(receita.simei?.data_opcao || null);
    const simeiExclusaoISO = this.parseBRDateToISO(receita.simei?.data_exclusao || null);

    const atividadePrincipal = Array.isArray(receita.atividade_principal) ? receita.atividade_principal[0] : undefined;

    const updateFields: any = {
      razao_social: (receita.nome || '').trim() || (clienteExistente?.razao_social || ''),
      fantasia: receita.fantasia || null,
      tipo_estabelecimento: receita.tipo || null,
      situacao_cadastral: receita.situacao || null,
      porte: receita.porte || null,
      natureza_juridica: receita.natureza_juridica || null,
      abertura: aberturaISO,
      data_situacao: dataSituacaoISO,
      motivo_situacao: receita.motivo_situacao || null,
      situacao_especial: receita.situacao_especial || null,
      data_situacao_especial: dataSituacaoEspecialISO,
      efr: receita.efr || null,
      atividade_principal_code: atividadePrincipal?.code || null,
      atividade_principal_text: atividadePrincipal?.text || null,
      atividades_secundarias: Array.isArray(receita.atividades_secundarias) ? receita.atividades_secundarias : null,
      logradouro: receita.logradouro || null,
      numero: receita.numero || null,
      complemento: receita.complemento || null,
      bairro: receita.bairro || null,
      municipio: receita.municipio || null,
      uf: receita.uf || null,
      cep: receita.cep || null,
      receita_email: receita.email || null,
      receita_telefone: receita.telefone || null,
      tipo_empresa: receita.tipo ? (receita.tipo.toUpperCase() === 'MATRIZ' ? 'Matriz' : receita.tipo.toUpperCase() === 'FILIAL' ? 'Filial' : null) : null,
      capital_social: this.parseMoney(receita.capital_social),
      regime_tributario: receita.simples?.optante === true ? 'Simples Nacional' : null, // Definir automaticamente se for optante do Simples
      simples_optante: receita.simples?.optante ?? null,
      simples_data_opcao: simplesOpcaoISO,
      simples_data_exclusao: simplesExclusaoISO,
      simei_optante: receita.simei?.optante ?? null,
      simei_data_opcao: simeiOpcaoISO,
      simei_data_exclusao: simeiExclusaoISO,
      receita_ws_status: receita.status || null,
      receita_ws_message: null,
      receita_ws_consulta_em: agora, // Será normalizado abaixo
      receita_ws_ultima_atualizacao: receita.ultima_atualizacao ? new Date(receita.ultima_atualizacao) : agora, // Será normalizado abaixo
      receita_ws_payload: receita as any,
    };

    // Compat: preencher `endereco` (linha única) se vazio ou overwrite
    const enderecoLinha = this.montarEnderecoLinha(receita);
    if (enderecoLinha && (overwrite || !clienteExistente?.endereco)) {
      updateFields.endereco = enderecoLinha;
    }

    // Compat: preencher email/telefone "manual" apenas se vazio ou overwrite
    if (receita.email && (overwrite || !clienteExistente?.email)) {
      updateFields.email = receita.email;
    }
    if (receita.telefone && (overwrite || !clienteExistente?.telefone)) {
      // Normalizar telefone (pode vir múltiplos concatenados da ReceitaWS)
      updateFields.telefone = this.normalizeTelefone(receita.telefone);
    }

    // Normalizar datas para formato DATE (YYYY-MM-DD) antes de salvar
    // MySQL DATE não aceita timestamps ISO completos
    const normalizeDateForMySQL = (value: any): any => {
      if (!value) return value;
      if (value instanceof Date) {
        // Se for Date, extrair apenas YYYY-MM-DD
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (typeof value === 'string') {
        // Se for string ISO timestamp, extrair apenas a data
        const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          return value.slice(0, 10); // YYYY-MM-DD
        }
      }
      return value;
    };

    // Normalizar timestamps para formato MySQL (YYYY-MM-DD HH:MM:SS)
    // MySQL TIMESTAMP aceita Date objects, mas se vier como string ISO, precisa converter
    const normalizeTimestampForMySQL = (value: any): any => {
      if (!value) return value;
      if (value instanceof Date) {
        // Date object é aceito pelo MySQL, manter como está
        return value;
      }
      if (typeof value === 'string') {
        // Se for string ISO timestamp (com T e Z), converter para Date
        if (value.includes('T') && (value.includes('Z') || value.includes('+'))) {
          return new Date(value);
        }
        // Se já for formato MySQL (YYYY-MM-DD HH:MM:SS), manter
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
          return value;
        }
      }
      return value;
    };

    // Aplicar normalização em campos de data (DATE)
    const dateFields = ['abertura', 'data_situacao', 'data_situacao_especial', 'simples_data_opcao', 'simples_data_exclusao', 'simei_data_opcao', 'simei_data_exclusao'];
    for (const field of dateFields) {
      if (updateFields[field] !== undefined && updateFields[field] !== null) {
        updateFields[field] = normalizeDateForMySQL(updateFields[field]);
      }
    }

    // Aplicar normalização em campos de timestamp (TIMESTAMP)
    const timestampFields = ['receita_ws_consulta_em', 'receita_ws_ultima_atualizacao'];
    for (const field of timestampFields) {
      if (updateFields[field] !== undefined && updateFields[field] !== null) {
        updateFields[field] = normalizeTimestampForMySQL(updateFields[field]);
      }
    }

    // Compatibilidade com schema antigo: remover campos que não existem na tabela `clientes`
    // (evita ER_BAD_FIELD_ERROR "Unknown column ...")
    const updateFieldsSafe = await this.filterToExistingColumns('clientes', updateFields);

    // ---------------------------------------------------------------------
    // Detecção de alterações (para informar "mudou" vs "nada mudou")
    // ---------------------------------------------------------------------
    type ChangeItem = { field: string; before: any; after: any };

    const ignoredFieldsForDiff = new Set<string>([
      // payload pode ser grande e variar em detalhes sem relevância visual
      'receita_ws_payload',
      // consulta_em mudaria sempre; só atualizamos quando houver mudanças reais
      'receita_ws_consulta_em',
      // message é sempre null neste fluxo
      'receita_ws_message',
    ]);

    const changes: ChangeItem[] = [];
    let sociosChanged = false;
    let sociosBefore: Array<{ nome: string; qual: string | null }> = [];
    let sociosAfter: Array<{ nome: string; qual: string | null }> = [];
    let sociosAdded = 0;
    let sociosRemoved = 0;

    if (clienteExistente) {
      // Comparar campos
      const keys = Object.keys(updateFieldsSafe).filter((k) => updateFieldsSafe[k] !== undefined);
      for (const k of keys) {
        if (ignoredFieldsForDiff.has(k)) continue;
        const beforeRaw = (clienteExistente as any)[k];
        const afterRaw = updateFieldsSafe[k];

        // JSON column
        const isJson = k === 'atividades_secundarias';
        const before = isJson ? normalizarJson(beforeRaw) : beforeRaw;
        const after = isJson ? normalizarJson(afterRaw) : afterRaw;

        const b = normalizarValor(before);
        const a = normalizarValor(after);
        if (b !== a) {
          changes.push({ field: k, before: beforeRaw, after: afterRaw });
        }
      }

      // Comparar sócios
      sociosBefore = await listarSociosRaw(clienteExistente.id);
      sociosAfter = (Array.isArray(receita.qsa) ? receita.qsa : [])
        .map((s) => ({
          nome: String((s as any)?.nome || '').trim(),
          qual: (s as any)?.qual ? String((s as any).qual).trim() : null,
        }))
        .filter((s) => s.nome);

      const key = (s: { nome: string; qual: string | null }) => `${s.nome}||${s.qual || ''}`;
      const beforeSet = new Set(sociosBefore.map(key));
      const afterSet = new Set(sociosAfter.map(key));
      sociosAdded = [...afterSet].filter((x) => !beforeSet.has(x)).length;
      sociosRemoved = [...beforeSet].filter((x) => !afterSet.has(x)).length;
      sociosChanged = sociosAdded > 0 || sociosRemoved > 0;
    } else {
      // Cliente novo: consideramos "criado" com alterações (não há before)
      sociosAfter = (Array.isArray(receita.qsa) ? receita.qsa : [])
        .map((s) => ({
          nome: String((s as any)?.nome || '').trim(),
          qual: (s as any)?.qual ? String((s as any).qual).trim() : null,
        }))
        .filter((s) => s.nome);
    }

    const hasChanges = !clienteExistente || changes.length > 0 || sociosChanged;
    if (clienteExistente && !hasChanges) {
      const clienteMapeado = this.mapSupabaseRow(clienteExistente);
      const sociosResp = await this.listarSocios(clienteMapeado.id);
      if (sociosResp.success) {
        (clienteMapeado as any).socios = sociosResp.data || [];
      }
      return {
        success: true,
        data: clienteMapeado,
        message: 'Nenhuma alteração detectada (cadastro já estava atualizado).',
        meta: {
          action: 'noop',
          changed: false,
          changes: [],
          socios: {
            before: sociosBefore.length,
            after: sociosAfter.length,
            added: 0,
            removed: 0,
          },
        },
      };
    }

    // Criar ou atualizar, e sincronizar sócios em transação
    const tx = await this.runTransaction(async (connection) => {
      let clienteId = clienteExistente?.id;

      if (!clienteId) {
        clienteId = uuidv4();
        // Incluir todos os campos do updateFieldsSafe no INSERT inicial
        const insertDataFull: any = {
          id: clienteId,
          cnpj_limpo: cnpjLimpo,
          razao_social: updateFieldsSafe.razao_social || cnpjLimpo,
          email: updateFieldsSafe.email || null,
          telefone: updateFieldsSafe.telefone || null,
          endereco: updateFieldsSafe.endereco || null,
          ...updateFieldsSafe, // Incluir todos os outros campos (incluindo datas já normalizadas)
        };
        const insertData = await this.filterToExistingColumns('clientes', insertDataFull);
        const keys = Object.keys(insertData);
        const cols = keys.map((k) => `\`${k}\``).join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        // Garantir que datas sejam strings YYYY-MM-DD antes de enviar ao MySQL
        const normalizeDateValue = (val: any): any => {
          if (!val) return val;
          if (val instanceof Date) {
            const year = val.getFullYear();
            const month = String(val.getMonth() + 1).padStart(2, '0');
            const day = String(val.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          if (typeof val === 'string' && val.includes('T') && val.includes('Z')) {
            // Se for ISO timestamp, extrair apenas a data
            return val.slice(0, 10);
          }
          return val;
        };
        // Normalizar timestamps (Date objects são aceitos, mas strings ISO precisam ser convertidas)
        const normalizeTimestampValue = (val: any): any => {
          if (!val) return val;
          if (val instanceof Date) {
            // Date object é aceito pelo MySQL, manter
            return val;
          }
          if (typeof val === 'string' && val.includes('T') && (val.includes('Z') || val.includes('+'))) {
            // Converter string ISO para Date object
            return new Date(val);
          }
          return val;
        };
        const dateFieldsForMySQL = ['abertura', 'data_situacao', 'data_situacao_especial', 'simples_data_opcao', 'simples_data_exclusao', 'simei_data_opcao', 'simei_data_exclusao'];
        const timestampFieldsForMySQL = ['receita_ws_consulta_em', 'receita_ws_ultima_atualizacao'];
        const values = keys.map((k) => {
          const val = (insertData as any)[k];
          if (dateFieldsForMySQL.includes(k)) {
            return normalizeDateValue(val);
          }
          if (timestampFieldsForMySQL.includes(k)) {
            return normalizeTimestampValue(val);
          }
          return val;
        });
        await connection.execute(`INSERT INTO \`clientes\` (${cols}) VALUES (${placeholders})`, values);
      }

      // Atualizar campos (sem mexer no cnpj_limpo)
      // Para evitar writes desnecessários, atualizamos somente o que mudou (quando cliente existe).
      // Para cliente novo, aplicamos tudo.
      let updateKeys = Object.keys(updateFieldsSafe).filter((k) => updateFieldsSafe[k] !== undefined);
      if (clienteExistente) {
        const changedFields = new Set(changes.map((c) => c.field));
        // Mesmo que o payload não entre em "changes", queremos persistir para auditoria quando houver mudança real.
        changedFields.add('receita_ws_payload');
        changedFields.add('receita_ws_consulta_em');
        changedFields.add('receita_ws_ultima_atualizacao');
        changedFields.add('receita_ws_status');
        updateKeys = updateKeys.filter((k) => changedFields.has(k));
      }
      if (updateKeys.length > 0) {
        const setClause = updateKeys.map((k) => `\`${k}\` = ?`).join(', ');
        // Garantir que datas sejam strings YYYY-MM-DD antes de enviar ao MySQL
        const normalizeDateValue = (val: any): any => {
          if (!val) return val;
          if (val instanceof Date) {
            const year = val.getFullYear();
            const month = String(val.getMonth() + 1).padStart(2, '0');
            const day = String(val.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          if (typeof val === 'string' && val.includes('T') && val.includes('Z')) {
            // Se for ISO timestamp, extrair apenas a data
            return val.slice(0, 10);
          }
          return val;
        };
        // Normalizar timestamps (Date objects são aceitos, mas strings ISO precisam ser convertidas)
        const normalizeTimestampValue = (val: any): any => {
          if (!val) return val;
          if (val instanceof Date) {
            // Date object é aceito pelo MySQL, manter
            return val;
          }
          if (typeof val === 'string' && val.includes('T') && (val.includes('Z') || val.includes('+'))) {
            // Converter string ISO para Date object
            return new Date(val);
          }
          return val;
        };
        const dateFieldsForMySQL = ['abertura', 'data_situacao', 'data_situacao_especial', 'simples_data_opcao', 'simples_data_exclusao', 'simei_data_opcao', 'simei_data_exclusao'];
        const timestampFieldsForMySQL = ['receita_ws_consulta_em', 'receita_ws_ultima_atualizacao'];
        const values = updateKeys.map((k) => {
          const val = updateFieldsSafe[k];
          if (dateFieldsForMySQL.includes(k)) {
            return normalizeDateValue(val);
          }
          if (timestampFieldsForMySQL.includes(k)) {
            return normalizeTimestampValue(val);
          }
          return val;
        });
        values.push(clienteId);
        await connection.execute(`UPDATE \`clientes\` SET ${setClause} WHERE id = ?`, values);
      }

      // Sincronizar sócios apenas se mudou (ou se cliente é novo).
      // Se a tabela ainda não existir (migração não aplicada), não falhar a importação.
      if (!clienteExistente || sociosChanged) {
        try {
          await connection.execute('DELETE FROM `clientes_socios` WHERE `cliente_id` = ?', [clienteId]);
          const socios = Array.isArray(receita.qsa) ? receita.qsa : [];
          for (const s of socios) {
            const nome = String((s as any)?.nome || '').trim();
            if (!nome) continue;
            const socioId = uuidv4();
          // Calcular participação se temos porcentagem e capital social
          const participacaoPercentual = (s as any)?.participacao_percentual ? parseFloat(String((s as any).participacao_percentual)) : null;
          let participacaoValor: number | null = null;
          
          // Se temos participação percentual, tentar calcular o valor
          if (participacaoPercentual !== null && !isNaN(participacaoPercentual)) {
            // Buscar capital social do cliente se não foi fornecido
            let capitalSocialNum: number | null = null;
            const [clienteRows] = await connection.execute('SELECT `capital_social` FROM `clientes` WHERE `id` = ? LIMIT 1', [clienteId]);
            const clienteRow = (clienteRows as any[])[0];
            if (clienteRow?.capital_social) {
              capitalSocialNum = typeof clienteRow.capital_social === 'string' 
                ? parseFloat(clienteRow.capital_social.replace(/[^\d,.-]/g, '').replace(',', '.'))
                : parseFloat(String(clienteRow.capital_social));
            }
            
            if (capitalSocialNum !== null && !isNaN(capitalSocialNum)) {
              participacaoValor = (capitalSocialNum * participacaoPercentual) / 100;
            }
          }

          await connection.execute(
            'INSERT INTO `clientes_socios` (`id`,`cliente_id`,`nome`,`qual`,`participacao_percentual`,`participacao_valor`) VALUES (?,?,?,?,?,?)',
            [socioId, clienteId, nome, ((s as any)?.qual ? String((s as any).qual).trim() : null), participacaoPercentual, participacaoValor]
          );
          }
        } catch (e: any) {
          if (!this.isNoSuchTableError(e)) {
            throw e;
          }
        }
      }

      // Buscar cliente final
      const [rows] = await connection.execute('SELECT * FROM `clientes` WHERE id = ? LIMIT 1', [clienteId]);
      const row = (rows as any[])[0];
      return row as any;
    });

    if (!tx.success || !tx.data) {
      return { success: false, error: tx.error || 'Falha ao importar dados da ReceitaWS' };
    }

    const clienteMapeado = this.mapSupabaseRow(tx.data);
    // anexar sócios
    const sociosResp = await this.listarSocios(clienteMapeado.id);
    if (sociosResp.success) {
      (clienteMapeado as any).socios = sociosResp.data || [];
    }

    const action = clienteExistente ? 'updated' : 'created';
    return {
      success: true,
      data: clienteMapeado,
      message: action === 'created'
        ? 'Cliente criado e dados importados da ReceitaWS.'
        : (changes.length === 0 && sociosChanged ? 'Cliente atualizado (somente sócios/QSA alterados).' : 'Cliente atualizado com dados da ReceitaWS.'),
      meta: {
        action,
        changed: true,
        changes,
        socios: {
          before: clienteExistente ? sociosBefore.length : 0,
          after: Array.isArray((clienteMapeado as any).socios) ? (clienteMapeado as any).socios.length : sociosAfter.length,
          added: clienteExistente ? sociosAdded : sociosAfter.length,
          removed: clienteExistente ? sociosRemoved : 0,
        },
      },
    };
  }

  /**
   * Atualiza sócios do cliente com dados da Situação Fiscal (incluindo participação)
   * @param clienteId ID do cliente
   * @param socios Array de sócios com participação_percentual e CPF
   * @param capitalSocial Capital social do cliente para calcular o valor da participação
   */
  async atualizarSociosComParticipacao(
    clienteId: string,
    socios: Array<{ nome: string; cpf?: string | null; qual?: string | null; participacao_percentual?: number | null }>,
    capitalSocial?: number | string | null
  ): Promise<ApiResponse<{ atualizados: number; criados: number }>> {
    try {
      const { getConnection } = await import('../config/mysql');
      const connection = await getConnection();
      await connection.beginTransaction();

      try {
        // Buscar capital social do cliente se não foi fornecido
        let capitalSocialNum: number | null = null;
        if (capitalSocial) {
          capitalSocialNum = typeof capitalSocial === 'string' ? parseFloat(capitalSocial.replace(/[^\d,.-]/g, '').replace(',', '.')) : capitalSocial;
        } else {
          const [clienteRows] = await connection.execute('SELECT `capital_social` FROM `clientes` WHERE `id` = ? LIMIT 1', [clienteId]);
          const clienteRow = (clienteRows as any[])[0];
          if (clienteRow?.capital_social) {
            capitalSocialNum = typeof clienteRow.capital_social === 'string' 
              ? parseFloat(clienteRow.capital_social.replace(/[^\d,.-]/g, '').replace(',', '.'))
              : parseFloat(String(clienteRow.capital_social));
          }
        }

        // Remover sócios existentes
        await connection.execute('DELETE FROM `clientes_socios` WHERE `cliente_id` = ?', [clienteId]);

        let criados = 0;
        let atualizados = 0;

        // Inserir novos sócios com participação
        for (const s of socios) {
          const nome = String(s.nome || '').trim();
          if (!nome) continue;

          const socioId = uuidv4();
          const cpf = s.cpf ? String(s.cpf).replace(/\D/g, '') : null; // Limpar CPF (apenas números)
          const qual = s.qual ? String(s.qual).trim() : null;
          const participacaoPercentual = s.participacao_percentual ? parseFloat(String(s.participacao_percentual)) : null;
          
          // Calcular valor da participação se temos porcentagem e capital social
          let participacaoValor: number | null = null;
          if (participacaoPercentual !== null && capitalSocialNum !== null && !isNaN(capitalSocialNum)) {
            participacaoValor = (capitalSocialNum * participacaoPercentual) / 100;
          }

          await connection.execute(
            'INSERT INTO `clientes_socios` (`id`,`cliente_id`,`nome`,`cpf`,`qual`,`participacao_percentual`,`participacao_valor`) VALUES (?,?,?,?,?,?,?)',
            [socioId, clienteId, nome, cpf, qual, participacaoPercentual, participacaoValor]
          );
          criados++;
        }

        await connection.commit();
        return { success: true, data: { atualizados, criados } };
      } catch (e: any) {
        await connection.rollback();
        throw e;
      } finally {
        connection.release();
      }
    } catch (e: any) {
      if (this.isNoSuchTableError(e)) {
        // Tabela ainda não existe - não quebrar
        return { success: true, data: { atualizados: 0, criados: 0 } };
      }
      return { success: false, error: e?.message || 'Erro ao atualizar sócios' };
    }
  }

}

