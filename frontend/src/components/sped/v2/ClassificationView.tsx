import React, { useState, useMemo } from 'react';
import {
  XCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface DivergenciaClassificada {
  id: string;
  chave_nfe?: string;
  tipo: string;
  campo: string;
  valor_xml?: number;
  valor_sped?: number;
  diferenca: number;
  classificacao: 'ERRO' | 'REVISAR' | 'LEGÍTIMO';
  score_confianca: number;
  impacto: 'alto' | 'medio' | 'baixo' | 'nenhum';
  explicacao?: string;
}

interface ClassificationViewProps {
  divergencias: DivergenciaClassificada[];
  onVerDetalhes?: (divergencia: DivergenciaClassificada) => void;
}

const ClassificationView: React.FC<ClassificationViewProps> = ({
  divergencias,
  onVerDetalhes,
}) => {
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todos');
  const [filtroImpacto, setFiltroImpacto] = useState<string>('todos');
  const [ordenacao, setOrdenacao] = useState<'impacto' | 'score' | 'diferenca'>('impacto');

  const divergenciasOrdenadas = useMemo(() => {
    let ordenadas = [...divergencias];

    // Filtrar
    if (filtroClassificacao !== 'todos') {
      ordenadas = ordenadas.filter((d) => d.classificacao === filtroClassificacao);
    }
    if (filtroImpacto !== 'todos') {
      ordenadas = ordenadas.filter((d) => d.impacto === filtroImpacto);
    }

    // Ordenar
    ordenadas.sort((a, b) => {
      if (ordenacao === 'impacto') {
        const ordemImpacto = { alto: 3, medio: 2, baixo: 1, nenhum: 0 };
        return ordemImpacto[b.impacto] - ordemImpacto[a.impacto];
      } else if (ordenacao === 'score') {
        return b.score_confianca - a.score_confianca;
      } else {
        return Math.abs(b.diferenca) - Math.abs(a.diferenca);
      }
    });

    return ordenadas;
  }, [divergencias, filtroClassificacao, filtroImpacto, ordenacao]);

  const getClassificacaoIcon = (classificacao: string) => {
    switch (classificacao) {
      case 'ERRO':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'REVISAR':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'LEGÍTIMO':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
  };

  const getClassificacaoBadge = (classificacao: string) => {
    const classes = {
      ERRO: 'bg-red-100 text-red-800',
      REVISAR: 'bg-yellow-100 text-yellow-800',
      LEGÍTIMO: 'bg-green-100 text-green-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[classificacao as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {getClassificacaoIcon(classificacao)}
        <span className="ml-1">{classificacao}</span>
      </span>
    );
  };

  const getImpactoBadge = (impacto: string) => {
    const classes = {
      alto: 'bg-red-100 text-red-800',
      medio: 'bg-yellow-100 text-yellow-800',
      baixo: 'bg-blue-100 text-blue-800',
      nenhum: 'bg-gray-100 text-gray-800',
    };

    return (
      <span
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          classes[impacto as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        )}
      >
        {impacto.charAt(0).toUpperCase() + impacto.slice(1)}
      </span>
    );
  };

  const formatarValor = (valor: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const stats = {
    total: divergencias.length,
    erro: divergencias.filter((d) => d.classificacao === 'ERRO').length,
    revisar: divergencias.filter((d) => d.classificacao === 'REVISAR').length,
    legitimo: divergencias.filter((d) => d.classificacao === 'LEGÍTIMO').length,
    alto: divergencias.filter((d) => d.impacto === 'alto').length,
  };

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">ERRO</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.erro}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">REVISAR</div>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.revisar}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">LEGÍTIMO</div>
          <div className="text-2xl font-bold text-green-600 mt-2">{stats.legitimo}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Alto Impacto</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.alto}</div>
        </div>
      </div>

      {/* Filtros e Ordenação */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Classificação</label>
            <select
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="ERRO">ERRO</option>
              <option value="REVISAR">REVISAR</option>
              <option value="LEGÍTIMO">LEGÍTIMO</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Impacto</label>
            <select
              value={filtroImpacto}
              onChange={(e) => setFiltroImpacto(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="alto">Alto</option>
              <option value="medio">Médio</option>
              <option value="baixo">Baixo</option>
              <option value="nenhum">Nenhum</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ordenar por</label>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as any)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="impacto">Impacto (Alto primeiro)</option>
              <option value="score">Score de Confiança</option>
              <option value="diferenca">Diferença (Maior primeiro)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards de Divergências */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {divergenciasOrdenadas.map((div) => (
          <div
            key={div.id}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                {getClassificacaoIcon(div.classificacao)}
                <span className="text-sm font-medium text-gray-900">{div.campo}</span>
              </div>
              {getClassificacaoBadge(div.classificacao)}
            </div>

            {/* Corpo */}
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Diferença</div>
                <div className="text-lg font-bold text-gray-900">{formatarValor(div.diferenca)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Score de Confiança</div>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={classNames(
                        'h-2 rounded-full',
                        div.score_confianca >= 80 && 'bg-red-500',
                        div.score_confianca >= 50 && div.score_confianca < 80 && 'bg-yellow-500',
                        div.score_confianca < 50 && 'bg-green-500'
                      )}
                      style={{ width: `${div.score_confianca}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{div.score_confianca.toFixed(1)}</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Impacto</div>
                {getImpactoBadge(div.impacto)}
              </div>

              {div.explicacao && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Explicação</div>
                  <p className="text-xs text-gray-700">{div.explicacao}</p>
                </div>
              )}
            </div>

            {/* Rodapé */}
            {onVerDetalhes && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => onVerDetalhes(div)}
                  className="w-full text-sm text-indigo-600 hover:text-indigo-900 font-medium"
                >
                  Ver detalhes
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {divergenciasOrdenadas.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-sm text-gray-500">Nenhuma divergência encontrada com os filtros aplicados</p>
        </div>
      )}
    </div>
  );
};

export default ClassificationView;

