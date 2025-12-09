/**
 * COMPONENTE: Conferência de Divergências de Valores
 * 
 * Exibe divergências de valores agrupadas por Chave de NF.
 * Ao expandir cada chave, mostra os motivos das divergências.
 * 
 * Usado dentro do módulo SPED como uma aba interna.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { Pagination } from '../Pagination';
import { exportToExcel } from '../../utils/exportExcel';

export interface DivergenciaValor {
  chaveNf: string;
  motivo: string;
  campo?: string;
  valorEsperado?: string; // SPED
  valorEncontrado?: string; // XML
  valorDelta?: number; // Diferença numérica
  severidade: 'high' | 'medium' | 'low';
  categoria?: string;
  descricao?: string;
}

export interface DivergenciaPorChave {
  chaveNf: string;
  totalDivergencias: number;
  divergencias: DivergenciaValor[];
  severidadeMaxima: 'high' | 'medium' | 'low';
}

interface Props {
  divergencias: any[]; // Divergências no formato do SPED
  notesDf?: any[]; // DataFrame de notas com colunas Delta (opcional, usado para divergências de valores)
}

function formatChaveNF(chave: string): string {
  if (!chave) return '—';
  // Formatar chave de NF-e (44 dígitos): agrupar em blocos para melhor leitura
  const digits = chave.replace(/\D/g, '');
  if (digits.length === 44) {
    return `${digits.substring(0, 4)} ${digits.substring(4, 8)} ${digits.substring(8, 12)} ${digits.substring(12, 16)} ${digits.substring(16, 20)} ${digits.substring(20, 24)} ${digits.substring(24, 28)} ${digits.substring(28, 32)} ${digits.substring(32, 36)} ${digits.substring(36, 40)} ${digits.substring(40, 44)}`;
  }
  return chave;
}

function SeverityTag({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const labels = {
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

function DivergenciaRow({ divergencia }: { divergencia: DivergenciaValor }) {
  const delta = divergencia.valorDelta;
  const isPositive = delta !== undefined && delta !== null && delta > 0;
  const deltaFormatado = delta !== undefined && delta !== null ? formatarValor(delta) : '—';

  return (
    <div className="pl-6 pr-4 py-3 border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors grid grid-cols-4 gap-4 items-center">
      {/* Campo */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <SeverityTag severity={divergencia.severidade} />
        <span className="text-sm font-semibold text-gray-700">
          {divergencia.campo}
        </span>
      </div>

      {/* XML */}
      <div className="min-w-[150px]">
        <p className="text-sm font-mono font-semibold text-gray-900">
          {divergencia.valorEncontrado || '—'}
        </p>
      </div>

      {/* SPED */}
      <div className="min-w-[150px]">
        <p className="text-sm font-mono font-semibold text-gray-900">
          {divergencia.valorEsperado || '—'}
        </p>
      </div>

      {/* Diferença */}
      <div className="min-w-[180px]">
        {delta !== undefined && delta !== null ? (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            isPositive ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
          }`}>
            <span className={`text-sm font-mono font-bold ${
              isPositive ? 'text-red-700' : 'text-blue-700'
            }`}>
              {isPositive ? '+' : ''}{deltaFormatado}
            </span>
            <span className="text-xs text-gray-600">
              ({isPositive ? 'XML maior' : 'SPED maior'})
            </span>
          </div>
        ) : (
          <p className="text-sm font-mono text-gray-500">—</p>
        )}
      </div>
    </div>
  );
}

/**
 * Campos de valores que devem ser verificados
 */
const CAMPOS_VALORES = [
  { nome: 'Total (vNF)', xml: 'XML_vNF', sped: 'SPED_VL_DOC', delta: 'Delta vNF' },
  { nome: 'Frete', xml: 'XML_vFrete', sped: 'SPED_VL_FRT', delta: 'Delta Frete' },
  { nome: 'Desconto', xml: 'XML_vDesc', sped: 'SPED_VL_DESC', delta: 'Delta Desconto' },
  { nome: 'BC ICMS', xml: 'XML_vBC', sped: 'SPED_vBC (C190)', delta: 'Delta Base ICMS' },
  { nome: 'ICMS', xml: 'XML_vICMS', sped: 'SPED_vICMS (C190)', delta: 'Delta ICMS' },
  { nome: 'BC ST', xml: 'XML_vBCST', sped: 'SPED_vBCST (C190)', delta: 'Delta Base ST' },
  { nome: 'ST', xml: 'XML_vST', sped: 'SPED_vST (C190)', delta: 'Delta ST' },
  { nome: 'IPI', xml: 'XML_vIPI', sped: 'SPED_vIPI (C190)', delta: 'Delta IPI' },
];

/**
 * Verifica se um valor delta indica divergência (tolerância de 0.02)
 */
function temDivergencia(delta: any): boolean {
  if (delta === null || delta === undefined || delta === '') return false;
  try {
    const valor = typeof delta === 'string' ? parseFloat(delta) : delta;
    if (isNaN(valor)) return false;
    return Math.abs(valor) > 0.02;
  } catch {
    return false;
  }
}

/**
 * Formata valor monetário
 */
function formatarValor(valor: any): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  try {
    const num = typeof valor === 'string' ? parseFloat(valor) : valor;
    if (isNaN(num)) return String(valor);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num);
  } catch {
    return String(valor);
  }
}

/**
 * Converte dados do notes_df (DataFrame de notas) para divergências de valores
 */
function converterDivergenciasDeValores(notesDf: any[]): DivergenciaValor[] {
  const divergencias: DivergenciaValor[] = [];

  for (const nota of notesDf) {
    const chaveNf = nota.CHAVE || nota['Chave NF-e'] || nota.chaveNf || '';
    if (!chaveNf) continue;

    // Verificar cada campo de valor
    for (const campo of CAMPOS_VALORES) {
      const delta = nota[campo.delta];
      
      if (temDivergencia(delta)) {
        const valorXML = nota[campo.xml];
        const valorSPED = nota[campo.sped];
        const deltaNum = typeof delta === 'string' ? parseFloat(delta) : delta;

        // Determinar severidade baseado na magnitude da diferença
        let severidade: 'high' | 'medium' | 'low' = 'medium';
        const absDelta = Math.abs(deltaNum);
        if (absDelta > 1000) {
          severidade = 'high';
        } else if (absDelta > 100) {
          severidade = 'medium';
        } else {
          severidade = 'low';
        }

        divergencias.push({
          chaveNf,
          motivo: `Divergência em ${campo.nome}`,
          campo: campo.nome,
          valorEsperado: formatarValor(valorSPED),
          valorEncontrado: formatarValor(valorXML),
          valorDelta: deltaNum,
          severidade,
          categoria: 'Diferença de valores',
          descricao: `Diferença de ${formatarValor(deltaNum)} (${deltaNum > 0 ? 'XML maior' : 'SPED maior'})`,
        });
      }
    }
  }

  return divergencias;
}

/**
 * Agrupa divergências por chave de NF
 */
function agruparPorChave(divergencias: DivergenciaValor[]): DivergenciaPorChave[] {
  const agrupadas = new Map<string, DivergenciaValor[]>();

  // Agrupar por chave
  for (const divergencia of divergencias) {
    const chave = divergencia.chaveNf || 'SEM_CHAVE';
    if (!agrupadas.has(chave)) {
      agrupadas.set(chave, []);
    }
    agrupadas.get(chave)!.push(divergencia);
  }

  // Converter para array e calcular totais
  const resultado: DivergenciaPorChave[] = [];
  for (const [chave, divs] of agrupadas.entries()) {
    const severidades = divs.map(d => d.severidade);
    let severidadeMaxima: 'high' | 'medium' | 'low' = 'low';
    if (severidades.includes('high')) severidadeMaxima = 'high';
    else if (severidades.includes('medium')) severidadeMaxima = 'medium';

    resultado.push({
      chaveNf: chave,
      totalDivergencias: divs.length,
      divergencias: divs,
      severidadeMaxima,
    });
  }

  // Ordenar por severidade (high primeiro) e depois por total de divergências
  resultado.sort((a, b) => {
    const severidadeOrder = { high: 3, medium: 2, low: 1 };
    const severidadeDiff = severidadeOrder[b.severidadeMaxima] - severidadeOrder[a.severidadeMaxima];
    if (severidadeDiff !== 0) return severidadeDiff;
    return b.totalDivergencias - a.totalDivergencias;
  });

  return resultado;
}

const DivergenciasValoresConferencia: React.FC<Props> = ({ divergencias, notesDf }) => {
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [expandedChaves, setExpandedChaves] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [copiedChave, setCopiedChave] = useState<string | null>(null);
  const itensPorPagina = 10;

  const copyToClipboard = async (text: string, chave: string) => {
    try {
      // Tenta usar a API moderna de clipboard
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos não-seguros (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedChave(chave);
      setTimeout(() => setCopiedChave(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  // Converter e agrupar divergências
  // Priorizar notesDf se disponível (contém as colunas Delta)
  let divergenciasConvertidas: DivergenciaValor[] = [];
  
  if (notesDf && notesDf.length > 0) {
    // Usar notesDf para extrair divergências de valores
    divergenciasConvertidas = converterDivergenciasDeValores(notesDf);
  } else {
    // Fallback: tentar converter das divergências padrão
    divergenciasConvertidas = divergencias
      .filter((div: any) => {
        // Filtrar apenas divergências de valores
        const categoria = (div.Categoria || div.categoria || '').toLowerCase();
        return categoria.includes('valor') || categoria.includes('diferença');
      })
      .map((div: any) => {
        const chaveNf = div['Chave NF-e'] || div.CHAVE || div.chaveNf || '';
        const campo = div.Campo || div.campo || '';
        const valorXML = div['No XML'] || div.valorEncontrado || '';
        const valorSPED = div['No SPED'] || div.valorEsperado || '';
        
        let severidade: 'high' | 'medium' | 'low' = 'medium';
        const severidadeSPED = (div.Severidade || div.severidade || '').toLowerCase();
        if (severidadeSPED.includes('alta') || severidadeSPED === 'high') {
          severidade = 'high';
        } else if (severidadeSPED.includes('baixa') || severidadeSPED === 'low') {
          severidade = 'low';
        }

        // Tentar calcular diferença se possível
        let valorDelta: number | undefined = undefined;
        try {
          const xmlNum = typeof valorXML === 'string' ? parseFloat(valorXML.replace(/[^\d.,-]/g, '').replace(',', '.')) : valorXML;
          const spedNum = typeof valorSPED === 'string' ? parseFloat(valorSPED.replace(/[^\d.,-]/g, '').replace(',', '.')) : valorSPED;
          if (!isNaN(xmlNum) && !isNaN(spedNum)) {
            valorDelta = xmlNum - spedNum;
          }
        } catch {
          // Ignorar erro de conversão
        }

        return {
          chaveNf,
          motivo: `Divergência em ${campo}`,
          campo,
          valorEsperado: formatarValor(valorSPED),
          valorEncontrado: formatarValor(valorXML),
          valorDelta,
          severidade,
          categoria: div.Categoria || div.categoria || 'Diferença de valores',
          descricao: div.Descrição || div.Descricao || div.descricao || '',
        };
      });
  }
  
  const divergenciasAgrupadas = agruparPorChave(divergenciasConvertidas);

  const toggleChave = (chave: string) => {
    setExpandedChaves((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
      } else {
        next.add(chave);
      }
      return next;
    });
  };

  const expandAllChaves = () => {
    const todasChaves = divergenciasAgrupadas.map((d) => d.chaveNf);
    setExpandedChaves(new Set(todasChaves));
  };

  const collapseAllChaves = () => {
    setExpandedChaves(new Set());
  };

  const handleExportar = async () => {
    if (divergenciasAgrupadas.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      setExporting(true);
      const data: any[] = [];
      
      divergenciasAgrupadas.forEach((divergenciaPorChave) => {
        divergenciaPorChave.divergencias.forEach((divergencia) => {
          const diffValue = divergencia.valorDelta !== undefined && divergencia.valorDelta !== null
            ? formatarValor(divergencia.valorDelta)
            : '—';
          
          data.push([
            formatChaveNF(divergenciaPorChave.chaveNf),
            divergencia.campo || '—',
            divergencia.valorEncontrado || '—', // XML
            divergencia.valorEsperado || '—', // SPED
            diffValue, // Diferença
            divergencia.severidade === 'high' ? 'Alta' : divergencia.severidade === 'medium' ? 'Média' : 'Baixa',
            divergencia.descricao || '—',
          ]);
        });
      });

      await exportToExcel({
        filename: `divergencias-valores-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Divergências de Valores',
        headers: [
          'Chave NF',
          'Campo',
          'Valor XML',
          'Valor SPED',
          'Diferença',
          'Severidade',
          'Descrição',
        ],
        data,
        title: 'Divergências de Valores por Chave de NF',
        metadata: {
          'Data de Exportação': new Date().toLocaleString('pt-BR'),
          'Total de Chaves': divergenciasAgrupadas.length.toString(),
          'Total de Divergências': divergenciasAgrupadas.reduce((sum, d) => sum + d.totalDivergencias, 0).toString(),
        },
      });
    } catch (err: any) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar dados: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  const totalDivergencias = divergenciasAgrupadas.reduce((sum, d) => sum + d.totalDivergencias, 0);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2 mb-2">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
            Conferência de Divergências de Valores
          </h3>
          <p className="text-sm text-gray-600">
            Diferenças de valores (Total/Frete/Desconto/BC ICMS/ICMS/BC ST/ST/IPI via C190) agrupadas por Chave de NF.
            <br />
            Expanda cada chave para ver a comparação XML vs SPED com as diferenças.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-gray-700 bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
            {divergenciasAgrupadas.length} chave(s) • {totalDivergencias} divergência(s)
          </div>
          {divergenciasAgrupadas.length > 0 && (
            <motion.button
              onClick={handleExportar}
              disabled={exporting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar para Excel"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              {exporting ? 'Exportando...' : 'Exportar'}
            </motion.button>
          )}
        </div>
      </div>

      {divergenciasAgrupadas.length === 0 ? (
        <div className="text-center py-12">
          <InformationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">
            Nenhuma divergência de valores encontrada.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Todas as notas fiscais estão com valores corretos.
          </p>
        </div>
      ) : (
        <>
          {/* Controles de expansão */}
          <div className="mb-4 pb-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={expandAllChaves}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
              >
                Expandir Todas
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={collapseAllChaves}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                Recolher Todas
              </button>
            </div>
          </div>

          {/* Lista de divergências por chave */}
          <div className="divide-y divide-gray-200">
            {divergenciasAgrupadas
              .slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina)
              .map((divergenciaPorChave) => {
                const isExpanded = expandedChaves.has(divergenciaPorChave.chaveNf);
                return (
                  <div key={divergenciaPorChave.chaveNf} className="bg-white">
                    {/* Cabeçalho da chave */}
                    <div
                      onClick={() => toggleChave(divergenciaPorChave.chaveNf)}
                      className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                        )}
                        <DocumentTextIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-mono font-semibold text-gray-900">
                              {formatChaveNF(divergenciaPorChave.chaveNf)}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(divergenciaPorChave.chaveNf, divergenciaPorChave.chaveNf);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="Copiar chave de NF"
                            >
                              {copiedChave === divergenciaPorChave.chaveNf ? (
                                <CheckIcon className="h-4 w-4 text-green-600" />
                              ) : (
                                <ClipboardDocumentIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {divergenciaPorChave.totalDivergencias} divergência(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <SeverityTag severity={divergenciaPorChave.severidadeMaxima} />
                      </div>
                    </div>

                    {/* Divergências da chave */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-200">
                        {/* Cabeçalho da tabela */}
                        <div className="pl-6 pr-4 py-2 bg-white border-b border-gray-300 grid grid-cols-4 gap-4 text-xs font-semibold text-gray-700">
                          <div className="min-w-[120px]">CAMPO</div>
                          <div className="min-w-[150px]">XML</div>
                          <div className="min-w-[150px]">SPED</div>
                          <div className="min-w-[180px]">DIFERENÇA</div>
                        </div>
                        {divergenciaPorChave.divergencias.map((divergencia, index) => (
                          <DivergenciaRow key={index} divergencia={divergencia} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Paginação */}
          {divergenciasAgrupadas.length > itensPorPagina && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <Pagination
                currentPage={paginaAtual}
                totalPages={Math.ceil(divergenciasAgrupadas.length / itensPorPagina)}
                totalItems={divergenciasAgrupadas.length}
                itemsPerPage={itensPorPagina}
                onPageChange={setPaginaAtual}
                itemLabel="chave"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DivergenciasValoresConferencia;

