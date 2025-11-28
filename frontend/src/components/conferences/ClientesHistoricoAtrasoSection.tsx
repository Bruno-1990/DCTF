/**
 * COMPONENTE: Seção de Clientes com Histórico de Atraso
 * 
 * Módulo 6.2: Lista clientes que têm histórico de envio de DCTF após o prazo legal.
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

interface ClienteHistoricoAtraso {
  id: string;
  cnpj: string;
  razao_social: string | null;
  total_dctfs_atrasadas: number;
  total_dctfs: number;
  percentual_atraso: number;
  ultima_dctf_atrasada: string | null;
  dias_atraso_medio: number;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

interface Props {
  clientes: ClienteHistoricoAtraso[];
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

export function ClientesHistoricoAtrasoSection({ clientes, loading = false, error = null }: Props) {
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
        cliente.total_dctfs_atrasadas.toString(),
        cliente.total_dctfs.toString(),
        cliente.percentual_atraso.toFixed(1) + '%',
        cliente.dias_atraso_medio.toString(),
        cliente.severidade === 'high' ? 'Alta' : cliente.severidade === 'medium' ? 'Média' : 'Baixa',
        cliente.mensagem,
      ]);

      await exportToExcel({
        filename: `clientes-historico-atraso-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Clientes com Histórico de Atraso',
        headers: ['Empresa', 'CNPJ', 'DCTFs Atrasadas', 'Total DCTFs', '% de Atraso', 'Atraso Médio (dias)', 'Severidade', 'Mensagem'],
        data,
        title: 'Clientes com Histórico de Atraso',
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
          <p className="font-medium">Erro ao carregar clientes com histórico de atraso</p>
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
          <BuildingOfficeIcon className="h-6 w-6 text-red-600" />
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900">
              Clientes com Histórico de Atraso
            </h3>
            <p className="text-sm text-gray-500">
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} com histórico de DCTFs enviadas fora do prazo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SeverityTag severity={clientes.length > 0 ? (clientes.length > 5 ? 'high' : 'medium') : 'low'} />
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
              <p>Nenhum cliente com histórico de atraso encontrado.</p>
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
                        DCTFs Atrasadas
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total DCTFs
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        % de Atraso
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Atraso Médio
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
                            {cliente.razao_social || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-red-600">
                            {cliente.total_dctfs_atrasadas}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cliente.total_dctfs}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-amber-600">
                            {cliente.percentual_atraso.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cliente.dias_atraso_medio} dia{cliente.dias_atraso_medio !== 1 ? 's' : ''}
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

