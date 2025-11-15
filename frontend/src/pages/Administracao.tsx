import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { dctfService } from '../services/dctf';
import { relatoriosService } from '../services/relatorios';
import { ExclamationTriangleIcon, DocumentArrowDownIcon, TrashIcon, LockClosedIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const ADMIN_CREDENTIALS = {
  username: 'Admin',
  password: 'Admin',
};

const STORAGE_KEY = 'dctf_admin_authenticated';
const AUTH_TIMEOUT = 30 * 60 * 1000; // 30 minutos em milissegundos

const Administracao: React.FC = () => {
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
  
  // Estados para consulta em lote na Receita
  const [dataInicialConsulta, setDataInicialConsulta] = useState('');
  const [dataFinalConsulta, setDataFinalConsulta] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [consultaResultado, setConsultaResultado] = useState<any>(null);
  const [consultaError, setConsultaError] = useState<string | null>(null);
  const [limiteCNPJs, setLimiteCNPJs] = useState<number>(50);
  
  // Estados para progresso da consulta em lote
  const [progressId, setProgressId] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{
    totalCNPJs: number;
    processados: number;
    porcentagem: number;
    cnpjAtual?: string;
    status: 'em_andamento' | 'concluida' | 'cancelada' | 'erro';
  } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Verificar autenticação ao carregar
  useEffect(() => {
    const authData = sessionStorage.getItem(STORAGE_KEY);
    if (authData) {
      try {
        const { timestamp } = JSON.parse(authData);
        const now = Date.now();
        const elapsed = now - timestamp;
        
        // Verificar se ainda está dentro do timeout
        if (elapsed < AUTH_TIMEOUT) {
          setIsAuthenticated(true);
          setShowLoginModal(false);
          
          // Configurar timeout para expirar quando o tempo restante acabar
          const remainingTime = AUTH_TIMEOUT - elapsed;
          const timeoutId = setTimeout(() => {
            handleLogout();
          }, remainingTime);
          
          return () => clearTimeout(timeoutId);
        } else {
          // Timeout expirado, remover autenticação
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Formato antigo ou inválido, remover
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setShowLoginModal(false);
      // Armazenar timestamp da autenticação
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now() }));
      setUsername('');
      setPassword('');
      
      // Configurar timeout para expirar após 30 minutos
      setTimeout(() => {
        handleLogout();
      }, AUTH_TIMEOUT);
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
          setClearSuccess(null);
          // Recarregar a página após 3 segundos
          setTimeout(() => {
            window.location.reload();
          }, 2000);
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
          cnpjAtual: progressoData.cnpjAtual,
          status: progressoData.status,
        });

        // Se a consulta foi concluída, cancelada ou teve erro, parar o polling
        if (progressoData.status === 'concluida' || progressoData.status === 'cancelada' || progressoData.status === 'erro') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setConsultando(false);
          
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
      console.error('Erro ao verificar progresso:', err);
      // Continuar tentando mesmo em caso de erro temporário
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

    // Limpar estados anteriores
    setConsultando(true);
    setConsultaError(null);
    setConsultaResultado(null);
    setProgresso(null);
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
        }
      );

      if (response.data.success && response.data.data?.progressId) {
        const id = response.data.data.progressId;
        setProgressId(id);
        
        // Iniciar polling para verificar progresso a cada 1 segundo
        const interval = setInterval(() => {
          verificarProgresso(id);
        }, 1000);
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

              <button
                type="submit"
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Entrar
              </button>
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
            <h2 className="text-xl font-semibold text-red-900 mb-2">Limpeza de Declarações DCTF</h2>
            <p className="text-sm text-red-700 mb-4">
              Esta operação irá <strong>deletar permanentemente</strong> todas as declarações DCTF e seus dados relacionados do banco de dados.
              Esta ação é <strong>irreversível</strong> e deve ser executada apenas antes de inserir novos dados mensais.
            </p>
            
            <div className="bg-white rounded-lg p-4 border border-red-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será deletado:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>Todas as declarações da tabela <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code></li>
                <li>Todos os dados relacionados da tabela <code className="bg-gray-100 px-1 rounded">dctf_dados</code></li>
                <li>Todos os registros de análise e flags associados</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li><strong>Sempre</strong> faça um backup antes de executar esta operação</li>
                <li>Execute esta operação apenas no início de cada mês, antes de inserir novos dados</li>
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

      {/* Seção de Consulta em Lote na Receita Federal */}
      <div className="bg-blue-50 border-2 border-blue-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-blue-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">Consulta em Lote - Receita Federal</h2>
            <p className="text-sm text-blue-700 mb-4">
              Consulta pagamentos na Receita Federal para <strong>todos os CNPJs</strong> cadastrados no sistema.
              O sistema irá iterar sobre cada CNPJ da tabela de clientes, fazer requisições na Receita Federal
              e salvar/atualizar os pagamentos encontrados na tabela <code className="bg-blue-100 px-1 rounded">receita_pagamentos</code>.
            </p>

            <div className="bg-white rounded-lg p-4 border border-blue-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Informações da Consulta</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Como funciona:</strong> O sistema irá buscar todos os CNPJs da tabela <code className="bg-blue-100 px-1 rounded">clientes</code>,
                  fazer uma requisição na Receita Federal para cada CNPJ (no período informado), e salvar/atualizar
                  os pagamentos encontrados na tabela <code className="bg-blue-100 px-1 rounded">receita_pagamentos</code>.
                  Se um pagamento já existir (verificado por número do documento), ele será atualizado; caso contrário, será criado.
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
              {consultando && progresso && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-blue-900">
                      Processando consulta em lote...
                    </div>
                    <div className="text-sm font-semibold text-blue-700">
                      {progresso.processados} de {progresso.totalCNPJs} CNPJs ({progresso.porcentagem}%)
                    </div>
                  </div>
                  
                  {/* Barra de progresso visual */}
                  <div className="w-full bg-blue-200 rounded-full h-4 mb-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progresso.porcentagem}%` }}
                    />
                  </div>
                  
                  {progresso.cnpjAtual && (
                    <div className="text-xs text-blue-600 mt-2">
                      Processando CNPJ: <span className="font-mono font-semibold">{progresso.cnpjAtual}</span>
                    </div>
                  )}
                  
                  {progresso.status === 'em_andamento' && (
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

