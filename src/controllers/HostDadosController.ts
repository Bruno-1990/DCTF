import { Request, Response } from 'express';
import { HostDadosObrigacaoService } from '../services/HostDadosObrigacaoService';
import { FirebirdSyncService } from '../services/FirebirdSyncService';

export class HostDadosController {
  private service: HostDadosObrigacaoService;
  private syncService: FirebirdSyncService;

  constructor() {
    this.service = new HostDadosObrigacaoService();
    this.syncService = new FirebirdSyncService();
  }

  /**
   * GET /api/host-dados/obrigacoes?ano=YYYY&mes=MM
   */
  public async verificarObrigacoes(req: Request, res: Response) {
    try {
      const ano = Number.parseInt((req.query.ano as string) || '', 10);
      const mes = Number.parseInt((req.query.mes as string) || '', 10);

      if (!ano || !mes || mes < 1 || mes > 12) {
        return res.status(400).json({
          success: false,
          error:
            'Parâmetros inválidos. Informe ano=YYYY e mes=MM (1-12) na query string.',
        });
      }

      console.log(`[HostDadosController] Verificando obrigações para ${mes}/${ano}`);
      
      const data = await this.service.verificarObrigacoesPorCompetencia(
        ano,
        mes,
      );

      console.log(`[HostDadosController] Obrigações encontradas: ${data.length}`);

      return res.json({
        success: true,
        data,
        meta: {
          ano,
          mes,
          competencia: `${String(mes).padStart(2, '0')}/${ano}`,
          totalEmpresas: data.length,
        },
      });
    } catch (error: any) {
      console.error('[HostDadosController] Erro em verificarObrigacoes:', error);
      console.error('[HostDadosController] Stack:', error.stack);
      return res.status(500).json({
        success: false,
        error: error.message || 'Erro interno ao verificar obrigações de DCTF via Banco SCI.',
      });
    }
  }

  /**
   * GET /api/host-dados/cliente/:cnpj?ano=YYYY&mes=MM
   * Retorna os lançamentos de host_dados para um CNPJ específico
   * (CNPJ deve ser enviado limpo, apenas números).
   */
  public async listarPorCliente(req: Request, res: Response) {
    try {
      const cnpjParam = (req.params.cnpj || '').replace(/\D/g, '');
      if (!cnpjParam || cnpjParam.length !== 14) {
        return res.status(400).json({
          success: false,
          error: 'CNPJ inválido. Envie o CNPJ limpo (14 dígitos) em /cliente/:cnpj.',
        });
      }

      const ano = req.query.ano ? Number.parseInt(req.query.ano as string, 10) : undefined;
      const mes = req.query.mes ? Number.parseInt(req.query.mes as string, 10) : undefined;

      const data = await this.service.listarLancamentosPorCliente({
        cnpj: cnpjParam,
        ano,
        mes,
      });

      return res.json({
        success: true,
        data,
        meta: {
          cnpj: cnpjParam,
          ano: ano ?? null,
          mes: mes ?? null,
          totalRegistros: data.length,
        },
      });
    } catch (error) {
      console.error('[HostDadosController] Erro em listarPorCliente:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao listar lançamentos do Banco SCI para o cliente.',
      });
    }
  }

  /**
   * POST /api/host-dados/sincronizar?ano=YYYY&mes=MM
   * Sincroniza dados do Firebird (SCI) para MySQL (host_dados) para um período específico.
   */
  public async sincronizarPeriodo(req: Request, res: Response) {
    try {
      const ano = Number.parseInt((req.query.ano as string) || '', 10);
      const mes = Number.parseInt((req.query.mes as string) || '', 10);

      if (!ano || !mes || mes < 1 || mes > 12) {
        return res.status(400).json({
          success: false,
          error:
            'Parâmetros inválidos. Informe ano=YYYY e mes=MM (1-12) na query string.',
        });
      }

      console.log(`[HostDadosController] Iniciando sincronização para ${mes}/${ano}`);

      const resultado = await this.syncService.sincronizarPeriodo(ano, mes);

      console.log(`[HostDadosController] Resultado da sincronização:`, {
        success: resultado.success,
        periodo: resultado.periodo,
        total: resultado.total,
        error: resultado.error,
      });

      if (!resultado.success) {
        console.error(`[HostDadosController] Falha na sincronização:`, resultado.error);
        return res.status(500).json({
          success: false,
          error: resultado.error || 'Erro ao sincronizar período',
          periodo: resultado.periodo,
        });
      }

      return res.json({
        success: true,
        data: resultado,
        meta: {
          ano,
          mes,
          competencia: resultado.periodo,
        },
      });
    } catch (error) {
      console.error('[HostDadosController] Erro em sincronizarPeriodo:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao sincronizar período do Firebird para MySQL.',
      });
    }
  }

  /**
   * POST /api/host-dados/sincronizar-automatico
   * Sincronização automática: chama main.py que sincroniza o mês anterior automaticamente.
   * Consulta TODOS os CNPJs do período e atualiza a tabela MySQL.
   */
  public async sincronizarAutomatico(req: Request, res: Response) {
    try {
      console.log(`[HostDadosController] Iniciando sincronização automática (mês anterior)`);

      const resultado = await this.syncService.sincronizarAutomatico();

      console.log(`[HostDadosController] Resultado da sincronização automática:`, {
        success: resultado.success,
        periodo: resultado.periodo,
        error: resultado.error,
      });

      if (!resultado.success) {
        console.error(`[HostDadosController] Falha na sincronização automática:`, resultado.error);
        return res.status(500).json({
          success: false,
          error: resultado.error || 'Erro ao sincronizar automaticamente',
          periodo: resultado.periodo,
        });
      }

      return res.json({
        success: true,
        data: resultado,
        meta: {
          tipo: 'automático',
          periodo: resultado.periodo,
        },
      });
    } catch (error) {
      console.error('[HostDadosController] Erro em sincronizarAutomatico:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao sincronizar automaticamente do Firebird para MySQL.',
      });
    }
  }

  /**
   * POST /api/host-dados/sincronizar-datas?data_ini=YYYY-MM-DD&data_fim=YYYY-MM-DD
   * Sincronização manual com datas personalizadas: consulta período específico
   * de TODOS os CNPJs e atualiza a tabela MySQL.
   */
  public async sincronizarPorDatas(req: Request, res: Response) {
    try {
      const dataIni = req.query.data_ini as string;
      const dataFim = req.query.data_fim as string;

      if (!dataIni || !dataFim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos. Informe data_ini=YYYY-MM-DD e data_fim=YYYY-MM-DD na query string.',
        });
      }

      // Validar formato das datas
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dataIni) || !dateRegex.test(dataFim)) {
        return res.status(400).json({
          success: false,
          error: 'Datas devem estar no formato YYYY-MM-DD (ex: 2025-01-01)',
        });
      }

      console.log(`[HostDadosController] Iniciando sincronização por datas: ${dataIni} a ${dataFim}`);

      const resultado = await this.syncService.sincronizarPorDatas(dataIni, dataFim);

      console.log(`[HostDadosController] Resultado da sincronização por datas:`, {
        success: resultado.success,
        periodo: resultado.periodo,
        total: resultado.total,
        error: resultado.error,
      });

      if (!resultado.success) {
        console.error(`[HostDadosController] Falha na sincronização por datas:`, resultado.error);
        return res.status(500).json({
          success: false,
          error: resultado.error || 'Erro ao sincronizar período por datas',
          periodo: resultado.periodo,
        });
      }

      return res.json({
        success: true,
        data: resultado,
        meta: {
          data_ini: dataIni,
          data_fim: dataFim,
          periodo: resultado.periodo,
        },
      });
    } catch (error) {
      console.error('[HostDadosController] Erro em sincronizarPorDatas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao sincronizar período por datas do Firebird para MySQL.',
      });
    }
  }

  /**
   * GET /api/host-dados/clientes-sem-dctf-com-movimento?ano=YYYY&mes=MM
   * Retorna clientes que NÃO têm DCTF na competência informada,
   * mas TÊM movimento no Banco SCI no mês anterior.
   * Se não informar ano/mes, usa a competência vigente (mês anterior ao atual).
   */
  public async listarClientesSemDCTFComMovimento(req: Request, res: Response) {
    try {
      const ano = req.query.ano ? Number.parseInt(req.query.ano as string, 10) : undefined;
      const mes = req.query.mes ? Number.parseInt(req.query.mes as string, 10) : undefined;

      // Validar se informado
      if (ano !== undefined && mes !== undefined) {
        if (mes < 1 || mes > 12) {
          return res.status(400).json({
            success: false,
            error: 'Mês inválido. Deve estar entre 1 e 12.',
          });
        }
      }

      console.log(`[HostDadosController] Listando clientes sem DCTF mas com movimento${ano && mes ? ` para ${mes}/${ano}` : ' (competência vigente)'}`);

      const data = await this.service.listarClientesSemDCTFComMovimento(ano, mes);

      console.log(`[HostDadosController] Encontrados ${data.length} clientes sem DCTF mas com movimento`);

      return res.json({
        success: true,
        data,
        meta: {
          ano: ano || null,
          mes: mes || null,
          totalClientes: data.length,
        },
      });
    } catch (error: any) {
      console.error('[HostDadosController] Erro em listarClientesSemDCTFComMovimento:', error);
      console.error('[HostDadosController] Stack:', error.stack);
      return res.status(500).json({
        success: false,
        error: error.message || 'Erro interno ao listar clientes sem DCTF com movimento.',
      });
    }
  }

  /**
   * GET /api/host-dados/stats/dctf-declaracoes
   * Retorna estatísticas sobre a tabela dctf_declaracoes (para debug)
   */
  public async getDCTFDeclaracoesStats(req: Request, res: Response) {
    try {
      const { executeQuery } = await import('../config/mysql');
      
      // Total de registros
      const totalResult = await executeQuery<{ total: number }>('SELECT COUNT(*) as total FROM dctf_declaracoes');
      const total = totalResult[0]?.total || 0;
      
      // Por período (últimos 10)
      const porPeriodo = await executeQuery<{ periodo_apuracao: string; total: number }>(`
        SELECT 
          periodo_apuracao,
          COUNT(*) as total
        FROM dctf_declaracoes
        GROUP BY periodo_apuracao
        ORDER BY periodo_apuracao DESC
        LIMIT 10
      `);
      
      // Para competência 10/2025
      const competencia10 = await executeQuery<{ total: number }>(`
        SELECT COUNT(*) as total 
        FROM dctf_declaracoes 
        WHERE periodo_apuracao = '10/2025' OR periodo_apuracao = '2025-10'
      `);
      
      // Total de clientes únicos
      const clientesUnicos = await executeQuery<{ total: number }>(`
        SELECT COUNT(DISTINCT cliente_id) as total FROM dctf_declaracoes
      `);
      
      return res.json({
        success: true,
        data: {
          totalRegistros: total,
          totalClientesUnicos: clientesUnicos[0]?.total || 0,
          competencia10_2025: competencia10[0]?.total || 0,
          ultimosPeriodos: porPeriodo,
        },
      });
    } catch (error: any) {
      console.error('[HostDadosController] Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Erro interno ao buscar estatísticas.',
      });
    }
  }
}


