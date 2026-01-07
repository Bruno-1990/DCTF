/**
 * Rotas para aplicação de correções automáticas no SPED
 * Permite corrigir divergências identificadas e exportar SPED corrigido
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getSpedValidationService } from '../services/SpedValidationServiceSingleton';

const router = Router();
const execAsync = promisify(exec);
const spedValidationService = getSpedValidationService();

// Mutex para evitar race condition em correções simultâneas
const correcaoLocks = new Map<string, Promise<any>>();

// Middleware de debug para todas as rotas
router.use((req, res, next) => {
  console.log(`[sped_correcoes] ${req.method} ${req.path}`);
  next();
});

/**
 * POST /api/sped/correcoes/aplicar
 * Aplica correção automática em uma divergência específica
 */
router.post('/aplicar', async (req: Request, res: Response) => {
  const { validationId, correcao } = req.body;

  if (!validationId || !correcao) {
    return res.status(400).json({
      error: 'validationId e correcao são obrigatórios'
    });
  }

  // 🔥 NOVO: Detectar se é lote (array) ou única correção (objeto)
  const isLote = Array.isArray(correcao);
  const correcoes = isLote ? correcao : [correcao];
  
  console.log(`[sped_correcoes] ${isLote ? '🔥 MODO LOTE' : 'MODO ÚNICO'}: ${correcoes.length} correção(ões)`);

  // MUTEX: Aguardar correções anteriores para o mesmo validationId
  const lockKey = validationId;
  if (correcaoLocks.has(lockKey)) {
    console.log(`[sped_correcoes] ⏳ Aguardando correção anterior para ${validationId}...`);
    try {
      await correcaoLocks.get(lockKey);
    } catch (e) {
      // Ignorar erro da correção anterior
    }
  }

  // Criar promise para esta correção
  const correcaoPromise = (async () => {
    try {

    // Extrair valores comuns da primeira correção (para validações posteriores)
    const { registro_corrigir: registro_corrigir_ref, campo: campo_ref, valor_correto: valor_correto_ref, 
            chave: chave_ref, cfop: cfop_ref, cst: cst_ref, linha_sped: linha_sped_ref } = correcoes[0];
    
    // Validar estrutura de todas as correções
    for (const c of correcoes) {
      const { registro_corrigir, campo, valor_correto, chave, cfop, cst, linha_sped } = c;
      
      // Validação 1: Campos obrigatórios
      if (!registro_corrigir || !campo || valor_correto === undefined) {
        return res.status(400).json({
          error: 'correcao deve conter: registro_corrigir, campo, valor_correto'
        });
      }
      
      // Validação 2: Tipo de valor_correto
      if (typeof valor_correto !== 'number' || isNaN(valor_correto)) {
        return res.status(400).json({
          error: 'valor_correto deve ser um número válido',
          recebido: typeof valor_correto,
          valor: valor_correto
        });
      }
      
      // Validação 3: Registro válido
      const registros_validos = ['C100', 'C170', 'C190', 'DESCONHECIDO'];
      if (!registros_validos.includes(registro_corrigir)) {
        return res.status(400).json({
          error: `registro_corrigir inválido: ${registro_corrigir}`,
          sugestao: `Deve ser um dos: ${registros_validos.join(', ')}`
        });
      }
      
      // Validação 4: Campo não vazio
      if (!campo || String(campo).trim().length === 0) {
        return res.status(400).json({
          error: 'campo não pode estar vazio'
        });
      }
      
      // Validação 5: Chave NF quando necessário para C100
      if (registro_corrigir === 'C100' && (!chave || String(chave).trim().length === 0)) {
        return res.status(400).json({
          error: 'chave NF é obrigatória para correção em C100'
        });
      }
      
      // Validação 6: CFOP/CST ou chave quando necessário para C190
      if (registro_corrigir === 'C190' && !cfop && !cst && !chave) {
        return res.status(400).json({
          error: 'Para C190, é necessário fornecer CFOP/CST ou chave NF para localizar o registro',
          sugestao: 'Forneça pelo menos um dos seguintes: cfop, cst, ou chave'
        });
      }
      
      // Validação 7: Valor não negativo para campos monetários
      const campos_monetarios = ['VL_BC_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'VL_ICMS_ST', 'VL_IPI', 'VL_DESC', 
                                 'BC ST', 'ST', 'ICMS', 'BC ICMS', 'IPI', 'Desconto'];
      if (campos_monetarios.some(c => campo.includes(c)) && valor_correto < 0) {
        return res.status(400).json({
          error: `Valor não pode ser negativo para campo ${campo}`,
          valor_recebido: valor_correto
        });
      }
      
      // Validação 8: linha_sped válida (se fornecida)
      if (linha_sped !== undefined) {
        const linhaNum = parseInt(String(linha_sped));
        if (isNaN(linhaNum) || linhaNum < 1) {
          return res.status(400).json({
            error: `linha_sped deve ser um número inteiro maior que 0`,
            recebido: linha_sped
          });
        }
      }
    }
    
    // Todas as validações passaram! Agora vamos processar
    // Para lote, usar a primeira correção para obter dados comuns (validationId, tmpDir, etc.)
    const primeiraCorrecao = correcoes[0];

    // Obter caminho do arquivo SPED
    const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
    const spedOriginalPath = path.join(tmpDir, 'sped.txt');
    const spedCorrigidoPath = path.join(tmpDir, 'sped_corrigido.txt');
    
    // CRÍTICO: Se já existe sped_corrigido.txt, usar ele como base (correções acumulativas)
    // Isso permite aplicar múltiplas correções para a mesma chave sem sobrescrever
    let spedPath = spedOriginalPath;
    if (fs.existsSync(spedCorrigidoPath)) {
      console.log('[sped_correcoes] ✅ Usando sped_corrigido.txt como base (correções acumulativas)');
      spedPath = spedCorrigidoPath;
    } else {
      console.log('[sped_correcoes] Usando sped.txt original como base');
    }

    // Validação 9: Arquivo SPED existe
    if (!fs.existsSync(spedPath)) {
      return res.status(404).json({
        error: 'Arquivo SPED não encontrado para esta validação',
        caminho: spedPath
      });
    }
    
    // Validação 10: Arquivo SPED não está vazio
    try {
      const stats = fs.statSync(spedPath);
      if (stats.size === 0) {
        return res.status(400).json({
          error: 'Arquivo SPED está vazio',
          caminho: spedPath
        });
      }
      
      // Validação 11: Arquivo não é muito grande (prevenir DoS)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      if (stats.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `Arquivo SPED muito grande: ${(stats.size / 1024 / 1024).toFixed(2)}MB`,
          maximo_permitido: `${(MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB`
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        error: 'Erro ao verificar arquivo SPED',
        detalhes: err.message
      });
    }

    // Validação 12: Verificar se arquivo SPED contém registros C100 (necessário para correções C190 sem CFOP/CST)
    // CORREÇÃO: Verificar se cfop e cst são strings vazias ou undefined/null
    const cfopVazio = !cfop_ref || String(cfop_ref).trim() === '';
    const cstVazio = !cst_ref || String(cst_ref).trim() === '';
    const precisaC100 = registro_corrigir_ref === 'C190' && cfopVazio && cstVazio && chave_ref;
    
    console.log('[sped_correcoes] Validação C100:', {
      registro_corrigir: registro_corrigir_ref,
      cfop: cfop_ref || '(vazio)',
      cst: cst_ref || '(vazio)',
      chave: chave_ref ? `${chave_ref.substring(0, 20)}...` : '(sem chave)',
      cfopVazio,
      cstVazio,
      precisaC100
    });
    
    if (precisaC100) {
      try {
        console.log('[sped_correcoes] Verificando se arquivo SPED contém C100...');
        const spedContent = fs.readFileSync(spedPath, 'latin1');
        const temC100 = spedContent.includes('|C100|');
        
        console.log('[sped_correcoes] Resultado verificação C100:', {
          temC100,
          tamanho_arquivo: spedContent.length,
          primeiras_linhas: spedContent.split('\n').slice(0, 5).join(' | ')
        });
        
        if (!temC100) {
          // Contar outros registros para diagnóstico
          const registrosEncontrados: Record<string, number> = {};
          spedContent.split('\n').slice(0, 500).forEach(line => {
            const match = line.match(/^\|(\d{4})\|/);
            if (match) {
              const reg = match[1];
              registrosEncontrados[reg] = (registrosEncontrados[reg] || 0) + 1;
            }
          });
          
          console.error('[sped_correcoes] ❌ Arquivo SPED não contém C100. Registros encontrados:', registrosEncontrados);
          
          return res.status(400).json({
            error: 'Arquivo SPED não contém registros C100',
            detalhes: `O arquivo SPED não contém registros C100 (Documentos Fiscais), que são necessários para aplicar correções em C190 quando CFOP/CST não são fornecidos.`,
            registros_encontrados: Object.keys(registrosEncontrados).slice(0, 20),
            sugestao: 'Verifique se o arquivo SPED está completo e contém o Bloco C (Documentos Fiscais). Se o arquivo contém apenas cadastros, não é possível aplicar correções em C190 sem fornecer CFOP e CST explicitamente.'
          });
        }
        
        console.log('[sped_correcoes] ✅ Arquivo SPED contém C100, prosseguindo com correção...');
      } catch (error: any) {
        console.error('[sped_correcoes] Erro ao verificar C100 no arquivo:', error);
        // Continuar mesmo se houver erro na verificação (não bloquear)
      }
    } else {
      console.log('[sped_correcoes] Validação C100 não necessária (CFOP/CST fornecidos ou não é C190)');
    }

    // Executar script Python para aplicar correção
    const pythonScript = path.join(__dirname, '../../python/sped/aplicar_correcao.py');
    
    // IMPORTANTE: Sempre salvar no mesmo arquivo (sped_corrigido.txt) para acumular correções
    const outputPath = spedCorrigidoPath;

    // Salvar correção(ões) em arquivo temporário
    // 🔥 IMPORTANTE: Se for lote, salvar array; se for única, salvar objeto
    const correcaoJsonPath = path.join(tmpDir, 'correcao.json');
    const correcaoParaSalvar = isLote ? correcoes : correcoes[0];
    fs.writeFileSync(correcaoJsonPath, JSON.stringify(correcaoParaSalvar, null, 2), 'utf-8');
    
    console.log(`[sped_correcoes] Correção salva: ${isLote ? `array com ${correcoes.length} itens` : 'objeto único'}`);
    
    // Diretório de XMLs (mesma pasta que o SPED)
    const xmlsDir = tmpDir; // XMLs estão no mesmo diretório temporário
    
    // Passar diretório de XMLs como argumento adicional
    const command = `python "${pythonScript}" "${spedPath}" "${outputPath}" "${correcaoJsonPath}" "${xmlsDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.join(__dirname, '../../python/sped'),
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      if (stderr && !stderr.includes('INFO')) {
        console.error('Erro ao aplicar correção:', stderr);
      }

      // Verificar se arquivo foi criado
      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({
          error: 'Correção não foi aplicada. Arquivo corrigido não foi gerado.'
        });
      }

      // Ler resumo das alterações (se disponível)
      const resumoPath = path.join(tmpDir, 'resumo_correcao.json');
      let resumo = {};
      if (fs.existsSync(resumoPath)) {
        try {
          resumo = JSON.parse(fs.readFileSync(resumoPath, 'utf-8'));
        } catch (e) {
          console.warn('Erro ao ler resumo de correção:', e);
        }
      }

      // ✅ Garantir que realmente houve alteração no arquivo
      // O Python pode retornar "sucesso" mesmo que o valor já estivesse igual,
      // ou se a correção não gerou diff no conteúdo.
      const totalAlteracoes = Number((resumo as any)?.total_alteracoes ?? 0);
      if (!Number.isFinite(totalAlteracoes) || totalAlteracoes <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhuma alteração foi aplicada no SPED corrigido (arquivo permanece igual ao original).',
          arquivo_corrigido: outputPath,
          resumo,
        });
      }

      res.json({
        success: true,
        message: 'Correção aplicada com sucesso',
        arquivo_corrigido: outputPath,
        resumo: resumo
      });

    } catch (error: any) {
      console.error('Erro ao executar script de correção:', error);
      return res.status(500).json({
        error: `Erro ao aplicar correção: ${error.message}`,
        details: error.stderr
      });
    }

  } catch (error: any) {
    console.error('Erro ao processar requisição de correção:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno ao processar correção'
    });
  } finally {
    // Limpar lock após 100ms (dar tempo para próxima correção pegar o lock)
    setTimeout(() => correcaoLocks.delete(lockKey), 100);
  }
  })();

  // Registrar lock
  correcaoLocks.set(lockKey, correcaoPromise);
  
  // Aguardar resultado
  return await correcaoPromise;
});

/**
 * POST /api/sped/correcoes/aplicar-todas
 * Aplica todas as correções automáticas de uma validação
 * IMPORTANTE: Esta rota deve vir ANTES de /:validationId/download para evitar conflito
 */
router.post('/aplicar-todas', async (req: Request, res: Response) => {
  console.log('📥 POST /api/sped/correcoes/aplicar-todas - Rota capturada!');
  console.log('📥 Body recebido:', req.body);
  const { validationId } = req.body || {};
  try {

    if (!validationId) {
      return res.status(400).json({
        error: 'validationId é obrigatório'
      });
    }

    // Obter resultado da validação para identificar todas as correções
    let resultado = await spedValidationService.obterResultado(validationId);
    
    // Fallback: se não encontrou no Map, tenta ler do arquivo diretamente
    if (!resultado || !resultado.reports) {
      console.log(`[aplicar-todas] Resultado não encontrado no Map, tentando ler do arquivo...`);
      const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
      const resultadoPath = path.join(tmpDir, 'resultado.json');
      
      if (fs.existsSync(resultadoPath)) {
        try {
          const resultadoData = fs.readFileSync(resultadoPath, 'utf-8');
          // Limpar NaN, Infinity antes de parsear
          const cleanedData = resultadoData
            .replace(/:\s*NaN\b(?!")/g, ': null')
            .replace(/:\s*Infinity\b(?!")/g, ': null')
            .replace(/:\s*-Infinity\b(?!")/g, ': null');
          resultado = JSON.parse(cleanedData);
          console.log(`[aplicar-todas] ✅ Resultado carregado do arquivo com sucesso`);
        } catch (error: any) {
          console.error(`[aplicar-todas] ❌ Erro ao ler arquivo de resultado:`, error.message);
        }
      } else {
        console.error(`[aplicar-todas] ❌ Arquivo de resultado não existe: ${resultadoPath}`);
      }
    }
    
    if (!resultado || !resultado.reports) {
      console.error(`[aplicar-todas] ❌ Resultado não encontrado para validationId: ${validationId}`);
      return res.status(404).json({
        error: 'Resultado da validação não encontrado',
        validationId: validationId,
        detalhes: 'O resultado não foi encontrado no cache nem no arquivo. Verifique se a validação foi concluída com sucesso.'
      });
    }
    
    console.log(`[aplicar-todas] ✅ Resultado encontrado com ${Object.keys(resultado.reports).length} reports`);

    // Coletar todas as correções de C170 x C190
    const correcoes: any[] = [];
    const divergenciasC170C190 = resultado.reports['C170 x C190 (Divergências)'] || [];
    
    console.log(`[aplicar-todas] Divergências C170 x C190 encontradas: ${divergenciasC170C190.length}`);
    
    // Mapeamento de campos: campo original (do DataFrame) -> campo SPED (para Python)
    const campoMap: { [key: string]: string } = {
      "BC ICMS": "VL_BC_ICMS",
      "ICMS": "VL_ICMS",
      "BC ST": "VL_BC_ICMS_ST",
      "ST": "VL_ICMS_ST",
      "IPI": "VL_IPI",
    };
    
    // Função para validar SOLUCAO_AUTOMATICA (pode vir como boolean, string, número)
    const isValidSolucaoAutomatica = (value: any): boolean => {
      if (value === true || value === 1 || value === "1") return true;
      if (typeof value === "string" && value.toLowerCase() === "true") return true;
      if (typeof value === "boolean" && value === true) return true;
      return false;
    };
    
    // Função para validar VALOR_CORRETO
    const isValidValorCorreto = (value: any): boolean => {
      if (value === undefined || value === null) return false;
      if (value === "" || value === "NaN" || value === "null") return false;
      const numValue = Number(value);
      if (isNaN(numValue)) return false;
      if (!isFinite(numValue)) return false;
      // Permitir zero (pode ser correto em alguns casos)
      return true;
    };
    
    // Função para validar REGISTRO_CORRIGIR
    const isValidRegistroCorrigir = (value: any): boolean => {
      if (!value) return false;
      const strValue = String(value).trim();
      if (strValue === "" || strValue === "NENHUM" || strValue === "DESCONHECIDO") return false;
      // Deve ser C100, C170, ou C190
      return ["C100", "C170", "C190"].includes(strValue);
    };
    
    // Função para mapear campo original para campo SPED
    const mapearCampoSped = (campoOriginal: string, campoCorrigir?: string): string => {
      // Se CAMPO_CORRIGIR existe e contém o nome do campo SPED, extrair dele
      if (campoCorrigir) {
        const campoCorrigirStr = String(campoCorrigir).trim();
        // Pode ser "C190.VL_BC_ICMS" ou "VL_BC_ICMS"
        if (campoCorrigirStr.includes(".")) {
          const partes = campoCorrigirStr.split(".");
          if (partes.length >= 2 && partes[1].startsWith("VL_")) {
            return partes[1];
          }
        } else if (campoCorrigirStr.startsWith("VL_")) {
          return campoCorrigirStr;
        }
      }
      
      // Mapear campo original usando o mapa
      if (campoOriginal && campoMap[campoOriginal]) {
        return campoMap[campoOriginal];
      }
      
      // Se não encontrou no mapa, retornar o campo original (pode já estar no formato correto)
      return campoOriginal || "VL_BC_ICMS"; // Fallback
    };
    
    // DEBUG: Analisar por que correções não estão sendo coletadas
    let total_com_solucao = 0;
    let total_com_registro = 0;
    let total_com_valor = 0;
    let total_com_todos = 0;
    let exemplos_rejeitados: any[] = [];
    let erros_validacao: any[] = [];
    
    for (const div of divergenciasC170C190) {
      // Validações robustas
      const tem_solucao = isValidSolucaoAutomatica(div.SOLUCAO_AUTOMATICA);
      const tem_registro = isValidRegistroCorrigir(div.REGISTRO_CORRIGIR);
      const tem_valor = isValidValorCorreto(div.VALOR_CORRETO);
      
      // Validar campos obrigatórios adicionais
      const tem_chave = div.CHAVE && String(div.CHAVE).trim().length > 0;
      const tem_cfop = div.CFOP && String(div.CFOP).trim().length > 0;
      
      if (tem_solucao) total_com_solucao++;
      if (tem_registro) total_com_registro++;
      if (tem_valor) total_com_valor++;
      
      // Coletar erros de validação para debug
      const erros: string[] = [];
      if (!tem_solucao) erros.push(`SOLUCAO_AUTOMATICA inválido: ${div.SOLUCAO_AUTOMATICA} (${typeof div.SOLUCAO_AUTOMATICA})`);
      if (!tem_registro) erros.push(`REGISTRO_CORRIGIR inválido: ${div.REGISTRO_CORRIGIR}`);
      if (!tem_valor) erros.push(`VALOR_CORRETO inválido: ${div.VALOR_CORRETO} (${typeof div.VALOR_CORRETO})`);
      if (!tem_chave) erros.push(`CHAVE ausente ou vazia`);
      if (!tem_cfop) erros.push(`CFOP ausente ou vazio`);
      
      if (tem_solucao && tem_registro && tem_valor && tem_chave && tem_cfop) {
        total_com_todos++;
        
        // Mapear campo para formato SPED
        const campoOriginal = div.CAMPO || "";
        const campoSped = mapearCampoSped(campoOriginal, div.CAMPO_CORRIGIR);
        
        // Validar valor numérico
        const valorCorreto = Number(div.VALOR_CORRETO);
        if (isNaN(valorCorreto) || !isFinite(valorCorreto)) {
          console.warn(`[aplicar-todas] ⚠️ Valor inválido para correção: ${div.VALOR_CORRETO}`);
          erros_validacao.push({
            chave: div.CHAVE?.substring(0, 20),
            erro: `Valor inválido: ${div.VALOR_CORRETO}`,
            campo: campoSped
          });
          continue;
        }
        
        correcoes.push({
          registro_corrigir: String(div.REGISTRO_CORRIGIR).trim(),
          campo: campoSped,
          valor_correto: valorCorreto,
          chave: String(div.CHAVE).trim(),
          cfop: String(div.CFOP).trim(),
          cst: div.CST ? String(div.CST).trim() : null,
          linha_sped: div.LINHA_SPED ? Number(div.LINHA_SPED) : null
        });
      } else {
        // Coletar exemplos de divergências rejeitadas para debug
        if (exemplos_rejeitados.length < 5) {
          exemplos_rejeitados.push({
            chave: div.CHAVE?.substring(0, 20),
            SOLUCAO_AUTOMATICA: div.SOLUCAO_AUTOMATICA,
            SOLUCAO_AUTOMATICA_type: typeof div.SOLUCAO_AUTOMATICA,
            SOLUCAO_AUTOMATICA_valid: tem_solucao,
            REGISTRO_CORRIGIR: div.REGISTRO_CORRIGIR,
            REGISTRO_CORRIGIR_type: typeof div.REGISTRO_CORRIGIR,
            REGISTRO_CORRIGIR_valid: tem_registro,
            VALOR_CORRETO: div.VALOR_CORRETO,
            VALOR_CORRETO_type: typeof div.VALOR_CORRETO,
            VALOR_CORRETO_valid: tem_valor,
            CHAVE_valid: tem_chave,
            CFOP_valid: tem_cfop,
            erros: erros
          });
        }
      }
    }

    console.log(`[aplicar-todas] Correções válidas coletadas: ${correcoes.length}`);
    console.log(`[aplicar-todas] DEBUG - Estatísticas:`);
    console.log(`[aplicar-todas]   - Total com SOLUCAO_AUTOMATICA=true: ${total_com_solucao}`);
    console.log(`[aplicar-todas]   - Total com REGISTRO_CORRIGIR válido: ${total_com_registro}`);
    console.log(`[aplicar-todas]   - Total com VALOR_CORRETO válido: ${total_com_valor}`);
    console.log(`[aplicar-todas]   - Total com TODOS os requisitos: ${total_com_todos}`);
    
    if (erros_validacao.length > 0) {
      console.warn(`[aplicar-todas] ⚠️ ${erros_validacao.length} correções rejeitadas por erros de validação:`);
      erros_validacao.slice(0, 5).forEach((erro, idx) => {
        console.warn(`[aplicar-todas]   Erro ${idx + 1}:`, erro);
      });
    }
    
    if (exemplos_rejeitados.length > 0) {
      console.log(`[aplicar-todas] DEBUG - Exemplos de divergências rejeitadas (primeiros 3):`);
      exemplos_rejeitados.slice(0, 3).forEach((ex, idx) => {
        console.log(`[aplicar-todas]   Exemplo ${idx + 1}:`, JSON.stringify(ex, null, 2));
      });
    }

    if (correcoes.length === 0) {
      return res.json({
        success: false,
        message: 'Nenhuma correção automática válida disponível',
        correcoes_aplicadas: 0,
        detalhes: {
          total_divergencias: divergenciasC170C190.length,
          total_com_solucao: total_com_solucao,
          total_com_registro: total_com_registro,
          total_com_valor: total_com_valor,
          exemplos_rejeitados: exemplos_rejeitados.slice(0, 5)
        }
      });
    }

    // OTIMIZAÇÃO: Aplicar todas as correções de uma vez usando script otimizado
    const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
    const spedPath = path.join(tmpDir, 'sped.txt');
    const outputPath = path.join(tmpDir, 'sped_corrigido.txt');

    // Validar se arquivo SPED existe
    if (!fs.existsSync(spedPath)) {
      console.error(`[aplicar-todas] ❌ Arquivo SPED não encontrado: ${spedPath}`);
      return res.status(404).json({
        error: 'Arquivo SPED não encontrado',
        path: spedPath
      });
    }

    // Salvar todas as correções em um único arquivo JSON
    const correcoesJsonPath = path.join(tmpDir, 'todas_correcoes.json');
    try {
      fs.writeFileSync(correcoesJsonPath, JSON.stringify(correcoes, null, 2), 'utf-8');
      console.log(`[aplicar-todas] ✅ Arquivo de correções salvo: ${correcoesJsonPath} (${correcoes.length} correções)`);
    } catch (error: any) {
      console.error(`[aplicar-todas] ❌ Erro ao salvar arquivo de correções:`, error);
      return res.status(500).json({
        error: 'Erro ao salvar arquivo de correções',
        details: error.message
      });
    }
    
    // Usar script otimizado que aplica todas de uma vez
    const pythonScript = path.join(__dirname, '../../python/sped/aplicar_todas_correcoes.py');
    const command = `python "${pythonScript}" "${spedPath}" "${outputPath}" "${correcoesJsonPath}"`;

    console.log(`[aplicar-todas] Aplicando ${correcoes.length} correções de uma vez (otimizado)...`);
    
    let resultados: any[] = [];
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.join(__dirname, '../../python/sped'),
        maxBuffer: 50 * 1024 * 1024 // 50MB para muitas correções
      });

      // Logar saída do Python para debug
      if (stdout) {
        console.log(`[aplicar-todas] Python stdout:`, stdout.substring(0, 1000));
      }
      if (stderr) {
        console.error(`[aplicar-todas] Python stderr:`, stderr.substring(0, 1000));
      }

      // Tentar parsear resposta JSON do Python
      let pythonResponse: any = null;
      try {
        if (stdout && stdout.trim()) {
          // Tentar extrair JSON da saída (pode ter logs antes)
          // Procurar pelo último JSON válido na saída
          const jsonMatches = stdout.match(/\{[\s\S]*?\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // Pegar o último JSON (geralmente é o resultado final)
            try {
              pythonResponse = JSON.parse(jsonMatches[jsonMatches.length - 1]);
            } catch {
              // Se falhar, tentar todos os matches
              for (let i = jsonMatches.length - 1; i >= 0; i--) {
                try {
                  pythonResponse = JSON.parse(jsonMatches[i]);
                  break;
                } catch {
                  continue;
                }
              }
            }
          } else {
            // Tentar parsear toda a saída
            pythonResponse = JSON.parse(stdout.trim());
          }
        }
      } catch (parseError: any) {
        console.warn(`[aplicar-todas] Não foi possível parsear resposta JSON:`, parseError.message);
        console.warn(`[aplicar-todas] stdout (primeiros 2000 chars):`, stdout.substring(0, 2000));
      }

      // Verificar se o arquivo foi criado
      console.log(`[aplicar-todas] Verificando se arquivo existe: ${outputPath}`);
      if (!fs.existsSync(outputPath)) {
        console.error(`[aplicar-todas] ❌ Arquivo não encontrado: ${outputPath}`);
        // Listar arquivos no diretório para debug
        const tmpDir = path.dirname(outputPath);
        if (fs.existsSync(tmpDir)) {
          const files = fs.readdirSync(tmpDir);
          console.log(`[aplicar-todas] Arquivos no diretório ${tmpDir}:`, files);
        }
        throw new Error(`Arquivo corrigido não foi gerado pelo script Python. Caminho esperado: ${outputPath}`);
      } else {
        const stats = fs.statSync(outputPath);
        console.log(`[aplicar-todas] ✅ Arquivo criado com sucesso: ${outputPath} (${stats.size} bytes)`);
      }

      // Usar resultados do Python se disponíveis
      if (pythonResponse && pythonResponse.resultados) {
        resultados = pythonResponse.resultados;
      } else {
        // Fallback: criar resultados baseado no sucesso
        resultados = correcoes.map((correcao, i) => ({
          correcao: correcao,
          sucesso: pythonResponse?.success !== false
        }));
      }
    } catch (error: any) {
      const errorMsg = error.stderr || error.stdout || error.message || 'Erro desconhecido';
      console.error(`[aplicar-todas] ❌ Erro ao aplicar correções:`, errorMsg.substring(0, 1000));
      
      // Criar resultados com erro para todas as correções
      resultados = correcoes.map(correcao => ({
        correcao: correcao,
        sucesso: false,
        erro: errorMsg.substring(0, 500)
      }));
    }

    const sucessos = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;

    console.log(`[aplicar-todas] ✅ Processamento concluído: ${sucessos} sucessos, ${falhas} falhas`);

    res.json({
      success: sucessos > 0,
      message: `${sucessos} de ${correcoes.length} correções aplicadas${falhas > 0 ? ` (${falhas} falhas)` : ''}`,
      correcoes_aplicadas: sucessos,
      total_correcoes: correcoes.length,
      falhas: falhas,
      resultados: resultados,
      arquivo_corrigido: outputPath,
      validationId: validationId,
      pode_revalidar: fs.existsSync(outputPath) // Indica se pode revalidar
    });

  } catch (error: any) {
    console.error(`[aplicar-todas] ❌ Erro ao aplicar todas as correções:`, error);
    res.status(500).json({
      error: error.message || 'Erro interno ao processar correções',
      validationId: validationId
    });
  }
});

/**
 * GET /api/sped/correcoes/:validationId/download
 * Baixa arquivo SPED corrigido
 * IMPORTANTE: Esta rota deve vir DEPOIS das rotas específicas para evitar conflito
 */
router.get('/:validationId/download', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;

    const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
    const spedCorrigidoPath = path.join(tmpDir, 'sped_corrigido.txt');

    console.log(`[download] Buscando arquivo SPED corrigido: ${spedCorrigidoPath}`);
    
    if (!fs.existsSync(spedCorrigidoPath)) {
      console.error(`[download] ❌ Arquivo não encontrado: ${spedCorrigidoPath}`);
      // Listar arquivos no diretório para debug
      if (fs.existsSync(tmpDir)) {
        const files = fs.readdirSync(tmpDir);
        console.log(`[download] Arquivos disponíveis no diretório:`, files);
      } else {
        console.error(`[download] ❌ Diretório não existe: ${tmpDir}`);
      }
      return res.status(404).json({
        error: 'Arquivo SPED corrigido não encontrado. Aplique as correções primeiro.',
        path: spedCorrigidoPath,
        tmpDir: tmpDir
      });
    }

    const stats = fs.statSync(spedCorrigidoPath);
    console.log(`[download] ✅ Arquivo encontrado: ${spedCorrigidoPath} (${stats.size} bytes)`);

    // Usar res.download() que preserva encoding automaticamente
    res.download(spedCorrigidoPath, `sped_corrigido_${validationId}.txt`, (err) => {
      if (err) {
        console.error('Erro ao baixar SPED corrigido:', err);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Erro ao baixar arquivo'
          });
        }
      }
    });

  } catch (error: any) {
    console.error('Erro ao processar download:', error);
    res.status(500).json({
      error: error.message || 'Erro interno ao processar download'
    });
  }
});

/**
 * POST /api/sped/correcoes/:validationId/revalidar
 * Revalida o SPED corrigido automaticamente
 */
router.post('/:validationId/revalidar', async (req: Request, res: Response) => {
  try {
    const { validationId } = req.params;
    const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
    const spedCorrigidoPath = path.join(tmpDir, 'sped_corrigido.txt');
    const xmlDir = path.join(tmpDir, 'xmls');

    // Verificar se arquivo corrigido existe
    if (!fs.existsSync(spedCorrigidoPath)) {
      return res.status(404).json({
        error: 'Arquivo SPED corrigido não encontrado. Aplique as correções primeiro.',
        path: spedCorrigidoPath
      });
    }

    console.log(`[revalidar] Iniciando revalidação do SPED corrigido: ${spedCorrigidoPath}`);

    // Ler arquivo SPED corrigido
    const spedCorrigidoBuffer = fs.readFileSync(spedCorrigidoPath);
    
    // Buscar XMLs originais
    const xmlBuffers: Buffer[] = [];
    if (fs.existsSync(xmlDir)) {
      const xmlFileNames = fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml'));
      for (const fileName of xmlFileNames) {
        const xmlPath = path.join(xmlDir, fileName);
        xmlBuffers.push(fs.readFileSync(xmlPath));
      }
    }

    // Criar novo ID para validação corrigida
    const novaValidationId = `${validationId}_corrigido_${Date.now()}`;
    
    console.log(`[revalidar] Nova validationId criada: ${novaValidationId}`);
    console.log(`[revalidar] XMLs encontrados: ${xmlBuffers.length}`);
    console.log(`[revalidar] Tamanho do SPED corrigido: ${spedCorrigidoBuffer.length} bytes`);
    
    // IMPORTANTE: Inicializar o status no Map ANTES de iniciar o processamento
    // Isso garante que o endpoint GET possa encontrar o status imediatamente
    // Usamos o método privado através de uma abordagem que garante o status
    // Mas como não podemos acessar diretamente, vamos iniciar o processamento
    // que já inicializa o status na primeira linha
    
    // Usar a mesma instância do serviço que está sendo usada no endpoint GET
    // Isso garante que o status fique disponível no mesmo Map
    console.log(`[revalidar] Iniciando processamento com a mesma instância do serviço...`);
    
    // Iniciar processamento (ele inicializa o status síncronamente na primeira linha)
    const processamentoPromise = spedValidationService.processarValidacao(
      novaValidationId,
      spedCorrigidoBuffer,
      xmlBuffers,
      req.body.setores || undefined
    ).catch((error: any) => {
      console.error(`[revalidar] ❌ Erro ao processar revalidação ${novaValidationId}:`, error);
    });

    // Aguardar um pouco para garantir que o status foi inicializado no Map
    // O processarValidacao inicializa o status síncronamente na primeira linha
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verificar se o status foi criado
    const statusVerificado = await spedValidationService.obterStatus(novaValidationId);
    if (statusVerificado) {
      console.log(`[revalidar] ✅ Status inicializado com sucesso:`, {
        validationId: statusVerificado.validationId,
        status: statusVerificado.status,
        progress: statusVerificado.progress
      });
    } else {
      console.warn(`[revalidar] ⚠️ Status não encontrado após inicialização. Isso pode causar 404 no polling.`);
    }

    // Não aguardar o processamento completo, apenas iniciar
    // O processamento continua em background

    // Retornar ID da nova validação imediatamente
    res.status(202).json({
      success: true,
      message: 'Revalidação iniciada com sucesso',
      validationId: novaValidationId,
      status: 'processing'
    });

  } catch (error: any) {
    console.error('[revalidar] Erro ao iniciar revalidação:', error);
    res.status(500).json({
      error: error.message || 'Erro interno ao processar revalidação'
    });
  }
});

export default router;

