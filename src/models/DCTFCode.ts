/**
 * Modelo para Códigos DCTF
 * Gerencia códigos válidos para validação de dados DCTF
 */

import { DatabaseService } from '../services/DatabaseService';
import Joi from 'joi';

export interface IDCTFCode {
  id?: string;
  codigo: string;
  descricao: string;
  tipo: 'receita' | 'deducao' | 'retencao' | 'outros';
  ativo: boolean;
  periodoInicio?: string;
  periodoFim?: string;
  observacoes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDCTFReceitaCode {
  id?: string;
  codigo: string;
  descricao: string;
  categoria: string;
  subcategoria?: string;
  ativo: boolean;
  periodoInicio?: string;
  periodoFim?: string;
  observacoes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDCTFAliquota {
  id?: string;
  codigoDctf: string;
  codigoReceita?: string;
  aliquota: number;
  baseCalculo: string;
  periodoInicio: string;
  periodoFim?: string;
  observacoes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema de validação para DCTFCode
const dctfCodeSchema = Joi.object<IDCTFCode>({
  codigo: Joi.string().max(10).required().messages({
    'string.empty': 'Código é obrigatório',
    'string.max': 'Código deve ter no máximo 10 caracteres'
  }),
  descricao: Joi.string().max(255).required().messages({
    'string.empty': 'Descrição é obrigatória',
    'string.max': 'Descrição deve ter no máximo 255 caracteres'
  }),
  tipo: Joi.string().valid('receita', 'deducao', 'retencao', 'outros').required().messages({
    'any.only': 'Tipo deve ser: receita, deducao, retencao ou outros'
  }),
  ativo: Joi.boolean().default(true),
  periodoInicio: Joi.string().pattern(/^\d{4}-\d{2}$/).optional().messages({
    'string.pattern.base': 'Período início deve estar no formato YYYY-MM'
  }),
  periodoFim: Joi.string().pattern(/^\d{4}-\d{2}$/).optional().messages({
    'string.pattern.base': 'Período fim deve estar no formato YYYY-MM'
  }),
  observacoes: Joi.string().max(1000).optional()
});

// Schema de validação para DCTFReceitaCode
const dctfReceitaCodeSchema = Joi.object<IDCTFReceitaCode>({
  codigo: Joi.string().pattern(/^\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{2}\.\d{2}$/).required().messages({
    'string.empty': 'Código de receita é obrigatório',
    'string.pattern.base': 'Código deve estar no formato X.X.X.XX.XX'
  }),
  descricao: Joi.string().max(255).required().messages({
    'string.empty': 'Descrição é obrigatória',
    'string.max': 'Descrição deve ter no máximo 255 caracteres'
  }),
  categoria: Joi.string().max(100).required().messages({
    'string.empty': 'Categoria é obrigatória',
    'string.max': 'Categoria deve ter no máximo 100 caracteres'
  }),
  subcategoria: Joi.string().max(100).optional(),
  ativo: Joi.boolean().default(true),
  periodoInicio: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  periodoFim: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  observacoes: Joi.string().max(1000).optional()
});

// Schema de validação para DCTFAliquota
const dctfAliquotaSchema = Joi.object<IDCTFAliquota>({
  codigoDctf: Joi.string().max(10).required().messages({
    'string.empty': 'Código DCTF é obrigatório'
  }),
  codigoReceita: Joi.string().pattern(/^\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{2}\.\d{2}$/).optional(),
  aliquota: Joi.number().min(0).max(1).precision(4).required().messages({
    'number.min': 'Alíquota deve ser maior ou igual a 0',
    'number.max': 'Alíquota deve ser menor ou igual a 1',
    'number.precision': 'Alíquota deve ter no máximo 4 casas decimais'
  }),
  baseCalculo: Joi.string().max(50).required().messages({
    'string.empty': 'Base de cálculo é obrigatória'
  }),
  periodoInicio: Joi.string().pattern(/^\d{4}-\d{2}$/).required().messages({
    'string.pattern.base': 'Período início deve estar no formato YYYY-MM'
  }),
  periodoFim: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  observacoes: Joi.string().max(1000).optional()
});

export class DCTFCode extends DatabaseService<IDCTFCode> {
  constructor() {
    super('dctf_codes');
  }

  /**
   * Validar dados do código DCTF
   */
  validate(data: Partial<IDCTFCode>): { isValid: boolean; errors: string[] } {
    const { error } = dctfCodeSchema.validate(data, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }
    
    return { isValid: true, errors: [] };
  }

  /**
   * Buscar códigos por tipo
   */
  async findByTipo(tipo: 'receita' | 'deducao' | 'retencao' | 'outros'): Promise<IDCTFCode[]> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('*')
      .eq('tipo', tipo)
      .eq('ativo', true)
      .order('codigo');
    const { data, error } = result;

    if (error) {
      throw new Error(`Erro ao buscar códigos por tipo: ${error.message}`);
    }

    return data as IDCTFCode[];
  }

  /**
   * Verificar se código está ativo no período
   */
  async isActiveInPeriod(codigo: string, periodo: string): Promise<boolean> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('ativo, periodo_inicio, periodo_fim')
      .eq('codigo', codigo)
      .single();

    const { data, error } = result;

    if (error || !data) {
      return false;
    }

    if (!data.ativo) {
      return false;
    }

    // Verificar período se definido
    if (data.periodo_inicio && periodo < data.periodo_inicio) {
      return false;
    }

    if (data.periodo_fim && periodo > data.periodo_fim) {
      return false;
    }

    return true;
  }

  /**
   * Buscar códigos ativos no período
   */
  async findActiveInPeriod(periodo: string, tipo?: string): Promise<IDCTFCode[]> {
    const adapter = this.supabase as any;
    let query = adapter
      .from(this.tableName)
      .select('*')
      .eq('ativo', true)
      .lte('periodo_inicio', periodo)
      .or(`periodo_fim.is.null,periodo_fim.gte.${periodo}`)
      .order('codigo');

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const result = await query;
    const { data, error } = result;

    if (error) {
      throw new Error(`Erro ao buscar códigos ativos no período: ${error.message}`);
    }

    return data as IDCTFCode[];
  }
}

export class DCTFReceitaCode extends DatabaseService<IDCTFReceitaCode> {
  constructor() {
    super('dctf_receita_codes');
  }

  /**
   * Validar dados do código de receita
   */
  validate(data: Partial<IDCTFReceitaCode>): { isValid: boolean; errors: string[] } {
    const { error } = dctfReceitaCodeSchema.validate(data, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }
    
    return { isValid: true, errors: [] };
  }

  /**
   * Buscar códigos por categoria
   */
  async findByCategoria(categoria: string): Promise<IDCTFReceitaCode[]> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('*')
      .eq('categoria', categoria)
      .eq('ativo', true)
      .order('codigo');
    const { data, error } = result;

    if (error) {
      throw new Error(`Erro ao buscar códigos por categoria: ${error.message}`);
    }

    return data as IDCTFReceitaCode[];
  }

  /**
   * Buscar códigos por subcategoria
   */
  async findBySubcategoria(subcategoria: string): Promise<IDCTFReceitaCode[]> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('*')
      .eq('subcategoria', subcategoria)
      .eq('ativo', true)
      .order('codigo');
    const { data, error } = result;

    if (error) {
      throw new Error(`Erro ao buscar códigos por subcategoria: ${error.message}`);
    }

    return data as IDCTFReceitaCode[];
  }
}

export class DCTFAliquota extends DatabaseService<IDCTFAliquota> {
  constructor() {
    super('dctf_aliquotas');
  }

  /**
   * Validar dados da alíquota
   */
  validate(data: Partial<IDCTFAliquota>): { isValid: boolean; errors: string[] } {
    const { error } = dctfAliquotaSchema.validate(data, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }
    
    return { isValid: true, errors: [] };
  }

  /**
   * Buscar alíquota por código e período
   */
  async findByCodeAndPeriod(codigoDctf: string, periodo: string): Promise<IDCTFAliquota | null> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('*')
      .eq('codigo_dctf', codigoDctf)
      .lte('periodo_inicio', periodo)
      .or(`periodo_fim.is.null,periodo_fim.gte.${periodo}`)
      .order('periodo_inicio', { ascending: false })
      .limit(1)
      .single();
    const { data, error } = result;

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erro ao buscar alíquota: ${error.message}`);
    }

    return data as IDCTFAliquota | null;
  }

  /**
   * Buscar alíquotas por período
   */
  async findByPeriod(periodo: string): Promise<IDCTFAliquota[]> {
    const adapter = this.supabase as any;
    const result = await adapter
      .from(this.tableName)
      .select('*')
      .lte('periodo_inicio', periodo)
      .or(`periodo_fim.is.null,periodo_fim.gte.${periodo}`)
      .order('codigo_dctf');
    const { data, error } = result;

    if (error) {
      throw new Error(`Erro ao buscar alíquotas por período: ${error.message}`);
    }

    return data as IDCTFAliquota[];
  }
}
