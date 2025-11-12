import React, { useEffect, useState } from 'react';
import { useDCTF } from '../hooks/useDCTF';
import { dctfService } from '../services/dctf';

const formatCNPJ = (cnpj: string | undefined) => {
  if (!cnpj) return '-';
  const v = cnpj.replace(/\D/g, '').slice(0, 14);
  return v
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const DCTFPage: React.FC = () => {
  const { items, load } = useDCTF();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [situacao, setSituacao] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [lastPageCount, setLastPageCount] = useState<number>(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dadosMap, setDadosMap] = useState<Map<string, any[]>>(new Map());
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const params: Record<string, any> = {
      page,
      limit,
      situacao: situacao || undefined,
    };
    if (orderBy) {
      params.orderBy = orderBy;
      params.order = orderDirection;
    }

    load(params)
      .then(({ items, pagination }) => {
        setLastPageCount(items.length);
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
      })
      .catch(() => {});
  }, [page, limit, orderBy, orderDirection, situacao, load]);

  const situacaoOptions: Array<{ value: string; label: string }> = [
    { value: 'Ativa', label: 'Ativa' },
    { value: 'Em andamento', label: 'Em andamento' },
  ];

  const canGoNext = totalPages != null ? page < totalPages : lastPageCount === limit;

  const handleToggleExpand = async (dctfId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(dctfId)) {
      newExpanded.delete(dctfId);
    } else {
      newExpanded.add(dctfId);
      // Buscar dados se ainda não foram carregados
      if (!dadosMap.has(dctfId)) {
        try {
          const dados = await dctfService.getDadosByDeclaracao(dctfId);
          setDadosMap(prev => new Map(prev.set(dctfId, dados)));
        } catch (err) {
          console.error('Erro ao carregar dados da declaração:', err);
        }
      }
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (valor?: number | string | null) => {
    if (valor === null || valor === undefined) {
      return '0,00';
    }
    const numero = typeof valor === 'number' ? valor : Number(valor);
    if (Number.isNaN(numero)) {
      return '0,00';
    }
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSort = (field: string) => {
    setPage(1);
    setOrderBy((prev) => {
      if (prev === field) {
        setOrderDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setOrderDirection('asc');
      return field;
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">DCTF</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="situacao" className="text-sm text-gray-600">Situação:</label>
          <select
            id="situacao"
            value={situacao}
            onChange={(e) => {
              setSituacao(e.target.value);
              setPage(1);
            }}
            className="px-2 py-1 border rounded"
          >
            <option value="">Todos</option>
            {situacaoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('razaoSocial')} className="flex items-center gap-1">
                  Razão Social {orderBy === 'razaoSocial' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('cnpj')} className="flex items-center gap-1">
                  CNPJ {orderBy === 'cnpj' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('periodo')} className="flex items-center gap-1">
                  Período {orderBy === 'periodo' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('situacao')} className="flex items-center gap-1">
                  Situação {orderBy === 'situacao' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('debitoApurado')} className="flex items-center gap-1">
                  Débito Apurado {orderBy === 'debitoApurado' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort('saldoAPagar')} className="flex items-center gap-1">
                  Saldo a Pagar {orderBy === 'saldoAPagar' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((d) => {
              const dados = dadosMap.get(d.id) || [];
              const isExpanded = expandedRows.has(d.id);
              
              return (
                <React.Fragment key={d.id}>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{d.cliente?.razao_social || d.cliente?.nome || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCNPJ(d.cliente?.cnpj_limpo || d.cliente?.cnpj)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.periodo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(d.dataDeclaracao).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.situacao || d.status || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">R$ {formatCurrency(d.debitoApurado)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">R$ {formatCurrency(d.saldoAPagar)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button 
                        onClick={() => handleToggleExpand(d.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {isExpanded ? 'Recolher' : 'Expandir'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900 mb-2">Detalhes da Declaração</h4>
                          {dados.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Linha</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Código</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Descrição</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Valor</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Data Ocorrência</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {dados.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="px-4 py-2 text-sm text-gray-900">{item.linha || '-'}</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{item.codigo || '-'}</td>
                                      <td className="px-4 py-2 text-sm text-gray-700">{item.descricao || '-'}</td>
                                      <td className="px-4 py-2 text-sm font-medium text-gray-900">R$ {item.valor ? Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}</td>
                                      <td className="px-4 py-2 text-sm text-gray-700">{item.data_ocorrencia ? new Date(item.data_ocorrencia).toLocaleDateString('pt-BR') : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic">Carregando dados...</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-center mt-8 mb-6">
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50 hover:bg-gray-200">Anterior</button>
          <span className="text-sm px-4">{page}{totalPages != null ? ` de ${totalPages}` : ''}</span>
          <button disabled={!canGoNext} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50 hover:bg-gray-200">Próxima</button>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="ml-4 px-3 py-2 border rounded">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
        <div className="text-sm text-gray-600 mt-2">
          {total != null && totalPages != null
            ? `Total: ${total} declarações`
            : `Mostrando ${items.length} declarações`}
        </div>
      </div>
    </div>
  );
};

export default DCTFPage;
