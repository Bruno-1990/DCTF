import React, { useState, useMemo } from 'react';
import { 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatCurrency';

interface DivergenciaC170C190 {
  CHAVE?: string;
  CFOP?: string;
  CST?: string;
  CAMPO?: string;
  C170?: number;
  C190?: number;
  DIFERENCA?: number;
  SEVERIDADE?: string;
  E_LEGITIMA?: boolean;
  MOTIVO_LEGITIMO?: string;
  TIPO_OPERACAO?: string;
  COD_SIT?: string;
}

interface DivergenciaValor {
  CHAVE?: string;
  CAMPO?: string;
  DELTA_COLUNA?: string;
  VALOR_XML?: number;
  VALOR_SPED?: number;
  DIFERENCA?: number;
  TIPO_DIVERGENCIA?: string;
  MOTIVO_CLASSIFICACAO?: string;
  CONFIANCA?: string;
  CFOP?: string;
  COD_SIT?: string;
}

interface DivergenciaApuracao {
  TIPO?: string;
  MENSAGEM?: string;
  VALOR_ESCRITURADO?: number;
  VALOR_APURADO?: number;
  DIFERENCA?: number;
  SEVERIDADE?: string;
  RECOMENDACAO?: string;
}

interface DivergenciaC190Preenchimento {
  CHAVE?: string;
  CFOP?: string;
  CST?: string;
  TIPO?: string;
  MENSAGEM?: string;
  VALOR_C170_BC_ICMS?: number;
  VALOR_C170_ICMS?: number;
  VALOR_C170_BC_ST?: number;
  VALOR_C170_ICMS_ST?: number;
  VALOR_C170_IPI?: number;
  VALOR_C190_BC_ICMS?: number;
  VALOR_C190_ICMS?: number;
  VALOR_C190_BC_ST?: number;
  VALOR_C190_ICMS_ST?: number;
  VALOR_C190_IPI?: number;
  SEVERIDADE?: string;
  RECOMENDACAO?: string;
}

interface Recomendacao {
  acao: string;
  prioridade: 'alta' | 'media' | 'baixa';
  detalhes: string[];
  icon: React.ReactNode;
  referenciaLegal?: {
    artigo: string;
    norma: string;
    prazo: string;
    penalidade?: string;
  };
}

interface Props {
  divergenciasC170C190?: DivergenciaC170C190[];
  divergenciasValores?: DivergenciaValor[];
  divergenciasApuracao?: DivergenciaApuracao[];
  divergenciasC190Preenchimento?: DivergenciaC190Preenchimento[];
  outrasDivergencias?: any[];
}

// Função para gerar recomendações inteligentes baseadas em legislação
const gerarRecomendacao = (div: DivergenciaC170C190 | DivergenciaValor | DivergenciaApuracao | DivergenciaC190Preenchimento | any): Recomendacao => {
  // Divergências de C190 Preenchimento (verificar primeiro para evitar conflito)
  if ('TIPO' in div && div.TIPO === 'C190 não preenchido' && 'VALOR_C170_BC_ICMS' in div) {
    const d = div as DivergenciaC190Preenchimento;
    const valorTotalC170 = Math.abs(d.VALOR_C170_BC_ICMS || 0) + Math.abs(d.VALOR_C170_ICMS || 0) + 
                          Math.abs(d.VALOR_C170_BC_ST || 0) + Math.abs(d.VALOR_C170_ICMS_ST || 0) + 
                          Math.abs(d.VALOR_C170_IPI || 0);
    const severidade = (d.SEVERIDADE || 'media').toLowerCase();
    
    return {
      acao: 'URGENTE: Verificar preenchimento do C190 no SPED',
      prioridade: (severidade === 'alta' ? 'alta' : severidade === 'baixa' ? 'baixa' : 'media') as 'alta' | 'media' | 'baixa',
      detalhes: [
        d.MENSAGEM || 'C170 tem valores mas C190 está zerado',
        `C170 - BC ICMS: ${formatCurrency(d.VALOR_C170_BC_ICMS || 0)} | C190: ${formatCurrency(d.VALOR_C190_BC_ICMS || 0)}`,
        `C170 - ICMS: ${formatCurrency(d.VALOR_C170_ICMS || 0)} | C190: ${formatCurrency(d.VALOR_C190_ICMS || 0)}`,
        d.VALOR_C170_BC_ST ? `C170 - BC ST: ${formatCurrency(d.VALOR_C170_BC_ST || 0)} | C190: ${formatCurrency(d.VALOR_C190_BC_ST || 0)}` : '',
        d.VALOR_C170_ICMS_ST ? `C170 - ICMS ST: ${formatCurrency(d.VALOR_C170_ICMS_ST || 0)} | C190: ${formatCurrency(d.VALOR_C190_ICMS_ST || 0)}` : '',
        d.VALOR_C170_IPI ? `C170 - IPI: ${formatCurrency(d.VALOR_C170_IPI || 0)} | C190: ${formatCurrency(d.VALOR_C190_IPI || 0)}` : '',
        d.RECOMENDACAO || 'O C190 deve ser preenchido com os totais dos C170 agrupados por CFOP/CST'
      ].filter(Boolean),
      icon: <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />,
      referenciaLegal: {
        artigo: 'Ato COTEPE/ICMS nº 44/2018, Seção 3, Bloco C',
        norma: 'Os valores dos itens (C170) devem bater com os totais (C190) por CFOP/CST. O C190 é obrigatório quando há C170.',
        prazo: 'Corrigir antes da próxima apuração',
        penalidade: 'Multa por inconsistência na escrituração fiscal'
      }
    };
  }
  
  // Divergências de Apuração (verificar antes de outros tipos)
  if ('TIPO' in div && 'VALOR_ESCRITURADO' in div && 'VALOR_APURADO' in div && div.TIPO !== 'C190 não preenchido') {
    const d = div as DivergenciaApuracao;
    const diferenca = Math.abs(d.DIFERENCA || 0);
    const severidade = (d.SEVERIDADE || 'media').toLowerCase();
    
    return {
      acao: d.RECOMENDACAO || 'Verificar apuração',
      prioridade: (severidade === 'alta' ? 'alta' : severidade === 'baixa' ? 'baixa' : 'media') as 'alta' | 'media' | 'baixa',
      detalhes: [
        d.MENSAGEM || 'Inconsistência na apuração identificada',
        `Valor Escriturado: ${formatCurrency(d.VALOR_ESCRITURADO || 0)}`,
        `Valor Apurado: ${formatCurrency(d.VALOR_APURADO || 0)}`,
        `Diferença: ${formatCurrency(diferenca)}`,
        d.RECOMENDACAO || 'Verificar consistência entre escrituração e apuração'
      ],
      icon: <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />,
      referenciaLegal: {
        artigo: 'Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 4',
        norma: 'A apuração (E110) deve estar consistente com os valores escriturados (C100/C190)',
        prazo: 'Corrigir antes da transmissão da EFD',
        penalidade: 'Multa por inconsistência na apuração fiscal'
      }
    };
  }
  
  // Divergências C170 x C190
  if ('E_LEGITIMA' in div) {
    const d = div as DivergenciaC170C190;
    
    if (d.E_LEGITIMA) {
      return {
        acao: 'Não requer correção',
        prioridade: 'baixa',
        detalhes: [
          d.MOTIVO_LEGITIMO || 'Divergência legítima conforme legislação',
          'Documentar o motivo para auditoria futura',
          'Manter registro do tipo de operação: ' + (d.TIPO_OPERACAO || 'N/A')
        ],
        icon: <CheckCircleIcon className="h-5 w-5 text-green-600" />,
        referenciaLegal: {
          artigo: 'Ato COTEPE/ICMS nº 44/2018, Seção 3, Bloco C',
          norma: 'Diferenças podem ser esperadas em operações especiais conforme legislação',
          prazo: 'Não aplicável - divergência legítima',
          penalidade: undefined
        }
      };
    }
    
    // Divergências que requerem atenção
    const diferenca = Math.abs(d.DIFERENCA || 0);
    const campo = d.CAMPO || '';
    
    if (diferenca > 1000) {
      return {
        acao: 'URGENTE: Verificar lançamento no SPED',
        prioridade: 'alta',
        detalhes: [
          `Diferença significativa em ${campo}: ${formatCurrency(diferenca)}`,
          'Verificar se todos os itens (C170) foram lançados corretamente',
          'Conferir se o total consolidado (C190) está correto',
          'Revisar CFOP ' + (d.CFOP || '') + ' e CST ' + (d.CST || ''),
          'Comparar com XML da NF-e chave: ' + (d.CHAVE?.substring(0, 20) || ''),
          'Verificar se há itens duplicados ou faltantes no C170'
        ],
        icon: <XCircleIcon className="h-5 w-5 text-red-600" />,
        referenciaLegal: {
          artigo: 'Ato COTEPE/ICMS nº 44/2018, Seção 3, Bloco C',
          norma: 'Os valores dos itens (C170) devem bater com os totais (C190) por CFOP/CST',
          prazo: 'Corrigir antes da próxima apuração',
          penalidade: 'Multa por inconsistência na escrituração fiscal'
        }
      };
    } else if (diferenca > 100) {
      return {
        acao: 'Revisar lançamento no SPED',
        prioridade: 'media',
        detalhes: [
          `Diferença em ${campo}: ${formatCurrency(diferenca)}`,
          'Verificar se há itens faltando no C170 ou duplicados',
          'Conferir se o C190 foi calculado corretamente',
          'Verificar se há ajustes ou abatimentos não considerados',
          'Comparar valores item a item entre C170 e C190'
        ],
        icon: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />,
        referenciaLegal: {
          artigo: 'Ato COTEPE/ICMS nº 44/2018, Seção 3, Bloco C',
          norma: 'Consistência obrigatória entre registros C170 e C190',
          prazo: 'Antes da transmissão da EFD',
          penalidade: 'Possível rejeição pelo PVA'
        }
      };
    }
  }
  
  // Divergências de Valores
  if ('TIPO_DIVERGENCIA' in div) {
    const d = div as DivergenciaValor;
    
    if (d.TIPO_DIVERGENCIA === 'ERRO_HUMANO' || d.TIPO_DIVERGENCIA === 'ERRO_SISTEMATICO') {
      return {
        acao: 'Corrigir no SPED',
        prioridade: 'alta',
        detalhes: [
          d.MOTIVO_CLASSIFICACAO || 'Erro identificado no preenchimento',
          `Campo: ${d.CAMPO || d.DELTA_COLUNA || ''}`,
          `Diferença: ${formatCurrency(Math.abs(d.DIFERENCA || 0))}`,
          'Verificar o lançamento no registro C100 ou C190',
          'Comparar com o XML da NF-e para confirmar o valor correto',
          'Ajustar o SPED e refazer a validação',
          'Verificar se o erro é sistemático (afeta múltiplas notas)'
        ],
        icon: <XCircleIcon className="h-5 w-5 text-red-600" />,
        referenciaLegal: {
          artigo: 'Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3',
          norma: 'Valores informados no SPED devem corresponder aos valores dos documentos fiscais',
          prazo: 'Imediato - antes da transmissão',
          penalidade: 'Multa por erro na escrituração fiscal'
        }
      };
    }
    
    if (d.TIPO_DIVERGENCIA === 'DESCONTO_CONSISTENTE' || d.TIPO_DIVERGENCIA === 'LEGITIMA_OPERACAO') {
      return {
        acao: 'Verificar documentação',
        prioridade: 'baixa',
        detalhes: [
          d.MOTIVO_CLASSIFICACAO || 'Desconto legítimo identificado',
          'Confirmar se o desconto está documentado corretamente',
          'Verificar se há nota fiscal de ajuste ou documento complementar',
          'Manter registro para auditoria',
          'Garantir que o desconto está no campo VL_DESC do C100'
        ],
        icon: <InformationCircleIcon className="h-5 w-5 text-blue-600" />,
        referenciaLegal: {
          artigo: 'Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3',
          norma: 'Descontos incondicionais devem ser informados no campo VL_DESC',
          prazo: 'Não aplicável - operação legítima',
          penalidade: undefined
        }
      };
    }
  }
  
  // Recomendação padrão
  return {
    acao: 'Revisar divergência',
    prioridade: 'media',
    detalhes: [
      'Analisar a divergência com cuidado',
      'Comparar valores entre XML e SPED',
      'Verificar documentação fiscal relacionada',
      'Consultar legislação aplicável se necessário'
    ],
    icon: <LightBulbIcon className="h-5 w-5 text-gray-600" />,
    referenciaLegal: {
      artigo: 'Guia Prático EFD-ICMS/IPI',
      norma: 'Conformidade com a legislação fiscal vigente',
      prazo: 'Antes da transmissão',
      penalidade: undefined
    }
  };
};

const DivergenciasInteligentes: React.FC<Props> = ({
  divergenciasC170C190 = [],
  divergenciasValores = [],
  divergenciasApuracao = [],
  divergenciasC190Preenchimento = [],
  outrasDivergencias = []
}) => {
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todas');
  const [busca, setBusca] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [copiedChave, setCopiedChave] = useState<string | null>(null);

  // Agrupar e formatar todas as divergências
  const divergenciasFormatadas = useMemo(() => {
    const resultado: any[] = [];
    
    // Adicionar C170 x C190
    divergenciasC170C190.forEach(div => {
      const rec = gerarRecomendacao(div);
      resultado.push({
        categoria: 'C170 x C190',
        chave: div.CHAVE || '',
        campo: div.CAMPO || '',
        valor1: div.C170,
        valor2: div.C190,
        diferenca: div.DIFERENCA,
        severidade: div.SEVERIDADE || 'media',
        legítima: div.E_LEGITIMA || false,
        tipoOperacao: div.TIPO_OPERACAO,
        motivo: div.MOTIVO_LEGITIMO,
        recomendacao: rec,
        dadosOriginais: div
      });
    });
    
    // Adicionar Divergências de Valores
    divergenciasValores.forEach(div => {
      const rec = gerarRecomendacao(div);
      resultado.push({
        categoria: 'Valores Divergentes',
        chave: div.CHAVE || '',
        campo: div.CAMPO || div.DELTA_COLUNA || '',
        valor1: div.VALOR_XML,
        valor2: div.VALOR_SPED,
        diferenca: div.DIFERENCA,
        severidade: div.CONFIANCA === 'ALTA' ? 'alta' : 'media',
        legítima: !['ERRO_HUMANO', 'ERRO_SISTEMATICO'].includes(div.TIPO_DIVERGENCIA || ''),
        tipoDivergencia: div.TIPO_DIVERGENCIA,
        motivo: div.MOTIVO_CLASSIFICACAO,
        recomendacao: rec,
        dadosOriginais: div
      });
    });
    
    // Adicionar Divergências de Apuração
    divergenciasApuracao.forEach(div => {
      const rec = gerarRecomendacao(div);
      resultado.push({
        categoria: 'Apuração (E110/E116)',
        chave: '',
        campo: div.TIPO || '',
        valor1: div.VALOR_ESCRITURADO,
        valor2: div.VALOR_APURADO,
        diferenca: div.DIFERENCA,
        severidade: div.SEVERIDADE || 'media',
        legítima: false,
        tipoOperacao: div.TIPO,
        motivo: div.MENSAGEM,
        recomendacao: rec,
        dadosOriginais: div
      });
    });
    
    // Adicionar Divergências de C190 Preenchimento
    divergenciasC190Preenchimento.forEach(div => {
      const rec = gerarRecomendacao(div);
      const valorTotalC170 = Math.abs(div.VALOR_C170_BC_ICMS || 0) + Math.abs(div.VALOR_C170_ICMS || 0);
      resultado.push({
        categoria: 'C190 - Preenchimento Incorreto',
        chave: div.CHAVE || '',
        campo: `${div.CFOP || ''} / ${div.CST || ''}`,
        valor1: valorTotalC170,
        valor2: 0,
        diferenca: valorTotalC170,
        severidade: div.SEVERIDADE || 'media',
        legítima: false,
        tipoOperacao: div.TIPO,
        motivo: div.MENSAGEM,
        recomendacao: rec,
        dadosOriginais: div
      });
    });
    
    // Adicionar outras divergências
    outrasDivergencias.forEach(div => {
      resultado.push({
        categoria: div.Categoria || 'Outras',
        chave: div['Chave NF-e'] || div.CHAVE || '',
        campo: div.Campo || '',
        valor1: div['No XML'],
        valor2: div['No SPED'],
        diferenca: null,
        severidade: div.Severidade || 'media',
        legítima: false,
        recomendacao: {
          acao: div.Sugestão || 'Revisar',
          prioridade: (div.Severidade || 'media').toLowerCase() as 'alta' | 'media' | 'baixa',
          detalhes: [div.Descrição || div.Sugestão || 'Verificar divergência'],
          icon: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />,
          referenciaLegal: {
            artigo: 'Guia Prático EFD-ICMS/IPI',
            norma: 'Conformidade com a legislação fiscal vigente',
            prazo: 'Antes da transmissão',
            penalidade: undefined
          }
        },
        dadosOriginais: div
      });
    });
    
    return resultado;
  }, [divergenciasC170C190, divergenciasValores, divergenciasApuracao, divergenciasC190Preenchimento, outrasDivergencias]);

  const divergenciasFiltradas = divergenciasFormatadas.filter(d => {
    const matchCategoria = filtroCategoria === 'todas' || d.categoria === filtroCategoria;
    const matchPrioridade = filtroPrioridade === 'todas' || d.recomendacao.prioridade === filtroPrioridade;
    const matchBusca = !busca || 
      Object.values(d).some(v => 
        String(v).toLowerCase().includes(busca.toLowerCase())
      );
    return matchCategoria && matchPrioridade && matchBusca;
  });

  const categorias = Array.from(new Set(divergenciasFormatadas.map(d => d.categoria)));

  const formatarChave = (chave: string) => {
    if (!chave) return '—';
    if (chave.length > 44) return chave.substring(0, 44) + '...';
    return chave.match(/.{1,4}/g)?.join(' ') || chave;
  };

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCards(newExpanded);
  };

  const expandAll = () => {
    setExpandedCards(new Set(divergenciasFiltradas.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedCards(new Set());
  };

  const copyToClipboard = async (chave: string) => {
    try {
      // Remove espaços da chave para copiar apenas os números
      const chaveLimpa = chave.replace(/\s/g, '');
      await navigator.clipboard.writeText(chaveLimpa);
      setCopiedChave(chaveLimpa);
      // Resetar após 2 segundos
      setTimeout(() => setCopiedChave(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar chave:', err);
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = chave.replace(/\s/g, '');
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedChave(chave.replace(/\s/g, ''));
        setTimeout(() => setCopiedChave(null), 2000);
      } catch (fallbackErr) {
        console.error('Erro no fallback de cópia:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Buscar por chave, campo, CFOP..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoria
            </label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="todas">Todas as categorias</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prioridade
            </label>
            <select
              value={filtroPrioridade}
              onChange={(e) => setFiltroPrioridade(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="todas">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Estatísticas e Controles */}
      {divergenciasFormatadas.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
              <div className="text-center">
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{divergenciasFormatadas.length}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Alta Prioridade</p>
                <p className="text-2xl font-bold text-red-600">
                  {divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'alta').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Média Prioridade</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'media').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Legítimas</p>
                <p className="text-2xl font-bold text-green-600">
                  {divergenciasFormatadas.filter(d => d.legítima).length}
                </p>
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={expandAll}
                className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
              >
                Expandir Todas
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
              >
                Recolher Todas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Divergências */}
      <div className="space-y-4">
        {divergenciasFiltradas.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-900">Nenhuma divergência encontrada</p>
            <p className="text-sm text-gray-600 mt-2">Todos os confrontos foram realizados com sucesso.</p>
          </div>
        ) : (
          divergenciasFiltradas.map((div, index) => {
            const isExpanded = expandedCards.has(index);
            const chaveLimpa = div.chave ? div.chave.replace(/\s/g, '') : '';
            const isCopied = copiedChave === chaveLimpa;
            
            return (
              <div
                key={index}
                className={`bg-white rounded-lg shadow-md border-l-4 transition-all cursor-pointer hover:shadow-lg ${
                  div.recomendacao.prioridade === 'alta' ? 'border-red-500' :
                  div.recomendacao.prioridade === 'media' ? 'border-yellow-500' :
                  'border-blue-500'
                }`}
                onClick={(e) => {
                  // Não expandir se clicar no botão de copiar ou no botão de expandir
                  const target = e.target as HTMLElement;
                  if (!target.closest('button') && !target.closest('[data-no-expand]')) {
                    toggleExpand(index);
                  }
                }}
              >
                <div className="p-4">
                  {/* Cabeçalho - Sempre visível */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {div.recomendacao.icon}
                        <h3 className="text-lg font-semibold text-gray-900">
                          {div.categoria}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          div.legítima 
                            ? 'bg-green-100 text-green-800' 
                            : div.recomendacao.prioridade === 'alta'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {div.legítima ? 'Legítima' : div.recomendacao.prioridade.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {div.chave && (
                          <div className="flex items-center gap-2">
                            <p>
                              <span className="font-medium">Chave NF:</span>{' '}
                              <span className="font-mono">{formatarChave(div.chave)}</span>
                            </p>
                            <button
                              data-no-expand
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(div.chave);
                              }}
                              className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Copiar chave"
                            >
                              {isCopied ? (
                                <CheckIcon className="h-4 w-4 text-green-600" />
                              ) : (
                                <ClipboardIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        )}
                        {div.campo && (
                          <p><span className="font-medium">Campo:</span> {div.campo}</p>
                        )}
                        {div.tipoOperacao && (
                          <p><span className="font-medium">Tipo Operação:</span> {div.tipoOperacao}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4" data-no-expand>
                      {div.valor1 !== undefined && div.valor2 !== undefined && (
                        <div className="text-sm text-right">
                          <p className="text-gray-600">Diferença</p>
                          <p className={`text-lg font-bold ${
                            Math.abs(div.diferenca || 0) > 100 ? 'text-red-600' : 'text-gray-900'
                          }`}>
                            {formatCurrency(Math.abs(div.diferenca || 0))}
                          </p>
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(index);
                        }}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        title={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
                      >
                        {isExpanded ? (
                          <ChevronUpIcon className="h-5 w-5" />
                        ) : (
                          <ChevronDownIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Conteúdo expandível */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-4">
                    {/* Recomendação */}
                    <div className={`p-4 rounded-lg ${
                      div.recomendacao.prioridade === 'alta' ? 'bg-red-50 border border-red-200' :
                      div.recomendacao.prioridade === 'media' ? 'bg-yellow-50 border border-yellow-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        <LightBulbIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-2">
                            {div.recomendacao.acao}
                          </h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {div.recomendacao.detalhes.map((detalhe, i) => (
                              <li key={i}>{detalhe}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Referência Legal */}
                    {div.recomendacao.referenciaLegal && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h5 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <DocumentTextIcon className="h-5 w-5" />
                          Referência Legal
                        </h5>
                        <div className="text-sm text-blue-800 space-y-1">
                          <p><span className="font-medium">Artigo/Norma:</span> {div.recomendacao.referenciaLegal.artigo}</p>
                          <p><span className="font-medium">Norma:</span> {div.recomendacao.referenciaLegal.norma}</p>
                          <p><span className="font-medium">Prazo para correção:</span> {div.recomendacao.referenciaLegal.prazo}</p>
                          {div.recomendacao.referenciaLegal.penalidade && (
                            <p className="text-red-700">
                              <span className="font-medium">⚠️ Penalidade:</span> {div.recomendacao.referenciaLegal.penalidade}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Valores comparativos */}
                    {div.valor1 !== undefined && div.valor2 !== undefined && (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-gray-600 font-medium mb-1">
                            {div.categoria === 'C170 x C190' ? 'C170 (Itens)' : 'XML'}
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(div.valor1 || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-gray-600 font-medium mb-1">
                            {div.categoria === 'C170 x C190' ? 'C190 (Total)' : 'SPED'}
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(div.valor2 || 0)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DivergenciasInteligentes;

