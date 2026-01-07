import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import Alert from '../components/UI/Alert';
import { clientesService } from '../services/clientes';
import type { Cliente } from '../types';
import {
  DocumentMagnifyingGlassIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  TrashIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import RegistroDetalhado from '../components/SituacaoFiscal/RegistroDetalhado';

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export default function SituacaoFiscal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const toast = useToast();
  
  const [history, setHistory] = useState<Array<{ id: string; cnpj: string; file_url?: string | null; has_pdf_base64?: boolean; created_at: string; cliente?: { razao_social: string } | null }>>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const historyLimit = 10; // Paginação de 10 em 10
  const countdownRef = useRef<number | null>(null);
  const isConsultingRef = useRef<boolean>(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string | null; cnpj: string; countdown: number }>({ id: null, cnpj: '', countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'consulta' | 'empresas' | 'lixeira'>('consulta');
  const [archivedProtocols, setArchivedProtocols] = useState<Array<{
    cnpj: string;
    razao_social: string | null;
    protocolo: string;
    protocolo_truncado: string | null;
    status: string;
    expires_at: string | null;
    next_eligible_at: string | null;
    created_at: string;
    updated_at: string;
    tempo_restante: {
      dias: number;
      horas: number;
      minutos: number;
      total_segundos: number;
      is_valid: boolean;
      texto_formatado: string;
    } | null;
  }>>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [restoringProtocol, setRestoringProtocol] = useState<{ cnpj: string; razao_social: string | null } | null>(null);
  const [companies, setCompanies] = useState<Array<{
    cnpj: string;
    razao_social: string | null;
    total_registros: number;
    ultimo_registro: string;
    registros: Array<{
      id: string;
      created_at: string;
      file_url: string | null;
      has_pdf_base64: boolean;
      extracted_data: any | null;
      debitos_pendencias?: {
        debitos?: Array<{
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
        }>;
        pendencias?: Array<{
          tipo?: string;
          descricao?: string;
          situacao?: string;
        }>;
      } | null;
    }>;
  }>>([]);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [filteredCnpj, setFilteredCnpj] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Ler CNPJ da query string ao montar o componente
  useEffect(() => {
    const cnpjParam = searchParams.get('cnpj');
    if (cnpjParam) {
      // Formatar o CNPJ se vier da URL
      const cnpjLimpo = cnpjParam.replace(/\D/g, '');
      if (cnpjLimpo.length === 14) {
        setCnpj(formatCNPJ(cnpjLimpo));
      } else {
        setCnpj(cnpjParam);
      }
      // Scroll para o topo quando CNPJ vier da query string
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [searchParams]);

  // Função para visualizar cliente por CNPJ - redireciona para aba Clientes
  const handleViewClientePorCNPJ = async (cnpj: string) => {
    try {
      const resp = await clientesService.buscarPorCNPJ(cnpj);
      if (resp?.success && resp.data && resp.data.id) {
        // Redirecionar para aba Clientes com o cliente selecionado
        navigate(`/clientes?clienteId=${resp.data.id}`);
        // Scroll para o topo após navegação
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      } else {
        toast.error('Cliente não encontrado para este CNPJ');
      }
    } catch (error: any) {
      console.error('Erro ao buscar cliente:', error);
      toast.error(error.response?.data?.error || 'Erro ao buscar cliente');
    }
  };

  const handleConsultarRetry = useCallback(async () => {
    // Proteção contra múltiplas chamadas simultâneas
    if (isConsultingRef.current) {
      console.log('[Frontend] Retry já em andamento, ignorando chamada duplicada');
      return;
    }
    
    try {
      isConsultingRef.current = true;
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
      await res.json();
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
      
      // Limpar campo CNPJ após sucesso
      setCnpj('');
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
    // Proteção contra múltiplas chamadas simultâneas
    if (isConsultingRef.current) {
      console.log('[Frontend] Consulta já em andamento, ignorando chamada duplicada');
      return;
    }
    
    try {
      isConsultingRef.current = true;
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
      // Aguardar um pouco para garantir que o banco foi atualizado
      setTimeout(() => {
        void fetchHistory(); // Sem filtro para buscar todos os registros
      }, 1000);
      
      // Limpar campo CNPJ após sucesso
      setCnpj('');
    } catch (e: any) {
      const msg = (e?.message || 'Erro ao consultar a Situação Fiscal').toString().slice(0, 300);
      setError('Não foi possível concluir a operação. ' + msg);
      toast.error(msg);
      setShowSuccess(false);
      setSuccessMessage(null);
    } finally {
      setLoading(false);
      isConsultingRef.current = false;
    }
  };

  const fetchHistory = async (cnpjParam?: string, page: number = historyPage) => {
    try {
      const clean = cnpjParam ? cnpjParam.replace(/\D/g, '') : '';
      const offset = (page - 1) * historyLimit;
      const qs = new URLSearchParams();
      if (clean && clean.length === 14) qs.set('cnpj', clean);
      qs.set('limit', String(historyLimit));
      qs.set('offset', String(offset));
      
      const url = `/api/situacao-fiscal/history?${qs.toString()}`;
      console.log(`[SituacaoFiscal] Buscando histórico: ${url} (página ${page}, offset ${offset})`);
      
      const res = await fetch(url);
      
      if (!res.ok) {
        console.error('[SituacaoFiscal] Erro ao buscar histórico:', res.status, res.statusText);
        const errorBody = await res.json().catch(() => ({}));
        console.error('[SituacaoFiscal] Detalhes do erro:', errorBody);
        setHistory([]);
        setHistoryTotal(0);
        return;
      }
      
      const body = await res.json();
      const items = body?.items ?? [];
      const total = body?.total ?? 0;
      console.log(`[SituacaoFiscal] Histórico carregado: ${items.length} registros de ${total} total (página ${page}, offset ${offset})`);
      console.log(`[SituacaoFiscal] Dados recebidos:`, body);
      
      setHistory(items);
      setHistoryTotal(total);
      setHistoryPage(page);
    } catch (error) {
      console.error('[SituacaoFiscal] Erro ao buscar histórico:', error);
      setHistory([]);
      setHistoryTotal(0);
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

  const handleDownloadPDF = async (id: string, cnpj: string) => {
    try {
      // Usar endpoint do backend em vez de URL do Supabase
      const response = await fetch(`/api/situacao-fiscal/pdf/${id}`);
      if (!response.ok) {
        throw new Error('Erro ao baixar PDF');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `situacao-fiscal-${cnpj.replace(/\D/g, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado com sucesso');
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      toast.error('Erro ao baixar PDF');
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

  const fetchCompanies = useCallback(async () => {
    try {
      setLoadingCompanies(true);
      const res = await fetch('/api/situacao-fiscal/companies');
      if (res.ok || res.status === 304) {
        // 304 Not Modified também é válido (cache hit)
        if (res.status === 304) {
          // Se for cache, não precisa fazer nada, manter dados atuais
          return;
        }
        const body = await res.json();
        setCompanies(body?.companies ?? []);
      }
    } catch (error) {
      console.error('Erro ao buscar empresas:', error);
      toast.error('Erro ao buscar empresas');
    } finally {
      setLoadingCompanies(false);
    }
  }, [toast]);

  const toggleCompany = (cnpj: string) => {
    setExpandedCompanies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cnpj)) {
        newSet.delete(cnpj);
      } else {
        newSet.add(cnpj);
      }
      return newSet;
    });
  };

  const getCertidaoStatus = useCallback((registros: Array<{ created_at: string; extracted_data: any | null }>) => {
    // Buscar o registro mais recente com dados extraídos
    const registroComDados = registros
      .filter(r => r.extracted_data)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    if (!registroComDados?.extracted_data) {
      return null; // Sem dados de certidão
    }

    const certidao = registroComDados.extracted_data;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Obter tipo da certidão (Positiva, Negativa, ou Positiva com Efeitos de Negativa)
    const tipoCertidao = certidao.certidao_tipo || '';
    const tipoLower = tipoCertidao.toLowerCase();
    const isPositivaComEfeitos = tipoLower.includes('efeitos') || tipoLower.includes('positiva com efeitos');
    const isPositiva = tipoLower.includes('positiva');
    const isNegativa = tipoLower.includes('negativa') && !isPositivaComEfeitos;
    
    // Determinar texto base do tipo
    let tipoTexto = '';
    if (isPositivaComEfeitos) {
      tipoTexto = 'Positiva c/ Efeitos';
    } else if (isPositiva) {
      tipoTexto = 'Positiva';
    } else if (isNegativa) {
      tipoTexto = 'Negativa';
    } else {
      tipoTexto = 'OK'; // Fallback se não conseguir determinar o tipo
    }

    // Verificar se há pendências detectadas
    const temPendencias = certidao.certidao_pendencias_detectadas === true;

    // Verificar se está vencida
    let estaVencida = false;
    if (certidao.certidao_data_validade) {
      try {
        const dataValidade = new Date(certidao.certidao_data_validade);
        dataValidade.setHours(0, 0, 0, 0);
        estaVencida = dataValidade < hoje;
      } catch {
        // Se não conseguir parsear a data, considerar como não vencida
      }
    }

    // Determinar status e cores - prioridade: pendências > vencida > tipo (Positiva/Negativa)
    if (temPendencias) {
      return {
        status: 'pendencia',
        texto: tipoTexto ? `${tipoTexto} - Com Pendências` : 'Com Pendências',
        cor: 'red',
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        borderColor: 'border-red-300',
        icon: '⚠️'
      };
    }

    if (estaVencida) {
      return {
        status: 'vencida',
        texto: tipoTexto ? `${tipoTexto} - Vencida` : 'Vencida',
        cor: 'orange',
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-800',
        borderColor: 'border-orange-300',
        icon: '⏰'
      };
    }

    // Certidão OK - mostrar tipo (Positiva ou Negativa)
    return {
      status: 'ok',
      texto: tipoTexto,
      cor: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-300',
      icon: '✓'
    };
  }, []);

  const navigateToCompanyDetails = useCallback((cnpj: string) => {
    // Mudar para aba de empresas
    setActiveTab('empresas');
    
    // Filtrar para mostrar apenas esta empresa
    setFilteredCnpj(cnpj);
    
    // Expandir a empresa correspondente
    setExpandedCompanies((prev) => {
      const newSet = new Set(prev);
      newSet.add(cnpj);
      return newSet;
    });
    
    // Aguardar um pouco para garantir que o DOM foi atualizado antes de fazer scroll
    setTimeout(() => {
      // Fazer scroll até o elemento da empresa
      const element = document.getElementById(`company-${cnpj}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Adicionar destaque visual temporário com animação
        element.classList.add('ring-4', 'ring-blue-400', 'ring-offset-2', 'bg-blue-50', 'transition-all', 'duration-300');
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-blue-400', 'ring-offset-2', 'bg-blue-50');
        }, 3000);
      }
    }, 200);
  }, []);

  const fetchArchivedProtocols = useCallback(async () => {
    setLoadingProtocols(true);
    try {
      const res = await fetch('/api/situacao-fiscal/protocols/archived', {
        cache: 'no-cache', // Forçar sempre buscar dados atualizados
      });
      // 304 Not Modified também é válido (cache hit), mas vamos ignorar para sempre buscar dados frescos
      if (res.status === 304) {
        // Se for cache, não fazer nada, manter dados atuais
        setLoadingProtocols(false);
        return;
      }
      if (!res.ok) throw new Error('Erro ao buscar protocolos arquivados');
      const data = await res.json();
      if (data.success) {
        setArchivedProtocols(data.protocols || []);
      }
    } catch (err: any) {
      console.error('Erro ao buscar protocolos arquivados:', err);
      toast.error('Erro ao buscar protocolos arquivados');
    } finally {
      setLoadingProtocols(false);
    }
  }, [toast]);

  const restoreProtocol = useCallback(async (cnpj: string, razaoSocial: string | null = null) => {
    // Mostrar alerta de processamento
    setRestoringProtocol({ cnpj, razao_social: razaoSocial });
    
    try {
      const res = await fetch(`/api/situacao-fiscal/protocols/${cnpj}/restore`, {
        method: 'POST',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setRestoringProtocol(null);
        
        // Verificar se o protocolo está inválido
        if (res.status === 400 && data.protocolInvalid) {
          toast.error('Protocolo inválido', 'O protocolo utilizado não é mais válido. É necessário fazer uma nova consulta.');
          // Atualizar lista de protocolos para remover o inválido
          await fetchArchivedProtocols();
        } else if (res.status === 400) {
          toast.error('Protocolo expirado', data.error || 'O protocolo expirou. É necessário solicitar um novo protocolo.');
          // Atualizar lista de protocolos
          await fetchArchivedProtocols();
        } else {
          toast.error(data.error || 'Erro ao restaurar protocolo');
        }
        return;
      }
      
      if (res.status === 202) {
        // Precisa aguardar - manter o alerta visível
        toast.info(data.message || 'Aguardando processamento...');
        // Atualizar lista de protocolos
        await fetchArchivedProtocols();
        
        // Se houver retryAfter, aguardar e tentar novamente
        if (data.retryAfter) {
          setRetryAfter(data.retryAfter);
          // Mudar para aba de consulta para ver o progresso
          setActiveTab('consulta');
          setCnpj(cnpj);
          // Manter o alerta até que a consulta seja concluída
          // O alerta será removido quando o histórico for atualizado
        } else {
          setRestoringProtocol(null);
        }
        return;
      }
      
      // Sucesso - consulta iniciada ou concluída
      if (data.step === 'concluido') {
        setRestoringProtocol(null);
        toast.success('Relatório gerado com sucesso usando protocolo restaurado!');
        // Atualizar todas as listas
        await Promise.all([
          fetchArchivedProtocols(),
          fetchHistory(),
          fetchCompanies(),
        ]);
        // Mudar para aba de consulta para ver o resultado
        setActiveTab('consulta');
        setCnpj(cnpj);
      } else {
        toast.info(data.message || 'Protocolo restaurado. Aguardando processamento...');
        // Atualizar lista de protocolos
        await fetchArchivedProtocols();
        
        // Se houver retryAfter, aguardar e tentar novamente
        if (data.retryAfter) {
          setRetryAfter(data.retryAfter);
          // Mudar para aba de consulta para ver o progresso
          setActiveTab('consulta');
          setCnpj(cnpj);
        } else {
          setRestoringProtocol(null);
        }
      }
    } catch (err: any) {
      console.error('Erro ao restaurar protocolo:', err);
      setRestoringProtocol(null);
      
      // Verificar se é erro de protocolo inválido
      const errorMessage = err?.message || '';
      if (errorMessage.includes('protocolo') && errorMessage.includes('não é mais válido')) {
        toast.error('Protocolo inválido', 'O protocolo utilizado não é mais válido. É necessário fazer uma nova consulta.');
        // Atualizar lista de protocolos
        await fetchArchivedProtocols();
      } else {
        toast.error('Erro ao restaurar protocolo', errorMessage || 'Erro desconhecido');
      }
    }
  }, [toast, fetchArchivedProtocols, fetchHistory, fetchCompanies]);

  useEffect(() => {
    setHistoryPage(1);
    void fetchHistory(undefined, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'empresas') {
      void fetchCompanies();
    } else if (activeTab === 'lixeira') {
      void fetchArchivedProtocols();
      // Limpar filtro e busca quando sair da aba de empresas
      setFilteredCnpj(null);
      setSearchTerm('');
    } else if (activeTab === 'consulta') {
      // Limpar filtro e busca quando voltar para consulta
      setFilteredCnpj(null);
      setSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Remover dependências das funções para evitar loop infinito

  // Remover alerta de restauração quando histórico for atualizado e houver novos downloads
  useEffect(() => {
    if (restoringProtocol && history.length > 0) {
      // Verificar se há um download recente para o CNPJ que está sendo restaurado
      const recentDownload = history.find(h => h.cnpj === restoringProtocol.cnpj);
      if (recentDownload) {
        // Aguardar um pouco antes de remover o alerta para dar tempo do usuário ver
        const timer = setTimeout(() => {
          setRestoringProtocol(null);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [history, restoringProtocol]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center gap-3">
          <DocumentMagnifyingGlassIcon className="h-7 w-7 text-blue-600" />
          Situação Fiscal
        </h1>
        <p className="text-base text-gray-600">Consulte a situação fiscal de empresas através da Receita Federal</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('consulta')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'consulta'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <DocumentMagnifyingGlassIcon className="h-5 w-5" />
              Nova Consulta
            </div>
          </button>
          <button
            onClick={() => setActiveTab('empresas')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'empresas'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BuildingOfficeIcon className="h-5 w-5" />
              Empresas
              {companies.length > 0 && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {companies.length}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('lixeira')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lixeira'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrashIcon className="h-5 w-5" />
              Lixeira
              {archivedProtocols.length > 0 && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {archivedProtocols.length}
                </span>
              )}
            </div>
          </button>
        </nav>
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'consulta' && (
        <>
      {/* Card de Consulta */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <DocumentArrowDownIcon className="h-5 w-5 text-gray-600" />
              Downloads Recentes
              {historyTotal > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({history.length} de {historyTotal} {historyTotal === 1 ? 'registro' : 'registros'})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setHistoryPage(1);
                      fetchHistory(historyFilter, 1);
                    }
                  }}
                  placeholder="Filtrar por CNPJ..."
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                />
              </div>
              <button
                onClick={() => {
                  setHistoryPage(1);
                  fetchHistory(historyFilter, 1);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                Buscar
              </button>
            </div>
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
                    <td className="px-6 py-4 whitespace-nowrap">
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
                        {(h.has_pdf_base64 || h.file_url) ? (
                          <>
                            <button
                              onClick={() => navigateToCompanyDetails(h.cnpj)}
                              className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors flex items-center gap-1.5"
                              title="Ver detalhes completos"
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                              Detalhes
                            </button>
                            <a
                              href={`/api/situacao-fiscal/pdf/${h.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <EyeIcon className="h-4 w-4" />
                              Visualizar
                            </a>
                            <button
                              onClick={() => handleDownloadPDF(h.id, h.cnpj)}
                              className="px-3 py-1.5 text-sm font-medium text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                              Baixar PDF
                            </button>
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
        
        {/* Controles de Paginação */}
        {historyTotal > historyLimit && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col items-center gap-4">
            <div className="text-sm text-gray-600">
              Mostrando {history.length > 0 ? ((historyPage - 1) * historyLimit) + 1 : 0} a {Math.min(historyPage * historyLimit, historyTotal)} de {historyTotal} registros
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newPage = historyPage - 1;
                  if (newPage >= 1) {
                    setHistoryPage(newPage);
                    fetchHistory(historyFilter || undefined, newPage);
                  }
                }}
                disabled={historyPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Anterior
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(historyTotal / historyLimit)) }, (_, i) => {
                  const totalPages = Math.ceil(historyTotal / historyLimit);
                  let pageNum: number;
                  
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (historyPage <= 3) {
                    pageNum = i + 1;
                  } else if (historyPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = historyPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setHistoryPage(pageNum);
                        fetchHistory(historyFilter || undefined, pageNum);
                      }}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        historyPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => {
                  const totalPages = Math.ceil(historyTotal / historyLimit);
                  const newPage = historyPage + 1;
                  if (newPage <= totalPages) {
                    setHistoryPage(newPage);
                    fetchHistory(historyFilter || undefined, newPage);
                  }
                }}
                disabled={historyPage >= Math.ceil(historyTotal / historyLimit)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                Próxima
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'empresas' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-1">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <BuildingOfficeIcon className="h-5 w-5 text-gray-600" />
                  Empresas com Registros
                </h2>
                {filteredCnpj && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                      Mostrando apenas: {formatCNPJ(filteredCnpj)}
                    </span>
                    <button
                      onClick={() => {
                        setFilteredCnpj(null);
                        setSearchTerm('');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                      title="Mostrar todas as empresas"
                    >
                      Mostrar todas
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por CNPJ ou Razão Social..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      title="Limpar busca"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cabeçalho das colunas */}
          {!loadingCompanies && (() => {
            // Filtrar empresas por CNPJ específico (quando vem de "Detalhes")
            let filteredCompanies = filteredCnpj 
              ? companies.filter(c => c.cnpj === filteredCnpj)
              : companies;
            
            // Aplicar busca por CNPJ ou Razão Social
            if (searchTerm.trim()) {
              const searchLower = searchTerm.toLowerCase().trim();
              const searchNumbers = searchLower.replace(/\D/g, ''); // Remove formatação do CNPJ (apenas números)
              
              filteredCompanies = filteredCompanies.filter(c => {
                // Busca por CNPJ (apenas se houver números na busca)
                const cnpjMatch = searchNumbers.length > 0 
                  ? c.cnpj.replace(/\D/g, '').includes(searchNumbers)
                  : false;
                
                // Busca por Razão Social (sempre verifica, mesmo se houver números)
                const razaoSocial = (c.razao_social || '').toLowerCase().trim();
                const razaoMatch = razaoSocial.includes(searchLower);
                
                return cnpjMatch || razaoMatch;
              });
            }
            
            if (filteredCompanies.length > 0) {
              return (
                <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-5">
                      <span className="text-xs font-semibold text-gray-600 uppercase">Empresa</span>
                    </div>
                    <div className="col-span-3 flex items-center justify-center">
                      <span className="text-xs font-semibold text-gray-600 uppercase">Status</span>
                    </div>
                    <div className="col-span-4 flex items-center justify-end">
                      <span className="text-xs font-semibold text-gray-600 uppercase">Ações</span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="divide-y divide-gray-200">
            {loadingCompanies ? (
              <div className="px-6 py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-600">Carregando empresas...</p>
              </div>
            ) : (() => {
              // Filtrar empresas por CNPJ específico (quando vem de "Detalhes")
              let filteredCompanies = filteredCnpj 
                ? companies.filter(c => c.cnpj === filteredCnpj)
                : companies;
              
              // Aplicar busca por CNPJ ou Razão Social
              if (searchTerm.trim()) {
                const searchLower = searchTerm.toLowerCase().trim();
                const searchNumbers = searchLower.replace(/\D/g, ''); // Remove formatação do CNPJ (apenas números)
                
                filteredCompanies = filteredCompanies.filter(c => {
                  // Busca por CNPJ (apenas se houver números na busca)
                  const cnpjMatch = searchNumbers.length > 0 
                    ? c.cnpj.replace(/\D/g, '').includes(searchNumbers)
                    : false;
                  
                  // Busca por Razão Social (sempre verifica, mesmo se houver números)
                  const razaoSocial = (c.razao_social || '').toLowerCase().trim();
                  const razaoMatch = razaoSocial.includes(searchLower);
                  
                  return cnpjMatch || razaoMatch;
                });
              }
              
              if (filteredCompanies.length === 0) {
                return (
                  <div className="px-6 py-12 text-center">
                    <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">
                      {searchTerm ? 'Nenhuma empresa encontrada para a busca' : filteredCnpj ? 'Empresa não encontrada' : 'Nenhuma empresa encontrada'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {searchTerm ? 'Tente buscar por CNPJ ou Razão Social' : filteredCnpj ? 'A empresa selecionada não possui registros' : 'Realize consultas para gerar registros'}
                    </p>
                  </div>
                );
              }
              
              return filteredCompanies.map((company) => {
                const isExpanded = expandedCompanies.has(company.cnpj);
                return (
                  <div key={company.cnpj} id={`company-${company.cnpj}`} className="hover:bg-gray-50 transition-colors">
                    <div
                      className="px-6 py-4 cursor-pointer"
                      onClick={() => toggleCompany(company.cnpj)}
                    >
                      <div className="grid grid-cols-12 gap-4 items-center">
                        {/* Coluna do Chevron e Nome */}
                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewClientePorCNPJ(company.cnpj);
                                }}
                                className="text-sm font-semibold text-gray-900 hover:text-blue-600 truncate text-left underline hover:no-underline transition-colors"
                                title="Clique para ver detalhes do cliente"
                              >
                                {company.razao_social || 'Empresa não cadastrada'}
                              </button>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="font-mono">{formatCNPJ(company.cnpj)}</span>
                              <span className="flex items-center gap-1">
                                <DocumentArrowDownIcon className="h-3.5 w-3.5" />
                                {company.total_registros} registro{company.total_registros !== 1 ? 's' : ''}
                              </span>
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                {new Date(company.ultimo_registro).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Coluna Status */}
                        <div className="col-span-3 flex items-center justify-center">
                          {(() => {
                            const certidaoStatus = getCertidaoStatus(company.registros);
                            if (certidaoStatus) {
                              return (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${certidaoStatus.bgColor} ${certidaoStatus.textColor} ${certidaoStatus.borderColor} flex items-center gap-1 whitespace-nowrap flex-shrink-0`}
                                  title={`Certidão Conjunta RFB/PGFN: ${certidaoStatus.texto}`}
                                >
                                  <span className="text-xs leading-none">{certidaoStatus.icon}</span>
                                  <span>{certidaoStatus.texto}</span>
                                </span>
                              );
                            }
                            return (
                              <span className="text-xs text-gray-400">Sem dados</span>
                            );
                          })()}
                        </div>
                        
                        {/* Coluna Ações */}
                        <div className="col-span-4 flex items-center justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCompany(company.cnpj);
                            }}
                            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                          >
                            <EyeIcon className="h-4 w-4" />
                            {isExpanded ? 'Ocultar' : 'Visualizar'}
                          </button>
                        </div>
                      </div>
                    </div>

                      {isExpanded && (
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                          <div className="space-y-4">
                            {company.registros.map((registro) => (
                              <div
                                key={registro.id}
                                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                              >
                                {/* Header do Registro */}
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <CalendarIcon className="h-4 w-4 text-gray-400" />
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {new Date(registro.created_at).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </p>
                                      <p className="text-xs text-gray-500">ID: {registro.id.substring(0, 8)}...</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(registro.has_pdf_base64 || registro.file_url) ? (
                                      <>
                                        <a
                                          href={`/api/situacao-fiscal/pdf/${registro.id}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                          <EyeIcon className="h-3.5 w-3.5" />
                                          Visualizar PDF
                                        </a>
                                        <button
                                          onClick={() => handleDownloadPDF(registro.id, company.cnpj)}
                                          className="px-3 py-1.5 text-xs font-medium text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                          <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                          Baixar
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-400">Indisponível</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Dados Detalhados */}
                                <div className="p-4">
                                  <RegistroDetalhado registro={registro} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Alert de restauração em andamento */}
      {restoringProtocol && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-toast-fade-in border-2 border-blue-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Restaurando Protocolo
                </h3>
                <p className="text-sm text-gray-600 mb-3 font-medium">
                  {restoringProtocol.razao_social || formatCNPJ(restoringProtocol.cnpj)}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>Usando protocolo salvo para emitir novo relatório...</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <span>Consultando SERPRO...</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                    <span>Aguarde, isso pode levar alguns segundos</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"
                  style={{ 
                    width: '60%',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s linear infinite'
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {activeTab === 'lixeira' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <DocumentMagnifyingGlassIcon className="h-5 w-5 text-gray-600" />
                Protocolos Arquivados
              </h2>
              <button
                onClick={() => fetchArchivedProtocols()}
                disabled={loadingProtocols}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                {loadingProtocols ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Protocolos salvos que podem ser reutilizados para fazer novas consultas sem solicitar novo protocolo.
            </p>
          </div>

          <div className="p-6">
            {loadingProtocols ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-600">Carregando protocolos...</p>
              </div>
            ) : archivedProtocols.length === 0 ? (
              <div className="text-center py-12">
                <DocumentMagnifyingGlassIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Nenhum protocolo arquivado encontrado</p>
                <p className="text-sm text-gray-500 mt-2">
                  Os protocolos aparecerão aqui após serem utilizados em consultas.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {archivedProtocols.map((protocol) => (
                  <div
                    key={protocol.cnpj}
                    className={`border rounded-lg p-4 transition-all ${
                      protocol.tempo_restante?.is_valid
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">
                            {protocol.razao_social || 'Sem razão social'}
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            protocol.tempo_restante?.is_valid
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {protocol.tempo_restante?.is_valid ? 'Válido' : 'Expirado'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">CNPJ:</span>
                            <p className="font-mono text-gray-900">{formatCNPJ(protocol.cnpj)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Protocolo:</span>
                            <p className="font-mono text-gray-900 text-xs">{protocol.protocolo_truncado || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Status:</span>
                            <p className="text-gray-900 capitalize">{protocol.status}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Tempo Restante:</span>
                            <p className={`font-medium ${
                              protocol.tempo_restante?.is_valid
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}>
                              {protocol.tempo_restante?.texto_formatado || 'N/A'}
                            </p>
                          </div>
                          {protocol.expires_at && (
                            <div>
                              <span className="text-gray-500">Expira em:</span>
                              <p className="text-gray-900">
                                {new Date(protocol.expires_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          )}
                          {protocol.created_at && (
                            <div>
                              <span className="text-gray-500">Primeira consulta:</span>
                              <p className="text-gray-900">
                                {(() => {
                                  try {
                                    // A data vem do MySQL no formato YYYY-MM-DD HH:MM:SS (timezone local)
                                    // Converter para Date interpretando como local (não UTC)
                                    const dateStr = protocol.created_at;
                                    let date: Date;
                                    
                                    if (dateStr.includes('T') || dateStr.includes('Z')) {
                                      // Formato ISO - já tem timezone
                                      date = new Date(dateStr);
                                    } else {
                                      // Formato MySQL: YYYY-MM-DD HH:MM:SS
                                      // Interpretar como local time (não UTC)
                                      const [datePart, timePart] = dateStr.split(' ');
                                      const [year, month, day] = datePart.split('-').map(Number);
                                      const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);
                                      date = new Date(year, month - 1, day, hours, minutes, seconds || 0);
                                    }
                                    
                                    // Verificar se a data é válida
                                    if (isNaN(date.getTime())) {
                                      return dateStr; // Retornar string original se inválida
                                    }
                                    
                                    // Formatar com timezone local do Brasil
                                    return date.toLocaleString('pt-BR', {
                                      timeZone: 'America/Sao_Paulo',
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    });
                                  } catch (error) {
                                    console.error('Erro ao formatar created_at:', error);
                                    return protocol.created_at;
                                  }
                                })()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => restoreProtocol(protocol.cnpj, protocol.razao_social)}
                          disabled={!protocol.tempo_restante?.is_valid || loadingProtocols || restoringProtocol?.cnpj === protocol.cnpj}
                          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                            protocol.tempo_restante?.is_valid && !restoringProtocol
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {restoringProtocol?.cnpj === protocol.cnpj ? (
                            <>
                              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Restaurando...
                            </>
                          ) : (
                            <>
                              <ArrowDownTrayIcon className="h-4 w-4" />
                              Restaurar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
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
