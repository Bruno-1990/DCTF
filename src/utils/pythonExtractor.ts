import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Limpa o base64 removendo prefixos (ex: "data:application/pdf;base64,")
 */
function limparBase64(base64: string): string {
  // Remover prefixo se existir
  if (base64.includes(';base64,')) {
    return base64.split(';base64,').pop() || base64;
  }
  return base64;
}

export interface SocioExtracted {
  'CPF/CNPJ': string;
  'Nome': string;
  'Qualificação': string;
  'Situação Cadastral': string;
  'Cap. Social': string;
  'Cap. Votante': string;
}

export interface PythonExtractResult {
  success: boolean;
  socios?: SocioExtracted[];
  total?: number;
  cnpj?: string;
  error?: string;
}

/**
 * Extrai sócios de um PDF usando o script Python (pdfplumber)
 * Aceita base64 diretamente (usado para extrair do base64 da Receita)
 */
export async function extrairSociosComPythonBase64(
  pdfBase64: string,
  pythonScriptPath: string = path.join(__dirname, '../../python/extract_socios_api.py')
): Promise<PythonExtractResult> {
  // ✅ IMPORTANTE: Limpar o base64 antes de converter (remover prefixos como "data:application/pdf;base64,")
  const base64Limpo = limparBase64(pdfBase64);
  
  // Validar que o base64 não está vazio
  if (!base64Limpo || base64Limpo.trim().length === 0) {
    return {
      success: false,
      error: 'Base64 vazio ou inválido',
    };
  }
  
  console.log('[Python Extractor] Base64 recebido:', {
    tamanhoOriginal: pdfBase64.length,
    tamanhoLimpo: base64Limpo.length,
    temPrefix: pdfBase64.includes(';base64,'),
    primeiros50: base64Limpo.substring(0, 50),
  });
  
  try {
    // Converter base64 limpo para buffer
    const pdfBuffer = Buffer.from(base64Limpo, 'base64');
    
    // Validar que o buffer foi criado corretamente (deve começar com %PDF)
    if (pdfBuffer.length < 4 || pdfBuffer.toString('utf-8', 0, 4) !== '%PDF') {
      console.error('[Python Extractor] ⚠️ Buffer PDF inválido - não começa com %PDF:', {
        primeirosBytes: pdfBuffer.toString('utf-8', 0, 20),
        bufferLength: pdfBuffer.length,
      });
      return {
        success: false,
        error: 'Base64 não parece ser um PDF válido (não começa com %PDF)',
      };
    }
    
    console.log('[Python Extractor] ✅ Buffer PDF válido criado:', {
      bufferLength: pdfBuffer.length,
      primeirosBytes: pdfBuffer.toString('utf-8', 0, 20),
    });
    
    return extrairSociosComPython(pdfBuffer, pythonScriptPath);
  } catch (error: any) {
    console.error('[Python Extractor] ❌ Erro ao converter base64 para buffer:', error);
    return {
      success: false,
      error: `Erro ao converter base64 para PDF: ${error.message}`,
    };
  }
}

/**
 * Extrai sócios de um PDF usando o script Python (pdfplumber)
 * Salva o arquivo temporariamente e executa o script Python
 */
export async function extrairSociosComPython(
  pdfBuffer: Buffer,
  pythonScriptPath: string = path.join(__dirname, '../../python/extract_socios_api.py')
): Promise<PythonExtractResult> {
  let tempFilePath: string | null = null;
  
  try {
    // Criar arquivo temporário com o PDF
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    tempFilePath = path.join(tempDir, `sitf-${timestamp}-${randomStr}.pdf`);
    
    // Validar que o buffer PDF é válido antes de salvar
    if (pdfBuffer.length < 4 || pdfBuffer.toString('utf-8', 0, 4) !== '%PDF') {
      throw new Error('Buffer PDF inválido - não começa com %PDF. Tamanho: ' + pdfBuffer.length);
    }
    
    // Salvar buffer no arquivo temporário
    await fs.promises.writeFile(tempFilePath, pdfBuffer);
    
    // Verificar se o arquivo foi criado corretamente
    const stats = await fs.promises.stat(tempFilePath);
    console.log('[Python Extractor] Arquivo temporário criado:', {
      caminho: tempFilePath,
      tamanho: stats.size,
      tamanhoBuffer: pdfBuffer.length,
      match: stats.size === pdfBuffer.length,
      primeirosBytes: pdfBuffer.toString('utf-8', 0, 20),
    });
    
    // Validar tamanho do arquivo (deve ser igual ao buffer)
    if (stats.size !== pdfBuffer.length) {
      throw new Error(`Tamanho do arquivo (${stats.size}) não corresponde ao buffer (${pdfBuffer.length})`);
    }
    
    // Executar script Python
    // Detectar comando Python (python, python3, ou py no Windows)
    let pythonCommand = 'python3';
    if (process.platform === 'win32') {
      pythonCommand = 'python'; // No Windows pode ser 'python' ou 'py'
    }
    
    // Usar caminho absoluto para o script Python
    const scriptAbsolutePath = path.isAbsolute(pythonScriptPath) 
      ? pythonScriptPath 
      : path.join(process.cwd(), pythonScriptPath);
    
    const command = `"${pythonCommand}" "${scriptAbsolutePath}" "${tempFilePath}"`;
    
    console.log('[Python Extractor] Executando comando:', command);
    
    // ✅ NOVO: Log detalhado antes de executar Python
    console.log('[Python Extractor] Preparando para executar Python:', {
      comando: command,
      arquivoTemporario: tempFilePath,
      tamanhoArquivo: (await fs.promises.stat(tempFilePath)).size,
      existeArquivo: await fs.promises.access(tempFilePath).then(() => true).catch(() => false),
    });
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: 'utf-8',
      timeout: 60000, // 60 segundos timeout
    });
    
    // ✅ NOVO: Log detalhado do resultado
    console.log('[Python Extractor] Resultado da execução Python:', {
      stdoutLength: stdout?.length || 0,
      stderrLength: stderr?.length || 0,
      stdoutPreview: stdout?.substring(0, 500) || '(vazio)',
      stderrPreview: stderr?.substring(0, 500) || '(vazio)',
    });
    
    if (stderr && stderr.trim()) {
      console.warn('[Python Extractor] stderr:', stderr);
      
      // Tentar parsear erro do stderr (se for JSON)
      try {
        const errorResult = JSON.parse(stderr.trim());
        if (!errorResult.success) {
          console.error('[Python Extractor] ❌ Erro retornado pelo Python:', errorResult);
          return {
            success: false,
            error: errorResult.error || 'Erro ao extrair sócios com Python',
          };
        }
      } catch {
        // Se não for JSON, continuar para verificar stdout
        // Mas logar como aviso
        if (stderr.trim().length > 0) {
          console.warn('[Python Extractor] ⚠️ stderr não é JSON (pode ser avisos):', stderr.substring(0, 500));
        }
      }
    }
    
    // Parsear resultado JSON do stdout
    if (!stdout || !stdout.trim()) {
      console.error('[Python Extractor] ❌ Nenhuma saída do script Python (stdout vazio)');
      throw new Error('Nenhuma saída do script Python');
    }
    
    let resultado: PythonExtractResult;
    try {
      resultado = JSON.parse(stdout.trim());
    } catch (parseError: any) {
      console.error('[Python Extractor] ❌ Erro ao parsear JSON do Python:', {
        erro: parseError.message,
        stdoutPreview: stdout.substring(0, 1000),
        stdoutLength: stdout.length,
      });
      throw new Error(`Erro ao parsear resposta do Python: ${parseError.message}`);
    }
    
    if (!resultado.success) {
      console.error('[Python Extractor] ❌ Python retornou erro:', resultado.error);
      throw new Error(resultado.error || 'Erro ao extrair sócios com Python');
    }
    
    console.log(`[Python Extractor] ✅ Extraídos ${resultado.total || 0} sócios com sucesso:`, {
      total: resultado.total || 0,
      cnpjExtraido: resultado.cnpj || 'não extraído',
      sociosPreview: resultado.socios?.slice(0, 3).map(s => ({
        nome: s['Nome'],
        cpf: s['CPF/CNPJ'],
        participacao: s['Cap. Social'],
      })) || [],
    });
    
    return resultado;
  } catch (error: any) {
    console.error('[Python Extractor] Erro:', error);
    
    // Tentar parsear erro do stderr se disponível
    if (error.stderr) {
      try {
        const errorResult = JSON.parse(error.stderr.trim());
        return {
          success: false,
          error: errorResult.error || error.message,
        };
      } catch {
        // Se não for JSON, usar mensagem original
      }
    }
    
    // Verificar se é erro de Python não encontrado
    if (error.message?.includes('python') || error.message?.includes('command not found')) {
      return {
        success: false,
        error: 'Python não encontrado no sistema. Por favor, instale Python e certifique-se de que está no PATH.',
      };
    }
    
    return {
      success: false,
      error: error.message || 'Erro desconhecido ao executar script Python',
    };
  } finally {
    // ✅ NOVO: Aguardar um pouco antes de limpar (garantir que Python terminou completamente)
    // Limpar arquivo temporário
    if (tempFilePath) {
      try {
        // Aguardar 100ms antes de remover (garantir que Python terminou completamente)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verificar se o arquivo ainda existe antes de tentar remover
        try {
          await fs.promises.access(tempFilePath);
          await fs.promises.unlink(tempFilePath);
          console.log('[Python Extractor] ✅ Arquivo temporário removido:', tempFilePath);
        } catch (fileError: any) {
          // Arquivo já não existe ou não pode ser acessado (normal)
          if (fileError.code !== 'ENOENT') {
            console.warn('[Python Extractor] ⚠️ Arquivo temporário não pode ser removido:', fileError.message);
          }
        }
      } catch (cleanupError) {
        console.warn('[Python Extractor] ⚠️ Erro ao remover arquivo temporário:', cleanupError);
      }
    }
  }
}

/**
 * Converte resultado do Python para o formato esperado pelo Node.js
 */
export function converterSociosPythonParaNode(pythonSocios: SocioExtracted[]): Array<{
  nome: string;
  cpf?: string;
  qual?: string;
  qualificacao?: string; // ✅ NOVO: Formato alternativo para compatibilidade
  situacao_cadastral?: string; // ✅ NOVO: Situação cadastral extraída do Python
  participacao_percentual?: number;
}> {
  // ✅ NOVO: Filtrar sócios que contenham "Qualif. Resp." ou "CONTRATANTE" no nome ou qualificação
  const sociosFiltrados = pythonSocios.filter(s => {
    const nome = (s['Nome'] || '').toUpperCase();
    const qual = (s['Qualificação'] || '').toUpperCase();
    const temQualifResp = nome.includes('QUALIF. RESP') || nome.includes('QUALIF RESP') || 
                          qual.includes('QUALIF. RESP') || qual.includes('QUALIF RESP');
    const temContratante = nome.includes('CONTRATANTE: 32.401.481') || nome.includes('CONTRATANTE: 32401481') ||
                           qual.includes('CONTRATANTE: 32.401.481') || qual.includes('CONTRATANTE: 32401481');
    
    if (temQualifResp) {
      console.log(`[Python Converter] ⚠️ Sócio ignorado (contém Qualif. Resp.): ${s['Nome']}`);
    }
    
    if (temContratante) {
      console.log(`[Python Converter] ⚠️ Sócio ignorado (contém CONTRATANTE): ${s['Nome']}`);
    }
    
    return !temQualifResp && !temContratante;
  });
  
  console.log(`[Python Converter] ✅ Filtrados ${pythonSocios.length - sociosFiltrados.length} sócios com "Qualif. Resp." ou "CONTRATANTE" (de ${pythonSocios.length} total)`);
  
  return sociosFiltrados.map(s => {
    // Extrair percentual de "Cap. Social" (ex: "7,60%" ou "7.60%")
    // Se não houver "Cap. Social" (ex: ADMINISTRADOR), definir como 0
    let participacaoPercentual: number | null = null;
    if (s['Cap. Social']) {
      const percentStr = s['Cap. Social'].replace('%', '').replace(',', '.');
      const percent = parseFloat(percentStr);
      if (!isNaN(percent) && percent <= 100 && percent >= 0) {
        participacaoPercentual = percent;
      } else {
        // Se o valor extraído for inválido, definir como 0
        participacaoPercentual = 0;
      }
    } else {
      // Se não há "Cap. Social" (ex: ADMINISTRADOR), definir como 0
      participacaoPercentual = 0;
    }
    
    // Normalizar CPF/CNPJ (remover formatação)
    const cpfCnpj = (s['CPF/CNPJ'] || '').replace(/\D/g, '');
    
    const qualificacao = s['Qualificação'] || undefined;
    
    return {
      nome: s['Nome'] || '',
      cpf: cpfCnpj || undefined,
      qual: qualificacao, // Formato curto (usado em alguns lugares)
      qualificacao: qualificacao, // ✅ NOVO: Formato completo (compatibilidade com SitfExtractedData)
      situacao_cadastral: s['Situação Cadastral'] || undefined, // ✅ NOVO: Situação cadastral do Python
      participacao_percentual: participacaoPercentual,
    };
  });
}

