import api from './api';

/**
 * DARF numerado — emissão pela DCTFWeb, via Integra Contador.
 *
 * Serve a aba Trabalhista > DARF. A guia já vem vinculada ao débito da
 * declaração: não há valor, código de receita, multa ou juros a informar.
 *
 * O DARF avulso do Sicalc (o "preto") chegou a existir aqui e foi retirado —
 * na rotina trabalhista ele é sempre o documento errado.
 */

export type CategoriaId =
  | 'GERAL_MENSAL'
  | 'GERAL_13o_SALARIO'
  | 'AFERICAO'
  | 'ESPETACULO_DESPORTIVO'
  | 'RECLAMATORIA_TRABALHISTA'
  | 'PF_MENSAL'
  | 'PF_13o_SALARIO';

export interface CategoriaDctfWeb {
  id: CategoriaId;
  /** 40, 41, 44, 45, 46, 50, 51 — o número que a RFB usa. */
  numero: number;
  rotulo: string;
  /** false nas de 13º salário: décimo terceiro é anual. */
  exigeMes: boolean;
  exigeDia?: boolean;
  exigeCno?: boolean;
  exigeProcesso?: boolean;
}

/**
 * Lido do PDF, porque a API do DCTFWeb devolve APENAS o PDF — nenhum valor,
 * número ou vencimento vem no JSON.
 */
export interface DadosLidosDoPdf {
  numeroDocumento: string | null;
  valorTotal: number | null;
  valorPrincipal: number | null;
  vencimento: string | null;
  numeroRecibo: string | null;
}

export interface GuiaEmitida {
  id: number | null;
  numeroDocumento: string;
  lidos: DadosLidosDoPdf;
  pdfBase64: string;
}

export interface FormularioGuia {
  contribuinte: string;
  categoria: CategoriaId;
  anoPA: string;
  mesPA?: string;
  diaPA?: string;
  cnoAfericao?: string;
  numProcReclamatoria?: string;
  numeroReciboEntrega?: string;
  dataAcolhimento?: string;
}

export interface DarfHistorico {
  id: number;
  cnpj: string;
  razao_social: string | null;

  /** Nulo nas linhas antigas do Sicalc, que a 050 tirou de circulação. */
  categoria: CategoriaId | null;
  categoria_numero: number | null;
  ano_pa: string | null;
  mes_pa: string | null;
  dia_pa: string | null;
  numero_recibo: string | null;

  // Valores e vencimento vêm da leitura do PDF — a API do DCTFWeb não os devolve.
  valor_imposto: string | number | null;
  valor_total: string | number | null;
  vencimento: string | null;

  numero_documento: string | null;
  emitido_por: string | null;
  criado_em: string;

  /** Preenchido = fora da lista, mas o documento e o PDF continuam no banco. */
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;

  tem_pdf: number;
}

/**
 * O backend responde erro em `{ success:false, message }`. O axios transforma
 * isso em exceção, e sem desembrulhar aqui a tela mostraria "Request failed
 * with status code 400" no lugar da mensagem do SERPRO, que é a única
 * acionável ("não há débitos com saldo a pagar para emissão da guia",
 * "não é permitido emitir guia de declarações não ativas").
 */
function mensagemDoErro(e: any, padrao: string): string {
  return e?.response?.data?.message || e?.message || padrao;
}

export const darfService = {
  /** As sete categorias e o que cada uma exige. A regra mora no backend. */
  async categorias(): Promise<CategoriaDctfWeb[]> {
    const { data } = await api.get('/darf/dctfweb/categorias');
    return data.data ?? [];
  },

  async emitirGuia(
    form: FormularioGuia
  ): Promise<{ guia: GuiaEmitida; aviso: string | null }> {
    try {
      const { data } = await api.post('/darf/dctfweb', form);
      return { guia: data.data, aviso: data.aviso ?? null };
    } catch (e) {
      throw new Error(mensagemDoErro(e, 'Não foi possível gerar a guia.'));
    }
  },

  // ─── Histórico ───────────────────────────────────────────────────────────

  async historico(
    cnpj?: string,
    incluirExcluidos = false,
    limit = 100
  ): Promise<DarfHistorico[]> {
    const { data } = await api.get('/darf/historico', {
      params: {
        cnpj: cnpj || undefined,
        incluirExcluidos: incluirExcluidos ? 1 : undefined,
        limit,
      },
    });
    return data.data ?? [];
  },

  /**
   * Apaga o PDF e tira a linha da lista; o registro da emissão fica no banco,
   * com o autor do pedido — ver o comentário em DarfController.excluir.
   *
   * Não manda motivo: a rota aceita um, e o campo existe no banco (a migration
   * 050 o usou para explicar as linhas do Sicalc), mas exigi-lo de quem só quer
   * tirar uma linha da tela era atrito sem retorno — todo mundo digitaria vazio.
   */
  async excluir(id: number): Promise<void> {
    await api.delete(`/darf/${id}`);
  },

  /**
   * Apaga o registro do banco. Sem volta.
   *
   * Só funciona em guia já excluída — o backend recusa com 409 caso contrário.
   * A ordem obrigatória (excluir, depois apagar) é o que separa um clique de
   * arrependimento de uma perda definitiva.
   */
  async excluirDefinitivo(id: number): Promise<void> {
    try {
      await api.delete(`/darf/${id}/definitivo`);
    } catch (e) {
      throw new Error(mensagemDoErro(e, 'Não foi possível apagar o registro.'));
    }
  },

  /** Devolve o registro à lista. O PDF não volta: foi apagado. */
  async restaurar(id: number): Promise<void> {
    await api.post(`/darf/${id}/restaurar`);
  },

  /** URL absoluta do PDF já emitido, para abrir numa aba nova. */
  urlPdf(id: number): string {
    const base = (api.defaults.baseURL ?? '').replace(/\/$/, '');
    return `${base}/darf/${id}/pdf`;
  },
};

// ─── Formatação ────────────────────────────────────────────────────────────

export const formatCnpj = (v: string): string => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length !== 14) return v;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

export const formatMoeda = (v: string | number | null | undefined): string => {
  const n = Number(v);
  if (v === null || v === undefined || isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatData = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
