import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import Alert from '../components/UI/Alert';

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

  useEffect(() => {
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-lg font-semibold text-gray-900">Situação Fiscal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Informe o CNPJ e clique em “Consultar Receita”. Se o relatório estiver em processamento, um contador aparecerá e a página tentará automaticamente assim que estiver pronto.
        </p>
        <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-end">
          <div className="w-full md:w-64">
            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
              CNPJ
            </label>
            <input
              id="cnpj"
              type="text"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={handleInput}
              maxLength={18}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleConsultar}
              disabled={disabled}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Consultando…' : retryAfter != null && retryAfter > 0 ? `Aguardando… ${retryAfter}s` : 'Consultar Receita'}
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

      {/* Histórico de downloads */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-semibold text-gray-900">Downloads recentes</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Filtrar por CNPJ..."
              className="w-56 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => fetchHistory(historyFilter)}
              className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
            >
              Buscar
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Razão Social</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">{formatCNPJ(h.cnpj)}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {h.cliente?.razao_social || <span className="text-gray-400 italic">Não cadastrado</span>}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2 text-sm">
                    {h.file_url ? (
                      <div className="flex items-center gap-3">
                        <a
                          href={h.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Visualizar
                        </a>
                        <a
                          href={h.file_url}
                          download
                          className="text-green-600 hover:text-green-800"
                        >
                          Baixar PDF
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-400">Indisponível</span>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={4}>
                    Nenhum download recente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


