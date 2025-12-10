/**
 * MÓDULO: Divergências de Valores
 * 
 * Objetivo: Identificar divergências de valores agrupadas por Chave de NF.
 * 
 * Este módulo busca divergências de valores encontradas em validações SPED
 * e as agrupa por chave de NF para facilitar a análise.
 * 
 * Fonte de dados: Validações SPED (tabela sped_validations ou dados em memória)
 * 
 * TODO: Implementar busca real de divergências do banco de dados ou cache de validações
 */

export interface DivergenciaValor {
  chaveNf: string;
  motivo: string;
  campo?: string;
  valorEsperado?: string;
  valorEncontrado?: string;
  severidade: 'high' | 'medium' | 'low';
  categoria?: string;
  descricao?: string;
}

export interface DivergenciaPorChave {
  chaveNf: string;
  totalDivergencias: number;
  divergencias: DivergenciaValor[];
  severidadeMaxima: 'high' | 'medium' | 'low';
}

/**
 * Determina a severidade máxima de uma lista de divergências
 */
function determinarSeveridadeMaxima(divergencias: DivergenciaValor[]): 'high' | 'medium' | 'low' {
  if (divergencias.some(d => d.severidade === 'high')) return 'high';
  if (divergencias.some(d => d.severidade === 'medium')) return 'medium';
  return 'low';
}

/**
 * Agrupa divergências por chave de NF
 */
function agruparPorChave(divergencias: DivergenciaValor[]): DivergenciaPorChave[] {
  const agrupadas = new Map<string, DivergenciaValor[]>();

  // Agrupar por chave
  for (const divergencia of divergencias) {
    const chave = divergencia.chaveNf || 'SEM_CHAVE';
    if (!agrupadas.has(chave)) {
      agrupadas.set(chave, []);
    }
    agrupadas.get(chave)!.push(divergencia);
  }

  // Converter para array e calcular totais
  const resultado: DivergenciaPorChave[] = [];
  for (const [chave, divs] of agrupadas.entries()) {
    resultado.push({
      chaveNf: chave,
      totalDivergencias: divs.length,
      divergencias: divs,
      severidadeMaxima: determinarSeveridadeMaxima(divs),
    });
  }

  // Ordenar por severidade (high primeiro) e depois por total de divergências
  resultado.sort((a, b) => {
    const severidadeOrder = { high: 3, medium: 2, low: 1 };
    const severidadeDiff = severidadeOrder[b.severidadeMaxima] - severidadeOrder[a.severidadeMaxima];
    if (severidadeDiff !== 0) return severidadeDiff;
    return b.totalDivergencias - a.totalDivergencias;
  });

  return resultado;
}

/**
 * Converte divergências do formato SPED para o formato do módulo
 */
function converterDivergenciasSPED(divergenciasSPED: any[]): DivergenciaValor[] {
  return divergenciasSPED
    .filter((div: any) => div['Chave NF-e'] || div.CHAVE || div.chaveNf)
    .map((div: any) => {
      const chaveNf = div['Chave NF-e'] || div.CHAVE || div.chaveNf || '';
      const descricao = div.Descrição || div.Descricao || div.descricao || '';
      const motivo = div.Campo || div.campo || 'Divergência de valor';
      const categoria = div.Categoria || div.categoria || '';
      
      // Determinar severidade baseado na severidade do SPED ou padrão
      let severidade: 'high' | 'medium' | 'low' = 'medium';
      const severidadeSPED = (div.Severidade || div.severidade || '').toLowerCase();
      if (severidadeSPED.includes('alta') || severidadeSPED === 'high') {
        severidade = 'high';
      } else if (severidadeSPED.includes('baixa') || severidadeSPED === 'low') {
        severidade = 'low';
      }

      return {
        chaveNf,
        motivo: motivo || descricao || 'Divergência de valor',
        campo: div.Campo || div.campo,
        valorEsperado: div['No SPED'] || div.valorEsperado || div['Valor Esperado'],
        valorEncontrado: div['No XML'] || div.valorEncontrado || div['Valor Encontrado'],
        severidade,
        categoria,
        descricao: descricao || div.Sugestão || div.sugestao,
      };
    });
}

/**
 * Lista divergências de valores agrupadas por chave de NF
 * 
 * TODO: Implementar busca real de divergências:
 * - Buscar validações SPED recentes do banco de dados
 * - Ou buscar de um cache/armazenamento de validações
 * - Ou integrar com o SpedValidationService para obter validações ativas
 */
export async function listarDivergenciasValores(): Promise<DivergenciaPorChave[]> {
  try {
    console.log('[Conferência - Divergências de Valores] 🔍 Iniciando análise...');
    
    // TODO: Implementar busca real de divergências
    // Por enquanto, retornar array vazio
    // Exemplo de como buscar:
    // 1. Buscar validações SPED recentes do banco
    // 2. Extrair divergências de valores
    // 3. Agrupar por chave de NF
    
    // Exemplo de estrutura de dados esperada (para referência):
    // const divergenciasSPED = await buscarDivergenciasSPED();
    // const divergencias = converterDivergenciasSPED(divergenciasSPED);
    // return agruparPorChave(divergencias);
    
    console.log('[Conferência - Divergências de Valores] 📊 Nenhuma divergência encontrada (módulo não implementado)');
    
    return [];
  } catch (error: any) {
    console.error('[Conferência - Divergências de Valores] ❌ Erro ao buscar divergências:', error);
    return [];
  }
}

/**
 * Função auxiliar para buscar divergências de uma validação SPED específica
 * Pode ser usada quando houver integração com o SpedValidationService
 */
export async function buscarDivergenciasDeValidacao(validationId: string): Promise<DivergenciaPorChave[]> {
  try {
    // TODO: Integrar com SpedValidationService para buscar resultado da validação
    // const resultado = await spedValidationService.obterResultado(validationId);
    // const divergenciasSPED = resultado.validacoes?.['Divergencias (todas)'] || [];
    // const divergencias = converterDivergenciasSPED(divergenciasSPED);
    // return agruparPorChave(divergencias);
    
    return [];
  } catch (error: any) {
    console.error('[Conferência - Divergências de Valores] ❌ Erro ao buscar divergências da validação:', error);
    return [];
  }
}


