/**
 * COMPONENTE: Seção de Clientes sem Movimentação há mais de 12 meses
 * 
 * Módulo 5.1: Lista clientes cadastrados que não têm movimentação registrada há mais de 12 meses.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';
import { FiltroConferencias, filtrarPorCnpjOuRazao, filtrarPorProcuracao } from './FiltroConferencias';

interface ClienteSemMovimentacao {
  id: string;
  cnpj: string;
  razao_social: string;
  ultima_movimentacao: string | null;
  meses_sem_movimentacao: number;
  ultima_dctf: string | null;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

interface Props {
  clientes: ClienteSemMovimentacao[];
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

export function ClientesSemMovimentacaoSection({ clientes, loading = false, error = null, expanded: expandedProp, onToggle }: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp !== undefined ? expandedProp : internalExpanded;
  const [filtro, setFiltro] = useState('');
  const [mostrarTodosComProcuracao, setMostrarTodosComProcuracao] = useState(false);
  const clientesPorProcuracao = mostrarTodosComProcuracao ? clientes : filtrarPorProcuracao(clientes);
  const clientesFiltrados = filtrarPorCnpjOuRazao(clientesPorProcuracao, filtro);

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
      navigator.clipboard.writeText(text)
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
    const listaExportar = clientesFiltrados;
    if (listaExportar.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data = listaExportar.map((cliente) => [
        cliente.razao_social || '—',
        formatCNPJ(cliente.cnpj) || '—',
        cliente.ultima_movimentacao || 'Nunca',
        cliente.meses_sem_movimentacao.toString(),
        cliente.ultima_dctf || '—',
        cliente.severidade === 'high' ? 'Alta' : cliente.severidade === 'medium' ? 'Média' : 'Baixa',
        cliente.mensagem,
      ]);

      await exportToExcel({
        filename: `clientes-sem-movimentacao-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Clientes sem Movimentação',
        headers: ['Empresa', 'CNPJ', 'Última Movimentação', 'Meses sem Movimentação', 'Última DCTF', 'Severidade', 'Mensagem'],
        data,
        title: 'Clientes sem Movimentação há mais de 12 meses',
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Clientes': listaExportar.length.toString(),
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
  const clientesPaginados = clientesFiltrados.slice(inicio, fim);
  const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina);

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
          <p className="font-medium">Erro ao carregar clientes sem movimentação</p>
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
              <BuildingOfficeIcon className="h-5 w-5 text-indigo-600" />
              Clientes sem Movimentação há mais de 12 meses
            </h2>
            <p className="text-sm text-gray-600">
              {clientesPorProcuracao.length} cliente{clientesPorProcuracao.length !== 1 ? 's' : ''} sem movimentação registrada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-700 bg-white px-5 py-2.5 rounded-xl border-2 border-gray-300">
            {loading ? (
              <span className="text-gray-500">Carregando...</span>
            ) : (
              <>
                Total: <span className="text-gray-900 font-bold">{clientesPorProcuracao.length}</span>
                {filtro.trim() ? ` (${clientesFiltrados.length} filtrado${clientesFiltrados.length !== 1 ? 's' : ''})` : ` cliente${clientesPorProcuracao.length !== 1 ? 's' : ''}`}
              </>
            )}
          </div>
          {!loading && clientes.length > 0 && (
            <FiltroConferencias value={filtro} onChange={setFiltro} />
          )}
          {!loading && clientes.length > 0 && (
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
          {!loading && clientes.length > 0 && (
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
          )}
          <div className="border-t border-gray-200">
          {clientesFiltrados.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>{filtro.trim() ? 'Nenhum resultado para o filtro informado.' : 'Nenhum cliente sem movimentação há mais de 12 meses encontrado.'}</p>
              {filtro.trim() && <p className="text-xs mt-2">Tente outro CNPJ ou Razão Social.</p>}
            </div>
          ) : (
            <>
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
                        Última Movimentação
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meses sem Movimentação
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Última DCTF
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Severidade
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clientesPaginados.map((cliente) => (
                      <tr key={cliente.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatCNPJ(cliente.cnpj)}
                            </span>
                            <button
                              onClick={() => copyToClipboard(formatCNPJ(cliente.cnpj) || '', cliente.id)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copiar CNPJ"
                            >
                              {copiedId === cliente.id ? (
                                <CheckIcon className="h-4 w-4 text-green-600" />
                              ) : (
                                <ClipboardDocumentIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {cliente.razao_social}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(cliente.ultima_movimentacao)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-amber-600">
                            {cliente.meses_sem_movimentacao === 999 ? 'Nunca' : `${cliente.meses_sem_movimentacao} meses`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(cliente.ultima_dctf)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <SeverityTag severity={cliente.severidade} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginas > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <Pagination
                    paginaAtual={paginaAtual}
                    totalPaginas={totalPaginas}
                    onPageChange={setPaginaAtual}
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

