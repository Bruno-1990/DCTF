import { DCTF as DCTFModel } from '../models/DCTF';
import { DCTFDados as DCTFDadosModel } from '../models/DCTFDados';
import { Cliente as ClienteModel } from '../models/Cliente';
import { AuditTrailService } from './AuditTrailService';
import { ValidationService } from './ValidationService';
import { ApiResponse, DCTFAnalysisDataset, NormalizedDCTFDeclaracao, NormalizedDCTFDado } from '../types';

type BuildDatasetParams = {
  declaracaoId?: string;
  clienteId?: string;
  periodo?: string;
  includeDados?: boolean;
  includeCliente?: boolean;
  logContext?: string;
};

export class DCTFIngestionService {
  private dctf = new DCTFModel();
  private dados = new DCTFDadosModel();
  private clientes = new ClienteModel();

  async buildDataset(params: BuildDatasetParams = {}): Promise<ApiResponse<DCTFAnalysisDataset>> {
    const filters: Record<string, any> = {};

    if (params.declaracaoId) filters.declaracaoId = params.declaracaoId;
    if (params.clienteId) filters.clienteId = params.clienteId;
    if (params.periodo) filters.periodo = ValidationService.normalizePeriodo(params.periodo) ?? params.periodo;

    const declaracoesResp = await this.fetchDeclaracoes(params);
    if (!declaracoesResp.success || !declaracoesResp.data) {
      return { success: false, error: declaracoesResp.error || 'Erro ao carregar declarações' };
    }

    const declaracoes = Array.isArray(declaracoesResp.data)
      ? declaracoesResp.data
      : declaracoesResp.data
      ? [declaracoesResp.data]
      : [];

    const dataset: DCTFAnalysisDataset = {
      generatedAt: new Date().toISOString(),
      filters,
      declaracoes: [],
      totals: {
        declaracoes: declaracoes.length,
        clientes: new Set(declaracoes.map((d: any) => d.clienteId).filter(Boolean)).size,
        periodos: new Set(declaracoes.map((d: any) => d.periodo)).size,
      },
    };

    for (const decl of declaracoes) {
      const normalizedDecl = await this.normalizeDeclaracao(decl, params);
      dataset.declaracoes.push(normalizedDecl);
    }

    await AuditTrailService.record({
      event: 'dctf.ingestion.completed',
      context: {
        filters,
        declaracoes: dataset.totals.declaracoes,
        clientes: dataset.totals.clientes,
        periodos: dataset.totals.periodos,
      },
      payload: params.logContext ? { context: params.logContext } : undefined,
    });

    return { success: true, data: dataset };
  }

  private async fetchDeclaracoes(params: BuildDatasetParams) {
    if (params.declaracaoId) {
      return this.dctf.findById(params.declaracaoId);
    }
    if (params.clienteId && params.periodo) {
      return this.dctf.findBy({ cliente_id: params.clienteId, periodo: params.periodo });
    }
    if (params.clienteId) {
      return this.dctf.findBy({ cliente_id: params.clienteId });
    }
    if (params.periodo) {
      return this.dctf.findBy({ periodo: params.periodo });
    }
    return this.dctf.findAll();
  }

  private async normalizeDeclaracao(
    decl: any,
    params: BuildDatasetParams
  ): Promise<NormalizedDCTFDeclaracao> {
    const dados: NormalizedDCTFDado[] = [];
    let receitaTotal = 0;
    let deducaoTotal = 0;
    let retencaoTotal = 0;

    if (params.includeDados !== false) {
      const dadosResp = await this.dados.findByDeclaracao(decl.id);
      if (dadosResp.success && dadosResp.data) {
        for (const row of dadosResp.data as any[]) {
          const normalized = this.normalizeDado(row);
          dados.push(normalized);
          receitaTotal += normalized.valor && normalized.codigo?.startsWith('0') ? normalized.valor : 0;
          deducaoTotal += normalized.valor && normalized.codigo?.startsWith('1') ? normalized.valor : 0;
          retencaoTotal += normalized.valor && normalized.codigo?.startsWith('2') ? normalized.valor : 0;
        }
      }
    }

    let clienteInfo: NormalizedDCTFDeclaracao['cliente'];
    if (params.includeCliente !== false && decl.clienteId) {
      const clienteResp = await this.clientes.findById(decl.clienteId);
      if (clienteResp.success && clienteResp.data) {
        const cliente = clienteResp.data as any;
        clienteInfo = {
          id: cliente.id,
          razaoSocial: cliente.razao_social || cliente.nome,
          cnpj: cliente.cnpj,
          cnpjLimpo: cliente.cnpj_limpo,
          regime: cliente.regime_tributario || null,
          cnaes: cliente.cnaes || [],
        };
      }
    }

    return {
      id: decl.id,
      clienteId: decl.clienteId,
      periodo: decl.periodo,
      dataDeclaracao: decl.dataDeclaracao ? new Date(decl.dataDeclaracao).toISOString() : undefined,
      situacao: decl.situacao || decl.status,
      status: decl.status,
      debitoApurado: decl.debitoApurado ?? decl.debito_apurado ?? null,
      saldoAPagar: decl.saldoAPagar ?? decl.saldo_a_pagar ?? null,
      cliente: clienteInfo,
      dados,
      stats: {
        receitaTotal,
        deducaoTotal,
        retencaoTotal,
        linhas: dados.length,
      },
      metadata: {
        createdAt: decl.createdAt ? new Date(decl.createdAt).toISOString() : undefined,
        updatedAt: decl.updatedAt ? new Date(decl.updatedAt).toISOString() : undefined,
      },
    };
  }

  private normalizeDado(row: any): NormalizedDCTFDado {
    return {
      id: row.id,
      linha: row.linha ?? row.linha_dctf ?? null,
      codigo: row.codigo || row.codigo_receita || null,
      descricao: row.descricao || null,
      valor: row.valor != null ? Number(row.valor) : undefined,
      codigoReceita: row.codigo_receita || null,
      cnpjCpf: row.cnpj_cpf ? String(row.cnpj_cpf).replace(/\D/g, '') : null,
      dataOcorrencia: row.data_ocorrencia
        ? new Date(row.data_ocorrencia).toISOString()
        : row.dataOcorrencia
        ? new Date(row.dataOcorrencia).toISOString()
        : null,
      observacoes: row.observacoes || null,
    };
  }
}


