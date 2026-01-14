import React from 'react';
import {
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

export interface SummaryStats {
  totalDocumentos?: number;
  documentosConciliados?: number;
  documentosNaoConciliados?: number;
  totalDivergencias?: number;
  erros?: number;
  revisar?: number;
  legitimos?: number;
}

interface SummaryPanelProps {
  stats: SummaryStats;
  isLoading?: boolean;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ stats, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const {
    totalDocumentos = 0,
    documentosConciliados = 0,
    documentosNaoConciliados = 0,
    totalDivergencias = 0,
    erros = 0,
    revisar = 0,
    legitimos = 0,
  } = stats;

  const taxaConciliacao = totalDocumentos > 0 
    ? Math.round((documentosConciliados / totalDocumentos) * 100) 
    : 0;

  const cards = [
    {
      title: 'Total de Documentos',
      value: totalDocumentos,
      icon: DocumentCheckIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Conciliados',
      value: documentosConciliados,
      subtitle: `${taxaConciliacao}%`,
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Não Conciliados',
      value: documentosNaoConciliados,
      icon: ExclamationTriangleIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Divergências',
      value: totalDivergencias,
      subtitle: `${erros} erros, ${revisar} revisar`,
      icon: ClockIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumo da Validação</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className={`${card.bgColor} rounded-lg p-4 border border-gray-100`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`h-5 w-5 ${card.color}`} />
                {card.subtitle && (
                  <span className="text-xs text-gray-600">{card.subtitle}</span>
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-sm text-gray-600 mt-1">{card.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SummaryPanel;


