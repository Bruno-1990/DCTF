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
    let isMounted = true;

    const checkStatus = async () => {
      try {
        const s = await spedService.obterStatus(validationId);
        if (!isMounted) return;

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
            setTimeout(() => onComplete(), 1000);
          } else if (s.status === 'error') {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            onError(s.error || 'Erro na validação');
          }
        } else {
          // Se não encontrou status, pode ser que ainda não foi criado
          // Continuar tentando
        }
      } catch (error: any) {
        console.error('Erro ao verificar status:', error);
        if (isMounted) {
          // Se der erro várias vezes, pode ser que a validação não existe mais
          // Mas vamos continuar tentando por enquanto
        }
      }
    };

    // Verificar imediatamente
    checkStatus();

    // Configurar polling a cada 1 segundo
    intervalId = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
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

