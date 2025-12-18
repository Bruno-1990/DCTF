import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { spedService } from '../../services/sped';
import { formatCurrency } from '../../utils/formatCurrency';

interface ResultadoCorrecoesProps {
  validationId: string;
  resultadoAplicacao: {
    correcoes_aplicadas: number;
    total_correcoes: number;
    falhas: number;
    message: string;
  };
  divergenciasAntes: {
    total: number;
    alta: number;
    media: number;
    legítimas: number;
  };
  onRevalidacaoCompleta?: (dados: any) => void;
}

const ResultadoCorrecoes: React.FC<ResultadoCorrecoesProps> = ({
  validationId,
  resultadoAplicacao,
  divergenciasAntes,
  onRevalidacaoCompleta
}) => {
  const [revalidando, setRevalidando] = useState(false);
  const [revalidacaoId, setRevalidacaoId] = useState<string | null>(null);
  const [revalidacaoStatus, setRevalidacaoStatus] = useState<any>(null);
  const [erroRevalidacao, setErroRevalidacao] = useState<string | null>(null);
  const [progressoRevalidacao, setProgressoRevalidacao] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup ao desmontar componente
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const iniciarRevalidacao = async () => {
    setRevalidando(true);
    setErroRevalidacao(null);
    setRevalidacaoStatus(null);
    setProgressoRevalidacao(0);

    // Limpar intervalos anteriores se existirem
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      console.log('[ResultadoCorrecoes] Iniciando revalidação...');
      const resultado = await spedService.revalidarSpedCorrigido(validationId);
      console.log('[ResultadoCorrecoes] Revalidação iniciada, validationId:', resultado.validationId);
      setRevalidacaoId(resultado.validationId);

      let tentativas = 0;
      const maxTentativas = 600; // 20 minutos (600 * 2 segundos) - aumentado para validações grandes

      // Polling para verificar status da validação
      intervalRef.current = setInterval(async () => {
        tentativas++;
        try {
          if (tentativas % 10 === 0) {
            // Log a cada 20 segundos para não poluir o console
            console.log(`[ResultadoCorrecoes] Verificando status (tentativa ${tentativas}/${maxTentativas})...`);
          }
          
          const status = await spedService.obterStatus(resultado.validationId);
          
          if (status) {
            if (status.progress !== undefined) {
              setProgressoRevalidacao(status.progress);
            }
            
            if (tentativas % 10 === 0 || status.status === 'completed' || status.status === 'error') {
              console.log('[ResultadoCorrecoes] Status recebido:', {
                status: status.status,
                progress: status.progress,
                hasResultado: !!status.resultado,
                tentativa: tentativas
              });
            }
            
            if (status.status === 'completed') {
              console.log('[ResultadoCorrecoes] ✅ Validação concluída!');
              if (intervalRef.current) clearInterval(intervalRef.current);
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setRevalidando(false);
              setProgressoRevalidacao(100);
              
              // Extrair dados do resultado
              const dadosRevalidacao = status.resultado || {};
              console.log('[ResultadoCorrecoes] Dados da revalidação:', {
                hasReports: !!dadosRevalidacao.reports,
                reportsKeys: dadosRevalidacao.reports ? Object.keys(dadosRevalidacao.reports) : []
              });
              
              const novoStatus = {
                divergenciasC170C190: dadosRevalidacao.reports?.['C170 x C190 (Divergências)'] || [],
                divergenciasValores: dadosRevalidacao.reports?.['Divergências de Valores (Classificadas)'] || [],
                divergenciasApuracao: dadosRevalidacao.reports?.['Divergências de Apuração'] || [],
                divergenciasC190Preenchimento: dadosRevalidacao.reports?.['C190 - Preenchimento Incorreto'] || []
              };
              
              console.log('[ResultadoCorrecoes] Status processado:', {
                c170c190: novoStatus.divergenciasC170C190.length,
                valores: novoStatus.divergenciasValores.length,
                apuracao: novoStatus.divergenciasApuracao.length,
                c190: novoStatus.divergenciasC190Preenchimento.length
              });
              
              setRevalidacaoStatus(novoStatus);
              
              if (onRevalidacaoCompleta) {
                onRevalidacaoCompleta(dadosRevalidacao);
              }
              return; // Sair do polling
            } else if (status.status === 'error') {
              console.error('[ResultadoCorrecoes] ❌ Erro na validação:', status.error);
              if (intervalRef.current) clearInterval(intervalRef.current);
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setRevalidando(false);
              setErroRevalidacao(status.error || 'Erro ao revalidar');
              return; // Sair do polling
            }
            // Se status é 'processing', continuar polling
          } else {
            // Status null - pode ser que ainda não foi inicializado ou arquivo não existe ainda
            if (tentativas % 30 === 0) {
              // Log a cada minuto quando status é null
              console.warn(`[ResultadoCorrecoes] Status ainda é null após ${tentativas} tentativas. Continuando...`);
            }
          }
          
          // Timeout de segurança - aumentado para 20 minutos
          if (tentativas >= maxTentativas) {
            console.warn('[ResultadoCorrecoes] ⚠️ Timeout atingido após 20 minutos');
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setRevalidando(false);
            setErroRevalidacao('Timeout: A revalidação está demorando mais que o esperado (20 minutos). O processamento pode continuar em background. Tente verificar novamente mais tarde.');
          }
        } catch (error: any) {
          console.error('[ResultadoCorrecoes] Erro ao verificar status da revalidação:', error);
          if (tentativas >= 20) {
            // Após 20 tentativas com erro (40 segundos), parar
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setRevalidando(false);
            setErroRevalidacao(`Erro ao verificar status: ${error.message || 'Erro desconhecido'}`);
          }
        }
      }, 2000); // Verificar a cada 2 segundos

      // Timeout de segurança de 20 minutos (aumentado)
      timeoutRef.current = setTimeout(() => {
        console.warn('[ResultadoCorrecoes] ⚠️ Timeout de segurança ativado (20 minutos)');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        setRevalidando(false);
        setErroRevalidacao('Timeout: A revalidação está demorando mais que o esperado (20 minutos). O processamento pode continuar em background.');
      }, 1200000); // 20 minutos

    } catch (error: any) {
      console.error('[ResultadoCorrecoes] Erro ao iniciar revalidação:', error);
      setRevalidando(false);
      setErroRevalidacao(error.message || 'Erro ao iniciar revalidação');
    }
  };

  const calcularMelhoria = () => {
    if (!revalidacaoStatus) return null;

    // Calcular total depois (todas as divergências)
    const todasDivergenciasDepois = [
      ...(revalidacaoStatus.divergenciasC170C190 || []),
      ...(revalidacaoStatus.divergenciasValores || []),
      ...(revalidacaoStatus.divergenciasApuracao || []),
      ...(revalidacaoStatus.divergenciasC190Preenchimento || [])
    ];

    const totalDepois = todasDivergenciasDepois.length;

    // Calcular por prioridade DEPOIS
    const altaDepois = todasDivergenciasDepois.filter((d: any) => 
      d.SEVERIDADE === 'alta' || d.CONFIANCA === 'ALTA'
    ).length;
    
    const mediaDepois = todasDivergenciasDepois.filter((d: any) => 
      d.SEVERIDADE === 'media' || d.CONFIANCA === 'MEDIA'
    ).length;

    const totalAntes = divergenciasAntes.total;
    
    // Calcular melhoria baseada nas correções aplicadas
    // Se aplicamos correções, esperamos uma redução
    const correcoesAplicadas = resultadoAplicacao.correcoes_aplicadas;
    
    // Calcular redução real (pode ser negativa se novas divergências foram detectadas)
    const diferenca = totalAntes - totalDepois;
    const reducao = totalAntes > 0 ? (diferenca / totalAntes) * 100 : 0;
    
    // Se houve aumento, mostrar como "novas divergências detectadas"
    const novasDivergencias = diferenca < 0 ? Math.abs(diferenca) : 0;
    const resolvidas = diferenca > 0 ? diferenca : 0;

    return {
      totalDepois,
      altaDepois,
      mediaDepois,
      reducao: reducao, // Pode ser negativo se aumentou
      resolvidas,
      novasDivergencias,
      teveAumento: diferenca < 0,
      correcoesAplicadas
    };
  };

  const melhoria = calcularMelhoria();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Correções Aplicadas</h3>
            <p className="text-sm text-gray-600">{resultadoAplicacao.message}</p>
          </div>
        </div>
        <button
          onClick={() => spedService.baixarSpedCorrigido(validationId)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          Baixar SPED Corrigido
        </button>
      </div>

      {/* Estatísticas de Correções */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Correções Aplicadas</p>
          <p className="text-3xl font-bold text-blue-700">{resultadoAplicacao.correcoes_aplicadas}</p>
          <p className="text-xs text-gray-500 mt-1">de {resultadoAplicacao.total_correcoes} total</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Taxa de Sucesso</p>
          <p className="text-3xl font-bold text-green-700">
            {resultadoAplicacao.total_correcoes > 0
              ? Math.round((resultadoAplicacao.correcoes_aplicadas / resultadoAplicacao.total_correcoes) * 100)
              : 0}%
          </p>
        </div>
        <div className={`rounded-lg p-4 ${resultadoAplicacao.falhas > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <p className="text-sm text-gray-600 mb-1">Falhas</p>
          <p className={`text-3xl font-bold ${resultadoAplicacao.falhas > 0 ? 'text-red-700' : 'text-gray-700'}`}>
            {resultadoAplicacao.falhas}
          </p>
        </div>
      </div>

      {/* Comparação Antes/Depois */}
      {revalidacaoStatus && melhoria && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <ChartBarIcon className="h-5 w-5 text-blue-600" />
            <h4 className="text-lg font-semibold text-gray-900">Comparação Antes/Depois</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Antes das Correções</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total:</span>
                  <span className="font-semibold text-gray-900">{divergenciasAntes.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Alta Prioridade:</span>
                  <span className="font-semibold text-red-600">{divergenciasAntes.alta}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Média Prioridade:</span>
                  <span className="font-semibold text-yellow-600">{divergenciasAntes.media}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Depois das Correções</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total:</span>
                  <span className="font-semibold text-gray-900">{melhoria.totalDepois}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Alta Prioridade:</span>
                  <span className="font-semibold text-red-600">{melhoria.altaDepois}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Média Prioridade:</span>
                  <span className="font-semibold text-yellow-600">{melhoria.mediaDepois}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Indicador de Melhoria */}
          {melhoria.teveAumento ? (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border-2 border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Novas Divergências Detectadas</p>
                  <p className="text-2xl font-bold text-amber-700">
                    +{melhoria.novasDivergencias} novas divergências
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {melhoria.correcoesAplicadas} correções aplicadas, mas {melhoria.novasDivergencias} novas divergências foram detectadas na revalidação
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center">
                    <span className="text-white font-bold text-xl">+{melhoria.novasDivergencias}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : melhoria.resolvidas > 0 ? (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border-2 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Melhoria Alcançada</p>
                  <p className="text-2xl font-bold text-green-700">
                    {melhoria.reducao.toFixed(1)}% de redução
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {melhoria.resolvidas} divergências resolvidas de {divergenciasAntes.total} totais
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
                    <span className="text-white font-bold text-xl">{melhoria.reducao.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Status da Revalidação</p>
                  <p className="text-lg font-bold text-gray-700">
                    Total mantido: {melhoria.totalDepois} divergências
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {melhoria.correcoesAplicadas} correções aplicadas. Revalidação concluída.
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-20 h-20 rounded-full bg-gray-400 flex items-center justify-center">
                    <span className="text-white font-bold text-xl">—</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botão de Revalidação */}
      {!revalidacaoStatus && !revalidando && (
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={iniciarRevalidacao}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Revalidar SPED Corrigido
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Revalide o SPED corrigido para ver a comparação antes/depois
          </p>
        </div>
      )}

      {/* Status de Revalidação */}
      {revalidando && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <div className="flex-1">
              <p className="text-gray-700 font-medium">Revalidando SPED corrigido...</p>
              {progressoRevalidacao > 0 && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressoRevalidacao}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-1">{progressoRevalidacao}%</p>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">
            Isso pode levar alguns minutos dependendo do tamanho do arquivo
          </p>
          {revalidacaoId && (
            <p className="text-xs text-gray-400 text-center mt-1">
              ID: {revalidacaoId}
            </p>
          )}
        </div>
      )}

      {/* Erro na Revalidação */}
      {erroRevalidacao && (
        <div className="border-t border-gray-200 pt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Erro na Revalidação</p>
                <p className="text-sm text-red-700 mt-1">{erroRevalidacao}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultadoCorrecoes;

