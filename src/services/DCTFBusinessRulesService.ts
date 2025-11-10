/**
 * Serviço de Regras de Negócio DCTF
 * Implementa validações complexas e regras de consistência para DCTF
 */

import { supabase } from '../config/database';
import { DCTFValidationService } from './DCTFValidationService';
import { DCTFCalculationService } from './DCTFCalculationService';

export interface BusinessRuleResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface DCTFConsistencyCheck {
  receitaBruta: number;
  receitaLiquida: number;
  totalDeducoes: number;
  totalImpostos: number;
  isConsistent: boolean;
  discrepancies: string[];
}

export class DCTFBusinessRulesService {
  /**
   * Validar regras de negócio para criação de DCTF
   */
  static async validateDCTFCreation(dados: {
    clienteId: string;
    periodo: string;
    arquivo: {
      nome: string;
      tamanho: number;
      tipo: string;
    };
  }): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // 1. Validar período (antes de qualquer acesso a DB)
      const validacaoPeriodo = DCTFValidationService.validatePeriodoFiscal(dados.periodo);
      if (!validacaoPeriodo.isValid) {
        errors.push(...validacaoPeriodo.errors);
      }
      warnings.push(...validacaoPeriodo.warnings);

      // 2. Validar arquivo (antes de qualquer acesso a DB)
      if (dados.arquivo.tamanho > 10 * 1024 * 1024) { // 10MB
        errors.push('Arquivo excede o limite de 10MB');
      }

      const tiposPermitidos = ['xls', 'xlsx', 'csv'];
      const extensao = dados.arquivo.nome.split('.').pop()?.toLowerCase();
      if (!extensao || !tiposPermitidos.includes(extensao)) {
        errors.push(`Tipo de arquivo não permitido. Use: ${tiposPermitidos.join(', ')}`);
      }

      // Se já houver erros críticos, retornar cedo
      if (errors.length > 0) {
        return { isValid: false, errors, warnings, suggestions };
      }

      // 3. Validar se cliente existe
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('id, nome, ativo')
        .eq('id', dados.clienteId)
        .single();

      if (clienteError || !cliente) {
        errors.push('Cliente não encontrado');
      } else if (!cliente.ativo) {
        errors.push('Cliente está inativo');
      }

      // 4. Verificar duplicidade de DCTF no período
      const { data: dctfExistente, error: dctfError } = await supabase
        .from('dctf_declaracoes')
        .select('id, status')
        .eq('cliente_id', dados.clienteId)
        .eq('periodo', dados.periodo)
        .single();

      if (dctfExistente && !dctfError) {
        errors.push(`Já existe DCTF para este cliente no período ${dados.periodo} (Status: ${dctfExistente.status})`);
      }

      // 5. Sugestões baseadas no período
      const [ano, mes] = dados.periodo.split('-').map(Number);
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const anoAtual = agora.getFullYear();

      if (ano === anoAtual && mes === mesAtual) {
        suggestions.push('DCTF do mês atual - verificar se todos os dados estão disponíveis');
      } else if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
        suggestions.push('DCTF de período anterior - verificar se não há declarações em atraso');
      }

    } catch (error: any) {
      errors.push(`Erro na validação: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validar consistência de dados DCTF
   */
  static async validateDCTFConsistency(dctfId: string): Promise<DCTFConsistencyCheck> {
    try {
      // Buscar dados do DCTF
      const { data: dctf, error: dctfError } = await supabase
        .from('dctf_declaracoes')
        .select('*')
        .eq('id', dctfId)
        .single();

      if (dctfError || !dctf) {
        throw new Error('DCTF não encontrado');
      }

      // Buscar dados detalhados
      const { data: dados, error: dadosError } = await supabase
        .from('dctf_dados')
        .select('codigo, valor')
        .eq('dctf_id', dctfId);

      if (dadosError) {
        throw new Error('Erro ao buscar dados do DCTF');
      }

      // Calcular totais
      const receitaBruta = dados
        .filter(d => d.codigo.startsWith('001'))
        .reduce((sum, d) => sum + Number(d.valor), 0);

      const totalDeducoes = dados
        .filter(d => d.codigo.startsWith('1') && !d.codigo.startsWith('001'))
        .reduce((sum, d) => sum + Number(d.valor), 0);

      const receitaLiquida = receitaBruta - totalDeducoes;

      const totalImpostos = dados
        .filter(d => d.codigo.startsWith('2'))
        .reduce((sum, d) => sum + Number(d.valor), 0);

      // Verificar consistência
      const discrepancies: string[] = [];
      const tolerancia = 0.01;

      if (Math.abs(dctf.receita_bruta - receitaBruta) > tolerancia) {
        discrepancies.push(`Receita bruta: informada ${dctf.receita_bruta}, calculada ${receitaBruta}`);
      }

      if (Math.abs(dctf.receita_liquida - receitaLiquida) > tolerancia) {
        discrepancies.push(`Receita líquida: informada ${dctf.receita_liquida}, calculada ${receitaLiquida}`);
      }

      if (Math.abs(dctf.total_impostos - totalImpostos) > tolerancia) {
        discrepancies.push(`Total impostos: informado ${dctf.total_impostos}, calculado ${totalImpostos}`);
      }

      return {
        receitaBruta,
        receitaLiquida,
        totalDeducoes,
        totalImpostos,
        isConsistent: discrepancies.length === 0,
        discrepancies
      };

    } catch (error: any) {
      throw new Error(`Erro na validação de consistência: ${error.message}`);
    }
  }

  /**
   * Validar regras de negócio para dados DCTF
   */
  static async validateDCTFData(dados: {
    codigo: string;
    valor: number;
    periodo: string;
    cnpjCpf?: string;
    codigoReceita?: string;
  }): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 1. Validações básicas
    const validacaoBasica = DCTFValidationService.validateDCTFLinha(dados);
    errors.push(...validacaoBasica.errors);
    warnings.push(...validacaoBasica.warnings);

    // 2. Validações específicas por tipo de código
    if (dados.codigo.startsWith('001')) {
      // Códigos de receita
      if (dados.valor <= 0) {
        errors.push('Valores de receita devem ser positivos');
      }

      if (dados.valor > 1000000000) { // 1 bilhão
        warnings.push('Valor de receita muito alto - verificar se está correto');
      }
    }

    if (dados.codigo.startsWith('1') && !dados.codigo.startsWith('001')) {
      // Códigos de dedução
      if (dados.valor < 0) {
        errors.push('Valores de dedução não podem ser negativos');
      }

      if (dados.valor > 100000000) { // 100 milhões
        warnings.push('Valor de dedução muito alto - verificar se está correto');
      }
    }

    if (dados.codigo.startsWith('2')) {
      // Códigos de retenção
      if (dados.valor < 0) {
        errors.push('Valores de retenção não podem ser negativos');
      }

      // Validar se valor não excede base de cálculo
      if (dados.codigoReceita) {
        const validacaoReceita = DCTFValidationService.validateCodigoReceita(dados.codigoReceita);
        if (!validacaoReceita.isValid) {
          errors.push('Código de receita inválido para retenção');
        }
      }
    }

    // 3. Sugestões baseadas no valor
    if (dados.valor === 0) {
      suggestions.push('Valor zero - verificar se está correto');
    }

    if (dados.valor > 0 && dados.valor < 1) {
      suggestions.push('Valor muito baixo - verificar se está em reais');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validar regras de negócio para análise
   */
  static async validateAnalysisCreation(dctfId: string, tipoAnalise: string): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Sugestões baseadas no tipo de análise (independente do DB)
    switch (tipoAnalise) {
      case 'consistencia':
        suggestions.push('Análise de consistência - verificar cálculos e totais');
        break;
      case 'conformidade':
        suggestions.push('Análise de conformidade - verificar regras fiscais');
        break;
      case 'performance':
        suggestions.push('Análise de performance - verificar indicadores de negócio');
        break;
    }

    try {
      // Verificar se DCTF existe e está no status correto
      const { data: dctf, error: dctfError } = await supabase
        .from('dctf_declaracoes')
        .select('id, status, periodo')
        .eq('id', dctfId)
        .single();

      if (dctfError || !dctf) {
        errors.push('DCTF não encontrado');
      } else if (!['validado', 'processado'].includes(dctf.status)) {
        errors.push(`DCTF deve estar validado ou processado para criar análise (Status atual: ${dctf.status})`);
      }

      // Verificar análise duplicada
      const { data: analiseExistente, error: analiseError } = await supabase
        .from('analises')
        .select('id, tipo, status')
        .eq('dctf_id', dctfId)
        .eq('tipo', tipoAnalise)
        .single();

      if (analiseExistente && !analiseError) {
        warnings.push(`Já existe análise do tipo '${tipoAnalise}' para este DCTF`);
      }

    } catch (error: any) {
      errors.push(`Erro na validação: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validar regras de negócio para geração de relatório
   */
  static async validateReportGeneration(dctfId: string, tipoRelatorio: string): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Sugestões baseadas no tipo de relatório (independente do DB)
    switch (tipoRelatorio) {
      case 'executivo':
        suggestions.push('Relatório executivo - incluir resumo e principais indicadores');
        break;
      case 'detalhado':
        suggestions.push('Relatório detalhado - incluir todos os dados e análises');
        break;
      case 'fiscal':
        suggestions.push('Relatório fiscal - focar em aspectos tributários');
        break;
    }

    try {
      // Verificar se DCTF está processado
      const { data: dctf, error: dctfError } = await supabase
        .from('dctf_declaracoes')
        .select('id, status, periodo, cliente_id')
        .eq('id', dctfId)
        .single();

      if (dctfError || !dctf) {
        errors.push('DCTF não encontrado');
      } else if (dctf.status !== 'processado') {
        errors.push(`DCTF deve estar processado para gerar relatório (Status atual: ${dctf.status})`);
      }

      // Verificar se cliente está ativo
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('id, nome, ativo')
        .eq('id', dctf?.cliente_id)
        .single();

      if (clienteError || !cliente) {
        errors.push('Cliente não encontrado');
      } else if (!cliente.ativo) {
        warnings.push('Cliente está inativo - relatório pode não ser necessário');
      }

      // Verificar relatório recente
      const { data: relatorioRecente, error: relatorioError } = await supabase
        .from('relatorios')
        .select('id, tipo, created_at')
        .eq('dctf_id', dctfId)
        .eq('tipo', tipoRelatorio)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .single();

      if (relatorioRecente && !relatorioError) {
        warnings.push(`Relatório do tipo '${tipoRelatorio}' foi gerado recentemente`);
      }

    } catch (error: any) {
      errors.push(`Erro na validação: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Aplicar regras de negócio para atualização de status
   */
  static async validateStatusTransition(
    dctfId: string, 
    statusAtual: string, 
    novoStatus: string
  ): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Definir transições válidas
    const transicoesValidas: Record<string, string[]> = {
      'rascunho': ['validando', 'erro'],
      'validando': ['validado', 'erro'],
      'validado': ['processando', 'erro'],
      'processando': ['processado', 'erro'],
      'processado': ['erro'], // Só pode ir para erro se houver problema
      'erro': ['rascunho', 'validando'] // Pode voltar para correção
    };

    // Verificar se transição é válida
    if (!transicoesValidas[statusAtual]?.includes(novoStatus)) {
      errors.push(`Transição de status inválida: ${statusAtual} → ${novoStatus}`);
    }

    // Validações específicas por status
    if (novoStatus === 'validado') {
      // Verificar se DCTF tem dados válidos
      const { data: dados, error: dadosError } = await supabase
        .from('dctf_dados')
        .select('id')
        .eq('dctf_id', dctfId)
        .limit(1);

      if (dadosError || !dados || dados.length === 0) {
        errors.push('DCTF deve ter dados para ser validado');
      }
    }

    if (novoStatus === 'processado') {
      // Verificar se DCTF está validado
      if (statusAtual !== 'validado') {
        errors.push('DCTF deve estar validado para ser processado');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
}

