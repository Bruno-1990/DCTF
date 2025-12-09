import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';

const execAsync = promisify(exec);

interface ValidationStatus {
  validationId: string;
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  resultado?: any;
  error?: string;
}

export class SpedValidationService {
  private validations: Map<string, ValidationStatus> = new Map();
  private readonly tmpDir: string;

  constructor() {
    // Criar diretório temporário para validações
    this.tmpDir = path.join(os.tmpdir(), 'sped_validations');
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Processa validação de SPED e XMLs
   */
  async processarValidacao(
    validationId: string,
    spedBuffer: Buffer,
    xmlBuffers: Buffer[],
    setores?: string[]
  ): Promise<void> {
    // Inicializar status
    this.validations.set(validationId, {
      validationId,
      status: 'processing',
      progress: 0,
      message: 'Iniciando processamento...'
    });

    try {
      // Criar diretório temporário para esta validação
      const validationDir = path.join(this.tmpDir, validationId);
      fs.mkdirSync(validationDir, { recursive: true });

      // Salvar arquivo SPED
      const spedPath = path.join(validationDir, 'sped.txt');
      fs.writeFileSync(spedPath, spedBuffer);

      // Salvar XMLs
      const xmlDir = path.join(validationDir, 'xmls');
      fs.mkdirSync(xmlDir, { recursive: true });

      for (let i = 0; i < xmlBuffers.length; i++) {
        const xmlPath = path.join(xmlDir, `nfe_${i + 1}.xml`);
        fs.writeFileSync(xmlPath, xmlBuffers[i]);
      }

      this.updateStatus(validationId, 10, 'Arquivos salvos, iniciando processamento Python...');

      // Executar script Python
      const pythonScript = path.join(__dirname, '../../python/sped/processar_validacao.py');
      const outputPath = path.join(validationDir, 'resultado.json');
      
      // Preparar lista de setores para o script Python
      const setoresList = (setores && setores.length > 0) ? setores.join(',') : '';

      // Criar script Python temporário se não existir
      if (!fs.existsSync(pythonScript)) {
        await this.criarScriptPython();
      }

      this.updateStatus(validationId, 20, 'Executando validações...');

      // Variáveis para capturar output
      let stdoutBuffer = '';
      let stderrBuffer = '';
      
      try {
        // Usar spawn ao invés de exec para capturar output em tempo real
        const pythonProcess = spawn('python', [
          pythonScript,
          spedPath,
          xmlDir,
          outputPath,
          setoresList
        ], {
          cwd: path.join(__dirname, '../../python/sped'),
          stdio: ['ignore', 'pipe', 'pipe']
        });

        // Processar stdout em tempo real
        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdoutBuffer += data.toString();
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() || ''; // Manter última linha incompleta
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            try {
              const jsonData = JSON.parse(trimmed);
              if (jsonData.progress !== undefined) {
                this.updateStatus(validationId, jsonData.progress, jsonData.message || 'Processando...');
              }
              if (jsonData.error) {
                throw new Error(jsonData.error);
              }
            } catch (e: any) {
              // Ignorar linhas que não são JSON válido
              if (e.name !== 'SyntaxError') {
                // Se for outro erro (não JSON), pode ser importante
                console.warn(`Erro ao processar linha do Python: ${trimmed}`, e.message);
              }
            }
          }
        });

        // Capturar stderr
        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderrBuffer += data.toString();
        });

        // Aguardar conclusão do processo
        await new Promise<void>((resolve, reject) => {
          pythonProcess.on('close', (code: number) => {
            if (code !== 0) {
              // Tentar extrair mensagem de erro do stderr
              const errorMsg = stderrBuffer || 'Processo Python terminou com erro';
              reject(new Error(errorMsg));
            } else {
              resolve();
            }
          });

          pythonProcess.on('error', (error: Error) => {
            reject(error);
          });
        });

        // Processar qualquer linha restante no buffer
        if (stdoutBuffer.trim()) {
          try {
            const jsonData = JSON.parse(stdoutBuffer.trim());
            if (jsonData.progress !== undefined) {
              this.updateStatus(validationId, jsonData.progress, jsonData.message || 'Processando...');
            }
          } catch (e) {
            // Ignorar se não for JSON válido
          }
        }

        // Log stderr se houver (mas não é erro se não tiver Traceback)
        if (stderrBuffer && !stderrBuffer.includes('Traceback') && !stderrBuffer.includes('FutureWarning')) {
          console.warn(`Python stderr: ${stderrBuffer}`);
        }
      } catch (execError: any) {
        // Se o comando falhou, verificar se há resultado parcial
        let errorMessage = execError.message || 'Erro desconhecido';
        
        // Tentar extrair mensagem de erro do stderrBuffer
        if (stderrBuffer) {
          const stderrLines = stderrBuffer.split('\n');
          const errorLine = stderrLines.find((l: string) => 
            l.includes('Error') || l.includes('Exception') || l.includes('SyntaxError')
          );
          if (errorLine) {
            errorMessage = errorLine.trim();
          }
        }
        
        throw new Error(errorMessage);
      }

      this.updateStatus(validationId, 90, 'Processando resultados...');

      // Ler resultado
      let resultado: any = {};
      if (fs.existsSync(outputPath)) {
        try {
          const resultadoData = fs.readFileSync(outputPath, 'utf-8');
          // Substituir NaN, Infinity, -Infinity antes de parsear
          const cleanedData = resultadoData
            .replace(/:\s*NaN\b/g, ': null')
            .replace(/:\s*Infinity\b/g, ': null')
            .replace(/:\s*-Infinity\b/g, ': null');
          resultado = JSON.parse(cleanedData);
          
          console.log(`[${validationId}] Resultado carregado:`, {
            hasEmpresa: !!resultado.empresa,
            validacoesKeys: resultado.validacoes ? Object.keys(resultado.validacoes) : [],
            reportsKeys: resultado.reports ? Object.keys(resultado.reports) : []
          });
        } catch (parseError: any) {
          console.error(`[${validationId}] Erro ao processar resultado JSON:`, parseError);
          throw new Error(`Erro ao processar resultado JSON: ${parseError.message}`);
        }
      } else {
        console.error(`[${validationId}] Arquivo de resultado não encontrado: ${outputPath}`);
        throw new Error('Arquivo de resultado não foi gerado');
      }

      // Marcar como completo
      this.updateStatus(validationId, 100, 'Validação concluída', resultado);
      console.log(`[${validationId}] Status atualizado para completed com resultado`);

    } catch (error: any) {
      console.error(`Erro no processamento ${validationId}:`, error);
      this.updateStatus(validationId, 0, 'Erro no processamento', undefined, error.message);
    }
  }

  /**
   * Atualiza status da validação
   */
  private updateStatus(
    validationId: string,
    progress: number,
    message: string,
    resultado?: any,
    error?: string
  ): void {
    const status = this.validations.get(validationId) || {
      validationId,
      status: 'processing' as const,
      progress: 0,
      message: ''
    };

    status.progress = progress;
    status.message = message;
    
    if (resultado) {
      status.resultado = resultado;
      status.status = 'completed';
    }
    
    if (error) {
      status.error = error;
      status.status = 'error';
    }

    this.validations.set(validationId, status);
  }

  /**
   * Obtém status da validação
   */
  async obterStatus(validationId: string): Promise<ValidationStatus | null> {
    return this.validations.get(validationId) || null;
  }

  /**
   * Obtém resultado da validação
   */
  async obterResultado(validationId: string): Promise<any> {
    const status = this.validations.get(validationId);
    if (!status) {
      return null;
    }
    
    // Se completou com sucesso, retornar resultado
    if (status.status === 'completed' && status.resultado) {
      return status.resultado;
    }
    
    // Se houve erro, retornar informações do erro
    if (status.status === 'error') {
      return {
        error: status.error || 'Erro desconhecido',
        message: status.message,
        status: 'error'
      };
    }
    
    // Se ainda está processando, retornar null
    return null;
  }

  /**
   * Exporta resultado para Excel
   */
  async exportarExcel(validationId: string): Promise<string | null> {
    const resultado = await this.obterResultado(validationId);
    if (!resultado) {
      return null;
    }

    const workbook = new ExcelJS.Workbook();
    
    // Criar abas para cada tipo de resultado
    if (resultado.reports) {
      for (const [sheetName, data] of Object.entries(resultado.reports)) {
        const worksheet = workbook.addWorksheet(sheetName);
        // Adicionar dados (implementar lógica de conversão de DataFrame para Excel)
      }
    }

    const outputPath = path.join(this.tmpDir, validationId, 'resultado.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    return outputPath;
  }

  /**
   * Exporta resultado para PDF
   */
  async exportarPDF(validationId: string): Promise<string | null> {
    // Implementar geração de PDF
    // Por enquanto, retorna null
    return null;
  }

  /**
   * Lista histórico de validações
   */
  async listarHistorico(limit: number, offset: number): Promise<any[]> {
    const historico: any[] = [];
    
    for (const [id, status] of this.validations.entries()) {
      historico.push({
        id,
        status: status.status,
        progress: status.progress,
        message: status.message,
        createdAt: new Date().toISOString() // Adicionar timestamp real
      });
    }

    return historico.slice(offset, offset + limit);
  }

  /**
   * Deleta validação
   */
  async deletarValidacao(validationId: string): Promise<void> {
    this.validations.delete(validationId);
    
    // Limpar arquivos temporários
    const validationDir = path.join(this.tmpDir, validationId);
    if (fs.existsSync(validationDir)) {
      fs.rmSync(validationDir, { recursive: true, force: true });
    }
  }

  /**
   * Cria script Python para processamento
   */
  private async criarScriptPython(): Promise<void> {
    const scriptPath = path.join(__dirname, '../../python/sped/processar_validacao.py');
    const scriptContent = `# Script para processar validação SPED
import sys
import json
from pathlib import Path
from reconcile import build_dataframes, make_reports
from validators import load_rules_for_sector, run_all_validations
from excelio import write_workbook

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Argumentos insuficientes"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    xml_dir = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    rules_path = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    
    try:
        # Carregar dados
        materiais = build_dataframes(sped_path, xml_dir)
        
        # Carregar regras
        setor = rules_path.stem if rules_path and rules_path.exists() else None
        rules = load_rules_for_sector(setor) if setor else {}
        
        # Executar validações
        validacoes = run_all_validations(sped_path, materiais.xml_nf, rules)
        
        # Gerar relatórios
        reports = make_reports(materiais, rules)
        
        # Combinar resultados
        resultado = {
            "empresa": {
                "cnpj": materiais.empresa.cnpj,
                "razao": materiais.empresa.razao,
                "dt_ini": materiais.empresa.dt_ini,
                "dt_fin": materiais.empresa.dt_fin
            },
            "validacoes": {k: v.to_dict('records') if hasattr(v, 'to_dict') else v for k, v in validacoes.items()},
            "reports": {k: v.to_dict('records') if hasattr(v, 'to_dict') else v for k, v in reports.items()}
        }
        
        # Salvar resultado
        output_path.write_text(json.dumps(resultado, default=str, ensure_ascii=False), encoding='utf-8')
        
        print(json.dumps({"success": True, "output": str(output_path)}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
  }
}

