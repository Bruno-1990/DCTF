import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { SpedV2Status } from '../../../services/sped-v2';
import { spedV2Service } from '../../../services/sped-v2';
import type { PipelineStep } from './PipelineView';

export interface Step3ProcessingPipelineProps {
  validationId: string;
  status: SpedV2Status | null;
  pipelineSteps: PipelineStep[];
  summaryStats?: {
    totalProcessed?: number;
    totalSuccess?: number;
    totalErrors?: number;
    elapsedTime?: number;
  };
  onStatusUpdate?: (status: SpedV2Status) => void;
  onError?: (error: string) => void;
  useSSE?: boolean; // Flag para usar SSE quando disponível
}

interface ContextualMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stepId?: string;
  timestamp: Date;
}

const Step3ProcessingPipeline: React.FC<Step3ProcessingPipelineProps> = ({
  validationId,
  status,
  pipelineSteps,
  summaryStats = {},
  onStatusUpdate,
  onError,
  useSSE = false,
}) => {
  const [messages, setMessages] = useState<ContextualMessage[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar tempo decorrido
  useEffect(() => {
    if (status?.startedAt) {
      const started = new Date(status.startedAt);
      setStartTime(started);
    }
  }, [status?.startedAt]);

  // Atualizar tempo decorrido
  useEffect(() => {
    if (!startTime) return;

    const updateElapsed = () => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    };

    updateElapsed();
    intervalRef.current = setInterval(updateElapsed, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startTime]);

  // Polling manual quando SSE não está disponível
  useEffect(() => {
    if (useSSE || !validationId) return;
    
    let pollingInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let tentativas = 0;
    let intervaloAtual = 5000; // Começar com 5 segundos (aumentado para evitar sobrecarga)
    const maxTentativas = 5;
    const maxIntervalo = 15000; // Máximo de 15 segundos
    let isPolling = false; // Flag para evitar polling simultâneo
    
    const fazerPolling = async () => {
      // Evitar múltiplas chamadas simultâneas
      if (isPolling) {
        console.log('[Step3ProcessingPipeline] Polling já em andamento, ignorando...');
        return;
      }
      
      isPolling = true;
      
      try {
        const currentStatus = await spedV2Service.obterStatus(validationId);
        if (currentStatus) {
          tentativas = 0; // Reset contador se status encontrado
          intervaloAtual = 5000; // Reset intervalo para o padrão
          if (onStatusUpdate) {
            onStatusUpdate(currentStatus);
          }
          
          // Parar polling se processamento terminou
          if (currentStatus.status === 'completed' || currentStatus.status === 'error') {
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            isPolling = false;
            return;
          }
        } else {
          tentativas++;
          if (tentativas >= maxTentativas) {
            console.warn('[Step3ProcessingPipeline] Status não encontrado após múltiplas tentativas');
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
            if (onError) {
              onError('Não foi possível obter o status da validação');
            }
            isPolling = false;
            return;
          }
        }
      } catch (err: any) {
        console.error('[Step3ProcessingPipeline] Erro ao obter status:', err);
        
        // Se for erro 429 (Too Many Requests) ou ERR_NETWORK, aumentar intervalo exponencialmente
        if (err.response?.status === 429 || err.code === 'ERR_NETWORK' || err.message?.includes('ERR_INSUFFICIENT_RESOURCES')) {
          intervaloAtual = Math.min(intervaloAtual * 2, maxIntervalo);
          console.warn(`[Step3ProcessingPipeline] Erro de rede/rate limit. Aumentando intervalo para ${intervaloAtual}ms`);
          
          // Reiniciar polling com novo intervalo
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
          
          // Usar setTimeout em vez de setInterval para evitar acúmulo
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            fazerPolling();
            if (pollingInterval) {
              clearInterval(pollingInterval);
            }
            pollingInterval = setInterval(fazerPolling, intervaloAtual);
          }, intervaloAtual);
          
          isPolling = false;
          return;
        }
        
        tentativas++;
        if (tentativas >= maxTentativas) {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
          if (onError) {
            onError(err.message || 'Erro ao obter status da validação');
          }
          isPolling = false;
          return;
        }
      }
      
      isPolling = false;
    };
    
    // Aguardar 2 segundos antes de começar o polling
    timeoutId = setTimeout(() => {
      // Primeira chamada
      fazerPolling();
      
      // Configurar polling periódico
      pollingInterval = setInterval(fazerPolling, intervaloAtual);
    }, 2000);
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      isPolling = false;
    };
  }, [validationId, useSSE, onStatusUpdate, onError]);

  // Configurar SSE/WebSocket para atualizações em tempo real
  useEffect(() => {
    if (!useSSE || !validationId) return;

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const sseUrl = `${API_BASE_URL}/api/sped/v2/status/${validationId}/stream`;

    const connectSSE = () => {
      try {
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as SpedV2Status;
            if (onStatusUpdate) {
              onStatusUpdate(data);
            }

            // Fechar conexão se processamento terminou
            if (data.status === 'completed' || data.status === 'error') {
              eventSource.close();
            }
          } catch (error) {
            console.error('Erro ao processar mensagem SSE:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('Erro na conexão SSE:', error);
          eventSource.close();

          // Tentar reconectar após 3 segundos
          reconnectTimeoutRef.current = setTimeout(() => {
            connectSSE();
          }, 3000);
        };

        eventSource.onopen = () => {
          console.log('Conexão SSE estabelecida');
          // Limpar timeout de reconexão se existir
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };
      } catch (error) {
        console.error('Erro ao criar conexão SSE:', error);
        // Fallback para polling se SSE não estiver disponível
        if (onError) {
          onError('SSE não disponível, usando polling como fallback');
        }
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [validationId, useSSE, onStatusUpdate, onError]);

  // Adicionar mensagens contextuais baseadas no status
  useEffect(() => {
    if (!status) return;

    const currentStep = pipelineSteps.find((s) => s.status === 'running');
    
    if (currentStep && status.message) {
      const newMessage: ContextualMessage = {
        id: `msg-${Date.now()}`,
        type: status.status === 'error' ? 'error' : 'info',
        message: status.message,
        stepId: currentStep.id,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        // Limitar a 10 mensagens mais recentes
        const updated = [newMessage, ...prev].slice(0, 10);
        return updated;
      });
    }

    if (status.status === 'completed') {
      const successMessage: ContextualMessage = {
        id: `msg-success-${Date.now()}`,
        type: 'success',
        message: 'Processamento concluído com sucesso!',
        timestamp: new Date(),
      };
      setMessages((prev) => [successMessage, ...prev].slice(0, 10));
    }

    if (status.status === 'error' && status.error) {
      const errorMessage: ContextualMessage = {
        id: `msg-error-${Date.now()}`,
        type: 'error',
        message: status.error,
        timestamp: new Date(),
      };
      setMessages((prev) => [errorMessage, ...prev].slice(0, 10));
    }
  }, [status, pipelineSteps]);

  // Formatar tempo decorrido
  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Calcular estatísticas do pipeline baseado no status real
  const calculatePipelineStats = () => {
    // Se temos pipelineSteps, usar eles
    if (pipelineSteps.length > 0) {
      const total = pipelineSteps.length;
      const completed = pipelineSteps.filter((s) => s.status === 'completed').length;
      const running = pipelineSteps.filter((s) => s.status === 'running').length;
      const errors = pipelineSteps.filter((s) => s.status === 'error').length;
      const pending = pipelineSteps.filter((s) => s.status === 'pending').length;

      return {
        total,
        completed,
        running,
        errors,
        pending,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    }
    
    // Caso contrário, usar o status do backend
    if (status) {
      const progress = status.progress || 0;
      const isCompleted = status.status === 'completed';
      const hasError = status.status === 'error';
      
      return {
        total: 1,
        completed: isCompleted ? 1 : 0,
        running: status.status === 'processing' || status.status === 'queued' ? 1 : 0,
        errors: hasError ? 1 : 0,
        pending: status.status === 'queued' ? 1 : 0,
        progress: progress,
      };
    }
    
    // Default
    return {
      total: 0,
      completed: 0,
      running: 0,
      errors: 0,
      pending: 0,
      progress: 0,
    };
  };

  const pipelineStats = calculatePipelineStats();
  const stats = {
    totalProcessed: summaryStats.totalProcessed ?? pipelineStats.completed,
    totalSuccess: summaryStats.totalSuccess ?? pipelineStats.completed,
    totalErrors: summaryStats.totalErrors ?? pipelineStats.errors,
    elapsedTime: summaryStats.elapsedTime ?? elapsedTime,
  };

  const getMessageIcon = (type: ContextualMessage['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  const getMessageBgColor = (type: ContextualMessage['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Painel de Resumo Fixo no Topo */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-blue-600 font-medium mb-1">Total Processado</div>
              <div className="text-2xl font-bold text-blue-900">{stats.totalProcessed}</div>
              <div className="text-xs text-blue-600 mt-1">
                {pipelineStats.total > 0 ? `${pipelineStats.completed}/${pipelineStats.total} etapas` : status?.progress ? `${status.progress}% processado` : 'Aguardando...'}
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="text-xs text-green-600 font-medium mb-1">Sucessos</div>
              <div className="text-2xl font-bold text-green-900">{stats.totalSuccess}</div>
              <div className="text-xs text-green-600 mt-1">
                {status?.progress ? `${status.progress}% completo` : pipelineStats.progress > 0 ? `${pipelineStats.progress}% completo` : '0% completo'}
              </div>
            </div>

            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <div className="text-xs text-red-600 font-medium mb-1">Erros</div>
              <div className="text-2xl font-bold text-red-900">{stats.totalErrors}</div>
              <div className="text-xs text-red-600 mt-1">
                {pipelineStats.errors > 0 ? 'Atenção necessária' : 'Nenhum erro'}
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <div className="text-xs text-purple-600 font-medium mb-1">Tempo Decorrido</div>
              <div className="text-2xl font-bold text-purple-900">
                {formatElapsedTime(stats.elapsedTime)}
              </div>
              <div className="text-xs text-purple-600 mt-1">
                {status?.status === 'processing' ? 'Em processamento...' : 'Concluído'}
              </div>
            </div>
          </div>

          {/* Barra de progresso geral */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progresso Geral</span>
              <span className="text-sm text-gray-600">{pipelineStats.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${status?.progress || pipelineStats.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Visual com Status e Contadores */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pipeline de Processamento</h3>
        
        <div className="space-y-4">
          {pipelineSteps.map((step, index) => {
            const isActive = step.status === 'running';
            const isCompleted = step.status === 'completed';
            const isError = step.status === 'error';
            const isPending = step.status === 'pending';

            const getStepIcon = () => {
              if (isCompleted) {
                return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
              } else if (isError) {
                return <XCircleIcon className="h-6 w-6 text-red-500" />;
              } else if (isActive) {
                return <ArrowPathIcon className="h-6 w-6 text-blue-500 animate-spin" />;
              } else {
                return <ClockIcon className="h-6 w-6 text-gray-400" />;
              }
            };

            const getStepColor = () => {
              if (isCompleted) {
                return 'bg-green-50 border-green-200';
              } else if (isError) {
                return 'bg-red-50 border-red-200';
              } else if (isActive) {
                return 'bg-blue-50 border-blue-200';
              } else {
                return 'bg-gray-50 border-gray-200';
              }
            };

            return (
              <div
                key={step.id}
                className={`${getStepColor()} rounded-lg p-4 border-2 transition-all duration-200 ${
                  isActive ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="mt-0.5">{getStepIcon()}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-medium text-gray-900">{step.name}</h4>
                        {isActive && step.progress !== undefined && (
                          <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
                            {Math.round(step.progress)}%
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded font-medium">
                            Concluído
                          </span>
                        )}
                        {isError && (
                          <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded font-medium">
                            Erro
                          </span>
                        )}
                      </div>
                      
                      {step.message && (
                        <p className="text-sm text-gray-600 mt-1">{step.message}</p>
                      )}
                      
                      {isActive && step.progress !== undefined && (
                        <div className="mt-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${step.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Conector para próxima etapa */}
                  {index < pipelineSteps.length - 1 && (
                    <div className="ml-4 flex flex-col items-center">
                      <div
                        className={`w-0.5 h-12 ${
                          isCompleted ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mensagens Contextuais */}
      {messages.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Mensagens do Processamento</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${getMessageBgColor(msg.type)} rounded-lg p-3 border flex items-start gap-3`}
              >
                <div className="flex-shrink-0 mt-0.5">{getMessageIcon(msg.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{msg.message}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {msg.timestamp.toLocaleTimeString()}
                    {msg.stepId && ` • Etapa: ${pipelineSteps.find((s) => s.id === msg.stepId)?.name || msg.stepId}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status atual */}
      {status && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Status: </span>
              <span className={`text-sm font-semibold ${
                status.status === 'completed' ? 'text-green-600' :
                status.status === 'error' ? 'text-red-600' :
                status.status === 'processing' ? 'text-blue-600' :
                'text-gray-600'
              }`}>
                {status.status === 'queued' ? 'Na fila' :
                 status.status === 'processing' ? 'Processando' :
                 status.status === 'completed' ? 'Concluído' :
                 'Erro'}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              ID: {validationId.substring(0, 8)}...
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step3ProcessingPipeline;

