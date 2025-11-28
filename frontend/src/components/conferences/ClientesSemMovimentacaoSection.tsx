/**
 * COMPONENTE: Seção de Clientes sem Movimentação há mais de 12 meses
 * 
 * Módulo 5.1: Lista clientes cadastrados que não têm movimentação registrada há mais de 12 meses.
 */

import { useState } from 'react';
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

export function ClientesSemMovimentacaoSection({ clientes, loading = false, error = null }: Props) {
  const [expanded, setExpanded] = useState(true);
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
    if (clientes.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data = clientes.map((cliente) => [
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
          'Total de Clientes': clientes.length.toString(),
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
  const clientesPaginados = clientes.slice(inicio, fim);
  const totalPaginas = Math.ceil(clientes.length / itensPorPagina);

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
          )}
          <BuildingOfficeIcon className="h-6 w-6 text-indigo-600" />
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900">
              Clientes sem Movimentação há mais de 12 meses
            </h3>
            <p className="text-sm text-gray-500">
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} sem movimentação registrada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SeverityTag severity={clientes.length > 0 ? (clientes.length > 20 ? 'high' : 'medium') : 'low'} />
          {!loading && clientes.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExportar();
              }}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar para Excel"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {exporting ? 'Exportando...' : 'Exportar'}
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {clientes.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>Nenhum cliente sem movimentação há mais de 12 meses encontrado.</p>
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
      )}
    </div>
  );
}

