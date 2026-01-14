/**
 * Serviço de agendamento para atualizar cache de faturamento IRPF durante a noite
 */

import { Cliente } from '../models/Cliente';
import { IrpfFaturamentoCache } from '../models/IrpfFaturamentoCache';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class IrpfScheduler {
  private clienteModel: Cliente;
  private cacheModel: IrpfFaturamentoCache;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.clienteModel = new Cliente();
    this.cacheModel = new IrpfFaturamentoCache();
  }

  /**
   * Iniciar scheduler para atualizar cache à noite (02:00 AM)
   */
  start(): void {
    // Verificar a cada hora se é 02:00 AM
    this.intervalId = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Executar às 02:00 AM
      if (hour === 2 && minute === 0 && !this.isRunning) {
        console.log('[IRPF Scheduler] Iniciando atualização noturna do cache...');
        this.atualizarTodosClientes().catch((error) => {
          console.error('[IRPF Scheduler] Erro na atualização noturna:', error);
        });
      }
    }, 60000); // Verificar a cada minuto

    console.log('[IRPF Scheduler] Scheduler iniciado. Atualização automática às 02:00 AM.');
  }

  /**
   * Parar scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[IRPF Scheduler] Scheduler parado.');
    }
  }

  /**
   * Atualizar cache de faturamento para todos os clientes com código SCI
   */
  async atualizarTodosClientes(): Promise<{ sucesso: number; erros: number; total: number }> {
    if (this.isRunning) {
      console.log('[IRPF Scheduler] Atualização já em andamento. Ignorando...');
      return { sucesso: 0, erros: 0, total: 0 };
    }

    this.isRunning = true;
    const stats = { sucesso: 0, erros: 0, total: 0 };

    try {
      // Buscar todos os clientes com código SCI
      const clientesResult = await this.clienteModel.findAll({
        limit: 10000, // Buscar muitos clientes
        page: 1,
      });

      if (!clientesResult.success || !clientesResult.data) {
        throw new Error('Erro ao buscar clientes');
      }

      const clientes = clientesResult.data.items.filter(
        (c) => c.codigo_sci && !isNaN(Number(c.codigo_sci))
      );

      stats.total = clientes.length;
      console.log(`[IRPF Scheduler] Encontrados ${stats.total} clientes com código SCI.`);

      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 1, anoAtual];

      // Processar em lotes de 5 para não sobrecarregar
      const batchSize = 5;
      for (let i = 0; i < clientes.length; i += batchSize) {
        const batch = clientes.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (cliente) => {
            try {
              const codigoSci = Number(cliente.codigo_sci);
              if (!codigoSci) return;

              // Atualizar para cada ano
              for (const ano of anosParaBuscar) {
                await this.atualizarFaturamentoCliente(cliente.id!, codigoSci, ano);
              }

              stats.sucesso++;
              if (stats.sucesso % 10 === 0) {
                console.log(`[IRPF Scheduler] Progresso: ${stats.sucesso}/${stats.total} clientes atualizados.`);
              }
            } catch (error: any) {
              stats.erros++;
              console.error(
                `[IRPF Scheduler] Erro ao atualizar cliente ${cliente.id}:`,
                error.message
              );
            }
          })
        );

        // Pequeno delay entre lotes
        if (i + batchSize < clientes.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(
        `[IRPF Scheduler] Atualização concluída: ${stats.sucesso} sucesso, ${stats.erros} erros de ${stats.total} clientes.`
      );
    } catch (error: any) {
      console.error('[IRPF Scheduler] Erro geral na atualização:', error);
    } finally {
      this.isRunning = false;
    }

    return stats;
  }

  /**
   * Atualizar faturamento de um cliente específico
   */
  private async atualizarFaturamentoCliente(
    clienteId: string,
    codigoSci: number,
    ano: number
  ): Promise<void> {
    try {
      const dataInicio = `01.01.${ano}`;
      const dataFim = `31.12.${ano}`;

      // Query combinada
      const sql = `
        SELECT
          AVG(BDVALOR) AS MEDIA_MENSAL,
          SUM(BDVALOR) AS FATURAMENTO_ANUAL
        FROM SP_BI_FAT(${codigoSci}, 2, 1, '${dataInicio}', '${dataFim}', 1)
      `;

      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      const { stdout } = await execAsync(
        `python "${scriptPath}" --base64 ${Buffer.from(sql, 'utf-8').toString('base64')}`,
        {
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024,
        }
      );

      const resultado = JSON.parse(stdout);

      if (resultado.success && resultado.rows && resultado.rows.length > 0) {
        const row = resultado.rows[0];
        const valorTotal = parseFloat(String(row.FATURAMENTO_ANUAL || row.faturamento_anual || 0));
        const mediaMensal = parseFloat(String(row.MEDIA_MENSAL || row.media_mensal || 0));

        // Salvar no cache (meses vazios já que a query não retorna detalhes)
        await this.cacheModel.salvarFaturamento(clienteId, codigoSci, ano, []);
      }
    } catch (error: any) {
      throw new Error(`Erro ao atualizar faturamento: ${error.message}`);
    }
  }

  /**
   * Forçar atualização manual (para testes ou execução sob demanda)
   */
  async forcarAtualizacao(): Promise<{ sucesso: number; erros: number; total: number }> {
    return this.atualizarTodosClientes();
  }
}

