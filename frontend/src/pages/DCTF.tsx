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
  const [tipo, setTipo] = useState('');
  const [periodoTransmissao, setPeriodoTransmissao] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get('search') || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([]);
  const [periodosTransmissaoDisponiveis, setPeriodosTransmissaoDisponiveis] = useState<string[]>([]);
  const [mostrarTodosComProcuracao, setMostrarTodosComProcuracao] = useState(false);

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
      tipo: tipo || undefined,
      periodoTransmissao: periodoTransmissao || undefined,
    };
    
    // Adicionar search apenas se houver valor
    if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
      params.search = debouncedSearchTerm.trim();
    }
    
    // Se houver filtro e não houver ordenação manual, ordenar por data de transmissão (mais recentes primeiro)
    const hasFilter = (situacao && situacao !== 'Todos') || (tipo && tipo !== 'Todos') || (periodoTransmissao && periodoTransmissao !== '') || (debouncedSearchTerm && debouncedSearchTerm.trim());
    if (hasFilter && !orderBy) {
      params.orderBy = 'dataTransmissao';
      params.order = 'desc';
    } else if (orderBy) {
      params.orderBy = orderBy;
      params.order = orderDirection;
    }

    console.log('[DCTF Page] Carregando com params:', params);

    load(params)
      .then(({ items, pagination, lastUpdate, tiposDisponiveis, periodosTransmissaoDisponiveis }) => {
        setTotal(pagination?.total ?? null);
        setTotalPages(pagination?.totalPages ?? null);
        if (lastUpdate) {
          setLastUpdate(new Date(lastUpdate));
        }
        if (tiposDisponiveis && Array.isArray(tiposDisponiveis)) {
          setTiposDisponiveis(tiposDisponiveis);
        }
        if (periodosTransmissaoDisponiveis && Array.isArray(periodosTransmissaoDisponiveis)) {
          console.log('[DCTF Page] Períodos disponíveis recebidos:', periodosTransmissaoDisponiveis);
          setPeriodosTransmissaoDisponiveis(periodosTransmissaoDisponiveis);
        }
      })
      .catch(() => {});
  }, [page, limit, orderBy, orderDirection, situacao, tipo, periodoTransmissao, debouncedSearchTerm, load]);

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
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10"></div>
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-3">DCTF</h1>
            <p className="text-blue-100 text-lg">Declaração de Débitos e Créditos Tributários Federais - Gestão completa de transmissões</p>
            {lastUpdate && (
              <p className="text-blue-100 text-sm mt-2">
                Última atualização: {formatDateTime(lastUpdate)}
              </p>
            )}
          </div>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-48 h-48 bg-white opacity-5 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6 backdrop-blur-sm bg-opacity-95">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* Campo de Busca */}
          <div className="flex-1 max-w-md w-full">
            <div className="relative group">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                id="search"
                placeholder="Buscar Cliente"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white focus:bg-white shadow-sm hover:shadow-md"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  title="Limpar busca"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Filtro Situação */}
          <div className="w-full md:w-48">
            <div className="relative">
              <select
                id="situacao"
                value={situacao}
                onChange={(e) => {
                  setSituacao(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md appearance-none cursor-pointer font-medium text-gray-700 hover:border-blue-300"
              >
                <option value="">⚡ Situação</option>
                {situacaoOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Filtro Tipo */}
          <div className="w-full md:w-48">
            <div className="relative">
              <select
                id="tipo"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md appearance-none cursor-pointer font-medium text-gray-700 hover:border-indigo-300"
              >
                <option value="">📋 Tipo</option>
                {tiposDisponiveis.map((tipoOption) => (
                  <option key={tipoOption} value={tipoOption}>{tipoOption}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Filtro Período de Transmissão */}
          <div className="w-full md:w-56">
            <div className="relative">
              <select
                id="periodoTransmissao"
                value={periodoTransmissao}
                onChange={(e) => {
                  const valor = e.target.value;
                  console.log('[DCTF Page] Período de transmissão selecionado:', valor);
                  setPeriodoTransmissao(valor);
                  setPage(1);
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md appearance-none cursor-pointer font-medium text-gray-700 hover:border-purple-300"
              >
                <option value="">📅 Transmissão</option>
                {periodosTransmissaoDisponiveis.map((periodo) => {
                  // Converter YYYY-MM para MM/YYYY
                  const [ano, mes] = periodo.split('-');
                  const periodoFormatado = `${mes}/${ano}`;
                  return (
                    <option key={periodo} value={periodo}>{periodoFormatado}</option>
                  );
                })}
              </select>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Checkbox "Todos com procuração" */}
        <div className="flex items-center mt-4 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={mostrarTodosComProcuracao}
                onChange={(e) => {
                  setMostrarTodosComProcuracao(e.target.checked);
                  setPage(1);
                }}
                className="w-5 h-5 text-blue-600 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-all duration-200 checked:bg-blue-600 checked:border-blue-600"
              />
            </div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors select-none">
              Todos com procuração
            </span>
            <span className="text-xs text-gray-500 italic">
              (Desmarcado: apenas clientes com Razão Social e CNPJ)
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-auto mb-8">
        <table className="w-full min-w-[1100px] divide-y divide-gray-200">
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
            {items
              .filter((d) => {
                if (mostrarTodosComProcuracao) return true;
                const temRazaoSocial = d.cliente?.razao_social && d.cliente.razao_social.trim() !== '';
                const numeroIdentificacao =
                  d.numeroIdentificacao ||
                  d.cnpj ||
                  d.cliente?.cnpj ||
                  d.cliente?.cnpj_limpo ||
                  undefined;
                const temCNPJ = numeroIdentificacao && numeroIdentificacao.replace(/\D/g, '').length === 14;
                return temRazaoSocial && temCNPJ;
              })
              .map((d) => {
              const numeroIdentificacao =
                d.numeroIdentificacao ||
                d.cnpj || // Campo cnpj direto do registro
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
