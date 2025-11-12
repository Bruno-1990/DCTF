import { useCallback, useEffect, useMemo, useState } from 'react';
import Toast from '../components/UI/Toast';
import { useParams } from 'react-router-dom';

type Dado = Record<string, any>;

type ApiResp = {
  success: boolean;
  data?: Dado[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
};

export default function DCTFDadosPage() {
  const { id } = useParams();
  const [items, setItems] = useState<Dado[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState('');
  const [codigoReceita, setCodigoReceita] = useState('');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [search, setSearch] = useState('');
  const [orderBy, setOrderBy] = useState('linha');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; msg: string } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (codigo) p.set('codigo', codigo);
    if (codigoReceita) p.set('codigoReceita', codigoReceita);
    if (valorMin) p.set('valorMin', valorMin);
    if (valorMax) p.set('valorMax', valorMax);
    if (dataInicio) p.set('dataInicio', dataInicio);
    if (dataFim) p.set('dataFim', dataFim);
    if (search) p.set('search', search);
    if (orderBy) p.set('orderBy', orderBy);
    if (order) p.set('order', order);
    return p.toString();
  }, [page, limit, codigo, codigoReceita, valorMin, valorMax, dataInicio, dataFim, search, orderBy, order]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dctf/${id}/dados?${qs}`);
      const json: ApiResp = await res.json();
      if (!json.success) {
        setError(json.error || 'Falha ao carregar');
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(json.data || []);
      setTotal(json.pagination?.total || 0);
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [id, qs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cleanup = useCallback(async () => {
    if (!id) return;
    try {
      setCleaning(true);
      const res = await fetch(`/api/dctf/${id}/cleanup`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) {
        setToast({ type: 'error', msg: json.error || 'Falha ao limpar duplicados' });
        return;
      }
      setToast({ type: 'success', msg: 'Duplicados removidos' });
      fetchData();
    } catch (e: any) {
      setToast({ type: 'error', msg: e?.message || 'Erro ao limpar duplicados' });
    } finally {
      setCleaning(false);
    }
  }, [id, fetchData]);

  const runAnalysis = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/dctf/${id}/analyze`);
      const json = await res.json();
      if (!json.success) {
        setToast({ type: 'error', msg: json.error || 'Falha na análise' });
        return;
      }
      setAnalysis(json.data);
      setShowAnalysis(true);
    } catch (e: any) {
      setToast({ type: 'error', msg: e?.message || 'Erro ao analisar' });
    }
  }, [id]);

  const exportCSV = useCallback(() => {
    if (!analysis) return;
    const headers = ['code','severity','message','actionPlan'];
    const rows = (analysis.findings || []).map((f: any) => [f.code, f.severity, (f.message||'').replaceAll('\n',' '), (f.actionPlan||'').replaceAll('\n',' ')]);
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analise-dctf-${analysis.dctfId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis]);

  const exportPDF = useCallback(() => {
    if (!analysis) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const styles = `<style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      h1 { font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
      th { background: #f5f5f5; text-align: left; }
    </style>`;
    const rows = (analysis.findings||[]).map((f: any) => `<tr><td>${f.code}</td><td>${f.severity}</td><td>${f.message||''}</td><td>${f.actionPlan||''}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset='utf-8'/>${styles}</head><body>
      <h1>Relatório de Análise DCTF</h1>
      <div>DCTF: ${analysis.dctfId} — Cliente: ${analysis.clienteId||'-'} — Período: ${analysis.periodo||'-'}</div>
      <div>Findings: ${analysis.summary?.numFindings} (critical: ${analysis.summary?.critical}, high: ${analysis.summary?.high}, medium: ${analysis.summary?.medium}, low: ${analysis.summary?.low})</div>
      <table>
        <thead><tr><th>Código</th><th>Severidade</th><th>Mensagem</th><th>Plano de Ação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body></html>`;
    w.document.write(html);
    w.document.close();
  }, [analysis]);

  const severityClass = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'text-red-700 bg-red-100 border-red-300';
      case 'high':
        return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'medium':
        return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'low':
        return 'text-blue-700 bg-blue-100 border-blue-300';
      default:
        return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };

  const columns = useMemo(() => {
    if (!items.length) return [] as string[];
    return Object.keys(items[0]);
  }, [items]);

  return (
    <div className="p-4 space-y-4">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}
      <h1 className="text-xl font-semibold">Dados da Declaração {id}</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-codigo">Código</label>
          <input id="filter-codigo" className="border rounded px-2 py-1" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-codigo-receita">Código Receita</label>
          <input id="filter-codigo-receita" className="border rounded px-2 py-1" value={codigoReceita} onChange={e => setCodigoReceita(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-valor-min">Valor min</label>
          <input id="filter-valor-min" className="border rounded px-2 py-1" value={valorMin} onChange={e => setValorMin(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-valor-max">Valor max</label>
          <input id="filter-valor-max" className="border rounded px-2 py-1" value={valorMax} onChange={e => setValorMax(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-data-inicio">Data início (dd/mm/yyyy)</label>
          <input id="filter-data-inicio" className="border rounded px-2 py-1" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-data-fim">Data fim (dd/mm/yyyy)</label>
          <input id="filter-data-fim" className="border rounded px-2 py-1" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm" htmlFor="filter-busca">Busca</label>
          <input id="filter-busca" className="border rounded px-2 py-1" value={search} onChange={e => setSearch(e.target.value)} placeholder="texto..." />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Ordenar por</label>
          <select className="border rounded px-2 py-1" value={orderBy} onChange={e => setOrderBy(e.target.value)}>
            <option value="linha">linha</option>
            <option value="valor">valor</option>
            <option value="codigo">codigo</option>
            <option value="codigo_receita">codigo_receita</option>
            <option value="dataOcorrencia">dataOcorrencia</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Ordem</label>
          <select className="border rounded px-2 py-1" value={order} onChange={e => setOrder(e.target.value as any)}>
            <option value="asc">asc</option>
            <option value="desc">desc</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setPage(1); fetchData(); }} className="px-3 py-2 rounded bg-blue-600 text-white">Filtrar</button>
          <button onClick={() => { setCodigo(''); setCodigoReceita(''); setValorMin(''); setValorMax(''); setDataInicio(''); setDataFim(''); setSearch(''); setOrderBy('linha'); setOrder('asc'); setPage(1); }} className="px-3 py-2 rounded border">Limpar</button>
          <button disabled={cleaning} onClick={cleanup} className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60">{cleaning ? 'Limpando...' : 'Limpar duplicados'}</button>
          <button onClick={runAnalysis} className="px-3 py-2 rounded bg-purple-600 text-white">Analisar</button>
          {analysis && (
            <>
              <button onClick={exportCSV} className="px-3 py-2 rounded border">Exportar CSV</button>
              <button onClick={exportPDF} className="px-3 py-2 rounded border">Exportar PDF</button>
            </>
          )}
        </div>
      </div>

      {loading && <div className="text-sm">Carregando...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-50">
              {columns.map(c => (
                <th key={c} className="text-left p-2 border-b">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {columns.map(c => (
                  <td key={c} className="p-2 border-b">{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <div>Total: {total}</div>
        <div className="ml-auto flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-2 py-1 border rounded disabled:opacity-60">Anterior</button>
          <span>Página {page}</span>
          <button disabled={(page * limit) >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-60">Próxima</button>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="border rounded px-2 py-1">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
      {showAnalysis && analysis && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40" onClick={() => setShowAnalysis(false)}>
          <div className="bg-white rounded shadow-lg max-w-5xl w-full p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Análise e Plano de Ação</h2>
              <button onClick={() => setShowAnalysis(false)} className="px-2 py-1 border rounded">Fechar</button>
            </div>
            <div className="text-sm text-gray-700 mb-2">
              Findings: {analysis.summary?.numFindings} — critical: {analysis.summary?.critical}, high: {analysis.summary?.high}, medium: {analysis.summary?.medium}, low: {analysis.summary?.low}
            </div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span>Filtrar severidade:</span>
              <select className="border rounded px-2 py-1" value={severityFilter} onChange={e => setSeverityFilter(e.target.value as any)}>
                <option value="all">Todas</option>
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border-b">Código</th>
                    <th className="text-left p-2 border-b">Severidade</th>
                    <th className="text-left p-2 border-b">Mensagem</th>
                    <th className="text-left p-2 border-b">Plano de Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis.findings||[])
                    .filter((f: any) => severityFilter === 'all' ? true : f.severity === severityFilter)
                    .map((f: any, i: number) => (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b">{f.code}</td>
                        <td className="p-2 border-b">
                          <span className={`inline-block px-2 py-1 text-xs border rounded ${severityClass(f.severity)}`}>{f.severity}</span>
                        </td>
                        <td className="p-2 border-b whitespace-pre-wrap">{f.message}</td>
                        <td className="p-2 border-b whitespace-pre-wrap">{f.actionPlan}</td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


