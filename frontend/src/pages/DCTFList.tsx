import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../components/Pagination';

type Dctf = {
  id: string;
  clienteId: string;
  periodo: string;
  dataDeclaracao?: string;
  status: string;
  arquivoOriginal?: string;
};

type ApiList<T> = {
  success: boolean;
  data?: T[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
};

export default function DCTFList() {
  const [items, setItems] = useState<Dctf[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [status, setStatus] = useState('');
  const [orderBy, setOrderBy] = useState<'periodo' | 'status' | 'dataDeclaracao'>('periodo');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (clienteId) p.set('clienteId', clienteId);
    if (periodo) p.set('periodo', periodo);
    if (status) p.set('status', status);
    p.set('orderBy', orderBy);
    p.set('order', order);
    return p.toString();
  }, [page, limit, clienteId, periodo, status, orderBy, order]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dctf?${qs}`);
      const json: ApiList<Dctf> = await res.json();
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
  }, [qs]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Declarações DCTF</h1>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-sm">Cliente ID</label>
          <input className="border rounded px-2 py-1" value={clienteId} onChange={e => setClienteId(e.target.value)} placeholder="UUID" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Período (YYYY-MM)</label>
          <input className="border rounded px-2 py-1" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2024-01" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Status</label>
          <input className="border rounded px-2 py-1" value={status} onChange={e => setStatus(e.target.value)} placeholder="pendente/processando/..." />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <label className="text-sm">Ordenar por</label>
            <select className="border rounded px-2 py-1" value={orderBy} onChange={e => setOrderBy(e.target.value as any)}>
              <option value="periodo">período</option>
              <option value="status">status</option>
              <option value="dataDeclaracao">data</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Ordem</label>
            <select className="border rounded px-2 py-1" value={order} onChange={e => setOrder(e.target.value as any)}>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setPage(1); fetchList(); }} className="px-3 py-2 rounded bg-blue-600 text-white">Filtrar</button>
          <button onClick={() => { setClienteId(''); setPeriodo(''); setStatus(''); setPage(1); }} className="px-3 py-2 rounded border">Limpar</button>
        </div>
      </div>

      {loading && <div className="text-sm">Carregando...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border-b">ID</th>
              <th className="text-left p-2 border-b">Cliente</th>
              <th className="text-left p-2 border-b">Período</th>
              <th className="text-left p-2 border-b">Data</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{d.id}</td>
                <td className="p-2 border-b">{d.clienteId}</td>
                <td className="p-2 border-b">{d.periodo}</td>
                <td className="p-2 border-b">{d.dataDeclaracao || '-'}</td>
                <td className="p-2 border-b">{d.status}</td>
                <td className="p-2 border-b space-x-2">
                  <Link to={`/dctf/${d.id}/dados`} className="text-blue-600 underline">Ver dados</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 && total > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Total: {total} declarações</div>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(total / limit)}
            totalItems={total}
            itemsPerPage={limit}
            onPageChange={setPage}
            itemLabel="declaração"
          />
        </>
      )}
    </div>
  );
}


