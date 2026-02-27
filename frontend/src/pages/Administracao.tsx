import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { dctfService } from '../services/dctf';
import { relatoriosService } from '../services/relatorios';
import { clientesService } from '../services/clientes';
import { ExclamationTriangleIcon, DocumentArrowDownIcon, TrashIcon, LockClosedIcon, ArrowPathIcon, ArrowLeftIcon, DocumentMagnifyingGlassIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const ADMIN_CREDENTIALS = {
  username: 'Admin',
  password: 'Admin',
};

const STORAGE_KEY = 'dctf_admin_authenticated';
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
    skippedDuplicate?: number;
    skippedIds?: string[];
    currentBatch: number;
    totalBatches: number;
    errorLog?: string[];
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
  
  const [retrying, setRetrying] = useState(false);
  const [lastSyncErrors, setLastSyncErrors] = useState<string[]>([]);
  const [lastBackup, setLastBackup] = useState<{ dateFormatted: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  
  // Estados para envio de email (destino dinâmico: usuário digita nome, sufixo @central-rnc.com.br)
  const EMAIL_SUFFIX = '@central-rnc.com.br';
  const [emailDestinoInput, setEmailDestinoInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Estados para importação de imagens PNG (OCR)
  const [uploadingPng, setUploadingPng] = useState(false);
  const [pngResult, setPngResult] = useState<{
    inserted: number;
    updated: number;
    errors: number;
    details?: { perFile: { filename: string; rows: number; inserted: number; error?: string; insertError?: string }[] };
  } | null>(null);
  const [pngError, setPngError] = useState<string | null>(null);
  const [selectedPngFiles, setSelectedPngFiles] = useState<File[]>([]);

  const getEmailDestinoCompleto = (): string => {
    const v = emailDestinoInput.trim();
    if (!v) return '';
    return v.includes('@') ? v : `${v}${EMAIL_SUFFIX}`;
  };
  const emailDestinoValido = (): boolean => {
    const full = getEmailDestinoCompleto();
    return full.length > 0 && full.toLowerCase().endsWith(EMAIL_SUFFIX) && full.indexOf('@') > 0;
  };
  const aplicaAutocompleteEmail = () => {
    const v = emailDestinoInput.trim();
    if (v && !v.includes('@')) setEmailDestinoInput(`${v}${EMAIL_SUFFIX}`);
  };
  
  // Estados para atualização de clientes na ReceitaWS
  const [atualizandoClientes, setAtualizandoClientes] = useState(false);
  const [atualizacaoProgresso, setAtualizacaoProgresso] = useState<{
    total: number;
    processados: number;
    sucessos: number;
    erros: number;
    atual: string;
  } | null>(null);
  const [atualizacaoResultado, setAtualizacaoResultado] = useState<any>(null);
  const [atualizacaoError, setAtualizacaoError] = useState<string | null>(null);

  // Estados para consulta em lote de Situação Fiscal
  const [consultandoSITF, setConsultandoSITF] = useState(false);
  const [progressIdSITF, setProgressIdSITF] = useState<string | null>(null);
  const [apenasFaltantesSITF, setApenasFaltantesSITF] = useState(true); // Por padrão, processar apenas faltantes
  const [progressoSITF, setProgressoSITF] = useState<{
    total: number;
    processados: number;
    sucessos: number;
    erros: number;
    porcentagem: number;
    cnpjAtual?: string;
    status: 'em_andamento' | 'concluida' | 'erro' | 'cancelada';
    erros_detalhados?: Array<{ cnpj: string; razao_social: string; erro: string }>;
  } | null>(null);
  const [resultadoSITF, setResultadoSITF] = useState<any>(null);
  const [erroSITF, setErroSITF] = useState<string | null>(null);
  const pollingIntervalSITFRef = useRef<NodeJS.Timeout | null>(null);
  
  // Estados para consulta em lote de CNPJs pendentes (com divergências)
  const [populandoPendentes, setPopulandoPendentes] = useState(false);
  const [totalPendentes, setTotalPendentes] = useState<number | null>(null);
  const [consultandoPendentes, setConsultandoPendentes] = useState(false);
  const [progressIdPendentes, setProgressIdPendentes] = useState<string | null>(null);

  // Função para verificar progresso SITF
  const verificarProgressoSITF = async (progressId: string) => {
    try {
      const progressRes = await axios.get(`/api/situacao-fiscal/lote/progresso/${progressId}`);
      const data = progressRes.data.data;
      
      setProgressoSITF(data);
      
      if (data.status === 'concluida' || data.status === 'erro' || data.status === 'cancelada') {
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        setConsultandoSITF(false);
        setConsultandoPendentes(false);
        setResultadoSITF(data);
        setProgressIdSITF(null);
        setProgressIdPendentes(null);
        // Atualizar total de pendentes após conclusão
        buscarTotalPendentes();
      }
    } catch (error: any) {
      console.error('[Administracao] Erro ao consultar progresso SITF:', error);
      // Se o progresso não for encontrado, parar o polling
      if (error.response?.status === 404) {
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        setConsultandoSITF(false);
        setProgressIdSITF(null);
      }
    }
  };

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
    // Verificar se há processamento SITF em andamento no banco de dados
    const verificarProcessamentoSITF = async () => {
      try {
        const response = await axios.get('/api/situacao-fiscal/lote/em-andamento');
        if (response.data.success && response.data.emAndamento) {
          console.log('[Administracao] Processamento SITF em andamento encontrado:', response.data.progressId);
          setConsultandoSITF(true);
          setProgressIdSITF(response.data.progressId);
          // Iniciar polling
          if (!pollingIntervalSITFRef.current) {
            const interval = setInterval(() => {
              verificarProgressoSITF(response.data.progressId);
            }, 2000);
            pollingIntervalSITFRef.current = interval;
          }
          // Primeira verificação imediata
          verificarProgressoSITF(response.data.progressId);
        }
      } catch (error: any) {
        console.warn('[Administracao] Erro ao verificar processamento SITF em andamento:', error);
        // Não mostrar erro ao usuário, apenas log
      }
    };
    
    verificarProcessamentoSITF();
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

  const handleAtualizarTodosClientes = async () => {
    setAtualizandoClientes(true);
    setAtualizacaoError(null);
    setAtualizacaoResultado(null);
    
    try {
      // Buscar todos os clientes (fazendo requisições paginadas)
      let clientes: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const response = await clientesService.getAll({ page, limit: 100 });
        if (response.items && response.items.length > 0) {
          clientes = [...clientes, ...response.items];
          // Verificar se há mais páginas
          if (response.pagination) {
            hasMore = page < response.pagination.totalPages;
            page++;
          } else {
            hasMore = response.items.length === 100; // Se retornou 100, pode haver mais
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      
      // Filtrar apenas clientes com CNPJ válido
      const clientesComCNPJ = clientes.filter((c: any) => {
        const cnpj = c.cnpj_limpo || c.cnpj;
        return cnpj && String(cnpj).replace(/\D/g, '').length === 14;
      });

      setAtualizacaoProgresso({
        total: clientesComCNPJ.length,
        processados: 0,
        sucessos: 0,
        erros: 0,
        atual: '',
      });

      const resultados: Array<{
        cnpj: string;
        razao_social: string;
        sucesso: boolean;
        erro?: string;
      }> = [];

      // Processar cada cliente com intervalo de 20 segundos
      for (let i = 0; i < clientesComCNPJ.length; i++) {
        const cliente = clientesComCNPJ[i];
        const cnpj = String(cliente.cnpj_limpo || cliente.cnpj).replace(/\D/g, '');
        const razaoSocial = cliente.razao_social || cliente.nome || 'N/A';

        setAtualizacaoProgresso(prev => prev ? {
          ...prev,
          atual: `${razaoSocial} (${cnpj})`,
        } : null);

        try {
          // Importar dados da ReceitaWS com overwrite
          const importResult = await clientesService.importarReceitaWS(cnpj, true);
          
          if (importResult.success) {
            resultados.push({
              cnpj,
              razao_social: razaoSocial,
              sucesso: true,
            });
            setAtualizacaoProgresso(prev => prev ? {
              ...prev,
              processados: prev.processados + 1,
              sucessos: prev.sucessos + 1,
            } : null);
          } else {
            resultados.push({
              cnpj,
              razao_social: razaoSocial,
              sucesso: false,
              erro: importResult.error || 'Erro desconhecido',
            });
            setAtualizacaoProgresso(prev => prev ? {
              ...prev,
              processados: prev.processados + 1,
              erros: prev.erros + 1,
            } : null);
          }
        } catch (error: any) {
          resultados.push({
            cnpj,
            razao_social: razaoSocial,
            sucesso: false,
            erro: error.message || 'Erro ao processar',
          });
          setAtualizacaoProgresso(prev => prev ? {
            ...prev,
            processados: prev.processados + 1,
            erros: prev.erros + 1,
          } : null);
        }

        // Aguardar 20 segundos antes do próximo (exceto no último)
        if (i < clientesComCNPJ.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 20000));
        }
      }

      setAtualizacaoResultado({
        total: clientesComCNPJ.length,
        sucessos: resultados.filter(r => r.sucesso).length,
        erros: resultados.filter(r => !r.sucesso).length,
        resultados,
      });

      setAtualizacaoProgresso(null);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || (typeof error === 'string' ? error : 'Erro ao atualizar clientes');
      setAtualizacaoError(errorMessage);
      setAtualizacaoProgresso(null);
    } finally {
      setAtualizandoClientes(false);
    }
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
          `Sincronização concluída: ${result.data?.inserted ?? 0} inseridos${(result.data?.errors ?? 0) > 0 ? `, ${result.data?.errors} erros` : ''}`;
        setSyncSuccess(message);
        setSyncProgress(result.data || null);
        if (result.data?.errorLog) {
          setLastSyncErrors(result.data.errorLog);
        }
        fetchLastBackup(); // atualiza data do último backup (criado antes do sync)
      } else {
        setSyncError(result.error || 'Erro ao sincronizar declarações');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao sincronizar declarações');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadLog = async () => {
    try {
      const blob = await dctfService.downloadSyncErrorsLog();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-errors-${new Date().toISOString().slice(0,10)}.log`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      if (err.response?.status === 404) {
        alert('Nenhum log de erros encontrado. Execute a sincronização primeiro.');
      } else {
        alert('Erro ao baixar log: ' + (err.message || 'Erro desconhecido'));
      }
    }
  };

  const handleRestore = async () => {
    if (!lastBackup) return;
    if (!window.confirm(`Restaurar a tabela dctf_declaracoes para o backup de ${lastBackup.dateFormatted}? Os dados atuais serão substituídos.`)) return;
    setRestoring(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const result = await dctfService.restoreFromBackup();
      if (result.success) {
        setSyncSuccess(result.message || `Restauração concluída: ${result.data?.restored ?? 0} registros.`);
      } else {
        setSyncError(result.error || 'Erro ao restaurar');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao restaurar');
    } finally {
      setRestoring(false);
    }
  };

  const handleRetrySyncErrors = async () => {
    setRetrying(true);
    setSyncError(null);
    setSyncSuccess(null);
    setSyncProgress(null);

    try {
      const result = await dctfService.retrySyncErrors();
      if (result.success) {
        const message = result.message || 
          `Retry concluído: ${result.data?.inserted ?? 0} inseridos${(result.data?.errors ?? 0) > 0 ? `, ${result.data?.errors} erros` : ''}`;
        setSyncSuccess(message);
        setSyncProgress(result.data || null);
        if (result.data?.errorLog) {
          setLastSyncErrors(result.data.errorLog);
        }
      } else {
        setSyncError(result.error || 'Erro ao fazer retry de sincronização');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao fazer retry');
    } finally {
      setRetrying(false);
    }
  };

  /**
   * Envia email com DCTFs em andamento
   */
  const handleSendEmailPending = async () => {
    const to = getEmailDestinoCompleto();
    if (!to || !emailDestinoValido()) return;
    setSendingEmail(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const result = await dctfService.sendEmailPending(to);
      if (result.success) {
        setEmailSuccess(`Email enviado com sucesso! ${result.total ?? 0} registros enviados para ${to}`);
      } else {
        setEmailError('Erro ao enviar email');
      }
    } catch (err: any) {
      setEmailError(err.response?.data?.message || err.response?.data?.error || err.message || 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleImportFromPng = async () => {
    if (!selectedPngFiles.length) return;
    setUploadingPng(true);
    setPngError(null);
    setPngResult(null);
    try {
      const data = await dctfService.importFromPng(selectedPngFiles);
      setPngResult({
        inserted: data.inserted,
        updated: data.updated ?? 0,
        errors: data.errors,
        details: data.details,
      });
      setSelectedPngFiles([]);
    } catch (err: any) {
      setPngError(err.response?.data?.message || err.response?.data?.error || err.message || 'Erro ao importar PNG.');
    } finally {
      setUploadingPng(false);
    }
  };

  // Função para cancelar consulta de Situação Fiscal
  const handleCancelarConsultaSITF = async () => {
    if (!progressIdSITF) return;

    try {
      const response = await axios.post(`/api/situacao-fiscal/lote/${progressIdSITF}/cancelar`);
      
      if (response.data.success) {
        // Parar polling
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        
        setConsultandoSITF(false);
        setErroSITF('Consulta cancelada pelo usuário.');
        setProgressIdSITF(null);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao cancelar consulta';
      setErroSITF(errorMessage);
    }
  };

  // Função para popular tabela de CNPJs pendentes
  const handlePopularPendentes = async () => {
    setPopulandoPendentes(true);
    setTotalPendentes(null);
    
    try {
      const response = await axios.post('/api/situacao-fiscal/lote/popular-pendentes');
      
      if (response.data.success) {
        setTotalPendentes(response.data.total);
        alert(`✅ ${response.data.total} CNPJs com divergências adicionados à fila de processamento!`);
      } else {
        alert(`❌ Erro: ${response.data.error || 'Erro ao popular tabela'}`);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao popular tabela';
      alert(`❌ Erro: ${errorMessage}`);
    } finally {
      setPopulandoPendentes(false);
    }
  };

  // Função para iniciar consulta em lote de pendentes
  const handleIniciarConsultaPendentes = async () => {
    setConsultandoPendentes(true);
    setErroSITF(null);
    setProgressoSITF(null);
    
    try {
      const response = await axios.post('/api/situacao-fiscal/lote/iniciar-pendentes');
      
      if (response.data.success) {
        setProgressIdPendentes(response.data.progressId);
        // Usar o mesmo polling do SITF normal
        setProgressIdSITF(response.data.progressId);
        if (!pollingIntervalSITFRef.current) {
          const interval = setInterval(() => {
            verificarProgressoSITF(response.data.progressId);
          }, 2000);
          pollingIntervalSITFRef.current = interval;
        }
        verificarProgressoSITF(response.data.progressId);
      } else {
        setErroSITF(response.data.error || 'Erro ao iniciar consulta');
        setConsultandoPendentes(false);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao iniciar consulta';
      setErroSITF(errorMessage);
      setConsultandoPendentes(false);
    }
  };

  // Função para buscar total de pendentes
  const buscarTotalPendentes = async () => {
    try {
      const response = await axios.get('/api/situacao-fiscal/lote/pendentes?status=pendente');
      if (response.data.success) {
        setTotalPendentes(response.data.total || 0);
      }
    } catch (err) {
      // Ignorar erro silenciosamente
    }
  };

  // Buscar total de pendentes ao carregar
  useEffect(() => {
    buscarTotalPendentes();
  }, []);

  const fetchLastBackup = async () => {
    try {
      const res = await dctfService.getLastBackup();
      if (res.success && res.data) {
        setLastBackup({ dateFormatted: res.data.dateFormatted });
      } else {
        setLastBackup(null);
      }
    } catch {
      setLastBackup(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchLastBackup();
  }, [isAuthenticated]);

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
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* Seção de Atualização de Clientes na ReceitaWS */}
      <div className="bg-blue-50 border-2 border-blue-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-blue-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">Atualização de Clientes na ReceitaWS</h2>
            <p className="text-sm text-blue-700 mb-4">
              Esta operação irá <strong>atualizar todos os clientes</strong> na base de dados consultando a API da ReceitaWS.
              Cada cliente será atualizado com um intervalo de <strong>20 segundos</strong> entre cada atualização para respeitar os limites da API.
            </p>
            
            <div className="bg-white rounded-lg p-4 border border-blue-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>O sistema busca todos os clientes com CNPJ válido</li>
                <li>Para cada cliente, consulta a ReceitaWS e atualiza os dados</li>
                <li>Aguarda 20 segundos entre cada atualização</li>
                <li>Mostra progresso em tempo real com barra de progresso</li>
                <li>Exibe relatório final com sucessos e erros</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Execute esta operação quando precisar atualizar a base de clientes</li>
                <li>O processo pode levar bastante tempo dependendo da quantidade de clientes</li>
                <li>Não feche a página durante a atualização</li>
              </ul>
            </div>

            {atualizacaoError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                {typeof atualizacaoError === 'string' ? atualizacaoError : JSON.stringify(atualizacaoError)}
              </div>
            )}

            {atualizacaoResultado && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Atualização Concluída!</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">{atualizacaoResultado.total}</div>
                    <div className="text-sm text-green-600">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">{atualizacaoResultado.sucessos}</div>
                    <div className="text-sm text-green-600">Sucessos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-700">{atualizacaoResultado.erros}</div>
                    <div className="text-sm text-red-600">Erros</div>
                  </div>
                </div>
                {atualizacaoResultado.erros > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-red-700 hover:text-red-800">
                      Ver erros ({atualizacaoResultado.erros})
                    </summary>
                    <div className="mt-2 max-h-60 overflow-y-auto">
                      {atualizacaoResultado.resultados
                        .filter((r: any) => !r.sucesso)
                        .map((r: any, idx: number) => (
                          <div key={idx} className="text-xs text-red-700 p-2 border-b border-red-200">
                            <strong>{r.razao_social}</strong> ({r.cnpj}): {r.erro}
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Barra de Progresso */}
            {atualizacaoProgresso && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-blue-900">
                    Atualizando clientes na ReceitaWS...
                  </div>
                  <div className="text-sm font-semibold text-blue-700">
                    {atualizacaoProgresso.processados} de {atualizacaoProgresso.total} ({Math.round((atualizacaoProgresso.processados / atualizacaoProgresso.total) * 100)}%)
                  </div>
                </div>
                
                {/* Barra de progresso visual */}
                <div className="w-full bg-blue-200 rounded-full h-4 mb-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.round((atualizacaoProgresso.processados / atualizacaoProgresso.total) * 100)}%` }}
                  />
                </div>
                
                {/* Métricas em tempo real */}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700">
                    Sucessos: <strong>{atualizacaoProgresso.sucessos}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700">
                    Erros: <strong>{atualizacaoProgresso.erros}</strong>
                  </span>
                </div>
                
                {atualizacaoProgresso.atual && (
                  <div className="text-xs text-blue-600 mt-2">
                    Processando: <span className="font-mono font-semibold">{atualizacaoProgresso.atual}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleAtualizarTodosClientes}
              disabled={atualizandoClientes}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {atualizandoClientes ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Atualizando...</span>
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-5 w-5" />
                  <span>Iniciar Atualização de Todos os Clientes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Seção de Sincronização do Supabase */}
      <div className="bg-green-50 border-2 border-green-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-green-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-green-900 mb-2">Sincronização de Declarações DCTF (Supabase → MySQL)</h2>
            <p className="text-sm text-green-700 mb-4">
              Esta operação irá <strong>buscar todas as declarações DCTF</strong> da tabela <code className="bg-green-100 px-1 rounded">dctf_declaracoes</code> do <strong>Supabase</strong>
              e <strong>sincronizar</strong> para a tabela de mesmo nome no <strong>MySQL</strong>. Apenas <strong>novos</strong> registros são inseridos; só é ignorado quem já existe com o <strong>mesmo ID</strong>. Mesmo CNPJ e período com outros campos diferentes (ex.: Original vs Retificadora) são inseridos como registros distintos.
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
                <li><strong>Antes de sincronizar</strong>, é criado um backup automático da tabela (para poder restaurar depois)</li>
                <li>Registros já existentes no MySQL (mesmo ID) são ignorados; mesmo CNPJ + período com outros campos diferentes = registros distintos, inseridos</li>
                <li>Apenas registros novos são inseridos no MySQL</li>
                <li>O processo mostra progresso em tempo real</li>
                <li>Use o botão <strong>Restaurar</strong> (com a data do último backup) para reverter a tabela ao estado anterior</li>
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
                  {syncProgress.skippedDuplicate != null && syncProgress.skippedDuplicate > 0 && (
                    <div>
                      <div className="text-gray-600">Ignorados (já existia)</div>
                      <div className="text-2xl font-bold text-amber-600">{syncProgress.skippedDuplicate}</div>
                    </div>
                  )}
                </div>
                {syncProgress.skippedDuplicate != null && syncProgress.skippedDuplicate > 0 && (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    {syncProgress.skippedDuplicate} registro(s) ignorado(s): já existia no MySQL (mesmo ID).
                    {syncProgress.skippedIds && syncProgress.skippedIds.length > 0 && (
                      <div className="mt-1 font-mono text-xs break-all">
                        IDs ignorados: {syncProgress.skippedIds.join(', ')}
                      </div>
                    )}
                    <div className="mt-1">
                      Se o MySQL estava limpo antes do sync, esses IDs estão <strong>duplicados no Supabase</strong> (mesmo UUID em mais de um registro). Só o primeiro de cada ID é inserido; para inserir os 925 é preciso corrigir ou remover as duplicatas no Supabase.
                    </div>
                  </div>
                )}
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

            {/* Monitoramento de Erros - Opção B */}
            {syncProgress && syncProgress.errors > 0 && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mt-4 mb-4">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900 mb-2">
                      🔍 Monitoramento de Erros
                    </h4>
                    <div className="text-sm text-yellow-800 mb-3">
                      <strong>{syncProgress.errors}</strong> registro(s) falharam na sincronização
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {/* Opção A: Botão para baixar log */}
                      <button
                        onClick={handleDownloadLog}
                        className="flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium transition-colors"
                        title="Baixar arquivo com detalhes completos dos erros"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4" />
                        📥 Baixar Log de Erros
                      </button>
                      
                      {/* Opção C: Botão de retry automático */}
                      <button
                        onClick={handleRetrySyncErrors}
                        disabled={retrying}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                        title="Tentar sincronizar novamente os registros com erro"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
                        🔄 {retrying ? 'Tentando novamente...' : 'Tentar Novamente'}
                      </button>
                    </div>

                    {/* Opção B: Painel mostrando últimos erros em tempo real */}
                    {lastSyncErrors.length > 0 && (
                      <details className="mt-3" open={lastSyncErrors.length <= 5}>
                        <summary className="text-sm font-medium text-yellow-900 cursor-pointer hover:text-yellow-700 mb-2">
                          📋 Ver Últimos Erros ({lastSyncErrors.length})
                        </summary>
                        <div className="mt-2 bg-white rounded border border-yellow-300 p-3 max-h-60 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {lastSyncErrors.slice(0, 15).join('\n\n---\n\n')}
                            {lastSyncErrors.length > 15 && '\n\n... e mais ' + (lastSyncErrors.length - 15) + ' erros (baixe o log completo)'}
                          </pre>
                        </div>
                      </details>
                    )}
                    
                    {lastSyncErrors.length === 0 && (
                      <div className="text-xs text-yellow-700 bg-yellow-100 rounded p-2">
                        💡 <strong>Dica:</strong> Clique em "Baixar Log de Erros" para ver detalhes completos dos problemas
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 items-center">
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
              <button
                onClick={handleRestore}
                disabled={restoring || !lastBackup || syncing || clearing}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title="Restaura a tabela dctf_declaracoes a partir do backup mais recente (criado antes da última sincronização)"
              >
                <ArrowUturnLeftIcon className="h-5 w-5" />
                {restoring ? 'Restaurando...' : lastBackup ? `Restaurar (${lastBackup.dateFormatted})` : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Envio de Email com DCTFs em Andamento */}
      <div className="bg-purple-50 border-2 border-purple-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-purple-600 mr-3 mt-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-purple-900 mb-2">Enviar Email - DCTFs em Andamento</h2>
            <p className="text-sm text-purple-700 mb-4">
              Envia um email formatado com todas as DCTFs em status <strong>"Em andamento"</strong> (Clientes Ativos).
              Digite o nome do destinatário; o sufixo <strong>@central-rnc.com.br</strong> é preenchido automaticamente ao sair do campo ou ao pressionar Tab.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <label htmlFor="email-destino" className="text-sm font-medium text-purple-900">Destinatário:</label>
              <div className="flex items-center rounded-lg border-2 border-purple-300 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-200">
                <input
                  id="email-destino"
                  type="text"
                  value={emailDestinoInput}
                  onChange={(e) => setEmailDestinoInput(e.target.value)}
                  onBlur={aplicaAutocompleteEmail}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') aplicaAutocompleteEmail();
                  }}
                  placeholder="Ex: ti"
                  className="px-3 py-2 rounded-l-md border-0 focus:ring-0 min-w-[120px] text-gray-900 placeholder-gray-400"
                  autoComplete="off"
                />
                <span className="px-3 py-2 text-gray-500 bg-gray-50 border-l border-purple-200 rounded-r-md text-sm select-none">
                  @central-rnc.com.br
                </span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-purple-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será incluído:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Todas as DCTFs com situação <strong>"Em andamento"</strong></li>
                <li>Informações completas: CNPJ, Período, Data/Hora transmissão, Categoria, Origem, Tipo</li>
                <li>Valores financeiros: Débito Apurado e Saldo a Pagar</li>
                <li>Totalizadores: Total de registros, soma de débitos e soma de saldos</li>
                <li>HTML bem formatado para fácil leitura</li>
              </ul>
            </div>

            {emailSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                ✅ {emailSuccess}
              </div>
            )}

            {emailError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                ❌ {emailError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSendEmailPending}
                disabled={sendingEmail || !emailDestinoValido()}
                className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                {sendingEmail ? 'Enviando Email...' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção Importar de imagens PNG */}
      <div className="bg-amber-50 border-2 border-amber-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <DocumentMagnifyingGlassIcon className="h-6 w-6 text-amber-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Importar de imagens PNG</h2>
            <p className="text-sm text-amber-700 mb-4">
              Selecione uma ou mais imagens PNG (prints da tela oficial da Receita com a tabela de declarações).
              O sistema extrai os dados via OCR e grava na tabela <code className="bg-amber-100 px-1 rounded">teste_png</code> (MySQL).
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <label className="cursor-pointer bg-white border-2 border-amber-400 text-amber-800 px-4 py-2 rounded-lg hover:bg-amber-50 font-medium">
                <input
                  type="file"
                  accept="image/png"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    setSelectedPngFiles(list);
                    setPngResult(null);
                    setPngError(null);
                  }}
                />
                {selectedPngFiles.length ? `${selectedPngFiles.length} arquivo(s) selecionado(s)` : 'Selecionar PNG'}
              </label>
              <button
                type="button"
                onClick={handleImportFromPng}
                disabled={uploadingPng || selectedPngFiles.length === 0}
                className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {uploadingPng ? `Processando ${selectedPngFiles.length} imagem(ns)...` : 'Importar'}
              </button>
            </div>
            {pngError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-800 text-sm">
                {pngError}
              </div>
            )}
            {pngResult && (
              <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded-lg text-green-800 text-sm">
                <p className="font-medium">Importação concluída: {pngResult.inserted} registro(s) inserido(s), {pngResult.errors} erro(s).</p>
                {pngResult.details?.perFile?.length ? (
                  <ul className="mt-2 list-disc list-inside text-xs">
                    {pngResult.details.perFile.map((f, i) => (
                      <li key={i}>
                        {f.filename}: {f.rows} linha(s), {f.inserted} inserido(s)
                        {f.error ? ` — ${f.error}` : ''}
                        {f.insertError ? ` — Erro MySQL: ${f.insertError}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção de Consulta em Lote de CNPJs com Divergências */}
      <div className="bg-amber-50 border-2 border-amber-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Consulta em Lote - CNPJs com Divergências</h2>
            <p className="text-sm text-amber-700 mb-4">
              Consulta apenas os CNPJs de empresas na aba Participação que têm divergências
              (percentuais não somam 100% ou valores não batem com Capital Social).
              Os CNPJs são armazenados em uma tabela temporária e removidos após processamento bem-sucedido.
            </p>

            <div className="bg-white rounded-lg p-4 border border-amber-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>Clique em "Popular Tabela" para identificar CNPJs com divergências</li>
                <li>Clique em "Iniciar Consulta" para processar os CNPJs da tabela temporária</li>
                <li>Cada CNPJ é removido da tabela após ser processado com sucesso</li>
                <li>CNPJs com erro permanecem na tabela para nova tentativa</li>
              </ol>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handlePopularPendentes}
                disabled={populandoPendentes || consultandoPendentes}
                className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {populandoPendentes ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Populando...
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-4 w-4" />
                    Popular Tabela
                  </>
                )}
              </button>

              <button
                onClick={handleIniciarConsultaPendentes}
                disabled={consultandoPendentes || consultandoSITF || !totalPendentes || totalPendentes === 0}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {consultandoPendentes ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Processando...
                  </>
                ) : (
                  <>
                    <DocumentMagnifyingGlassIcon className="h-4 w-4" />
                    Iniciar Consulta
                  </>
                )}
              </button>

              {totalPendentes !== null && (
                <span className="text-sm font-semibold text-amber-700 bg-amber-100 px-3 py-2 rounded">
                  {totalPendentes} CNPJ{totalPendentes !== 1 ? 's' : ''} pendente{totalPendentes !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Consulta em Lote de Situação Fiscal */}
      <div className="bg-emerald-50 border-2 border-emerald-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <DocumentMagnifyingGlassIcon className="h-6 w-6 text-emerald-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-emerald-900 mb-2">Consulta em Lote - Situação Fiscal (SITF)</h2>
            <p className="text-sm text-emerald-700 mb-4">
              Consulta a Situação Fiscal (SITF) de todos os CNPJs cadastrados no sistema.
              O sistema irá iterar sobre cada CNPJ, fazer requisições na Receita Federal
              e salvar os PDFs e dados extraídos na tabela <code className="bg-emerald-100 px-1 rounded">sitf_downloads</code>.
            </p>

            <div className="bg-white rounded-lg p-4 border border-emerald-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Informações Importantes:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>A consulta é feita de forma sequencial (um CNPJ por vez)</li>
                <li>Aguarda 3 segundos entre cada requisição para não sobrecarregar a API</li>
                <li>Os PDFs são baixados e os dados são extraídos automaticamente</li>
                <li>Sócios, débitos e pendências são atualizados no sistema</li>
                <li>A operação pode levar vários minutos dependendo da quantidade de clientes</li>
              </ul>
            </div>

            {erroSITF && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                <strong>Erro:</strong> {erroSITF}
              </div>
            )}

            {resultadoSITF && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 text-sm">
                <strong>Consulta Concluída!</strong>
                <ul className="mt-2 list-disc list-inside">
                  <li>Total processado: {resultadoSITF.total || 0} CNPJs</li>
                  {resultadoSITF.totalOriginal && resultadoSITF.totalOriginal > (resultadoSITF.total || 0) && (
                    <li className="text-blue-700">
                      CNPJs já processados ignorados: {resultadoSITF.totalOriginal - (resultadoSITF.total || 0)}
                    </li>
                  )}
                  <li>Sucessos: {resultadoSITF.sucessos || 0}</li>
                  <li>Erros: {resultadoSITF.erros || 0}</li>
                </ul>
                {resultadoSITF.erros_detalhados && resultadoSITF.erros_detalhados.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-300">
                    <details className="cursor-pointer">
                      <summary className="font-semibold text-red-700 hover:text-red-800">
                        Ver erros detalhados ({resultadoSITF.erros_detalhados.length})
                      </summary>
                      <div className="mt-2 max-h-64 overflow-y-auto">
                        <table className="min-w-full divide-y divide-red-200 text-xs">
                          <thead className="bg-red-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">CNPJ</th>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">Razão Social</th>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">Erro</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-red-100">
                            {resultadoSITF.erros_detalhados.map((erro: any, idx: number) => (
                              <tr key={idx} className="hover:bg-red-50">
                                <td className="px-3 py-2 font-mono text-red-800">{erro.cnpj}</td>
                                <td className="px-3 py-2 text-red-700">{erro.razao_social}</td>
                                <td className="px-3 py-2 text-red-600">{erro.erro}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Log de Erros Detalhados */}
            {progressoSITF && progressoSITF.erros_detalhados && progressoSITF.erros_detalhados.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  Log de Erros ({progressoSITF.erros_detalhados.length} erro{progressoSITF.erros_detalhados.length !== 1 ? 's' : ''})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-red-200 text-xs">
                    <thead className="bg-red-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">CNPJ</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Razão Social</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Erro</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-red-100">
                      {progressoSITF.erros_detalhados.map((erro, idx) => (
                        <tr key={idx} className="hover:bg-red-50">
                          <td className="px-3 py-2 font-mono text-red-800">{erro.cnpj}</td>
                          <td className="px-3 py-2 text-red-700">{erro.razao_social}</td>
                          <td className="px-3 py-2 text-red-600">{erro.erro}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {progressoSITF && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-emerald-900">
                    Processando consulta em lote de Situação Fiscal...
                  </div>
                  <div className="text-sm font-semibold text-emerald-700">
                    {progressoSITF.processados} de {progressoSITF.total} CNPJs ({progressoSITF.porcentagem}%)
                  </div>
                </div>
                
                {/* Barra de progresso visual */}
                <div className="w-full bg-emerald-200 rounded-full h-4 mb-2 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressoSITF.porcentagem}%` }}
                  />
                </div>

                {/* Métricas em tempo real */}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700">
                    Sucessos: <strong>{progressoSITF.sucessos}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700">
                    Erros: <strong>{progressoSITF.erros}</strong>
                  </span>
                </div>
                
                {progressoSITF.cnpjAtual && (
                  <div className="text-xs text-emerald-600 mt-2">
                    Processando CNPJ: <span className="font-mono font-semibold">{progressoSITF.cnpjAtual}</span>
                  </div>
                )}

                {(progressoSITF.status === 'em_andamento') && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleCancelarConsultaSITF}
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

            {/* Opção para escolher processar todos ou apenas faltantes */}
            <div className="bg-white rounded-lg p-4 border border-emerald-300 mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={apenasFaltantesSITF}
                  onChange={(e) => setApenasFaltantesSITF(e.target.checked)}
                  disabled={consultandoSITF}
                  className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Processar apenas CNPJs faltantes
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Se marcado, processa apenas CNPJs que ainda não têm registros de Situação Fiscal. 
                    Isso evita reprocessar CNPJs já consultados.
                  </div>
                </div>
              </label>
            </div>

            <button
              onClick={async () => {
                setConsultandoSITF(true);
                setErroSITF(null);
                setResultadoSITF(null);
                
                try {
                  const response = await axios.post('/api/situacao-fiscal/lote/iniciar', {
                    apenasFaltantes: apenasFaltantesSITF
                  }, {
                    params: {
                      apenasFaltantes: apenasFaltantesSITF
                    }
                  });
                  const { progressId, total, totalOriginal, jaProcessados, message } = response.data;
                  
                  // Mostrar mensagem informativa se houver CNPJs já processados
                  if (jaProcessados > 0) {
                    console.log(`[SITF] ${jaProcessados} CNPJs já processados foram ignorados`);
                  }
                  
                  setProgressIdSITF(progressId);
                  
                  // Iniciar polling do progresso
                  if (pollingIntervalSITFRef.current) {
                    clearInterval(pollingIntervalSITFRef.current);
                  }
                  
                  const interval = setInterval(() => {
                    verificarProgressoSITF(progressId);
                  }, 2000);
                  
                  pollingIntervalSITFRef.current = interval;
                  
                  // Primeira verificação imediata
                  verificarProgressoSITF(progressId);
                  
                } catch (error: any) {
                  setErroSITF(error.response?.data?.error || error.message || 'Erro ao iniciar consulta');
                  setConsultandoSITF(false);
                }
              }}
              disabled={consultandoSITF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {consultandoSITF ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Consultando...</span>
                </>
              ) : (
                <>
                  <DocumentMagnifyingGlassIcon className="h-5 w-5" />
                  <span>Iniciar Consulta de Situação Fiscal</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Administracao;

