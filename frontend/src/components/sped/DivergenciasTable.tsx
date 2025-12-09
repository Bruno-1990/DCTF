import React, { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Divergencia {
  Categoria?: string;
  'Chave NF-e'?: string;
  Onde?: string;
  Campo?: string;
  'No XML'?: string;
  'No SPED'?: string;
  Regra?: string;
  Severidade?: string;
  Sugestão?: string;
  Descrição?: string;
  [key: string]: any;
}

interface DivergenciasTableProps {
  divergencias: Divergencia[];
}

const DivergenciasTable: React.FC<DivergenciasTableProps> = ({ divergencias }) => {
  const [filtroSeveridade, setFiltroSeveridade] = useState<string>('todas');
  const [busca, setBusca] = useState<string>('');

  const severidades = ['todas', 'Alta', 'Média', 'Baixa'];
  const severidadesUnicas = Array.from(
    new Set(divergencias.map(d => d.Severidade).filter(Boolean))
  );

  const divergenciasFiltradas = divergencias.filter(d => {
    const matchSeveridade = filtroSeveridade === 'todas' || d.Severidade === filtroSeveridade;
    const matchBusca = !busca || 
      Object.values(d).some(v => 
        String(v).toLowerCase().includes(busca.toLowerCase())
      );
    return matchSeveridade && matchBusca;
  });

  const getSeveridadeColor = (severidade?: string) => {
    switch (severidade?.toLowerCase()) {
      case 'alta':
        return 'bg-red-100 text-red-800';
      case 'média':
        return 'bg-yellow-100 text-yellow-800';
      case 'baixa':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center">
          <ExclamationTriangleIcon className="h-6 w-6 mr-2 text-yellow-600" />
          Divergências ({divergenciasFiltradas.length})
        </h3>
        
        <div className="flex gap-3">
          {/* Busca */}
          <input
            type="text"
            placeholder="Buscar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          
          {/* Filtro de Severidade */}
          <select
            value={filtroSeveridade}
            onChange={(e) => setFiltroSeveridade(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="todas">Todas as severidades</option>
            {severidadesUnicas.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoria
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Chave NF-e
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Campo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                XML
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SPED
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severidade
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sugestão
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {divergenciasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Nenhuma divergência encontrada
                </td>
              </tr>
            ) : (
              divergenciasFiltradas.map((div, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {div.Categoria || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-mono">
                    {div['Chave NF-e'] || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {div.Campo || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {div['No XML'] || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {div['No SPED'] || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeveridadeColor(div.Severidade)}`}>
                      {div.Severidade || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                    {div.Sugestão || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DivergenciasTable;

