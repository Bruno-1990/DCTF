import api from './api';
import type { Cliente } from '../types';

export type ClientesListResponse = {
  items: Cliente[];
  pagination?: { total: number; totalPages: number; page: number; limit: number };
};

export const clientesService = {
  async getAll(params?: { page?: number; limit?: number; nome?: string; cnpj?: string; email?: string; search?: string; socio?: string; payments?: 'all' | 'with' | 'without'; semCodigoSci?: boolean }): Promise<ClientesListResponse> {
    const response = await api.get<any>('/clientes', { params });
    const body = response.data;
    if (Array.isArray(body)) {
      return { items: body };
    }
    if (body && Array.isArray(body.data)) {
      return { items: body.data as Cliente[], pagination: body.pagination };
    }
    return { items: [] };
  },

  async getById(id: string): Promise<Cliente> {
    const response = await api.get<{ success?: boolean; data?: Cliente } | Cliente>(`/clientes/${String(id)}`);
    const body = response.data as any;
    // Backend retorna { success, data: Cliente }; normalizar para sempre retornar o Cliente
    if (body && typeof body === 'object' && body.data !== undefined) {
      return body.data as Cliente;
    }
    return body as Cliente;
  },

  async create(cliente: Partial<Cliente>): Promise<Cliente> {
    const response = await api.post<Cliente>('/clientes', cliente);
    return response.data;
  },

  async update(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    const response = await api.put<Cliente>(`/clientes/${id}`, cliente);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/clientes/${id}`);
  },

  async consultarReceitaWS(cnpj: string) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.get(`/clientes/receita-ws/cnpj/${cnpjLimpo}`);
    return response.data; // { success, data }
  },

  async importarReceitaWS(cnpj: string, overwrite?: boolean) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.post(`/clientes/import-receita-ws`, { cnpj: cnpjLimpo, overwrite: overwrite === true });
    return response.data; // { success, data: Cliente }
  },

  /**
   * Atualizar capital_social usando dados do banco (sem consultar ReceitaWS)
   * Atualiza dados diretamente do PDF/banco sem baixar situação fiscal
   */
  async atualizarCapitalSocial(dryRun: boolean = false) {
    const response = await api.post('/clientes/atualizar-capital-social', { dryRun });
    return response.data; // { success, message, relatorio, output }
  },

  /**
   * Atualizar participacao_percentual e participacao_valor dos sócios
   * Atualiza valores e porcentagens dos sócios usando dados do PDF
   */
  async atualizarSocios(dryRun: boolean = false) {
    const response = await api.post('/clientes/atualizar-socios', { dryRun });
    return response.data; // { success, message, relatorio }
  },

  /**
   * Recalcular valores de participação para todos os clientes divergentes
   * Calcula participacao_valor = (capital_social * participacao_percentual) / 100
   */
  async recalcularValoresDivergentes() {
    const response = await api.post('/clientes/recalcular-valores-divergentes');
    return response.data; // { success, message, relatorio }
  },

  async listarSociosDistinct() {
    const response = await api.get('/clientes/socios');
    return response.data; // { success, data: [{nome}] }
  },

  async obterCliente(id: string) {
    const response = await api.get(`/clientes/${id}`);
    // O backend retorna { success, data: Cliente } ou diretamente Cliente
    return response.data; // { success, data: Cliente } ou Cliente
  },

  async atualizarSociosPorSituacaoFiscal(id: string) {
    const response = await api.put(`/clientes/${id}/atualizar-socios-situacao-fiscal`);
    return response.data; // { success, data: { clienteId, sociosAtualizados, message } }
  },

  async recalcularValoresParticipacao(id: string) {
    const response = await api.put(`/clientes/${id}/recalcular-valores-participacao`);
    return response.data; // { success, data: { atualizados: number }, message }
  },

  async atualizarCodigoSCI(id: string) {
    const response = await api.put(`/clientes/${id}/atualizar-codigo-sci`);
    return response.data; // { success, data: { codigo_sci: string, cliente: Cliente }, message }
  },

  async buscarPorCNPJ(cnpj: string) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.get(`/clientes/cnpj/${cnpjLimpo}`);
    return response.data; // { success, data: Cliente }
  },

  async buscarPorCNAE(cnae: string) {
    // Manter formatação do CNAE (XXXX-X/XX)
    const cnaeFormatado = String(cnae || '').trim();
    const response = await api.get(`/clientes/cnae/${encodeURIComponent(cnaeFormatado)}`);
    return response.data; // { success, data: Cliente[], total: number }
  },

  async buscarGruposCNAE() {
    const response = await api.get('/clientes/cnae-grupos');
    return response.data; // { success, data: Array<{ nome: string, palavrasChave: string[], cnaes: Array<{ codigo: string, descricao: string }> }>, total: number }
  },

  async buscarPorGrupoCNAE(grupo: string) {
    const response = await api.get(`/clientes/cnae-grupo/${encodeURIComponent(grupo)}`);
    return response.data; // { success, data: Cliente[], total: number, grupo: string }
  },

  async buscarPorMultiplosCNAEsEGrupos(criterios: { cnaes?: string[]; grupos?: string[]; mode?: 'OR' | 'AND' }) {
    // Garantir que arrays vazios sejam enviados como arrays vazios, não undefined
    const payload = {
      cnaes: criterios.cnaes && criterios.cnaes.length > 0 ? criterios.cnaes : [],
      grupos: criterios.grupos && criterios.grupos.length > 0 ? criterios.grupos : [],
      mode: criterios.mode || 'OR', // Padrão é OR (qualquer um)
    };
    
    console.log('[clientesService] Enviando busca com critérios:', payload);
    
    const response = await api.post('/clientes/cnae-busca', payload);
    return response.data; // { success, data: Cliente[], total: number, criterios: { cnaes, grupos, totalCodigosCNAE } }
  },

  /**
   * Atualiza o cadastro de um CNPJ com os dados do cartão CNPJ (ReceitaWS).
   * Não-destrutivo: nunca apaga nem substitui dado já existente no cadastro.
   */
  async atualizarCadastroReceitaWS(
    cnpj: string,
    options?: { dryRun?: boolean; ignorarCaixa?: boolean; somenteRazaoSocial?: boolean }
  ) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const response = await api.post('/clientes/atualizar-cadastro-receita-ws', {
      cnpj: cnpjLimpo,
      dryRun: options?.dryRun === true,
      ignorarCaixa: options?.ignorarCaixa !== false,
      somenteRazaoSocial: options?.somenteRazaoSocial === true,
    });
    // { success, data: { status, cnpj_limpo, cliente_id?, razao_social_antes?, razao_social_depois?,
    //                    alteracoes: [{campo, antes, depois}], socios_novos, socios_qualificacao,
    //                    socios_ausentes_no_cartao, simulado? } }
    return response.data;
  },

  /**
   * Registro do que a ReceitaWS já alterou no cadastro (histórico gravado).
   * Não consulta a API externa — lê a tabela de histórico.
   */
  async historicoReceitaWS(filtros?: { desde?: string; ate?: string; clienteId?: string }) {
    const params = new URLSearchParams();
    if (filtros?.desde) params.set('desde', filtros.desde);
    if (filtros?.ate) params.set('ate', filtros.ate);
    if (filtros?.clienteId) params.set('cliente_id', filtros.clienteId);
    const response = await api.get(`/clientes/historico-receita?${params.toString()}`);
    return response.data; // { success, data: [...], total }
  },

  /** Baixa o mesmo histórico em XLSX. */
  async baixarHistoricoReceitaWS(filtros?: { desde?: string; ate?: string; clienteId?: string }) {
    const params = new URLSearchParams({ formato: 'xlsx' });
    if (filtros?.desde) params.set('desde', filtros.desde);
    if (filtros?.ate) params.set('ate', filtros.ate);
    if (filtros?.clienteId) params.set('cliente_id', filtros.clienteId);
    const response = await api.get(`/clientes/historico-receita?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  /**
   * Grava no banco o que já foi calculado numa simulação, sem consultar a
   * ReceitaWS de novo (portanto sem rate limit).
   */
  async aplicarCadastroSimulado(payload: {
    cliente_id: string;
    alteracoes?: Array<{ campo: string; antes: any; depois: any }>;
    socios_novos?: Array<{ nome: string; qual?: string | null }>;
    socios_qualificacao?: Array<{ socio_id: string; nome: string; antes: any; depois: string }>;
    socios_ausentes_no_cartao?: string[];
    ignorarCaixa?: boolean;
  }) {
    const response = await api.post('/clientes/aplicar-cadastro-simulado', payload);
    // { success, data: { cliente_id, campos_gravados, campos_em_conflito, socios_inseridos,
    //                    socios_qualificacao_atualizada, socios_marcados_ausentes, campos_ignorados } }
    return response.data;
  },

  async editarParticipacaoManual(
    id: string,
    capitalSocial: number,
    socios: Array<{ id: number; participacao_percentual: number; participacao_valor: number }>,
    sociosRemovidos: number[] = []
  ) {
    const response = await api.put(`/clientes/${id}/editar-participacao-manual`, {
      capital_social: capitalSocial,
      socios,
      socios_removidos: sociosRemovidos,
    });
    return response.data; // { success, data: { clienteId, message } }
  },

  async abrirPasta(caminho: string) {
    const response = await api.post('/clientes/abrir-pasta', { caminho });
    return response.data;
  },

  // ── OneClick (Sincronizar clientes) ──

  async oneClickStatus() {
    const response = await api.get('/clientes/oneclick/status');
    return response.data; // { success, data: { active, host, port, taskName } }
  },

  async previewOneClick() {
    const response = await api.get('/clientes/oneclick/preview');
    return response.data; // { success, data: OneClickPreviewItem[] }
  },

  async sincronizarOneClick(ids?: number[]) {
    const response = await api.post('/clientes/sincronizar-oneclick', ids ? { ids } : {});
    return response.data; // { success, data: { total, novos, atualizados, ignorados, erros }, message }
  },

  // ── Acessórias (Sincronizar clientes) ──

  async acessoriasStatus() {
    const response = await api.get('/clientes/acessorias/status');
    return response.data; // { success, data: { configurada, baseUrl, ativa, erro? } }
  },

  async previewAcessorias() {
    const response = await api.get('/clientes/acessorias/preview');
    return response.data; // { success, data: AcessoriasPreviewItem[] }
  },

  async sincronizarAcessorias(ids?: string[]) {
    const response = await api.post('/clientes/sincronizar-acessorias', ids ? { ids } : {});
    return response.data; // { success, data: { total, novos, atualizados, ignorados, erros }, message }
  },

  // ── e-BEF (Beneficiários Finais) ──

  async listarEBEF() {
    const response = await api.get('/clientes/ebef');
    return response.data; // { success, data: EBEFParent[] }
  },

  async obterProgressoEBEF() {
    const response = await api.get('/clientes/ebef/progresso');
    return response.data; // { success, data: EBEFProgress }
  },

  async iniciarLoteEBEF() {
    const response = await api.post('/clientes/ebef/lote');
    return response.data; // { success, data: { total, inseridos }, message }
  },

  async consultarEBEFFilho(consultaId: string) {
    const response = await api.post('/clientes/ebef/consultar', { consultaId });
    return response.data; // { success, data }
  },

  async atualizarEnvioEBEF(clienteId: string, enviado: boolean) {
    const response = await api.patch(`/clientes/ebef/${clienteId}/envio`, { enviado });
    return response.data; // { success, data: { ebef_enviado, ebef_enviado_em } }
  },

  async exportarEBEFXlsx() {
    const response = await api.get('/clientes/ebef/exportar', { responseType: 'blob' });
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ebef_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

};

export const spreadsheetService = {
  async validate(file: File) {
    const form = new FormData();
    form.append('arquivo', file);
    const res = await api.post('/spreadsheet/validate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async upload(file: File, payload: { clienteId: string; periodo: string }, onProgress?: (percent: number) => void) {
    const form = new FormData();
    form.append('arquivo', file);
    form.append('clienteId', payload.clienteId);
    form.append('periodo', payload.periodo);
    const res = await api.post('/spreadsheet/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) {
          const percent = Math.round((e.loaded * 100) / e.total);
          onProgress?.(percent);
        }
      },
    });
    return res.data;
  },
  async downloadTemplate(filename: string = 'template_dctf.xlsx') {
    const res = await api.get('/spreadsheet/template', { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  async getUploads(params?: { page?: number; limit?: number; clienteId?: string; periodo?: string }) {
    const res = await api.get('/spreadsheet/uploads', { params });
    return res.data; // { success, data, pagination }
  }
};

