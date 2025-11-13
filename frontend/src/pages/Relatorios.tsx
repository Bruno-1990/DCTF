import React, { useEffect, useMemo, useState } from 'react';
import { useRelatorios } from '../hooks/useRelatorios';
import { relatoriosService } from '../services/relatorios';

const RelatoriosPage: React.FC = () => {
  const { items, load, loading, error, clearError } = useRelatorios();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [tipoRelatorio, setTipoRelatorio] = useState('');
  const [declaracaoId, setDeclaracaoId] = useState('');
  const [identification, setIdentification] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [generatingTarget, setGeneratingTarget] = useState<string | null>(null);

  const fetchData = (params: { page: number; limit: number }) =>
    load({
      ...params,
      tipoRelatorio: tipoRelatorio || undefined,
      declaracaoId: declaracaoId || undefined,
      identification: identification || undefined,
      period: periodFilter || undefined,
    })
      .then(({ pagination }) => {
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
      })
      .catch(() => {});

  useEffect(() => {
    fetchData({ page, limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const filtered = useMemo(() => items, [items]);
  const canGoNext = totalPages != null ? page < totalPages : filtered.length === limit;

  const handleDownload = async (id: string, titulo: string, formato: 'pdf' | 'xlsx' = 'pdf') => {
    try {
      const blob = await relatoriosService.downloadHistory(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = titulo.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'relatorio';
      link.href = url;
      link.download = `${safeTitle}.${formato}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar relatório do histórico:', err);
    }
  };

  const handleGenerate = async (reportType: 'gerencial' | 'clientes' | 'dctf' | 'conferencia', format: 'pdf' | 'xlsx') => {
    try {
      setGeneratingTarget(`${reportType}-${format}`);
      const blob = await relatoriosService.generateAndDownload({ reportType, format });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = `${reportType}-report`.replace(/[^a-zA-Z0-9-_]+/g, '_');
      link.href = url;
      link.download = `${safeTitle}_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      await fetchData({ page: 1, limit });
      setPage(1);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
    } finally {
      setGeneratingTarget(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Relatórios</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[
          { key: 'gerencial', title: 'Relatório Gerencial', description: 'Visão consolidada das DCTFs monitoradas.' },
          { key: 'conferencia', title: 'Relatório de Conferências', description: 'Pendências legais e conferência de prazos.' },
          { key: 'clientes', title: 'Relatório de Clientes', description: 'Resumo por contribuinte com saldos e status.' },
          { key: 'dctf', title: 'Relatório DCTF', description: 'Lista detalhada das declarações transmitidas.' },
        ].map(card => (
          <div key={card.key} className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex flex-col gap-3 items-center justify-center text-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 text-center">{card.title}</h2>
              <p className="text-sm text-gray-500 text-center mt-2">{card.description}</p>
            </div>
            <div className="flex gap-3 justify-center w-full">
              <button
                onClick={() => handleGenerate(card.key as any, 'xlsx')}
                disabled={generatingTarget === `${card.key}-xlsx`}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-center"
              >
                {generatingTarget === `${card.key}-xlsx` ? 'Gerando…' : 'Gerar XLSX'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <label className="flex flex-col text-sm text-gray-600">
            Tipo de relatório
            <input
              placeholder="Gerencial, Clientes..."
              value={tipoRelatorio}
              onChange={(e) => setTipoRelatorio(e.target.value)}
              className="mt-1 px-2 py-1 border rounded"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-600">
            Declaração ID
            <input
              placeholder="ID da declaração"
              value={declaracaoId}
              onChange={(e) => setDeclaracaoId(e.target.value)}
              className="mt-1 px-2 py-1 border rounded"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-600">
            Identificação / CNPJ
            <input
              placeholder="00.111.222/0001-33"
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
              className="mt-1 px-2 py-1 border rounded"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-600">
            Competência
            <input
              placeholder="MM/AAAA"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="mt-1 px-2 py-1 border rounded"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => {
                setPage(1);
                fetchData({ page: 1, limit });
              }}
              className="w-full px-3 py-2 bg-gray-100 rounded"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded mb-4">
          {error}
          <button onClick={clearError} className="ml-3 underline">
            fechar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {loading ? 'Carregando…' : total != null && totalPages != null ? `Página ${page} de ${totalPages} — Total: ${total}` : `Total exibido: ${filtered.length}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm">
            Página {page}
            {totalPages != null ? ` de ${totalPages}` : ''}
          </span>
          <button
            disabled={!canGoNext}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            Próxima
          </button>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formato</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Declaração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex flex-col">
                    <span>{r.titulo}</span>
                    {r.notes && <span className="text-xs text-gray-500">{r.notes}</span>}
                    {r.period && <span className="text-xs text-gray-500">Competência: {r.period}</span>}
                    {r.responsible && <span className="text-xs text-gray-500">Responsável: {r.responsible}</span>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.tipoRelatorio}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.formato?.toUpperCase() ?? (r.arquivoPdf ? 'PDF' : '—')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.declaracaoId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm flex flex-col md:flex-row md:items-center md:gap-3 gap-2">
                  {r.downloadUrl ? (
                    <button
                      onClick={() => handleDownload(r.id, r.titulo, r.formato ?? 'pdf')}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Baixar {r.formato?.toUpperCase() ?? 'PDF'}
                    </button>
                  ) : null}
                  {r.arquivoPdf && !r.downloadUrl ? (
                    <a href={r.arquivoPdf} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      Baixar PDF
                    </a>
                  ) : null}
                  {r.arquivoXlsx ? (
                    <a href={r.arquivoXlsx} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      Baixar XLSX
                    </a>
                  ) : null}
                  {!r.downloadUrl && !r.arquivoPdf && !r.arquivoXlsx ? (
                    <span className="text-gray-400">Sem arquivo</span>
                  ) : null}
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
