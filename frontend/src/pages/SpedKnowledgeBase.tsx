import React, { useState, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  BookOpenIcon,
  CalendarIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface DocumentoLegal {
  id: string;
  documento_tipo: string;
  documento_nome: string;
  versao?: string;
  vigencia_inicio: string;
  vigencia_fim?: string;
  metadata?: Record<string, any>;
}

interface ChunkRelevante {
  id: string;
  chunk_text: string;
  section_title?: string;
  article_number?: string;
  page_number?: number;
  score: number;
}

interface RegraEstruturada {
  id: string;
  rule_type: string;
  rule_category?: string;
  rule_description: string;
  legal_reference?: string;
  article_reference?: string;
  vigencia_inicio: string;
  vigencia_fim?: string;
}

interface ResultadoBusca {
  documentos: DocumentoLegal[];
  chunks: ChunkRelevante[];
  regras: RegraEstruturada[];
  query: string;
  total_results: number;
}

const SpedKnowledgeBase: React.FC = () => {
  const [busca, setBusca] = useState<string>('');
  const [filtros, setFiltros] = useState({
    periodo: '',
    tipo_documento: 'todos',
    categoria: '',
  });
  const [resultados, setResultados] = useState<ResultadoBusca | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [mostrarFiltros, setMostrarFiltros] = useState<boolean>(false);

  const handleBuscar = async () => {
    if (!busca.trim()) return;

    try {
      setLoading(true);
      const response = await api.get('/sped-v2/knowledge/query', {
        params: {
          query: busca,
          periodo: filtros.periodo || undefined,
          tipo_documento: filtros.tipo_documento !== 'todos' ? filtros.tipo_documento : undefined,
          categoria: filtros.categoria || undefined,
        },
      });

      if (response.data) {
        setResultados(response.data);
      }
    } catch (error) {
      console.error('Erro ao buscar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBuscar();
    }
  };

  const tiposDocumento = [
    { value: 'todos', label: 'Todos' },
    { value: 'GUIA_PRATICO', label: 'Guia Prático' },
    { value: 'ATO_COTEPE', label: 'Ato COTEPE' },
    { value: 'CONVENIO', label: 'Convênio' },
    { value: 'PORTARIA', label: 'Portaria' },
    { value: 'NOTA_TECNICA', label: 'Nota Técnica' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Base de Conhecimento SPED</h1>
        <p className="mt-2 text-sm text-gray-500">
          Busque documentos legais, regras estruturadas e referências fiscais
        </p>
      </div>

      {/* Busca */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua busca semântica..."
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg"
            />
          </div>
          <button
            onClick={handleBuscar}
            disabled={loading || !busca.trim()}
            className={classNames(
              'px-6 py-3 rounded-md text-white font-medium',
              loading || !busca.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="p-3 text-gray-400 hover:text-gray-600"
          >
            <FunnelIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Filtros */}
        {mostrarFiltros && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
              <input
                type="month"
                value={filtros.periodo}
                onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Documento</label>
              <select
                value={filtros.tipo_documento}
                onChange={(e) => setFiltros({ ...filtros, tipo_documento: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {tiposDocumento.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
              <input
                type="text"
                value={filtros.categoria}
                onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}
                placeholder="Ex: C100, C170"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Resultados */}
      {resultados && (
        <div className="space-y-6">
          {/* Resumo */}
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">
              Encontrados <span className="font-bold text-gray-900">{resultados.total_results}</span>{' '}
              resultados para "{resultados.query}"
            </p>
          </div>

          {/* Documentos */}
          {resultados.documentos.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <DocumentTextIcon className="h-6 w-6 mr-2" />
                Documentos ({resultados.documentos.length})
              </h2>
              <div className="space-y-4">
                {resultados.documentos.map((doc) => (
                  <div key={doc.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{doc.documento_nome}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Tipo: {doc.documento_tipo} | Versão: {doc.versao || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Vigência: {new Date(doc.vigencia_inicio).toLocaleDateString('pt-BR')} -{' '}
                          {doc.vigencia_fim
                            ? new Date(doc.vigencia_fim).toLocaleDateString('pt-BR')
                            : 'Atual'}
                        </p>
                      </div>
                      <button className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
                        Ver documento
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chunks Relevantes */}
          {resultados.chunks.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <BookOpenIcon className="h-6 w-6 mr-2" />
                Trechos Relevantes ({resultados.chunks.length})
              </h2>
              <div className="space-y-4">
                {resultados.chunks.map((chunk) => (
                  <div key={chunk.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        {chunk.section_title && (
                          <p className="text-sm font-medium text-gray-900">{chunk.section_title}</p>
                        )}
                        {chunk.article_number && (
                          <p className="text-xs text-gray-500">{chunk.article_number}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">Score: {chunk.score.toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-2">{chunk.chunk_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regras Estruturadas */}
          {resultados.regras.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <BookOpenIcon className="h-6 w-6 mr-2" />
                Regras Estruturadas ({resultados.regras.length})
              </h2>
              <div className="space-y-4">
                {resultados.regras.map((regra) => (
                  <div key={regra.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-900">{regra.rule_type}</span>
                          {regra.rule_category && (
                            <span className="text-xs text-gray-500">({regra.rule_category})</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{regra.rule_description}</p>
                        {regra.legal_reference && (
                          <p className="text-xs text-gray-500 mt-2">
                            Referência: {regra.legal_reference}
                          </p>
                        )}
                        {regra.article_reference && (
                          <p className="text-xs text-gray-500">Artigo: {regra.article_reference}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultados.total_results === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-sm text-gray-500">Nenhum resultado encontrado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SpedKnowledgeBase;

