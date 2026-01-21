import React, { useState } from 'react';
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface Inconsistencia {
  id: string;
  tipo: string;
  registro: string;
  campo?: string;
  mensagem: string;
  severidade: 'error' | 'warning' | 'info';
  linha_sped?: string;
  contexto?: Record<string, any>;
}

interface InternalValidationViewProps {
  inconsistencias: Inconsistencia[];
  onVerEvidencias?: (inconsistencia: Inconsistencia) => void;
}

const InternalValidationView: React.FC<InternalValidationViewProps> = ({
  inconsistencias,
  onVerEvidencias,
}) => {
  const [filtroSeveridade, setFiltroSeveridade] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');

  const inconsistenciasFiltradas = inconsistencias.filter((inc) => {
    if (filtroSeveridade !== 'todos' && inc.severidade !== filtroSeveridade) {
      return false;
    }
    if (busca) {
      const buscaLower = busca.toLowerCase();
      return (
        inc.mensagem.toLowerCase().includes(buscaLower) ||
        inc.registro.toLowerCase().includes(buscaLower) ||
        inc.campo?.toLowerCase().includes(buscaLower)
      );
    }
    return true;
  });

  const getSeveridadeIcon = (severidade: string) => {
    switch (severidade) {
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircleIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeveridadeBadge = (severidade: string) => {
    const classes = {
      error: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[severidade as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {getSeveridadeIcon(severidade)}
        <span className="ml-1 capitalize">{severidade}</span>
      </span>
    );
  };

  const stats = {
    total: inconsistencias.length,
    errors: inconsistencias.filter((i) => i.severidade === 'error').length,
    warnings: inconsistencias.filter((i) => i.severidade === 'warning').length,
    info: inconsistencias.filter((i) => i.severidade === 'info').length,
  };

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Erros</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.errors}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Avisos</div>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.warnings}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Info</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{stats.info}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severidade</label>
            <select
              value={filtroSeveridade}
              onChange={(e) => setFiltroSeveridade(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="error">Erros</option>
              <option value="warning">Avisos</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar inconsistências..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Inconsistências */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Inconsistências Encontradas</h3>
        </div>

        {inconsistenciasFiltradas.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-sm text-gray-500">
              {inconsistencias.length === 0
                ? 'Nenhuma inconsistência encontrada'
                : 'Nenhuma inconsistência encontrada com os filtros aplicados'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {inconsistenciasFiltradas.map((inc) => (
              <div key={inc.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getSeveridadeIcon(inc.severidade)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{inc.registro}</span>
                          {inc.campo && (
                            <span className="text-sm text-gray-500">- {inc.campo}</span>
                          )}
                          {getSeveridadeBadge(inc.severidade)}
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{inc.mensagem}</p>
                      </div>
                    </div>

                    {inc.linha_sped && (
                      <div className="mt-3 bg-gray-50 rounded p-3 font-mono text-xs">
                        <div className="text-gray-500 mb-1">Linha SPED:</div>
                        <div className="text-gray-800">{inc.linha_sped}</div>
                      </div>
                    )}
                  </div>

                  {onVerEvidencias && (
                    <button
                      onClick={() => onVerEvidencias(inc)}
                      className="ml-4 text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      Ver evidências
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InternalValidationView;

