/**
 * Controller para IRPF - Gerencia cache de faturamento e consultas ao SCI
 */

import { Request, Response } from 'express';
import { IrpfFaturamentoCache } from '../models/IrpfFaturamentoCache';
import { IrpfFaturamentoDetalhado } from '../models/IrpfFaturamentoDetalhado';
import { IrpfFaturamentoConsolidado } from '../models/IrpfFaturamentoConsolidado';
import { IrpfFaturamentoMini } from '../models/IrpfFaturamentoMini';
import { Cliente } from '../models/Cliente';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class IrpfController {
  private cacheModel: IrpfFaturamentoCache;
  private detalhadoModel: IrpfFaturamentoDetalhado;
  private consolidadoModel: IrpfFaturamentoConsolidado;
  private miniModel: IrpfFaturamentoMini;
  private clienteModel: Cliente;

  constructor() {
    this.cacheModel = new IrpfFaturamentoCache();
    this.detalhadoModel = new IrpfFaturamentoDetalhado();
    this.consolidadoModel = new IrpfFaturamentoConsolidado();
    this.miniModel = new IrpfFaturamentoMini();
    this.clienteModel = new Cliente();
  }

  /**
   * Buscar faturamento para IRPF (com cache)
   * GET /api/irpf/faturamento/:clienteId
   */
  async buscarFaturamento(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.params;
      const { anos } = req.query;

      if (!clienteId) {
        res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        return;
      }

      // Buscar cliente para obter código SCI
      const clienteResult = await this.clienteModel.findById(clienteId);
      if (!clienteResult.success || !clienteResult.data) {
        res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        return;
      }

      const cliente = clienteResult.data;
      const codigoSci = cliente.codigo_sci ? Number(cliente.codigo_sci) : null;

      if (!codigoSci || isNaN(codigoSci)) {
        res.status(400).json({
          success: false,
          error: 'Cliente não possui código SCI configurado',
        });
        return;
      }

      // Sempre buscar os últimos 2 anos completos (anoAtual - 2 e anoAtual - 1)
      // Exemplo: em 2026, buscar 2024 e 2025
      // Exemplo: em 2027, buscar 2025 e 2026
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1];

      // Verificar cache primeiro
      const cacheResult = await this.cacheModel.buscarFaturamento(
        clienteId,
        anosParaBuscar
      );

      // Criar mapa de anos do cache para facilitar busca
      const cacheMap = new Map<number, any>();
      if (cacheResult.success && cacheResult.data) {
        cacheResult.data.forEach((item) => {
          cacheMap.set(item.ano, item);
        });
      }

      // Verificar se cache está atualizado (últimas 24h) - verificar pelo primeiro ano
      const cacheAtualizado = await this.cacheModel.cacheAtualizado(
        clienteId,
        anosParaBuscar[0],
        24
      );

      if (cacheAtualizado.success && cacheAtualizado.data && cacheMap.size > 0) {
        // Retornar do cache, garantindo que todos os anos estejam presentes
        const resultado = anosParaBuscar.map((ano) => {
          const item = cacheMap.get(ano);
          if (item) {
            // Se há valores totais salvos, usar eles; senão calcular dos meses
            const valorTotal = item.valorTotal !== undefined && item.valorTotal !== null
              ? item.valorTotal
              : item.meses.reduce((sum, m) => sum + m.valor, 0);
            const mediaMensal = item.mediaMensal !== undefined && item.mediaMensal !== null
              ? item.mediaMensal
              : (item.meses.length > 0 ? valorTotal / item.meses.length : 0);
            
            return {
              ano,
              valorTotal,
              mediaMensal,
              meses: item.meses || [],
            };
          } else {
            // Ano não encontrado no cache - retornar zerado
            return {
              ano,
              valorTotal: 0,
              mediaMensal: 0,
              meses: [],
            };
          }
        });

        res.json({
          success: true,
          data: resultado,
          fromCache: true,
        });
        return;
      }

      // Cache não encontrado ou desatualizado - buscar do SCI
      // Garantir que sempre retornamos os 2 anos, mesmo que zerados
      const faturamentoAnos = await Promise.all(
        anosParaBuscar.map(async (ano) => {
          try {
            const dataInicio = `01.01.${ano}`;
            const dataFim = `31.12.${ano}`;

            // Query combinada - a query já filtra e retorna SUM e AVG
            // IMPORTANTE: Usar os mesmos nomes de colunas que aparecem na interface do usuário
            const sql = `
              SELECT
                AVG(BDVALOR) AS MEDIA_FATURAMENTO,
                SUM(BDVALOR) AS FATURAMENTO_ANUAL
              FROM SP_BI_FAT(${codigoSci}, 2, 1, '${dataInicio}', '${dataFim}', 1)
            `;
            
            console.log(`[IRPF] Executando query para cliente ${clienteId} (SCI ${codigoSci}), ano ${ano}`);
            console.log(`[IRPF] SQL: ${sql}`);

            const scriptPath = path.join(
              __dirname,
              '../../python/catalog/executar_sql.py'
            );

            // Executar a query
            const { stdout, stderr } = await execAsync(
              `python "${scriptPath}" --base64 ${Buffer.from(sql, 'utf-8').toString('base64')}`,
              {
                encoding: 'utf-8',
                maxBuffer: 50 * 1024 * 1024,
              }
            );

            if (stderr && !stderr.includes('INFO')) {
              console.error('Python stderr:', stderr);
            }

            const resultado = JSON.parse(stdout);

            if (!resultado.success || !resultado.rows || resultado.rows.length === 0) {
              return {
                ano,
                valorTotal: 0,
                mediaMensal: 0,
                meses: [],
                error: resultado.error || 'Erro ao buscar faturamento',
              };
            }

            // Pegar valores diretamente do resultado (sem filtros adicionais)
            const row = resultado.rows[0];
            console.log(`[IRPF] Row completo:`, JSON.stringify(row, null, 2));
            console.log(`[IRPF] Chaves disponíveis no row:`, Object.keys(row));
            console.log(`[IRPF] Tipo do row:`, Array.isArray(row) ? 'Array' : typeof row);
            
            // O resultado pode vir como array [MEDIA_FATURAMENTO, FATURAMENTO_ANUAL] ou como objeto
            let valorTotal = 0;
            let mediaMensal = 0;
            
            if (Array.isArray(row)) {
              // Se for array, os valores estão nos índices
              // [0] = MEDIA_FATURAMENTO, [1] = FATURAMENTO_ANUAL
              mediaMensal = parseFloat(String(row[0] || 0));
              valorTotal = parseFloat(String(row[1] || 0));
              console.log(`[IRPF] Valores do array - [0] (Média): ${mediaMensal}, [1] (Total): ${valorTotal}`);
            } else {
              // Se for objeto, buscar pelos nomes das colunas
              valorTotal = parseFloat(String(
                row.FATURAMENTO_ANUAL || 
                row.faturamento_anual || 
                0
              ));
              
              mediaMensal = parseFloat(String(
                row.MEDIA_FATURAMENTO || 
                row.media_faturamento ||
                row.MEDIA_MENSAL || 
                row.media_mensal || 
                0
              ));
              console.log(`[IRPF] Valores do objeto - Total: ${valorTotal}, Média: ${mediaMensal}`);
            }
            
            console.log(`[IRPF] Valores finais extraídos - Total: ${valorTotal}, Média: ${mediaMensal}`);

            // Meses vazios - a query não retorna detalhes mensais, apenas totais
            const meses: Array<{ mes: number; valor: number; dados: any }> = [];

            // Salvar no cache com valores totais (meses vazios já que a query não retorna detalhes mensais)
            await this.cacheModel.salvarFaturamento(
              clienteId, 
              codigoSci, 
              ano, 
              meses, 
              isNaN(valorTotal) ? 0 : valorTotal,
              isNaN(mediaMensal) ? 0 : mediaMensal
            );

            return {
              ano,
              valorTotal: isNaN(valorTotal) ? 0 : valorTotal,
              mediaMensal: isNaN(mediaMensal) ? 0 : mediaMensal,
              meses: [], // Query não retorna detalhes mensais, apenas totais
            };
          } catch (error: any) {
            console.error(`Erro ao buscar faturamento de ${ano}:`, error);
            return {
              ano,
              valorTotal: 0,
              mediaMensal: 0,
              meses: [],
              error: error.message || 'Erro ao buscar faturamento',
            };
          }
        })
      );

      console.log(`[IRPF] Retornando ${faturamentoAnos.length} anos para cliente ${clienteId}:`, JSON.stringify(faturamentoAnos, null, 2));
      
      res.json({
        success: true,
        data: faturamentoAnos,
        fromCache: false,
      });
    } catch (error: any) {
      console.error('Erro ao buscar faturamento IRPF:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar faturamento',
      });
    }
  }

  /**
   * Buscar faturamento apenas do cache (sem consultar SCI)
   * GET /api/irpf/faturamento/:clienteId/cache
   */
  async buscarApenasCache(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.params;
      const { anos } = req.query;

      if (!clienteId) {
        res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        return;
      }

      // Sempre buscar os últimos 2 anos completos (anoAtual - 2 e anoAtual - 1)
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1];

      console.log(`[IRPF Controller - buscarApenasCache] Cliente: ${clienteId}, Anos: ${anosParaBuscar.join(', ')}`);

      // 1. Primeiro tentar buscar do cache DETALHADO e calcular a soma (mais preciso)
      const detalhadoResult = await this.detalhadoModel.buscarPorAnos(clienteId, anosParaBuscar);
      
      if (detalhadoResult.success && detalhadoResult.data && detalhadoResult.data.length > 0) {
        console.log(`[IRPF Controller - buscarApenasCache] Dados encontrados no cache DETALHADO: ${detalhadoResult.data.length} registros`);
        
        // Agrupar por ano e calcular totais
        const dadosPorAno = new Map<number, any[]>();
        detalhadoResult.data.forEach((item) => {
          const ano = item.ano;
          if (!dadosPorAno.has(ano)) {
            dadosPorAno.set(ano, []);
          }
          dadosPorAno.get(ano)!.push(item);
        });

        // Encontrar a última atualização (mais recente updated_at de todos os dados)
        let ultimaAtualizacao: string | null = null;
        detalhadoResult.data.forEach((item) => {
          if (item.updated_at) {
            const updatedAt = typeof item.updated_at === 'string' ? item.updated_at : item.updated_at.toISOString();
            if (!ultimaAtualizacao || updatedAt > ultimaAtualizacao) {
              ultimaAtualizacao = updatedAt;
            }
          }
        });

        // Calcular totais e médias para cada ano
        const resultado = anosParaBuscar.map((ano) => {
          const dadosAno = dadosPorAno.get(ano) || [];
          
          if (dadosAno.length > 0) {
            // Somar faturamento_total de todos os meses do ano
            const valorTotal = dadosAno.reduce((sum, item) => sum + (Number(item.faturamento_total) || 0), 0);
            
            // Calcular média: Total do Período / quantidade de meses registrados
            const qtdMesesRegistrados = dadosAno.length;
            const mediaMensal = qtdMesesRegistrados > 0 ? valorTotal / qtdMesesRegistrados : 0;
            
            console.log(`[IRPF Controller - buscarApenasCache] Ano ${ano}: ${qtdMesesRegistrados} meses registrados, Total: ${valorTotal}, Média: ${mediaMensal} (${valorTotal} / ${qtdMesesRegistrados})`);
            
            return {
              ano,
              valorTotal,
              mediaMensal,
              meses: dadosAno.map(d => ({
                mes: d.mes,
                valor: d.faturamento_total,
                dados: d,
              })),
            };
          } else {
            return {
              ano,
              valorTotal: 0,
              mediaMensal: 0,
              meses: [],
            };
          }
        });

        res.json({
          success: true,
          data: resultado,
          fromCache: 'detalhado',
          ultimaAtualizacao: ultimaAtualizacao,
        });
        return;
      }

      // 2. Se não encontrar no detalhado, tentar buscar do cache MINI
      console.log(`[IRPF Controller - buscarApenasCache] Cache DETALHADO vazio, buscando do cache MINI...`);
      const miniResult = await this.miniModel.buscarPorAnos(clienteId, anosParaBuscar);
      
      if (miniResult.success && miniResult.data && miniResult.data.length > 0) {
        console.log(`[IRPF Controller - buscarApenasCache] Dados encontrados no cache MINI: ${miniResult.data.length} anos`);
        
        // Encontrar a última atualização (mais recente updated_at)
        let ultimaAtualizacao: string | null = null;
        miniResult.data.forEach((item) => {
          if (item.updated_at) {
            const updatedAt = typeof item.updated_at === 'string' ? item.updated_at : item.updated_at.toISOString();
            if (!ultimaAtualizacao || updatedAt > ultimaAtualizacao) {
              ultimaAtualizacao = updatedAt;
            }
          }
        });
        
        // Criar mapa dos dados do mini cache
        const miniMap = new Map<number, any>();
        miniResult.data.forEach((item) => {
          miniMap.set(item.ano, item);
        });

        // Montar resultado a partir do cache mini
        const resultado = anosParaBuscar.map((ano) => {
          const item = miniMap.get(ano);
          if (item) {
            return {
              ano: item.ano,
              valorTotal: item.valor_total || 0,
              mediaMensal: item.media_mensal || 0,
              meses: [], // Cache mini não tem detalhes mensais
            };
          } else {
            return {
              ano,
              valorTotal: 0,
              mediaMensal: 0,
              meses: [],
            };
          }
        });

        res.json({
          success: true,
          data: resultado,
          fromCache: 'mini',
          ultimaAtualizacao: ultimaAtualizacao,
        });
        return;
      }

      // 2. Fallback: buscar do cache antigo (compatibilidade)
      console.log(`[IRPF Controller - buscarApenasCache] Cache MINI vazio, buscando do cache antigo...`);
      const cacheResult = await this.cacheModel.buscarFaturamento(
        clienteId,
        anosParaBuscar
      );

      // Criar mapa de anos do cache antigo para facilitar busca
      const cacheMap = new Map<number, any>();
      if (cacheResult.success && cacheResult.data) {
        cacheResult.data.forEach((item) => {
          cacheMap.set(item.ano, item);
        });
      }

      // Sempre retornar os 2 anos, preenchendo com zeros se não existir no cache
      const resultado = anosParaBuscar.map((ano) => {
        const item = cacheMap.get(ano);
        if (item) {
          // Se há valores totais salvos, usar eles; senão calcular dos meses
          const valorTotal = item.valorTotal !== undefined && item.valorTotal !== null
            ? item.valorTotal
            : (item.meses.length > 0 
              ? item.meses.reduce((sum: number, m: any) => sum + (m.valor || 0), 0)
              : 0);
          
          // Calcular média: Total do Período / quantidade de meses registrados
          const qtdMesesRegistrados = item.meses.length > 0 ? item.meses.length : 0;
          const mediaMensal = qtdMesesRegistrados > 0 
            ? valorTotal / qtdMesesRegistrados 
            : (item.mediaMensal !== undefined && item.mediaMensal !== null ? item.mediaMensal : 0);
          
          return {
            ano,
            valorTotal,
            mediaMensal,
            meses: item.meses || [],
          };
        } else {
          // Ano não encontrado no cache - retornar zerado
          return {
            ano,
            valorTotal: 0,
            mediaMensal: 0,
            meses: [],
          };
        }
      });

      res.json({
        success: true,
        data: resultado,
        fromCache: 'legacy',
      });
    } catch (error: any) {
      console.error('Erro ao buscar cache IRPF:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar cache',
      });
    }
  }

  /**
   * Forçar atualização do cache
   * POST /api/irpf/faturamento/:clienteId/atualizar
   * Usa query DETALHADA completa para popular todas as tabelas de cache
   */
  async atualizarCache(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.params;
      const { anos } = req.body;

      if (!clienteId) {
        res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        return;
      }

      // Buscar cliente
      const clienteResult = await this.clienteModel.findById(clienteId);
      if (!clienteResult.success || !clienteResult.data) {
        res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        return;
      }

      const cliente = clienteResult.data;
      const codigoSci = cliente.codigo_sci ? Number(cliente.codigo_sci) : null;

      if (!codigoSci || isNaN(codigoSci)) {
        res.status(400).json({
          success: false,
          error: 'Cliente não possui código SCI configurado',
        });
        return;
      }

      // Sempre buscar os últimos 2 anos completos (anoAtual - 2 e anoAtual - 1)
      // Exemplo: em 2026, buscar 2024 e 2025
      // Exemplo: em 2027, buscar 2025 e 2026
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1];
      
      console.log(`[IRPF Controller] Ano atual: ${anoAtual}`);
      console.log(`[IRPF Controller] Buscando faturamento para os últimos 2 anos completos: ${anosParaBuscar.join(', ')}`);

      // Buscar do SCI e atualizar cache usando query DETALHADA completa
      const faturamentoAnos = await Promise.all(
        anosParaBuscar.map(async (ano) => {
          try {
            const dataInicio = `01.01.${ano}`;
            const dataFim = `31.12.${ano}`;

            // Query DETALHADA - retorna todos os campos por mês
            // Usar param2 = 2 para obter dados detalhados (igual ao scheduler)
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
            
            console.log(`[IRPF] Executando query DETALHADA para cliente ${clienteId} (SCI ${codigoSci}), ano ${ano}`);
            console.log(`[IRPF] SQL: ${sql}`);

            const scriptPath = path.join(
              __dirname,
              '../../python/catalog/executar_sql.py'
            );

            // Executar a query
            const { stdout, stderr } = await execAsync(
              `python "${scriptPath}" --base64 ${Buffer.from(sql, 'utf-8').toString('base64')}`,
              {
                encoding: 'utf-8',
                maxBuffer: 50 * 1024 * 1024,
              }
            );

            if (stderr && !stderr.includes('INFO')) {
              console.error('Python stderr:', stderr);
            }

            const resultado = JSON.parse(stdout);

            if (!resultado.success || !resultado.rows || resultado.rows.length === 0) {
              return {
                ano,
                valorTotal: 0,
                mediaMensal: 0,
                meses: [],
                error: resultado.error || 'Erro ao buscar faturamento',
              };
            }

            // Processar dados mensais detalhados
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

            let valorTotal = 0;
            let mediaMensal = 0;

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

                // Validar mês (1-12)
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

                  // Acumular totais
                  valorTotal += faturamentoTotal;
                }
              }
            }

            // Calcular média mensal
            mediaMensal = dadosMensais.length > 0 ? valorTotal / dadosMensais.length : 0;

            console.log(`[IRPF] Processados ${dadosMensais.length} meses - Total: ${valorTotal}, Média: ${mediaMensal}`);

            // 1. Salvar dados detalhados na tabela irpf_faturamento_detalhado
            const detalhadoResult = await this.detalhadoModel.salvarDetalhado(
              clienteId,
              codigoSci,
              ano,
              dadosMensais
            );

            if (!detalhadoResult.success) {
              throw new Error(`Erro ao salvar dados detalhados: ${detalhadoResult.error}`);
            }

            // 2. Gerar cache consolidado (meses com faturamento)
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
              console.error(`[IRPF] Erro ao gerar cache consolidado para ano ${ano}:`, consolidadoResult.error);
              // Não lançar erro - os dados detalhados já foram salvos
            }

            // 3. Gerar cache mini (totais anuais)
            const miniResult = await this.miniModel.gerarCache(
              clienteId,
              codigoSci,
              ano,
              dadosMensais.map(d => ({
                faturamento_total: d.faturamento_total
              }))
            );

            if (!miniResult.success) {
              console.error(`[IRPF] Erro ao gerar cache mini para ano ${ano}:`, miniResult.error);
              // Não lançar erro - os dados detalhados já foram salvos
            }

            // 4. Também salvar no cache antigo (para compatibilidade com frontend)
            const meses = dadosMensais.map(d => ({
              mes: d.mes,
              valor: d.faturamento_total,
              dados: d,
            }));

            await this.cacheModel.salvarFaturamento(
              clienteId, 
              codigoSci, 
              ano, 
              meses, 
              valorTotal,
              mediaMensal
            );

            return {
              ano,
              valorTotal,
              mediaMensal,
              meses,
            };
          } catch (error: any) {
            console.error(`Erro ao atualizar faturamento de ${ano}:`, error);
            return {
              ano,
              valorTotal: 0,
              mediaMensal: 0,
              meses: [],
              error: error.message || 'Erro ao atualizar faturamento',
            };
          }
        })
      );

      res.json({
        success: true,
        data: faturamentoAnos,
        message: 'Cache atualizado com sucesso (dados detalhados)',
      });
    } catch (error: any) {
      console.error('Erro ao atualizar cache:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar cache',
      });
    }
  }

  /**
   * Consulta personalizada de faturamento
   * POST /api/irpf/consulta-personalizada
   * Body: {
   *   busca: string, // CNPJ ou Razão Social
   *   dataInicial: string, // formato YYYY-MM-DD
   *   dataFinal: string, // formato YYYY-MM-DD
   *   tipoFaturamento: 'detalhado' | 'consolidado',
   *   somarMatrizFilial: boolean
   * }
   */
  async consultaPersonalizada(req: Request, res: Response): Promise<void> {
    try {
      const { busca, dataInicial, dataFinal, tipoFaturamento, somarMatrizFilial } = req.body;

      // Validações
      if (!busca || !dataInicial || !dataFinal) {
        res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: busca, dataInicial, dataFinal'
        });
        return;
      }

      if (!tipoFaturamento || !['detalhado', 'consolidado'].includes(tipoFaturamento)) {
        res.status(400).json({
          success: false,
          error: 'tipoFaturamento deve ser "detalhado" ou "consolidado"'
        });
        return;
      }

      // Buscar cliente por CNPJ ou Razão Social
      const cnpjLimpo = busca.replace(/\D/g, '');
      let cliente: any = null;

      if (cnpjLimpo.length === 14) {
        // Buscar por CNPJ
        const clienteResult = await this.clienteModel.findByCNPJ(cnpjLimpo);
        if (clienteResult.success && clienteResult.data) {
          cliente = clienteResult.data;
        }
      } else {
        // Buscar por Razão Social
        const clientesResult = await this.clienteModel.findBy({ razao_social: busca });
        if (clientesResult.success && clientesResult.data && clientesResult.data.length > 0) {
          // Pegar o primeiro resultado (ou implementar busca mais sofisticada)
          cliente = clientesResult.data[0];
        }
      }

      if (!cliente) {
        res.status(404).json({
          success: false,
          error: 'Cliente não encontrado'
        });
        return;
      }

      const codigoSci = cliente.codigo_sci ? Number(cliente.codigo_sci) : null;
      if (!codigoSci || isNaN(codigoSci)) {
        res.status(400).json({
          success: false,
          error: 'Cliente não possui código SCI configurado'
        });
        return;
      }

      // Converter datas para formato do Firebird (DD.MM.YYYY)
      // As datas vêm no formato YYYY-MM-DD do frontend
      const dataIni = new Date(dataInicial + 'T00:00:00'); // Adicionar hora para evitar problemas de timezone
      const dataFim = new Date(dataFinal + 'T23:59:59');
      
      const diaInicio = String(dataIni.getDate()).padStart(2, '0');
      const mesInicio = String(dataIni.getMonth() + 1).padStart(2, '0');
      const anoInicio = dataIni.getFullYear();
      const dataInicioFormatada = `${diaInicio}.${mesInicio}.${anoInicio}`;
      
      const diaFim = String(dataFim.getDate()).padStart(2, '0');
      const mesFim = String(dataFim.getMonth() + 1).padStart(2, '0');
      const anoFim = dataFim.getFullYear();
      const dataFimFormatada = `${diaFim}.${mesFim}.${anoFim}`;

      // Determinar parâmetros da query baseado no tipo
      // tipoFaturamento: 'detalhado' = 2, 'consolidado' = 1
      // somarMatrizFilial: true = 1, false = 0
      const paramTipo = tipoFaturamento === 'detalhado' ? 2 : 1;
      const paramSomar = somarMatrizFilial ? 1 : 0;

      // Montar query SQL baseado no tipo de faturamento
      let sql: string;
      
      if (tipoFaturamento === 'consolidado') {
        // Query consolidada - retorna apenas FATURAMENTO (BDORDEM = 7)
        // Baseada no exemplo: SP_BI_FAT(29, 2, 2, '01.01.2023', '31.12.2023', 1)
        // Parâmetros: cod_emp, param1=2 (fixo), param2=2 (consolidado), data_inicio, data_fim, param3 (somar matriz/filial)
        // BDREF vem como número inteiro no formato YYYYMM (ex: 202301 = Janeiro/2023)
        sql = `SELECT
    x.ORDEM,
    x.MES_ANO,
    x.FATURAMENTO
FROM (
    /* Meses */
    SELECT
        1 AS ORDEM,
        t.BDREF AS ORDEM_DATA,
        CASE MOD(CAST(t.BDREF AS INTEGER), 100)
            WHEN 1 THEN 'Janeiro'
            WHEN 2 THEN 'Fevereiro'
            WHEN 3 THEN 'Março'
            WHEN 4 THEN 'Abril'
            WHEN 5 THEN 'Maio'
            WHEN 6 THEN 'Junho'
            WHEN 7 THEN 'Julho'
            WHEN 8 THEN 'Agosto'
            WHEN 9 THEN 'Setembro'
            WHEN 10 THEN 'Outubro'
            WHEN 11 THEN 'Novembro'
            WHEN 12 THEN 'Dezembro'
            ELSE 'Mês Inválido'
        END || '/' || CAST(CAST(t.BDREF AS INTEGER) / 100 AS VARCHAR(4)) AS MES_ANO,
        SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO
    FROM SP_BI_FAT(${codigoSci}, 2, 2, '${dataInicioFormatada}', '${dataFimFormatada}', ${paramSomar}) t
    GROUP BY t.BDREF
    UNION ALL
    /* Total do período */
    SELECT
        2 AS ORDEM,
        999999 AS ORDEM_DATA,
        'Total do Período' AS MES_ANO,
        SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO
    FROM SP_BI_FAT(${codigoSci}, 2, 2, '${dataInicioFormatada}', '${dataFimFormatada}', ${paramSomar}) t
) x
ORDER BY x.ORDEM, x.ORDEM_DATA`;
      } else {
        // Query detalhada - retorna todas as colunas
        // BDREF vem como número inteiro no formato YYYYMM (ex: 202301 = Janeiro/2023)
        sql = `SELECT
    x.ordem,
    x.BDREF,
    x.MES_ANO,
    x.VENDAS_BRUTAS,
    x.DEVOLUCOES_DEDUCOES,
    x.VENDAS_LIQUIDUIDAS,
    x.SERVICOS,
    x.OUTRAS_RECEITAS,
    x.OPERACOES_IMOBILIARIAS,
    x.FATURAMENTO_TOTAL
FROM (
    /* Linhas mensais */
    SELECT
        1 AS ordem,
        t.BDREF,
        CASE MOD(CAST(t.BDREF AS INTEGER), 100)
            WHEN 1 THEN 'Janeiro'
            WHEN 2 THEN 'Fevereiro'
            WHEN 3 THEN 'Março'
            WHEN 4 THEN 'Abril'
            WHEN 5 THEN 'Maio'
            WHEN 6 THEN 'Junho'
            WHEN 7 THEN 'Julho'
            WHEN 8 THEN 'Agosto'
            WHEN 9 THEN 'Setembro'
            WHEN 10 THEN 'Outubro'
            WHEN 11 THEN 'Novembro'
            WHEN 12 THEN 'Dezembro'
            ELSE 'Mês Inválido'
        END || '/' || CAST(CAST(t.BDREF AS INTEGER) / 100 AS VARCHAR(4)) AS MES_ANO,
        SUM(CASE WHEN t.BDORDEM = 1 THEN t.BDVALOR ELSE 0 END) AS VENDAS_BRUTAS,
        SUM(CASE WHEN t.BDORDEM = 2 THEN t.BDVALOR ELSE 0 END) AS DEVOLUCOES_DEDUCOES,
        SUM(CASE WHEN t.BDORDEM = 3 THEN t.BDVALOR ELSE 0 END) AS VENDAS_LIQUIDUIDAS,
        SUM(CASE WHEN t.BDORDEM = 4 THEN t.BDVALOR ELSE 0 END) AS SERVICOS,
        SUM(CASE WHEN t.BDORDEM = 5 THEN t.BDVALOR ELSE 0 END) AS OUTRAS_RECEITAS,
        SUM(CASE WHEN t.BDORDEM = 6 THEN t.BDVALOR ELSE 0 END) AS OPERACOES_IMOBILIARIAS,
        SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO_TOTAL
    FROM SP_BI_FAT(${codigoSci}, 2, ${paramTipo}, '${dataInicioFormatada}', '${dataFimFormatada}', ${paramSomar}) t
    GROUP BY t.BDREF
    UNION ALL
    /* Total do período */
    SELECT
        2 AS ordem,
        NULL AS BDREF,
        'Total do Período' AS MES_ANO,
        SUM(CASE WHEN t.BDORDEM = 1 THEN t.BDVALOR ELSE 0 END) AS VENDAS_BRUTAS,
        SUM(CASE WHEN t.BDORDEM = 2 THEN t.BDVALOR ELSE 0 END) AS DEVOLUCOES_DEDUCOES,
        SUM(CASE WHEN t.BDORDEM = 3 THEN t.BDVALOR ELSE 0 END) AS VENDAS_LIQUIDUIDAS,
        SUM(CASE WHEN t.BDORDEM = 4 THEN t.BDVALOR ELSE 0 END) AS SERVICOS,
        SUM(CASE WHEN t.BDORDEM = 5 THEN t.BDVALOR ELSE 0 END) AS OUTRAS_RECEITAS,
        SUM(CASE WHEN t.BDORDEM = 6 THEN t.BDVALOR ELSE 0 END) AS OPERACOES_IMOBILIARIAS,
        SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO_TOTAL
    FROM SP_BI_FAT(${codigoSci}, 2, ${paramTipo}, '${dataInicioFormatada}', '${dataFimFormatada}', ${paramSomar}) t
) x
ORDER BY x.ordem, x.BDREF`;
      }

      console.log(`[IRPF] Consulta Personalizada - Cliente: ${cliente.razao_social} (SCI ${codigoSci})`);
      console.log(`[IRPF] Parâmetros: tipo=${tipoFaturamento} (${paramTipo}), somar=${somarMatrizFilial} (${paramSomar})`);
      console.log(`[IRPF] Período: ${dataInicioFormatada} a ${dataFimFormatada}`);
      console.log(`[IRPF] SQL:\n${sql}`);

      // Executar query via Python
      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      const { stdout, stderr } = await execAsync(
        `python "${scriptPath}" --base64 ${Buffer.from(sql, 'utf-8').toString('base64')}`,
        {
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024, // 50MB
        }
      );

      if (stderr && !stderr.includes('INFO')) {
        console.error('[IRPF] Python stderr:', stderr);
      }

      // Log do stdout bruto antes do parse
      console.log('[IRPF] Python stdout (primeiros 500 chars):', stdout.substring(0, 500));
      console.log('[IRPF] Python stdout length:', stdout.length);

      // Parse do resultado JSON
      let resultado;
      try {
        // Garantir que o stdout está em UTF-8
        // Se o Python escreveu no buffer binário, precisamos garantir que está sendo decodificado corretamente
        const stdoutUtf8 = Buffer.from(stdout, 'utf-8').toString('utf-8');
        resultado = JSON.parse(stdoutUtf8);
        
        // Log detalhado das primeiras linhas para debug
        if (resultado.rows && resultado.rows.length > 0) {
          console.log('[IRPF] Primeiras 3 linhas de dados brutos:');
          resultado.rows.slice(0, 3).forEach((row: any, idx: number) => {
            console.log(`[IRPF]   Linha ${idx}:`, JSON.stringify(row));
            if (Array.isArray(row) && row.length >= 3) {
              console.log(`[IRPF]     - row[2] (MES_ANO):`, JSON.stringify(row[2]), `tipo: ${typeof row[2]}, length: ${String(row[2] || '').length}`);
            }
          });
        }
        
        console.log('[IRPF] Resultado parseado (primeiros 1000 chars):', JSON.stringify(resultado, null, 2).substring(0, 1000));
      } catch (parseError: any) {
        console.error('[IRPF] Erro ao fazer parse do JSON:', parseError.message);
        console.error('[IRPF] stdout completo:', stdout);
        throw new Error(`Erro ao processar resposta do Python: ${parseError.message}`);
      }

      if (resultado.error) {
        res.status(500).json({
          success: false,
          error: resultado.error,
          details: resultado.details
        });
        return;
      }

      // Processar resultados da nova query
      // O script Python retorna { success, columns, rows, rowCount }
      const dados = resultado.rows || resultado.data || [];
      console.log('[IRPF] Dados brutos recebidos:', JSON.stringify(dados, null, 2));
      console.log('[IRPF] Total de registros:', dados.length);
      console.log('[IRPF] Colunas recebidas:', resultado.columns || []);
      console.log('[IRPF] Primeira linha exemplo:', dados[0] ? JSON.stringify(dados[0]) : 'N/A');
      console.log('[IRPF] Tipo de faturamento:', tipoFaturamento);

      // Detectar estrutura dos dados (consolidado ou detalhado)
      const isConsolidado = tipoFaturamento === 'consolidado';
      const colunas = resultado.columns || [];
      const temColunaFaturamento = colunas.some((col: string) => 
        col.toUpperCase() === 'FATURAMENTO' || col.toUpperCase() === 'FATURAMENTO_TOTAL'
      );
      
      // Detectar estrutura baseado nas colunas retornadas
      const temApenasFaturamento = colunas.length === 3 && 
        colunas.some((col: string) => col.toUpperCase() === 'FATURAMENTO') &&
        colunas.some((col: string) => col.toUpperCase() === 'MES_ANO') &&
        colunas.some((col: string) => col.toUpperCase() === 'ORDEM');
      
      const isEstruturaConsolidada = isConsolidado || temApenasFaturamento;
      
      console.log('[IRPF] Detecção de estrutura:', {
        isConsolidado,
        temColunaFaturamento,
        temApenasFaturamento,
        isEstruturaConsolidada,
        colunas: colunas
      });

      // Separar linhas mensais e total
      let total = null;
      let detalhes: any[] = [];

      if (Array.isArray(dados)) {
        dados.forEach((row: any, index: number) => {
          if (Array.isArray(row)) {
            // Detectar estrutura baseado no número de colunas
            const ordem = row[0];
            let mesAno = '';
            
            if (isEstruturaConsolidada) {
              // Estrutura consolidada: [ORDEM, MES_ANO, FATURAMENTO] (3 elementos)
              // ou [ORDEM, ORDEM_DATA, MES_ANO, FATURAMENTO] (4 elementos)
              if (row.length === 3) {
                mesAno = row[1] || '';
              } else if (row.length === 4) {
                mesAno = row[2] || '';
              } else {
                mesAno = row[1] || row[2] || '';
              }
            } else {
              // Estrutura detalhada: [ordem, BDREF, MES_ANO, ...]
              // Garantir que mesAno seja extraído corretamente
              if (row[2] !== undefined && row[2] !== null && row[2] !== '') {
                mesAno = String(row[2]).trim();
              } else {
                // Fallback: reconstruir a partir do BDREF se MES_ANO estiver vazio
                const bdref = row[1];
                if (bdref) {
                  const bdrefNum = Number(bdref);
                  if (!isNaN(bdrefNum) && bdrefNum > 0) {
                    const mes = bdrefNum % 100;
                    const ano = Math.floor(bdrefNum / 100);
                    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                    mesAno = `${meses[mes] || 'Mês Inválido'}/${ano}`;
                    console.log(`[IRPF] Reconstruído mesAno do BDREF: bdref=${bdref}, mes=${mes}, ano=${ano}, mesAno=${mesAno}`);
                  }
                }
              }
              
              // Log para debug
              if (!mesAno || mesAno === '') {
                console.warn(`[IRPF] ⚠️ mesAno vazio na linha ${index}: row[2]=${row[2]}, row[1]=${row[1]}, row.length=${row.length}`);
              }
            }
            
            if (ordem === 2 || mesAno === 'Total do Período') {
              // É o total
              total = row;
            } else {
              // É uma linha mensal
              detalhes.push(row);
            }
          } else {
            // Se row é objeto
            const ordem = row.ordem || row.ORDEM;
            const mesAno = row.MES_ANO || row.mes_ano || '';
            
            if (ordem === 2 || mesAno === 'Total do Período') {
              // É o total
              total = row;
            } else {
              // É uma linha mensal
              detalhes.push(row);
            }
          }
        });
      }

      // Extrair valor do total
      let valorTotal = 0;
      if (total) {
        if (Array.isArray(total)) {
          if (isEstruturaConsolidada) {
            // Consolidado: FATURAMENTO está no último índice (2 para 3 elementos, 3 para 4 elementos)
            const totalRaw = total[total.length - 1];
            if (typeof totalRaw === 'string') {
              const totalStr = totalRaw.trim().replace(/[^\d.,-]/g, '').replace(',', '.');
              valorTotal = parseFloat(totalStr) || 0;
            } else {
              valorTotal = Number(totalRaw) || 0;
            }
            console.log(`[IRPF] Total consolidado: raw=${totalRaw}, tipo=${typeof totalRaw}, convertido=${valorTotal}, arrayLength=${total.length}`);
          } else {
            // Detalhado: FATURAMENTO_TOTAL está no índice 9
            valorTotal = Number(total[9]) || 0;
          }
        } else {
          // Se total é objeto
          const totalValue = total.FATURAMENTO || total.faturamento || 
            total.FATURAMENTO_TOTAL || total.faturamento_total || total.faturamentoTotal || 0;
          if (typeof totalValue === 'string') {
            const totalStr = totalValue.trim().replace(/[^\d.,-]/g, '').replace(',', '.');
            valorTotal = parseFloat(totalStr) || 0;
          } else {
            valorTotal = Number(totalValue) || 0;
          }
        }
      }

      console.log('[IRPF] Total encontrado:', valorTotal);
      console.log('[IRPF] Detalhes encontrados:', detalhes.length);

      // Processar detalhes mensais
      const detalhesProcessados = detalhes.map((row: any, index: number) => {
        if (Array.isArray(row)) {
          if (isEstruturaConsolidada) {
            // Estrutura consolidada: [ORDEM, MES_ANO, FATURAMENTO] ou [ORDEM, ORDEM_DATA, MES_ANO, FATURAMENTO]
            // Detectar qual estrutura baseado no número de elementos
            let mesAno = '';
            let faturamento = 0;
            
            if (row.length === 3) {
              // Estrutura: [ORDEM, MES_ANO, FATURAMENTO]
              mesAno = String(row[1] || '');
              // Converter string para número, tratando strings vazias e "0"
              const faturamentoRaw = row[2];
              if (typeof faturamentoRaw === 'string') {
                // Se for string, remover espaços e converter
                const faturamentoStr = faturamentoRaw.trim().replace(/[^\d.,-]/g, '').replace(',', '.');
                faturamento = parseFloat(faturamentoStr) || 0;
              } else {
                faturamento = Number(faturamentoRaw) || 0;
              }
            } else if (row.length === 4) {
              // Estrutura: [ORDEM, ORDEM_DATA, MES_ANO, FATURAMENTO]
              mesAno = String(row[2] || '');
              const faturamentoRaw = row[3];
              if (typeof faturamentoRaw === 'string') {
                const faturamentoStr = faturamentoRaw.trim().replace(/[^\d.,-]/g, '').replace(',', '.');
                faturamento = parseFloat(faturamentoStr) || 0;
              } else {
                faturamento = Number(faturamentoRaw) || 0;
              }
            } else {
              // Fallback: tentar pegar do último índice
              mesAno = String(row[1] || row[2] || '');
              const faturamentoRaw = row[row.length - 1];
              if (typeof faturamentoRaw === 'string') {
                const faturamentoStr = faturamentoRaw.trim().replace(/[^\d.,-]/g, '').replace(',', '.');
                faturamento = parseFloat(faturamentoStr) || 0;
              } else {
                faturamento = Number(faturamentoRaw) || 0;
              }
            }
            
            console.log(`[IRPF] Processando linha consolidada ${index}: ordem=${row[0]}, mesAno=${mesAno}, faturamentoRaw=${row[row.length - 1]}, faturamento=${faturamento}`);
            
            return {
              codigoEmpresa: null,
              referencia: null,
              ordem: row[0] || null,
              descricao: mesAno,
              valor: faturamento,
              vendasBrutas: 0,
              devolucoesDeducoes: 0,
              vendasLiquidadas: 0,
              servicos: 0,
              outrasReceitas: 0,
              operacoesImobiliarias: 0,
              faturamentoTotal: faturamento
            };
          } else {
            // Estrutura detalhada: [ordem, BDREF, MES_ANO, VENDAS_BRUTAS, DEVOLUCOES_DEDUCOES, VENDAS_LIQUIDUIDAS, SERVICOS, OUTRAS_RECEITAS, OPERACOES_IMOBILIARIAS, FATURAMENTO_TOTAL]
            // Garantir que mesAno seja extraído corretamente do índice 2
            let mesAno = '';
            
            // Tentar extrair MES_ANO do índice 2
            const mesAnoRaw = row[2];
            if (mesAnoRaw !== undefined && mesAnoRaw !== null && mesAnoRaw !== '') {
              const mesAnoStr = String(mesAnoRaw).trim();
              if (mesAnoStr && mesAnoStr !== '') {
                mesAno = mesAnoStr;
              }
            }
            
            // Se mesAno ainda estiver vazio, reconstruir a partir do BDREF
            if (!mesAno || mesAno === '') {
              const bdref = row[1];
              if (bdref !== undefined && bdref !== null) {
                const bdrefNum = Number(bdref);
                if (!isNaN(bdrefNum) && bdrefNum > 0) {
                  const mes = bdrefNum % 100;
                  const ano = Math.floor(bdrefNum / 100);
                  const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                  if (mes >= 1 && mes <= 12 && ano > 0) {
                    mesAno = `${meses[mes]}/${ano}`;
                    console.log(`[IRPF] ✅ Reconstruído mesAno do BDREF: bdref=${bdref}, mes=${mes}, ano=${ano}, mesAno=${mesAno}`);
                  }
                }
              }
            }
            
            // Log de debug para identificar problemas
            if (!mesAno || mesAno === '') {
              console.warn(`[IRPF] ⚠️ mesAno ainda vazio após processamento: row[2]=${JSON.stringify(row[2])}, row[1]=${row[1]}, row.length=${row.length}`);
            } else {
              console.log(`[IRPF] ✅ Processando linha detalhada ${index}: mesAno=${mesAno}, bdref=${row[1]}`);
            }
            
            return {
              codigoEmpresa: null,
              referencia: row[1] || null,
              ordem: row[0] || null,
              descricao: mesAno || '-', // Garantir que sempre tenha um valor
              valor: Number(row[9]) || 0,
              vendasBrutas: Number(row[3]) || 0,
              devolucoesDeducoes: Number(row[4]) || 0,
              vendasLiquidadas: Number(row[5]) || 0,
              servicos: Number(row[6]) || 0,
              outrasReceitas: Number(row[7]) || 0,
              operacoesImobiliarias: Number(row[8]) || 0,
              faturamentoTotal: Number(row[9]) || 0
            };
          }
        } else {
          // Se row é objeto
          const mesAno = row.MES_ANO || row.mes_ano || row.mesAno || '';
          const mesAnoStr = mesAno ? String(mesAno) : '';
          
          if (isConsolidado || row.FATURAMENTO !== undefined || row.faturamento !== undefined) {
            // Estrutura consolidada
            const faturamento = Number(row.FATURAMENTO || row.faturamento || 0);
            return {
              codigoEmpresa: null,
              referencia: null,
              ordem: row.ordem || row.ORDEM || null,
              descricao: mesAnoStr,
              valor: faturamento,
              vendasBrutas: 0,
              devolucoesDeducoes: 0,
              vendasLiquidadas: 0,
              servicos: 0,
              outrasReceitas: 0,
              operacoesImobiliarias: 0,
              faturamentoTotal: faturamento
            };
          } else {
            // Estrutura detalhada
            return {
              codigoEmpresa: null,
              referencia: row.BDREF || row.bdref || row.referencia || null,
              ordem: row.ordem || row.ORDEM || null,
              descricao: mesAnoStr,
              valor: Number(row.FATURAMENTO_TOTAL || row.faturamento_total || row.faturamentoTotal || 0),
              vendasBrutas: Number(row.VENDAS_BRUTAS || row.vendas_brutas || row.vendasBrutas || 0),
              devolucoesDeducoes: Number(row.DEVOLUCOES_DEDUCOES || row.devolucoes_deducoes || row.devolucoesDeducoes || 0),
              vendasLiquidadas: Number(row.VENDAS_LIQUIDUIDAS || row.vendas_liquidadas || row.vendasLiquidadas || 0),
              servicos: Number(row.SERVICOS || row.servicos || 0),
              outrasReceitas: Number(row.OUTRAS_RECEITAS || row.outras_receitas || row.outrasReceitas || 0),
              operacoesImobiliarias: Number(row.OPERACOES_IMOBILIARIAS || row.operacoes_imobiliarias || row.operacoesImobiliarias || 0),
              faturamentoTotal: Number(row.FATURAMENTO_TOTAL || row.faturamento_total || row.faturamentoTotal || 0)
            };
          }
        }
      });

      console.log('[IRPF] Detalhes processados:', detalhesProcessados.length);

      // Converter datas para formato de retorno (antes de salvar dados)
      const [diaIniRet, mesIniRet, anoIniRet] = dataInicioFormatada.split('.');
      const [diaFimRet, mesFimRet, anoFimRet] = dataFimFormatada.split('.');

      // Salvar dados detalhados e gerar caches (apenas se for consulta detalhada)
      if (tipoFaturamento === 'detalhado' && detalhesProcessados.length > 0) {
        try {
          // Extrair ano do período
          const anoInicio = parseInt(anoIniRet);
          const anoFim = parseInt(anoFimRet);
          const anos = anoInicio === anoFim ? [anoInicio] : [anoInicio, anoFim];

          // Preparar dados mensais para salvar
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

          for (const detalhe of detalhesProcessados) {
            // Extrair mês e ano do descricao (formato "Janeiro/2025")
            if (detalhe.descricao && detalhe.descricao !== 'Total do Período') {
              const partes = detalhe.descricao.split('/');
              if (partes.length === 2) {
                const meses = [
                  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                ];
                const mesNome = partes[0].trim();
                const ano = parseInt(partes[1].trim());
                const mes = meses.indexOf(mesNome);

                if (mes > 0 && mes <= 12 && !isNaN(ano)) {
                  const bdref = ano * 100 + mes;
                  dadosMensais.push({
                    mes,
                    bdref,
                    vendas_brutas: detalhe.vendasBrutas || 0,
                    devolucoes_deducoes: detalhe.devolucoesDeducoes || 0,
                    vendas_liquidadas: detalhe.vendasLiquidadas || 0,
                    servicos: detalhe.servicos || 0,
                    outras_receitas: detalhe.outrasReceitas || 0,
                    operacoes_imobiliarias: detalhe.operacoesImobiliarias || 0,
                    faturamento_total: detalhe.faturamentoTotal || 0,
                  });
                }
              }
            }
          }

          // Agrupar por ano e salvar
          const dadosPorAno = new Map<number, typeof dadosMensais>();
          for (const item of dadosMensais) {
            const ano = Math.floor(item.bdref / 100);
            if (!dadosPorAno.has(ano)) {
              dadosPorAno.set(ano, []);
            }
            dadosPorAno.get(ano)!.push(item);
          }

          // Salvar para cada ano
          for (const [ano, dadosAno] of dadosPorAno.entries()) {
            // 1. Salvar dados detalhados
            await this.detalhadoModel.salvarDetalhado(cliente.id, codigoSci, ano, dadosAno);

            // 2. Gerar cache consolidado
            await this.consolidadoModel.gerarCache(cliente.id, codigoSci, ano, dadosAno);

            // 3. Gerar cache mini
            await this.miniModel.gerarCache(cliente.id, codigoSci, ano, dadosAno);
          }

          console.log(`[IRPF] Dados detalhados e caches salvos para cliente ${cliente.id}`);
        } catch (error: any) {
          console.warn(`[IRPF] Erro ao salvar dados detalhados (não crítico): ${error.message}`);
        }
      }

      // Garantir que a resposta JSON preserve caracteres UTF-8
      // Retornar as datas no formato YYYY-MM-DD que foram realmente usadas na query
      // Converter de volta do formato DD.MM.YYYY para YYYY-MM-DD
      const dataInicialRetorno = `${anoIniRet}-${mesIniRet}-${diaIniRet}`;
      const dataFinalRetorno = `${anoFimRet}-${mesFimRet}-${diaFimRet}`;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        success: true,
        data: {
          cliente: {
            id: cliente.id,
            razao_social: cliente.razao_social,
            cnpj: cliente.cnpj_limpo,
            codigo_sci: codigoSci
          },
          periodo: {
            dataInicial: dataInicialRetorno, // Retornar a data no formato YYYY-MM-DD que foi realmente usada na query
            dataFinal: dataFinalRetorno // Retornar a data no formato YYYY-MM-DD que foi realmente usada na query
          },
          tipoFaturamento,
          somarMatrizFilial,
          total: valorTotal,
          detalhes: detalhesProcessados
        }
      });

    } catch (error: any) {
      console.error('[IRPF] Erro na consulta personalizada:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao executar consulta personalizada',
        message: error.message
      });
    }
  }

  /**
   * Buscar faturamento do cache conforme tipo de visualização
   * GET /api/irpf/faturamento/:clienteId/cache/:tipo
   * tipo: 'detalhado' | 'consolidado' | 'mini'
   */
  async buscarFaturamentoPorTipo(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, tipo } = req.params;
      const { anos } = req.query;

      if (!clienteId) {
        res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        return;
      }

      if (!tipo || !['detalhado', 'consolidado', 'mini'].includes(tipo)) {
        res.status(400).json({
          success: false,
          error: 'tipo deve ser "detalhado", "consolidado" ou "mini"'
        });
        return;
      }

      // Buscar cliente para obter código SCI
      const clienteResult = await this.clienteModel.findById(clienteId);
      if (!clienteResult.success || !clienteResult.data) {
        res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        return;
      }

      const cliente = clienteResult.data;
      const codigoSci = cliente.codigo_sci ? Number(cliente.codigo_sci) : null;

      if (!codigoSci || isNaN(codigoSci)) {
        res.status(400).json({
          success: false,
          error: 'Cliente não possui código SCI configurado',
        });
        return;
      }

      // Determinar anos para buscar
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = anos
        ? (Array.isArray(anos) ? anos.map(Number) : [Number(anos)])
        : [anoAtual - 1, anoAtual];

      let resultado: any;

      switch (tipo) {
        case 'detalhado': {
          const detalhadoResult = await this.detalhadoModel.buscarPorAnos(clienteId, anosParaBuscar);
          if (!detalhadoResult.success) {
            throw new Error(detalhadoResult.error || 'Erro ao buscar dados detalhados');
          }

          resultado = anosParaBuscar.map((ano) => {
            const dadosAno = detalhadoResult.data!.filter((d) => d.ano === ano);
            return {
              ano,
              meses: dadosAno.map((d) => ({
                mes: d.mes,
                mes_ano: `${['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][d.mes]}/${d.ano}`,
                vendas_brutas: d.vendas_brutas,
                devolucoes_deducoes: d.devolucoes_deducoes,
                vendas_liquidadas: d.vendas_liquidadas,
                servicos: d.servicos,
                outras_receitas: d.outras_receitas,
                operacoes_imobiliarias: d.operacoes_imobiliarias,
                faturamento_total: d.faturamento_total,
              })),
              valorTotal: dadosAno.reduce((sum, d) => sum + d.faturamento_total, 0),
              mediaMensal: dadosAno.length > 0
                ? dadosAno.reduce((sum, d) => sum + d.faturamento_total, 0) / dadosAno.length
                : 0,
            };
          });
          break;
        }

        case 'consolidado': {
          const consolidadoResult = await this.consolidadoModel.buscarPorAnos(clienteId, anosParaBuscar);
          if (!consolidadoResult.success) {
            throw new Error(consolidadoResult.error || 'Erro ao buscar cache consolidado');
          }

          resultado = anosParaBuscar.map((ano) => {
            const dadosAno = consolidadoResult.data!.filter((d) => d.ano === ano);
            return {
              ano,
              meses: dadosAno.map((d) => ({
                mes: d.mes,
                mes_ano: d.mes_ano,
                faturamento: d.faturamento,
              })),
              valorTotal: dadosAno.reduce((sum, d) => sum + d.faturamento, 0),
              mediaMensal: dadosAno.length > 0
                ? dadosAno.reduce((sum, d) => sum + d.faturamento, 0) / dadosAno.length
                : 0,
            };
          });
          break;
        }

        case 'mini': {
          const miniResult = await this.miniModel.buscarPorAnos(clienteId, anosParaBuscar);
          if (!miniResult.success) {
            throw new Error(miniResult.error || 'Erro ao buscar cache mini');
          }

          resultado = anosParaBuscar.map((ano) => {
            const dadosAno = miniResult.data!.find((d) => d.ano === ano);
            return {
              ano,
              valorTotal: dadosAno?.valor_total || 0,
              mediaMensal: dadosAno?.media_mensal || 0,
              meses: [],
            };
          });
          break;
        }
      }

      res.json({
        success: true,
        data: resultado,
        tipo,
        fromCache: true,
      });
    } catch (error: any) {
      console.error(`[IRPF] Erro ao buscar faturamento (tipo: ${req.params.tipo}):`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar faturamento do cache',
      });
    }
  }
}

