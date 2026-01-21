import React, { useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface DocumentoConciliado {
  id: string;
  chave_nfe: string;
  numero_nf: string;
  serie_nf: string;
  data_emissao: string;
  valor_total: number;
  match_score: number;
  match_tipo: 'exato' | 'parcial' | 'nao_conciliado';
  divergencias?: Divergencia[];
}

export interface Divergencia {
  id: string;
  tipo: string;
  campo: string;
  valor_xml?: number;
  valor_sped?: number;
  diferenca?: number;
  classificacao?: string;
}

interface MatchingViewProps {
  documentos: DocumentoConciliado[];
  onVerDivergencias?: (documento: DocumentoConciliado) => void;
}

const MatchingView: React.FC<MatchingViewProps> = ({ documentos, onVerDivergencias }) => {
  const [filtroMatch, setFiltroMatch] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');

  const documentosFiltrados = documentos.filter((doc) => {
    if (filtroMatch === 'conciliados' && doc.match_tipo === 'nao_conciliado') {
      return false;
    }
    if (filtroMatch === 'nao_conciliados' && doc.match_tipo !== 'nao_conciliado') {
      return false;
    }
    if (busca) {
      const buscaLower = busca.toLowerCase();
      return (
        doc.chave_nfe.toLowerCase().includes(buscaLower) ||
        doc.numero_nf.toLowerCase().includes(buscaLower)
      );
    }
    return true;
  });

  const getMatchIcon = (tipo: string) => {
    switch (tipo) {
      case 'exato':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'parcial':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
    }
  };

  const getMatchBadge = (tipo: string, score: number) => {
    const classes = {
      exato: 'bg-green-100 text-green-800',
      parcial: 'bg-yellow-100 text-yellow-800',
      nao_conciliado: 'bg-red-100 text-red-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[tipo as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {getMatchIcon(tipo)}
        <span className="ml-1">
          {tipo === 'exato' && 'Exato'}
          {tipo === 'parcial' && `Parcial (${score}%)`}
          {tipo === 'nao_conciliado' && 'Não Conciliado'}
        </span>
      </span>
    );
  };

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const formatarData = (data: string): string => {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
  };

  const stats = {
    total: documentos.length,
    conciliados: documentos.filter((d) => d.match_tipo !== 'nao_conciliado').length,
    nao_conciliados: documentos.filter((d) => d.match_tipo === 'nao_conciliado').length,
    com_divergencias: documentos.filter((d) => d.divergencias && d.divergencias.length > 0).length,
  };

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total de Documentos</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Conciliados</div>
          <div className="text-2xl font-bold text-green-600 mt-2">{stats.conciliados}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Não Conciliados</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.nao_conciliados}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Com Divergências</div>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.com_divergencias}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filtroMatch}
              onChange={(e) => setFiltroMatch(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="conciliados">Conciliados</option>
              <option value="nao_conciliados">Não Conciliados</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por chave ou número..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Documentos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Documentos</h3>
        </div>

        {documentosFiltrados.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">Nenhum documento encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {documentosFiltrados.map((doc) => (
              <div key={doc.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getMatchIcon(doc.match_tipo)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            NF-e {doc.numero_nf}/{doc.serie_nf}
                          </span>
                          {getMatchBadge(doc.match_tipo, doc.match_score)}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Chave: {doc.chave_nfe}</p>
                        <p className="text-xs text-gray-500">
                          Emissão: {formatarData(doc.data_emissao)} | Valor:{' '}
                          {formatarValor(doc.valor_total)}
                        </p>
                      </div>
                    </div>

                    {doc.divergencias && doc.divergencias.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-1">
                          {doc.divergencias.length} divergência(s) encontrada(s)
                        </p>
                      </div>
                    )}
                  </div>

                  {onVerDivergencias && (
                    <button
                      onClick={() => onVerDivergencias(doc)}
                      className="ml-4 text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      Ver divergências
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

export default MatchingView;

