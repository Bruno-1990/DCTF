/**
 * COMPONENTE: Seção de Divergências de Valores
 * 
 * Exibe divergências de valores agrupadas por Chave de NF.
 * Ao expandir cada chave, mostra os motivos das divergências.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';

export interface DivergenciaValor {
  chaveNf: string;
  motivo: string;
  campo?: string;
  valorEsperado?: string;
  valorEncontrado?: string;
  severidade: 'high' | 'medium' | 'low';
  categoria?: string;
  descricao?: string;
}

export interface DivergenciaPorChave {
  chaveNf: string;
  totalDivergencias: number;
  divergencias: DivergenciaValor[];
  severidadeMaxima: 'high' | 'medium' | 'low';
}

interface Props {
  divergencias: DivergenciaPorChave[];
  loading?: boolean;
  error?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}

function formatChaveNF(chave: string): string {
  if (!chave) return '—';
  // Formatar chave de NF-e (44 dígitos): agrupar em blocos para melhor leitura
  const digits = chave.replace(/\D/g, '');
  if (digits.length === 44) {
    return `${digits.substring(0, 4)} ${digits.substring(4, 8)} ${digits.substring(8, 12)} ${digits.substring(12, 16)} ${digits.substring(16, 20)} ${digits.substring(20, 24)} ${digits.substring(24, 28)} ${digits.substring(28, 32)} ${digits.substring(32, 36)} ${digits.substring(36, 40)} ${digits.substring(40, 44)}`;
  }
  return chave;
}

function SeverityTag({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const labels = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

function DivergenciaRow({ divergencia }: { divergencia: DivergenciaValor }) {
  return (
    <div className="pl-6 pr-4 py-3 border-l-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <SeverityTag severity={divergencia.severidade} />
            {divergencia.categoria && (
              <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-300">
                {divergencia.categoria}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">{divergencia.motivo}</p>
          {divergencia.descricao && (
            <p className="text-xs text-gray-600 mb-2">{divergencia.descricao}</p>
          )}
          {(divergencia.campo || divergencia.valorEsperado || divergencia.valorEncontrado) && (
            <div className="mt-2 space-y-1">
              {divergencia.campo && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Campo:</span> {divergencia.campo}
                </p>
              )}
              {divergencia.valorEsperado && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Valor Esperado:</span> {divergencia.valorEsperado}
                </p>
              )}
              {divergencia.valorEncontrado && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Valor Encontrado:</span> {divergencia.valorEncontrado}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DivergenciasValoresSection({
  divergencias,
  loading = false,
  error = null,
  expanded: expandedProp,
  onToggle,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp !== undefined ? expandedProp : internalExpanded;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const [paginaAtual, setPaginaAtual] = useState(1);
  const [expandedChaves, setExpandedChaves] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const itensPorPagina = 10;

  const toggleChave = (chave: string) => {
    setExpandedChaves((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
      } else {
        next.add(chave);
      }
      return next;
    });
  };

  const expandAllChaves = () => {
    const todasChaves = divergencias.map((d) => d.chaveNf);
    setExpandedChaves(new Set(todasChaves));
  };

  const collapseAllChaves = () => {
    setExpandedChaves(new Set());
  };

  const handleExportar = async () => {
    if (divergencias.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data: any[] = [];
      
      divergencias.forEach((divergenciaPorChave) => {
        divergenciaPorChave.divergencias.forEach((divergencia) => {
          data.push([
            formatChaveNF(divergenciaPorChave.chaveNf),
            divergencia.motivo,
            divergencia.categoria || '—',
            divergencia.campo || '—',
            divergencia.valorEsperado || '—',
            divergencia.valorEncontrado || '—',
            divergencia.severidade === 'high' ? 'Alta' : divergencia.severidade === 'medium' ? 'Média' : 'Baixa',
            divergencia.descricao || '—',
          ]);
        });
      });

      await exportToExcel({
        filename: `divergencias-valores-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Divergências de Valores',
        headers: [
          'Chave NF',
          'Motivo',
          'Categoria',
          'Campo',
          'Valor Esperado',
          'Valor Encontrado',
          'Severidade',
          'Descrição',
        ],
        data,
        title: 'Divergências de Valores por Chave de NF',
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Chaves': divergencias.length.toString(),
          'Total de Divergências': divergencias.reduce((sum, d) => sum + d.totalDivergencias, 0).toString(),
        },
      });
    } catch (err: any) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  const totalDivergencias = divergencias.reduce((sum, d) => sum + d.totalDivergencias, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div
        onClick={handleToggle}
        className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 flex-1">
          {expanded ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1 text-left">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              Divergências de Valores
            </h2>
            <p className="text-sm text-gray-600">
              Divergências de valores agrupadas por Chave de NF. Expanda cada chave para ver os motivos das divergências.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-700 bg-white px-5 py-2.5 rounded-xl border-2 border-gray-300">
            {loading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                {divergencias.length} chave(s) • {totalDivergencias} divergência(s)
              </>
            )}
          </div>
          {!loading && divergencias.length > 0 && (
            <motion.button
              onClick={handleExportar}
              disabled={exporting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glow-border-linear inline-flex items-center gap-2.5 px-5 py-2.5 bg-white text-emerald-600 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative z-0"
              title="Exportar para Excel"
            >
              <ArrowDownTrayIcon className="h-5 w-5 relative z-10" />
              <span className="relative z-10">{exporting ? 'Exportando...' : 'Exportar'}</span>
            </motion.button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600">Carregando divergências...</p>
            </div>
          ) : error ? (
            <div className="px-6 py-4">
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                <strong>Erro:</strong> {error}
              </div>
            </div>
          ) : divergencias.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Nenhuma divergência de valores encontrada.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Todas as notas fiscais estão com valores corretos.
              </p>
            </div>
          ) : (
            <>
              {/* Controles de expansão */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={expandAllChaves}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Expandir Todas
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={collapseAllChaves}
                    className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Recolher Todas
                  </button>
                </div>
              </div>

              {/* Lista de divergências por chave */}
              <div className="divide-y divide-gray-200">
                {divergencias
                  .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                  .map((divergenciaPorChave) => {
                    const isExpanded = expandedChaves.has(divergenciaPorChave.chaveNf);
                    return (
                      <div key={divergenciaPorChave.chaveNf} className="bg-white">
                        {/* Cabeçalho da chave */}
                        <div
                          onClick={() => toggleChave(divergenciaPorChave.chaveNf)}
                          className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {isExpanded ? (
                              <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                            ) : (
                              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                            )}
                            <DocumentTextIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-mono font-semibold text-gray-900">
                                {formatChaveNF(divergenciaPorChave.chaveNf)}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {divergenciaPorChave.totalDivergencias} divergência(s)
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <SeverityTag severity={divergenciaPorChave.severidadeMaxima} />
                          </div>
                        </div>

                        {/* Divergências da chave */}
                        {isExpanded && (
                          <div className="bg-gray-50 border-t border-gray-200">
                            {divergenciaPorChave.divergencias.map((divergencia, index) => (
                              <DivergenciaRow key={index} divergencia={divergencia} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Paginação */}
              {divergencias.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtual}
                    totalPages={Math.ceil(divergencias.length / itensPorPagina)}
                    totalItems={divergencias.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtual}
                    itemLabel="chave"
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

