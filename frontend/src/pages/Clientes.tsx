import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import type { Cliente } from '../types';
import { Pagination } from '../components/Pagination';
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  CheckIcon,
  PlusIcon,
  BuildingOfficeIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api';
import type { AxiosError } from 'axios';
import PagamentosTab from '../components/Clientes/PagamentosTab';
import EProcessosTab from '../components/Clientes/EProcessosTab';

const Clientes: React.FC = () => {
  const { clientes, loadClientes, createCliente, updateClienteById, deleteClienteById, loading, error, clearError } = useClientes();
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [lastPageCount, setLastPageCount] = useState<number>(0);
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [paymentsFilter, setPaymentsFilter] = useState<'all' | 'with' | 'without'>('all'); // mantido para compat, mas sem uso
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [copiedCnpj, setCopiedCnpj] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ cliente: Cliente | null; countdown: number }>({ cliente: null, countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<'clientes' | 'lancamentos' | 'pagamentos' | 'e-processos'>('clientes');
  const [cnpjParaPagamentos, setCnpjParaPagamentos] = useState<string | undefined>(undefined);
  const [hostLancamentos, setHostLancamentos] = useState<any[]>([]);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [showManualFilters, setShowManualFilters] = useState(false);
  const [manualDataIni, setManualDataIni] = useState<string>('');
  const [manualDataFim, setManualDataFim] = useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();

  // Detectar tab na query string
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'pagamentos') {
      setActiveTab('pagamentos');
    } else if (tab === 'lancamentos') {
      setActiveTab('lancamentos');
    } else if (tab === 'e-processos') {
      setActiveTab('e-processos');
    }
    
    // Detectar CNPJ na query string para pagamentos, e-processos e lançamentos
    const cnpjFromQuery = params.get('cnpj');
    if (cnpjFromQuery) {
      const cnpjLimpo = cnpjFromQuery.replace(/\D/g, '');
      if (cnpjLimpo.length === 14) {
        if (tab === 'pagamentos' || tab === 'e-processos') {
          setCnpjParaPagamentos(cnpjLimpo);
        } else if (tab === 'lancamentos') {
          // Preencher o campo de busca com o CNPJ formatado
          const cnpjFormatado = cnpjLimpo
            .replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
          setSearch(cnpjFormatado);
        }
      }
    }
  }, [location.search]);

  // Debounce do search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page when searching
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load clientes when filters/pagination change (server-side for payments filter)
  useEffect(() => {
    loadClientes({ page, limit, search: debouncedSearch }).then(({ items, pagination }) => {
      setLastPageCount(items.length);
      setTotal(pagination?.total ?? null);
      setTotalPages(pagination?.totalPages ?? null);
    }).catch(() => {});
  }, [page, limit, debouncedSearch]);

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      setShowSuccess(false); // Close success toast if error occurs
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
        clearError();
      }, 5000);
    }
  }, [error, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Sempre garantir que cnpj_limpo seja fornecido (sem formatação)
    const cnpjLimpo = formData.cnpj_limpo || (formData.cnpj ? formData.cnpj.replace(/\D/g, '') : '');
    const razaoSocial = formData.razao_social || formData.nome;
    const payload = { 
      razao_social: razaoSocial, 
      cnpj_limpo: cnpjLimpo 
    } as Partial<Cliente>;
    try {
      if (editingCliente) {
        await updateClienteById(editingCliente.id!, payload);
        setSuccessMessage('Cliente atualizado com sucesso!');
      } else {
        await createCliente(payload);
        setSuccessMessage('Cliente cadastrado com sucesso!');
      }
      setShowForm(false);
      setEditingCliente(null);
      setFormData({});
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err) {
      // Error is already handled by useClientes hook
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    const cnpjLimpo = cliente.cnpj_limpo || (cliente.cnpj ? cliente.cnpj.replace(/\D/g, '') : '');
    setFormData({ 
      razao_social: cliente.razao_social || cliente.nome, 
      cnpj_limpo: cnpjLimpo,
      cnpj: formatCNPJ(cnpjLimpo)
    });
    setShowForm(true);
  };

  const handleDeleteClick = (cliente: Cliente) => {
    if (!cliente.id) return;
    
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ cliente, countdown: 3 });
    
    let countdown = 3;
    const timer = setInterval(() => {
      countdown -= 1;
      setPendingDelete(prev => ({ ...prev, countdown }));
      
      if (countdown <= 0) {
        clearInterval(timer);
        setDeleteTimer(null);
        // Executar exclusão automaticamente
        executeDelete(cliente);
      }
    }, 1000);
    
    setDeleteTimer(timer);
  };

  const cancelDelete = () => {
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    setPendingDelete({ cliente: null, countdown: 0 });
  };

  const executeDelete = async (cliente: Cliente) => {
    if (!cliente.id) return;
    
    const clienteNome = cliente.razao_social || cliente.nome || 'Cliente';
    
    // Limpar estado de exclusão pendente
    setPendingDelete({ cliente: null, countdown: 0 });
    
    try {
      await deleteClienteById(cliente.id);
      
      // Mostrar mensagem de sucesso
      setSuccessMessage(`Cliente "${clienteNome}" excluído com sucesso!`);
      setShowSuccess(true);
      
      // Ocultar mensagem após 5 segundos
      setTimeout(() => {
        setShowSuccess(false);
      }, 5000);
      
      // Recarregar lista de clientes
      loadClientes();
    } catch (error) {
      // Erro já é tratado pelo hook useClientes
      setShowError(true);
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

  const copyToClipboard = async (text: string, cnpj: string) => {
    try {
      // Tenta usar a API moderna de clipboard
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos não-seguros (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedCnpj(cnpj);
      setTimeout(() => {
        setCopiedCnpj(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
    }
  };

  const formatCNPJ = (value: string) => {
    const v = (value || '').replace(/\D/g, '').slice(0, 14);
    return v
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const displayCNPJ = (cnpj: string | undefined) => {
    if (!cnpj) return '-';
    return formatCNPJ(cnpj);
  };

  const canGoNext = totalPages != null ? page < totalPages : lastPageCount === limit;

  const [syncing, setSyncing] = useState(false);
  const [syncingAuto, setSyncingAuto] = useState(false);

  const sincronizarAutomatico = async (): Promise<boolean> => {
    try {
      setSyncingAuto(true);
      setHostError(null);
      setShowSuccess(false);
      
      const response = await api.post('/host-dados/sincronizar-automatico');
      
      if (response.data?.success) {
        const data = response.data.data;
        const periodo = data.periodo || 'última competência';
        console.log(`[Clientes] Sincronização automática concluída`);
        
        setSuccessMessage(`✅ Sincronização automática concluída com sucesso! Período: ${periodo}`);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        return true;
      }
      
      const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar automaticamente.';
      setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('[Clientes] Erro ao sincronizar automaticamente:', error);
      
      let errorMessage = 'Erro ao sincronizar automaticamente do Firebird para MySQL.';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
      } else if (error.message) {
        errorMessage = `${errorMessage} Detalhes: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
      }
      
      setHostError(errorMessage);
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } finally {
      setSyncingAuto(false);
    }
  };

  const sincronizarPorDatas = async (dataIni: string, dataFim: string): Promise<boolean> => {
    try {
      setSyncing(true);
      setHostError(null);
      setShowSuccess(false);
      
      // Não enviar body, apenas query params
      const response = await api.post('/host-dados/sincronizar-datas', {}, {
        params: { data_ini: dataIni, data_fim: dataFim },
      });
      
      if (response.data?.success) {
        const data = response.data.data;
        const total = data.total || 0;
        const periodo = `${dataIni} a ${dataFim}`;
        console.log(`[Clientes] Sincronização por datas concluída: ${total} registros processados`);
        
        setSuccessMessage(`✅ Sincronização manual concluída com sucesso! Período: ${periodo}. Total de registros: ${total}`);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 5000);
        
        return true;
      }
      
      const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar por datas.';
      setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('[Clientes] Erro ao sincronizar por datas:', error);
      
      let errorMessage = 'Erro ao sincronizar período por datas do Firebird para MySQL.';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
      } else if (error.message) {
        errorMessage = `${errorMessage} Detalhes: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
      }
      
      setHostError(errorMessage);
      setShowSuccess(false); // Fechar toast de sucesso se houver erro
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const sincronizarPeriodo = async (ano: number, mes: number): Promise<boolean> => {
    try {
      setSyncing(true);
      setHostError(null);
      
      // Não enviar body, apenas query params
      const response = await api.post('/host-dados/sincronizar', {}, {
        params: { ano, mes },
      });
      
      if (response.data?.success) {
        const data = response.data.data;
        console.log(`[Clientes] Sincronização concluída: ${data.total || 0} registros processados`);
        return true;
      }
      
      // Se não teve sucesso, extrair mensagem de erro
      const errorMsg = response.data?.error || 'Erro desconhecido ao sincronizar período.';
      setHostError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      return false;
    } catch (err) {
      const error = err as AxiosError<any>;
      console.error('[Clientes] Erro ao sincronizar período:', error);
      
      let errorMessage = 'Erro ao sincronizar período do Firebird para MySQL.';
      
      // Extrair mensagem de erro do response
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
      } else if (error.message) {
        errorMessage = `${errorMessage} Detalhes: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000.';
      }
      
      setHostError(errorMessage);
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const handleAplicarPeriodo = async () => {
    if (!manualDataIni || !manualDataFim) {
      setHostError('Informe data inicial e data final para aplicar o período.');
      return;
    }

    // Validar formato das datas (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(manualDataIni) || !dateRegex.test(manualDataFim)) {
      setHostError('Datas devem estar no formato YYYY-MM-DD (ex: 2025-01-01)');
      return;
    }

    // Validar que data inicial não é maior que data final
    const dataIni = new Date(manualDataIni);
    const dataFim = new Date(manualDataFim);
    if (dataIni > dataFim) {
      setHostError('Data inicial não pode ser maior que data final.');
      return;
    }

    // 1. Sincronizar período do Firebird para MySQL usando datas
    const sincronizado = await sincronizarPorDatas(manualDataIni, manualDataFim);
    
    if (!sincronizado) {
      // Erro já foi setado em sincronizarPorDatas
      return;
    }

    // 2. Depois de sincronizar, buscar os lançamentos
    await loadHostLancamentos();
  };

  const loadHostLancamentos = async () => {
    try {
      setHostError(null);
      setHostLoading(true);
      // Usar o termo de busca atual (limpo) para CNPJ
      const cnpjSearch = debouncedSearch.replace(/\D/g, '');
      if (!cnpjSearch || cnpjSearch.length !== 14) {
        setHostLancamentos([]);
        setHostLoading(false);
        return;
      }
      // NÃO filtrar por ano/mês - mostrar TODOS os meses disponíveis para o CNPJ
      // Isso permite ver todos os períodos que existem na tabela MySQL para aquele CNPJ
      const response = await api.get(`/host-dados/cliente/${cnpjSearch}`);
      setHostLancamentos(response.data?.data || []);
    } catch (err) {
      const error = err as AxiosError<any>;
      setHostError(
        error.response?.data?.error ||
          'Erro ao carregar lançamentos do Banco SCI para este CNPJ.',
      );
    } finally {
      setHostLoading(false);
    }
  };

  const handleAtualizar = async () => {
    // Sincronização automática: busca mês anterior de TODOS os CNPJs
    const sincronizado = await sincronizarAutomatico();
    
    if (sincronizado) {
      // Depois de sincronizar, recarregar os lançamentos se houver CNPJ na busca
      await loadHostLancamentos();
    }
  };

  // Recarregar lançamentos quando aba "Lançamentos" estiver ativa e search mudar
  useEffect(() => {
    if (activeTab === 'lancamentos') {
      void loadHostLancamentos();
    }
  }, [activeTab, debouncedSearch]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center gap-3">
          <UserGroupIcon className="h-7 w-7 text-blue-600" />
          Clientes
        </h1>
        <p className="text-base text-gray-600">Gerencie o cadastro de clientes e suas informações</p>
      </div>

      {/* Tabs de categoria */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
        <div className="px-4 pt-4">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('clientes')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === 'clientes'
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Cadastro
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lancamentos')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === 'lancamentos'
                  ? 'border-emerald-600 text-emerald-600 bg-emerald-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Lançamentos (SCI)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pagamentos')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === 'pagamentos'
                  ? 'border-purple-600 text-purple-600 bg-purple-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Pagamentos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('e-processos')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === 'e-processos'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              E-Processos
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Busca e Ações - Não exibir nas abas de Pagamentos e E-Processos */}
      {activeTab !== 'pagamentos' && activeTab !== 'e-processos' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1 max-w-md w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar Cliente</label>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === 'clientes' ? 'Buscar por Razão Social ou CNPJ' : 'Digite o CNPJ (14 dígitos)'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>
          {activeTab === 'clientes' ? (
            <div className="flex gap-3 items-end">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow"
              >
                <PlusIcon className="h-5 w-5" />
                Novo Cliente
              </button>
              <Link
                to="/clientes/upload"
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow"
              >
                <DocumentArrowUpIcon className="h-5 w-5" />
                Upload em Lote
              </Link>
            </div>
          ) : (
            <div className="flex gap-3 items-end">
              <button
                type="button"
                onClick={() => void handleAtualizar()}
                disabled={syncingAuto}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncingAuto ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M4 20v-5h.582m15.356-2a8.001 8.001 0 01-15.356 2"
                      />
                    </svg>
                    Atualizar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowManualFilters((prev) => !prev)}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow"
              >
                <ClipboardDocumentIcon className="h-5 w-5" />
                Manual
              </button>
              <button
                type="button"
                onClick={() => {
                  const cnpjSearch = debouncedSearch.replace(/\D/g, '');
                  if (cnpjSearch && cnpjSearch.length === 14) {
                    navigate(`/conferencias?cnpj=${cnpjSearch}`);
                  }
                }}
                className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={debouncedSearch.replace(/\D/g, '').length !== 14}
              >
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
                Conferências
              </button>
            </div>
          )}
        </div>

        {activeTab === 'lancamentos' && showManualFilters && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-600 mb-3">
              Consulta manual por período de apuração. Informe a data inicial e data final do período que deseja sincronizar.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={manualDataIni}
                  onChange={(e) => setManualDataIni(e.target.value)}
                  className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder="2025-01-01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={manualDataFim}
                  onChange={(e) => setManualDataFim(e.target.value)}
                  min={manualDataIni || undefined}
                  className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder="2025-01-31"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleAplicarPeriodo()}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!manualDataIni || !manualDataFim || syncing}
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Aplicar período
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      )}


      {activeTab === 'clientes' && showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
              {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
                <div className="relative">
                  <BuildingOfficeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.razao_social || formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, razao_social: e.target.value, nome: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={formData.cnpj || ''}
                  onChange={(e) => {
                    const formatted = formatCNPJ(e.target.value);
                    setFormData({ ...formData, cnpj_limpo: formatted.replace(/\D/g, ''), cnpj: formatted });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-5 w-5" />
                    {editingCliente ? 'Atualizar' : 'Criar'}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingCliente(null);
                  setFormData({});
                }}
                className="px-6 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium transition-colors flex items-center gap-2"
              >
                <XMarkIcon className="h-5 w-5" />
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'clientes' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <UserGroupIcon className="h-5 w-5 text-gray-600" />
            Lista de Clientes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Razão Social</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Inf. Financeiras</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <UserGroupIcon className="h-12 w-12 text-gray-400" />
                      <p className="text-gray-500 font-medium">Nenhum cliente encontrado</p>
                      <p className="text-sm text-gray-400">
                        {search ? 'Tente ajustar os termos de busca' : 'Cadastre um novo cliente para começar'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => {
                  const cnpjDisplay = displayCNPJ(cliente.cnpj_limpo || cliente.cnpj);
                  const cnpjValue = cliente.cnpj_limpo || cliente.cnpj || '';
                  const cnpjKey = `${cliente.id}-${cnpjValue}`;
                  return (
                    <tr key={cliente.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {cliente.razao_social || cliente.nome || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 font-mono">{cnpjDisplay}</span>
                          <button
                            onClick={() => copyToClipboard(cnpjValue, cnpjKey)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Copiar CNPJ"
                          >
                            {copiedCnpj === cnpjKey ? (
                              <CheckIcon className="w-4 h-4 text-green-600" />
                            ) : (
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {cliente.hasPayments === true ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1.5">
                            <CheckIcon className="w-3.5 h-3.5" />
                            Pagamentos
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCnpjParaPagamentos(cnpjValue);
                              setActiveTab('pagamentos');
                            }}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors gap-1.5"
                            title="Adicionar pagamentos para este CNPJ"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Adicionar
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(cliente)}
                            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <PencilIcon className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteClick(cliente)}
                            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeTab === 'clientes' && clientes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="text-sm text-gray-600">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Carregando...
                </span>
              ) : total != null && totalPages != null ? (
                <span className="font-medium">Total: <span className="text-gray-900">{total}</span> clientes</span>
              ) : (
                <span>Exibindo {clientes.length} clientes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={5}>5 por página</option>
                <option value={10}>10 por página</option>
                <option value={20}>20 por página</option>
              </select>
            </div>
          </div>
          {totalPages != null && total != null && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                itemsPerPage={limit}
                onPageChange={setPage}
                itemLabel="cliente"
              />
            </div>
          )}
        </div>
      )}

      {/* Aba de Pagamentos */}
      {activeTab === 'pagamentos' && (
        <PagamentosTab cnpjPreenchido={cnpjParaPagamentos} />
      )}

      {/* Aba de E-Processos */}
      {activeTab === 'e-processos' && (
        <EProcessosTab cnpjPreenchido={cnpjParaPagamentos} />
      )}

      {/* Aba de Lançamentos (Banco SCI) */}
      {activeTab === 'lancamentos' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-emerald-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <BuildingOfficeIcon className="h-5 w-5 text-emerald-600" />
                Lançamentos por CNPJ (Banco SCI)
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                Digite um CNPJ na busca acima (14 dígitos) para visualizar os lançamentos FPG, CTB, FISE e FISS deste cliente.
              </p>
            </div>
          </div>
          <div className="px-6 py-4">
            {hostLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Carregando lançamentos...
              </div>
            ) : hostError ? (
              <div className="py-8 text-center text-sm text-red-600">
                {hostError}
              </div>
            ) : hostLancamentos.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Nenhum lançamento encontrado para o CNPJ informado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Competência
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Relatório
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Espécie
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Movimentação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {hostLancamentos.map((item) => (
                      <tr key={`${item.ano}-${item.mes}-${item.relatorio}-${item.tipo}-${item.especie || 'null'}`}>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.competencia}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.relatorio}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.tipo}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.especie || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                          {item.movimentacao}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notificação de exclusão pendente com contagem regressiva */}
      {pendingDelete.cliente && pendingDelete.countdown > 0 && (
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
                  Cliente: {pendingDelete.cliente.razao_social || pendingDelete.cliente.nome || 'Cliente'}
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

      {/* Toast de sucesso */}
      {showSuccess && successMessage && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{successMessage}</p>
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Toast de erro */}
      {showError && error && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{error}</p>
            </div>
            <button
              onClick={() => {
                setShowError(false);
                clearError();
              }}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideDown {
          from { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
        }
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
};

export default Clientes;
