import React, { useState, useEffect } from 'react';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { api } from '../../services/api';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface LoteProcessamento {
  id: string;
  cliente_id: number;
  cliente_nome: string;
  competencia: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progresso: number;
  total_correcoes: number;
  correcoes_aplicadas: number;
  erros: number;
  criado_em: string;
  atualizado_em: string;
}

interface MetricasGerais {
  total_lotes: number;
  em_processamento: number;
  concluidos: number;
  com_erro: number;
  total_correcoes: number;
  taxa_sucesso: number;
}

interface TopErro {
  tipo: string;
  quantidade: number;
  percentual: number;
}

interface TopCliente {
  cliente_id: number;
  cliente_nome: string;
  total_lotes: number;
  total_correcoes: number;
}

interface OperationsDashboardProps {
  onReprocessar?: (loteId: string) => void;
  onDownloadLote?: (loteId: string) => void;
  onExportMetricas?: () => void;
}

const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  onReprocessar,
  onDownloadLote,
  onExportMetricas,
}) => {
  const [lotes, setLotes] = useState<LoteProcessamento[]>([]);
  const [metricas, setMetricas] = useState<MetricasGerais | null>(null);
  const [topErros, setTopErros] = useState<TopErro[]>([]);
  const [topClientes, setTopClientes] = useState<TopCliente[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  useEffect(() => {
    carregarDados();
    const interval = setInterval(carregarDados, 30000); // Atualizar a cada 30s
    return () => clearInterval(interval);
  }, [filtroStatus]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [lotesRes, metricasRes, errosRes, clientesRes] = await Promise.all([
        api.get('/sped-v2/lotes', { params: { status: filtroStatus !== 'todos' ? filtroStatus : undefined } }),
        api.get('/sped-v2/metricas'),
        api.get('/sped-v2/top-erros'),
        api.get('/sped-v2/top-clientes'),
      ]);

      if (lotesRes.data) setLotes(lotesRes.data);
      if (metricasRes.data) setMetricas(metricasRes.data);
      if (errosRes.data) setTopErros(errosRes.data);
      if (clientesRes.data) setTopClientes(clientesRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <ArrowPathIcon className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'error':
        return 'Erro';
      case 'processing':
        return 'Processando';
      default:
        return 'Pendente';
    }
  };

  const formatarData = (data: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(data));
  };

  return (
    <div className="space-y-6">
      {/* Métricas Gerais */}
      {metricas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Total de Lotes</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">{metricas.total_lotes}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Em Processamento</div>
            <div className="text-2xl font-bold text-blue-600 mt-2">{metricas.em_processamento}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Concluídos</div>
            <div className="text-2xl font-bold text-green-600 mt-2">{metricas.concluidos}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Taxa de Sucesso</div>
            <div className="text-2xl font-bold text-gray-900 mt-2">
              {metricas.taxa_sucesso.toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fila de Processamento */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Fila de Processamento</h2>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="processing">Processando</option>
              <option value="completed">Concluídos</option>
              <option value="error">Erros</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin mx-auto" />
              <p className="mt-2 text-sm text-gray-500">Carregando...</p>
            </div>
          ) : lotes.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nenhum lote encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Competência
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progresso
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Correções
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lotes.map((lote) => (
                    <tr key={lote.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{lote.cliente_nome}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{lote.competencia}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(lote.status)}
                          <span className="text-sm text-gray-900">{getStatusLabel(lote.status)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full"
                            style={{ width: `${lote.progresso}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{lote.progresso}%</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {lote.correcoes_aplicadas}/{lote.total_correcoes}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          {lote.status === 'error' && onReprocessar && (
                            <button
                              onClick={() => onReprocessar(lote.id)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Reprocessar
                            </button>
                          )}
                          {lote.status === 'completed' && onDownloadLote && (
                            <button
                              onClick={() => onDownloadLote(lote.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              <ArrowDownTrayIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Erros e Clientes */}
        <div className="space-y-6">
          {/* Top Erros */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Top Erros</h3>
            {topErros.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum erro registrado</p>
            ) : (
              <div className="space-y-3">
                {topErros.slice(0, 5).map((erro, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{erro.tipo}</div>
                      <div className="text-xs text-gray-500">{erro.quantidade} ocorrências</div>
                    </div>
                    <div className="text-sm font-bold text-red-600">{erro.percentual.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Clientes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Top Clientes</h3>
            {topClientes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum cliente registrado</p>
            ) : (
              <div className="space-y-3">
                {topClientes.slice(0, 5).map((cliente) => (
                  <div key={cliente.cliente_id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {cliente.cliente_nome}
                      </div>
                      <div className="text-xs text-gray-500">
                        {cliente.total_lotes} lotes, {cliente.total_correcoes} correções
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botão Export Métricas */}
      {onExportMetricas && (
        <div className="flex justify-end">
          <button
            onClick={onExportMetricas}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <ChartBarIcon className="h-5 w-5" />
            <span>Exportar Métricas</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default OperationsDashboard;

