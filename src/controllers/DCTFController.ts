/**
 * Controlador para operações de DCTF
 * Gerencia as requisições HTTP relacionadas às declarações DCTF
 */

import { Request, Response } from 'express';
import { DCTF } from '../models/DCTF';
import { ValidationService } from '../services/ValidationService';
import { ApiResponse } from '../types';
import { DCTFDados } from '../models/DCTFDados';
import { DCTFAnalysisService } from '../services/DCTFAnalysisService';

export class DCTFController {
  private dctfModel: DCTF;
  private dctfDadosModel: DCTFDados;
  private analysisService: DCTFAnalysisService;

  constructor() {
    this.dctfModel = new DCTF();
    this.dctfDadosModel = new DCTFDados();
    this.analysisService = new DCTFAnalysisService();
  }

  private formatDateISO(dateValue: unknown): string | undefined {
    const normalized = ValidationService.normalizeDate(dateValue as any);
    if (!normalized) return undefined;
    return normalized.toISOString().slice(0, 10);
  }

  private formatDateTimeISO(dateValue: unknown): string | undefined {
    const normalized = ValidationService.normalizeDate(dateValue as any);
    if (!normalized) return undefined;
    return normalized.toISOString();
  }

  private formatDctfForResponse(item: any) {
    if (!item) return item;
    const clone = { ...item };

    const dataDeclaracaoISO = this.formatDateISO(clone.dataDeclaracao ?? clone.data_declaracao);
    const dataTransmissaoISO = this.formatDateTimeISO(clone.dataTransmissao ?? clone.data_transmissao);
    const createdAtISO = this.formatDateISO(clone.createdAt);
    const updatedAtISO = this.formatDateISO(clone.updatedAt);

    if (dataDeclaracaoISO) {
      clone.dataDeclaracao = dataDeclaracaoISO;
    }
    if (createdAtISO) {
      clone.createdAt = createdAtISO;
    }
    if (updatedAtISO) {
      clone.updatedAt = updatedAtISO;
    }
    if (dataTransmissaoISO) {
      clone.dataTransmissao = dataTransmissaoISO;
    }

    const debitoRaw = clone.debitoApurado ?? clone.debito_apurado;
    if (debitoRaw !== undefined && debitoRaw !== null && !Number.isNaN(Number(debitoRaw))) {
      clone.debitoApurado = Number(debitoRaw);
    } else if (clone.debitoApurado === undefined) {
      clone.debitoApurado = null;
    }

    const saldoRaw = clone.saldoAPagar ?? clone.saldo_a_pagar;
    if (saldoRaw !== undefined && saldoRaw !== null && !Number.isNaN(Number(saldoRaw))) {
      clone.saldoAPagar = Number(saldoRaw);
    } else if (clone.saldoAPagar === undefined) {
      clone.saldoAPagar = null;
    }

    if ((clone.situacao === undefined || clone.situacao === null) && clone.status) {
      clone.situacao = clone.status;
    }

    clone.periodoApuracao = clone.periodoApuracao || clone.periodo_apuracao || clone.periodo || null;
    clone.tipoNi =
      clone.tipoNi ||
      clone.tipo_ni ||
      clone.identificacao_tipo ||
      (clone.numeroIdentificacao || clone.numero_identificacao || clone.cliente?.cnpj_limpo ? 'CNPJ' : null);

    clone.numeroIdentificacao =
      clone.numeroIdentificacao ||
      clone.numero_identificacao ||
      clone.identificacao ||
      clone.cliente?.cnpj_limpo ||
      null;

    clone.categoria = clone.categoria || clone.category || null;
    clone.origem = clone.origem || clone.source || clone.origens || null;
    clone.tipoDeclaracao = clone.tipoDeclaracao || clone.tipo || clone.tipo_declaracao || null;

    delete clone.debito_apurado;
    delete clone.saldo_a_pagar;
    delete clone.data_transmissao;
    delete clone.periodo_apuracao;
    delete clone.tipo_ni;
    delete clone.numero_identificacao;
    delete clone.tipo_declaracao;
    delete clone.identificacao_tipo;

    return clone;
  }

  /**
   * Analisar declaração DCTF e retornar achados com plano de ação
   */
  async analisarDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'ID da declaração é obrigatório' });
        return;
      }
      const result = await this.analysisService.analyzeDeclaracao(id);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }

  /**
   * Listar dados DCTF por declaração
   */
  async listarDadosPorDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 50,
        codigo,
        codigoReceita,
        valorMin,
        valorMax,
        dataInicio,
        dataFim,
        search,
        orderBy = 'linha',
        order = 'asc',
      } = req.query as any;

      if (!id) {
        res.status(400).json({ success: false, error: 'ID da declaração é obrigatório' });
        return;
      }

      const dInicio = dataInicio ? ValidationService.normalizeDate(String(dataInicio)) : null;
      const dFim = dataFim ? ValidationService.normalizeDate(String(dataFim)) : null;

      const result = await this.dctfDadosModel.searchByDeclaracao({
        declaracaoId: id,
        page: Number(page),
        limit: Number(limit),
        codigo: codigo ? String(codigo) : undefined,
        codigoReceita: codigoReceita ? String(codigoReceita) : undefined,
        valorMin: valorMin !== undefined ? Number(valorMin) : undefined,
        valorMax: valorMax !== undefined ? Number(valorMax) : undefined,
        dataInicio: dInicio,
        dataFim: dFim,
        search: search ? String(search) : undefined,
        orderBy: String(orderBy),
        order: String(order).toLowerCase() === 'desc' ? 'desc' : 'asc',
      });
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      const items = (result.data?.items || []) as any[];
      const total = result.data?.total || 0;

      const pageItems = items.map((row: any) => {
        // Mapear de snake_case para camelCase
        const mapped = {
          id: row.id,
          declaracaoId: row.declaracao_id || row.declaracaoId,
          linha: row.linha,
          codigo: row.codigo,
          descricao: row.descricao,
          valor: row.valor,
          dataOcorrencia: row.data_ocorrencia || row.dataOcorrencia,
          observacoes: row.observacoes,
          createdAt: row.created_at || row.createdAt,
        };
        
        if (mapped.dataOcorrencia) mapped.dataOcorrencia = ValidationService.formatData(mapped.dataOcorrencia);
        if (mapped.createdAt) mapped.createdAt = ValidationService.formatData(mapped.createdAt);
        
        return mapped;
      });

      res.json({
        success: true,
        data: pageItems,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Executar limpeza/deduplicação forte de dados por declaração
   */
  async limparDuplicados(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'ID da declaração é obrigatório' });
        return;
      }

      const result = await this.dctfDadosModel.deduplicateByDeclaracao(id);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({ success: true, data: result.data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Listar todas as declarações DCTF
   */
  async listarDeclaracoes(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        clienteId,
        periodo,
        status,
        situacao,
        orderBy,
        order = 'desc',
        search,
      } = req.query;
      
      let result: ApiResponse<any>;
      
      // Buscar declarações com filtros
      if (clienteId) {
        result = await this.dctfModel.findByCliente(clienteId as string);
      } else {
        result = await this.dctfModel.findAll();
      }

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      let filteredData = result.data || [];

      // Aplicar filtros adicionais
      if (periodo) {
        filteredData = filteredData.filter((d: any) => d.periodo === periodo);
      }

      if (status) {
        filteredData = filteredData.filter((d: any) => d.status === status);
      }

      if (situacao) {
        filteredData = filteredData.filter((d: any) => (d.situacao || d.status) === situacao);
      }

      // Filtro de busca por CNPJ/CPF
      if (search && typeof search === 'string' && search.trim()) {
        const searchDigits = search.replace(/\D/g, ''); // Remove caracteres não numéricos para busca de CNPJ
        
        if (searchDigits) {
          filteredData = filteredData.filter((d: any) => {
            // Buscar CNPJ/CPF em vários campos possíveis
            const cnpj = (
              d.cliente?.cnpj_limpo || 
              d.cnpj_limpo || 
              ''
            ).replace(/\D/g, '');
            
            const numeroIdentificacao = (
              d.numeroIdentificacao || 
              d.numero_identificacao || 
              d.identificacao || 
              ''
            ).replace(/\D/g, '');
            
            // Busca por CNPJ/CPF (apenas dígitos)
            const matchCnpj = cnpj && cnpj.includes(searchDigits);
            const matchNumero = numeroIdentificacao && numeroIdentificacao.includes(searchDigits);
            
            return matchCnpj || matchNumero;
          });
        }
      }

      // Se houver filtro (search ou situacao) e não houver orderBy, ordenar por data de transmissão (mais recentes primeiro)
      const hasFilter = (search && typeof search === 'string' && search.trim()) || (situacao && situacao !== 'Todos');
      let orderKey = typeof orderBy === 'string' ? orderBy : undefined;
      let orderToUse = order;
      if (hasFilter && !orderKey) {
        orderKey = 'dataTransmissao';
        orderToUse = 'desc'; // Mais recentes primeiro
      }
      
      const orderDir = String(orderToUse).toLowerCase() === 'desc' ? -1 : 1;
      if (orderKey) {
        const orderMap: Record<string, (item: any) => any> = {
          razaoSocial: (item: any) => (item.cliente?.razao_social || item.cliente?.nome || '').toString(),
          cnpj: (item: any) => (item.cliente?.cnpj_limpo || '').toString(),
          periodo: (item: any) => item.periodo || '',
          dataDeclaracao: (item: any) => {
            const value = item.dataDeclaracao || item.data_declaracao || item.data_transmissao;
            const date = value ? new Date(value) : null;
            return date ? date.getTime() : null;
          },
          dataTransmissao: (item: any) => {
            // Priorizar dataTransmissao, depois data_declaracao
            const value = item.dataTransmissao || item.data_transmissao || item.dataDeclaracao || item.data_declaracao;
            const date = value ? new Date(value) : null;
            return date ? date.getTime() : null;
          },
          situacao: (item: any) => (item.situacao || item.status || '').toString(),
          debitoApurado: (item: any) => {
            const value = item.debitoApurado ?? item.debito_apurado;
            return value != null ? Number(value) : null;
          },
          saldoAPagar: (item: any) => {
            const value = item.saldoAPagar ?? item.saldo_a_pagar;
            return value != null ? Number(value) : null;
          },
        };

        const accessor = orderMap[orderKey];
        if (accessor) {
          filteredData = [...filteredData].sort((a: any, b: any) => {
            const valueA = accessor(a);
            const valueB = accessor(b);

            if (valueA === valueB) return 0;
            if (valueA === null || valueA === undefined) return -1 * orderDir;
            if (valueB === null || valueB === undefined) return 1 * orderDir;

            if (typeof valueA === 'number' && typeof valueB === 'number') {
              return valueA < valueB ? -1 * orderDir : 1 * orderDir;
            }

            const strA = valueA.toString();
            const strB = valueB.toString();
            return strA.localeCompare(strB, 'pt-BR') * orderDir;
          });
        }
      }

      // Paginação
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedData = filteredData.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: paginatedData.map((d: any) => this.formatDctfForResponse(d)),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: filteredData.length,
          totalPages: Math.ceil(filteredData.length / Number(limit)),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter declaração por ID
   */
  async obterDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID da declaração é obrigatório',
        });
        return;
      }

      const result = await this.dctfModel.findById(id);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json({
        success: true,
        data: this.formatDctfForResponse(result.data),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Criar nova declaração DCTF
   */
  async criarDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const dctfData = req.body;

      const result = await this.dctfModel.createDCTF(dctfData);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json({
        success: true,
        data: this.formatDctfForResponse(result.data),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar declaração DCTF
   */
  async atualizarDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID da declaração é obrigatório',
        });
        return;
      }

      const result = await this.dctfModel.updateDCTF(id, updates);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: this.formatDctfForResponse(result.data),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Deletar declaração DCTF
   */
  async deletarDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID da declaração é obrigatório',
        });
        return;
      }

      const result = await this.dctfModel.delete(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        message: 'Declaração DCTF deletada com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter declarações por cliente
   */
  async obterDeclaracoesPorCliente(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.params;

      if (!clienteId) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.dctfModel.findByCliente(clienteId);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json({
        success: true,
        data: (result.data || []).map((d: any) => this.formatDctfForResponse(d)),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter estatísticas das declarações
   */
  async obterEstatisticas(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.dctfModel.getStats();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }
}
