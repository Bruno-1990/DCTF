import React, { useEffect, useState } from 'react';
import { spedService } from '../../services/sped';

interface ValidationProgressProps {
  validationId: string;
  onComplete: () => void;
  onError: (error: string) => void;
}

interface ProgressStatus {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  error?: string;
}

const ValidationProgress: React.FC<ValidationProgressProps> = ({ 
  validationId, 
  onComplete, 
  onError 
}) => {
  const [status, setStatus] = useState<ProgressStatus>({
    status: 'processing',
    progress: 0,
    message: 'Iniciando validação...'
  });

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;
    let consecutiveErrors = 0;
    let currentInterval = 2000; // Começar com 2 segundos
    const maxInterval = 10000; // Máximo de 10 segundos
    const minInterval = 2000; // Mínimo de 2 segundos

    const checkStatus = async () => {
      try {
        const s = await spedService.obterStatus(validationId);
        if (!isMounted) return;

        // Resetar contador de erros em caso de sucesso
        consecutiveErrors = 0;
        currentInterval = minInterval;

        if (s) {
          setStatus({
            status: s.status,
            progress: s.progress || 0,
            message: s.message || 'Processando...',
            error: s.error
          });

          if (s.status === 'completed') {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            setTimeout(() => onComplete(), 1000);
          } else if (s.status === 'error') {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            onError(s.error || 'Erro na validação');
          }
        }
      } catch (error: any) {
        consecutiveErrors++;
        
        // Se receber 429 (Too Many Requests), aumentar intervalo exponencialmente
        if (error.response?.status === 429) {
          currentInterval = Math.min(currentInterval * 2, maxInterval);
          
          // Se tiver muitos erros 429 consecutivos, parar o polling
          if (consecutiveErrors >= 5) {
            console.warn('Muitos erros 429. Parando polling temporariamente.');
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            // Tentar novamente após um tempo maior
            timeoutId = setTimeout(() => {
              consecutiveErrors = 0;
              currentInterval = minInterval;
              if (isMounted) {
                scheduleNextCheck();
              }
            }, 30000); // 30 segundos
            return;
          }
        } else if (error.response?.status !== 429) {
          // Para outros erros, apenas logar
        console.error('Erro ao verificar status:', error);
        }

        // Reagendar com intervalo maior em caso de erro
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        scheduleNextCheck();
      }
    };

    const scheduleNextCheck = () => {
      if (!isMounted) return;
      
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      intervalId = setTimeout(() => {
        checkStatus();
        scheduleNextCheck();
      }, currentInterval);
    };

    // Verificar imediatamente
    checkStatus();

    // Iniciar polling
    scheduleNextCheck();

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [validationId, onComplete, onError]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Processando Validação</h2>
      
      <div className="space-y-4">
        {/* Barra de Progresso */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{status.message}</span>
            <span>{status.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            ></div>
          </div>
        </div>

        {/* Status */}
        {status.status === 'processing' && (
          <div className="flex items-center text-blue-600">
            <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processando...
          </div>
        )}

        {status.status === 'completed' && (
          <div className="flex items-center text-green-600">
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Validação concluída!
          </div>
        )}

        {status.status === 'error' && (
          <div className="flex items-center text-red-600">
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {status.error || 'Erro na validação'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationProgress;

