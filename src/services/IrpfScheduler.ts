/**
 * Serviço de agendamento para atualizar cache de faturamento IRPF durante a noite
 */

import { Cliente } from '../models/Cliente';
import { IrpfFaturamentoCache } from '../models/IrpfFaturamentoCache';
import { IrpfFaturamentoDetalhado } from '../models/IrpfFaturamentoDetalhado';
import { IrpfFaturamentoConsolidado } from '../models/IrpfFaturamentoConsolidado';
import { IrpfFaturamentoMini } from '../models/IrpfFaturamentoMini';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class IrpfScheduler {
  private clienteModel: Cliente;
  private cacheModel: IrpfFaturamentoCache;
  private detalhadoModel: IrpfFaturamentoDetalhado;
  private consolidadoModel: IrpfFaturamentoConsolidado;
  private miniModel: IrpfFaturamentoMini;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.clienteModel = new Cliente();
    this.cacheModel = new IrpfFaturamentoCache();
    this.detalhadoModel = new IrpfFaturamentoDetalhado();
    this.consolidadoModel = new IrpfFaturamentoConsolidado();
    this.miniModel = new IrpfFaturamentoMini();
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
      const clientesResult = await this.clienteModel.findAll();

      if (!clientesResult.success || !clientesResult.data) {
        throw new Error('Erro ao buscar clientes');
      }

      // clientesResult.data é um array de ICliente[]
      const clientes = Array.isArray(clientesResult.data)
        ? clientesResult.data.filter(
            (c) => c.codigo_sci && !isNaN(Number(c.codigo_sci))
          )
        : [];

      stats.total = clientes.length;
      console.log(`[IRPF Scheduler] Encontrados ${stats.total} clientes com código SCI.`);

      // Sempre buscar os últimos 2 anos completos (anoAtual - 2 e anoAtual - 1)
      // Exemplo: em 2026, buscar 2024 e 2025
      // Exemplo: em 2027, buscar 2025 e 2026
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1];
      
      console.log(`[IRPF Scheduler] Ano atual: ${anoAtual}`);
      console.log(`[IRPF Scheduler] Buscando faturamento para os últimos 2 anos completos: ${anosParaBuscar.join(', ')}`);

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
   * Busca dados DETALHADOS e gera os 3 caches automaticamente
   */
  private async atualizarFaturamentoCliente(
    clienteId: string,
    codigoSci: number,
    ano: number
  ): Promise<void> {
    try {
      const dataInicio = `01.01.${ano}`;
      const dataFim = `31.12.${ano}`;

      // Query DETALHADA - retorna todos os campos por mês
      // Usar param2 = 2 para obter dados detalhados
      const sql = `
        SELECT
          t.BDREF,
          SUM(CASE WHEN t.BDORDEM = 1 THEN t.BDVALOR ELSE 0 END) AS VENDAS_BRUTAS,
          SUM(CASE WHEN t.BDORDEM = 2 THEN t.BDVALOR ELSE 0 END) AS DEVOLUCOES_DEDUCOES,
          SUM(CASE WHEN t.BDORDEM = 3 THEN t.BDVALOR ELSE 0 END) AS VENDAS_LIQUIDUIDAS,
          SUM(CASE WHEN t.BDORDEM = 4 THEN t.BDVALOR ELSE 0 END) AS SERVICOS,
          SUM(CASE WHEN t.BDORDEM = 5 THEN t.BDVALOR ELSE 0 END) AS OUTRAS_RECEITAS,
          SUM(CASE WHEN t.BDORDEM = 6 THEN t.BDVALOR ELSE 0 END) AS OPERACOES_IMOBILIARIAS,
          SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO_TOTAL
        FROM SP_BI_FAT(${codigoSci}, 2, 2, '${dataInicio}', '${dataFim}', 1) t
        GROUP BY t.BDREF
        ORDER BY t.BDREF
      `;

      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      console.log(`[IRPF Scheduler] Buscando dados detalhados para cliente ${clienteId} (SCI ${codigoSci}), ano ${ano}`);
      console.log(`[IRPF Scheduler] Query SQL: ${sql}`);

      const { stdout, stderr } = await execAsync(
        `python "${scriptPath}" --base64 ${Buffer.from(sql, 'utf-8').toString('base64')}`,
        {
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024,
        }
      );

      if (stderr && !stderr.includes('INFO')) {
        console.error(`[IRPF Scheduler] Python stderr para ano ${ano}:`, stderr);
      }

      const resultado = JSON.parse(stdout);

      if (!resultado.success) {
        console.error(`[IRPF Scheduler] Erro na query para ano ${ano}:`, resultado.error);
        return;
      }

      if (!resultado.rows || resultado.rows.length === 0) {
        console.warn(`[IRPF Scheduler] Nenhum dado encontrado para cliente ${clienteId}, ano ${ano}`);
        console.warn(`[IRPF Scheduler] Query executada: ${sql}`);
        return;
      }

      console.log(`[IRPF Scheduler] Encontradas ${resultado.rows.length} linhas de dados brutos para ano ${ano}`);

      // Processar dados mensais
      const dadosMensais: Array<{
        mes: number;
        bdref: number;
        vendas_brutas: number;
        devolucoes_deducoes: number;
        vendas_liquidadas: number;
        servicos: number;
        outras_receitas: number;
        operacoes_imobiliarias: number;
        faturamento_total: number;
      }> = [];

      for (const row of resultado.rows) {
        // BDREF vem como número inteiro no formato YYYYMM (ex: 202501)
        let bdref: number;
        let vendasBrutas = 0;
        let devolucoesDeducoes = 0;
        let vendasLiquidadas = 0;
        let servicos = 0;
        let outrasReceitas = 0;
        let operacoesImobiliarias = 0;
        let faturamentoTotal = 0;

        if (Array.isArray(row)) {
          // Estrutura: [BDREF, VENDAS_BRUTAS, DEVOLUCOES_DEDUCOES, VENDAS_LIQUIDUIDAS, SERVICOS, OUTRAS_RECEITAS, OPERACOES_IMOBILIARIAS, FATURAMENTO_TOTAL]
          bdref = Number(row[0]) || 0;
          vendasBrutas = Number(row[1]) || 0;
          devolucoesDeducoes = Number(row[2]) || 0;
          vendasLiquidadas = Number(row[3]) || 0;
          servicos = Number(row[4]) || 0;
          outrasReceitas = Number(row[5]) || 0;
          operacoesImobiliarias = Number(row[6]) || 0;
          faturamentoTotal = Number(row[7]) || 0;
        } else {
          // Estrutura objeto
          bdref = Number(row.BDREF || row.bdref || 0);
          vendasBrutas = Number(row.VENDAS_BRUTAS || row.vendas_brutas || 0);
          devolucoesDeducoes = Number(row.DEVOLUCOES_DEDUCOES || row.devolucoes_deducoes || 0);
          vendasLiquidadas = Number(row.VENDAS_LIQUIDUIDAS || row.vendas_liquidadas || 0);
          servicos = Number(row.SERVICOS || row.servicos || 0);
          outrasReceitas = Number(row.OUTRAS_RECEITAS || row.outras_receitas || 0);
          operacoesImobiliarias = Number(row.OPERACOES_IMOBILIARIAS || row.operacoes_imobiliarias || 0);
          faturamentoTotal = Number(row.FATURAMENTO_TOTAL || row.faturamento_total || 0);
        }

              if (bdref > 0) {
          // Extrair mês e ano do BDREF (formato YYYYMM)
          const mes = bdref % 100;
          const anoBdref = Math.floor(bdref / 100);

          // Validar mês (1-12) e ano
          if (mes >= 1 && mes <= 12 && anoBdref === ano) {
            dadosMensais.push({
              mes,
              bdref,
              vendas_brutas: vendasBrutas,
              devolucoes_deducoes: devolucoesDeducoes,
              vendas_liquidadas: vendasLiquidadas,
              servicos,
              outras_receitas: outrasReceitas,
              operacoes_imobiliarias: operacoesImobiliarias,
              faturamento_total: faturamentoTotal,
            });
          } else {
            console.warn(`[IRPF Scheduler] BDREF inválido ou ano não corresponde: bdref=${bdref}, mes=${mes}, anoBdref=${anoBdref}, anoEsperado=${ano}`);
          }
        } else {
          console.warn(`[IRPF Scheduler] BDREF zerado ou inválido para ano ${ano}`);
        }
      }

      if (dadosMensais.length === 0) {
        console.warn(`[IRPF Scheduler] Nenhum dado mensal válido encontrado para cliente ${clienteId}, ano ${ano}`);
        console.warn(`[IRPF Scheduler] Query: ${sql}`);
        console.warn(`[IRPF Scheduler] Resultado bruto: ${JSON.stringify(resultado.rows?.slice(0, 3), null, 2)}`);
        return;
      }

      console.log(`[IRPF Scheduler] Processando ${dadosMensais.length} meses para cliente ${clienteId}, ano ${ano}`);
      console.log(`[IRPF Scheduler] Primeiros meses:`, dadosMensais.slice(0, 3).map(d => `Mês ${d.mes}/${ano} = R$ ${d.faturamento_total}`));

      // 1. Salvar dados detalhados
      console.log(`[IRPF Scheduler] Salvando dados detalhados na tabela para ano ${ano}...`);
      const detalhadoResult = await this.detalhadoModel.salvarDetalhado(
        clienteId,
        codigoSci,
        ano,
        dadosMensais
      );

      if (!detalhadoResult.success) {
        console.error(`[IRPF Scheduler] Erro ao salvar dados detalhados para ano ${ano}:`, detalhadoResult.error);
        throw new Error(`Erro ao salvar dados detalhados: ${detalhadoResult.error}`);
      }
      
      console.log(`[IRPF Scheduler] Dados detalhados salvos com sucesso para ano ${ano}`);

      // 2. Gerar cache consolidado
      console.log(`[IRPF Scheduler] Gerando cache consolidado para ano ${ano}...`);
      const consolidadoResult = await this.consolidadoModel.gerarCache(
        clienteId,
        codigoSci,
        ano,
        dadosMensais.map(d => ({
          mes: d.mes,
          bdref: d.bdref,
          faturamento_total: d.faturamento_total
        }))
      );

      if (!consolidadoResult.success) {
        console.error(`[IRPF Scheduler] Erro ao gerar cache consolidado para ano ${ano}:`, consolidadoResult.error);
      } else {
        console.log(`[IRPF Scheduler] Cache consolidado gerado com sucesso para ano ${ano}`);
      }

      // 3. Gerar cache mini
      console.log(`[IRPF Scheduler] Gerando cache mini para ano ${ano}...`);
      const miniResult = await this.miniModel.gerarCache(
        clienteId,
        codigoSci,
        ano,
        dadosMensais.map(d => ({
          faturamento_total: d.faturamento_total
        }))
      );

      if (!miniResult.success) {
        console.error(`[IRPF Scheduler] Erro ao gerar cache mini para ano ${ano}:`, miniResult.error);
      } else {
        console.log(`[IRPF Scheduler] Cache mini gerado com sucesso para ano ${ano}`);
      }

      // 4. Manter compatibilidade com cache antigo (para transição)
      const valorTotal = dadosMensais.reduce((sum, item) => sum + item.faturamento_total, 0);
      const mediaMensal = dadosMensais.length > 0 ? valorTotal / dadosMensais.length : 0;

      await this.cacheModel.salvarFaturamento(
        clienteId,
        codigoSci,
        ano,
        dadosMensais.map((item) => ({ mes: item.mes, valor: item.faturamento_total })),
        valorTotal,
        mediaMensal
      );

      console.log(`[IRPF Scheduler] ✅ Cache atualizado para cliente ${clienteId}, ano ${ano} (${dadosMensais.length} meses)`);
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


