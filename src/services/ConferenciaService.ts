import { supabase } from '../config/database';

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
      // Carregar pagamentos agregados
      let pg = supabase.from('vw_pagamentos_competencia').select('*');
      if (params.cnpj) pg = pg.eq('cnpj_contribuinte', params.cnpj.replace(/\D/g, ''));
      if (params.inicio) pg = pg.gte('competencia', params.inicio.slice(0, 7));
      if (params.fim) pg = pg.lte('competencia', params.fim.slice(0, 7));
      const { data: pay, error: e1 } = await pg;
      if (e1) throw new Error(e1.message);
  
    // Carregar DCTF agregada (por CNPJ + competência) - com fallback em debito/saldo
    let dq = supabase.from('vw_dctf_competencia').select('*');
    if (params.cnpj) dq = dq.eq('cnpj', params.cnpj.replace(/\D/g, ''));
    if (params.inicio) dq = dq.gte('competencia', params.inicio.slice(0, 7));
    if (params.fim) dq = dq.lte('competencia', params.fim.slice(0, 7));
      const { data: decl, error: e2 } = await dq;
      if (e2) throw new Error(e2.message);

    // Index DCTF por CNPJ+competencia
    const mapDecl = new Map<string, number>();
    (decl || []).forEach((d: any) => {
      const key = `${String(d.cnpj || '').replace(/\\D/g,'')}-${d.competencia}`;
      mapDecl.set(key, Number(d.total_declarado || 0));
      });

      // Consolidar por competencia
      const byCompetencia = new Map<string, { cnpj: string; competencia: string; pago: number; atraso: number | null }>();
      (pay || []).forEach((p: any) => {
      const key = `${p.cnpj_contribuinte}-${p.competencia}`;
        const ref = byCompetencia.get(key) || { cnpj: p.cnpj_contribuinte, competencia: p.competencia, pago: 0, atraso: null as number | null };
        ref.pago += Number(p.total_principal || 0);
        if (p.atraso_max_dias !== null && p.atraso_max_dias !== undefined) {
          ref.atraso = Math.max(ref.atraso ?? 0, Number(p.atraso_max_dias));
        }
        byCompetencia.set(key, ref);
      });

      // Construir itens
      const itens: ConferenciaResumoItem[] = [];
      for (const [, v] of byCompetencia) {
      const declarado = mapDecl.get(`${v.cnpj}-${v.competencia}`) || 0;
        const pago = v.pago;
        const dif = Number((declarado - pago).toFixed(2));
        const absDif = Math.abs(dif);
        let status: ConferenciaResumoItem['status'] = 'ok';
        if (declarado === 0 && pago > 0) status = 'alerta';
        else if (declarado > 0 && pago === 0) status = 'alerta';
        else if (absDif > Math.max(1000, declarado * 0.1)) status = 'alerta';
        else if (absDif > 0) status = 'atencao';
        if ((v.atraso || 0) > 0 && status === 'ok') status = 'atencao';

        itens.push({
          cnpj: v.cnpj,
          competencia: v.competencia,
          pago_total: Number(pago.toFixed(2)),
          declarado_total: Number(declarado.toFixed(2)),
          diferenca: dif,
          atraso_max_dias: v.atraso ?? null,
          status,
        });
      }

      // Ordenar por competencia
      itens.sort((a, b) => a.competencia.localeCompare(b.competencia));
      return itens;
    } catch (err) {
      // Fallback leve: retornar lista vazia (evita quebra na UI)
      return [];
    }
  }

  async getDetalhe(params: { cnpj: string; competencia: string }): Promise<ConferenciaDetalhe> {
    const cnpj = params.cnpj.replace(/\D/g, '');
    // Pagamentos detalhados da competência
    const { data: pagamentos, error: e1 } = await supabase
      .from('receita_pagamentos')
      .select('*')
      .eq('cnpj_contribuinte', cnpj)
      .eq('competencia', params.competencia)
      .order('data_sincronizacao', { ascending: false });
    if (e1) throw new Error(e1.message);

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
      pagamentos: pagamentos || [],
      declaracao: dctf ? { total_declarado: Number(dctf.total_declarado || 0) } : null,
    };
  }
}


