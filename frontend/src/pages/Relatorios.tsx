import React, { useEffect, useMemo, useState } from 'react';
import { useRelatorios } from '../hooks/useRelatorios';

const RelatoriosPage: React.FC = () => {
  const { items, load, loading, error, clearError } = useRelatorios();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [tipoRelatorio, setTipoRelatorio] = useState('');
  const [declaracaoId, setDeclaracaoId] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  useEffect(() => {
    load({ page, limit, tipoRelatorio: tipoRelatorio || undefined, declaracaoId: declaracaoId || undefined })
      .then(({ pagination }) => {
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const filtered = useMemo(() => items, [items]);
  const canGoNext = totalPages != null ? page < totalPages : filtered.length === limit;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Relatórios</h1>
        <div className="flex items-center gap-2">
          <input placeholder="Tipo de relatório" value={tipoRelatorio} onChange={(e) => setTipoRelatorio(e.target.value)} className="px-2 py-1 border rounded" />
          <input placeholder="Declaração ID" value={declaracaoId} onChange={(e) => setDeclaracaoId(e.target.value)} className="px-2 py-1 border rounded" />
          <button
            onClick={() => {
              setPage(1);
              load({ page: 1, limit, tipoRelatorio: tipoRelatorio || undefined, declaracaoId: declaracaoId || undefined })
                .then(({ pagination }) => {
                  setTotal(pagination?.total ?? null);
                  setTotalPages(pagination?.totalPages ?? null);
                })
                .catch(() => {});
            }}
            className="px-3 py-2 bg-gray-100 rounded"
          >
            Buscar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded mb-4">
          {error}
          <button onClick={clearError} className="ml-3 underline">fechar</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {total != null && totalPages != null ? `Página ${page} de ${totalPages} — Total: ${total}` : `Total exibido: ${filtered.length}`}
        </div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">Anterior</button>
          <span className="text-sm">Página {page}{totalPages != null ? ` de ${totalPages}` : ''}</span>
          <button disabled={!canGoNext} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">Próxima</button>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="ml-2 px-2 py-1 border rounded">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Declaração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.titulo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.tipoRelatorio}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.declaracaoId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {r.arquivoPdf ? (
                    <a
                      href={r.arquivoPdf}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Baixar PDF
                    </a>
                  ) : (
                    <button disabled className="text-gray-400 cursor-not-allowed">Sem PDF</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RelatoriosPage;
