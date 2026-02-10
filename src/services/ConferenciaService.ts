import { createSupabaseAdapter } from './SupabaseAdapter';

const supabase = createSupabaseAdapter() as any;

export type ConferenciaResumoItem = {
  cnpj: string;
  competencia: string;
  pago_total: number;
  declarado_total: number;
  diferenca: number;
  atraso_max_dias: number | null;
  status: 'ok' | 'atencao' | 'alerta';
};

export type ConferenciaDetalhe = {
  cnpj: string;
  competencia: string;
  pagamentos: any[];
  declaracao?: { total_declarado: number } | null;
};

export class ConferenciaService {
  async getResumo(params: { cnpj?: string; clienteId?: string; inicio?: string; fim?: string }): Promise<ConferenciaResumoItem[]> {
    try {
      // Tabela receita_pagamentos removida; usar apenas DCTF (pago_total = 0)
      let dq = supabase.from('vw_dctf_competencia').select('*');
      if (params.cnpj) dq = dq.eq('cnpj', params.cnpj.replace(/\D/g, ''));
      if (params.inicio) dq = dq.gte('competencia', params.inicio.slice(0, 7));
      if (params.fim) dq = dq.lte('competencia', params.fim.slice(0, 7));
      const { data: decl, error: e2 } = await dq;
      if (e2) throw new Error(e2.message);

      const itens: ConferenciaResumoItem[] = (decl || []).map((d: any) => {
        const cnpj = String(d.cnpj || '').replace(/\D/g, '');
        const competencia = d.competencia || '';
        const declarado = Number(d.total_declarado || 0);
        const pago = 0; // receita_pagamentos removido
        const dif = Number((declarado - pago).toFixed(2));
        const absDif = Math.abs(dif);
        let status: ConferenciaResumoItem['status'] = 'ok';
        if (declarado === 0 && pago > 0) status = 'alerta';
        else if (declarado > 0 && pago === 0) status = 'alerta';
        else if (absDif > Math.max(1000, declarado * 0.1)) status = 'alerta';
        else if (absDif > 0) status = 'atencao';
        return {
          cnpj,
          competencia,
          pago_total: 0,
          declarado_total: Number(declarado.toFixed(2)),
          diferenca: dif,
          atraso_max_dias: null as number | null,
          status,
        };
      });

      itens.sort((a, b) => a.competencia.localeCompare(b.competencia));
      return itens;
    } catch (err) {
      return [];
    }
  }

  async getDetalhe(params: { cnpj: string; competencia: string }): Promise<ConferenciaDetalhe> {
    const cnpj = params.cnpj.replace(/\D/g, '');
    // Tabela receita_pagamentos removida; retornar pagamentos vazios
    const pagamentos: any[] = [];

    // Declarado da competência (agregado)
    const { data: dctf, error: e2 } = await supabase
      .from('vw_dctf_competencia')
      .select('*')
      .eq('competencia', params.competencia)
      .limit(1)
      .maybeSingle();
    if (e2) throw new Error(e2.message);

    return {
      cnpj,
      competencia: params.competencia,
      pagamentos,
      declaracao: dctf ? { total_declarado: Number(dctf.total_declarado || 0) } : null,
    };
  }
}


