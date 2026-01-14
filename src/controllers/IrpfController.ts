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

      // Montar query SQL usando o padrão exato fornecido pelo usuário
      // Query separada para evitar erros e facilitar manutenção
      // Seguindo exatamente o formato das 4 queries fornecidas
      const sql = `WITH FAT AS (
    SELECT *
    FROM SP_BI_FAT(${codigoSci}, 2, ${paramTipo}, '${dataInicioFormatada}', '${dataFimFormatada}', ${paramSomar})
)
SELECT
    BDCODEMP,
    BDREF,
    BDORDEM,
    BDDESCRICAO,
    BDVALOR
FROM FAT

UNION ALL

SELECT
    NULL,
    NULL,
    NULL,
    'TOTAL',
    SUM(BDVALOR)
FROM FAT`;

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

      // Parse do resultado JSON
      const resultado = JSON.parse(stdout);

      if (resultado.error) {
        res.status(500).json({
          success: false,
          error: resultado.error,
          details: resultado.details
        });
        return;
      }

      // Processar resultados
      const dados = resultado.data || [];
      console.log('[IRPF] Dados brutos recebidos:', JSON.stringify(dados, null, 2));
      console.log('[IRPF] Total de registros:', dados.length);

      // Procurar pelo total - pode vir como objeto ou array
      let total = null;
      let detalhes: any[] = [];

      if (Array.isArray(dados)) {
        // Se for array, procurar pelo registro com BDDESCRICAO = 'TOTAL'
        total = dados.find((row: any) => {
          if (Array.isArray(row)) {
            // Se row é array, verificar índice 3 (BDDESCRICAO)
            return row[3] === 'TOTAL';
          } else {
            // Se row é objeto, verificar propriedade
            return row.BDDESCRICAO === 'TOTAL' || row.bddescricao === 'TOTAL' || row.descricao === 'TOTAL';
          }
        });

        detalhes = dados.filter((row: any) => {
          if (Array.isArray(row)) {
            return row[3] !== 'TOTAL';
          } else {
            const descricao = row.BDDESCRICAO || row.bddescricao || row.descricao || '';
            return descricao !== 'TOTAL';
          }
        });
      }

      // Extrair valor do total
      let valorTotal = 0;
      if (total) {
        if (Array.isArray(total)) {
          // Se total é array, valor está no índice 4 (BDVALOR)
          valorTotal = Number(total[4]) || 0;
        } else {
          // Se total é objeto, tentar diferentes nomes de propriedade
          valorTotal = Number(total.BDVALOR || total.bdvalor || total.valor || total[4] || 0);
        }
      }

      console.log('[IRPF] Total encontrado:', valorTotal);
      console.log('[IRPF] Detalhes encontrados:', detalhes.length);

      // Processar detalhes
      const detalhesProcessados = detalhes.map((row: any, index: number) => {
        if (Array.isArray(row)) {
          // Se row é array: [BDCODEMP, BDREF, BDORDEM, BDDESCRICAO, BDVALOR]
          return {
            codigoEmpresa: row[0] || null,
            referencia: row[1] || null,
            ordem: row[2] || null,
            descricao: row[3] || '',
            valor: Number(row[4]) || 0
          };
        } else {
          // Se row é objeto
          return {
            codigoEmpresa: row.BDCODEMP || row.bdcodemp || row.codigoEmpresa || null,
            referencia: row.BDREF || row.bdref || row.referencia || null,
            ordem: row.BDORDEM || row.bdordem || row.ordem || null,
            descricao: row.BDDESCRICAO || row.bddescricao || row.descricao || '',
            valor: Number(row.BDVALOR || row.bdvalor || row.valor || 0)
          };
        }
      });

      console.log('[IRPF] Detalhes processados:', detalhesProcessados.length);

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
            dataInicial,
            dataFinal
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
}

