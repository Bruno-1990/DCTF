/**
 * Serviço de Geração Automática de Regras
 * Consulta RAG e gera regras Python para casos não cobertos
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface DivergenciaSemRegra {
  id: string;
  tipo: string;
  campo: string;
  valor_xml: number;
  valor_efd: number;
  diferenca: number;
  contexto_fiscal?: {
    cfop?: string;
    cst?: string;
    csosn?: string;
    finalidade_nfe?: string;
    segmento?: string;
  };
  chave_nfe: string;
}

interface RegraGerada {
  id: string;
  padrao: string;
  cfop: string;
  cst: string;
  titulo: string;
  explicacao_rag: string;
  codigo_python: string;
  confianca: number;
  casos_abrangidos: number;
  referencias_legais: string[];
  tipo_acao: 'LEGITIMO' | 'REVISAR' | 'ERRO';
}

class SpedRuleGeneratorService {
  
  /**
   * Gera regras automáticas para divergências não cobertas
   */
  async gerarRegrasAutomaticas(
    validationId: string,
    divergenciasSemRegra: DivergenciaSemRegra[]
  ): Promise<RegraGerada[]> {
    
    console.log(`[RuleGenerator] Gerando regras para ${divergenciasSemRegra.length} divergências`);
    
    // 1. Agrupar por padrão (CFOP + CST)
    const grupos = this.agruparPorPadrao(divergenciasSemRegra);
    
    console.log(`[RuleGenerator] Agrupadas em ${Object.keys(grupos).length} padrões únicos`);
    
    // 2. Para cada grupo, gerar regra via RAG
    const regrasGeradas: RegraGerada[] = [];
    
    for (const [padrao, divergencias] of Object.entries(grupos)) {
      // Só gerar regra se tiver 2+ casos (evitar falsos positivos)
      if (divergencias.length >= 2) {
        console.log(`[RuleGenerator] Consultando RAG para padrão: ${padrao}`);
        
        try {
          const regra = await this.gerarRegraPorRAG(padrao, divergencias);
          
          if (regra) {
            regrasGeradas.push(regra);
          }
        } catch (error) {
          console.error(`[RuleGenerator] Erro ao gerar regra para ${padrao}:`, error);
        }
      }
    }
    
    // 3. Salvar log para auditoria
    await this.salvarLogGeracaoRegras(validationId, regrasGeradas);
    
    return regrasGeradas;
  }
  
  /**
   * Agrupa divergências por padrão (CFOP + CST)
   */
  private agruparPorPadrao(divergencias: DivergenciaSemRegra[]): Record<string, DivergenciaSemRegra[]> {
    const grupos: Record<string, DivergenciaSemRegra[]> = {};
    
    for (const div of divergencias) {
      const cfop = div.contexto_fiscal?.cfop || 'VAZIO';
      const cst = div.contexto_fiscal?.cst || div.contexto_fiscal?.csosn || 'VAZIO';
      const padrao = `CFOP_${cfop}_CST_${cst}`;
      
      if (!grupos[padrao]) {
        grupos[padrao] = [];
      }
      
      grupos[padrao].push(div);
    }
    
    return grupos;
  }
  
  /**
   * Gera regra consultando RAG
   */
  private async gerarRegraPorRAG(
    padrao: string,
    divergencias: DivergenciaSemRegra[]
  ): Promise<RegraGerada | null> {
    
    const [_, cfop, __, cst] = padrao.split('_');
    
    // Montar query para RAG
    const query = this.construirQueryRAG(cfop, cst, divergencias);
    
    try {
      // Executar consulta ao RAG (Python)
      const resultadoRAG = await this.consultarRAG(query);
      
      if (!resultadoRAG.success) {
        console.error(`[RuleGenerator] RAG falhou para ${padrao}`);
        return null;
      }
      
      // Gerar código Python da regra
      const codigoPython = this.gerarCodigoPython(cfop, cst, resultadoRAG, divergencias);
      
      // Determinar tipo de ação baseado na resposta do RAG
      const tipoAcao = this.determinarTipoAcao(resultadoRAG.answer);
      
      return {
        id: `regra_${Date.now()}_${padrao}`,
        padrao,
        cfop,
        cst,
        titulo: this.gerarTituloRegra(cfop, cst),
        explicacao_rag: resultadoRAG.answer,
        codigo_python: codigoPython,
        confianca: resultadoRAG.confianca || 0,
        casos_abrangidos: divergencias.length,
        referencias_legais: resultadoRAG.referencias || [],
        tipo_acao: tipoAcao
      };
      
    } catch (error) {
      console.error(`[RuleGenerator] Erro ao consultar RAG para ${padrao}:`, error);
      return null;
    }
  }
  
  /**
   * Consulta o RAG via script Python
   */
  private async consultarRAG(query: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(process.cwd(), 'python', 'sped', 'v2', 'api', 'rag_query_endpoint.py');
      
      const python = spawn('python', [pythonScript, query, '5']);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          console.error(`[RuleGenerator] Python RAG stderr: ${stderr}`);
          reject(new Error(`Python script exited with code ${code}`));
          return;
        }
        
        try {
          // Extrair JSON do stdout (pode ter logs antes)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const resultado = JSON.parse(jsonMatch[0]);
            resolve(resultado);
          } else {
            reject(new Error('Não foi possível extrair JSON da resposta'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  /**
   * Constrói query para RAG
   */
  private construirQueryRAG(cfop: string, cst: string, divergencias: DivergenciaSemRegra[]): string {
    const tipo_div = divergencias[0].tipo;
    const campo = divergencias[0].campo;
    const segmento = divergencias[0].contexto_fiscal?.segmento || 'COMERCIO';
    
    const diferencaMedia = divergencias.reduce((acc, d) => acc + Math.abs(d.diferenca), 0) / divergencias.length;
    
    return `
Operação fiscal com CFOP ${cfop} e CST ${cst} no segmento ${segmento}.

Contexto:
- Detectamos ${divergencias.length} casos onde há diferença no campo "${campo}" entre XML e SPED
- Tipo de divergência: ${tipo_div}
- Diferenças médias: R$ ${diferencaMedia.toFixed(2)}

Perguntas:
1. É esperado haver diferença entre XML e SPED para este CFOP + CST?
2. Quais ajustes são permitidos (C197, E111)?
3. Existe regra específica no RICMS-ES ou Guia Prático EFD?
4. Esta divergência deve ser classificada como ERRO, REVISAR ou LEGÍTIMO?
5. Qual é a referência legal aplicável?

Por favor, seja específico e cite artigos de lei quando possível.
    `.trim();
  }
  
  /**
   * Gera código Python da regra
   */
  private gerarCodigoPython(
    cfop: string,
    cst: string,
    resultadoRAG: any,
    divergencias: DivergenciaSemRegra[]
  ): string {
    
    const tipoAcao = this.determinarTipoAcao(resultadoRAG.answer);
    const score = this.calcularScore(tipoAcao);
    const comentario = this.extrairComentario(resultadoRAG.answer);
    
    return `
# Regra gerada automaticamente em ${new Date().toISOString()}
# Baseada em ${divergencias.length} casos similares
# Confiança RAG: ${resultadoRAG.confianca}%

if cfop == '${cfop}' and cst == '${cst}':
    # ${comentario}
    score += ${score}
    explicacao_parts.append("${this.sanitizarTexto(comentario)}")
    regra_aplicada = "REGRA_AUTO_${cfop}_${cst}"
    return (ClassificacaoDivergencia.${tipoAcao}, ${score}, "; ".join(explicacao_parts))
`.trim();
  }
  
  /**
   * Determina tipo de ação baseado na resposta do RAG
   */
  private determinarTipoAcao(respostaRAG: string): 'LEGITIMO' | 'REVISAR' | 'ERRO' {
    const texto = respostaRAG.toLowerCase();
    
    if (texto.includes('legítim') || texto.includes('permit') || texto.includes('esperado')) {
      return 'LEGITIMO';
    } else if (texto.includes('erro') || texto.includes('incorret') || texto.includes('inválid')) {
      return 'ERRO';
    } else {
      return 'REVISAR';
    }
  }
  
  /**
   * Calcula score baseado no tipo de ação
   */
  private calcularScore(tipoAcao: string): number {
    switch (tipoAcao) {
      case 'LEGITIMO': return -50;
      case 'REVISAR': return 60;
      case 'ERRO': return 90;
      default: return 50;
    }
  }
  
  /**
   * Gera título descritivo para a regra
   */
  private gerarTituloRegra(cfop: string, cst: string): string {
    const titulosCFOP: Record<string, string> = {
      '5102': 'Venda de mercadoria',
      '5405': 'Venda com redução de base',
      '6102': 'Venda interestadual',
      '5910': 'Remessa em bonificação',
    };
    
    const tituloCST: Record<string, string> = {
      '00': 'Tributada integralmente',
      '20': 'Com redução de base de cálculo',
      '60': 'ICMS cobrado por substituição tributária',
    };
    
    return `${titulosCFOP[cfop] || `CFOP ${cfop}`} - ${tituloCST[cst] || `CST ${cst}`}`;
  }
  
  /**
   * Extrai comentário da resposta RAG
   */
  private extrairComentario(respostaRAG: string): string {
    const primeiraFrase = respostaRAG.split('.')[0];
    return primeiraFrase.substring(0, 150);
  }
  
  /**
   * Sanitiza texto para uso em código Python
   */
  private sanitizarTexto(texto: string): string {
    return texto.replace(/"/g, '\\"').replace(/\n/g, ' ').substring(0, 200);
  }
  
  /**
   * Salva log de geração de regras
   */
  private async salvarLogGeracaoRegras(validationId: string, regras: RegraGerada[]): Promise<void> {
    const log = {
      validationId,
      timestamp: new Date().toISOString(),
      total_regras_geradas: regras.length,
      regras: regras.map(r => ({
        padrao: r.padrao,
        confianca: r.confianca,
        casos_abrangidos: r.casos_abrangidos
      }))
    };
    
    const logDir = path.join(process.cwd(), '.taskmaster', 'validation_rules');
    await fs.mkdir(logDir, { recursive: true });
    
    const logFile = path.join(logDir, 'generation_log.jsonl');
    await fs.appendFile(logFile, JSON.stringify(log) + '\n');
  }
  
  /**
   * Persiste regras customizadas aprovadas
   */
  async persistirRegrasCustomizadas(validationId: string, regrasAprovadas: RegraGerada[]): Promise<void> {
    console.log(`[RuleGenerator] Persistindo ${regrasAprovadas.length} regras aprovadas`);
    
    const rulesDir = path.join(process.cwd(), '.taskmaster', 'validation_rules');
    await fs.mkdir(rulesDir, { recursive: true });
    
    // Carregar regras existentes
    const rulesFile = path.join(rulesDir, 'custom_rules.json');
    let regrasExistentes: Record<string, any> = {};
    
    try {
      const conteudo = await fs.readFile(rulesFile, 'utf-8');
      regrasExistentes = JSON.parse(conteudo);
    } catch (error) {
      // Arquivo não existe ainda
    }
    
    // Adicionar novas regras
    for (const regra of regrasAprovadas) {
      regrasExistentes[regra.padrao] = {
        titulo: regra.titulo,
        explicacao: regra.explicacao_rag,
        tipo_acao: regra.tipo_acao,
        confianca: regra.confianca,
        referencias: regra.referencias_legais,
        criado_em: new Date().toISOString(),
        validation_id: validationId,
        casos_abrangidos: regra.casos_abrangidos
      };
    }
    
    // Salvar arquivo atualizado
    await fs.writeFile(rulesFile, JSON.stringify(regrasExistentes, null, 2), 'utf-8');
    
    console.log(`[RuleGenerator] Regras salvas em ${rulesFile}`);
  }
}

export default new SpedRuleGeneratorService();

