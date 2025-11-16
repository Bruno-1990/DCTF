import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDCTF } from '../hooks/useDCTF';
import { Pagination } from '../components/Pagination';

const formatCNPJ = (cnpj: string | undefined) => {
  if (!cnpj) return '-';
  const v = cnpj.replace(/\D/g, '').slice(0, 14);
  return v
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const formatCPF = (cpf: string | undefined) => {
  if (!cpf) return '-';
  const v = cpf.replace(/\D/g, '').slice(0, 11);
  return v
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatIdentification = (value?: string | null) => {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) return formatCNPJ(digits);
  if (digits.length === 11) return formatCPF(digits);
  return value;
};

const formatPeriod = (period?: string | null) => {
  if (!period) return '—';
  if (period.includes('-')) {
    const [year, month] = period.split('-');
    if (year && month) {
      return `${month.padStart(2, '0')}/${year}`;
    }
  }
  if (period.includes('/')) {
    const parts = period.split('/');
    if (parts.length === 2 && parts[1].length === 4) {
      return `${parts[0].padStart(2, '0')}/${parts[1]}`;
    }
  }
  return period;
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getSituacaoBadgeClasses = (situacao?: string | null) => {
  const value = situacao?.toLowerCase();
  if (value === 'ativa' || value === 'concluido' || value === 'concluída' || value === 'concluida') {
    return 'bg-green-100 text-green-700 border-green-200';
  }
  if (value === 'em andamento' || value === 'processando') {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (value === 'erro' || value === 'com erro') {
    return 'bg-red-100 text-red-700 border-red-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const limitOptions = ['10', '20', '50', '100', '200'] as const;

const DCTFPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { items, load } = useDCTF();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [limitSelection, setLimitSelection] =
    useState<(typeof limitOptions)[number] | 'all'>('10');
  const [situacao, setSituacao] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get('search') || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Ler parâmetro de busca da URL ao carregar a página (vindo do Dashboard)
  useEffect(() => {
    const searchFromUrl = searchParams.get('search');
    if (searchFromUrl) {
      setSearchTerm(searchFromUrl);
    }
  }, [searchParams]);

  // Debounce do termo de busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1); // Reset página quando o termo de busca muda
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const params: Record<string, any> = {
      page,
      limit,
      situacao: situacao || undefined,
    };
    
    // Adicionar search apenas se houver valor
    if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
      params.search = debouncedSearchTerm.trim();
    }
    
    // Se houver filtro e não houver ordenação manual, ordenar por data de transmissão (mais recentes primeiro)
    const hasFilter = (situacao && situacao !== 'Todos') || (debouncedSearchTerm && debouncedSearchTerm.trim());
    if (hasFilter && !orderBy) {
      params.orderBy = 'dataTransmissao';
      params.order = 'desc';
    } else if (orderBy) {
      params.orderBy = orderBy;
      params.order = orderDirection;
    }

    load(params)
      .then(({ items, pagination, lastUpdate }) => {
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
        if (lastUpdate) {
          setLastUpdate(new Date(lastUpdate));
        }
      })
      .catch(() => {});
  }, [page, limit, orderBy, orderDirection, situacao, debouncedSearchTerm, load]);

  const situacaoOptions: Array<{ value: string; label: string }> = [
    { value: 'Ativa', label: 'Ativa' },
    { value: 'Em andamento', label: 'Em andamento' },
  ];


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

  const handleLimitChange = (value: (typeof limitOptions)[number] | 'all') => {
    setPage(1);
    if (value === 'all') {
      setLimit(1000);
      setLimitSelection('all');
    } else {
      setLimit(Number(value));
      setLimitSelection(value);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 py-8">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-gray-900">DCTF</h1>
            {lastUpdate && (
              <p className="text-xs text-gray-500">
                Última atualização: {formatDateTime(lastUpdate)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="situacao" className="text-xs text-gray-600">Situação:</label>
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
        <div className="flex items-center gap-2">
          <input
            type="text"
            id="search"
            placeholder="CNPJ"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-auto mb-8">
        <table className="min-w-[1200px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 tracking-wide text-xs font-medium text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('cnpj')} className="flex items-center gap-1 uppercase">
                  NÚMERO DE IDENTIFICAÇÃO {orderBy === 'cnpj' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('periodo')} className="flex items-center gap-1 uppercase">
                  PERÍODO DE APURAÇÃO {orderBy === 'periodo' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('dataDeclaracao')} className="flex items-center gap-1 uppercase">
                  DATA TRANSMISSÃO {orderBy === 'dataDeclaracao' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="uppercase block">CATEGORIA</span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="uppercase block">ORIGEM</span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="uppercase block">TIPO</span>
              </th>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('situacao')} className="flex items-center gap-1 uppercase">
                  SITUAÇÃO {orderBy === 'situacao' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('debitoApurado')} className="flex items-center gap-1 uppercase">
                  DÉBITO APURADO {orderBy === 'debitoApurado' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => handleSort('saldoAPagar')} className="flex items-center gap-1 uppercase">
                  SALDO A PAGAR {orderBy === 'saldoAPagar' && <span>{orderDirection === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((d) => {
              const numeroIdentificacao =
                d.numeroIdentificacao ||
                d.cliente?.cnpj ||
                d.cliente?.cnpj_limpo ||
                undefined;
              const numeroLimpo = numeroIdentificacao?.replace(/\D/g, '');
              let tipoNi =
                d.tipoNi ||
                (numeroLimpo
                  ? numeroLimpo.length === 11
                    ? 'CPF'
                    : 'CNPJ'
                  : undefined);
              tipoNi = tipoNi ? tipoNi.toUpperCase() : undefined;
              const situacaoLabel = d.situacao || d.status || '—';
              const saldoValue = d.saldoAPagar ?? 0;
              const saldoClass =
                saldoValue > 0 ? 'text-red-600 font-semibold' : saldoValue < 0 ? 'text-emerald-600 font-semibold' : 'text-slate-700';

              return (
                  <tr key={d.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      <div className="flex flex-col gap-1">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {formatIdentification(numeroIdentificacao)}
                          </span>
                          {tipoNi && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 border border-slate-200">
                              {tipoNi}
                            </span>
                          )}
                        </div>
                        {d.cliente?.razao_social && (
                          <span className="text-xs uppercase text-slate-500">
                            {d.cliente.razao_social}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {formatPeriod(d.periodoApuracao || d.periodo)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {formatDateTime(d.dataTransmissao || d.dataDeclaracao)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      {d.categoria || 'Geral'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      {d.origem || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      {d.tipoDeclaracao || 'Original'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${getSituacaoBadgeClasses(
                          situacaoLabel,
                        )}`}
                      >
                        {situacaoLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-700">
                      R$ {formatCurrency(d.debitoApurado)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-xs ${saldoClass}`}>
                      R$ {formatCurrency(d.saldoAPagar)}
                    </td>
                  </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              {total != null && totalPages != null
                ? `Total: ${total} declarações`
                : `Mostrando ${items.length} declarações`}
            </div>
            <select
              value={limitSelection}
              onChange={(e) => handleLimitChange(e.target.value as typeof limitSelection)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {limitOptions.map((value) => (
                <option key={value} value={value}>
                  {value} por página
                </option>
              ))}
              <option value="all">Todos</option>
            </select>
          </div>
          {totalPages != null && total != null && limitSelection !== 'all' && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={limit}
              onPageChange={setPage}
              itemLabel="declaração"
            />
          )}
        </>
      )}
    </div>
  );
};

export default DCTFPage;
