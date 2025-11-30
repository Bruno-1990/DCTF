import React from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface ExtractedData {
  empresa_razao_social?: string;
  empresa_cnpj?: string;
  empresa_data_abertura?: string;
  empresa_porte?: string;
  empresa_situacao_cadastral?: string;
  empresa_natureza_juridica?: { codigo?: string; descricao?: string } | string;
  empresa_cnae_principal?: { codigo?: string; descricao?: string } | string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cep?: string;
  endereco_municipio?: string;
  endereco_uf?: string;
  domicilio_fiscal_unidade?: string;
  domicilio_fiscal_codigo?: string;
  responsavel_cpf?: string;
  responsavel_nome?: string;
  socios?: Array<{
    cpf?: string;
    nome?: string;
    qualificacao?: string;
    situacao_cadastral?: string;
  }> | string;
  simples_nacional_data_inclusao?: string;
  simples_nacional_data_exclusao?: string | null;
  certidao_tipo?: string;
  certidao_numero?: string;
  certidao_data_emissao?: string;
  certidao_data_validade?: string;
  certidao_pendencias_detectadas?: boolean;
  certidao_observacao?: string;
}

interface Debito {
  codigoReceita?: string;
  tipoReceita?: string;
  periodo?: string;
  dataVencimento?: string;
  valorOriginal?: number;
  saldoDevedor?: number;
  multa?: number;
  juros?: number;
  saldoDevedorConsolidado?: number;
  situacao?: string;
  tipo?: 'pendencia' | 'exigibilidade_suspensa';
}

interface Pendencia {
  tipo?: string;
  descricao?: string;
  situacao?: string;
}

interface DebitosPendencias {
  debitos?: Debito[];
  pendencias?: Pendencia[];
}

interface RegistroDetalhadoProps {
  registro: {
    id: string;
    created_at: string;
    extracted_data: ExtractedData | null;
    debitos_pendencias?: DebitosPendencias | null;
  };
}

export default function RegistroDetalhado({ registro }: RegistroDetalhadoProps) {
  const data = registro.extracted_data;

  if (!data) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Dados estruturados não disponíveis. Os dados podem estar sendo processados.
        </p>
      </div>
    );
  }

  // Processar débitos e pendências
  const debitosPendencias = registro.debitos_pendencias;
  const debitos = debitosPendencias?.debitos || [];
  const pendencias = debitosPendencias?.pendencias || [];
  
  // Calcular resumo financeiro
  const totalDebitos = debitos.length;
  const totalValorOriginal = debitos.reduce((sum, d) => sum + (d.valorOriginal || 0), 0);
  const totalSaldoDevedor = debitos.reduce((sum, d) => sum + (d.saldoDevedor || 0), 0);
  const totalMulta = debitos.reduce((sum, d) => sum + (d.multa || 0), 0);
  const totalJuros = debitos.reduce((sum, d) => sum + (d.juros || 0), 0);
  const totalSaldoConsolidado = debitos.reduce((sum, d) => sum + (d.saldoDevedorConsolidado || d.saldoDevedor || 0), 0);
  const debitosVencidos = debitos.filter(d => {
    if (!d.dataVencimento) return false;
    try {
      // Converter DD/MM/YYYY para Date
      const [day, month, year] = d.dataVencimento.split('/');
      const vencimento = new Date(`${year}-${month}-${day}`);
      return !isNaN(vencimento.getTime()) && vencimento < new Date();
    } catch {
      return false;
    }
  }).length;

  return (
    <div className="space-y-4 mt-4">
      {/* Certidão Conjunta RFB/PGFN - PRIMORDIAL */}
      {(data.certidao_numero || data.certidao_data_validade) && (
        <section className={`rounded-lg border-2 p-4 ${
          data.certidao_pendencias_detectadas
            ? 'bg-red-50 border-red-300'
            : 'bg-green-50 border-green-300'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {data.certidao_pendencias_detectadas ? (
              <XCircleIcon className="h-5 w-5 text-red-600" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            )}
            <h3 className={`text-sm font-semibold ${
              data.certidao_pendencias_detectadas ? 'text-red-900' : 'text-green-900'
            }`}>
              Certidão Conjunta RFB/PGFN
              {data.certidao_pendencias_detectadas && (
                <span className="ml-2 px-2 py-0.5 bg-red-200 text-red-800 rounded text-xs font-bold">
                  COM PENDÊNCIAS
                </span>
              )}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {data.certidao_tipo && (
              <div>
                <span className="text-gray-600">Tipo:</span>
                <p className="font-medium text-gray-900">{data.certidao_tipo}</p>
              </div>
            )}
            {data.certidao_numero && (
              <div>
                <span className="text-gray-600">Número:</span>
                <p className="font-mono text-gray-900">{data.certidao_numero}</p>
              </div>
            )}
            {data.certidao_data_emissao && (
              <div>
                <span className="text-gray-600">Data de Emissão:</span>
                <p className="text-gray-900">
                  {new Date(data.certidao_data_emissao).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
            {data.certidao_data_validade && (
              <div>
                <span className="text-gray-600">Data de Validade:</span>
                <p className={`font-medium ${
                  new Date(data.certidao_data_validade) < new Date()
                    ? 'text-red-600'
                    : 'text-gray-900'
                }`}>
                  {new Date(data.certidao_data_validade).toLocaleDateString('pt-BR')}
                  {new Date(data.certidao_data_validade) < new Date() && (
                    <span className="ml-2 text-xs">(Vencida)</span>
                  )}
                </p>
              </div>
            )}
          </div>
          {data.certidao_observacao && (
            <div className="mt-3 pt-3 border-t border-gray-300">
              <p className="text-sm text-gray-700">{data.certidao_observacao}</p>
            </div>
          )}
        </section>
      )}

      {/* Resumo Financeiro - ESSENCIAL */}
      {totalDebitos > 0 && (
        <section className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border-2 border-red-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <CurrencyDollarIcon className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-bold text-red-900">Resumo Financeiro</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Total de Débitos</p>
              <p className="text-lg font-bold text-gray-900">{totalDebitos}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Valor Original</p>
              <p className="text-lg font-bold text-red-600">
                R$ {totalValorOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Multa</p>
              <p className="text-lg font-bold text-orange-600">
                R$ {totalMulta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Juros</p>
              <p className="text-lg font-bold text-orange-600">
                R$ {totalJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Saldo Consolidado</p>
              <p className="text-lg font-bold text-red-700">
                R$ {totalSaldoConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">Débitos Vencidos</p>
              <p className={`text-lg font-bold ${debitosVencidos > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {debitosVencidos}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Débitos */}
      {debitos.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ChartBarIcon className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              Débitos ({debitos.length})
              {debitos.filter(d => d.tipo === 'pendencia').length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({debitos.filter(d => d.tipo === 'pendencia').length} pendências + {debitos.filter(d => d.tipo === 'exigibilidade_suspensa').length} exig. suspensa)
                </span>
              )}
            </h3>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="min-w-full divide-y divide-gray-200 text-sm" style={{ minWidth: '1000px' }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor Original</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Saldo Devedor</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Multa</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Juros</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Saldo Consolidado</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Situação</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {debitos.map((debito, index) => {
                  let isVencido = false;
                  if (debito.dataVencimento) {
                    try {
                      const [day, month, year] = debito.dataVencimento.split('/');
                      const vencimento = new Date(`${year}-${month}-${day}`);
                      isVencido = !isNaN(vencimento.getTime()) && vencimento < new Date();
                    } catch {
                      isVencido = false;
                    }
                  }
                  return (
                    <tr key={index} className={isVencido ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 font-mono text-gray-900">{debito.codigoReceita || 'N/A'}</td>
                      <td className="px-3 py-2 text-gray-900">{debito.tipoReceita || 'N/A'}</td>
                      <td className="px-3 py-2 text-gray-900">{debito.periodo || 'N/A'}</td>
                      <td className={`px-3 py-2 ${isVencido ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                        {debito.dataVencimento || 'N/A'}
                        {isVencido && <span className="ml-1 text-xs">⚠️</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        R$ {(debito.valorOriginal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        R$ {(debito.saldoDevedor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-orange-600">
                        {(debito.multa || 0) > 0 ? (
                          <span className="font-medium">
                            R$ {(debito.multa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-orange-600">
                        {(debito.juros || 0) > 0 ? (
                          <span className="font-medium">
                            R$ {(debito.juros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-red-700">
                        R$ {(debito.saldoDevedorConsolidado || debito.saldoDevedor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            debito.situacao?.includes('VENCER') ? 'bg-yellow-100 text-yellow-800' :
                            debito.situacao?.includes('VENCIDO') || debito.situacao === 'DEVEDOR' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {debito.situacao || 'N/A'}
                          </span>
                          {debito.tipo && (
                            <span className="text-xs text-gray-500">
                              {debito.tipo === 'pendencia' ? 'Pendência' : 'Exig. Suspensa'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pendências */}
      {pendencias.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationCircleIcon className="h-5 w-5 text-orange-600" />
            <h3 className="text-sm font-semibold text-gray-900">Pendências e Diagnóstico Fiscal</h3>
          </div>
          <div className="space-y-2">
            {pendencias.map((pendencia, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  pendencia.situacao === 'SEM PENDÊNCIAS'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-orange-50 border-orange-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {pendencia.situacao === 'SEM PENDÊNCIAS' ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ExclamationCircleIcon className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    {pendencia.tipo && (
                      <p className="text-sm font-semibold text-gray-900 mb-1">{pendencia.tipo}</p>
                    )}
                    <p className="text-sm text-gray-700">{pendencia.descricao || 'N/A'}</p>
                    {pendencia.situacao && (
                      <p className={`text-xs font-medium mt-1 ${
                        pendencia.situacao === 'SEM PENDÊNCIAS' ? 'text-green-700' : 'text-orange-700'
                      }`}>
                        {pendencia.situacao}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

