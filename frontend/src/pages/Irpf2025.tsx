import React, { useState, useEffect } from 'react';
import { useClientes } from '../hooks/useClientes';
import { irpfService, type FaturamentoAnual } from '../services/irpf';
import type { Cliente } from '../types';
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const Irpf2025: React.FC = () => {
  const { loadClientes } = useClientes();
  const [todosClientes, setTodosClientes] = useState<Cliente[]>([]);
  const [clientesComDados, setClientesComDados] = useState<
    Map<
      string,
      {
        cliente: Cliente;
        faturamento: FaturamentoAnual[];
        loadingFaturamento: boolean;
        errorFaturamento?: string;
        carregado: boolean;
      }
    >
  >(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [anoAtual] = useState(new Date().getFullYear());
  const [carregandoTodos, setCarregandoTodos] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const carregandoRef = React.useRef(false);
  
  // Sempre os últimos 2 anos completos (ex: 2024 e 2025 se estamos em 2026)
  const anosParaBuscar = [anoAtual - 2, anoAtual - 1];

  // Carregar todos os clientes de uma vez (como na aba participação)
  useEffect(() => {
    if (carregandoRef.current) return;
    if (todosClientes.length > 0) return; // Já carregou
    
    carregandoRef.current = true;
    setLoadingClientes(true);

    const carregarTodosClientes = async () => {
      try {
        const todosClientesArray: Cliente[] = [];
        let pagina = 1;
        let temMais = true;

        while (temMais) {
          const resultado = await loadClientes({
            page: pagina,
            limit: 100, // Máximo permitido pelo backend
            search: '',
          });

          todosClientesArray.push(...resultado.items);
          
          if (resultado.pagination) {
            temMais = pagina < resultado.pagination.totalPages;
            pagina++;
          } else {
            temMais = resultado.items.length === 100; // Se retornou 100, pode ter mais
            pagina++;
          }

          // Delay menor para ser mais rápido
          if (temMais) {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        }

        // Só atualizar estados quando TODOS os clientes estiverem carregados
        // Isso garante que a lista apareça de uma vez (como na participação)
        setTodosClientes(todosClientesArray);
        inicializarClientes(todosClientesArray);
      } catch (error: any) {
        console.error('Erro ao carregar clientes:', error);
      } finally {
        setLoadingClientes(false);
        carregandoRef.current = false;
      }
    };

    carregarTodosClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inicializarClientes = (clientesList: Cliente[]) => {
    const clientesComCodigoSCI = clientesList.filter(
      (c) => c.codigo_sci && !isNaN(Number(c.codigo_sci))
    );

    setClientesComDados((prev) => {
      const novoMap = new Map(prev);
      
      clientesComCodigoSCI.forEach((cliente) => {
        // Só adicionar se ainda não existe no map
        if (!novoMap.has(cliente.id)) {
          novoMap.set(cliente.id, {
            cliente,
            faturamento: [],
            loadingFaturamento: false,
            carregado: false,
          });
        }
        // Se já existe, manter os dados existentes (incluindo faturamento carregado)
      });

      return novoMap;
    });
  };

  const carregarFaturamentoCliente = async (clienteId: string, forcarAtualizacao: boolean = false) => {
    const item = clientesComDados.get(clienteId);
    if (!item) return;

    // Se já está carregando, não fazer nada
    if (item.loadingFaturamento) return;

    const codigoSci = Number(item.cliente.codigo_sci);
    if (!codigoSci) return;

    // Atualizar estado para loading
    setClientesComDados((prev) => {
      const novo = new Map(prev);
      const atual = novo.get(clienteId);
      if (atual) {
        novo.set(clienteId, { 
          ...atual, 
          loadingFaturamento: true,
          errorFaturamento: undefined, // Limpar erro anterior
        });
      }
      return novo;
    });

    try {
      let faturamento: FaturamentoAnual[];
      
      console.log(`[IRPF Frontend] Carregando faturamento para cliente ${clienteId}, forcarAtualizacao: ${forcarAtualizacao}`);
      
      if (forcarAtualizacao) {
        // Forçar atualização do cache - retorna os dados atualizados diretamente
        faturamento = await irpfService.atualizarCache(
          item.cliente.id,
          anosParaBuscar
        );
        console.log(`[IRPF Frontend] Faturamento atualizado:`, faturamento);
      } else {
        // Buscar normalmente (com cache)
        faturamento = await irpfService.buscarFaturamentoCliente(
          item.cliente.id,
          anosParaBuscar
        );
        console.log(`[IRPF Frontend] Faturamento do cache:`, faturamento);
      }

      console.log(`[IRPF Frontend] Faturamento recebido (${faturamento.length} anos):`, JSON.stringify(faturamento, null, 2));

      // Garantir que sempre temos os 2 anos, preenchendo com zeros se necessário
      const faturamentoCompleto = anosParaBuscar.map((ano) => {
        const encontrado = faturamento.find((f) => f.ano === ano);
        return encontrado || {
          ano,
          valorTotal: 0,
          mediaMensal: 0,
          meses: [],
        };
      });

      setClientesComDados((prev) => {
        const novo = new Map(prev);
        const atual = novo.get(clienteId);
        if (atual) {
          novo.set(clienteId, {
            ...atual,
            faturamento: faturamentoCompleto,
            loadingFaturamento: false,
            carregado: true,
            errorFaturamento: undefined,
          });
        }
        return novo;
      });
    } catch (error: any) {
      console.error(
        `Erro ao buscar faturamento para cliente ${clienteId}:`,
        error
      );
      setClientesComDados((prev) => {
        const novo = new Map(prev);
        const atual = novo.get(clienteId);
        if (atual) {
          novo.set(clienteId, {
            ...atual,
            loadingFaturamento: false,
            errorFaturamento:
              error.message || 'Erro ao buscar faturamento do SCI',
            carregado: true,
          });
        }
        return novo;
      });
    }
  };

  // Carregar faturamento em lotes (batch) para não sobrecarregar
  const carregarTodosFaturamentos = async () => {
    const clientesParaCarregar = Array.from(clientesComDados.values()).filter(
      (item) => !item.carregado && !item.loadingFaturamento
    );

    if (clientesParaCarregar.length === 0) return;

    setCarregandoTodos(true);

    // Processar em lotes de 3 clientes por vez para não sobrecarregar
    const batchSize = 3;
    for (let i = 0; i < clientesParaCarregar.length; i += batchSize) {
      const batch = clientesParaCarregar.slice(i, i + batchSize);
      await Promise.all(
        batch.map((item) => carregarFaturamentoCliente(item.cliente.id))
      );
      // Pequeno delay entre lotes para não sobrecarregar o servidor
      if (i + batchSize < clientesParaCarregar.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setCarregandoTodos(false);
  };

  const formatarCNPJ = (cnpj?: string) => {
    if (!cnpj) return '-';
    const limpo = cnpj.replace(/\D/g, '');
    return limpo.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  };

  const formatarMoeda = (valor: number | string | null | undefined) => {
    if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
    
    // Converter string para número, removendo formatação se necessário
    let num: number;
    if (typeof valor === 'string') {
      // Remove espaços, pontos de milhar e substitui vírgula por ponto
      const limpo = valor.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      num = parseFloat(limpo);
    } else {
      num = valor;
    }
    
    if (isNaN(num) || num === 0) return 'R$ 0,00';
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatarPercentual = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined) return '0,00%';
    return `${valor.toFixed(2)}%`;
  };

  const clientesFiltrados = Array.from(clientesComDados.values()).filter(
    (item) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const cnpj = item.cliente.cnpj?.toLowerCase() || '';
      const razaoSocial =
        item.cliente.razao_social?.toLowerCase() ||
        item.cliente.nome?.toLowerCase() ||
        '';
      return cnpj.includes(term) || razaoSocial.includes(term);
    }
  );

  const clientesComCodigoSCI = clientesFiltrados.length;
  const clientesCarregados = clientesFiltrados.filter((item) => item.carregado)
    .length;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <ChartBarIcon className="h-8 w-8 text-blue-600" />
          IRPF 2025
        </h1>
        <p className="text-gray-600">
          Dados para declaração de Imposto de Renda Pessoa Física 2025
        </p>
      </div>

      {/* Busca e Controles */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por CNPJ ou Razão Social..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={async () => {
              setCarregandoTodos(true);
              try {
                // Buscar apenas do cache para todos os clientes
                const promises = Array.from(clientesComDados.keys()).map((clienteId) =>
                  irpfService.buscarApenasCache(clienteId, anosParaBuscar)
                    .then((faturamento) => {
                      // Garantir que sempre temos os 2 anos, preenchendo com zeros se necessário
                      const faturamentoCompleto = anosParaBuscar.map((ano) => {
                        const encontrado = faturamento.find((f) => f.ano === ano);
                        return encontrado || {
                          ano,
                          valorTotal: 0,
                          mediaMensal: 0,
                          meses: [],
                        };
                      });
                      
                      setClientesComDados((prev) => {
                        const novo = new Map(prev);
                        const atual = novo.get(clienteId);
                        if (atual) {
                          novo.set(clienteId, {
                            ...atual,
                            faturamento: faturamentoCompleto,
                            carregado: true,
                            loadingFaturamento: false,
                            errorFaturamento: undefined,
                          });
                        }
                        return novo;
                      });
                    })
                    .catch((error) => {
                      console.error(`Erro ao buscar cache para ${clienteId}:`, error);
                      setClientesComDados((prev) => {
                        const novo = new Map(prev);
                        const atual = novo.get(clienteId);
                        if (atual) {
                          novo.set(clienteId, {
                            ...atual,
                            carregado: false,
                            loadingFaturamento: false,
                            errorFaturamento: 'Dados não encontrados no cache',
                          });
                        }
                        return novo;
                      });
                    })
                );
                await Promise.all(promises);
              } catch (error: any) {
                console.error('Erro ao atualizar todos:', error);
              } finally {
                setCarregandoTodos(false);
              }
            }}
            disabled={carregandoTodos || loadingClientes}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Buscar faturamento de todos os clientes do cache (sem consultar SCI)"
          >
            <ArrowPathIcon className={`h-4 w-4 ${carregandoTodos ? 'animate-spin' : ''}`} />
            Atualizar Todos (Cache)
          </button>
        </div>
        {clientesComCodigoSCI > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{clientesComCodigoSCI}</span> cliente
              {clientesComCodigoSCI !== 1 ? 's' : ''} com código SCI
              {clientesCarregados > 0 && (
                <span className="text-blue-600 ml-2">
                  ({clientesCarregados} com faturamento carregado)
                </span>
              )}
            </div>
            <button
              onClick={carregarTodosFaturamentos}
              disabled={carregandoTodos}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {carregandoTodos ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <ChartBarIcon className="h-4 w-4" />
                  Carregar Todos os Faturamentos
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {loadingClientes && (
        <div className="text-center py-12">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando clientes... Isso pode levar alguns segundos.</p>
        </div>
      )}

      {/* Só renderizar lista quando terminar de carregar (como na participação) */}
      {!loadingClientes && clientesFiltrados.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">
            {searchTerm
              ? 'Nenhum cliente encontrado com os filtros aplicados.'
              : 'Nenhum cliente com código SCI encontrado.'}
          </p>
        </div>
      )}

      {/* Lista de Clientes - Só renderiza quando terminar de carregar */}
      {!loadingClientes && (
      <div className="space-y-6">
        {clientesFiltrados.map((item) => {
          const { cliente, faturamento, errorFaturamento } = item;
          const capitalSocial =
            typeof cliente.capital_social === 'string'
              ? parseFloat(cliente.capital_social)
              : cliente.capital_social || 0;

          return (
            <div
              key={cliente.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Cabeçalho */}
              <div className="bg-orange-50 border-b border-orange-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-500 rounded-full p-3">
                      <BuildingOfficeIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {cliente.razao_social || cliente.nome || 'Sem nome'}
                      </h2>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-600">
                          CNPJ: {formatarCNPJ(cliente.cnpj_limpo || cliente.cnpj || '')}
                        </span>
                        <span className="text-sm text-gray-600">
                          Capital Social: {formatarMoeda(capitalSocial)}
                        </span>
                        {cliente.codigo_sci && (
                          <span className="text-sm text-gray-600">
                            Código SCI: {cliente.codigo_sci}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {cliente.socios && cliente.socios.length > 0 && (
                    <div className="bg-orange-100 px-3 py-1 rounded-full">
                      <span className="text-sm font-medium text-orange-800">
                        {cliente.socios.length} sócio
                        {cliente.socios.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Seção Sócios */}
                {cliente.socios && cliente.socios.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <UserGroupIcon className="h-5 w-5 text-gray-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Sócios ({cliente.socios.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Nome
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              CPF
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Qualificação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Participação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Valor
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {cliente.socios.map((socio, idx) => {
                            const participacaoValor =
                              socio.participacao_valor ||
                              (capitalSocial *
                                (socio.participacao_percentual || 0)) /
                                100;

                            return (
                              <tr key={socio.id || idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className="bg-orange-100 rounded-full w-8 h-8 flex items-center justify-center">
                                      <span className="text-sm font-medium text-orange-700">
                                        {socio.nome.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-sm text-gray-900">
                                      {socio.nome}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {socio.cpf || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {socio.qual || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm font-medium">
                                    {formatarPercentual(
                                      socio.participacao_percentual
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-700">
                                  {formatarMoeda(participacaoValor)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Seção Faturamento */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ChartBarIcon className="h-5 w-5 text-gray-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Faturamento
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {!item.carregado && !item.loadingFaturamento && (
                        <button
                          onClick={() => carregarFaturamentoCliente(cliente.id, false)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <ChartBarIcon className="h-4 w-4" />
                          Carregar Faturamento
                        </button>
                      )}
                      {item.carregado && !item.loadingFaturamento && (
                        <button
                          onClick={() => carregarFaturamentoCliente(cliente.id, true)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Forçar atualização do faturamento do SCI"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                          Atualizar
                        </button>
                      )}
                      {item.loadingFaturamento && (
                        <span className="text-sm text-gray-500 flex items-center gap-1 px-3 py-1.5">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          Atualizando...
                        </span>
                      )}
                    </div>
                  </div>

                  {item.loadingFaturamento ? (
                    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        <p className="text-sm">Carregando faturamento...</p>
                      </div>
                    </div>
                  ) : errorFaturamento ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                      <p className="text-sm">
                        <strong>Erro:</strong> {errorFaturamento}
                      </p>
                      <button
                        onClick={() => carregarFaturamentoCliente(cliente.id, false)}
                        className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sempre exibir os 2 últimos anos, mesmo que zerados */}
                      {anosParaBuscar.map((ano) => {
                        const fat = faturamento.find((f) => f.ano === ano) || {
                          ano,
                          valorTotal: 0,
                          mediaMensal: 0,
                          meses: [],
                        };
                        return (
                        <div
                          key={fat.ano}
                          className="bg-gray-50 rounded-lg border border-gray-200 p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold text-gray-900">
                              Faturamento {fat.ano}
                            </h4>
                            <span className="text-lg font-bold text-green-700">
                              {formatarMoeda(fat.valorTotal)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mb-2">
                            Período: 01/01/{fat.ano} a 31/12/{fat.ano}
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Média Mensal:</span>
                            <span className="font-semibold text-blue-700">
                              {formatarMoeda(fat.mediaMensal || 0)}
                            </span>
                          </div>
                          {fat.meses.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium text-gray-700 mb-2">
                                Detalhamento Mensal:
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                {fat.meses.map((mes, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between items-center"
                                  >
                                    <span className="text-gray-600">
                                      {mes.mes.toString().padStart(2, '0')}/
                                      {mes.ano}
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      {formatarMoeda(mes.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default Irpf2025;

