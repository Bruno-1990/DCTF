/**
 * Serviço de Códigos e Categorias DCTF
 * Gerencia códigos válidos, categorização e validações específicas
 */

import { DCTFCode, DCTFReceitaCode, DCTFAliquota } from '../models/DCTFCode';
import { DCTFValidationService } from './DCTFValidationService';

export interface CodeCategory {
  codigo: string;
  descricao: string;
  tipo: 'receita' | 'deducao' | 'retencao' | 'outros';
  categoria: string;
  subcategoria?: string;
  ativo: boolean;
  periodoInicio?: string;
  periodoFim?: string;
}

export interface CodeHierarchy {
  categoria: string;
  subcategorias: Array<{
    subcategoria: string;
    codigos: CodeCategory[];
  }>;
}

export interface CodeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  codeInfo?: CodeCategory;
}

export class DCTFCodesService {
  private static dctfCodeModel = new DCTFCode();
  private static receitaCodeModel = new DCTFReceitaCode();
  private static aliquotaModel = new DCTFAliquota();

  /**
   * Obter hierarquia de códigos por categoria
   */
  static async getCodeHierarchy(): Promise<CodeHierarchy[]> {
    try {
      // Buscar códigos DCTF
      const dctfCodes = await this.dctfCodeModel.findAll();
      
      // Buscar códigos de receita
      const receitaCodes = await this.receitaCodeModel.findAll();

      // Agrupar por categoria
      const hierarchyMap = new Map<string, CodeHierarchy>();

      // Processar códigos DCTF
      for (const code of dctfCodes) {
        const categoria = this.getCategoriaFromTipo(code.tipo);
        
        if (!hierarchyMap.has(categoria)) {
          hierarchyMap.set(categoria, {
            categoria,
            subcategorias: []
          });
        }

        const hierarchy = hierarchyMap.get(categoria)!;
        const subcategoria = code.descricao.split(' ')[0] || 'Geral';
        
        let subcat = hierarchy.subcategorias.find(s => s.subcategoria === subcategoria);
        if (!subcat) {
          subcat = { subcategoria, codigos: [] };
          hierarchy.subcategorias.push(subcat);
        }

        subcat.codigos.push({
          codigo: code.codigo,
          descricao: code.descricao,
          tipo: code.tipo,
          categoria,
          subcategoria,
          ativo: code.ativo,
          periodoInicio: code.periodoInicio,
          periodoFim: code.periodoFim
        });
      }

      // Processar códigos de receita
      for (const code of receitaCodes) {
        const categoria = 'Receitas Detalhadas';
        
        if (!hierarchyMap.has(categoria)) {
          hierarchyMap.set(categoria, {
            categoria,
            subcategorias: []
          });
        }

        const hierarchy = hierarchyMap.get(categoria)!;
        const subcategoria = code.categoria;
        
        let subcat = hierarchy.subcategorias.find(s => s.subcategoria === subcategoria);
        if (!subcat) {
          subcat = { subcategoria, codigos: [] };
          hierarchy.subcategorias.push(subcat);
        }

        subcat.codigos.push({
          codigo: code.codigo,
          descricao: code.descricao,
          tipo: 'receita',
          categoria,
          subcategoria,
          ativo: code.ativo,
          periodoInicio: code.periodoInicio,
          periodoFim: code.periodoFim
        });
      }

      return Array.from(hierarchyMap.values());
    } catch (error: any) {
      throw new Error(`Erro ao obter hierarquia de códigos: ${error.message}`);
    }
  }

  /**
   * Validar código DCTF com informações detalhadas
   */
  static async validateCode(
    codigo: string, 
    periodo?: string, 
    tipo?: 'receita' | 'deducao' | 'retencao' | 'outros'
  ): Promise<CodeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validação básica
      const validacaoBasica = DCTFValidationService.validateDCTFCode(codigo, periodo);
      errors.push(...validacaoBasica.errors);
      warnings.push(...validacaoBasica.warnings);

      if (!validacaoBasica.isValid) {
        return {
          isValid: false,
          errors,
          warnings,
          suggestions
        };
      }

      // Buscar informações do código
      const codeInfo = await this.getCodeInfo(codigo);
      if (!codeInfo) {
        errors.push('Código não encontrado no banco de dados');
        return {
          isValid: false,
          errors,
          warnings,
          suggestions
        };
      }

      // Validar tipo se especificado
      if (tipo && codeInfo.tipo !== tipo) {
        errors.push(`Código ${codigo} é do tipo '${codeInfo.tipo}', mas esperado '${tipo}'`);
      }

      // Validar período
      if (periodo) {
        const isActive = await this.dctfCodeModel.isActiveInPeriod(codigo, periodo);
        if (!isActive) {
          errors.push(`Código ${codigo} não está ativo no período ${periodo}`);
        }
      }

      // Sugestões baseadas no código
      if (codeInfo.tipo === 'receita' && codeInfo.codigo.startsWith('001')) {
        suggestions.push('Código de receita bruta - verificar se valor está correto');
      }

      if (codeInfo.tipo === 'deducao') {
        suggestions.push('Código de dedução - verificar se não excede receita bruta');
      }

      if (codeInfo.tipo === 'retencao') {
        suggestions.push('Código de retenção - verificar alíquota e base de cálculo');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        codeInfo
      };

    } catch (error: any) {
      errors.push(`Erro na validação: ${error.message}`);
      return {
        isValid: false,
        errors,
        warnings,
        suggestions
      };
    }
  }

  /**
   * Obter informações detalhadas do código
   */
  static async getCodeInfo(codigo: string): Promise<CodeCategory | null> {
    try {
      // Buscar código DCTF
      const dctfCode = await this.dctfCodeModel.findById(codigo);
      if (dctfCode) {
        return {
          codigo: dctfCode.codigo,
          descricao: dctfCode.descricao,
          tipo: dctfCode.tipo,
          categoria: this.getCategoriaFromTipo(dctfCode.tipo),
          ativo: dctfCode.ativo,
          periodoInicio: dctfCode.periodoInicio,
          periodoFim: dctfCode.periodoFim
        };
      }

      // Buscar código de receita
      const receitaCode = await this.receitaCodeModel.findById(codigo);
      if (receitaCode) {
        return {
          codigo: receitaCode.codigo,
          descricao: receitaCode.descricao,
          tipo: 'receita',
          categoria: 'Receitas Detalhadas',
          subcategoria: receitaCode.categoria,
          ativo: receitaCode.ativo,
          periodoInicio: receitaCode.periodoInicio,
          periodoFim: receitaCode.periodoFim
        };
      }

      return null;
    } catch (error: any) {
      throw new Error(`Erro ao obter informações do código: ${error.message}`);
    }
  }

  /**
   * Obter códigos ativos por período
   */
  static async getActiveCodesInPeriod(
    periodo: string, 
    tipo?: 'receita' | 'deducao' | 'retencao' | 'outros'
  ): Promise<CodeCategory[]> {
    try {
      const codes = await this.dctfCodeModel.findActiveInPeriod(periodo, tipo);
      
      return codes.map(code => ({
        codigo: code.codigo,
        descricao: code.descricao,
        tipo: code.tipo,
        categoria: this.getCategoriaFromTipo(code.tipo),
        ativo: code.ativo,
        periodoInicio: code.periodoInicio,
        periodoFim: code.periodoFim
      }));
    } catch (error: any) {
      throw new Error(`Erro ao obter códigos ativos: ${error.message}`);
    }
  }

  /**
   * Obter alíquota para código e período
   */
  static async getAliquotaForCode(
    codigo: string, 
    periodo: string
  ): Promise<{ aliquota: number; baseCalculo: string } | null> {
    try {
      const aliquota = await this.aliquotaModel.findByCodeAndPeriod(codigo, periodo);
      
      if (!aliquota) {
        return null;
      }

      return {
        aliquota: aliquota.aliquota,
        baseCalculo: aliquota.baseCalculo
      };
    } catch (error: any) {
      throw new Error(`Erro ao obter alíquota: ${error.message}`);
    }
  }

  /**
   * Buscar códigos por descrição
   */
  static async searchCodesByDescription(
    descricao: string, 
    tipo?: 'receita' | 'deducao' | 'retencao' | 'outros'
  ): Promise<CodeCategory[]> {
    try {
      const { data, error } = await this.dctfCodeModel.supabase
        .from('dctf_codes')
        .select('*')
        .ilike('descricao', `%${descricao}%`)
        .eq('ativo', true);

      if (error) {
        throw new Error(`Erro na busca: ${error.message}`);
      }

      let codes = data as any[];

      if (tipo) {
        codes = codes.filter(code => code.tipo === tipo);
      }

      return codes.map(code => ({
        codigo: code.codigo,
        descricao: code.descricao,
        tipo: code.tipo,
        categoria: this.getCategoriaFromTipo(code.tipo),
        ativo: code.ativo,
        periodoInicio: code.periodo_inicio,
        periodoFim: code.periodo_fim
      }));
    } catch (error: any) {
      throw new Error(`Erro na busca por descrição: ${error.message}`);
    }
  }

  /**
   * Obter estatísticas de códigos
   */
  static async getCodeStatistics(): Promise<{
    totalCodes: number;
    codesByType: Record<string, number>;
    activeCodes: number;
    inactiveCodes: number;
  }> {
    try {
      const codes = await this.dctfCodeModel.findAll();
      
      const stats = {
        totalCodes: codes.length,
        codesByType: {} as Record<string, number>,
        activeCodes: 0,
        inactiveCodes: 0
      };

      for (const code of codes) {
        // Contar por tipo
        stats.codesByType[code.tipo] = (stats.codesByType[code.tipo] || 0) + 1;
        
        // Contar ativos/inativos
        if (code.ativo) {
          stats.activeCodes++;
        } else {
          stats.inactiveCodes++;
        }
      }

      return stats;
    } catch (error: any) {
      throw new Error(`Erro ao obter estatísticas: ${error.message}`);
    }
  }

  /**
   * Validar conjunto de códigos
   */
  static async validateCodeSet(codes: string[], periodo: string): Promise<{
    validCodes: string[];
    invalidCodes: Array<{ codigo: string; errors: string[] }>;
    warnings: string[];
  }> {
    const validCodes: string[] = [];
    const invalidCodes: Array<{ codigo: string; errors: string[] }> = [];
    const warnings: string[] = [];

    for (const codigo of codes) {
      const validation = await this.validateCode(codigo, periodo);
      
      if (validation.isValid) {
        validCodes.push(codigo);
        warnings.push(...validation.warnings);
      } else {
        invalidCodes.push({
          codigo,
          errors: validation.errors
        });
      }
    }

    return {
      validCodes,
      invalidCodes,
      warnings
    };
  }

  /**
   * Obter categoria a partir do tipo
   */
  private static getCategoriaFromTipo(tipo: string): string {
    const categorias: Record<string, string> = {
      'receita': 'Receitas',
      'deducao': 'Deduções',
      'retencao': 'Retenções',
      'outros': 'Outros'
    };

    return categorias[tipo] || 'Desconhecida';
  }

  /**
   * Exportar códigos para CSV
   */
  static async exportCodesToCSV(tipo?: 'receita' | 'deducao' | 'retencao' | 'outros'): Promise<string> {
    try {
      const codes = tipo 
        ? await this.dctfCodeModel.findByTipo(tipo)
        : await this.dctfCodeModel.findAll();

      const headers = ['Código', 'Descrição', 'Tipo', 'Ativo', 'Período Início', 'Período Fim'];
      const rows = codes.map(code => [
        code.codigo,
        code.descricao,
        code.tipo,
        code.ativo ? 'Sim' : 'Não',
        code.periodoInicio || '',
        code.periodoFim || ''
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      return csvContent;
    } catch (error: any) {
      throw new Error(`Erro ao exportar códigos: ${error.message}`);
    }
  }
}
