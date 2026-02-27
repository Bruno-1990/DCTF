/**
 * COMPONENTE: Seção Em Andamento
 *
 * Lista todas as DCTFs com situação "Em andamento" (uma linha por declaração) dentro da div ao expandir.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';
import { FiltroConferencias, filtrarPorCnpjOuRazao } from './FiltroConferencias';

interface DCTFEmAndamento {
  id: string;
  cnpj: string;
  razao_social: string | null;
  periodo_apuracao: string;
  situacao: string | null;
  tipo: string | null;
  data_transmissao: string | null;
}

interface Props {
  dctfs: DCTFEmAndamento[];
  loading?: boolean;
  error?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function formatCNPJ(cnpj?: string | null) {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cnpj;
}

export function ClientesEmAndamentoSection({
  dctfs,
  loading = false,
  error = null,
  expanded: expandedProp,
  onToggle,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp !== undefined ? expandedProp : internalExpanded;
  const [filtro, setFiltro] = useState('');
  const [mostrarTodosComProcuracao, setMostrarTodosComProcuracao] = useState(false);

  const dctfsPorProcuracao = mostrarTodosComProcuracao
    ? dctfs
    : dctfs.filter((d) => {
        const temRazaoSocial = d.razao_social && d.razao_social.trim() !== '';
        const cnpjLimpo = d.cnpj ? d.cnpj.replace(/\D/g, '') : '';
        const temCNPJ = cnpjLimpo.length === 14;
        return temRazaoSocial && temCNPJ;
      });
  const dctfsFiltrados = filtrarPorCnpjOuRazao(dctfsPorProcuracao, filtro);

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtro, mostrarTodosComProcuracao]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const [paginaAtual, setPaginaAtual] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const itensPorPagina = 10;

  const copyToClipboard = (text: string, id: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
        })
        .catch(() => fallbackCopyToClipboard(text, id));
    } else {
      fallbackCopyToClipboard(text, id);
    }
  };

  const fallbackCopyToClipboard = (text: string, id: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleExportar = async () => {
    const listaExportar = dctfsFiltrados;
    if (listaExportar.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data = listaExportar.map((d) => [
        d.razao_social || '—',
        formatCNPJ(d.cnpj) || '—',
        d.periodo_apuracao,
        d.situacao || '—',
        d.tipo || '—',
        formatDate(d.data_transmissao),
      ]);

      await exportToExcel({
        filename: `em-andamento-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Em Andamento',
        headers: ['Empresa', 'CNPJ', 'Período', 'Situação', 'Tipo', 'Data transmissão'],
        data,
        title: 'Em Andamento',
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de DCTFs': listaExportar.length.toString(),
        },
      });
    } catch (err: any) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const dctfsPaginados = dctfsFiltrados.slice(inicio, fim);
  const totalPaginas = Math.ceil(dctfsFiltrados.length / itensPorPagina);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-600">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <p className="font-medium">Erro ao carregar Em Andamento</p>
        </div>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
      </div>
    );
  }

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
              <ArrowPathIcon className="h-5 w-5 text-amber-500" />
              Em Andamento
            </h2>
            <p className="text-sm text-gray-600">
              {dctfs.length} DCTF{dctfs.length !== 1 ? 's' : ''} em andamento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-700 bg-white px-5 py-2.5 rounded-xl border-2 border-gray-300">
            {loading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                Total: <span className="text-gray-900 font-bold">{dctfsPorProcuracao.length}</span>
                {filtro.trim()
                  ? ` (${dctfsFiltrados.length} filtrado${dctfsFiltrados.length !== 1 ? 's' : ''})`
                  : ` DCTF${dctfsPorProcuracao.length !== 1 ? 's' : ''}`}
              </>
            )}
          </div>
          {!loading && dctfs.length > 0 && (
            <FiltroConferencias value={filtro} onChange={setFiltro} />
          )}
          {!loading && dctfs.length > 0 && (
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
          <div className="border-t border-gray-200">
            {dctfsFiltrados.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <p>
                  {filtro.trim()
                    ? 'Nenhum resultado para o filtro informado.'
                    : 'Nenhuma DCTF em andamento encontrada.'}
                </p>
                {filtro.trim() && <p className="text-xs mt-2">Tente outro CNPJ ou Razão Social.</p>}
              </div>
            ) : (
              <>
                <div className="flex items-center px-6 py-3 border-b border-gray-200 bg-gray-50/70" onClick={(e) => e.stopPropagation()}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={mostrarTodosComProcuracao}
                      onChange={(e) => {
                        setMostrarTodosComProcuracao(e.target.checked);
                        setPaginaAtual(1);
                      }}
                      className="w-5 h-5 text-amber-500 border-2 border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:ring-offset-0 cursor-pointer transition-all duration-200 checked:bg-amber-500 checked:border-amber-500"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-amber-600 transition-colors select-none">
                      Todos com procuração
                    </span>
                    <span className="text-xs text-gray-500 italic">
                      (Desmarcado: apenas clientes com Razão Social e CNPJ)
                    </span>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          CNPJ
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Razão Social
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Período
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Situação
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Data transmissão
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dctfsPaginados.map((dctf) => (
                        <tr key={dctf.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {formatCNPJ(dctf.cnpj)}
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(formatCNPJ(dctf.cnpj) || '', dctf.id)
                                }
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                title="Copiar CNPJ"
                              >
                                {copiedId === dctf.id ? (
                                  <CheckIcon className="h-4 w-4 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {dctf.razao_social || '—'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {dctf.periodo_apuracao}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-amber-600">
                              {dctf.situacao || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {dctf.tipo || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatDate(dctf.data_transmissao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPaginas > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200">
                    <Pagination
                      currentPage={paginaAtual}
                      totalPages={totalPaginas}
                      totalItems={dctfsFiltrados.length}
                      itemsPerPage={itensPorPagina}
                      onPageChange={setPaginaAtual}
                      itemLabel="DCTF"
                      variant="amber"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
