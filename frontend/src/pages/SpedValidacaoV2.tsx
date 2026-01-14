import React, { useState, useEffect } from 'react';
import { DocumentCheckIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import PipelineView from '../components/sped/v2/PipelineView';
import type { PipelineStep } from '../components/sped/v2/PipelineView';
import SummaryPanel from '../components/sped/v2/SummaryPanel';
import type { SummaryStats } from '../components/sped/v2/SummaryPanel';
import { spedV2Service } from '../services/sped-v2';
import type { SpedV2Status } from '../services/sped-v2';

const SpedValidacaoV2: React.FC = () => {
  const [validationId, setValidationId] = useState<string | null>(null);
  const [status, setStatus] = useState<SpedV2Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({});

  // Inicializar steps do pipeline
  useEffect(() => {
    setPipelineSteps([
      {
        id: 'upload',
        name: 'Upload de Arquivos',
        status: 'pending',
      },
      {
        id: 'normalization',
        name: 'Normalização (Camada A)',
        status: 'pending',
      },
      {
        id: 'validation',
        name: 'Validação Interna (Camada B)',
        status: 'pending',
      },
      {
        id: 'matching',
        name: 'Matching de Documentos (Camada C)',
        status: 'pending',
      },
      {
        id: 'classification',
        name: 'Classificação e Score',
        status: 'pending',
      },
      {
        id: 'completed',
        name: 'Concluído',
        status: 'pending',
      },
    ]);
  }, []);

  // Polling de status
  useEffect(() => {
    if (!validationId) return;

    const interval = setInterval(async () => {
      try {
        const currentStatus = await spedV2Service.obterStatus(validationId);
        if (currentStatus) {
          setStatus(currentStatus);
          updatePipelineSteps(currentStatus);
          
          if (currentStatus.status === 'completed' || currentStatus.status === 'error') {
            clearInterval(interval);
          }
        }
      } catch (err: any) {
        console.error('Erro ao obter status:', err);
        setError(err.message || 'Erro ao verificar status da validação');
        clearInterval(interval);
      }
    }, 2000); // Poll a cada 2 segundos

    return () => clearInterval(interval);
  }, [validationId]);

  const updatePipelineSteps = (currentStatus: SpedV2Status) => {
    setPipelineSteps((prevSteps) => {
      const newSteps = [...prevSteps];
      const statusMap: Record<string, 'pending' | 'running' | 'completed' | 'error'> = {
        queued: 'pending',
        processing: 'running',
        completed: 'completed',
        error: 'error',
      };

      // Atualizar step baseado no progresso
      const progress = currentStatus.progress || 0;
      const stepIndex = Math.floor((progress / 100) * (newSteps.length - 1));

      newSteps.forEach((step, index) => {
        if (index < stepIndex) {
          step.status = 'completed';
        } else if (index === stepIndex && currentStatus.status === 'processing') {
          step.status = 'running';
          step.progress = progress;
          step.message = currentStatus.message;
        } else if (index > stepIndex) {
          step.status = 'pending';
        }
      });

      if (currentStatus.status === 'completed') {
        newSteps.forEach((step) => {
          step.status = 'completed';
        });
      } else if (currentStatus.status === 'error') {
        const currentStep = newSteps.find((s) => s.status === 'running');
        if (currentStep) {
          currentStep.status = 'error';
          currentStep.message = currentStatus.error || 'Erro no processamento';
        }
      }

      return newSteps;
    });
  };

  const handleFileUpload = async (spedFile: File, xmlFiles: File[]) => {
    try {
      setError(null);
      setStatus(null);
      
      // Reset pipeline
      setPipelineSteps((prevSteps) =>
        prevSteps.map((step) => ({ ...step, status: 'pending' as const }))
      );

      // Marcar upload como running
      setPipelineSteps((prevSteps) =>
        prevSteps.map((step) =>
          step.id === 'upload'
            ? { ...step, status: 'running' as const, message: 'Enviando arquivos...' }
            : step
        )
      );

      const id = await spedV2Service.validar(spedFile, xmlFiles);
      setValidationId(id);

      // Marcar upload como completed e normalização como running
      setPipelineSteps((prevSteps) =>
        prevSteps.map((step) =>
          step.id === 'upload'
            ? { ...step, status: 'completed' as const }
            : step.id === 'normalization'
            ? { ...step, status: 'running' as const, message: 'Processando...' }
            : step
        )
      );
    } catch (err: any) {
      console.error('Erro ao iniciar validação:', err);
      setError(err.message || 'Erro ao iniciar validação');
      setPipelineSteps((prevSteps) =>
        prevSteps.map((step) =>
          step.id === 'upload'
            ? { ...step, status: 'error' as const, message: 'Erro no upload' }
            : step
        )
      );
    }
  };

  const handleNewValidation = () => {
    setValidationId(null);
    setStatus(null);
    setError(null);
    setSummaryStats({});
    setPipelineSteps((prevSteps) =>
      prevSteps.map((step) => ({ ...step, status: 'pending' as const }))
    );
  };

  const currentStepId = pipelineSteps.find((s) => s.status === 'running')?.id;
  const overallProgress = status?.progress || 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <DocumentCheckIcon className="h-8 w-8 text-blue-600" />
          Validação SPED v2.0
        </h1>
        <p className="text-gray-600">
          Sistema robusto de conferência XML × SPED com arquitetura em 3 camadas, 
          matriz de legitimação e validações inteligentes
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {!validationId && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Iniciar Nova Validação
            </h3>
            <p className="text-gray-600 mb-6">
              Faça upload do arquivo SPED (.txt) e dos XMLs das notas fiscais
            </p>
            <button
              onClick={() => {
                // TODO: Implementar modal de upload
                alert('Upload será implementado em breve');
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
              Selecionar Arquivos
            </button>
          </div>
        </div>
      )}

      {validationId && status && (
        <>
          <div className="mb-6">
            <SummaryPanel stats={summaryStats} isLoading={status.status === 'processing'} />
          </div>

          <div className="mb-6">
            <PipelineView
              steps={pipelineSteps}
              currentStep={currentStepId}
              overallProgress={overallProgress}
            />
          </div>

          {status.status === 'completed' && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
              <strong>Validação concluída com sucesso!</strong>
              <button
                onClick={handleNewValidation}
                className="ml-4 text-green-800 underline hover:text-green-900"
              >
                Iniciar nova validação
              </button>
            </div>
          )}

          {status.status === 'error' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <strong>Erro na validação:</strong> {status.error || 'Erro desconhecido'}
              <button
                onClick={handleNewValidation}
                className="ml-4 text-red-800 underline hover:text-red-900"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SpedValidacaoV2;


