import React, { useState, useMemo, useEffect } from 'react';
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
  CheckIcon,
  WrenchScrewdriverIcon,
  ArrowDownTrayIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatCurrency';
import { spedService } from '../../services/sped';
import ResultadoCorrecoes from './ResultadoCorrecoes';
import ModalConfirmacaoCorrecoes from './ModalConfirmacaoCorrecoes';
import { useToast } from '../../hooks/useToast';

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
  // Campos de solução automática
  SOLUCAO_AUTOMATICA?: string;
  REGISTRO_CORRIGIR?: string;
  CAMPO_CORRIGIR?: string;
  VALOR_CORRETO?: number;
  FORMULA_LEGAL?: string;
  REFERENCIA_LEGAL?: string;
  DETALHES?: string;
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
  SOLUCAO_AUTOMATICA?: string;
  REGISTRO_CORRIGIR?: string;
  CAMPO_CORRIGIR?: string;
  VALOR_CORRETO?: number;
  FORMULA_LEGAL?: string;
  REFERENCIA_LEGAL?: string;
  DETALHES_ITENS?: string;  // JSON string
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
  validationId?: string; // ID da validação para aplicar correções
}

// Função para gerar recomendações inteligentes baseadas em legislação
const gerarRecomendacao = (div: DivergenciaC170C190 | DivergenciaValor | DivergenciaApuracao | DivergenciaC190Preenchimento | any): Recomendacao => {
  // Se div tem dadosOriginais, usar eles (caso seja um objeto formatado)
  const dadosReais = (div as any).dadosOriginais || div;
  // Divergências de C190 Preenchimento (verificar primeiro para evitar conflito)
  if ('TIPO' in dadosReais && dadosReais.TIPO === 'C190 não preenchido' && 'VALOR_C170_BC_ICMS' in dadosReais) {
    const d = dadosReais as DivergenciaC190Preenchimento;
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
  if ('TIPO' in dadosReais && 'VALOR_ESCRITURADO' in dadosReais && 'VALOR_APURADO' in dadosReais && dadosReais.TIPO !== 'C190 não preenchido') {
    const d = dadosReais as DivergenciaApuracao;
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
  if ('E_LEGITIMA' in dadosReais) {
    const d = dadosReais as DivergenciaC170C190;
    
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
    
    // PRIORIDADE: Se temos solução automática, usar ela (verificação mais robusta)
    const solucao = d.SOLUCAO_AUTOMATICA;
    
    // Debug para C170 x C190
    console.log('[gerarRecomendacao - C170 x C190] Verificando solução:', {
      chave: d.CHAVE,
      cfop: d.CFOP,
      cst: d.CST,
      campo: d.CAMPO,
      solucao,
      tipo: typeof solucao,
      isNull: solucao === null,
      isUndefined: solucao === undefined,
      isFalse: solucao === false,
      truthy: !!solucao,
      todasChaves: Object.keys(d),
      registroCorrigir: d.REGISTRO_CORRIGIR,
      valorCorreto: d.VALOR_CORRETO
    });
    
    if (solucao != null && solucao !== undefined && solucao !== false) {
      // Converter para string se necessário
      const solucaoStr = String(solucao).trim();
      
      if (solucaoStr !== '' && solucaoStr !== 'null' && solucaoStr !== 'undefined' && solucaoStr !== 'None' && solucaoStr !== 'nan') {
        console.log('[gerarRecomendacao - C170 x C190] ✅ Solução válida encontrada! Usando solução automática.');
        
        const detalhes = [solucaoStr];
        
        // Adicionar valor correto se disponível
        if (d.VALOR_CORRETO !== undefined && d.VALOR_CORRETO !== null) {
          detalhes.push(`Valor correto a lançar: ${formatCurrency(d.VALOR_CORRETO)}`);
        }
        
        // Adicionar registro específico a corrigir
        if (d.REGISTRO_CORRIGIR && d.REGISTRO_CORRIGIR !== 'NENHUM') {
          detalhes.push(`Registro a corrigir: ${d.REGISTRO_CORRIGIR}`);
          if (d.CAMPO_CORRIGIR) {
            detalhes.push(`Campo específico: ${d.CAMPO_CORRIGIR}`);
          }
        }
        
        // Adicionar detalhes se disponível
        if (d.DETALHES) {
          detalhes.push(d.DETALHES);
        }
        
        // Adicionar fórmula legal se disponível
        if (d.FORMULA_LEGAL) {
          detalhes.push(`Fórmula legal: ${d.FORMULA_LEGAL}`);
        }
        
        return {
          acao: d.REGISTRO_CORRIGIR === 'NENHUM' ? 'Não requer correção' : `Corrigir ${d.REGISTRO_CORRIGIR || 'C190'}`,
          prioridade: (d.SEVERIDADE === 'alta' ? 'alta' : 'media') as 'alta' | 'media' | 'baixa',
          detalhes: detalhes,
          icon: d.REGISTRO_CORRIGIR === 'NENHUM' ? 
            <CheckCircleIcon className="h-5 w-5 text-green-600" /> :
            <XCircleIcon className="h-5 w-5 text-red-600" />,
          referenciaLegal: {
            artigo: d.REFERENCIA_LEGAL || 'Ato COTEPE/ICMS nº 44/2018, Seção 3, Bloco C',
            norma: d.FORMULA_LEGAL || 'Os valores dos itens (C170) devem bater com os totais (C190) por CFOP/CST',
            prazo: d.REGISTRO_CORRIGIR === 'NENHUM' ? 'Não aplicável' : 'Corrigir antes da próxima apuração',
            penalidade: d.REGISTRO_CORRIGIR === 'NENHUM' ? undefined : 'Multa por inconsistência na escrituração fiscal'
          }
        };
      } else {
        console.log('[gerarRecomendacao - C170 x C190] ⚠️ Solução vazia ou inválida:', solucaoStr);
      }
    } else {
      console.log('[gerarRecomendacao - C170 x C190] ⚠️ Solução não encontrada ou falsy');
    }
    
    // Fallback para recomendações genéricas se não houver solução automática
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
  if ('TIPO_DIVERGENCIA' in dadosReais) {
    const d = dadosReais as DivergenciaValor;
    
    // Debug: Log para verificar se SOLUCAO_AUTOMATICA está presente
    if (!d.SOLUCAO_AUTOMATICA || d.SOLUCAO_AUTOMATICA === '') {
      console.log('[gerarRecomendacao] SOLUCAO_AUTOMATICA não encontrada ou vazia para divergência de valores:', {
        chave: d.CHAVE,
        campo: d.CAMPO || d.DELTA_COLUNA,
        tipoDivergencia: d.TIPO_DIVERGENCIA,
        todasChaves: Object.keys(d),
        temDadosOriginais: !!(div as any).dadosOriginais,
        solucaoAutomatica: d.SOLUCAO_AUTOMATICA,
        tipoSolucao: typeof d.SOLUCAO_AUTOMATICA
      });
    }
    
    // Se temos solução automática (não vazia), usar ela (verificação mais robusta)
    const solucao = d.SOLUCAO_AUTOMATICA;
    
    // Debug detalhado
    console.log('[gerarRecomendacao - Valores] Verificando solução:', {
      solucao,
      tipo: typeof solucao,
      isNull: solucao === null,
      isUndefined: solucao === undefined,
      isFalse: solucao === false,
      truthy: !!solucao,
      todasChaves: Object.keys(d)
    });
    
    if (solucao != null && solucao !== undefined && solucao !== false) {
      // Converter para string se necessário
      const solucaoStr = String(solucao).trim();
      console.log('[gerarRecomendacao - Valores] Solução convertida para string:', {
        solucaoStr,
        length: solucaoStr.length,
        isEmpty: solucaoStr === '',
        isNull: solucaoStr === 'null',
        isUndefined: solucaoStr === 'undefined',
        isNone: solucaoStr === 'None',
        isNan: solucaoStr === 'nan'
      });
      
      if (solucaoStr !== '' && solucaoStr !== 'null' && solucaoStr !== 'undefined' && solucaoStr !== 'None' && solucaoStr !== 'nan') {
        console.log('[gerarRecomendacao - Valores] ✅ Solução válida encontrada! Usando solução automática.');
        const detalhes = [solucaoStr];
        
        // Adicionar valor correto se disponível
        if (d.VALOR_CORRETO !== undefined) {
          detalhes.push(`Valor correto a lançar: ${formatCurrency(d.VALOR_CORRETO)}`);
        }
        
        // Adicionar registro específico a corrigir
        if (d.REGISTRO_CORRIGIR && d.REGISTRO_CORRIGIR !== 'NENHUM') {
          detalhes.push(`Registro a corrigir: ${d.REGISTRO_CORRIGIR}`);
          if (d.CAMPO_CORRIGIR) {
            detalhes.push(`Campo específico: ${d.CAMPO_CORRIGIR}`);
          }
        }
        
        // Adicionar fórmula legal se disponível
        if (d.FORMULA_LEGAL) {
          detalhes.push(`Fórmula legal: ${d.FORMULA_LEGAL}`);
        }
      
      // Adicionar detalhes de itens se disponível
      if (d.DETALHES_ITENS) {
        try {
          const itens = JSON.parse(d.DETALHES_ITENS);
          if (Array.isArray(itens) && itens.length > 0) {
            detalhes.push('\nDetalhes item a item:');
            itens.slice(0, 5).forEach((item: any, idx: number) => {
              detalhes.push(
                `  ${idx + 1}. Item ${item.nItem || 'N/A'} (CFOP ${item.CFOP || 'N/A'}, CST ${item.CST || 'N/A'}): ` +
                `XML: ${formatCurrency(item.valor_xml || 0)}, SPED: ${formatCurrency(item.valor_sped || 0)}`
              );
            });
            if (itens.length > 5) {
              detalhes.push(`  ... e mais ${itens.length - 5} item(ns)`);
            }
          }
        } catch (e) {
          // Ignorar erro de parse JSON
        }
      }
      
        return {
          acao: d.REGISTRO_CORRIGIR === 'NENHUM' ? 'Não requer correção' : `Corrigir ${d.REGISTRO_CORRIGIR || 'SPED'}`,
          prioridade: (d.CONFIANCA === 'ALTA' ? 'alta' : 'media') as 'alta' | 'media' | 'baixa',
          detalhes: detalhes,
          icon: d.REGISTRO_CORRIGIR === 'NENHUM' ? 
            <CheckCircleIcon className="h-5 w-5 text-green-600" /> :
            <XCircleIcon className="h-5 w-5 text-red-600" />,
          referenciaLegal: {
            artigo: d.REFERENCIA_LEGAL || 'Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3',
            norma: d.FORMULA_LEGAL || 'Valores informados no SPED devem corresponder aos valores dos documentos fiscais',
            prazo: d.REGISTRO_CORRIGIR === 'NENHUM' ? 'Não aplicável' : 'Imediato - antes da transmissão',
            penalidade: d.REGISTRO_CORRIGIR === 'NENHUM' ? undefined : 'Multa por erro na escrituração fiscal'
          }
        };
      }
    }
    
    // Fallback para recomendações genéricas se não houver solução automática
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
  outrasDivergencias = [],
  validationId
}) => {
  const toast = useToast();
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todas');
  const [busca, setBusca] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set()); // Estado para controlar referências legais expandidas
  const [copiedChave, setCopiedChave] = useState<string | null>(null);
  const [aplicandoCorrecao, setAplicandoCorrecao] = useState<number | null>(null);
  const [correcoesAplicadas, setCorrecoesAplicadas] = useState<Set<number>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState<string>('');
  const [modalTitle, setModalTitle] = useState<string>('');
  const [resultadoAplicacao, setResultadoAplicacao] = useState<any>(null);
  const [mostrarResultado, setMostrarResultado] = useState(false);

  // Debug: Log dos dados recebidos
  useEffect(() => {
    console.log('[DivergenciasInteligentes] Props recebidas:', {
      divergenciasC170C190: divergenciasC170C190?.length || 0,
      divergenciasValores: divergenciasValores?.length || 0,
      divergenciasApuracao: divergenciasApuracao?.length || 0,
      divergenciasC190Preenchimento: divergenciasC190Preenchimento?.length || 0,
    });
    
    if (divergenciasValores && divergenciasValores.length > 0) {
      const primeira = divergenciasValores[0];
      console.log('[DivergenciasInteligentes] Primeira divergência de valores:', primeira);
      console.log('[DivergenciasInteligentes] Tem SOLUCAO_AUTOMATICA?', 'SOLUCAO_AUTOMATICA' in primeira);
      console.log('[DivergenciasInteligentes] Valor de SOLUCAO_AUTOMATICA:', primeira.SOLUCAO_AUTOMATICA);
      console.log('[DivergenciasInteligentes] Tipo de SOLUCAO_AUTOMATICA:', typeof primeira.SOLUCAO_AUTOMATICA);
      console.log('[DivergenciasInteligentes] Chaves:', Object.keys(primeira));
      console.log('[DivergenciasInteligentes] Todas as propriedades:', JSON.stringify(primeira, null, 2));
      if (primeira.SOLUCAO_AUTOMATICA) {
        console.log('[DivergenciasInteligentes] Solução encontrada:', primeira.SOLUCAO_AUTOMATICA.substring(0, 100));
      } else {
        console.warn('[DivergenciasInteligentes] SOLUCAO_AUTOMATICA está vazia ou não existe!');
      }
    }
    
    if (divergenciasC170C190 && divergenciasC170C190.length > 0) {
      const primeira = divergenciasC170C190[0];
      console.log('[DivergenciasInteligentes] Primeira divergência C170 x C190:', primeira);
      console.log('[DivergenciasInteligentes] Tem SOLUCAO_AUTOMATICA?', 'SOLUCAO_AUTOMATICA' in primeira);
      if (primeira.SOLUCAO_AUTOMATICA) {
        console.log('[DivergenciasInteligentes] Solução C170 x C190 encontrada:', primeira.SOLUCAO_AUTOMATICA.substring(0, 100));
      }
    }
  }, [divergenciasC170C190, divergenciasValores, divergenciasApuracao, divergenciasC190Preenchimento]);

  // 🔥 Agrupar divergências por chave para correção em lote (RESTAURADO)
  const divergenciasFormatadas = useMemo(() => {
    const todasDivergencias: Array<{ tipo: string; dados: any }> = [];
    
    // Coletar todas as divergências
    divergenciasC170C190.forEach(div => {
      todasDivergencias.push({ tipo: 'C170 x C190', dados: div });
    });
    
    divergenciasValores.forEach(div => {
      todasDivergencias.push({ tipo: 'Valores Divergentes', dados: div });
    });
    
    // Agrupar por chave normalizada
    const divsPorChave = new Map<string, Array<{ tipo: string; dados: any }>>();
    
    todasDivergencias.forEach(item => {
      const chaveNormalizada = (item.dados.CHAVE || '').replace(/\s/g, '');
      
      if (!chaveNormalizada) {
        divsPorChave.set(`sem_chave_${Math.random()}`, [item]);
        return;
      }
      
      if (!divsPorChave.has(chaveNormalizada)) {
        divsPorChave.set(chaveNormalizada, []);
      }
      divsPorChave.get(chaveNormalizada)!.push(item);
    });
    
    const resultado: any[] = [];
    
    // Processar cada grupo
    divsPorChave.forEach((grupo, chaveNormalizada) => {
      const chaveOriginal = grupo[0].dados.CHAVE || '';
      
      // Filtrar divergências com solução automática
      const divsComSolucao = grupo.filter(item => {
        const solucao = item.dados.SOLUCAO_AUTOMATICA;
        const registro = item.dados.REGISTRO_CORRIGIR;
        const valor = item.dados.VALOR_CORRETO;
        
        return solucao && 
               solucao !== '' && 
               solucao !== 'null' && 
               registro && 
               registro !== 'NENHUM' && 
               valor !== undefined && 
               valor !== null;
      });
      
      // Se tem 2+ correções da mesma NF, AGRUPAR
      if (divsComSolucao.length > 1) {
        const correcoes = divsComSolucao.map(item => {
          const div = item.dados;
          return {
            tipo: item.tipo,
            campo: div.CAMPO || div.DELTA_COLUNA || '',
            valor1: div.C170 || div.VALOR_XML,
            valor2: div.C190 || div.VALOR_SPED,
            diferenca: div.DIFERENCA,
            recomendacao: gerarRecomendacao(div),
            dadosOriginais: div
          };
        });
        
        const severidadeGrupo = divsComSolucao.some(item => 
          item.dados.SEVERIDADE === 'alta' || item.dados.CONFIANCA === 'ALTA'
        ) ? 'alta' : 'media';
        
        resultado.push({
          categoria: 'Correções em Lote',
          chave: chaveOriginal,
          campo: `${divsComSolucao.length} campos a corrigir`,
          isGrupo: true,
          correcoes: correcoes,
          severidade: severidadeGrupo,
          legítima: false,
          recomendacao: {
            acao: `Corrigir ${divsComSolucao.length} campos da mesma NF`,
            prioridade: severidadeGrupo as 'alta' | 'media',
            detalhes: correcoes.map(c => `${c.campo}: ${formatCurrency(c.dadosOriginais.VALOR_CORRETO || 0)}`),
            icon: <WrenchScrewdriverIcon className="h-5 w-5 text-orange-600" />
          },
          dadosOriginais: divsComSolucao.map(item => item.dados)
        });
      } else {
        // Cards individuais
        grupo.forEach(item => {
          const div = item.dados;
          const rec = gerarRecomendacao(div);
          
          if (item.tipo === 'C170 x C190') {
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
          } else if (item.tipo === 'Valores Divergentes') {
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
          }
        });
      }
    });
    
    // Adicionar divergências de Apuração, C190 Preenchimento e Outras
    
    // Divergências de Apuração (não agrupáveis)
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

  const toggleRefLegal = (index: number) => {
    const newExpanded = new Set(expandedRefs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRefs(newExpanded);
  };

  const aplicarCorrecao = async (index: number, div: any) => {
    if (!validationId) {
      toast.error('ID de validação não disponível');
      return;
    }

    // 🔥 DETECTAR MODO LOTE (múltiplas correções da mesma NF)
    if (div.isGrupo && Array.isArray(div.dadosOriginais)) {
      console.log(`[LOTE] Aplicando ${div.dadosOriginais.length} correções da chave ${div.chave.slice(0, 20)}...`);
      
      const correcoesValidas = [];
      
      for (const dadosOriginais of div.dadosOriginais) {
        if (!dadosOriginais.SOLUCAO_AUTOMATICA || dadosOriginais.SOLUCAO_AUTOMATICA === false) {
          continue;
        }
        
        if (!dadosOriginais.REGISTRO_CORRIGIR || dadosOriginais.REGISTRO_CORRIGIR === 'NENHUM') {
          continue;
        }
        
        const valorCorreto = parseFloat(String(dadosOriginais.VALOR_CORRETO || 0));
        if (isNaN(valorCorreto)) {
          continue;
        }
        
        // 🔧 Usar nome técnico SPED
        let campo = String(dadosOriginais.CAMPO_CORRIGIR || dadosOriginais.CAMPO || '').trim();
        campo = campo.replace(/^C\d+\./, ''); // Remover prefixo C190., C170., etc
        
        if (!campo) {
          continue;
        }
        
        const registro = String(dadosOriginais.REGISTRO_CORRIGIR || '').trim();
        const chave = String(dadosOriginais.CHAVE || '').trim();
        
        correcoesValidas.push({
          registro_corrigir: registro,
          campo: campo,
          valor_correto: valorCorreto,
          chave: chave,
          cfop: String(dadosOriginais.CFOP || '').trim(),
          cst: String(dadosOriginais.CST || '').trim(),
          linha_sped: dadosOriginais.LINHA_SPED ? parseInt(String(dadosOriginais.LINHA_SPED)) : undefined
        });
      }
      
      if (correcoesValidas.length === 0) {
        toast.error('Nenhuma correção válida encontrada');
        return;
      }
      
      setAplicandoCorrecao(index);
      
      try {
        toast.info(`Aplicando ${correcoesValidas.length} correções em lote...`);
        
        const resultado = await spedService.aplicarCorrecao(validationId, correcoesValidas);
        
        if (resultado.success) {
          setCorrecoesAplicadas(new Set([...correcoesAplicadas, index]));
          toast.success(`✅ ${correcoesValidas.length} correções aplicadas com sucesso!`);
        } else {
          const mensagemErro = resultado.message || resultado.error || 'Erro desconhecido';
          toast.error(`Erro: ${mensagemErro}`);
        }
      } catch (error: any) {
        console.error('[LOTE] Erro:', error);
        toast.error(`Erro: ${error.message || 'Erro desconhecido'}`);
      } finally {
        setAplicandoCorrecao(null);
      }
      
      return;
    }

    // 📌 MODO INDIVIDUAL
    const dadosOriginais = div.dadosOriginais || div;
    
    // VALIDAÇÃO 1: Verificar se tem solução automática implementável
    if (!dadosOriginais.SOLUCAO_AUTOMATICA || dadosOriginais.SOLUCAO_AUTOMATICA === false) {
      toast.info('Esta divergência não possui correção automática disponível');
      return;
    }
    
    // VALIDAÇÃO 2: Verificar que tem registro para corrigir
    if (!dadosOriginais.REGISTRO_CORRIGIR || dadosOriginais.REGISTRO_CORRIGIR === 'NENHUM') {
      toast.error('Não é possível aplicar correção automática para esta divergência');
      return;
    }
    
    // VALIDAÇÃO 3: Verificar que tem valor correto
    const valorCorreto = parseFloat(String(dadosOriginais.VALOR_CORRETO || 0));
    if (isNaN(valorCorreto)) {
      toast.error('Valor correto inválido');
      return;
    }
    
    // VALIDAÇÃO 4: Verificar que tem campo
    // 🔧 USAR CAMPO_CORRIGIR (nome técnico SPED) se disponível, senão CAMPO (nome amigável)
    let campo = String(dadosOriginais.CAMPO_CORRIGIR || dadosOriginais.CAMPO || '').trim();
    
    // Remover prefixos "C190." ou "C170." se presentes
    campo = campo.replace(/^C\d+\./, '');
    
    if (!campo || campo.length === 0) {
      toast.error('Campo não especificado');
      return;
    }
    
    // VALIDAÇÃO 5: Chave NF quando necessário para C100
    const registro = String(dadosOriginais.REGISTRO_CORRIGIR || '').trim();
    const chave = String(dadosOriginais.CHAVE || '').trim();
    if (registro === 'C100' && (!chave || chave.length === 0)) {
      toast.error('Chave NF é obrigatória para correção em C100');
      return;
    }
    
    // VALIDAÇÃO 6: Validar formato da chave (quando fornecida)
    if (chave) {
      const chaveLimpa = chave.replace(/\s/g, '');
      if (chaveLimpa.length !== 44) {
        console.warn(`Chave NF tem tamanho inválido: ${chaveLimpa.length} (esperado: 44)`);
        // Não bloquear, apenas avisar
      }
    }

    setAplicandoCorrecao(index);

    try {
      const correcao = {
        registro_corrigir: registro,
        campo: campo,
        valor_correto: valorCorreto,
        chave: chave,
        cfop: String(dadosOriginais.CFOP || '').trim(),
        cst: String(dadosOriginais.CST || '').trim(),
        linha_sped: dadosOriginais.LINHA_SPED ? parseInt(String(dadosOriginais.LINHA_SPED)) : undefined
      };
      
      // VALIDAÇÃO 7: Validar correção montada
      if (!correcao.registro_corrigir || !correcao.campo) {
        toast.error('Dados de correção incompletos');
        setAplicandoCorrecao(-1);
        return;
      }
      
      // VALIDAÇÃO 8: Validar linha_sped (se fornecida)
      if (correcao.linha_sped !== undefined && (isNaN(correcao.linha_sped) || correcao.linha_sped < 1)) {
        console.warn(`linha_sped inválida: ${correcao.linha_sped}, ignorando...`);
        correcao.linha_sped = undefined;
      }

      const resultado = await spedService.aplicarCorrecao(validationId, correcao);

      if (resultado.success) {
        setCorrecoesAplicadas(new Set([...correcoesAplicadas, index]));
        toast.success('Correção aplicada com sucesso!');
      } else {
        // Melhorar mensagem de erro para casos específicos
        let mensagemErro = resultado.message || 'Erro desconhecido';
        
        // Verificar se é erro de arquivo sem C100
        if (mensagemErro.includes('C100') || mensagemErro.includes('Bloco C')) {
          mensagemErro = `❌ Não é possível aplicar esta correção:\n\n` +
            `O arquivo SPED não contém registros C100 (Documentos Fiscais), ` +
            `que são necessários para aplicar correções em C190 quando CFOP/CST não são fornecidos.\n\n` +
            `Solução: Verifique se o arquivo SPED está completo e contém o Bloco C, ` +
            `ou forneça CFOP e CST explicitamente na correção.`;
        }
        
        toast.error(`Erro ao aplicar correção: ${mensagemErro}`);
      }
    } catch (error: any) {
      console.error('Erro ao aplicar correção:', error);
      
      // Melhorar tratamento de erro HTTP
      let mensagemErro = error.message || 'Erro desconhecido';
      
      if (error.response?.data?.error) {
        mensagemErro = error.response.data.error;
        if (error.response.data.detalhes) {
          mensagemErro += `\n\nDetalhes: ${error.response.data.detalhes}`;
        }
        if (error.response.data.sugestao) {
          mensagemErro += `\n\nSugestão: ${error.response.data.sugestao}`;
        }
      } else if (error.message?.includes('C100') || error.message?.includes('Bloco C')) {
        mensagemErro = `❌ Não é possível aplicar esta correção:\n\n` +
          `O arquivo SPED não contém registros C100 (Documentos Fiscais), ` +
          `que são necessários para aplicar correções em C190 quando CFOP/CST não são fornecidos.\n\n` +
          `Solução: Verifique se o arquivo SPED está completo e contém o Bloco C, ` +
          `ou forneça CFOP e CST explicitamente na correção.`;
      }
      
      toast.error(`Erro ao aplicar correção: ${mensagemErro}`);
    } finally {
      setAplicandoCorrecao(null);
    }
  };

  // Calcular estatísticas de correções disponíveis
  const estatisticasCorrecoes = useMemo(() => {
    const correcoesDisponiveis = divergenciasFormatadas.filter(div => {
      const dadosOriginais = div.dadosOriginais || div;
      return dadosOriginais.SOLUCAO_AUTOMATICA && dadosOriginais.REGISTRO_CORRIGIR;
    });

    const porPrioridade = {
      alta: correcoesDisponiveis.filter(d => d.recomendacao.prioridade === 'alta').length,
      media: correcoesDisponiveis.filter(d => d.recomendacao.prioridade === 'media').length,
      baixa: correcoesDisponiveis.filter(d => d.recomendacao.prioridade === 'baixa').length,
    };

    const valorTotalCorrecoes = correcoesDisponiveis.reduce((acc, div) => {
      const dadosOriginais = div.dadosOriginais || div;
      return acc + Math.abs((dadosOriginais.VALOR_CORRETO || 0) - (div.valor2 || 0));
    }, 0);

    return {
      total: correcoesDisponiveis.length,
      porPrioridade,
      valorTotal: valorTotalCorrecoes
    };
  }, [divergenciasFormatadas]);

  const aplicarTodasCorrecoes = async () => {
    if (!validationId) {
      setModalTitle('Atenção');
      setModalMessage('ID de validação não disponível');
      setShowErrorModal(true);
      return;
    }

    if (estatisticasCorrecoes.total === 0) {
      setModalTitle('Atenção');
      setModalMessage('Nenhuma correção automática disponível para aplicar.');
      setShowErrorModal(true);
      return;
    }

    // Mostrar modal de confirmação
    setShowConfirmModal(true);
  };

  const confirmarAplicarTodasCorrecoes = async () => {
    setShowConfirmModal(false);

    if (!validationId) return;

    setAplicandoCorrecao(-1); // -1 indica "aplicando todas"

    try {
      const resultado = await spedService.aplicarTodasCorrecoes(validationId);

      if (resultado.success) {
        // Salvar resultado da aplicação
        setResultadoAplicacao({
          correcoes_aplicadas: resultado.correcoes_aplicadas || 0,
          total_correcoes: resultado.total_correcoes || 0,
          falhas: resultado.falhas || 0,
          message: resultado.message || ''
        });
        
        // Calcular estatísticas antes das correções
        const divergenciasAntes = {
          total: divergenciasFormatadas.length,
          alta: divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'alta').length,
          media: divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'media').length,
          legítimas: divergenciasFormatadas.filter(d => d.legítima).length
        };
        
        // Mostrar componente de resultados
        setMostrarResultado(true);
        
        // Marcar todas as correções aplicadas
        const indicesAplicados = new Set<number>();
        divergenciasFormatadas.forEach((div, idx) => {
          const dadosOriginais = div.dadosOriginais || div;
          if (dadosOriginais.SOLUCAO_AUTOMATICA && dadosOriginais.REGISTRO_CORRIGIR) {
            indicesAplicados.add(idx);
          }
        });
        setCorrecoesAplicadas(indicesAplicados);
      } else {
        setModalTitle('❌ Erro');
        setModalMessage(resultado.message || 'Erro desconhecido ao aplicar correções');
        setShowErrorModal(true);
      }
    } catch (error: any) {
      console.error('Erro ao aplicar todas as correções:', error);
      setModalTitle('❌ Erro');
      setModalMessage(error.message || 'Erro desconhecido ao aplicar correções');
      setShowErrorModal(true);
    } finally {
      setAplicandoCorrecao(null);
    }
  };

  const baixarSpedCorrigido = async () => {
    if (!validationId) {
      toast.error('ID de validação não disponível');
      return;
    }

    try {
      await spedService.baixarSpedCorrigido(validationId);
    } catch (error: any) {
      console.error('Erro ao baixar SPED corrigido:', error);
      toast.error(`Erro ao baixar SPED corrigido: ${error.message || 'Erro desconhecido'}`);
    }
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
      {/* Componente de Resultados das Correções */}
      {mostrarResultado && resultadoAplicacao && (
        <ResultadoCorrecoes
          validationId={validationId || ''}
          resultadoAplicacao={resultadoAplicacao}
          divergenciasAntes={{
            total: divergenciasFormatadas.length,
            alta: divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'alta').length,
            media: divergenciasFormatadas.filter(d => d.recomendacao.prioridade === 'media').length,
            legítimas: divergenciasFormatadas.filter(d => d.legítima).length
          }}
          onRevalidacaoCompleta={(dados) => {
            console.log('Revalidação completa:', dados);
            // Aqui você pode atualizar as divergências com os novos dados se necessário
          }}
        />
      )}

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
            {/* Botão para aplicar todas as correções */}
            {validationId && divergenciasFormatadas.some(div => {
              const dadosOriginais = div.dadosOriginais || div;
              return dadosOriginais.SOLUCAO_AUTOMATICA && dadosOriginais.REGISTRO_CORRIGIR;
            }) && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={aplicarTodasCorrecoes}
                  disabled={aplicandoCorrecao === -1}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                >
                  {aplicandoCorrecao === -1 ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Aplicando todas as correções...
                    </>
                  ) : (
                    <>
                      <WrenchScrewdriverIcon className="h-5 w-5" />
                      Aplicar Todas as Correções Automáticas
                    </>
                  )}
                </button>
                {(correcoesAplicadas.size > 0 || aplicandoCorrecao === -1) && (
                  <button
                    onClick={baixarSpedCorrigido}
                    disabled={aplicandoCorrecao === -1}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                    Baixar SPED Corrigido
                  </button>
                )}
              </div>
            )}
          </div>
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

      {/* Modal de Confirmação Moderno */}
      <ModalConfirmacaoCorrecoes
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmarAplicarTodasCorrecoes}
        estatisticas={estatisticasCorrecoes}
      />

      {/* Modal de Sucesso */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {modalTitle}
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-line mb-4">
                  {modalMessage}
                </p>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                >
                  Fechar
                </button>
              </div>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Erro */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircleIcon className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {modalTitle}
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-line mb-4">
                  {modalMessage}
                </p>
                <button
                  onClick={() => setShowErrorModal(false)}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Fechar
                </button>
              </div>
              <button
                onClick={() => setShowErrorModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
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
            const correcaoAplicada = correcoesAplicadas.has(index);
            
            // 🔥 CARD AGRUPADO: Múltiplas correções da mesma NF
            if (div.isGrupo && div.correcoes && div.correcoes.length > 1) {
              return (
                <div
                  key={index}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 transition-all hover:shadow-md"
                >
                  {/* Cabeçalho compacto - sempre visível */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpand(index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 bg-orange-50 border border-orange-200 rounded">
                          <span className="text-sm font-bold text-orange-700">{div.correcoes.length}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900">
                              Valores Divergentes
                            </h3>
                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-orange-50 text-orange-700 border border-orange-200">
                              {div.correcoes.length} campos
                            </span>
                          </div>
                          {div.chave && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-gray-600">
                                <span className="font-medium">Chave:</span>{' '}
                                <span className="font-mono">{formatarChave(div.chave)}</span>
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(div.chave);
                                }}
                                className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Copiar chave"
                              >
                                {isCopied ? (
                                  <CheckIcon className="h-3 w-3 text-green-600" />
                                ) : (
                                  <ClipboardIcon className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Diferença total</p>
                          <p className="text-sm font-bold text-red-600">
                            {formatCurrency(div.correcoes.reduce((sum: number, c: any) => 
                              sum + Math.abs(c.diferenca || 0), 0))}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(index);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
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

                  {/* Conteúdo expandido - detalhes das correções */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      <div className="p-4 space-y-3">
                        {div.correcoes.map((correcao: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center justify-center w-6 h-6 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
                                {idx + 1}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900">{correcao.campo}</p>
                                <div className="flex items-center gap-4 mt-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs text-gray-600">
                                      C170: <span className="font-semibold text-blue-600">{formatCurrency(correcao.dadosOriginais?.C170 || 0)}</span>
                                    </p>
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded" title="Valor do XML da NF-e">
                                      XML
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-400">→</span>
                                  <p className="text-xs text-gray-600">
                                    C190: <span className="font-semibold text-gray-900">{formatCurrency(correcao.dadosOriginais?.C190 || 0)}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="flex items-center justify-end gap-1.5 mb-1">
                                <p className="text-xs text-gray-500">Corrigir para</p>
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded" title="Valor que será aplicado (origem: XML)">
                                  do XML
                                </span>
                              </div>
                              <p className="text-sm font-bold text-green-600">
                                {formatCurrency(correcao.dadosOriginais?.VALOR_CORRETO || 0)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Botão de aplicação em lote */}
                      <div className="px-4 pb-4">
                        {correcaoAplicada ? (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                              <p className="text-sm text-green-800 font-medium">
                                {div.correcoes.length} correções aplicadas com sucesso
                              </p>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => aplicarCorrecao(index, div)}
                            disabled={aplicandoCorrecao === index}
                            className="w-full py-2.5 px-4 bg-orange-600 text-white font-medium text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {aplicandoCorrecao === index ? (
                              <>
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                <span>Aplicando correções...</span>
                              </>
                            ) : (
                              <>
                                <WrenchScrewdriverIcon className="h-4 w-4" />
                                <span>Aplicar {div.correcoes.length} Correções</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            
            // 📌 CARD INDIVIDUAL: Correção única (comportamento original)
            return (
              <div
                key={index}
                className="bg-white rounded-lg shadow-sm border border-gray-200 transition-all hover:shadow-md"
              >
                {/* Cabeçalho compacto - sempre visível */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (!target.closest('button') && !target.closest('[data-no-expand]')) {
                      toggleExpand(index);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`flex items-center justify-center w-8 h-8 rounded border ${
                        div.recomendacao.prioridade === 'alta' 
                          ? 'bg-red-50 border-red-200' 
                          : div.recomendacao.prioridade === 'media'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-blue-50 border-blue-200'
                      }`}>
                        <span className={`text-sm font-bold ${
                          div.recomendacao.prioridade === 'alta' 
                            ? 'text-red-700' 
                            : div.recomendacao.prioridade === 'media'
                            ? 'text-yellow-700'
                            : 'text-blue-700'
                        }`}>
                          !
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {div.categoria}
                          </h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${
                            div.legítima 
                              ? 'bg-green-50 text-green-700 border-green-200' 
                              : div.recomendacao.prioridade === 'alta'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                            {div.legítima ? 'Legítima' : div.recomendacao.prioridade.toUpperCase()}
                          </span>
                        </div>
                        {div.chave && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Chave:</span>{' '}
                              <span className="font-mono">{formatarChave(div.chave)}</span>
                            </p>
                            <button
                              data-no-expand
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(div.chave);
                              }}
                              className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Copiar chave"
                            >
                              {isCopied ? (
                                <CheckIcon className="h-3 w-3 text-green-600" />
                              ) : (
                                <ClipboardIcon className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        )}
                        {div.campo && !isExpanded && (
                          <p className="text-xs text-gray-500"><span className="font-medium">Campo:</span> {div.campo}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {div.valor1 !== undefined && div.valor2 !== undefined && (
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Diferença</p>
                          <p className={`text-sm font-bold ${
                            Math.abs(div.diferenca || 0) > 100 ? 'text-red-600' : 'text-gray-900'
                          }`}>
                            {formatCurrency(Math.abs(div.diferenca || 0))}
                          </p>
                        </div>
                      )}
                      <button
                        data-no-expand
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(index);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title={isExpanded ? "Recolher" : "Expandir"}
                      >
                        {isExpanded ? (
                          <ChevronUpIcon className="h-5 w-5" />
                        ) : (
                          <ChevronDownIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                  {div.legítima && div.dadosOriginais?.MOTIVO_LEGITIMO && !isExpanded && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                      <span className="font-semibold">Legítima:</span> {div.dadosOriginais.MOTIVO_LEGITIMO.substring(0, 80)}...
                    </div>
                  )}
                </div>

                {/* Conteúdo expandível */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    <div className="p-4 space-y-3">
                    {/* Solução Implementável ou Recomendação */}
                    {(() => {
                      const dadosOriginais = div.dadosOriginais || div;
                      // Verificar se tem solução automática (verificação mais robusta)
                      const solucaoAutomatica = dadosOriginais.SOLUCAO_AUTOMATICA;
                      const registroCorrigir = dadosOriginais.REGISTRO_CORRIGIR;
                      const valorCorreto = dadosOriginais.VALOR_CORRETO;
                      
                      const temSolucaoAutomatica = solucaoAutomatica && 
                                                   solucaoAutomatica !== '' &&
                                                   solucaoAutomatica !== 'null' &&
                                                   solucaoAutomatica !== 'undefined' &&
                                                   solucaoAutomatica !== 'None' &&
                                                   solucaoAutomatica !== 'nan' &&
                                                   registroCorrigir && 
                                                   registroCorrigir !== '' &&
                                                   registroCorrigir !== 'NENHUM' &&
                                                   valorCorreto !== undefined &&
                                                   valorCorreto !== null;
                      const correcaoAplicada = correcoesAplicadas.has(index);
                      
                      if (temSolucaoAutomatica) {
                        return (
                          <>
                            <div className="p-3 bg-white rounded border border-gray-200">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Instrução de Correção:</p>
                              <p className="text-xs text-gray-600 whitespace-pre-line">
                                {String(solucaoAutomatica || '').trim()}
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <span className="font-medium text-gray-600">Registro:</span>
                                <span className="ml-1 font-mono text-blue-600">{String(registroCorrigir || '').trim()}</span>
                              </div>
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <span className="font-medium text-gray-600">Campo:</span>
                                <span className="ml-1 font-mono text-blue-600">{String(dadosOriginais.CAMPO || dadosOriginais.CAMPO_CORRIGIR || '').trim()}</span>
                              </div>
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <span className="font-medium text-gray-600">Atual SPED:</span>
                                <span className="ml-1 text-red-600 font-semibold">
                                  {formatCurrency(div.valor2 || 0)}
                                </span>
                              </div>
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-medium text-gray-600">Correto:</span>
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded" title="Valor extraído do XML da NF-e">
                                    XML
                                  </span>
                                </div>
                                <span className="ml-1 text-green-600 font-semibold">
                                  {formatCurrency(valorCorreto || 0)}
                                </span>
                              </div>
                            </div>
                            
                            {correcaoAplicada ? (
                              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                                  <p className="text-sm text-green-800 font-medium">
                                    Correção aplicada com sucesso
                                  </p>
                                </div>
                              </div>
                            ) : validationId ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  aplicarCorrecao(index, div);
                                }}
                                disabled={aplicandoCorrecao === index}
                                className="w-full py-2.5 px-4 bg-orange-600 text-white font-medium text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {aplicandoCorrecao === index ? (
                                  <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                    <span>Aplicando...</span>
                                  </>
                                ) : (
                                  <>
                                    <WrenchScrewdriverIcon className="h-4 w-4" />
                                    <span>Aplicar Correção</span>
                                  </>
                                )}
                              </button>
                            ) : null}
                          </>
                        );
                      } else {
                        // Se for legítima, mostrar motivo de forma destacada
                        if (div.legítima && div.dadosOriginais?.MOTIVO_LEGITIMO) {
                          return (
                            <div className="p-4 rounded-lg bg-green-50 border-2 border-green-500">
                              <div className="flex items-start gap-3">
                                <CheckCircleIcon className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <h4 className="font-bold text-lg text-green-900 mb-3">
                                    ✅ Divergência Legítima - Não Requer Correção
                                  </h4>
                                  
                                  {/* Tipo de Operação */}
                                  {div.tipoOperacao && (
                                    <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                                      <p className="text-xs font-semibold text-blue-900 mb-1">Tipo de Operação:</p>
                                      <p className="text-sm font-mono text-blue-700">{div.tipoOperacao}</p>
                                    </div>
                                  )}
                                  
                                  <div className="bg-white p-4 rounded border border-green-200 mb-4">
                                    <p className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                                      <InformationCircleIcon className="h-5 w-5" />
                                      Por que esta divergência é considerada legítima:
                                    </p>
                                    <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                                      {/* Dividir o motivo em parágrafos se tiver múltiplas explicações */}
                                      {div.dadosOriginais.MOTIVO_LEGITIMO.split('. ').map((sentenca, idx) => {
                                        if (!sentenca.trim()) return null;
                                        // Destacar explicações numeradas
                                        const isNumered = /^\(\d+\)/.test(sentenca.trim());
                                        return (
                                          <p key={idx} className={isNumered ? "ml-4 pl-2 border-l-2 border-green-300" : ""}>
                                            {sentenca.trim()}
                                            {!sentenca.endsWith('.') && '.'}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  
                                  {/* Valores específicos para contexto */}
                                  {div.valor1 !== undefined && div.valor2 !== undefined && (
                                    <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                                      <div className="bg-blue-50 p-3 rounded border-2 border-blue-200">
                                        <div className="flex items-center gap-2 mb-2">
                                          <p className="font-semibold text-blue-900">C170</p>
                                          <span className="px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded" title="Valor extraído do XML da NF-e">
                                            XML
                                          </span>
                                        </div>
                                        <p className="text-xl font-bold text-blue-700">{formatCurrency(div.valor1)}</p>
                                        <p className="text-xs text-blue-600 mt-1 font-medium">✓ Valor correto (do XML)</p>
                                      </div>
                                      <div className="bg-gray-50 p-3 rounded border border-gray-300">
                                        <div className="flex items-center gap-2 mb-2">
                                          <p className="font-semibold text-gray-700">C190</p>
                                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded" title="Valor atual no SPED Fiscal">
                                            SPED
                                          </span>
                                        </div>
                                        <p className="text-xl font-bold text-orange-600">{formatCurrency(div.valor2)}</p>
                                        <p className="text-xs text-gray-600 mt-1">Valor a ser corrigido</p>
                                      </div>
                                    </div>
                                  )}
                                  {div.recomendacao.referenciaLegal && (
                                    <div className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
                                      {/* Header clicável */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRefLegal(index);
                                        }}
                                        className="w-full p-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                                      >
                                        <p className="font-semibold text-gray-900 text-xs flex items-center gap-2">
                                          📚 Referência Legal
                                        </p>
                                        {expandedRefs.has(index) ? (
                                          <ChevronUpIcon className="h-4 w-4 text-gray-600" />
                                        ) : (
                                          <ChevronDownIcon className="h-4 w-4 text-gray-600" />
                                        )}
                                      </button>
                                      
                                      {/* Conteúdo colapsável */}
                                      {expandedRefs.has(index) && (
                                        <div className="px-3 pb-3 text-xs text-gray-700 space-y-1">
                                          <p className="mb-1">
                                            <span className="font-medium">Artigo/Norma:</span> {div.recomendacao.referenciaLegal.artigo}
                                          </p>
                                          <p className="mb-1">
                                            <span className="font-medium">Norma:</span> {div.recomendacao.referenciaLegal.norma}
                                          </p>
                                          <p>
                                            <span className="font-medium">Prazo:</span> {div.recomendacao.referenciaLegal.prazo}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        // Fallback para recomendações genéricas (quando não há solução automática)
                        return (
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
                        );
                      }
                    })()}

                    {/* Referência Legal (Colapsável) */}
                    {div.recomendacao.referenciaLegal && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
                        {/* Header clicável */}
                        <button
                          onClick={() => toggleRefLegal(index)}
                          className="w-full p-4 flex items-center justify-between hover:bg-blue-100 transition-colors"
                        >
                          <h5 className="font-semibold text-blue-900 flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5" />
                            Referência Legal
                          </h5>
                          {expandedRefs.has(index) ? (
                            <ChevronUpIcon className="h-5 w-5 text-blue-600" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5 text-blue-600" />
                          )}
                        </button>
                        
                        {/* Conteúdo colapsável */}
                        {expandedRefs.has(index) && (
                          <div className="px-4 pb-4 text-sm text-blue-800 space-y-1">
                            <p><span className="font-medium">Artigo/Norma:</span> {div.recomendacao.referenciaLegal.artigo}</p>
                            <p><span className="font-medium">Norma:</span> {div.recomendacao.referenciaLegal.norma}</p>
                            <p><span className="font-medium">Prazo para correção:</span> {div.recomendacao.referenciaLegal.prazo}</p>
                            {div.recomendacao.referenciaLegal.penalidade && (
                              <p className="text-red-700">
                                <span className="font-medium">⚠️ Penalidade:</span> {div.recomendacao.referenciaLegal.penalidade}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Valores comparativos */}
                    {div.valor1 !== undefined && div.valor2 !== undefined && (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-blue-50 p-3 rounded border border-blue-200">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-blue-900 font-semibold">
                              {div.categoria === 'C170 x C190' ? 'C170 (Itens)' : 'XML'}
                            </p>
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded" title="Valor do XML da NF-e">
                              XML
                            </span>
                          </div>
                          <p className="text-lg font-bold text-blue-700">
                            {formatCurrency(div.valor1 || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded border border-gray-200">
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

