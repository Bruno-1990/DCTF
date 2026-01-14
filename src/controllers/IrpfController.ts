/**
 * Controller para IRPF - Gerencia cache de faturamento e consultas ao SCI
 */

import { Request, Response } from 'express';
import { IrpfFaturamentoCache } from '../models/IrpfFaturamentoCache';
import { Cliente } from '../models/Cliente';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class IrpfController {
  private cacheModel: IrpfFaturamentoCache;
  private clienteModel: Cliente;

  constructor() {
    this.cacheModel = new IrpfFaturamentoCache();
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

      // Sempre buscar os últimos 2 anos (independente do parâmetro)
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1]; // Sempre os últimos 2 anos completos

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

      // Sempre buscar os últimos 2 anos (independente do parâmetro)
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1]; // Sempre os últimos 2 anos completos

      // Buscar apenas do cache (sem consultar SCI)
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
          const mediaMensal = item.mediaMensal !== undefined && item.mediaMensal !== null
            ? item.mediaMensal
            : (item.meses.length > 0 
              ? valorTotal / item.meses.length 
              : 0);
          
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

      // Sempre buscar os últimos 2 anos (independente do parâmetro)
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = [anoAtual - 2, anoAtual - 1]; // Sempre os últimos 2 anos completos

      // Buscar do SCI e atualizar cache (usando queries com SUM e AVG)
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
        message: 'Cache atualizado com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao atualizar cache:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar cache',
      });
    }
  }
}

