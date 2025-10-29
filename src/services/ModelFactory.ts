/**
 * Fábrica de Modelos - Centraliza a criação e gerenciamento de modelos
 * Implementa padrão Factory para criação de instâncias de modelos
 */

import { Cliente } from '../models/Cliente';
import { DCTF } from '../models/DCTF';
import { DCTFDados } from '../models/DCTFDados';
import { Analise } from '../models/Analise';
import { Flag } from '../models/Flag';
import { Relatorio } from '../models/Relatorio';

export class ModelFactory {
  private static instances: Map<string, any> = new Map();

  /**
   * Obter instância singleton do modelo Cliente
   */
  static getCliente(): Cliente {
    if (!this.instances.has('cliente')) {
      this.instances.set('cliente', new Cliente());
    }
    return this.instances.get('cliente');
  }

  /**
   * Obter instância singleton do modelo DCTF
   */
  static getDCTF(): DCTF {
    if (!this.instances.has('dctf')) {
      this.instances.set('dctf', new DCTF());
    }
    return this.instances.get('dctf');
  }

  /**
   * Obter instância singleton do modelo DCTFDados
   */
  static getDCTFDados(): DCTFDados {
    if (!this.instances.has('dctfDados')) {
      this.instances.set('dctfDados', new DCTFDados());
    }
    return this.instances.get('dctfDados');
  }

  /**
   * Obter instância singleton do modelo Analise
   */
  static getAnalise(): Analise {
    if (!this.instances.has('analise')) {
      this.instances.set('analise', new Analise());
    }
    return this.instances.get('analise');
  }

  /**
   * Obter instância singleton do modelo Flag
   */
  static getFlag(): Flag {
    if (!this.instances.has('flag')) {
      this.instances.set('flag', new Flag());
    }
    return this.instances.get('flag');
  }

  /**
   * Obter instância singleton do modelo Relatorio
   */
  static getRelatorio(): Relatorio {
    if (!this.instances.has('relatorio')) {
      this.instances.set('relatorio', new Relatorio());
    }
    return this.instances.get('relatorio');
  }

  /**
   * Obter todos os modelos disponíveis
   */
  static getAllModels(): {
    cliente: Cliente;
    dctf: DCTF;
    dctfDados: DCTFDados;
    analise: Analise;
    flag: Flag;
    relatorio: Relatorio;
  } {
    return {
      cliente: this.getCliente(),
      dctf: this.getDCTF(),
      dctfDados: this.getDCTFDados(),
      analise: this.getAnalise(),
      flag: this.getFlag(),
      relatorio: this.getRelatorio(),
    };
  }

  /**
   * Limpar cache de instâncias (útil para testes)
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Verificar se um modelo está disponível
   */
  static hasModel(modelName: string): boolean {
    return this.instances.has(modelName);
  }

  /**
   * Obter lista de modelos disponíveis
   */
  static getAvailableModels(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Obter estatísticas dos modelos
   */
  static async getModelsStats(): Promise<{
    cliente: any;
    dctf: any;
    analise: any;
    flag: any;
    relatorio: any;
  }> {
    const models = this.getAllModels();
    
    const [clienteStats, dctfStats, analiseStats, flagStats, relatorioStats] = await Promise.all([
      models.cliente.getStats(),
      models.dctf.getStats(),
      models.analise.getStats(),
      models.flag.getStats(),
      models.relatorio.getStats(),
    ]);

    return {
      cliente: clienteStats.success ? clienteStats.data : null,
      dctf: dctfStats.success ? dctfStats.data : null,
      analise: analiseStats.success ? analiseStats.data : null,
      flag: flagStats.success ? flagStats.data : null,
      relatorio: relatorioStats.success ? relatorioStats.data : null,
    };
  }
}
