import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import Alert from '../components/UI/Alert';
import {
  DocumentMagnifyingGlassIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export default function SituacaoFiscal() {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const toast = useToast();
  const [history, setHistory] = useState<Array<{ id: string; cnpj: string; file_url?: string | null; created_at: string; cliente?: { razao_social: string } | null }>>([]);
  const [historyFilter, setHistoryFilter] = useState('');
  const countdownRef = useRef<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string | null; cnpj: string; countdown: number }>({ id: null, cnpj: '', countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<NodeJS.Timeout | null>(null);

  const handleConsultarRetry = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const clean = cnpj.replace(/\D/g, '');
      
      // Não resetar os passos - continuar de onde parou
      // 2) Continuar orquestração de download
      const res = await fetch(`/api/situacao-fiscal/${clean}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (res.status === 202) {
        const body = await res.json().catch(() => ({}));
        const retry = Number(res.headers.get('Retry-After') || '5');
        const step = body.step || 'protocolo';
        
        // Atualizar passos completos baseado no step
        if (step === 'protocolo') {
          setCompletedSteps(new Set(['token', 'protocolo']));
          setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.');
        } else if (step === 'emitir') {
          setCompletedSteps(new Set(['token', 'protocolo', 'emitir']));
          setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.\n✓ Passo 3: Emitindo relatório...');
        }
        
        setRetryAfter(Number.isNaN(retry) ? 5 : retry);
        toast.info(`Relatório em processamento. Tentando novamente em ${Number.isNaN(retry) ? 5 : retry}s...`);
        return;
      }
      
      if (!res.ok) {
        let msg = `Falha (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') {
            msg = body.error;
          } else if (body?.error?.message) {
            msg = body.error.message;
          } else if (typeof body?.message === 'string') {
            msg = body.message;
          }
        } catch {
          // mantém msg sucinta
        }
        throw new Error(msg);
      }
      
      // 3) PDF pronto - todos os passos concluídos
      // Backend retorna JSON, não blob
      const body = await res.json();
      setCompletedSteps(new Set(['token', 'protocolo', 'emitir']));
      setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.\n✓ Passo 3: Relatório emitido com sucesso.\n\n✓ Concluído com Sucesso!');
      setShowSuccess(true);
      
      toast.success('Relatório gerado com sucesso! Disponível na tabela abaixo.');
      
      // atualizar histórico - fetchHistory será definido depois
      const qs = new URLSearchParams();
      qs.set('cnpj', clean);
      qs.set('limit', '20');
      const historyRes = await fetch(`/api/situacao-fiscal/history?${qs.toString()}`);
      if (historyRes.ok) {
        const historyBody = await historyRes.json();
        setHistory(historyBody?.items ?? []);
      }
    } catch (e: any) {
      const msg = (e?.message || 'Erro ao consultar a Situação Fiscal').toString().slice(0, 300);
      setError('Não foi possível concluir a operação. ' + msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [cnpj, toast]);
  
  useEffect(() => {
    if (retryAfter != null && retryAfter > 0) {
      const id = window.setInterval(() => {
        setRetryAfter((prev) => {
          if (prev == null) return null;
          if (prev <= 1) {
            window.clearInterval(id);
            countdownRef.current = null;
            // Manter os passos já completos ao fazer retry
            void handleConsultarRetry();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      countdownRef.current = id;
      return () => window.clearInterval(id);
    }
  }, [retryAfter, handleConsultarRetry]);

  const disabled = useMemo(() => {
    const clean = cnpj.replace(/\D/g, '');
    return loading || clean.length !== 14 || (retryAfter != null && retryAfter > 0);
  }, [cnpj, loading, retryAfter]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCnpj(formatCNPJ(value));
  };

  const handleConsultar = async () => {
    try {
      setLoading(true);
      setError(null);
      setRetryAfter(null);
      setSuccessMessage(null);
      setShowSuccess(false);
      setCompletedSteps(new Set());
      const clean = cnpj.replace(/\D/g, '');
      
      // 1) Validar token (Passo 1)
      const tokenResp = await fetch('/api/situacao-fiscal/token');
      if (!tokenResp.ok) {
        let msg = 'Falha ao validar token';
        try {
          const body = await tokenResp.json();
          if (typeof body?.error === 'string') {
            msg = body.error;
          } else if (body?.error?.message) {
            msg = body.error.message;
          } else if (typeof body?.message === 'string') {
            msg = body.message;
          }
        } catch {
          // fallback discreto
        }
        toast.error(msg);
        setError('Não foi possível validar o acesso. Verifique as credenciais e tente novamente.');
        return;
      }
      setCompletedSteps(new Set(['token']));
      setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.');
      setShowSuccess(true);

      // 2) Iniciar orquestração de download
      const res = await fetch(`/api/situacao-fiscal/${clean}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (res.status === 202) {
        const body = await res.json().catch(() => ({}));
        const retry = Number(res.headers.get('Retry-After') || '5');
        const step = body.step || 'protocolo';
        
        // Atualizar passos completos baseado no step
        if (step === 'protocolo') {
          setCompletedSteps(new Set(['token', 'protocolo']));
          setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.');
        } else if (step === 'emitir') {
          setCompletedSteps(new Set(['token', 'protocolo', 'emitir']));
          setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.\n✓ Passo 3: Emitindo relatório...');
        }
        
        setRetryAfter(Number.isNaN(retry) ? 5 : retry);
        toast.info(`Relatório em processamento. Tentando novamente em ${Number.isNaN(retry) ? 5 : retry}s...`);
        return;
      }
      
      if (!res.ok) {
        let msg = `Falha (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') {
            msg = body.error;
          } else if (body?.error?.message) {
            msg = body.error.message;
          } else if (typeof body?.message === 'string') {
            msg = body.message;
          }
        } catch {
          // mantém msg sucinta
        }
        throw new Error(msg);
      }
      
      // 3) PDF pronto - todos os passos concluídos
      setCompletedSteps(new Set(['token', 'protocolo', 'emitir']));
      setSuccessMessage('✓ Passo 1: Access Token obtido com sucesso.\n✓ Passo 2: Protocolo obtido com sucesso.\n✓ Passo 3: Relatório emitido com sucesso.\n\n✓ Concluído com Sucesso!');
      setShowSuccess(true);
      
      toast.success('Relatório gerado com sucesso! Disponível na tabela abaixo.');
      
      // atualizar histórico para mostrar o arquivo na tabela
      void fetchHistory(clean);
    } catch (e: any) {
      const msg = (e?.message || 'Erro ao consultar a Situação Fiscal').toString().slice(0, 300);
      setError('Não foi possível concluir a operação. ' + msg);
      toast.error(msg);
      setShowSuccess(false);
      setSuccessMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (cnpjParam?: string) => {
    const clean = (cnpjParam || cnpj).replace(/\D/g, '');
    const qs = new URLSearchParams();
    if (clean.length === 14) qs.set('cnpj', clean);
    qs.set('limit', '20');
    const res = await fetch(`/api/situacao-fiscal/history?${qs.toString()}`);
    if (res.ok) {
      const body = await res.json();
      setHistory(body?.items ?? []);
    }
  };

  const handleDeleteClick = (id: string, cnpj: string) => {
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ id, cnpj, countdown: 3 });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDelete(id);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const cancelDelete = () => {
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    setPendingDelete({ id: null, cnpj: '', countdown: 0 });
  };

  const executeDelete = async (id: string) => {
    // Limpar estado de exclusão pendente
    setPendingDelete({ id: null, cnpj: '', countdown: 0 });

    try {
      const res = await fetch(`/api/situacao-fiscal/history/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Registro excluído com sucesso');
        // Atualizar histórico
        void fetchHistory();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || 'Erro ao excluir registro');
      }
    } catch (e: any) {
      toast.error('Erro ao excluir registro');
    }
  };

  // Limpar timer ao desmontar componente
  useEffect(() => {
    return () => {
      if (deleteTimer) {
        clearInterval(deleteTimer);
      }
    };
  }, [deleteTimer]);

  useEffect(() => {
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <DocumentMagnifyingGlassIcon className="h-8 w-8 text-blue-600" />
          Situação Fiscal
        </h1>
        <p className="text-gray-600">Consulte a situação fiscal de empresas através da Receita Federal</p>
      </div>

      {/* Card de Consulta */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <DocumentMagnifyingGlassIcon className="h-5 w-5 text-blue-600" />
            Nova Consulta
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Informe o CNPJ e clique em "Consultar Receita". Se o relatório estiver em processamento, um contador aparecerá e a página tentará automaticamente assim que estiver pronto.
          </p>
        </div>
        
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 md:items-end">
            <div className="flex-1 max-w-md">
              <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
                CNPJ
              </label>
              <div className="relative">
                <BuildingOfficeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="cnpj"
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={handleInput}
                  maxLength={18}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleConsultar}
                disabled={disabled}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm hover:shadow"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Consultando...
                  </>
                ) : retryAfter != null && retryAfter > 0 ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Aguardando... {retryAfter}s
                  </>
                ) : (
                  <>
                    <MagnifyingGlassIcon className="h-5 w-5" />
                    Consultar Receita
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Alertas de sucesso (passos) */}
          {showSuccess && successMessage && (
            <div className="mt-4">
              <Alert type="success" onClose={() => setShowSuccess(false)}>
                <div className="whitespace-pre-wrap">{successMessage}</div>
              </Alert>
            </div>
          )}

          {/* Alert de Erro */}
          {error && (
            <div className="mt-4">
              <Alert type="error" onClose={() => setError(null)}>
                <div className="whitespace-pre-wrap break-words">{error}</div>
              </Alert>
            </div>
          )}
        </div>
      </div>

      {/* Histórico de downloads */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <DocumentArrowDownIcon className="h-5 w-5 text-gray-600" />
            Downloads Recentes
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder="Filtrar por CNPJ..."
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              />
            </div>
            <button
              onClick={() => fetchHistory(historyFilter)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              Buscar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Razão Social</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <DocumentArrowDownIcon className="h-12 w-12 text-gray-400" />
                      <p className="text-gray-500 font-medium">Nenhum download recente</p>
                      <p className="text-sm text-gray-400">Realize uma consulta acima para gerar relatórios</p>
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{formatCNPJ(h.cnpj)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {h.cliente?.razao_social || <span className="text-gray-400 italic">Não cadastrado</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                        {new Date(h.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {h.file_url ? (
                          <>
                            <a
                              href={h.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <EyeIcon className="h-4 w-4" />
                              Visualizar
                            </a>
                            <a
                              href={h.file_url}
                              download
                              className="px-3 py-1.5 text-sm font-medium text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                              Baixar PDF
                            </a>
                            <button
                              onClick={() => handleDeleteClick(h.id, h.cnpj)}
                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Indisponível</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert de exclusão pendente */}
      {pendingDelete.id && pendingDelete.countdown > 0 && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg shadow-2xl px-6 py-4 min-w-[320px] animate-toast-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">
                  Exclusão em {pendingDelete.countdown} segundo{pendingDelete.countdown !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-white/90 mt-1">
                  CNPJ: {formatCNPJ(pendingDelete.cnpj)}
                </p>
              </div>
            </div>
            
            {/* Barra de progresso */}
            <div className="w-full bg-yellow-200/30 rounded-full h-2 mb-3">
              <div 
                className="bg-white h-2 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(pendingDelete.countdown / 3) * 100}%` }}
              />
            </div>
            
            {/* Botão de cancelar */}
            <button
              onClick={cancelDelete}
              className="w-full px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium"
            >
              Cancelar Exclusão
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toast-fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-toast-slide-in {
          animation: toast-slide-in 0.3s ease-out;
        }
        .animate-toast-fade-in {
          animation: toast-fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}


