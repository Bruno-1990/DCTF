/**
 * Serviço de Validação DCTF
 * Centraliza todas as validações específicas para dados DCTF conforme legislação fiscal
 */

import { ValidationService } from './ValidationService';

export interface DCTFValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DCTFCode {
  codigo: string;
  descricao: string;
  tipo: 'receita' | 'deducao' | 'retencao' | 'outros';
  ativo: boolean;
  periodoInicio?: string;
  periodoFim?: string;
}

export class DCTFValidationService {
  // Códigos DCTF válidos (simplificado - em produção viria de uma tabela)
  private static readonly DCTF_CODES: DCTFCode[] = [
    // Códigos de Receita
    { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true },
    { codigo: '002', descricao: 'Receita Líquida', tipo: 'receita', ativo: true },
    { codigo: '003', descricao: 'Receita de Vendas', tipo: 'receita', ativo: true },
    { codigo: '004', descricao: 'Receita de Serviços', tipo: 'receita', ativo: true },
    { codigo: '005', descricao: 'Receita Financeira', tipo: 'receita', ativo: true },
    
    // Códigos de Dedução
    { codigo: '101', descricao: 'Deduções Legais', tipo: 'deducao', ativo: true },
    { codigo: '102', descricao: 'Descontos Incondicionais', tipo: 'deducao', ativo: true },
    { codigo: '103', descricao: 'Devoluções de Vendas', tipo: 'deducao', ativo: true },
    { codigo: '104', descricao: 'Cancelamentos', tipo: 'deducao', ativo: true },
    
    // Códigos de Retenção
    { codigo: '201', descricao: 'IRRF', tipo: 'retencao', ativo: true },
    { codigo: '202', descricao: 'CSLL', tipo: 'retencao', ativo: true },
    { codigo: '203', descricao: 'PIS', tipo: 'retencao', ativo: true },
    { codigo: '204', descricao: 'COFINS', tipo: 'retencao', ativo: true },
    { codigo: '205', descricao: 'INSS', tipo: 'retencao', ativo: true },
  ];

  /**
   * Validar código DCTF
   */
  static validateDCTFCode(codigo: string, periodo?: string): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!codigo || codigo.trim().length === 0) {
      errors.push('Código DCTF é obrigatório');
      return { isValid: false, errors, warnings };
    }

    const cleanCode = codigo.trim().toUpperCase();
    const dctfCode = this.DCTF_CODES.find(c => c.codigo === cleanCode);

    if (!dctfCode) {
      errors.push(`Código DCTF '${cleanCode}' não é válido`);
      return { isValid: false, errors, warnings };
    }

    if (!dctfCode.ativo) {
      errors.push(`Código DCTF '${cleanCode}' não está ativo`);
      return { isValid: false, errors, warnings };
    }

    // Validar período se fornecido
    if (periodo && dctfCode.periodoInicio && dctfCode.periodoFim) {
      if (periodo < dctfCode.periodoInicio || periodo > dctfCode.periodoFim) {
        warnings.push(`Código '${cleanCode}' pode não ser válido para o período ${periodo}`);
      }
    }

    return { isValid: true, errors, warnings };
  }

  /**
   * Validar período fiscal
   */
  static validatePeriodoFiscal(periodo: string): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!periodo) {
      errors.push('Período fiscal é obrigatório');
      return { isValid: false, errors, warnings };
    }

    // Validar formato puro YYYY-MM (sem validar ano/mês aqui)
    const formatoRegex = /^\d{4}-\d{2}$/;
    if (!formatoRegex.test(periodo)) {
      errors.push('Período deve estar no formato YYYY-MM');
      return { isValid: false, errors, warnings };
    }

    const [ano, mes] = periodo.split('-').map(Number);
    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth() + 1;

    // Validar ano
    if (ano < 2020) {
      errors.push('Ano deve ser maior ou igual a 2020');
    } else if (ano > anoAtual + 1) {
      warnings.push('Ano muito futuro - verificar se está correto');
    }

    // Validar mês
    if (mes < 1 || mes > 12) {
      errors.push('Mês deve estar entre 01 e 12');
    }

    // Validar se período não é muito futuro
    if (ano === anoAtual && mes > mesAtual + 3) {
      warnings.push('Período muito futuro - verificar se está correto');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validar valor monetário DCTF
   */
  static validateValorMonetario(valor: number, codigo?: string): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (valor === null || valor === undefined) {
      errors.push('Valor é obrigatório');
      return { isValid: false, errors, warnings };
    }

    if (typeof valor !== 'number' || isNaN(valor)) {
      errors.push('Valor deve ser um número válido');
      return { isValid: false, errors, warnings };
    }

    if (valor < 0) {
      errors.push('Valor não pode ser negativo');
    }

    if (valor > 999999999999.99) {
      errors.push('Valor excede o limite máximo permitido');
    }

    // Validações específicas por tipo de código
    if (codigo) {
      const dctfCode = this.DCTF_CODES.find(c => c.codigo === codigo);
      if (dctfCode) {
        switch (dctfCode.tipo) {
          case 'receita':
            if (valor === 0) {
              warnings.push('Receita com valor zero - verificar se está correto');
            }
            break;
          case 'deducao':
            if (valor < 0) {
              errors.push('Deduções não podem ter valor negativo');
            }
            break;
          case 'retencao':
            if (valor < 0) {
              errors.push('Retenções não podem ter valor negativo');
            }
            break;
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validar CNPJ/CPF em dados DCTF
   */
  static validateCNPJCPF(documento: string): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!documento || documento.trim().length === 0) {
      errors.push('CNPJ/CPF é obrigatório');
      return { isValid: false, errors, warnings };
    }

    const cleanDoc = documento.replace(/\D/g, '');

    if (cleanDoc.length === 11) {
      // Validar CPF
      if (!this.validateCPF(cleanDoc)) {
        errors.push('CPF inválido');
      }
    } else if (cleanDoc.length === 14) {
      // Validar CNPJ
      if (!ValidationService.validateCNPJ(documento)) {
        errors.push('CNPJ inválido');
      }
    } else {
      errors.push('Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validar CPF
   */
  private static validateCPF(cpf: string): boolean {
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cpf)) return false;
    
    // Calcular primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf[i]) * (10 - i);
    }
    const firstDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    
    if (parseInt(cpf[9]) !== firstDigit) return false;
    
    // Calcular segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf[i]) * (11 - i);
    }
    const secondDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    
    return parseInt(cpf[10]) === secondDigit;
  }

  /**
   * Validar código de receita
   */
  static validateCodigoReceita(codigo: string): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!codigo || codigo.trim().length === 0) {
      errors.push('Código de receita é obrigatório');
      return { isValid: false, errors, warnings };
    }

    const cleanCode = codigo.trim();
    
    // Validar formato (exemplo: 1.1.1.01.01)
    const receitaRegex = /^\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{2}\.\d{2}$/;
    if (!receitaRegex.test(cleanCode)) {
      errors.push('Código de receita deve estar no formato X.X.X.XX.XX');
      return { isValid: false, errors, warnings };
    }

    // Validar se código existe na tabela de receitas
    // TODO: Implementar consulta à tabela de códigos de receita
    const codigosValidos = ['1.1.1.01.01', '1.1.1.01.02', '1.1.1.01.03'];
    if (!codigosValidos.includes(cleanCode)) {
      warnings.push(`Código de receita '${cleanCode}' não encontrado na tabela oficial`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validar linha DCTF completa
   */
  static validateDCTFLinha(dados: {
    codigo?: string;
    descricao?: string;
    valor?: number;
    dataOcorrencia?: string;
    cnpjCpf?: string;
    codigoReceita?: string;
    periodo?: string;
  }): DCTFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validar código DCTF
    if (dados.codigo) {
      const codigoResult = this.validateDCTFCode(dados.codigo, dados.periodo);
      errors.push(...codigoResult.errors);
      warnings.push(...codigoResult.warnings);
    }

    // Validar valor
    if (dados.valor !== undefined) {
      const valorResult = this.validateValorMonetario(dados.valor, dados.codigo);
      errors.push(...valorResult.errors);
      warnings.push(...valorResult.warnings);
    }

    // Validar CNPJ/CPF
    if (dados.cnpjCpf) {
      const docResult = this.validateCNPJCPF(dados.cnpjCpf);
      errors.push(...docResult.errors);
      warnings.push(...docResult.warnings);
    }

    // Validar código de receita
    if (dados.codigoReceita) {
      const receitaResult = this.validateCodigoReceita(dados.codigoReceita);
      errors.push(...receitaResult.errors);
      warnings.push(...receitaResult.warnings);
    }

    // Validar período
    if (dados.periodo) {
      const periodoResult = this.validatePeriodoFiscal(dados.periodo);
      errors.push(...periodoResult.errors);
      warnings.push(...periodoResult.warnings);
    }

    // Validar data de ocorrência
    if (dados.dataOcorrencia) {
      if (!ValidationService.validateData(dados.dataOcorrencia)) {
        errors.push('Data de ocorrência inválida');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Obter códigos DCTF válidos
   */
  static getValidCodes(tipo?: 'receita' | 'deducao' | 'retencao' | 'outros'): DCTFCode[] {
    if (tipo) {
      return this.DCTF_CODES.filter(code => code.tipo === tipo && code.ativo);
    }
    return this.DCTF_CODES.filter(code => code.ativo);
  }

  /**
   * Verificar se código está ativo no período
   */
  static isCodeActiveInPeriod(codigo: string, periodo: string): boolean {
    const dctfCode = this.DCTF_CODES.find(c => c.codigo === codigo);
    if (!dctfCode || !dctfCode.ativo) return false;
    
    if (dctfCode.periodoInicio && periodo < dctfCode.periodoInicio) return false;
    if (dctfCode.periodoFim && periodo > dctfCode.periodoFim) return false;
    
    return true;
  }
}
