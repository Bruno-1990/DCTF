import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { dctfService } from '../services/dctf';
import { relatoriosService } from '../services/relatorios';
import { ExclamationTriangleIcon, DocumentArrowDownIcon, TrashIcon, LockClosedIcon, ArrowPathIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const ADMIN_CREDENTIALS = {
  username: 'Admin',
  password: 'Admin',
};

const STORAGE_KEY = 'dctf_admin_authenticated';
const STORAGE_PROGRESS_KEY = 'dctf_consulta_progress_id';
// AUTH_TIMEOUT removido - não expira automaticamente na aba admin para não atrapalhar consultas em lote

const Administracao: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmCode, setClearConfirmCode] = useState('');
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    processed: number;
    inserted: number;
    updated: number;
    errors: number;
    currentBatch: number;
    totalBatches: number;
  } | null>(null);
  const [fixingSchema, setFixingSchema] = useState(false);
  const [schemaFixSuccess, setSchemaFixSuccess] = useState<string | null>(null);
  const [schemaFixError, setSchemaFixError] = useState<string | null>(null);
  const [showDeleteSupabaseModal, setShowDeleteSupabaseModal] = useState(false);
  const [deleteSupabaseConfirmCode, setDeleteSupabaseConfirmCode] = useState('');
  const [deleteSupabaseConfirmText, setDeleteSupabaseConfirmText] = useState('');
  const [deletingSupabase, setDeletingSupabase] = useState(false);
  const [deleteSupabaseSuccess, setDeleteSupabaseSuccess] = useState<string | null>(null);
  const [deleteSupabaseError, setDeleteSupabaseError] = useState<string | null>(null);
  
  // Estados para consulta em lote na Receita
  const [dataInicialConsulta, setDataInicialConsulta] = useState('');
  const [dataFinalConsulta, setDataFinalConsulta] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [consultaResultado, setConsultaResultado] = useState<any>(null);
  const [consultaError, setConsultaError] = useState<string | null>(null);
  const [limiteCNPJs, setLimiteCNPJs] = useState<number>(50);
  const [apenasFaltantes, setApenasFaltantes] = useState<boolean>(false);
  const [waitMs, setWaitMs] = useState<number>(2000);
  
  // Estados para progresso da consulta em lote
  const [progressId, setProgressId] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{
    totalCNPJs: number;
    processados: number;
    porcentagem: number;
    currentTotalItens?: number;
    currentProcessados?: number;
    encontrados?: number;
    salvos?: number;
    atualizados?: number;
    pulados?: number;
    cnpjAtual?: string;
    status: 'em_andamento' | 'concluida' | 'cancelada' | 'erro';
  } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Verificar autenticação ao carregar
  // Não expira automaticamente - logout apenas manual para não atrapalhar consultas em lote
  useEffect(() => {
    const authData = sessionStorage.getItem(STORAGE_KEY);
    if (authData) {
      try {
        // Verificar se há dados de autenticação (formato antigo ou novo)
        const parsed = JSON.parse(authData);
        // Se existe autenticação, permitir acesso independente do timestamp
        setIsAuthenticated(true);
        setShowLoginModal(false);
      } catch {
        // Formato inválido, remover
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    // Tentar retomar uma consulta em andamento (sem recarregar a página)
    const savedProgressId = sessionStorage.getItem(STORAGE_PROGRESS_KEY);
    if (savedProgressId) {
      setConsultando(true);
      setProgressId(savedProgressId);
      // Iniciar/retomar polling
      if (!pollingIntervalRef.current) {
        const interval = setInterval(() => {
          verificarProgresso(savedProgressId);
        }, 2000);
        pollingIntervalRef.current = interval;
      }
      // Primeira verificação imediata
      verificarProgresso(savedProgressId);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setShowLoginModal(false);
      // Armazenar autenticação sem timeout - logout apenas manual
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ authenticated: true, timestamp: Date.now() }));
      setUsername('');
      setPassword('');
      // Não configurar timeout automático - não expira durante consultas em lote
    } else {
      setLoginError('Usuário ou senha incorretos');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    sessionStorage.removeItem(STORAGE_KEY);
    setUsername('');
    setPassword('');
  };

  const handleExportBackup = async () => {
    try {
      setExporting(true);
      const blob = await relatoriosService.generateAndDownload({ reportType: 'dctf', format: 'xlsx' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_dctf_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setClearSuccess('Backup exportado com sucesso!');
      setTimeout(() => setClearSuccess(null), 3000);
    } catch (err: any) {
      setClearError(err.response?.data?.error || 'Erro ao exportar backup');
      setTimeout(() => setClearError(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    if (clearConfirmCode !== 'LIMPAR_TODAS_DECLARACOES' || clearConfirmText !== 'CONFIRMAR') {
      setClearError('Código de confirmação ou texto incorretos. Por favor, verifique.');
      return;
    }

    setClearing(true);
    setClearError(null);
    setClearSuccess(null);

    try {
      const result = await dctfService.clearAll();
      if (result.success) {
        setClearSuccess(result.message || 'Limpeza concluída com sucesso!');
        setTimeout(() => {
          setShowClearModal(false);
          setClearConfirmCode('');
          setClearConfirmText('');
          setClearError(null);
          // NÃO recarregar a página - manter dados na tela
          // setClearSuccess(null);
        }, 3000);
      } else {
        setClearError(result.message || 'Erro ao limpar declarações');
      }
    } catch (err: any) {
      setClearError(err.response?.data?.error || 'Erro ao limpar declarações');
    } finally {
      setClearing(false);
    }
  };

  const handleFixSchema = async () => {
    setFixingSchema(true);
    setSchemaFixError(null);
    setSchemaFixSuccess(null);

    try {
      const result = await dctfService.fixSchema();
      if (result.success) {
        const message = result.message || 'Schema corrigido com sucesso! Agora você pode sincronizar os dados.';
        setSchemaFixSuccess(message);
        setTimeout(() => {
          setSchemaFixSuccess(null);
        }, 5000);
      } else {
        setSchemaFixError(result.error || 'Erro ao corrigir schema');
      }
    } catch (err: any) {
      setSchemaFixError(err.response?.data?.error || err.message || 'Erro ao corrigir schema');
    } finally {
      setFixingSchema(false);
    }
  };

  const handleDeleteFromSupabase = async () => {
    if (deleteSupabaseConfirmCode !== 'DELETAR_SUPABASE' || deleteSupabaseConfirmText !== 'CONFIRMAR') {
      setDeleteSupabaseError('Código de confirmação ou texto incorretos. Por favor, verifique.');
      return;
    }

    setDeletingSupabase(true);
    setDeleteSupabaseError(null);
    setDeleteSupabaseSuccess(null);

    try {
      const result = await dctfService.deleteFromSupabase();
      if (result.success) {
        const deletedCount = result.data?.deletedDeclarations || 0;
        const deletedDataCount = result.data?.deletedData || 0;
        const message = result.message || 
          `Exclusão do Supabase concluída com sucesso! ${deletedCount} declarações e ${deletedDataCount} registros de dados removidos.`;
        setDeleteSupabaseSuccess(message);
        setTimeout(() => {
          setShowDeleteSupabaseModal(false);
          setDeleteSupabaseConfirmCode('');
          setDeleteSupabaseConfirmText('');
          setDeleteSupabaseError(null);
        }, 5000);
      } else {
        setDeleteSupabaseError(result.error || 'Erro ao deletar dados do Supabase');
      }
    } catch (err: any) {
      setDeleteSupabaseError(err.response?.data?.error || 'Erro ao deletar dados do Supabase');
    } finally {
      setDeletingSupabase(false);
    }
  };

  const handleSyncFromSupabase = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);
    setSyncProgress(null);

    try {
      const result = await dctfService.syncFromSupabase();
      if (result.success) {
        const message = result.message || 
          `Sincronização concluída: ${result.data?.inserted || 0} inseridos, ${result.data?.updated || 0} atualizados, ${result.data?.errors || 0} erros`;
        setSyncSuccess(message);
        setSyncProgress(result.data || null);
        // NÃO recarregar a página - manter dados na tela
        // Os dados de progresso já estão sendo exibidos
      } else {
        setSyncError(result.error || 'Erro ao sincronizar declarações');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao sincronizar declarações');
    } finally {
      setSyncing(false);
    }
  };

  // Função para verificar progresso via polling
  const verificarProgresso = async (id: string) => {
    try {
      const response = await axios.get(`/api/receita/consulta-lote/${id}`);
      
      if (response.data.success && response.data.data) {
        const progressoData = response.data.data;
        setProgresso({
          totalCNPJs: progressoData.totalCNPJs,
          processados: progressoData.processados,
          porcentagem: progressoData.porcentagem || 0,
          currentTotalItens: progressoData.currentTotalItens ?? 0,
          currentProcessados: progressoData.currentProcessados ?? 0,
          encontrados: progressoData.encontrados ?? 0,
          salvos: progressoData.salvos ?? 0,
          atualizados: progressoData.atualizados ?? 0,
          pulados: progressoData.pulados ?? 0,
          cnpjAtual: progressoData.cnpjAtual,
          status: progressoData.status,
        });

        // Se não há CNPJs a processar, encerrar polling imediatamente
        if (progressoData.totalCNPJs === 0 && (progressoData.status === 'concluida' || progressoData.status === 'em_andamento')) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setConsultando(false);
        }

        // Se a consulta foi concluída, cancelada ou teve erro, parar o polling
        if (progressoData.status === 'concluida' || progressoData.status === 'cancelada' || progressoData.status === 'erro') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setConsultando(false);
          sessionStorage.removeItem(STORAGE_PROGRESS_KEY);
          
          if (progressoData.status === 'concluida' && progressoData.resultado) {
            setConsultaResultado(progressoData.resultado);
          }
          
          if (progressoData.status === 'cancelada') {
            setConsultaError('Consulta cancelada pelo usuário.');
          }
          
          if (progressoData.status === 'erro') {
            setConsultaError(progressoData.erro || 'Erro ao processar consulta em lote.');
          }
        }
      }
    } catch (err: any) {
      // Em caso de rate limit (429), reduzir frequência do polling temporariamente
      const status = err?.response?.status;
      if (status === 429) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        // Tenta novamente com backoff leve
        setTimeout(() => {
          if (progressId && !pollingIntervalRef.current) {
            const interval = setInterval(() => {
              verificarProgresso(progressId);
            }, 3000); // 3s após receber 429
            pollingIntervalRef.current = interval;
          }
        }, 1500);
        return;
      }
      // Para outros erros, apenas silenciar (polling segue no próximo tick)
    }
  };

  // Função para cancelar consulta
  const handleCancelarConsulta = async () => {
    if (!progressId) return;

    try {
      const response = await axios.post(`/api/receita/consulta-lote/${progressId}/cancelar`);
      
      if (response.data.success) {
        // Parar polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        setConsultando(false);
        setConsultaError('Consulta cancelada pelo usuário.');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao cancelar consulta';
      setConsultaError(errorMessage);
    }
  };

  // Limpar polling quando componente desmontar
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const handleConsultaLote = async () => {
    if (!dataInicialConsulta || !dataFinalConsulta) {
      setConsultaError('Por favor, preencha a data inicial e data final.');
      return;
    }

    // Limpar estados anteriores e iniciar visualização imediatamente
    setConsultando(true);
    setConsultaError(null);
    setConsultaResultado(null);
    setProgresso({
      totalCNPJs: 0,
      processados: 0,
      porcentagem: 0,
      status: 'em_andamento',
    } as any);
    setProgressId(null);
    
    // Limpar polling anterior se existir
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      // Converter datas para formato YYYY-MM-DD
      const dataInicialFormatada = new Date(dataInicialConsulta).toISOString().split('T')[0];
      const dataFinalFormatada = new Date(dataFinalConsulta).toISOString().split('T')[0];

      const response = await axios.post(
        '/api/receita/consulta-lote',
        {
          dataInicial: dataInicialFormatada,
          dataFinal: dataFinalFormatada,
          limiteCNPJs: limiteCNPJs || undefined,
          apenasFaltantes: apenasFaltantes,
          waitMs: waitMs || 0,
        }
      );

      if (response.data.success && response.data.data?.progressId) {
        const id = response.data.data.progressId;
        setProgressId(id);
        sessionStorage.setItem(STORAGE_PROGRESS_KEY, id);
        
        // Iniciar polling para verificar progresso (2s para reduzir risco de 429)
        const interval = setInterval(() => {
          verificarProgresso(id);
        }, 2000);
        pollingIntervalRef.current = interval;
        
        // Primeira verificação imediata
        verificarProgresso(id);
      } else {
        throw new Error(response.data.error || 'Erro ao iniciar consulta em lote');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao consultar pagamentos em lote';
      setConsultaError(errorMessage);
      setConsultando(false);
      sessionStorage.removeItem(STORAGE_PROGRESS_KEY);
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  // Se não estiver autenticado, mostrar modal de login
  if (!isAuthenticated || showLoginModal) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-blue-100 rounded-full p-3">
                <LockClosedIcon className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Acesso Administrativo</h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              Esta área requer autenticação. Por favor, faça login para continuar.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Usuário
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite o usuário"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                  {loginError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="flex items-center justify-center gap-2 flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Administração</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
        >
          Sair
        </button>
      </div>

      {/* Aviso de Segurança */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-700">
              <strong>Atenção:</strong> Esta página contém operações administrativas críticas que podem afetar permanentemente os dados do sistema. 
              Use com extrema cautela e apenas quando necessário.
            </p>
          </div>
        </div>
      </div>

      {/* Seção de Limpeza de Declarações */}
      <div className="bg-red-50 border-2 border-red-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <TrashIcon className="h-6 w-6 text-red-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Limpeza de Declarações DCTF (MySQL)</h2>
            <p className="text-sm text-red-700 mb-4">
              Esta operação irá <strong>deletar permanentemente</strong> todas as declarações DCTF e seus dados relacionados do banco de dados <strong>MySQL</strong>.
              Esta ação é <strong>irreversível</strong> e deve ser executada antes de sincronizar novos dados do Supabase.
            </p>
            
            <div className="bg-white rounded-lg p-4 border border-red-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será deletado (apenas no MySQL):</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>Todas as declarações da tabela <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code> no <strong>MySQL</strong></li>
                <li>Todos os dados relacionados da tabela <code className="bg-gray-100 px-1 rounded">dctf_dados</code> no <strong>MySQL</strong></li>
                <li>Todos os registros de análise e flags associados no <strong>MySQL</strong></li>
                <li className="text-green-700 font-semibold">✓ Os dados no Supabase NÃO serão afetados</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fluxo Recomendado:</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside mb-4">
                <li><strong>1. Limpar dados do MySQL</strong> (este botão) - Remove dados antigos do MySQL</li>
                <li><strong>2. Sincronizar do Supabase</strong> (botão abaixo) - Busca dados novos do Supabase e insere no MySQL</li>
              </ol>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li><strong>Sempre</strong> faça um backup antes de executar esta operação</li>
                <li>Execute esta operação antes de sincronizar novos dados do Supabase</li>
                <li>Verifique se não há processos importantes em andamento</li>
                <li>Certifique-se de que todos os relatórios necessários foram gerados</li>
              </ul>
            </div>

            {clearSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {clearSuccess}
              </div>
            )}

            {clearError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {clearError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleExportBackup}
                disabled={exporting || clearing}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                {exporting ? 'Exportando...' : 'Exportar Backup (XLSX)'}
              </button>
              <button
                onClick={() => setShowClearModal(true)}
                disabled={clearing}
                className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <TrashIcon className="h-5 w-5" />
                Limpar Todas as Declarações
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 mr-3 mt-1" />
              <h3 className="text-xl font-bold text-red-900">Confirmar Limpeza de Declarações</h3>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">
                ⚠️ ATENÇÃO: Esta operação é IRREVERSÍVEL
              </p>
              <p className="text-sm text-red-700 mb-2">
                Esta ação irá deletar permanentemente:
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside mb-2">
                <li>Todas as declarações DCTF</li>
                <li>Todos os dados relacionados (dctf_dados)</li>
                <li>Todos os registros de análise</li>
              </ul>
              <p className="text-sm text-red-800 font-semibold">
                Certifique-se de ter feito um backup antes de continuar!
              </p>
            </div>
            
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite o código de confirmação: <strong className="text-red-600">LIMPAR_TODAS_DECLARACOES</strong>
                </label>
                <input
                  type="text"
                  value={clearConfirmCode}
                  onChange={(e) => setClearConfirmCode(e.target.value)}
                  placeholder="LIMPAR_TODAS_DECLARACOES"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite <strong className="text-red-600">"CONFIRMAR"</strong> para prosseguir:
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            {clearError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                {clearError}
              </div>
            )}

            {clearSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 text-sm">
                {clearSuccess}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setClearConfirmCode('');
                  setClearConfirmText('');
                  setClearError(null);
                  setClearSuccess(null);
                }}
                disabled={clearing}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing || clearConfirmCode !== 'LIMPAR_TODAS_DECLARACOES' || clearConfirmText !== 'CONFIRMAR'}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {clearing ? 'Limpando...' : 'Confirmar e Limpar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Exclusão do Supabase */}
      <div className="bg-orange-50 border-2 border-orange-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <TrashIcon className="h-6 w-6 text-orange-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-orange-900 mb-2">Exclusão de Dados do Supabase</h2>
            <p className="text-sm text-orange-700 mb-4">
              Esta operação irá <strong>deletar permanentemente</strong> todas as declarações DCTF e seus dados relacionados do banco de dados <strong>Supabase</strong>.
              Esta ação é <strong>irreversível</strong> e deve ser executada antes de colocar novos registros no Supabase.
            </p>
            
            <div className="bg-white rounded-lg p-4 border border-orange-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será deletado (apenas no Supabase):</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>Todas as declarações da tabela <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code> no <strong>Supabase</strong></li>
                <li>Todos os dados relacionados da tabela <code className="bg-gray-100 px-1 rounded">dctf_dados</code> no <strong>Supabase</strong></li>
                <li className="text-green-700 font-semibold">✓ Os dados no MySQL NÃO serão afetados</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fluxo Recomendado:</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside mb-4">
                <li><strong>1. Deletar dados do Supabase</strong> (este botão) - Remove dados antigos do Supabase</li>
                <li><strong>2. Colocar novos registros no Supabase</strong> - Via N8N ou importação manual</li>
                <li><strong>3. Sincronizar do Supabase para MySQL</strong> (botão abaixo) - Busca dados novos do Supabase e insere no MySQL</li>
              </ol>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li><strong>Sempre</strong> faça um backup antes de executar esta operação</li>
                <li>Execute esta operação antes de colocar novos registros no Supabase</li>
                <li>Verifique se não há processos importantes em andamento</li>
                <li>Certifique-se de que todos os relatórios necessários foram gerados</li>
              </ul>
            </div>

            {deleteSupabaseSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {deleteSupabaseSuccess}
              </div>
            )}

            {deleteSupabaseError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {deleteSupabaseError}
              </div>
            )}

            <button
              onClick={() => setShowDeleteSupabaseModal(true)}
              disabled={deletingSupabase}
              className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <TrashIcon className="h-5 w-5" />
              Deletar Dados do Supabase
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação - Exclusão Supabase */}
      {showDeleteSupabaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-orange-600 mr-3 mt-1" />
              <h3 className="text-xl font-bold text-orange-900">Confirmar Exclusão de Dados do Supabase</h3>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-orange-800 font-semibold mb-2">
                ⚠️ ATENÇÃO: Esta operação é IRREVERSÍVEL
              </p>
              <p className="text-sm text-orange-700 mb-2">
                Esta ação irá deletar permanentemente:
              </p>
              <ul className="text-sm text-orange-700 space-y-1 list-disc list-inside mb-2">
                <li>Todas as declarações DCTF do Supabase</li>
                <li>Todos os dados relacionados (dctf_dados) do Supabase</li>
              </ul>
              <p className="text-sm text-orange-800 font-semibold">
                Certifique-se de ter feito um backup antes de continuar!
              </p>
            </div>
            
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite o código de confirmação: <strong className="text-orange-600">DELETAR_SUPABASE</strong>
                </label>
                <input
                  type="text"
                  value={deleteSupabaseConfirmCode}
                  onChange={(e) => setDeleteSupabaseConfirmCode(e.target.value)}
                  placeholder="DELETAR_SUPABASE"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite <strong className="text-orange-600">"CONFIRMAR"</strong> para prosseguir:
                </label>
                <input
                  type="text"
                  value={deleteSupabaseConfirmText}
                  onChange={(e) => setDeleteSupabaseConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            {deleteSupabaseError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                {deleteSupabaseError}
              </div>
            )}

            {deleteSupabaseSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 text-sm">
                {deleteSupabaseSuccess}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteSupabaseModal(false);
                  setDeleteSupabaseConfirmCode('');
                  setDeleteSupabaseConfirmText('');
                  setDeleteSupabaseError(null);
                  setDeleteSupabaseSuccess(null);
                }}
                disabled={deletingSupabase}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteFromSupabase}
                disabled={deletingSupabase || deleteSupabaseConfirmCode !== 'DELETAR_SUPABASE' || deleteSupabaseConfirmText !== 'CONFIRMAR'}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {deletingSupabase ? 'Deletando...' : 'Confirmar e Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Sincronização do Supabase */}
      <div className="bg-green-50 border-2 border-green-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-green-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-green-900 mb-2">Sincronização de Declarações DCTF (Supabase → MySQL)</h2>
            <p className="text-sm text-green-700 mb-4">
              Esta operação irá <strong>buscar todas as declarações DCTF</strong> da tabela <code className="bg-green-100 px-1 rounded">dctf_declaracoes</code> do <strong>Supabase</strong>
              e <strong>sincronizar</strong> para a tabela de mesmo nome no <strong>MySQL</strong>. Registros existentes serão atualizados, novos registros serão inseridos.
            </p>
            
            {(syncError && syncError.includes('cannot be null') || syncError?.includes('foreign key')) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 font-semibold mb-2">
                  ⚠️ Erro detectado: Schema MySQL precisa ser corrigido
                </p>
                <p className="text-sm text-yellow-700 mb-2">
                  O schema do MySQL não está alinhado com o Supabase. Clique no botão <strong>"Corrigir Schema MySQL"</strong> antes de sincronizar.
                </p>
                <p className="text-sm text-yellow-700">
                  Isso irá tornar <code className="bg-yellow-100 px-1 rounded">cliente_id</code> nullable e remover a foreign key.
                </p>
              </div>
            )}
            
            <div className="bg-white rounded-lg p-4 border border-green-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>O sistema busca todos os registros da tabela <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code> no Supabase</li>
                <li>Processa os registros em lotes de 100 para não sobrecarregar o sistema</li>
                <li>Registros existentes (mesmo ID) são atualizados no MySQL</li>
                <li>Registros novos são inseridos no MySQL</li>
                <li>O processo mostra progresso em tempo real</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Execute esta operação após receber novos dados do agente N8N</li>
                <li>Certifique-se de que o Supabase está configurado (SUPABASE_URL e SUPABASE_ANON_KEY no .env)</li>
                <li>Esta operação pode levar alguns minutos dependendo da quantidade de registros</li>
                <li>Você pode executar esta operação quantas vezes quiser - ela é segura e não duplica dados</li>
              </ul>
            </div>

            {syncSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {syncSuccess}
              </div>
            )}

            {schemaFixSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {schemaFixSuccess}
              </div>
            )}

            {schemaFixError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {schemaFixError}
              </div>
            )}

            {syncError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {syncError}
              </div>
            )}

            {syncProgress && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-blue-900">Resultado da Sincronização</h4>
                  <button
                    onClick={() => {
                      setSyncProgress(null);
                      setSyncSuccess(null);
                      setSyncError(null);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    title="Limpar resultado"
                  >
                    ✕ Fechar
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-gray-600">Total</div>
                    <div className="text-2xl font-bold text-gray-900">{syncProgress.total}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Processados</div>
                    <div className="text-2xl font-bold text-blue-600">{syncProgress.processed}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Inseridos</div>
                    <div className="text-2xl font-bold text-green-600">{syncProgress.inserted}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Atualizados</div>
                    <div className="text-2xl font-bold text-purple-600">{syncProgress.updated}</div>
                  </div>
                </div>
                {syncProgress.errors > 0 && (
                  <div className="text-sm text-red-600 mb-2 bg-red-50 border border-red-200 rounded p-2">
                    <strong>⚠️ Erros:</strong> {syncProgress.errors} registro(s) com erro durante a sincronização.
                    {syncProgress.errors === syncProgress.total && (
                      <div className="mt-1 text-xs">
                        Todos os registros falharam. Verifique se o schema MySQL foi corrigido (botão "Corrigir Schema MySQL" acima).
                      </div>
                    )}
                  </div>
                )}
                {syncProgress.processed === syncProgress.total && syncProgress.errors === 0 && (
                  <div className="text-sm text-green-600 mb-2 bg-green-50 border border-green-200 rounded p-2">
                    ✅ Sincronização concluída com sucesso! Todos os registros foram processados.
                  </div>
                )}
                <div className="w-full bg-blue-200 rounded-full h-4 overflow-hidden mb-2">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, Math.round((syncProgress.processed / syncProgress.total) * 100))}%` }}
                  />
                </div>
                <div className="text-xs text-blue-600">
                  Lote {syncProgress.currentBatch} de {syncProgress.totalBatches} • {Math.round((syncProgress.processed / syncProgress.total) * 100)}% concluído
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleFixSchema}
                disabled={fixingSchema || syncing || clearing}
                className="flex items-center gap-2 bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title="Corrige o schema MySQL para permitir cliente_id NULL e remove foreign key"
              >
                <ArrowPathIcon className="h-5 w-5" />
                {fixingSchema ? 'Corrigindo...' : 'Corrigir Schema MySQL'}
              </button>
              <button
                onClick={handleSyncFromSupabase}
                disabled={syncing || clearing || fixingSchema}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <ArrowPathIcon className="h-5 w-5" />
                {syncing ? 'Sincronizando...' : 'Sincronizar do Supabase para MySQL'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Consulta em Lote na Receita Federal */}
      <div className="bg-blue-50 border-2 border-blue-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-blue-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">Consulta em Lote - Receita Federal</h2>
            <p className="text-sm text-blue-700 mb-4">
              Consulta pagamentos na Receita Federal para CNPJs cadastrados no sistema.
              O sistema irá iterar sobre cada CNPJ, fazer requisições na Receita Federal
              e salvar/atualizar os pagamentos encontrados na tabela <code className="bg-blue-100 px-1 rounded">receita_pagamentos</code>.
            </p>

            <div className="bg-white rounded-lg p-4 border border-blue-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Informações da Consulta</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label htmlFor="dataInicialConsulta" className="block text-sm font-medium text-gray-700 mb-2">
                    Data Inicial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="dataInicialConsulta"
                    value={dataInicialConsulta}
                    onChange={(e) => setDataInicialConsulta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="dataFinalConsulta" className="block text-sm font-medium text-gray-700 mb-2">
                    Data Final <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="dataFinalConsulta"
                    value={dataFinalConsulta}
                    onChange={(e) => setDataFinalConsulta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="limiteCNPJs" className="block text-sm font-medium text-gray-700 mb-2">
                    Limite de CNPJs (opcional)
                  </label>
                  <input
                    type="number"
                    id="limiteCNPJs"
                    min="1"
                    max="200"
                    value={limiteCNPJs}
                    onChange={(e) => setLimiteCNPJs(parseInt(e.target.value) || 50)}
                    placeholder="50"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Padrão: 50 (máximo: 200)</p>
                </div>

                <div>
                  <label htmlFor="waitMs" className="block text-sm font-medium text-gray-700 mb-2">
                    Atraso entre requisições (ms)
                  </label>
                  <input
                    type="number"
                    id="waitMs"
                    min="0"
                    step="100"
                    value={waitMs}
                    onChange={(e) => setWaitMs(parseInt(e.target.value) || 0)}
                    placeholder="2000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Sugestão: 2000 ms</p>
                </div>
              </div>

              {/* Opção de busca: Todos ou Apenas Faltantes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tipo de Consulta:
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="tipoConsulta"
                      value="todos"
                      checked={!apenasFaltantes}
                      onChange={() => setApenasFaltantes(false)}
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      <strong>Todos os CNPJs</strong>
                      <span className="block text-xs text-gray-500 mt-1">
                        Consulta todos os CNPJs cadastrados (atualiza registros existentes)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="tipoConsulta"
                      value="faltantes"
                      checked={apenasFaltantes}
                      onChange={() => setApenasFaltantes(true)}
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      <strong>Apenas CNPJs Faltantes</strong>
                      <span className="block text-xs text-gray-500 mt-1">
                        Consulta apenas CNPJs que ainda não têm registros no período (evita requisições desnecessárias)
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Como funciona:</strong> O sistema irá buscar {apenasFaltantes ? 'apenas os CNPJs que ainda não têm registros de pagamento' : 'todos os CNPJs'} da tabela <code className="bg-blue-100 px-1 rounded">clientes</code>,
                  fazer uma requisição na Receita Federal para cada CNPJ (no período informado), e salvar/atualizar
                  os pagamentos encontrados na tabela <code className="bg-blue-100 px-1 rounded">receita_pagamentos</code>.
                  Se um pagamento já existir (verificado por número do documento), ele será atualizado; caso contrário, será criado.
                  {apenasFaltantes && (
                    <span className="block mt-2 font-semibold text-green-700">
                      ✓ Modo "Apenas Faltantes" ativado: Evita consultar CNPJs que já possuem dados no período, economizando requisições.
                    </span>
                  )}
                </p>
              </div>

              {consultaResultado && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-green-900 mb-3">Resultado da Consulta em Lote</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Total de CNPJs</div>
                      <div className="text-2xl font-bold text-gray-900">{consultaResultado.totalCNPJs}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Consultados</div>
                      <div className="text-2xl font-bold text-blue-600">{consultaResultado.totalConsultados}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Encontrados</div>
                      <div className="text-2xl font-bold text-green-600">{consultaResultado.totalEncontrados}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Salvos/Atualizados</div>
                      <div className="text-2xl font-bold text-purple-600">{consultaResultado.totalSalvos + consultaResultado.totalAtualizados}</div>
                      <div className="text-xs text-gray-500">
                        ({consultaResultado.totalSalvos} novos, {consultaResultado.totalAtualizados} atualizados)
                      </div>
                    </div>
                  </div>
                  {consultaResultado.totalErros > 0 && (
                    <div className="mt-3 text-sm text-red-600">
                      <strong>Erros:</strong> {consultaResultado.totalErros} CNPJ(s) com erro
                    </div>
                  )}
                  
                  {/* Detalhes por CNPJ */}
                  {consultaResultado.detalhes && consultaResultado.detalhes.length > 0 && (
                    <div className="mt-4 max-h-60 overflow-y-auto">
                      <h5 className="font-medium text-gray-900 mb-2">Detalhes por CNPJ:</h5>
                      <div className="space-y-1 text-xs">
                        {consultaResultado.detalhes.slice(0, 20).map((detalhe: any, index: number) => (
                          <div
                            key={index}
                            className={`p-2 rounded ${
                              detalhe.status === 'sucesso'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            <span className="font-medium">{detalhe.cnpj}</span>
                            {detalhe.status === 'sucesso' && (
                              <span className="ml-2">
                                - {detalhe.encontrados || 0} encontrado(s), {detalhe.salvos || 0} salvo(s), {detalhe.atualizados || 0} atualizado(s)
                              </span>
                            )}
                            {detalhe.status === 'erro' && (
                              <span className="ml-2">- Erro: {detalhe.erro}</span>
                            )}
                          </div>
                        ))}
                        {consultaResultado.detalhes.length > 20 && (
                          <div className="text-gray-500 italic">
                            ... e mais {consultaResultado.detalhes.length - 20} CNPJ(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {consultaError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                  {consultaError}
                </div>
              )}

              {/* Barra de Progresso */}
              {(consultando || progressId) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-blue-900">
                      {(progresso?.totalCNPJs ?? 0) === 0
                        ? 'Nenhum CNPJ a processar neste período (modo Apenas Faltantes).'
                        : 'Processando consulta em lote...'}
                    </div>
                    <div className="text-sm font-semibold text-blue-700">
                      {(progresso?.processados ?? 0)} de {(progresso?.totalCNPJs ?? 0)} CNPJs ({progresso?.porcentagem ?? 0}%)
                    </div>
                  </div>
                  
                  {/* Barra de progresso visual */}
                  <div className="w-full bg-blue-200 rounded-full h-4 mb-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progresso?.porcentagem ?? 0}%` }}
                    />
                  </div>
                  
                  {/* Barra secundária: progresso da gravação do CNPJ atual */}
                  {((progresso?.currentTotalItens ?? 0) > 0) && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-blue-900">
                          Gravando itens do CNPJ atual
                        </div>
                        <div className="text-xs font-semibold text-blue-700">
                          {(progresso?.currentProcessados ?? 0)} / {(progresso?.currentTotalItens ?? 0)}
                        </div>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (((progresso?.currentProcessados ?? 0) / (progresso?.currentTotalItens || 1)) * 100)
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Métricas em tempo real */}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-700">
                      Encontrados: <strong>{progresso?.encontrados ?? 0}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700">
                      Salvos: <strong>{progresso?.salvos ?? 0}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-100 text-indigo-700">
                      Atualizados: <strong>{progresso?.atualizados ?? 0}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700">
                      Pulados: <strong>{progresso?.pulados ?? 0}</strong>
                    </span>
                  </div>
                  
                  {progresso?.cnpjAtual && (
                    <div className="text-xs text-blue-600 mt-2">
                      Processando CNPJ: <span className="font-mono font-semibold">{progresso?.cnpjAtual}</span>
                    </div>
                  )}
                  
                  {(progresso?.status ?? 'em_andamento') === 'em_andamento' && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={handleCancelarConsulta}
                        className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium text-sm"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Parar Consulta
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleConsultaLote}
                disabled={consultando || !dataInicialConsulta || !dataFinalConsulta}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {consultando ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Consultando...</span>
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-5 w-5" />
                    <span>Iniciar Consulta em Lote</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Administracao;

