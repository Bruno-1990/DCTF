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
  arquivoFormatado?: string;  // Caminho do arquivo formatado (opcional)
  relatorioId?: string;
  error?: string;
}

/**
 * Serviço para gerar relatório de banco de horas do SCI
 * Executa o script Python do projeto BANCO SCI
 * 
 * Melhorias implementadas:
 * - Filtro de colaboradores ativos: inclui colaboradores com registros de folha no período
 *   (verba 5 ou horas extras - verbas 603, 605, 608, 613, 615), garantindo que todos os 
 *   colaboradores que trabalharam sejam incluídos
 * - Otimização de performance: query de colaboradores ativos agora filtra apenas verbas relevantes,
 *   evitando processamento desnecessário de milhões de registros
 * - Cálculo do total geral corrigido: converte cada valor mensal de horas extras para horas decimais
 *   antes de somar, garantindo precisão e que o total bata exatamente com a soma das colunas mensais
 * - Logs de performance: adicionados logs detalhados para identificar gargalos de performance
 */
export class BancoHorasService {
  private scriptPath: string;
  private relatorioModel: BancoHorasRelatorioModel;

  constructor() {
    this.relatorioModel = new BancoHorasRelatorioModel();
    // Caminho para o script Python banco_horas_sci.py
    // Prioridade: variável de ambiente > script local no projeto > caminho externo
    let scriptPath = process.env['BANCO_SCI_SCRIPT_PATH'];
    
    if (!scriptPath) {
      // Tentar script local no projeto DCTF_MPC primeiro
      scriptPath = path.join(process.cwd(), 'python', 'banco_horas_sci.py');
      
      // Se não encontrar localmente, tentar caminho externo (compatibilidade)
      if (!fs.existsSync(scriptPath)) {
        const userHome = process.env['USERPROFILE'] || process.env['HOME'] || '';
        if (userHome) {
          scriptPath = path.join(userHome, 'Desktop', 'BANCO SCI', 'banco_horas_sci.py');
        } else {
          // Fallback: relativo ao projeto
          scriptPath = path.join(process.cwd(), '..', '..', 'Desktop', 'BANCO SCI', 'banco_horas_sci.py');
        }
      }
    }
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(scriptPath)) {
      console.warn(`⚠️  Script Python banco_horas_sci.py não encontrado em: ${scriptPath}`);
    } else {
      console.log(`✅ Script Python banco_horas_sci.py encontrado: ${scriptPath}`);
    }
    
    this.scriptPath = scriptPath;
  }

  /**
   * Gera relatório de banco de horas executando o script Python
   * 
   * @param params Parâmetros para geração do relatório
   * @returns Caminho do arquivo gerado ou erro
   */
  async gerarRelatorio(params: GerarRelatorioParams): Promise<GerarRelatorioResult> {
    // Criar registro inicial no histórico com status "gerando"
    let relatorioId: string | undefined;
    try {
      const relatorioInicial = await this.relatorioModel.createRelatorio({
        cnpj: params.cnpj,
        razaoSocial: params.razaoSocial,
        dataInicial: params.dataInicial,
        dataFinal: params.dataFinal,
        arquivoPath: '',
        nomeArquivo: '',
        status: 'gerando',
      });

      if (relatorioInicial.success && relatorioInicial.data?.id) {
        relatorioId = relatorioInicial.data.id;
        console.log(`✅ Registro de histórico criado: ID ${relatorioId}`);
      } else {
        console.warn('⚠️  Falha ao criar registro inicial:', relatorioInicial.error);
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar registro inicial:', error.message);
    }
    if (!fs.existsSync(this.scriptPath)) {
      return {
        success: false,
        error: `Script Python não encontrado em: ${this.scriptPath}. Configure a variável BANCO_SCI_SCRIPT_PATH ou verifique o caminho padrão.`,
      };
    }

    try {
      // Converter datas para formato DD/MM/YYYY para o script Python
      const dataInicialParts = params.dataInicial.split('-');
      const dataFinalParts = params.dataFinal.split('-');
      const dataInicialFormatada = `${dataInicialParts[2]}/${dataInicialParts[1]}/${dataInicialParts[0]}`;
      const dataFinalFormatada = `${dataFinalParts[2]}/${dataFinalParts[1]}/${dataFinalParts[0]}`;

      // Criar script Python temporário que chama a função diretamente
      const scriptDir = path.dirname(this.scriptPath);
      const tempScriptPath = path.join(scriptDir, `temp_gerar_relatorio_${Date.now()}.py`);
      
      // Escapar barras invertidas para o script Python
      const scriptDirEscaped = scriptDir.replace(/\\/g, '\\\\');
      
      const scriptContent = `
import sys
import os
sys.path.insert(0, r'${scriptDirEscaped}')

from banco_horas_sci import gerar_ficha_horas
from datetime import date

try:
    # Converter datas
    data_inicial_parts = '${params.dataInicial}'.split('-')
    data_final_parts = '${params.dataFinal}'.split('-')
    data_inicial = date(int(data_inicial_parts[0]), int(data_inicial_parts[1]), int(data_inicial_parts[2]))
    data_final = date(int(data_final_parts[0]), int(data_final_parts[1]), int(data_final_parts[2]))
    
    # Gerar relatório
    df = gerar_ficha_horas('${params.cnpj}', data_inicial=data_inicial, data_final=data_final)
    
    if df is not None:
        print("SUCCESS")
        sys.exit(0)
    else:
        print("ERROR: Falha ao gerar relatório")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

      // Escrever script temporário
      fs.writeFileSync(tempScriptPath, scriptContent, 'utf-8');

      // Executar script Python
      const pythonCommand = process.env['PYTHON_COMMAND'] || 'python';
      const command = `"${pythonCommand}" "${tempScriptPath}"`;
      
      console.log(`Executando: ${command}`);
      console.log(`Diretório de trabalho: ${scriptDir}`);
      
      let stdout = '';
      let stderr = '';
      
      try {
        const result = await execAsync(command, {
          cwd: scriptDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        stdout = result.stdout || '';
        stderr = result.stderr || '';
      } catch (execError: any) {
        stdout = execError.stdout || '';
        stderr = execError.stderr || '';
        // Se o erro não for de execução do script, relançar
        if (!stdout.includes('ERROR') && !stderr.includes('ERROR')) {
          throw execError;
        }
      }

      // Remover script temporário
      try {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      } catch (e) {
        console.warn('Erro ao remover script temporário:', e);
      }

      if (stderr && !stdout.includes('SUCCESS')) {
        console.error('Erro no script Python:', stderr);
        return {
          success: false,
          error: stderr || 'Erro ao executar script Python',
        };
      }

      if (stdout.includes('ERROR')) {
        const errorMatch = stdout.match(/ERROR: (.+)/);
        return {
          success: false,
          error: errorMatch ? errorMatch[1] : 'Erro ao gerar relatório',
        };
      }

      // Buscar arquivos gerados (o script gera com timestamp)
      const arquivos = fs.readdirSync(scriptDir)
        .filter(f => f.startsWith('Banco_Horas_SCI_') && f.endsWith('.xlsx'))
        .map(f => ({
          name: f,
          path: path.join(scriptDir, f),
          time: fs.statSync(path.join(scriptDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time); // Mais recente primeiro

      if (arquivos.length === 0) {
        return {
          success: false,
          error: 'Arquivo Excel não foi gerado',
        };
      }

      // Identificar arquivo completo e formatado
      const arquivoCompleto = arquivos.find(f => !f.name.includes('_FORMATADO'));
      const arquivoFormatado = arquivos.find(f => f.name.includes('_FORMATADO'));

      if (!arquivoCompleto) {
        return {
          success: false,
          error: 'Arquivo completo não encontrado',
        };
      }

      const filePath = arquivoCompleto.path; // Retornar o completo como principal
      const stats = fs.statSync(filePath);

      // Atualizar registro no histórico com status "concluido"
      if (relatorioId) {
        // Atualizar informações do arquivo (mapear para snake_case)
        const dbUpdates: any = {
          status: 'concluido',
          arquivo_path: filePath,
          nome_arquivo: arquivoCompleto.name,
          tamanho_arquivo: stats.size,
        };
        
        // Se houver arquivo formatado, salvar também
        if (arquivoFormatado) {
          dbUpdates.arquivoFormatadoPath = arquivoFormatado.path;
          dbUpdates.arquivoFormatadoNome = arquivoFormatado.name;
        }
        
        await this.relatorioModel.update(relatorioId, dbUpdates);
        console.log(`✅ Histórico atualizado: ID ${relatorioId}, arquivo: ${arquivoCompleto.name}`);
        if (arquivoFormatado) {
          console.log(`✅ Arquivo formatado salvo: ${arquivoFormatado.name}`);
        }
      }

      // Retornar o arquivo completo (principal)
      return {
        success: true,
        filePath, // Arquivo completo (principal)
        arquivoFormatado: arquivoFormatado?.path, // Arquivo formatado (opcional)
        relatorioId,
      };
    } catch (error: any) {
      console.error('Erro ao gerar relatório:', error);
      
      // Atualizar registro no histórico com status "erro"
      if (relatorioId) {
        await this.relatorioModel.updateStatus(relatorioId, 'erro', error.message);
      }

      return {
        success: false,
        error: error.message || 'Erro desconhecido ao executar script Python',
        relatorioId,
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
   * Deleta um relatório do histórico
   */
  async deletarRelatorio(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Buscar relatório para obter o caminho do arquivo
      const relatorio = await this.buscarRelatorioPorId(id);
      
      if (!relatorio) {
        return { success: false, error: 'Relatório não encontrado' };
      }

      // Deletar arquivo completo físico se existir
      if (relatorio.arquivoPath && fs.existsSync(relatorio.arquivoPath)) {
        try {
          fs.unlinkSync(relatorio.arquivoPath);
          console.log(`Arquivo completo deletado: ${relatorio.arquivoPath}`);
        } catch (fileError: any) {
          console.warn(`Erro ao deletar arquivo completo: ${fileError.message}`);
          // Continuar mesmo se não conseguir deletar o arquivo
        }
      }

      // Deletar arquivo formatado físico se existir
      const arquivoFormatadoPath = relatorio.arquivoFormatadoPath || 
        (relatorio.arquivoPath ? relatorio.arquivoPath.replace('.xlsx', '_FORMATADO.xlsx') : null);
      
      if (arquivoFormatadoPath && fs.existsSync(arquivoFormatadoPath)) {
        try {
          fs.unlinkSync(arquivoFormatadoPath);
          console.log(`Arquivo formatado deletado: ${arquivoFormatadoPath}`);
        } catch (fileError: any) {
          console.warn(`Erro ao deletar arquivo formatado: ${fileError.message}`);
          // Continuar mesmo se não conseguir deletar o arquivo
        }
      }

      // Deletar registro do banco
      // O modelo herda de DatabaseService que delega para MySQLDatabaseService
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

