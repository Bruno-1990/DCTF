import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { BancoHorasRelatorioModel, BancoHorasRelatorio } from '../models/BancoHorasRelatorio';

const execAsync = promisify(exec);

interface GerarRelatorioParams {
  cnpj: string;
  dataInicial: string; // formato YYYY-MM-DD
  dataFinal: string; // formato YYYY-MM-DD
  razaoSocial?: string;
}

interface GerarRelatorioResult {
  success: boolean;
  filePath?: string;
  arquivoFormatado?: string;
  relatorioId?: string;
  error?: string;
}

/**
 * Serviço simplificado para gerar relatório de banco de horas do SCI
 * Executa o script Python de forma síncrona e retorna o arquivo diretamente
 */
export class BancoHorasService {
  private scriptPath: string;
  public relatorioModel: BancoHorasRelatorioModel;

  constructor() {
    this.relatorioModel = new BancoHorasRelatorioModel();
    
    // Caminho para o script Python
    let scriptPath = process.env['BANCO_SCI_SCRIPT_PATH'];
    
    if (!scriptPath) {
      scriptPath = path.join(process.cwd(), 'python', 'banco_horas_sci.py');
      
      if (!fs.existsSync(scriptPath)) {
        const userHome = process.env['USERPROFILE'] || process.env['HOME'] || '';
        if (userHome) {
          scriptPath = path.join(userHome, 'Desktop', 'BANCO SCI', 'banco_horas_sci.py');
        }
      }
    }
    
    if (!fs.existsSync(scriptPath)) {
      console.warn(`⚠️  Script Python não encontrado em: ${scriptPath}`);
    } else {
      console.log(`✅ Script Python encontrado: ${scriptPath}`);
    }
    
    this.scriptPath = scriptPath;
  }

  /**
   * Gera relatório de banco de horas executando o script Python
   * Versão simplificada: executa e retorna o arquivo diretamente
   */
  async gerarRelatorio(params: GerarRelatorioParams): Promise<GerarRelatorioResult> {
    if (!fs.existsSync(this.scriptPath)) {
      return {
        success: false,
        error: `Script Python não encontrado em: ${this.scriptPath}`,
      };
    }

    try {
      // Converter datas para formato DD/MM/YYYY para o script Python
      const dataInicialParts = params.dataInicial.split('-');
      const dataFinalParts = params.dataFinal.split('-');
      const dataInicialFormatada = `${dataInicialParts[2]}/${dataInicialParts[1]}/${dataInicialParts[0]}`;
      const dataFinalFormatada = `${dataFinalParts[2]}/${dataFinalParts[1]}/${dataFinalParts[0]}`;

      // Criar script Python temporário
      const scriptDir = path.dirname(this.scriptPath);
      const tempScriptPath = path.join(scriptDir, `temp_gerar_relatorio_${Date.now()}.py`);
      const scriptDirEscaped = scriptDir.replace(/\\/g, '\\\\');
      
      const scriptContent = `
import sys
import os
sys.path.insert(0, r'${scriptDirEscaped}')

from banco_horas_sci import gerar_ficha_horas
from datetime import date

try:
    data_inicial_parts = '${params.dataInicial}'.split('-')
    data_final_parts = '${params.dataFinal}'.split('-')
    data_inicial = date(int(data_inicial_parts[0]), int(data_inicial_parts[1]), int(data_inicial_parts[2]))
    data_final = date(int(data_final_parts[0]), int(data_final_parts[1]), int(data_final_parts[2]))
    
    print("[SCRIPT] Iniciando geracao...", flush=True)
    df = gerar_ficha_horas('${params.cnpj}', data_inicial=data_inicial, data_final=data_final)
    
    if df is not None and not df.empty:
        print("SUCCESS", flush=True)
        sys.exit(0)
    else:
        print("ERROR: DataFrame vazio", flush=True)
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}", flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

      // Escrever script temporário
      fs.writeFileSync(tempScriptPath, scriptContent, 'utf-8');

      // Executar script Python com timeout de 30 minutos
      const pythonCommand = process.env['PYTHON_COMMAND'] || 'python';
      const command = `"${pythonCommand}" "${tempScriptPath}"`;
      
      console.log(`[BancoHoras] Executando: ${command}`);
      console.log(`[BancoHoras] CNPJ: ${params.cnpj}, Período: ${params.dataInicial} a ${params.dataFinal}`);
      
      const startTime = Date.now();
      const timeoutMs = 30 * 60 * 1000; // 30 minutos
      
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout: Script demorou mais de ${timeoutMs / 1000 / 60} minutos`));
          }, timeoutMs);
        });
        
        const execPromise = execAsync(command, {
          cwd: scriptDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        
        const result = await Promise.race([execPromise, timeoutPromise]);
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[BancoHoras] Script executado em ${elapsedTime}s`);
        
        // Verificar se houve erro
        if (result.stderr && !result.stdout.includes('SUCCESS')) {
          throw new Error(result.stderr.substring(0, 500));
        }
        
        if (result.stdout.includes('ERROR')) {
          const errorMatch = result.stdout.match(/ERROR: (.+)/);
          throw new Error(errorMatch ? errorMatch[1] : 'Erro ao gerar relatório');
        }
        
        if (!result.stdout.includes('SUCCESS')) {
          throw new Error('Script não retornou SUCCESS');
        }
      } catch (execError: any) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (execError.message && execError.message.includes('Timeout')) {
          throw new Error(`Timeout após ${elapsedTime}s: O relatório está muito grande ou o servidor está sobrecarregado.`);
        }
        
        throw execError;
      } finally {
        // Remover script temporário
        try {
          if (fs.existsSync(tempScriptPath)) {
            fs.unlinkSync(tempScriptPath);
          }
        } catch (e) {
          console.warn('[BancoHoras] Erro ao remover script temporário:', e);
        }
      }

      // Buscar arquivos gerados (mais recentes primeiro)
      const arquivos = fs.readdirSync(scriptDir)
        .filter(f => f.startsWith('Banco_Horas_SCI_') && f.endsWith('.xlsx'))
        .map(f => ({
          name: f,
          path: path.join(scriptDir, f),
          time: fs.statSync(path.join(scriptDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (arquivos.length === 0) {
        throw new Error('Arquivo Excel não foi gerado');
      }

      // Identificar arquivo completo e formatado
      const arquivoCompleto = arquivos.find(f => !f.name.includes('_FORMATADO'));
      const arquivoFormatado = arquivos.find(f => f.name.includes('_FORMATADO'));

      if (!arquivoCompleto) {
        throw new Error('Arquivo completo não encontrado');
      }

      console.log(`✅ [BancoHoras] Arquivo gerado: ${arquivoCompleto.name}`);
      if (arquivoFormatado) {
        console.log(`✅ [BancoHoras] Arquivo formatado: ${arquivoFormatado.name}`);
      }

      return {
        success: true,
        filePath: arquivoCompleto.path,
        arquivoFormatado: arquivoFormatado?.path,
      };
    } catch (error: any) {
      console.error('[BancoHoras] Erro ao gerar relatório:', error);
      return {
        success: false,
        error: error.message || 'Erro desconhecido ao executar script Python',
      };
    }
  }

  /**
   * Lista todos os relatórios gerados
   */
  async listarRelatorios(): Promise<BancoHorasRelatorio[]> {
    const result = await this.relatorioModel.findAll();
    return result.success && result.data ? result.data : [];
  }

  /**
   * Busca relatório por ID
   */
  async buscarRelatorioPorId(id: string): Promise<BancoHorasRelatorio | null> {
    const result = await this.relatorioModel.findById(id);
    return result.success && result.data ? result.data : null;
  }

  /**
   * Lê o arquivo Excel gerado e retorna como buffer
   */
  async lerArquivoGerado(filePath: string): Promise<Buffer> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Corrige relatórios que têm arquivo gerado mas status está incorreto
   * Esta função SEMPRE verifica se o arquivo existe e corrige o status
   */
  async corrigirRelatoriosComArquivo(): Promise<{ success: boolean; corrigidos: number }> {
    try {
      const todosRelatorios = await this.listarRelatorios();
      let corrigidos = 0;
      
      for (const relatorio of todosRelatorios) {
        // Se tem arquivo mas status não está "concluido", corrigir
        if (relatorio.arquivoPath && relatorio.arquivoPath !== '' && relatorio.id) {
          const arquivoExiste = fs.existsSync(relatorio.arquivoPath);
          
          if (arquivoExiste && relatorio.status !== 'concluido') {
            console.log(`[BancoHoras] Corrigindo relatório ${relatorio.id}: tem arquivo mas status é "${relatorio.status}"`);
            await this.relatorioModel.updateStatus(relatorio.id, 'concluido');
            corrigidos++;
          }
        }
      }
      
      if (corrigidos > 0) {
        console.log(`[BancoHoras] ${corrigidos} relatório(s) corrigido(s)`);
      }
      
      return { success: true, corrigidos };
    } catch (error: any) {
      console.error('[BancoHoras] Erro ao corrigir relatórios:', error);
      return { success: false, corrigidos: 0 };
    }
  }

  /**
   * Limpa relatórios antigos que estão travados em "gerando"
   * ATENÇÃO: Só marca como erro se NÃO tiver arquivo E estiver há mais de 60 minutos
   */
  async limparRelatoriosTravados(): Promise<{ success: boolean; atualizados: number; error?: string }> {
    try {
      const todosRelatorios = await this.listarRelatorios();
      const agora = new Date();
      let atualizados = 0;
      
      for (const relatorio of todosRelatorios) {
        if (relatorio.status === 'gerando' && relatorio.id) {
          // Converter createdAt para Date
          let dataCriacao: Date | null = null;
          
          if (relatorio.createdAt) {
            if (typeof relatorio.createdAt === 'string') {
              dataCriacao = new Date(relatorio.createdAt);
            } else if (relatorio.createdAt instanceof Date) {
              dataCriacao = relatorio.createdAt;
            }
          }
          
          // Validar se a data é válida
          if (!dataCriacao || isNaN(dataCriacao.getTime())) {
            continue;
          }
          
          const tempoDesdeCriacao = agora.getTime() - dataCriacao.getTime();
          const minutosDesdeCriacao = tempoDesdeCriacao / (60 * 1000);
          
          // Só processar se foi criado há mais de 60 minutos
          if (minutosDesdeCriacao < 60) {
            continue;
          }
          
          // Verificar se o arquivo existe no sistema de arquivos
          const arquivoExiste = relatorio.arquivoPath && relatorio.arquivoPath !== '' && fs.existsSync(relatorio.arquivoPath);
          
          if (arquivoExiste) {
            // Tem arquivo mas status ainda está "gerando" - atualizar status para "concluido"
            console.log(`[BancoHoras] Relatório ${relatorio.id} tem arquivo mas status está "gerando", atualizando para "concluido"`);
            await this.relatorioModel.updateStatus(relatorio.id, 'concluido');
            atualizados++;
          } else {
            // Não tem arquivo e está há mais de 60 minutos - marcar como erro
            console.log(`[BancoHoras] Relatório travado detectado: ID ${relatorio.id}, criado há ${minutosDesdeCriacao.toFixed(1)} minutos (sem arquivo)`);
            await this.relatorioModel.updateStatus(
              relatorio.id,
              'erro',
              'Geração interrompida ou travada. Tente gerar novamente.'
            );
            atualizados++;
          }
        }
      }
      
      return { success: true, atualizados };
    } catch (error: any) {
      console.error('[BancoHoras] Erro ao limpar relatórios travados:', error);
      return {
        success: false,
        atualizados: 0,
        error: error.message || 'Erro ao limpar relatórios travados',
      };
    }
  }

  /**
   * Deleta um relatório do histórico
   */
  async deletarRelatorio(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const relatorio = await this.buscarRelatorioPorId(id);
      
      if (!relatorio) {
        return { success: false, error: 'Relatório não encontrado' };
      }

      // Deletar arquivo completo físico se existir
      if (relatorio.arquivoPath && fs.existsSync(relatorio.arquivoPath)) {
        try {
          fs.unlinkSync(relatorio.arquivoPath);
        } catch (fileError: any) {
          console.warn(`Erro ao deletar arquivo completo: ${fileError.message}`);
        }
      }

      // Deletar arquivo formatado físico se existir
      const arquivoFormatadoPath = relatorio.arquivoFormatadoPath || 
        (relatorio.arquivoPath ? relatorio.arquivoPath.replace('.xlsx', '_FORMATADO.xlsx') : null);
      
      if (arquivoFormatadoPath && fs.existsSync(arquivoFormatadoPath)) {
        try {
          fs.unlinkSync(arquivoFormatadoPath);
        } catch (fileError: any) {
          console.warn(`Erro ao deletar arquivo formatado: ${fileError.message}`);
        }
      }

      // Deletar registro do banco
      const result = await this.relatorioModel.delete(id);
      
      if (!result || !result.success) {
        return { success: false, error: result?.error || 'Erro ao deletar relatório' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao deletar relatório:', error);
      return { success: false, error: error.message || 'Erro desconhecido ao deletar relatório' };
    }
  }
}

