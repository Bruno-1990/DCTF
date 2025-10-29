/**
 * Serviço de Validação Centralizado
 * Centraliza todas as validações de negócio do sistema
 */

import Joi from 'joi';

export class ValidationService {
  /**
   * Validar CNPJ usando algoritmo oficial
   */
  static validateCNPJ(cnpj: string): boolean {
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    
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
   * Formatar CNPJ para armazenamento
   */
  static formatCNPJ(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  }

  /**
   * Formatar CNPJ para exibição
   */
  static formatCNPJDisplay(cnpj: string): string {
    const clean = this.formatCNPJ(cnpj);
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  /**
   * Validar período no formato YYYY-MM
   */
  static validatePeriodo(periodo: string): boolean {
    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(periodo)) return false;
    
    const [ano, mes] = periodo.split('-').map(Number);
    const anoAtual = new Date().getFullYear();
    
    return ano >= 2020 && ano <= anoAtual + 1 && mes >= 1 && mes <= 12;
  }

  /**
   * Validar email
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validar telefone brasileiro
   */
  static validateTelefone(telefone: string): boolean {
    const clean = telefone.replace(/\D/g, '');
    return clean.length >= 10 && clean.length <= 11;
  }

  /**
   * Formatar telefone para exibição
   */
  static formatTelefone(telefone: string): string {
    const clean = telefone.replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (clean.length === 10) {
      return clean.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }
    return telefone;
  }

  /**
   * Validar valor monetário
   */
  static validateValorMonetario(valor: number): boolean {
    return valor >= 0 && valor <= 999999999999.99;
  }

  /**
   * Formatar valor monetário para exibição
   */
  static formatValorMonetario(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  /**
   * Validar data
   */
  static validateData(data: string | Date): boolean {
    const date = new Date(data);
    return !isNaN(date.getTime());
  }

  /**
   * Formatar data para exibição
   */
  static formatData(data: string | Date): string {
    const date = new Date(data);
    return date.toLocaleDateString('pt-BR');
  }

  /**
   * Validar UUID
   */
  static validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validar arquivo por extensão
   */
  static validateFileExtension(fileName: string, allowedExtensions: string[]): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension ? allowedExtensions.includes(`.${extension}`) : false;
  }

  /**
   * Validar tamanho de arquivo
   */
  static validateFileSize(fileSize: number, maxSizeInMB: number): boolean {
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    return fileSize <= maxSizeInBytes;
  }

  /**
   * Sanitizar string para busca
   */
  static sanitizeSearchString(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Validar código de flag DCTF
   */
  static validateCodigoFlag(codigo: string): boolean {
    const flagRegex = /^[A-Z0-9_]{2,20}$/;
    return flagRegex.test(codigo);
  }

  /**
   * Validar severidade
   */
  static validateSeveridade(severidade: string): boolean {
    const validSeveridades = ['baixa', 'media', 'alta', 'critica'];
    return validSeveridades.includes(severidade);
  }

  /**
   * Validar status de declaração
   */
  static validateStatusDeclaracao(status: string): boolean {
    const validStatuses = ['pendente', 'processando', 'concluido', 'erro'];
    return validStatuses.includes(status);
  }

  /**
   * Validar status de análise
   */
  static validateStatusAnalise(status: string): boolean {
    const validStatuses = ['pendente', 'em_analise', 'concluida'];
    return validStatuses.includes(status);
  }

  /**
   * Gerar hash simples para validação
   */
  static generateSimpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validar JSON
   */
  static validateJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validar array de strings
   */
  static validateStringArray(arr: any[]): boolean {
    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
  }

  /**
   * Validar objeto com propriedades obrigatórias
   */
  static validateRequiredProperties(obj: any, requiredProps: string[]): boolean {
    return requiredProps.every(prop => obj.hasOwnProperty(prop) && obj[prop] !== undefined && obj[prop] !== null);
  }
}
