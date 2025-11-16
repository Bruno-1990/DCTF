/**
 * Serviço para gerenciar progresso de consultas em lote
 * Armazena progresso em memória para permitir polling e cancelamento
 */

export interface ConsultaProgress {
  id: string;
  totalCNPJs: number;
  processados: number;
  // Progresso granular do CNPJ atual (itens do upsert)
  currentTotalItens?: number;
  currentProcessados?: number;
  encontrados?: number; // qtd de pagamentos retornados (soma)
  salvos?: number;      // inserts feitos
  atualizados?: number; // updates feitos
  pulados?: number;     // CNPJs sem novos dados
  cnpjAtual?: string;
  status: 'em_andamento' | 'concluida' | 'cancelada' | 'erro';
  iniciadoEm: Date;
  concluidoEm?: Date;
  resultado?: any;
  erro?: string;
}

class ConsultaProgressService {
  private progressos: Map<string, ConsultaProgress> = new Map();

  /**
   * Criar um novo registro de progresso
   */
  criarProgresso(id: string, totalCNPJs: number): ConsultaProgress {
    const progresso: ConsultaProgress = {
      id,
      totalCNPJs,
      processados: 0,
      encontrados: 0,
      salvos: 0,
      atualizados: 0,
      pulados: 0,
      status: 'em_andamento',
      iniciadoEm: new Date(),
    };
    
    this.progressos.set(id, progresso);
    return progresso;
  }

  /**
   * Atualizar progresso
   */
  atualizarProgresso(
    id: string,
    atualizacoes: Partial<Pick<ConsultaProgress,
      'totalCNPJs' | 'processados' |
      'currentTotalItens' | 'currentProcessados' |
      'encontrados' | 'salvos' | 'atualizados' | 'pulados' |
      'cnpjAtual' | 'status' | 'resultado' | 'erro'>>
  ): ConsultaProgress | null {
    const progresso = this.progressos.get(id);
    if (!progresso) return null;

    if (atualizacoes.totalCNPJs !== undefined) {
      progresso.totalCNPJs = atualizacoes.totalCNPJs;
    }
    if (atualizacoes.processados !== undefined) {
      progresso.processados = atualizacoes.processados;
    }
    if (atualizacoes.currentTotalItens !== undefined) {
      progresso.currentTotalItens = atualizacoes.currentTotalItens;
    }
    if (atualizacoes.currentProcessados !== undefined) {
      progresso.currentProcessados = atualizacoes.currentProcessados;
    }
    if (atualizacoes.encontrados !== undefined) {
      progresso.encontrados = atualizacoes.encontrados;
    }
    if (atualizacoes.salvos !== undefined) {
      progresso.salvos = atualizacoes.salvos;
    }
    if (atualizacoes.atualizados !== undefined) {
      progresso.atualizados = atualizacoes.atualizados;
    }
    if (atualizacoes.pulados !== undefined) {
      progresso.pulados = atualizacoes.pulados;
    }
    if (atualizacoes.cnpjAtual !== undefined) {
      progresso.cnpjAtual = atualizacoes.cnpjAtual;
    }
    if (atualizacoes.status !== undefined) {
      progresso.status = atualizacoes.status;
    }
    if (atualizacoes.resultado !== undefined) {
      progresso.resultado = atualizacoes.resultado;
    }
    if (atualizacoes.erro !== undefined) {
      progresso.erro = atualizacoes.erro;
    }

    if (atualizacoes.status === 'concluida' || atualizacoes.status === 'cancelada' || atualizacoes.status === 'erro') {
      progresso.concluidoEm = new Date();
    }

    this.progressos.set(id, progresso);
    return progresso;
  }

  /**
   * Obter progresso atual
   */
  obterProgresso(id: string): ConsultaProgress | null {
    return this.progressos.get(id) || null;
  }

  /**
   * Cancelar consulta
   */
  cancelar(id: string): boolean {
    const progresso = this.progressos.get(id);
    if (!progresso || progresso.status !== 'em_andamento') {
      return false;
    }

    progresso.status = 'cancelada';
    progresso.concluidoEm = new Date();
    this.progressos.set(id, progresso);
    return true;
  }

  /**
   * Limpar progressos antigos (opcional - para limpeza de memória)
   */
  limparAntigos(horas: number = 24): void {
    const agora = new Date();
    const limite = new Date(agora.getTime() - horas * 60 * 60 * 1000);

    for (const [id, progresso] of this.progressos.entries()) {
      const dataReferencia = progresso.concluidoEm || progresso.iniciadoEm;
      if (dataReferencia < limite) {
        this.progressos.delete(id);
      }
    }
  }

  /**
   * Remover progresso específico
   */
  remover(id: string): boolean {
    return this.progressos.delete(id);
  }
}

// Exportar instância singleton
export const consultaProgressService = new ConsultaProgressService();

