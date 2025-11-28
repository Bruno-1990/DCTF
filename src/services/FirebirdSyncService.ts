import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface SyncResult {
  success: boolean;
  periodo: string;
  data_ini?: string;
  data_fim?: string;
  fpg?: number;
  ctb?: number;
  fise?: number;
  fiss?: number;
  total?: number;
  erros?: string[];
  error?: string;
}

/**
 * Serviço para sincronizar dados do Firebird (SCI) para MySQL (host_dados)
 * por período específico, chamando o script Python do projeto export.
 */
export class FirebirdSyncService {
  private scriptPath: string;
  private mainScriptPath: string;
  private datasScriptPath: string;

  constructor() {
    // Caminho para o script Python sync_periodo.py
    // Prioridade: variável de ambiente > caminho padrão do Windows
    let exportPath = process.env['EXPORT_SCRIPT_PATH'];
    
    if (!exportPath) {
      // Tentar caminho padrão do Windows: C:\Users\bruno\Documents\export\Automatico\sync_periodo.py
      const userHome = process.env['USERPROFILE'] || process.env['HOME'] || '';
      if (userHome) {
        exportPath = path.join(userHome, 'Documents', 'export', 'Automatico', 'sync_periodo.py');
      } else {
        // Fallback: relativo ao projeto
        exportPath = path.join(process.cwd(), '..', '..', 'Documents', 'export', 'Automatico', 'sync_periodo.py');
      }
    }
    
    // Caminho para o script main.py (sincronização automática)
    let mainPath = process.env['EXPORT_MAIN_SCRIPT_PATH'];
    if (!mainPath) {
      const userHome = process.env['USERPROFILE'] || process.env['HOME'] || '';
      if (userHome) {
        mainPath = path.join(userHome, 'Documents', 'export', 'Automatico', 'main.py');
      } else {
        mainPath = path.join(process.cwd(), '..', '..', 'Documents', 'export', 'Automatico', 'main.py');
      }
    }
    
    // Caminho para o script sync_periodo_datas.py (sincronização manual com datas)
    let datasPath = process.env['EXPORT_DATAS_SCRIPT_PATH'];
    if (!datasPath) {
      const userHome = process.env['USERPROFILE'] || process.env['HOME'] || '';
      if (userHome) {
        datasPath = path.join(userHome, 'Documents', 'export', 'Automatico', 'sync_periodo_datas.py');
      } else {
        datasPath = path.join(process.cwd(), '..', '..', 'Documents', 'export', 'Automatico', 'sync_periodo_datas.py');
      }
    }
    
    // Verificar se os arquivos existem
    if (!fs.existsSync(exportPath)) {
      console.warn(`⚠️  Script Python sync_periodo.py não encontrado em: ${exportPath}`);
    } else {
      console.log(`✅ Script Python sync_periodo.py encontrado: ${exportPath}`);
    }
    
    if (!fs.existsSync(mainPath)) {
      console.warn(`⚠️  Script Python main.py não encontrado em: ${mainPath}`);
    } else {
      console.log(`✅ Script Python main.py encontrado: ${mainPath}`);
    }
    
    if (!fs.existsSync(datasPath)) {
      console.warn(`⚠️  Script Python sync_periodo_datas.py não encontrado em: ${datasPath}`);
    } else {
      console.log(`✅ Script Python sync_periodo_datas.py encontrado: ${datasPath}`);
    }
    
    this.scriptPath = exportPath;
    this.mainScriptPath = mainPath;
    this.datasScriptPath = datasPath;
  }

  /**
   * Sincroniza dados do Firebird para MySQL para um período específico.
   * 
   * @param ano Ano da competência (ex: 2025)
   * @param mes Mês da competência (1-12)
   * @returns Resultado da sincronização
   */
  async sincronizarPeriodo(ano: number, mes: number): Promise<SyncResult> {
    if (mes < 1 || mes > 12) {
      return {
        success: false,
        periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
        error: 'Mês deve estar entre 1 e 12',
      };
    }

    if (!fs.existsSync(this.scriptPath)) {
      return {
        success: false,
        periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
        error: `Script Python não encontrado: ${this.scriptPath}`,
      };
    }

    try {
      // Executar script Python: python sync_periodo.py <ano> <mes>
      // Usar caminho absoluto do Python se disponível, senão usar 'python' do PATH
      const pythonCmd = process.env['PYTHON_PATH'] || 'python';
      const command = `"${pythonCmd}" "${this.scriptPath}" ${ano} ${mes}`;
      const scriptDir = path.dirname(this.scriptPath);
      
      console.log(`[FirebirdSyncService] Executando: ${command}`);
      console.log(`[FirebirdSyncService] Diretório de trabalho: ${scriptDir}`);
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir, // Executar no diretório do script para encontrar módulos relativos
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 300000, // 5 minutos
        encoding: 'utf8',
        env: {
          ...process.env,
          // Garantir que variáveis de ambiente do MySQL e Firebird estejam disponíveis
          PYTHONPATH: scriptDir, // Adicionar diretório do script ao PYTHONPATH
        },
      });

      // Log completo do stdout para debug
      console.log(`[FirebirdSyncService] stdout (${stdout.length} chars):`, stdout.substring(0, 500));
      if (stderr) {
        console.log(`[FirebirdSyncService] stderr:`, stderr);
      }

      // O script Python imprime JSON no final após "=== RESULTADO ==="
      // Formato esperado: linha com "=== RESULTADO ===" seguida de JSON
      const lines = stdout.split('\n');
      let jsonStart = false;
      let jsonLines: string[] = [];
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.includes('=== RESULTADO ===')) {
          jsonStart = true;
          continue;
        }
        if (jsonStart && trimmedLine) {
          jsonLines.push(trimmedLine);
        }
      }

      const jsonOutput = jsonLines.join('\n').trim();
      
      if (jsonOutput) {
        try {
          // Tentar parsear o JSON
          const resultado = JSON.parse(jsonOutput);
          
          // Normalizar o resultado para o formato esperado
          const normalized: SyncResult = {
            success: resultado.sucesso !== false && !resultado.erro,
            periodo: resultado.periodo || `${mes.toString().padStart(2, '0')}/${ano}`,
            data_ini: resultado.data_ini,
            data_fim: resultado.data_fim,
            fpg: resultado.fpg || 0,
            ctb: resultado.ctb || 0,
            fise: resultado.fise || 0,
            fiss: resultado.fiss || 0,
            total: resultado.total || (resultado.fpg || 0) + (resultado.ctb || 0) + (resultado.fise || 0) + (resultado.fiss || 0),
            erros: resultado.erros || [],
            error: resultado.erro || (resultado.erros && resultado.erros.length > 0 ? resultado.erros.join('; ') : undefined),
          };
          
          console.log(`[FirebirdSyncService] Resultado parseado:`, normalized);
          return normalized;
        } catch (parseError: any) {
          console.error('[FirebirdSyncService] Erro ao parsear JSON:', parseError);
          console.error('[FirebirdSyncService] JSON tentado:', jsonOutput.substring(0, 500));
          
          // Tentar extrair informações mesmo sem JSON válido
          const hasSuccess = stdout.toLowerCase().includes('[ok]') || 
                            stdout.toLowerCase().includes('sincronização concluída');
          const hasError = stdout.toLowerCase().includes('[erro') || 
                          stdout.toLowerCase().includes('error') ||
                          stderr.toLowerCase().includes('error');
          
          return {
            success: hasSuccess && !hasError,
            periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
            error: `Erro ao parsear resposta do script: ${parseError.message}. Verifique os logs do backend.`,
          };
        }
      }

      // Se não encontrou JSON, verificar se houve sucesso/erro nas mensagens
      const hasSuccess = stdout.toLowerCase().includes('[ok]') || 
                        stdout.toLowerCase().includes('sincronização concluída');
      const hasError = stdout.toLowerCase().includes('[erro') || 
                      stdout.toLowerCase().includes('error') ||
                      stderr.toLowerCase().includes('error');

      if (stderr && !hasSuccess) {
        console.error('[FirebirdSyncService] stderr completo:', stderr);
      }

      return {
        success: hasSuccess && !hasError,
        periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
        fpg: 0,
        ctb: 0,
        fise: 0,
        fiss: 0,
        total: 0,
        error: hasError 
          ? `Erro durante execução: ${stderr || 'verifique os logs do backend'}`
          : !hasSuccess 
            ? 'Script executado mas não retornou resultado válido. Verifique os logs do backend.'
            : undefined,
      };

    } catch (error: any) {
      console.error('[FirebirdSyncService] Erro ao executar script:', error);
      console.error('[FirebirdSyncService] Error details:', {
        message: error.message,
        code: error.code,
        signal: error.signal,
        stdout: error.stdout?.substring(0, 1000),
        stderr: error.stderr?.substring(0, 1000),
      });
      
      // Se o erro tem stdout/stderr, tentar extrair mais informações
      let errorMessage = error.message || 'Erro desconhecido ao executar sincronização';
      
      if (error.stdout) {
        const stdoutPreview = error.stdout.substring(0, 300);
        errorMessage += `\nOutput: ${stdoutPreview}`;
      }
      
      if (error.stderr) {
        errorMessage += `\nErro: ${error.stderr.substring(0, 300)}`;
      }
      
      if (error.code === 'ENOENT') {
        errorMessage = 'Python não encontrado no PATH. Verifique se o Python está instalado e acessível. Configure PYTHON_PATH no .env se necessário.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Timeout ao executar sincronização. O processo demorou mais de 5 minutos.';
      }
      
      return {
        success: false,
        periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Sincronização automática: chama main.py que sincroniza o mês anterior automaticamente.
   * Consulta TODOS os CNPJs do período e atualiza a tabela MySQL.
   */
  async sincronizarAutomatico(): Promise<SyncResult> {
    if (!fs.existsSync(this.mainScriptPath)) {
      return {
        success: false,
        periodo: 'automático',
        error: `Script Python main.py não encontrado: ${this.mainScriptPath}`,
      };
    }

    try {
      const pythonCmd = process.env['PYTHON_PATH'] || 'python';
      const command = `"${pythonCmd}" "${this.mainScriptPath}"`;
      const scriptDir = path.dirname(this.mainScriptPath);
      
      console.log(`[FirebirdSyncService] Executando sincronização automática: ${command}`);
      console.log(`[FirebirdSyncService] Diretório de trabalho: ${scriptDir}`);
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONPATH: scriptDir,
        },
      });

      console.log(`[FirebirdSyncService] stdout (${stdout.length} chars):`, stdout.substring(0, 500));
      if (stderr) {
        console.log(`[FirebirdSyncService] stderr:`, stderr);
      }

      // main.py não retorna JSON, apenas imprime mensagens
      // Verificar se houve sucesso pelas mensagens
      const hasSuccess = stdout.toLowerCase().includes('[ok]') || 
                        stdout.toLowerCase().includes('exportacao concluida') ||
                        stdout.toLowerCase().includes('exportação concluída');
      const hasError = stdout.toLowerCase().includes('[erro') || 
                      stdout.toLowerCase().includes('error') ||
                      stderr.toLowerCase().includes('error');

      if (stderr && !hasSuccess) {
        console.error('[FirebirdSyncService] stderr completo:', stderr);
      }

      // Tentar extrair período do output
      const periodoMatch = stdout.match(/Periodo:\s*(\d{4}-\d{2}-\d{2})\s*a\s*(\d{4}-\d{2}-\d{2})/i);
      const periodo = periodoMatch 
        ? `${periodoMatch[1].split('-')[1]}/${periodoMatch[1].split('-')[0]}`
        : 'automático';

      return {
        success: hasSuccess && !hasError,
        periodo,
        total: 0, // main.py não retorna contagem detalhada
        error: hasError 
          ? `Erro durante execução: ${stderr || 'verifique os logs do backend'}`
          : !hasSuccess 
            ? 'Script executado mas não retornou confirmação de sucesso. Verifique os logs do backend.'
            : undefined,
      };

    } catch (error: any) {
      console.error('[FirebirdSyncService] Erro ao executar sincronização automática:', error);
      
      let errorMessage = error.message || 'Erro desconhecido ao executar sincronização automática';
      
      if (error.stdout) {
        errorMessage += `\nOutput: ${error.stdout.substring(0, 300)}`;
      }
      
      if (error.stderr) {
        errorMessage += `\nErro: ${error.stderr.substring(0, 300)}`;
      }
      
      if (error.code === 'ENOENT') {
        errorMessage = 'Python não encontrado no PATH. Verifique se o Python está instalado e acessível.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Timeout ao executar sincronização. O processo demorou mais de 5 minutos.';
      }
      
      return {
        success: false,
        periodo: 'automático',
        error: errorMessage,
      };
    }
  }

  /**
   * Sincronização manual com datas personalizadas: chama sync_periodo_datas.py
   * que aceita data inicial e data final como parâmetros.
   * Consulta TODOS os CNPJs do período e atualiza a tabela MySQL.
   */
  async sincronizarPorDatas(dataIni: string, dataFim: string): Promise<SyncResult> {
    // Validar formato das datas (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataIni) || !dateRegex.test(dataFim)) {
      return {
        success: false,
        periodo: `${dataIni} a ${dataFim}`,
        error: 'Datas devem estar no formato YYYY-MM-DD',
      };
    }

    if (!fs.existsSync(this.datasScriptPath)) {
      return {
        success: false,
        periodo: `${dataIni} a ${dataFim}`,
        error: `Script Python sync_periodo_datas.py não encontrado: ${this.datasScriptPath}`,
      };
    }

    try {
      const pythonCmd = process.env['PYTHON_PATH'] || 'python';
      const command = `"${pythonCmd}" "${this.datasScriptPath}" ${dataIni} ${dataFim}`;
      const scriptDir = path.dirname(this.datasScriptPath);
      
      console.log(`[FirebirdSyncService] Executando sincronização por datas: ${command}`);
      console.log(`[FirebirdSyncService] Diretório de trabalho: ${scriptDir}`);
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: scriptDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONPATH: scriptDir,
        },
      });

      console.log(`[FirebirdSyncService] stdout (${stdout.length} chars):`, stdout.substring(0, 500));
      if (stderr) {
        console.log(`[FirebirdSyncService] stderr:`, stderr);
      }

      // O script Python imprime JSON no final após "=== RESULTADO ==="
      const lines = stdout.split('\n');
      let jsonStart = false;
      let jsonLines: string[] = [];
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.includes('=== RESULTADO ===')) {
          jsonStart = true;
          continue;
        }
        if (jsonStart && trimmedLine) {
          jsonLines.push(trimmedLine);
        }
      }

      const jsonOutput = jsonLines.join('\n').trim();
      
      if (jsonOutput) {
        try {
          const resultado = JSON.parse(jsonOutput);
          
          const normalized: SyncResult = {
            success: resultado.sucesso !== false && !resultado.erro,
            periodo: `${dataIni} a ${dataFim}`,
            data_ini: resultado.data_ini,
            data_fim: resultado.data_fim,
            fpg: resultado.fpg || 0,
            ctb: resultado.ctb || 0,
            fise: resultado.fise || 0,
            fiss: resultado.fiss || 0,
            total: resultado.total || (resultado.fpg || 0) + (resultado.ctb || 0) + (resultado.fise || 0) + (resultado.fiss || 0),
            erros: resultado.erros || [],
            error: resultado.erro || (resultado.erros && resultado.erros.length > 0 ? resultado.erros.join('; ') : undefined),
          };
          
          console.log(`[FirebirdSyncService] Resultado parseado:`, normalized);
          return normalized;
        } catch (parseError: any) {
          console.error('[FirebirdSyncService] Erro ao parsear JSON:', parseError);
          console.error('[FirebirdSyncService] JSON tentado:', jsonOutput.substring(0, 500));
          
          const hasSuccess = stdout.toLowerCase().includes('[ok]') || 
                            stdout.toLowerCase().includes('sincronização concluída');
          const hasError = stdout.toLowerCase().includes('[erro') || 
                          stdout.toLowerCase().includes('error') ||
                          stderr.toLowerCase().includes('error');
          
          return {
            success: hasSuccess && !hasError,
            periodo: `${dataIni} a ${dataFim}`,
            error: `Erro ao parsear resposta do script: ${parseError.message}. Verifique os logs do backend.`,
          };
        }
      }

      const hasSuccess = stdout.toLowerCase().includes('[ok]') || 
                        stdout.toLowerCase().includes('sincronização concluída');
      const hasError = stdout.toLowerCase().includes('[erro') || 
                      stdout.toLowerCase().includes('error') ||
                      stderr.toLowerCase().includes('error');

      if (stderr && !hasSuccess) {
        console.error('[FirebirdSyncService] stderr completo:', stderr);
      }

      return {
        success: hasSuccess && !hasError,
        periodo: `${dataIni} a ${dataFim}`,
        fpg: 0,
        ctb: 0,
        fise: 0,
        fiss: 0,
        total: 0,
        error: hasError 
          ? `Erro durante execução: ${stderr || 'verifique os logs do backend'}`
          : !hasSuccess 
            ? 'Script executado mas não retornou resultado válido. Verifique os logs do backend.'
            : undefined,
      };

    } catch (error: any) {
      console.error('[FirebirdSyncService] Erro ao executar sincronização por datas:', error);
      
      let errorMessage = error.message || 'Erro desconhecido ao executar sincronização por datas';
      
      if (error.stdout) {
        errorMessage += `\nOutput: ${error.stdout.substring(0, 300)}`;
      }
      
      if (error.stderr) {
        errorMessage += `\nErro: ${error.stderr.substring(0, 300)}`;
      }
      
      if (error.code === 'ENOENT') {
        errorMessage = 'Python não encontrado no PATH. Verifique se o Python está instalado e acessível.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Timeout ao executar sincronização. O processo demorou mais de 5 minutos.';
      }
      
      return {
        success: false,
        periodo: `${dataIni} a ${dataFim}`,
        error: errorMessage,
      };
    }
  }
}

