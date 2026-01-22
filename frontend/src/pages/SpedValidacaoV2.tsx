import React, { useState, useEffect } from 'react';
import { DocumentCheckIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Step1ClientProfile from '../components/sped/v2/Step1ClientProfile';
import type { ClientProfileData } from '../components/sped/v2/Step1ClientProfile';
import Step2FileUpload from '../components/sped/v2/Step2FileUpload';
import Step3ProcessingPipeline from '../components/sped/v2/Step3ProcessingPipeline';
import Step4ResultsView from '../components/sped/v2/Step4ResultsView';
import Step5CorrectionPlan from '../components/sped/v2/Step5CorrectionPlan';
import Step6Approval from '../components/sped/v2/Step6Approval';
import Step7Execution from '../components/sped/v2/Step7Execution';
import DownloadPackage from '../components/sped/v2/DownloadPackage';
import InternalValidationView from '../components/sped/v2/InternalValidationView';
import MatchingView from '../components/sped/v2/MatchingView';
import ClassificationView from '../components/sped/v2/ClassificationView';
import { spedV2Service } from '../services/sped-v2';
import type { SpedV2Status, SpedV2ValidationRequest } from '../services/sped-v2';
import type { DivergenciaClassificada } from '../components/sped/v2/ClassificationView';
import { clientesService } from '../services';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEP_NAMES: Record<Step, string> = {
  1: 'Carregar',
  2: 'Perfil Fiscal',
  3: 'Processamento',
  4: 'Resultados',
  5: 'Correções',
  6: 'Aprovação',
  7: 'Execução',
  8: 'Download',
};

const SpedValidacaoV2: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [clientProfile, setClientProfile] = useState<ClientProfileData | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ sped: File | null; xmls: File[] }>({
    sped: null,
    xmls: [],
  });
  const [validationId, setValidationId] = useState<string | null>(null);
  const [status, setStatus] = useState<SpedV2Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaClassificada[]>([]);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [inconsistencias, setInconsistencias] = useState<any[]>([]);
  const [documentosConciliados, setDocumentosConciliados] = useState<any[]>([]);

  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);

  // Handlers
  const handleStep1FilesSelected = (spedFile: File | null, xmlFiles: File[]) => {
    // Atualizar arquivos, mas NÃO avançar ainda (apenas quando clicar em "Próxima")
    setUploadedFiles({ sped: spedFile, xmls: xmlFiles });
  };

  // Função chamada quando usuário clica no botão "Próxima"
  const handleStep1Next = async () => {
    // Validar se tem arquivos
    if (!uploadedFiles.sped || uploadedFiles.xmls.length === 0) {
      setError('Por favor, selecione o arquivo SPED e pelo menos um XML');
      return;
    }

    setIsExtractingMetadata(true);
    
    // Extrair metadados do SPED
      try {
        console.log('[SpedValidacaoV2] ⏳ Iniciando extração de metadados...');
        const metadata = await spedV2Service.extrairMetadados(uploadedFiles.sped);
        
        console.log('[SpedValidacaoV2] ✅ Metadados recebidos do backend:', {
          cnpj: metadata.cnpj,
          razao_social: metadata.razao_social,
          competencia: metadata.competencia,
          regime_tributario: metadata.regime_tributario,
          segmento: metadata.segmento,
          opera_st: metadata.opera_st,
          opera_difal: metadata.opera_difal,
          opera_fcp: metadata.opera_fcp,
          opera_interestadual: metadata.opera_interestadual
        });
        
        // Buscar cliente por CNPJ se disponível
        let clienteId: string | null = null;
        if (metadata.cnpj) {
          try {
            console.log('[SpedValidacaoV2] 🔍 Buscando cliente por CNPJ:', metadata.cnpj);
            const clientes = await clientesService.getAll({ cnpj: metadata.cnpj, limit: 1 });
            if (clientes.items && clientes.items.length > 0) {
              clienteId = clientes.items[0].id;
              console.log('[SpedValidacaoV2] ✅ Cliente encontrado:', clientes.items[0].razao_social);
            } else {
              console.log('[SpedValidacaoV2] ⚠️ Cliente não encontrado para CNPJ:', metadata.cnpj);
            }
          } catch (err) {
            console.warn('[SpedValidacaoV2] ❌ Erro ao buscar cliente por CNPJ:', err);
          }
        }
        
        // Preencher perfil com dados extraídos
        const extractedProfile: ClientProfileData = {
          cliente_id: clienteId,
          razao_social: metadata.razao_social, // Razão social extraída do SPED para conferência
          competencia: metadata.competencia || getCurrentCompetencia(),
          segmento: metadata.segmento || null,
          regime_tributario: metadata.regime_tributario || null,
          opera_st: metadata.opera_st ?? false,
          regime_especial: false,
          opera_difal: metadata.opera_difal ?? false,
          opera_fcp: metadata.opera_fcp ?? false,
          opera_interestadual: metadata.opera_interestadual ?? false,
        };
        
        console.log('[SpedValidacaoV2] 📝 Perfil extraído (será passado como initialData):', extractedProfile);
        console.log('[SpedValidacaoV2] 🎯 Valores que serão aplicados:');
        console.log('  - competencia:', extractedProfile.competencia);
        console.log('  - segmento:', extractedProfile.segmento, '(esperado: COMERCIO, INDUSTRIA, BEBIDAS, ou ECOMMERCE)');
        console.log('  - regime_tributario:', extractedProfile.regime_tributario, '(esperado: SIMPLES_NACIONAL, LUCRO_PRESUMIDO, ou LUCRO_REAL)');
        console.log('  - opera_st:', extractedProfile.opera_st);
        console.log('  - opera_difal:', extractedProfile.opera_difal);
        console.log('  - opera_fcp:', extractedProfile.opera_fcp);
        console.log('  - opera_interestadual:', extractedProfile.opera_interestadual);
        
        // Mostrar alerta visual para debug
        if (!extractedProfile.segmento || !extractedProfile.regime_tributario) {
          console.warn('[SpedValidacaoV2] ⚠️ ATENÇÃO: Segmento ou Regime não foram extraídos!');
          console.warn('  Segmento extraído:', metadata.segmento);
          console.warn('  Regime extraído:', metadata.regime_tributario);
        }
        
        setClientProfile(extractedProfile);
        setCurrentStep(2); // Ir para perfil fiscal (agora step 2)
        console.log('[SpedValidacaoV2] 🚀 Avançando para Step 2 (Perfil Fiscal) com initialData:', extractedProfile);
      } catch (error: any) {
        console.error('Erro ao extrair metadados:', error);
        setError(error.message || 'Erro ao extrair metadados do SPED');
        // Mesmo com erro, continuar para perfil fiscal vazio
        setCurrentStep(2);
      } finally {
        setIsExtractingMetadata(false);
      }
  };

  const handleStep2Next = async (profile: ClientProfileData) => {
    setClientProfile(profile);
    // Iniciar validação com perfil fiscal ANTES de mudar de step
    if (uploadedFiles.sped) {
      try {
        // Iniciar validação primeiro
        await iniciarValidacao(uploadedFiles.sped, uploadedFiles.xmls, profile);
        // Só mudar de step após iniciar a validação
        setCurrentStep(3);
      } catch (error: any) {
        console.error('[SpedValidacaoV2] Erro ao iniciar validação:', error);
        setError(error.message || 'Erro ao iniciar validação');
        // Não mudar de step se houver erro
      }
    } else {
      // Se não tiver arquivos, apenas mudar de step
      setCurrentStep(3);
    }
  };

  const getCurrentCompetencia = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const iniciarValidacao = async (spedFile: File, xmlFiles: File[], profile?: ClientProfileData) => {
    try {
      setError(null);
      
      // Preparar perfil fiscal para validação
      const perfilFiscal = profile ? {
        segmento: profile.segmento || undefined,
        regime: profile.regime_tributario || undefined,
        operaST: profile.opera_st || false,
        regimeEspecial: profile.regime_especial || false,
        operaInterestadualDIFAL: profile.opera_interestadual || profile.opera_difal || false,
      } : undefined;
      
      const request: SpedV2ValidationRequest = {
        clienteId: profile?.cliente_id || undefined,
        competencia: profile?.competencia || undefined,
        perfilFiscal: perfilFiscal,
      };
      
      const id = await spedV2Service.validar(spedFile, xmlFiles, request);
      setValidationId(id);
      
      // O Step3ProcessingPipeline vai gerenciar o polling de status
      // Não precisamos fazer polling aqui para evitar requisições duplicadas
    } catch (err: any) {
      console.error('Erro ao iniciar validação:', err);
      setError(err.message || 'Erro ao iniciar validação');
    }
  };

  const handleStep4Next = () => {
    setCurrentStep(5);
  };

  const handleStep5Next = () => {
    setCurrentStep(6);
  };

  const handleStep6Approve = () => {
    setCurrentStep(7);
    // Iniciar execução de correções
    setLoteId(validationId || 'lote-' + Date.now());
  };

  const handleStep7Complete = (arquivoDownload?: string) => {
    setCurrentStep(8);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const handleNewValidation = () => {
    setCurrentStep(1);
    setClientProfile(null);
    setUploadedFiles({ sped: null, xmls: [] });
    setValidationId(null);
    setStatus(null);
    setError(null);
    setDivergencias([]);
    setLoteId(null);
    setInconsistencias([]);
    setDocumentosConciliados([]);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step2FileUpload
            onFilesSelected={handleStep1FilesSelected}
            onNext={handleStep1Next}
            isLoading={isExtractingMetadata}
            onPreCheckComplete={(result) => {
              // Pré-check completo
            }}
          />
        );
      case 2:
        return (
          <Step1ClientProfile
            onNext={handleStep2Next}
            initialData={clientProfile || undefined}
          />
        );
      case 3:
        return (
          <Step3ProcessingPipeline
            validationId={validationId || ''}
            status={status}
            pipelineSteps={[]}
            summaryStats={{}}
            onStatusUpdate={(updatedStatus) => {
              setStatus(updatedStatus);
              
              // Quando status for completed, carregar resultados e avançar
              if (updatedStatus.status === 'completed' && validationId) {
                spedV2Service.obterResultado(validationId).then((resultado) => {
                  console.log('[SpedValidacaoV2] 📊 Resultado completo recebido:', resultado);
                  console.log('[SpedValidacaoV2] 📊 Divergências recebidas:', resultado.divergencias?.length || 0);
                  
                  if (resultado.divergencias && Array.isArray(resultado.divergencias)) {
                    console.log('[SpedValidacaoV2] ✅ Definindo divergências:', resultado.divergencias.length);
                    setDivergencias(resultado.divergencias);
                  } else if (resultado.resultado?.validacoes?.divergencias) {
                    console.log('[SpedValidacaoV2] ✅ Divergências encontradas em resultado.validacoes:', resultado.resultado.validacoes.divergencias.length);
                    setDivergencias(resultado.resultado.validacoes.divergencias);
                  } else {
                    console.warn('[SpedValidacaoV2] ⚠️ Nenhuma divergência encontrada no resultado');
                    setDivergencias([]);
                  }
                  setCurrentStep(4);
                }).catch((err) => {
                  console.error('[SpedValidacaoV2] Erro ao obter resultado:', err);
                  setError(err.message || 'Erro ao obter resultado da validação');
                });
              } else if (updatedStatus.status === 'error') {
                setError(updatedStatus.error || 'Erro no processamento');
              }
            }}
            onError={(errorMsg) => {
              setError(errorMsg);
            }}
            useSSE={false}
          />
        );
      case 4:
        return (
          <Step4ResultsView
            divergencias={divergencias}
            onVerEvidencias={(div) => {
              // Abrir drawer de evidências
              console.log('Ver evidências:', div);
            }}
            onNext={handleStep4Next}
            onBack={handleBack}
            validationId={validationId}
          />
        );
      case 5:
        return (
          <Step5CorrectionPlan
            divergencias={divergencias}
            onNext={handleStep5Next}
            onBack={handleBack}
            onAplicarCorrecoes={(correcoes, perfil) => {
              console.log('[SpedValidacaoV2] Aplicando correções:', { count: correcoes.length, perfil });
              // TODO: Implementar lógica de aplicação de correções no backend
              // Por enquanto, apenas avança para aprovação
            }}
          />
        );
      case 6:
        return (
          <Step6Approval
            onApprove={handleStep6Approve}
            onReject={handleBack}
            onBack={handleBack}
          />
        );
      case 7:
        return (
          <Step7Execution
            loteId={loteId || ''}
            totalCorrecoes={divergencias.filter((d) => d.classificacao !== 'LEGÍTIMO').length}
            onCompleto={handleStep7Complete}
            onErro={(erro) => setError(erro)}
            useSSE={false}
          />
        );
      case 8:
        return (
          <DownloadPackage
            loteId={loteId || ''}
            arquivos={[
              {
                id: 'sped',
                nome: 'SPED Corrigido',
                tipo: 'sped',
                formato: 'txt',
                disponivel: true,
              },
              {
                id: 'relatorio',
                nome: 'Relatório de Validação',
                tipo: 'relatorio',
                formato: 'pdf',
                disponivel: true,
              },
              {
                id: 'audit',
                nome: 'Audit Log',
                tipo: 'audit',
                formato: 'json',
                disponivel: true,
              },
            ]}
            onDownloadAll={() => {
              console.log('Download all');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <DocumentCheckIcon className="h-7 w-7 text-blue-600" />
                Validação SPED v2.0
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {STEP_NAMES[currentStep]} • Passo {currentStep} de 8
              </p>
            </div>
            {currentStep > 1 && currentStep < 8 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleBack}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  <span>Voltar</span>
                </button>
                <button
                  onClick={handleNewValidation}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Nova Validação
                </button>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              {Object.entries(STEP_NAMES).map(([step, name]) => (
                <div
                  key={step}
                  className={`flex-1 text-center text-xs px-2 py-1 ${
                    Number(step) <= currentStep ? 'text-blue-600 font-medium' : 'text-gray-400'
                  }`}
                  title={name}
                  style={{ minWidth: 0 }}
                >
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                    {name}
                  </span>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / 8) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {renderStep()}
      </div>
    </div>
  );
};

export default SpedValidacaoV2;
