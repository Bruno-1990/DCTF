import React, { useState, useEffect } from 'react';
import { 
  ClockIcon, 
  ArrowDownTrayIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { bancoHorasService } from '../services/bancoHoras';
import type { BancoHorasRelatorio } from '../services/bancoHoras';
import { useToast } from '../hooks/useToast';

const BancoHorasPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [cnpj, setCnpj] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [loading, setLoading] = useState(false);
  const [historico, setHistorico] = useState<BancoHorasRelatorio[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string | null; nomeArquivo?: string; countdown: number }>({ id: null, nomeArquivo: undefined, countdown: 0 });
  const [deleteTimer, setDeleteTimer] = useState<NodeJS.Timeout | null>(null);

  // Carregar histórico ao montar componente
  useEffect(() => {
    // Usar setTimeout para garantir que o componente esteja totalmente montado
    const timer = setTimeout(() => {
      carregarHistorico();
    }, 100);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      const relatorios = await bancoHorasService.listarHistorico();
      setHistorico(Array.isArray(relatorios) ? relatorios : []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      // Não mostrar erro ao usuário, apenas logar
      // O histórico é opcional, não deve quebrar a página
      setHistorico([]); // Garantir que o estado seja um array vazio
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const formatarCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    
    if (numbers.length <= 2) {
      return numbers;
    } else if (numbers.length <= 5) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
    } else if (numbers.length <= 8) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
    } else if (numbers.length <= 12) {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
    } else {
      return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12, 14)}`;
    }
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatarCNPJ(e.target.value);
    setCnpj(formatted);
  };

  const validarFormulario = (): boolean => {
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      showError('CNPJ inválido. Informe um CNPJ completo.');
      return false;
    }

    if (!dataInicial) {
      showError('Data Inicial é obrigatória.');
      return false;
    }

    if (!dataFinal) {
      showError('Data Final é obrigatória.');
      return false;
    }

    const dataIni = new Date(dataInicial);
    const dataFim = new Date(dataFinal);

    if (dataFim < dataIni) {
      showError('Data Final deve ser maior ou igual à Data Inicial.');
      return false;
    }

    return true;
  };

  const handleGerar = async () => {
    if (!validarFormulario()) {
      return;
    }

    setLoading(true);
    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      const blob = await bancoHorasService.gerarRelatorio({
        cnpj: cnpjLimpo,
        dataInicial,
        dataFinal,
      });

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.href = url;
      link.download = `Banco_Horas_${cnpjLimpo}_${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      success('Relatório gerado com sucesso!');
      
      // Limpar formulário e recarregar histórico
      setCnpj('');
      setDataInicial('');
      setDataFinal('');
      await carregarHistorico();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Erro ao gerar relatório';
      showError(errorMessage);
      console.error('Erro ao gerar relatório:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBaixarHistorico = async (id: string, nomeArquivo: string) => {
    try {
      const blob = await bancoHorasService.baixarDoHistorico(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success('Relatório completo baixado com sucesso!');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Erro ao baixar relatório';
      showError(errorMessage);
    }
  };

  const handleBaixarFormatado = async (id: string, nomeArquivo?: string) => {
    try {
      const blob = await bancoHorasService.baixarFormatadoDoHistorico(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo || 'Banco_Horas_FORMATADO.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success('Relatório formatado baixado com sucesso!');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Erro ao baixar relatório formatado';
      showError(errorMessage);
    }
  };

  const handleDeletarClick = (id: string, nomeArquivo?: string) => {
    // Limpar timer anterior se existir
    if (deleteTimer) {
      clearInterval(deleteTimer);
      setDeleteTimer(null);
    }
    
    // Iniciar contagem regressiva de 3 segundos
    setPendingDelete({ id, nomeArquivo, countdown: 3 });
    
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
    setPendingDelete({ id: null, nomeArquivo: undefined, countdown: 0 });
  };

  const executeDelete = async (id: string) => {
    // Limpar estado de exclusão pendente
    setPendingDelete({ id: null, nomeArquivo: undefined, countdown: 0 });
    
    try {
      await bancoHorasService.deletarHistorico(id);
      success('Relatório excluído com sucesso!');
      await carregarHistorico();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Erro ao excluir relatório';
      showError(errorMessage);
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

  const formatarData = (dataStr?: string) => {
    if (!dataStr) return '-';
    const data = new Date(dataStr);
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatarTamanho = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            Concluído
          </span>
        );
      case 'gerando':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <svg className="animate-spin -ml-1 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Gerando...
          </span>
        );
      case 'erro':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
            Erro
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Modal de Loading */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <svg
                className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Gerando Relatório</h3>
              <p className="text-sm text-gray-600">
                Por favor, aguarde enquanto processamos os dados...
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Este processo pode levar alguns minutos
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Formulário */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <ClockIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Banco de Horas SCI</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Gere relatórios de horas trabalhadas e horas extras por colaborador
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGerar();
              }}
              className="space-y-6"
            >
              <div>
                <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
                  CNPJ da Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="cnpj"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Informe o CNPJ da empresa (apenas números ou com formatação)
                </p>
              </div>

              <div>
                <label htmlFor="dataInicial" className="block text-sm font-medium text-gray-700 mb-2">
                  Data Inicial <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="dataInicial"
                  value={dataInicial}
                  onChange={(e) => setDataInicial(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Data inicial do período a ser consultado
                </p>
              </div>

              <div>
                <label htmlFor="dataFinal" className="block text-sm font-medium text-gray-700 mb-2">
                  Data Final <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="dataFinal"
                  value={dataFinal}
                  onChange={(e) => setDataFinal(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Data final do período a ser consultado
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Gerar Relatório
                </button>
              </div>
            </form>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">Informações:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>O relatório inclui apenas colaboradores ativos no período informado</li>
                <li>Horas trabalhadas são calculadas a partir da verba 5</li>
                <li>Horas extras incluem as verbas 603, 605, 608, 613 e 615</li>
                <li>O arquivo será baixado automaticamente após a geração</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Histórico de Relatórios</h2>
              <p className="text-sm text-gray-500 mt-1">
                Acesse relatórios gerados anteriormente
              </p>
            </div>
            <button
              onClick={carregarHistorico}
              disabled={carregandoHistorico}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              {carregandoHistorico ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          <div className="px-6 py-4">
            {carregandoHistorico && historico.length === 0 ? (
              <div className="text-center py-8">
                <svg
                  className="animate-spin h-8 w-8 text-blue-600 mx-auto"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">Carregando histórico...</p>
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Nenhum relatório gerado ainda</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CNPJ
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Período
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tamanho
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {historico.map((relatorio) => (
                      <tr key={relatorio.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {relatorio.cnpj}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(relatorio.dataInicial).toLocaleDateString('pt-BR')} - {new Date(relatorio.dataFinal).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getStatusBadge(relatorio.status)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatarTamanho(relatorio.tamanhoArquivo)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatarData(relatorio.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-3">
                            {relatorio.status === 'concluido' && relatorio.id ? (
                              <>
                                <button
                                  onClick={() => handleBaixarHistorico(relatorio.id!, relatorio.nomeArquivo)}
                                  className="text-blue-600 hover:text-blue-900 inline-flex items-center transition-colors"
                                  title="Baixar planilha completa"
                                >
                                  <ArrowDownTrayIcon className="w-5 h-5 mr-1" />
                                  Completo
                                </button>
                                {/* Mostrar botão formatado se existir no banco OU tentar inferir do nome do arquivo completo */}
                                {(relatorio.arquivoFormatadoPath || relatorio.arquivoFormatadoNome || 
                                  (relatorio.nomeArquivo && !relatorio.nomeArquivo.includes('_FORMATADO'))) && (
                                  <button
                                    onClick={() => handleBaixarFormatado(
                                      relatorio.id!, 
                                      relatorio.arquivoFormatadoNome || 
                                      (relatorio.nomeArquivo ? relatorio.nomeArquivo.replace('.xlsx', '_FORMATADO.xlsx') : undefined)
                                    )}
                                    className="text-green-600 hover:text-green-900 inline-flex items-center transition-colors"
                                    title="Baixar planilha formatada"
                                  >
                                    <ArrowDownTrayIcon className="w-5 h-5 mr-1" />
                                    Formatado
                                  </button>
                                )}
                              </>
                            ) : relatorio.status === 'erro' ? (
                              <span className="text-red-600 text-xs">{relatorio.erro || 'Erro ao gerar'}</span>
                            ) : null}
                            {relatorio.id && (
                              <button
                                onClick={() => handleDeletarClick(relatorio.id!, relatorio.nomeArquivo)}
                                className="text-red-600 hover:text-red-900 inline-flex items-center transition-colors"
                                title="Excluir relatório"
                              >
                                <XMarkIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notificação de exclusão pendente com contagem regressiva */}
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
                  {pendingDelete.nomeArquivo || 'Relatório'}
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
    </div>
  );
};

export default BancoHorasPage;
