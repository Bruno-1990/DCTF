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
import { SpedValidationService } from '../services/SpedValidationService';

const router = Router();
const execAsync = promisify(exec);
const spedValidationService = new SpedValidationService();

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
  try {
    const { validationId, correcao } = req.body;

    if (!validationId || !correcao) {
      return res.status(400).json({
        error: 'validationId e correcao são obrigatórios'
      });
    }

    // Validar estrutura da correção
    const { registro_corrigir, campo, valor_correto, chave, cfop, cst, linha_sped } = correcao;
    
    if (!registro_corrigir || !campo || valor_correto === undefined) {
      return res.status(400).json({
        error: 'correcao deve conter: registro_corrigir, campo, valor_correto'
      });
    }

    // Obter caminho do arquivo SPED original
    const tmpDir = path.join(os.tmpdir(), 'sped_validations', validationId);
    const spedPath = path.join(tmpDir, 'sped.txt');

    if (!fs.existsSync(spedPath)) {
      return res.status(404).json({
        error: 'Arquivo SPED não encontrado para esta validação'
      });
    }

    // Executar script Python para aplicar correção
    const pythonScript = path.join(__dirname, '../../python/sped/aplicar_correcao.py');
    const outputPath = path.join(tmpDir, 'sped_corrigido.txt');

    // Salvar correção em arquivo temporário para evitar problemas com aspas e caracteres especiais
    const correcaoJsonPath = path.join(tmpDir, 'correcao.json');
    fs.writeFileSync(correcaoJsonPath, JSON.stringify(correcao, null, 2), 'utf-8');
    
    // Usar arquivo JSON ao invés de passar como argumento
    const command = `python "${pythonScript}" "${spedPath}" "${outputPath}" "${correcaoJsonPath}"`;

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
    res.status(500).json({
      error: error.message || 'Erro interno ao processar correção'
    });
  }
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
      arquivo_corrigido: outputPath
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

export default router;

