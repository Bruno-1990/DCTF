import React, { useState, useEffect, useRef } from 'react';
import { 
  XMarkIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface ProgressModalProps {
  relatorioId: string;
  cnpj: string;
  periodo: string;
  onClose: () => void;
  onComplete: (relatorioId: string) => void;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  relatorioId,
  cnpj,
  periodo,
  onClose,
  onComplete,
}) => {
  const [status, setStatus] = useState<'gerando' | 'concluido' | 'erro'>('gerando');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [temArquivoFormatado, setTemArquivoFormatado] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('iniciando');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let isMounted = true;
    let eventSource: EventSource | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;
    
    // Função para verificar status via API (fallback) - usando endpoint direto
    const verificarStatusViaAPI = async () => {
      try {
        const { bancoHorasService } = await import('../../services/bancoHoras');
        // Buscar relatório diretamente por ID usando o service
        const response = await fetch(`/api/sci/banco-horas/gerar/${relatorioId}/logs`);
        // Se a conexão SSE ainda estiver ativa, não fazer nada
        // O SSE já está cuidando do status
      } catch (err) {
        console.error('[ProgressModal] Erro ao verificar status via API:', err);
      }
    };
    
    // Conectar ao SSE
    eventSource = new EventSource(
      `/api/sci/banco-horas/gerar/${relatorioId}/logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[ProgressModal] SSE conectado com sucesso para relatório', relatorioId);
    };

    eventSource.onmessage = (event) => {
      try {
        // Ignorar heartbeats
        if (event.data.trim() === '' || event.data.startsWith(':')) {
          return;
        }
        
        const data = JSON.parse(event.data);
        console.log('[ProgressModal] Evento SSE recebido:', data);
        
        if (!isMounted) return;
        
        switch (data.type) {
          case 'status':
            setStatus(data.status || 'gerando');
            setProgress(data.progress || 'processando');
            break;
          case 'complete':
            console.log('[ProgressModal] Relatório concluído via SSE!', data);
            setStatus('concluido');
            setNomeArquivo(data.nomeArquivo);
            setTemArquivoFormatado(!!data.downloadFormatadoUrl || !!data.arquivoFormatadoPath);
            onComplete(relatorioId);
            if (eventSource) {
              eventSource.close();
            }
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
            }
            break;
          case 'error':
            console.error('[ProgressModal] Erro recebido via SSE:', data);
            setStatus('erro');
            setError(data.message || 'Erro ao gerar relatório');
            if (eventSource) {
              eventSource.close();
            }
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
            }
            break;
        }
      } catch (err) {
        console.error('[ProgressModal] Erro ao processar evento SSE:', err, event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[ProgressModal] Erro na conexão SSE:', err, 'ReadyState:', eventSource?.readyState);
      
      // Se a conexão foi fechada pelo servidor, verificar status via API
      if (eventSource && eventSource.readyState === EventSource.CLOSED && isMounted) {
        console.log('[ProgressModal] SSE fechado, verificando status via API...');
        verificarStatusViaAPI();
      }
    };

    // Fallback: verificar status via API a cada 2 segundos se ainda estiver gerando
    fallbackInterval = setInterval(() => {
      if (isMounted) {
        setStatus(prevStatus => {
          if (prevStatus === 'gerando') {
            verificarStatusViaAPI();
          }
          return prevStatus;
        });
      }
    }, 2000);

    return () => {
      isMounted = false;
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [relatorioId, onComplete]); // Remover 'status' das dependências para evitar loops

  const handleDownload = async (relatorioId: string, tipo: 'completo' | 'formatado') => {
    try {
      const { bancoHorasService } = await import('../../services/bancoHoras');
      const blob = tipo === 'completo' 
        ? await bancoHorasService.baixarArquivo(relatorioId)
        : await bancoHorasService.baixarArquivoFormatado(relatorioId);
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = tipo === 'completo' 
        ? nomeArquivo || 'Banco_Horas.xlsx'
        : nomeArquivo?.replace('.xlsx', '_FORMATADO.xlsx') || 'Banco_Horas_FORMATADO.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao baixar arquivo:', error);
      alert(error.message || 'Erro ao baixar arquivo');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              Gerando Relatório de Horas-Homem Trabalhadas
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              CNPJ: {cnpj} | Período: {periodo}
            </p>
          </div>
          {status !== 'gerando' && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {status === 'gerando' && (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {progress === 'iniciando' && 'Iniciando geração...'}
                      {progress === 'processando' && 'Processando dados...'}
                    </span>
                    <span className="text-xs text-gray-500">Aguarde...</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500 animate-pulse"
                      style={{ width: progress === 'iniciando' ? '30%' : '70%' }}
                    ></div>
                  </div>
                </div>
              </>
            )}
            {status === 'concluido' && (
              <>
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-green-700">
                    Relatório gerado com sucesso!
                  </span>
                  <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </>
            )}
            {status === 'erro' && (
              <>
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-red-700">
                    Erro na geração do relatório
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {status === 'gerando' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  </div>
                  <div className="ml-3 flex-1">
                    <h4 className="text-sm font-medium text-blue-900">
                      Processando relatório
                    </h4>
                    <p className="mt-1 text-sm text-blue-700">
                      Estamos coletando e processando os dados de horas-homem trabalhadas. 
                      Este processo pode levar alguns minutos dependendo do volume de dados.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h5 className="text-xs font-semibold text-gray-700 uppercase mb-2">
                  Etapas do Processamento
                </h5>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center">
                    <CheckCircleIcon className="w-4 h-4 text-green-500 mr-2" />
                    <span>Buscando empresa no banco de dados</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircleIcon className="w-4 h-4 text-green-500 mr-2" />
                    <span>Identificando colaboradores ativos no período</span>
                  </li>
                  <li className="flex items-center">
                    {progress === 'processando' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                    ) : (
                      <div className="w-4 h-4 border-2 border-gray-300 rounded-full mr-2"></div>
                    )}
                    <span>Processando horas trabalhadas e extras</span>
                  </li>
                  <li className="flex items-center">
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full mr-2"></div>
                    <span>Gerando planilha Excel formatada</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {status === 'concluido' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-green-900">
                      Relatório gerado com sucesso!
                    </h4>
                    <p className="mt-1 text-sm text-green-700">
                      O relatório está pronto para download. Você pode baixar a versão completa 
                      ou a versão formatada.
                    </p>
                  </div>
                </div>
              </div>

              {nomeArquivo && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Arquivo:</span> {nomeArquivo}
                  </p>
                </div>
              )}
            </div>
          )}

          {status === 'erro' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-red-900">
                    Erro ao gerar relatório
                  </h4>
                  <p className="mt-1 text-sm text-red-700">
                    {error || 'Ocorreu um erro durante a geração do relatório. Tente novamente.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          {status === 'concluido' && (
            <div className="flex items-center justify-end space-x-3">
              {temArquivoFormatado && (
                <button
                  onClick={() => handleDownload(relatorioId, 'formatado')}
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                  Baixar Formatado
                </button>
              )}
              <button
                onClick={() => handleDownload(relatorioId, 'completo')}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                Baixar Completo
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
          {status === 'erro' && (
            <div className="flex items-center justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
          {status === 'gerando' && (
            <div className="text-center">
              <p className="text-xs text-gray-500">
                Não feche esta janela enquanto o relatório está sendo gerado
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

