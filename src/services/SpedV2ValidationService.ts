/**
 * Service para Validação SPED v2.0
 * Utiliza normalizadores e modelo canônico
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

interface ValidationRequest {
  validationId: string;
  spedBuffer: Buffer;
  xmlBuffers: Buffer[];
  clienteId?: string;
  competencia?: string;
  perfilFiscal?: {
    segmento?: string;
    regime?: string;
    operaST?: boolean;
    regimeEspecial?: boolean;
    operaInterestadualDIFAL?: boolean;
  };
}

interface ValidationStatus {
  validationId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  resultado?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class SpedV2ValidationService {
  private validations: Map<string, ValidationStatus> = new Map();
  private readonly tmpDir: string;
  private processingQueue: string[] = [];

  constructor() {
    this.tmpDir = path.join(os.tmpdir(), 'sped_v2_validations');
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Inicia uma nova validação
   */
  async iniciarValidacao(request: ValidationRequest): Promise<ValidationStatus> {
    const status: ValidationStatus = {
      validationId: request.validationId,
      status: 'queued',
      progress: 0,
      message: 'Aguardando processamento...',
      startedAt: new Date()
    };

    this.validations.set(request.validationId, status);
    this.processingQueue.push(request.validationId);

    // Processar em background
    this.processarValidacao(request).catch(err => {
      console.error(`[SpedV2ValidationService] Erro ao processar validação ${request.validationId}:`, err);
      this.updateStatus(request.validationId, {
        status: 'error',
        message: 'Erro ao processar validação',
        error: err.message
      });
    });

    return status;
  }

  /**
   * Processa validação usando normalizadores v2
   */
  private async processarValidacao(request: ValidationRequest): Promise<void> {
    const validationDir = path.join(this.tmpDir, request.validationId);
    fs.mkdirSync(validationDir, { recursive: true });

    try {
      this.updateStatus(request.validationId, {
        status: 'processing',
        progress: 5,
        message: 'Normalizando arquivos...'
      });

      // Salvar arquivo SPED
      const spedPath = path.join(validationDir, 'sped.txt');
      fs.writeFileSync(spedPath, request.spedBuffer);

      // Salvar XMLs
      const xmlDir = path.join(validationDir, 'xmls');
      fs.mkdirSync(xmlDir, { recursive: true });
      request.xmlBuffers.forEach((xmlBuffer, index) => {
        const xmlPath = path.join(xmlDir, `xml_${index}.xml`);
        fs.writeFileSync(xmlPath, xmlBuffer);
      });

      this.updateStatus(request.validationId, {
        progress: 15,
        message: 'Aplicando normalização canônica...'
      });

      // Executar script Python de normalização v2
      const pythonScript = path.join(__dirname, '../../python/sped/v2/processar_validacao_v2.py');
      
      // Preparar argumentos
      const args = [
        `"${spedPath}"`,
        `"${xmlDir}"`,
        `--validation-id="${request.validationId}"`,
        `--output-dir="${validationDir}"`
      ];

      // Adicionar perfil fiscal se fornecido
      if (request.perfilFiscal) {
        const perfil = request.perfilFiscal;
        if (perfil.segmento) args.push(`--segmento="${perfil.segmento}"`);
        if (perfil.regime) args.push(`--regime="${perfil.regime}"`);
        if (perfil.operaST) args.push('--opera-st');
        if (perfil.regimeEspecial) args.push('--regime-especial');
        if (perfil.operaInterestadualDIFAL) args.push('--opera-interestadual-difal');
      }

      const command = `python "${pythonScript}" ${args.join(' ')}`;

      this.updateStatus(request.validationId, {
        progress: 25,
        message: 'Executando validações...'
      });

      const { stdout, stderr } = await execAsync(command, {
        cwd: path.join(__dirname, '../../python/sped/v2'),
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });

      // Processar resultado
      const resultadoPath = path.join(validationDir, 'resultado.json');
      let resultado: any = {};

      if (fs.existsSync(resultadoPath)) {
        const resultadoStr = fs.readFileSync(resultadoPath, 'utf-8');
        resultado = JSON.parse(resultadoStr);
      } else {
        // Tentar parsear stdout como JSON
        try {
          resultado = JSON.parse(stdout.trim());
        } catch (e) {
          console.warn(`[SpedV2ValidationService] Não foi possível parsear resultado JSON:`, e);
        }
      }

      this.updateStatus(request.validationId, {
        status: 'completed',
        progress: 100,
        message: 'Validação concluída',
        resultado,
        completedAt: new Date()
      });

    } catch (error: any) {
      console.error(`[SpedV2ValidationService] Erro ao processar validação:`, error);
      this.updateStatus(request.validationId, {
        status: 'error',
        progress: 0,
        message: 'Erro ao processar validação',
        error: error.message || String(error),
        completedAt: new Date()
      });
    } finally {
      // Remover da fila
      const index = this.processingQueue.indexOf(request.validationId);
      if (index > -1) {
        this.processingQueue.splice(index, 1);
      }

      // Limpar arquivos temporários após 1 hora (opcional)
      setTimeout(() => {
        try {
          if (fs.existsSync(validationDir)) {
            fs.rmSync(validationDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.warn(`[SpedV2ValidationService] Erro ao limpar arquivos temporários:`, e);
        }
      }, 60 * 60 * 1000);
    }
  }

  /**
   * Atualiza status de uma validação
   */
  private updateStatus(validationId: string, updates: Partial<ValidationStatus>): void {
    const current = this.validations.get(validationId);
    if (current) {
      this.validations.set(validationId, { ...current, ...updates });
    }
  }

  /**
   * Obtém status de uma validação
   */
  getStatus(validationId: string): ValidationStatus | null {
    return this.validations.get(validationId) || null;
  }

  /**
   * Lista todas as validações
   */
  listValidations(): ValidationStatus[] {
    return Array.from(this.validations.values());
  }

  /**
   * Remove validação da memória
   */
  removeValidation(validationId: string): boolean {
    return this.validations.delete(validationId);
  }

  /**
   * Obtém diretório de uma validação
   */
  getValidationDir(validationId: string): string {
    return path.join(this.tmpDir, validationId);
  }
}

// Singleton
let instance: SpedV2ValidationService | null = null;

export function getSpedV2ValidationService(): SpedV2ValidationService {
  if (!instance) {
    instance = new SpedV2ValidationService();
  }
  return instance;
}


