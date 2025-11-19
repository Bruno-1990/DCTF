import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConferenceIssue } from '../services/conferences';
import { fetchConferenceSummary } from '../services/conferences';
import { dctfService, type DCTFListItem } from '../services/dctf';
import { clientesService } from '../services/clientes';
import { format } from 'date-fns';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  BuildingOfficeIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ClockIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../components/Pagination';

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
}

function formatCNPJ(cnpj?: string | null) {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cnpj;
}

type SeverityTagProps = {
  severity: ConferenceIssue['severity'];
};

function SeverityTag({ severity }: SeverityTagProps) {
  const styles: Record<ConferenceIssue['severity'], string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const labels: Record<ConferenceIssue['severity'], string> = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

export default function Conferencias() {

  const [issues, setIssues] = useState<ConferenceIssue[]>([]);
  const [transmissionObligationIssues, setTransmissionObligationIssues] = useState<ConferenceIssue[]>([]);
  const [allSemMovimentoIssues, setAllSemMovimentoIssues] = useState<ConferenceIssue[]>([]);  // ✅ Nova lista simples
  const [missingPeriodIssues, setMissingPeriodIssues] = useState<ConferenceIssue[]>([]);
  const [duplicateDeclarationIssues, setDuplicateDeclarationIssues] = useState<ConferenceIssue[]>([]);
  const [futurePeriodIssues, setFuturePeriodIssues] = useState<ConferenceIssue[]>([]);
  const [retificadoraSequenceIssues, setRetificadoraSequenceIssues] = useState<ConferenceIssue[]>([]);
  const [clientesSemDCTFIssues, setClientesSemDCTFIssues] = useState<ConferenceIssue[]>([]);  // ✅ Clientes sem DCTF na competência vigente
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRegistros, setExpandedRegistros] = useState<Set<string>>(new Set());
  const [ultimosRegistros, setUltimosRegistros] = useState<Map<string, DCTFListItem[]>>(new Map());
  const [totalRegistros, setTotalRegistros] = useState<Map<string, number>>(new Map());
  const [loadingRegistros, setLoadingRegistros] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [paginaAtualObrigacao, setPaginaAtualObrigacao] = useState(1);
  const [paginaAtualMissingPeriod, setPaginaAtualMissingPeriod] = useState(1);
  const [paginaAtualDuplicate, setPaginaAtualDuplicate] = useState(1);
  const [paginaAtualFuture, setPaginaAtualFuture] = useState(1);
  const [paginaAtualSequence, setPaginaAtualSequence] = useState(1);
  const [paginaAtualClientesSemDCTF, setPaginaAtualClientesSemDCTF] = useState(1);
  const itensPorPagina = 10;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const summary = await fetchConferenceSummary();
        if (!mounted) return;
        
        // Validar estrutura da resposta
        if (!summary || !summary.rules) {
          throw new Error('Resposta inválida do servidor. Estrutura de dados incorreta.');
        }
        
        setIssues(summary.rules.dueDate || []);
        setTransmissionObligationIssues(summary.rules.transmissionObligation || []);
        setAllSemMovimentoIssues(summary.rules.allSemMovimento || []);  // ✅ Nova lista simples
        setMissingPeriodIssues(summary.rules.missingPeriod || []);
        setDuplicateDeclarationIssues(summary.rules.duplicateDeclaration || []);
        setFuturePeriodIssues(summary.rules.futurePeriod || []);
        setRetificadoraSequenceIssues(summary.rules.retificadoraSequence || []);
        setClientesSemDCTFIssues(summary.rules.clientesSemDCTF || []);  // ✅ Clientes sem DCTF na competência vigente
        setGeneratedAt(summary.generatedAt || new Date().toISOString());
      } catch (err) {
        console.error('Erro ao carregar conferências:', err);
        if (!mounted) return;
        const errorMessage = err instanceof Error ? err.message : 'Não foi possível carregar as conferências.';
        setError(errorMessage);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const orderedIssues = useMemo(() => {
    const severityOrder: Record<ConferenceIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
    return [...issues].sort((a, b) => {
      if (a.severity === b.severity) {
        return (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0);
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [issues]);

  // Resetar para página 1 quando issues mudarem
  useEffect(() => {
    setPaginaAtual(1);
  }, [issues.length]);

  useEffect(() => {
    setPaginaAtualObrigacao(1);
  }, [transmissionObligationIssues.length]);

  // Calcular paginação para issues de prazo
  const totalPaginas = Math.ceil(orderedIssues.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;
  const issuesPaginadas = useMemo(() => {
    return orderedIssues.slice(indiceInicio, indiceFim);
  }, [orderedIssues, indiceInicio, indiceFim]);

  // Ordenar e paginar issues de obrigatoriedade
  const orderedObligationIssues = useMemo(() => {
    const severityOrder: Record<ConferenceIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
    return [...transmissionObligationIssues].sort((a, b) => {
      if (a.severity === b.severity) {
        return (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0);
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [transmissionObligationIssues]);

  const totalPaginasObrigacao = Math.ceil(orderedObligationIssues.length / itensPorPagina);
  const indiceInicioObrigacao = (paginaAtualObrigacao - 1) * itensPorPagina;
  const indiceFimObrigacao = indiceInicioObrigacao + itensPorPagina;
  const obligationIssuesPaginadas = useMemo(() => {
    return orderedObligationIssues.slice(indiceInicioObrigacao, indiceFimObrigacao);
  }, [orderedObligationIssues, indiceInicioObrigacao, indiceFimObrigacao]);

  const toggleActionPlan = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleRegistros = async (issueId: string, cnpj: string) => {
    setExpandedRegistros((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
        return next;
      } else {
        next.add(issueId);
        
        // Se ainda não carregou os registros, buscar
        if (!ultimosRegistros.has(cnpj)) {
          loadUltimosRegistros(issueId, cnpj);
        }
        
        return next;
      }
    });
  };

  const loadUltimosRegistros = async (issueId: string, cnpj: string) => {
    setLoadingRegistros((prev) => new Set(prev).add(issueId));
    try {
      // Limpar CNPJ para busca (remover formatação)
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      // Primeiro, buscar o cliente pelo CNPJ
      const clientesResponse = await clientesService.getAll({ 
        cnpj: cnpjLimpo,
        limit: 1 
      });
      
      let registros: DCTFListItem[] = [];
      
      // Se encontrou o cliente, buscar DCTF por clienteId
      if (clientesResponse.items && clientesResponse.items.length > 0) {
        const cliente = clientesResponse.items[0];
        try {
          const dctfResponse = await dctfService.getAll({
            limit: 100,
            page: 1,
            clienteId: cliente.id,
          });
          registros = dctfResponse.items || [];
        } catch (err) {
          console.error('Erro ao buscar DCTF por cliente:', err);
          registros = [];
        }
      } else {
        // Se não encontrou cliente, buscar por search e filtrar
        const dctfResponse = await dctfService.getAll({
          limit: 100,
          page: 1,
        });
        
        // Filtrar apenas os registros que correspondem ao CNPJ
        registros = dctfResponse.items.filter(item => {
          const itemCnpj = item.cliente?.cnpj_limpo || item.numeroIdentificacao?.replace(/\D/g, '') || '';
          return itemCnpj === cnpjLimpo;
        });
      }
      
      // Ordenar por data de transmissão (mais recentes primeiro)
      const registrosOrdenados = [...registros].sort((a, b) => {
        const dateA = a.dataTransmissao ? new Date(a.dataTransmissao).getTime() : 0;
        const dateB = b.dataTransmissao ? new Date(b.dataTransmissao).getTime() : 0;
        return dateB - dateA;
      });
      
      // Armazenar o total de registros encontrados
      const totalEncontrado = registrosOrdenados.length;
      setTotalRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, totalEncontrado);
        return next;
      });
      
      // Limitar a exibição aos 6 primeiros (ou menos se não houver 6)
      const registrosLimitados = registrosOrdenados.slice(0, 6);
      
      setUltimosRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, registrosLimitados);
        return next;
      });
    } catch (error) {
      console.error('Erro ao carregar últimos registros:', error);
      setUltimosRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, []);
        return next;
      });
      setTotalRegistros((prev) => {
        const next = new Map(prev);
        next.set(cnpj, 0);
        return next;
      });
    } finally {
      setLoadingRegistros((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-gray-600">Carregando conferências...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center gap-3">
              <ClipboardDocumentCheckIcon className="h-7 w-7 text-blue-600" />
              Conferências e Alertas Legais
            </h1>
            <p className="text-base text-gray-600 mb-2">
              Monitoramos automaticamente o cumprimento dos prazos legais estabelecidos pelas Instruções Normativas da RFB.
            </p>
          </div>
          {generatedAt && (
            <div className="flex-shrink-0">
              <p className="text-sm text-gray-500 flex items-center gap-1 whitespace-nowrap">
                <ClockIcon className="h-4 w-4" />
                Atualizado em {formatDate(generatedAt)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Card de Alerta - Empresas Sem Movimento da Competência Vigente */}
      {(() => {
        // Calcular competência vigente (mês anterior ao atual)
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1; // getMonth() retorna 0-11
        const anoAtual = hoje.getFullYear();
        
        // Competência vigente: mês anterior
        const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
        const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
        const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
        
        // ✅ FILTRO SIMPLES: tipo LIKE "sem movimento" E período = competência vigente
        const semMovimentoCompetenciaVigente = allSemMovimentoIssues.filter(issue => 
          issue.period === competenciaVigente
        );
        
        console.log('[Conferências] === DEBUG CARD SEM MOVIMENTO ===');
        console.log('[Conferências] Data atual:', hoje.toISOString());
        console.log('[Conferências] Competência vigente:', competenciaVigente);
        console.log('[Conferências] Total allSemMovimentoIssues:', allSemMovimentoIssues.length);
        console.log('[Conferências] Filtrados competência vigente:', semMovimentoCompetenciaVigente.length);
        console.log('[Conferências] Exemplos:', semMovimentoCompetenciaVigente.slice(0, 5).map(i => ({
          businessName: i.businessName,
          period: i.period,
          declarationType: i.details?.declarationType,
          transmissionDate: i.transmissionDate
        })));
        
        return semMovimentoCompetenciaVigente.length > 0;
      })() && (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-blue-600 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <DocumentTextIcon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">📋 Empresas "Sem Movimento" - Competência Vigente</h3>
                  <p className="text-sm text-blue-100 mt-0.5">
                    {(() => {
                      const hoje = new Date();
                      const mesAtual = hoje.getMonth() + 1;
                      const anoAtual = hoje.getFullYear();
                      const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                      const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                      const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                      return allSemMovimentoIssues.filter(i => i.period === competenciaVigente).length;
                    })()} empresas declararam "sem movimento" em {(() => {
                      const hoje = new Date();
                      const mesAtual = hoje.getMonth() + 1;
                      const anoAtual = hoje.getFullYear();
                      const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                      const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                      return `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="bg-green-50 border-2 border-green-300 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-green-900 font-bold flex items-center gap-2 mb-2">
                  <CheckIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                  ✅ Importante: Próximos meses NÃO precisam ser enviados!
                </p>
                <p className="text-xs text-green-800 ml-7">
                  Enquanto a empresa continuar sem movimento, não há obrigação de transmitir DCTFs dos meses seguintes. 
                  <span className="font-semibold"> Só precisa enviar novamente quando houver movimento.</span>
                </p>
                <p className="text-xs text-green-700 ml-7 mt-1 italic">
                  📖 Base legal: IN RFB 2.237/2024, Art. 3º
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(() => {
                  const hoje = new Date();
                  const mesAtual = hoje.getMonth() + 1;
                  const anoAtual = hoje.getFullYear();
                  const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                  const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                  const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                  return allSemMovimentoIssues.filter(i => i.period === competenciaVigente).slice(0, 6);
                })().map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => navigate(`/dctf?search=${issue.identification}`)}
                      className="bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 hover:shadow-md transition-all text-left group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                            {issue.businessName ?? 'Empresa não identificada'}
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">
                            {formatCNPJ(issue.identification)}
                          </p>
                        </div>
                        <SeverityTag severity={issue.severity} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          Competência: <span className="font-medium">{issue.period}</span>
                        </span>
                        <span className="text-xs text-blue-600 group-hover:underline flex items-center gap-1">
                          Ver DCTFs
                          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
              {(() => {
                const hoje = new Date();
                const mesAtual = hoje.getMonth() + 1;
                const anoAtual = hoje.getFullYear();
                const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                const filtered = allSemMovimentoIssues.filter(i => i.period === competenciaVigente);
                return filtered.length > 6;
              })() && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-600">
                    ... e mais {(() => {
                      const hoje = new Date();
                      const mesAtual = hoje.getMonth() + 1;
                      const anoAtual = hoje.getFullYear();
                      const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
                      const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;
                      const competenciaVigente = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
                      return allSemMovimentoIssues.filter(i => i.period === competenciaVigente).length - 6;
                    })()} empresas. 
                    <button 
                      onClick={() => {
                        // Scroll para a seção de Obrigatoriedade de Transmissão
                        document.querySelector('#secao-obrigatoriedade')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="text-blue-600 hover:underline ml-1 font-medium"
                    >
                      Ver todas
                    </button>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seção de Legislação - Compacta e Discreta */}
      <div className="mb-6">
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpenIcon className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Normas Aplicáveis:</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href="https://barroscarvalho.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
              >
                IN RFB 2.237/2024
                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </a>
              <span className="text-gray-300">•</span>
              <a
                href="https://legisweb.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
              >
                IN RFB 2.267/2025
                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </a>
              <span className="text-gray-300">•</span>
              <a
                href="https://legisweb.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
              >
                IN RFB 2.248/2025
                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Conferências */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
              Entrega dentro do prazo legal
            </h2>
            <p className="text-sm text-gray-600">
              Classificamos o risco considerando atrasos e proximidade do vencimento conforme as normas aplicáveis.
            </p>
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            Total: <span className="text-gray-900">{orderedIssues.length}</span> pendências
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data de Envio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orderedIssues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-500">
                    Nenhuma pendência encontrada. Todas as declarações analisadas estão dentro do prazo.
                  </td>
                </tr>
              ) : (
                issuesPaginadas.map(issue => {
                  const isExpanded = expanded.has(issue.id);
                  const isRegistrosExpanded = expandedRegistros.has(issue.id);
                  const isLoadingRegistros = loadingRegistros.has(issue.id);
                  const registros = ultimosRegistros.get(issue.identification) || [];
                  const totalRegistrosCnpj = totalRegistros.get(issue.identification) || 0;
                  const temMaisRegistros = totalRegistrosCnpj > 6;
                  
                  return (
                    <Fragment key={issue.id}>
                      <tr 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRegistros(issue.id, issue.identification)}
                      >
                        <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                          <div className="flex items-center gap-2">
                            {isRegistrosExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            )}
                            {issue.businessName ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(issue.identification, issue.id);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="Copiar CNPJ"
                            >
                              {copiedId === issue.id ? (
                                <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.transmissionDate)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize text-xs">{issue.status ?? '—'}</td>
                        <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {issue.actionPlan ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActionPlan(issue.id);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                            </button>
                          ) : (
                            <span className="text-gray-400">Sem plano cadastrado</span>
                          )}
                        </td>
                      </tr>
                      {issue.actionPlan && isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                            <strong>Plano de ação:</strong> {issue.actionPlan}
                          </td>
                        </tr>
                      )}
                      {isRegistrosExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-800 mb-2">Últimos Registros DCTF</h4>
                              {isLoadingRegistros ? (
                                <div className="text-xs text-gray-500 text-center py-2">Carregando registros...</div>
                              ) : registros.length === 0 ? (
                                <div className="text-xs text-gray-500 text-center py-2">Nenhum registro encontrado.</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Competência</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Data Transmissão</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Situação</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Débito Apurado</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Saldo a Pagar</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {registros.map((registro) => (
                                        <tr key={registro.id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-gray-600">{registro.periodo}</td>
                                          <td className="px-3 py-2 text-gray-600">
                                            {formatDate(registro.dataTransmissao?.toString())}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                              registro.status === 'concluido' 
                                                ? 'bg-green-100 text-green-800' 
                                                : registro.status === 'processando'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {registro.status || '—'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{registro.situacao || '—'}</td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{registro.tipoDeclaracao || '—'}</td>
                                          <td className="px-3 py-2 text-gray-600 text-right text-xs">
                                            {registro.debitoApurado !== null && registro.debitoApurado !== undefined
                                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registro.debitoApurado)
                                              : '—'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 text-right text-xs">
                                            {registro.saldoAPagar !== null && registro.saldoAPagar !== undefined
                                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registro.saldoAPagar)
                                              : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {temMaisRegistros && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cnpjLimpo = issue.identification.replace(/\D/g, '');
                                      navigate(`/dctf?search=${cnpjLimpo}`);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    Ver Mais ({totalRegistrosCnpj - 6} registro{totalRegistrosCnpj - 6 > 1 ? 's' : ''})
                                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!isLoading && orderedIssues.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <Pagination
              currentPage={paginaAtual}
              totalPages={totalPaginas}
              totalItems={orderedIssues.length}
              itemsPerPage={itensPorPagina}
              onPageChange={setPaginaAtual}
              itemLabel="pendência"
            />
          </div>
        )}
      </div>

      {/* Seção de Obrigatoriedade de Transmissão */}
      <div id="secao-obrigatoriedade" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              Obrigatoriedade de Transmissão
            </h2>
            <p className="text-sm text-gray-600">
              Análise de obrigatoriedade conforme IN RFB 2.237/2024 e 2.248/2025. Verifica "Original sem movimento" e "Original zerada".
            </p>
            {(() => {
              const semMovimentoCount = orderedObligationIssues.filter(issue => issue.details?.isSemMovimento).length;
              const zeradaCount = orderedObligationIssues.filter(issue => issue.details?.isZerada).length;
              if (semMovimentoCount > 0 || zeradaCount > 0) {
                return (
                  <p className="text-xs text-gray-500 mt-1">
                    {semMovimentoCount > 0 && <span>📋 {semMovimentoCount} "sem movimento"</span>}
                    {semMovimentoCount > 0 && zeradaCount > 0 && <span className="mx-1">•</span>}
                    {zeradaCount > 0 && <span>🔢 {zeradaCount} "zerada"</span>}
                  </p>
                );
              }
              return null;
            })()}
          </div>
          <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
            Total: <span className="text-gray-900">{orderedObligationIssues.length}</span> {orderedObligationIssues.length === 1 ? 'registro' : 'registros'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento Legal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(() => {
                // Debug: Verificar se há issues mas nenhum está sendo paginado
                if (orderedObligationIssues.length > 0 && obligationIssuesPaginadas.length === 0) {
                  console.warn('[Conferências] ⚠️ ATENÇÃO: Há', orderedObligationIssues.length, 'issues mas nenhum está sendo exibido na página', paginaAtualObrigacao);
                }
                return null;
              })()}
              {orderedObligationIssues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-500">
                    ✅ Nenhuma pendência ou informação de obrigatoriedade encontrada.
                  </td>
                </tr>
              ) : obligationIssuesPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-500">
                    Nenhum registro nesta página. Navegue para a página anterior.
                  </td>
                </tr>
              ) : (
                obligationIssuesPaginadas.map(issue => {
                  const isExpanded = expanded.has(issue.id);
                  const isSemMovimento = issue.details?.isSemMovimento === true;
                  const isZerada = issue.details?.isZerada === true;
                  
                  return (
                    <Fragment key={issue.id}>
                      <tr className={`hover:bg-gray-50 ${isSemMovimento ? 'bg-blue-50/30' : isZerada ? 'bg-purple-50/30' : ''}`}>
                        <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                          <div className="flex flex-col gap-1">
                            <span>{issue.businessName ?? '—'}</span>
                            {(isSemMovimento || isZerada) && (
                              <div className="flex gap-1">
                                {isSemMovimento && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                    📋 Sem Movimento
                                  </span>
                                )}
                                {isZerada && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                    🔢 Zerada
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                            <button
                              onClick={() => copyToClipboard(issue.identification, issue.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="Copiar CNPJ"
                            >
                              {copiedId === issue.id ? (
                                <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize text-xs">{issue.status ?? '—'}</td>
                        <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {issue.actionPlan ? (
                            <button
                              type="button"
                              onClick={() => toggleActionPlan(issue.id)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                            </button>
                          ) : (
                            <span className="text-gray-400">Sem plano cadastrado</span>
                          )}
                        </td>
                      </tr>
                      {issue.actionPlan && isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                            <strong>Plano de ação:</strong> {issue.actionPlan}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!isLoading && orderedObligationIssues.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <Pagination
              currentPage={paginaAtualObrigacao}
              totalPages={totalPaginasObrigacao}
              totalItems={orderedObligationIssues.length}
              itemsPerPage={itensPorPagina}
              onPageChange={setPaginaAtualObrigacao}
              itemLabel="pendência"
            />
          </div>
        )}
      </div>

      {/* Seção de Lacunas de Períodos */}
      {missingPeriodIssues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
                Lacunas de Períodos
              </h2>
              <p className="text-sm text-gray-600">
                Detecta períodos faltando entre declarações. Conforme IN RFB 2.237/2024, todas as competências devem ser declaradas sequencialmente.
              </p>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{missingPeriodIssues.length}</span> lacunas
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Período Faltante</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {missingPeriodIssues
                  .slice((paginaAtualMissingPeriod - 1) * itensPorPagina, paginaAtualMissingPeriod * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {missingPeriodIssues.length > itensPorPagina && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtualMissingPeriod}
                totalPages={Math.ceil(missingPeriodIssues.length / itensPorPagina)}
                totalItems={missingPeriodIssues.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtualMissingPeriod}
                itemLabel="lacuna"
              />
            </div>
          )}
        </div>
      )}

      {/* Seção de Duplicidades */}
      {duplicateDeclarationIssues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                Declarações Duplicadas
              </h2>
              <p className="text-sm text-gray-600">
                Detecta múltiplas declarações originais para o mesmo período. Conforme legislação, não deve haver múltiplas declarações originais para o mesmo período.
              </p>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{duplicateDeclarationIssues.length}</span> duplicatas
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {duplicateDeclarationIssues
                  .slice((paginaAtualDuplicate - 1) * itensPorPagina, paginaAtualDuplicate * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {duplicateDeclarationIssues.length > itensPorPagina && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtualDuplicate}
                totalPages={Math.ceil(duplicateDeclarationIssues.length / itensPorPagina)}
                totalItems={duplicateDeclarationIssues.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtualDuplicate}
                itemLabel="duplicata"
              />
            </div>
          )}
        </div>
      )}

      {/* Seção de Períodos Futuros */}
      {futurePeriodIssues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                Períodos Futuros
              </h2>
              <p className="text-sm text-gray-600">
                Detecta declarações com períodos futuros, indicando possível erro de digitação ou cadastro incorreto.
              </p>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{futurePeriodIssues.length}</span> erros
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {futurePeriodIssues
                  .slice((paginaAtualFuture - 1) * itensPorPagina, paginaAtualFuture * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {futurePeriodIssues.length > itensPorPagina && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtualFuture}
                totalPages={Math.ceil(futurePeriodIssues.length / itensPorPagina)}
                totalItems={futurePeriodIssues.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtualFuture}
                itemLabel="erro"
              />
            </div>
          )}
        </div>
      )}

      {/* Seção de Sequência de Retificadoras */}
      {retificadoraSequenceIssues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                Sequência de Retificadoras
              </h2>
              <p className="text-sm text-gray-600">
                Detecta múltiplas retificadoras para o mesmo período, indicando possível problema na sequência ou necessidade de revisão.
              </p>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{retificadoraSequenceIssues.length}</span> alertas
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Período</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {retificadoraSequenceIssues
                  .slice((paginaAtualSequence - 1) * itensPorPagina, paginaAtualSequence * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {retificadoraSequenceIssues.length > itensPorPagina && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtualSequence}
                totalPages={Math.ceil(retificadoraSequenceIssues.length / itensPorPagina)}
                totalItems={retificadoraSequenceIssues.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtualSequence}
                itemLabel="alerta"
              />
            </div>
          )}
        </div>
      )}

      {/* Seção de Clientes sem DCTF na Competência Vigente */}
      {clientesSemDCTFIssues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <BuildingOfficeIcon className="h-5 w-5 text-red-600" />
                Clientes sem DCTF na Competência Vigente
              </h2>
              <p className="text-sm text-gray-600">
                Lista de clientes cadastrados que não apresentaram DCTF enviada no mês vigente. Conforme IN RFB 2.237/2024, 2.267/2025 e 2.248/2025.
              </p>
            </div>
            <div className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-lg border border-gray-200">
              Total: <span className="text-gray-900">{clientesSemDCTFIssues.length}</span> clientes
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap min-w-[140px]">CNPJ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Competência</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resumo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plano de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clientesSemDCTFIssues
                  .slice((paginaAtualClientesSemDCTF - 1) * itensPorPagina, paginaAtualClientesSemDCTF * itensPorPagina)
                  .map(issue => {
                    const isExpanded = expanded.has(issue.id);
                    return (
                      <Fragment key={issue.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium text-xs">{issue.businessName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatCNPJ(issue.identification)}</span>
                              <button
                                onClick={() => copyToClipboard(issue.identification, issue.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                                title="Copiar CNPJ"
                              >
                                {copiedId === issue.id ? (
                                  <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.period}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(issue.dueDate)}</td>
                          <td className="px-4 py-3"><SeverityTag severity={issue.severity} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{issue.message}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {issue.actionPlan ? (
                              <button
                                type="button"
                                onClick={() => toggleActionPlan(issue.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isExpanded ? 'Ocultar plano' : 'Ver plano de ação'}
                              </button>
                            ) : (
                              <span className="text-gray-400">Sem plano cadastrado</span>
                            )}
                          </td>
                        </tr>
                        {issue.actionPlan && isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
                              <strong>Plano de ação:</strong> {issue.actionPlan}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {clientesSemDCTFIssues.length > itensPorPagina && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtualClientesSemDCTF}
                totalPages={Math.ceil(clientesSemDCTFIssues.length / itensPorPagina)}
                totalItems={clientesSemDCTFIssues.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtualClientesSemDCTF}
                itemLabel="cliente"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
