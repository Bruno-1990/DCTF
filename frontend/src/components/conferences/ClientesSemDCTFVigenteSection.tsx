/**
 * COMPONENTE: Seção de Clientes sem DCTF na Competência Vigente
 * 
 * Módulo 1: Lista todos os clientes cadastrados que NÃO têm DCTF
 * enviada para a competência vigente (mês anterior à data atual).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';

interface ClienteSemDCTFVigente {
  id: string;
  cnpj: string;
  razao_social: string;
  competencia_vigente: string;
  vencimento: string;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

interface Props {
  clientes: ClienteSemDCTFVigente[];
  competenciaVigente: string;
  loading?: boolean;
  error?: string | null;
}

function formatDate(value?: string) {
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

export function ClientesSemDCTFVigenteSection({ 
  clientes, 
  competenciaVigente,
  loading = false,
  error = null 
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const itensPorPagina = 10;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          {expanded ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1 text-left">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <BuildingOfficeIcon className="h-5 w-5 text-amber-600" />
              Clientes sem DCTF na Competência Vigente
            </h2>
            <p className="text-sm text-gray-600">
              Lista de clientes cadastrados que não apresentaram DCTF enviada no mês vigente ({competenciaVigente}).
              Conforme IN RFB 2.237/2024, 2.267/2025 e 2.248/2025.
            </p>
          </div>
        </div>
        <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
          {loading ? (
            <span className="text-gray-500">Carregando...</span>
          ) : (
            <>
              Total: <span className="text-gray-900">{clientes.length}</span> clientes
            </>
          )}
        </div>
      </button>

      {expanded && (
        <>
          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600">Carregando clientes sem DCTF...</p>
            </div>
          ) : error ? (
            <div className="px-6 py-4">
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                <strong>Erro:</strong> {error}
              </div>
            </div>
          ) : clientes.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Nenhum cliente encontrado sem DCTF na competência {competenciaVigente}.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Todos os clientes cadastrados têm DCTF enviada para esta competência.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">CNPJ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clientes
                      .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
                      .map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                            {cliente.razao_social || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
                              <button
                                onClick={() => copyToClipboard(cliente.cnpj, cliente.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === cliente.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <span className="font-semibold text-amber-600">{cliente.competencia_vigente}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cliente.vencimento)}</td>
                          <td className="px-4 py-3">
                            <SeverityTag severity={cliente.severidade} />
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <button
                              onClick={() => navigate(`/clientes/${cliente.cnpj}`)}
                              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {clientes.length > itensPorPagina && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <Pagination
                    currentPage={paginaAtual}
                    totalPages={Math.ceil(clientes.length / itensPorPagina)}
                    totalItems={clientes.length}
                    itemsPerPage={itensPorPagina}
                    onPageChange={setPaginaAtual}
                    itemLabel="cliente"
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






