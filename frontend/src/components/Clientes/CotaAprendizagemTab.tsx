import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import cotaAprendizagemService, {
  type Classificacao,
  type TipoAviso,
  type ResultadoEnvio,
  type HistoricoCliente,
  type Porte,
  type Diagnostico,
} from '../../services/cotaAprendizagem';
import LoadingSpinner from '../UI/LoadingSpinner';
import Alert from '../UI/Alert';

/**
 * Aba "Cota de Aprendizagem" — quem está sujeito à cota (LC 123/2006 art. 3º +
 * IN SIT/MTE 146/2018 art. 3º, I).
 *
 * A tela precisa deixar claras três coisas que se confundem facilmente:
 *   1. Mudança que JÁ vale (regra dos 20%) × mudança programada para 1º/jan.
 *   2. "Isenta" × "não foi possível concluir" — cliente sem faturamento
 *      completo NÃO é cliente isento.
 *   3. Porte apurado por nós × porte declarado na Receita, que divergem com
 *      frequência e não devem ser "corrigidos" um pelo outro.
 */

const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const LIMITE_ME = 360_000;
const LIMITE_EPP = 4_800_000;
const LIMITE_20PCT = 5_760_000;

/** Peso visual do marco: quanto mais grave, mais forte o destaque da linha. */
export type Gravidade = 'critico' | 'alerta' | 'aviso' | null;

interface MesHistorico {
  ano: number;
  mes: number;
  bdref: number;
  faturamento: number;
  acumulado: number;
  /** Rótulo do limite cruzado NESTE mês, se houve. */
  marco: string | null;
  gravidade: Gravidade;
}

/**
 * Agrupa o faturamento por ano — ano mais recente em cima e, dentro dele, mês
 * mais recente em cima — calculando o acumulado do ano mês a mês.
 *
 * O acumulado é o que importa de verdade: é ele que a lei compara com os
 * limites, e é ao cruzar R$ 5.760.000,00 que a empresa passa a dever a cota já
 * no mês seguinte. Por isso cada mês marca qual limite foi ultrapassado nele.
 *
 * Atenção à ordem: o acumulado só faz sentido somando de janeiro para frente,
 * então ele é calculado em ordem CRESCENTE e a lista é invertida só no final,
 * para exibição. Inverter antes produziria um acumulado ao contrário.
 */
export function agruparPorAno(
  faturamento: Array<{ ano: number; mes: number; bdref: number; faturamento: number }>,
  /**
   * Porte por ano — decide QUAIS limites merecem aviso em cada ano. Uma EPP não
   * deve ser avisada de que passou de R$ 360 mil: esse valor está dentro da
   * faixa dela. Quem já é Demais não recebe aviso de limite nenhum.
   *
   * É por ano porque o porte muda entre exercícios: a mesma empresa pode ter
   * sido EPP em 2025 e Demais em 2026, e cada ano deve ser lido com a régua
   * que valia nele.
   */
  portePorAno?: Map<number, Porte>
): Array<{ ano: number; total: number; meses: MesHistorico[] }> {
  const porAno = new Map<number, typeof faturamento>();
  for (const f of faturamento) {
    if (!porAno.has(f.ano)) porAno.set(f.ano, []);
    porAno.get(f.ano)!.push(f);
  }

  return [...porAno.keys()]
    .sort((a, b) => b - a) // ano mais recente primeiro
    .map((ano) => {
      // Sem porte conhecido para o ano, NÃO marca limite nenhum. Assumir o
      // porte mais baixo faria uma EPP receber "passou de R$ 360 mil" em anos
      // antigos — um aviso que nunca valeu para ela. Silêncio é preferível a
      // afirmação errada.
      const porte = portePorAno?.get(ano) ?? 'SEM_DADOS';
      const avisaME = porte === 'ME';
      const avisaEPP = porte === 'ME' || porte === 'EPP';
      // Quem já entrou o ano como Demais não tem transição a anunciar, mas o
      // mês em que o acumulado passou do teto de EPP continua sendo o dado que
      // confirma o enquadramento — só muda a redação, de previsão para
      // constatação.
      const jaDemais = porte === 'DEMAIS';
      const ordenados = [...porAno.get(ano)!].sort((a, b) => a.mes - b.mes);
      let acumulado = 0;
      const meses: MesHistorico[] = ordenados.map((f) => {
        const anterior = acumulado;
        acumulado += f.faturamento;
        let marco: string | null = null;
        let gravidade: Gravidade = null;
        if (avisaEPP && anterior <= LIMITE_20PCT && acumulado > LIMITE_20PCT) {
          marco = 'passou de R$ 5,76 mi — vira Demais no mês seguinte';
          gravidade = 'critico';
        } else if (avisaEPP && anterior <= LIMITE_EPP && acumulado > LIMITE_EPP) {
          marco = 'passou de R$ 4,8 mi — vira Demais em 1º de janeiro';
          gravidade = 'alerta';
        } else if (avisaME && anterior <= LIMITE_ME && acumulado > LIMITE_ME) {
          marco = 'passou de R$ 360 mil — vira EPP em 1º de janeiro';
          gravidade = 'aviso';
        } else if (jaDemais && anterior <= LIMITE_EPP && acumulado > LIMITE_EPP) {
          // Para quem já é Demais, "passou do teto de EPP" não diz nada: ela
          // nunca foi EPP, e o teto dessa faixa não é régua dela. O que este
          // mês responde é outra pergunta — a única em aberto para uma Demais:
          // ela continua Demais no ano que vem? Como receita só acumula, cruzar
          // R$ 4,8 mi aqui já fecha o ano acima do limite.
          marco = `o ano já passou de R$ 4,8 mi — segue Demais em ${ano + 1}`;
          gravidade = 'aviso';
        }
        return {
          ano: f.ano,
          mes: f.mes,
          bdref: f.bdref,
          faturamento: f.faturamento,
          acumulado,
          marco,
          gravidade,
        };
      });
      // Só agora inverte: o mês mais recente vai para o topo, para o aviso de
      // limite ultrapassado aparecer de cara, sem rolar a lista.
      return { ano, total: acumulado, meses: meses.reverse() };
    });
}

function formatCNPJ(cnpj: string): string {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function labelCompetencia(bdref: number | null): string {
  if (!bdref) return '—';
  const ano = Math.floor(bdref / 100);
  const mes = bdref % 100;
  return `${MESES[mes - 1]}/${ano}`;
}

function moeda(v: number | null): string {
  return v === null || v === undefined ? '—' : brl.format(v);
}

function dataBr(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const CORES_PORTE: Record<Porte, string> = {
  ME: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  EPP: 'bg-sky-100 text-sky-800 border-sky-200',
  DEMAIS: 'bg-red-100 text-red-800 border-red-200',
  SEM_DADOS: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ROTULO_PORTE: Record<Porte, string> = {
  ME: 'ME',
  EPP: 'EPP',
  DEMAIS: 'Demais',
  SEM_DADOS: 'Sem dados',
};

/**
 * O motivo é gravado como código no banco (estável, pesquisável); na tela vira
 * frase. Quem lê está conferindo obrigação fiscal, não depurando o sistema.
 */
const ROTULO_MOTIVO: Record<string, string> = {
  RBAA: 'Receita do ano anterior',
  EXCESSO_20PCT: 'Excedeu os 20%',
  SEM_DADOS: 'Sem dados suficientes',
};

const DESCRICAO_MOTIVO: Record<string, string> = {
  RBAA: 'Porte definido pela receita bruta acumulada do ano anterior (LC 123/2006, art. 3º).',
  EXCESSO_20PCT:
    'A receita do ano corrente passou de R$ 5.760.000,00 — mais de 20% acima do limite de EPP. Pelo art. 3º §9º-A, o enquadramento cai ainda dentro do ano, a partir do mês seguinte ao excesso.',
  SEM_DADOS: 'Não houve faturamento suficiente para concluir o enquadramento.',
};

export function rotuloMotivo(motivo: string): string {
  return ROTULO_MOTIVO[motivo] ?? motivo;
}

/**
 * Selos da coluna de ressalvas. Cada um diz o que foi detectado e por que
 * merece conferência — nenhum deles altera a classificação sozinho.
 */
export const SELO_REVISAO: Record<
  string,
  { rotulo: string; classe: string; descricao: string }
> = {
  SOCIO_PJ: {
    rotulo: 'sócio PJ',
    classe: 'bg-purple-100 text-purple-800 border-purple-200',
    descricao:
      'Há uma empresa (pessoa jurídica) no quadro de sócios. Isso derruba o enquadramento como ME ou EPP mesmo que a receita esteja dentro do limite — LC 123/2006, art. 3º §4º, I. Confirme o quadro societário antes de decidir.',
  },
  SIMPLES_ACIMA_TETO: {
    rotulo: 'Simples acima do teto',
    classe: 'bg-orange-100 text-orange-800 border-orange-200',
    descricao:
      'O cadastro diz Simples Nacional, mas a receita apurada passou de R$ 4,8 milhões — e o teto do Simples é justamente esse. Ou o regime no cadastro está desatualizado, ou o faturamento veio do lugar errado. Os dois casos mudam a conclusão.',
  },
  INICIO_ATIVIDADE: {
    rotulo: 'limite proporcional',
    classe: 'bg-sky-100 text-sky-800 border-sky-200',
    descricao:
      'Empresa aberta neste ano. O limite é proporcional aos meses de atividade (LC 123/2006, art. 3º §2º), então o teto cheio não vale — confira manualmente.',
  },
  RECEITA_ZERADA_ANTERIOR: {
    rotulo: 'ano anterior zerado',
    classe: 'bg-rose-100 text-rose-800 border-rose-200',
    descricao:
      'O SCI devolveu R$ 0,00 no ano anterior inteiro, mas a empresa já existia. E é a receita do ano anterior que define o porte: zerada, ela cai em ME — isto é, isenta. Pode ser cliente que entrou no escritório depois, ou código SCI trocado. Confira se o faturamento existe.',
  },
  RECEITA_ZERADA_CORRENTE: {
    rotulo: 'ano atual zerado',
    classe: 'bg-rose-100 text-rose-800 border-rose-200',
    descricao:
      'Faturou no ano anterior, mas todos os meses deste ano vieram do SCI com R$ 0,00. Empresa que parou é possível — mas é assim também que aparece um faturamento que o SCI ainda não tem.',
  },
  SEM_FATURAMENTO_SCI: {
    rotulo: 'sem faturamento no SCI',
    classe: 'bg-slate-100 text-slate-700 border-slate-300',
    descricao:
      'Nenhum faturamento nos dois anos, e a empresa já existia antes. O porte ME sai da ausência de receita, não de receita apurada — pode ser cliente que ainda não tem movimento lançado no SCI. É cobertura de dados, não dúvida de classificação.',
  },
  MATRIZ_NAO_CADASTRADA: {
    rotulo: 'matriz não cadastrada',
    classe: 'bg-amber-100 text-amber-800 border-amber-200',
    descricao:
      'A empresa é filial e a matriz dela não está no cadastro. O faturamento consultado no SCI pelo código de uma filial traz só aquele estabelecimento — o total da pessoa jurídica é maior, e o porte pode estar subestimado. Cadastrar a matriz resolve.',
  },
};

/**
 * Porte declarado na Receita → o mesmo vocabulário do porte apurado.
 *
 * A RFB grava por extenso ("EMPRESA DE PEQUENO PORTE"); o apurado é sigla.
 * Sem normalizar, comparar os dois exigiria que o leitor traduzisse de cabeça.
 * Valor desconhecido volta `null` — melhor mostrar "—" do que forçar uma
 * equivalência que não existe.
 */
export function normalizarPorteDeclarado(texto: string | null): Porte | null {
  const t = (texto || '').trim().toUpperCase();
  if (!t) return null;
  if (t.includes('MICRO')) return 'ME';
  if (t.includes('PEQUENO')) return 'EPP';
  if (t.includes('DEMAIS')) return 'DEMAIS';
  return null;
}

/** Faixa de porte por receita — mesma regra do backend (LC 123 art. 3º). */
function porteDaReceita(valor: number): Porte {
  if (valor <= LIMITE_ME) return 'ME';
  if (valor <= LIMITE_EPP) return 'EPP';
  return 'DEMAIS';
}

/**
 * Porte vigente em cada ano do histórico, para o agrupamento saber que régua
 * usar em cada exercício.
 *
 * Duas fontes, nesta ordem:
 *
 *  1. A classificação gravada — fonte de verdade, mas só existe para as
 *     competências já apuradas (em geral o ano corrente).
 *  2. Derivação pela receita do ano ANTERIOR, que é o que define o porte do
 *     ano (a RBAA). Cobre os anos históricos que nunca foram apurados.
 *
 * Ano sem nenhuma das duas fica FORA do mapa de propósito — e sem porte
 * conhecido o agrupamento não marca limite nenhum. Assumir "ME" por omissão
 * fazia uma EPP receber "passou de R$ 360 mil" em anos antigos: um aviso que
 * nunca valeu para ela.
 */
export function portePorAno(historico: HistoricoCliente): Map<number, Porte> {
  const mapa = new Map<number, Porte>();

  // 1. Classificação gravada — a do mês mais alto é a que vale no exercício.
  const maisRecentePorAno = new Map<number, { mes: number; porte: Porte }>();
  for (const c of historico.classificacoes) {
    const atual = maisRecentePorAno.get(c.ano);
    if (!atual || c.mes > atual.mes) {
      maisRecentePorAno.set(c.ano, { mes: c.mes, porte: c.porte });
    }
  }
  for (const [ano, v] of maisRecentePorAno) mapa.set(ano, v.porte);

  // 2. Derivação pelo total do ano anterior, para os anos não apurados.
  const totalPorAno = new Map<number, number>();
  for (const f of historico.faturamento) {
    totalPorAno.set(f.ano, (totalPorAno.get(f.ano) ?? 0) + f.faturamento);
  }
  for (const ano of totalPorAno.keys()) {
    if (mapa.has(ano)) continue;
    const totalAnterior = totalPorAno.get(ano - 1);
    if (totalAnterior !== undefined) {
      mapa.set(ano, porteDaReceita(totalAnterior));
    }
    // Sem o ano anterior não há como saber o porte — fica fora do mapa.
  }

  return mapa;
}

function BadgePorte({ porte }: { porte: Porte }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${CORES_PORTE[porte]}`}
    >
      {ROTULO_PORTE[porte]}
    </span>
  );
}

/**
 * Célula de enquadramento: o que a empresa é hoje na Receita → o que a receita
 * bruta apurada diz que ela é.
 *
 * Os dois lado a lado com a seta é o que torna a divergência legível de
 * relance. Em colunas separadas, o leitor tinha que comparar de cabeça
 * "EMPRESA DE PEQUENO PORTE" com um selo "Demais" a duas colunas de distância.
 * Quando são iguais, a seta some e fica um selo só — não há nada a comparar.
 */
function TransicaoPorte({
  declarado,
  apurado,
  impedimento = false,
}: {
  declarado: Porte | null;
  apurado: Porte;
  /** Sócio PJ no quadro: o porte pela receita não conclui sozinho. */
  impedimento?: boolean;
}) {
  const diverge = declarado !== null && declarado !== apurado;

  // Com sócio PJ, o art. 3º §4º I afasta ME/EPP independentemente da receita.
  // Mostrar "Demais → ME" aqui seria anunciar um enquadramento que a própria
  // ressalva da linha contradiz — então o apurado sai marcado como pendente.
  if (impedimento && apurado !== 'DEMAIS' && apurado !== 'SEM_DADOS') {
    return (
      <div
        className="flex items-center justify-center gap-1.5"
        title={`Pela receita seria ${ROTULO_PORTE[apurado]}, mas há sócio pessoa jurídica no quadro — o art. 3º §4º, I da LC 123 afasta ME/EPP independentemente da receita. Confirme o cartão CNPJ.`}
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border bg-purple-100 text-purple-800 border-purple-200">
          {ROTULO_PORTE[apurado]}?
        </span>
        <span className="text-[10px] text-purple-600">a confirmar</span>
      </div>
    );
  }

  if (!diverge) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <BadgePorte porte={apurado} />
        {declarado === null && (
          <span className="text-[10px] text-gray-400" title="Porte não informado na Receita">
            (sem RFB)
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center gap-1.5"
      title={`Na Receita consta ${ROTULO_PORTE[declarado]}; pela receita bruta apurada é ${ROTULO_PORTE[apurado]}.`}
    >
      <span className="text-xs font-medium text-gray-400">{ROTULO_PORTE[declarado]}</span>
      <span className="text-gray-400 text-xs">&rarr;</span>
      <BadgePorte porte={apurado} />
    </div>
  );
}

/**
 * Célula "Situação": quando a mudança vale — não o que ela é (isso está na
 * coluna de enquadramento). A barra mede contra o teto DA EMPRESA, não contra
 * um limite fixo: uma EPP a R$ 2 mi está a 42% do teto dela; a mesma barra
 * medida contra R$ 360 mil daria 555% e não significaria nada.
 */
function SituacaoCelula({
  diagnostico,
  pct,
}: {
  diagnostico: Diagnostico;
  pct: number | null;
}) {
  const { situacao, proximoPorte, folgaCentavos, dataEfeito } = diagnostico;

  const cores: Record<string, string> = {
    DENTRO_DA_FAIXA: 'bg-emerald-500',
    MUDA_EM_JANEIRO: 'bg-amber-500',
    MUDOU_NO_ANO: 'bg-red-500',
    JA_SUJEITA: 'bg-red-400',
    INDETERMINADO: 'bg-slate-300',
  };

  // A coluna responde QUANDO a mudança vale, não qual é — o "o quê" está na
  // coluna de enquadramento. Por isso "Permanece" cobre tanto quem está dentro
  // do teto quanto quem já é Demais e continua sendo: nos dois casos, nada
  // muda. "Já é Demais" descrevia o porte, não o prazo, e competia com a
  // coluna ao lado.
  const textos: Record<string, string> = {
    DENTRO_DA_FAIXA: 'Permanece',
    MUDA_EM_JANEIRO: 'Próximo ano',
    MUDOU_NO_ANO: 'Dentro do ano',
    JA_SUJEITA: 'Permanece',
    INDETERMINADO: 'Indefinido',
  };

  const subtextos: Record<string, string> = {
    DENTRO_DA_FAIXA: 'sem mudança à vista',
    MUDA_EM_JANEIRO: `passa a ${proximoPorte === 'DEMAIS' ? 'Demais' : 'EPP'}`,
    MUDOU_NO_ANO: 'já vale',
    JA_SUJEITA: 'segue Demais',
    INDETERMINADO: 'sem dados para concluir',
  };

  const textoCor: Record<string, string> = {
    DENTRO_DA_FAIXA: 'text-emerald-700',
    MUDA_EM_JANEIRO: 'text-amber-700',
    MUDOU_NO_ANO: 'text-red-700',
    JA_SUJEITA: 'text-red-700',
    INDETERMINADO: 'text-slate-500',
  };

  return (
    <div className="w-44" title={diagnostico.resumo}>
      <div className={`text-xs font-semibold ${textoCor[situacao]}`}>{textos[situacao]}</div>
      <div className="text-[11px] text-gray-500">{subtextos[situacao]}</div>

      {pct !== null && situacao !== 'INDETERMINADO' && situacao !== 'JA_SUJEITA' && (
        <>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full ${cores[situacao]}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {pct.toFixed(0)}% do teto
            {folgaCentavos !== null && folgaCentavos > 0 && (
              <> · faltam {brl.format(folgaCentavos / 100)}</>
            )}
          </div>
        </>
      )}

      {dataEfeito && situacao !== 'DENTRO_DA_FAIXA' && (
        <div className="text-[11px] text-gray-600 mt-0.5">a partir de {dataBr(dataEfeito)}</div>
      )}
    </div>
  );
}

/**
 * Paleta por cartão.
 *
 * As classes ficam escritas por extenso porque o Tailwind varre o código em
 * busca de nomes literais — montar `text-${cor}-600` produziria uma classe que
 * nunca chega ao CSS final.
 */
const TONS = {
  neutro: {
    valor: 'text-gray-800',
    barra: 'bg-gray-400',
    consequencia: 'text-gray-500',
    ativo: 'border-gray-400 bg-gray-50 ring-2 ring-gray-100',
    inativo: 'border-gray-200 hover:border-gray-300',
  },
  me: {
    valor: 'text-emerald-600',
    barra: 'bg-emerald-500',
    consequencia: 'text-emerald-700',
    ativo: 'border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-100',
    inativo: 'border-gray-200 hover:border-emerald-300',
  },
  epp: {
    valor: 'text-sky-600',
    barra: 'bg-sky-500',
    consequencia: 'text-sky-700',
    ativo: 'border-sky-400 bg-sky-50/60 ring-2 ring-sky-100',
    inativo: 'border-gray-200 hover:border-sky-300',
  },
  demais: {
    valor: 'text-red-600',
    barra: 'bg-red-500',
    consequencia: 'text-red-700',
    ativo: 'border-red-400 bg-red-50/60 ring-2 ring-red-100',
    inativo: 'border-red-200 hover:border-red-300',
  },
  semDados: {
    valor: 'text-amber-600',
    barra: 'bg-amber-500',
    consequencia: 'text-amber-700',
    ativo: 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-100',
    inativo: 'border-gray-200 hover:border-amber-300',
  },
} as const;

/**
 * Cartão de contagem — e filtro.
 *
 * `faixa` é a régua que define o grupo e `consequencia`, o que ele significa na
 * prática: perguntas diferentes ("por que a empresa caiu aqui?" e "e daí?"), e
 * a segunda é a que o Departamento Pessoal está procurando.
 *
 * Clicar filtra a tabela para exatamente aquele grupo, e clicar de novo desfaz.
 * O número do cartão passa a ser o número de linhas da tabela — é isso que
 * torna o filtro previsível; se o clique preservasse os outros filtros, o
 * cartão diria 96 e a tabela mostraria 3.
 */
function CardResumo({
  titulo,
  valor,
  tom,
  faixa,
  consequencia,
  proporcao,
  ativo = false,
  onClick,
}: {
  titulo: string;
  valor: number;
  tom: keyof typeof TONS;
  faixa?: string;
  consequencia?: string;
  /** Fração do total (0 a 1). Sem isso, a barra não é renderizada. */
  proporcao?: number;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const t = TONS[tom];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={
        ativo
          ? 'Filtrando por este grupo — clique para mostrar todos'
          : `Clique para ver só estes ${valor} cliente(s)`
      }
      className={`text-left bg-white rounded-xl border-2 p-4 shadow-sm transition-all duration-150
        hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400
        ${ativo ? t.ativo : t.inativo}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {titulo}
        </span>
        {ativo && (
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            filtrando
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-3xl font-bold leading-none tabular-nums ${t.valor}`}>{valor}</span>
        {proporcao !== undefined && valor > 0 && (
          <span className="text-[11px] text-gray-400">{Math.round(proporcao * 100)}%</span>
        )}
      </div>

      {/* A barra dá a proporção sem exigir a divisão de cabeça: 45 de 217 é
          "um quinto", e isso se vê antes de se calcular. */}
      {proporcao !== undefined && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full ${t.barra} transition-all duration-300`}
            style={{ width: `${Math.max(proporcao * 100, valor > 0 ? 2 : 0)}%` }}
          />
        </div>
      )}

      {faixa && <div className="text-[11px] text-gray-500 mt-2 leading-snug">{faixa}</div>}
      {consequencia && (
        <div className={`text-[11px] mt-0.5 font-semibold leading-snug ${t.consequencia}`}>
          {consequencia}
        </div>
      )}
    </button>
  );
}

/**
 * Explicação da regra, recolhida por padrão.
 *
 * A regra tem duas partes que se confundem — a faixa de receita (quem é o quê)
 * e a data de efeito (a partir de quando) — e quem abre a tela uma vez por mês
 * não guarda isso. Fica aberta por um clique e não ocupa espaço de quem já
 * sabe.
 */
function ComoFunciona() {
  const [aberto, setAberto] = useState(false);

  const faixas = [
    { porte: 'ME' as Porte, limite: 'até R$ 360.000,00', cota: 'isenta' },
    { porte: 'EPP' as Porte, limite: 'de R$ 360.000,01 a R$ 4.800.000,00', cota: 'isenta' },
    { porte: 'DEMAIS' as Porte, limite: 'acima de R$ 4.800.000,00', cota: 'sujeita à cota' },
  ];
  // "Isenta" é conclusão fechada — ME e EPP não devem a cota, ponto. "Sujeita"
  // não é: o porte só coloca a empresa DENTRO da regra, e quantos aprendizes
  // (ou se algum) sai da análise de CBO do Departamento Pessoal.

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <InformationCircleIcon className="h-5 w-5 text-blue-600" />
          Como o porte é apurado
        </span>
        <span className="text-xs text-gray-400">{aberto ? 'ocultar' : 'ver explicação'}</span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
          <div>
            <p className="text-sm text-gray-600 leading-relaxed">
              O porte vem da <strong>receita bruta anual</strong> de cada empresa, somando matriz e
              filiais, apurada a partir do faturamento do SCI (LC 123/2006, art. 3º). É ele que
              define quem fica <strong>sujeito</strong> à cota de aprendizagem: só as{' '}
              <strong>Demais</strong> — ME e EPP são isentas (IN SIT/MTE 146/2018, art. 3º, I).
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              <strong>Sujeita não é o mesmo que obrigada.</strong> O porte coloca a empresa dentro
              da regra; quantos aprendizes ela deve contratar — ou se algum — depende da análise das
              funções por CBO, feita pelo Departamento Pessoal. Nenhuma linha desta tela conclui
              essa parte.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {faixas.map((f) => (
              <div key={f.porte} className="rounded-lg border border-gray-200 p-3">
                <BadgePorte porte={f.porte} />
                <div className="text-xs text-gray-600 mt-1.5">{f.limite}</div>
                <div
                  className={`text-xs font-semibold mt-0.5 ${
                    f.cota === 'isenta' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {f.cota}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              Quando a mudança passa a valer
            </div>
            <ul className="text-sm text-gray-600 space-y-1.5 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-amber-500 font-bold">•</span>
                <span>
                  Passou do teto da faixa: muda em <strong>1º de janeiro do ano seguinte</strong>.
                  Até lá nada muda — é aviso, não obrigação.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-500 font-bold">•</span>
                <span>
                  Passou de <strong>R$ 5.760.000,00</strong> (20% acima do teto de EPP): a empresa
                  vira Demais <strong>ainda neste ano</strong>, no mês seguinte ao excesso — e a
                  cota passa a ser exigível a partir daí (art. 3º §9º-A).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 font-bold">•</span>
                <span>
                  A passagem de <strong>ME para EPP</strong> não tem regra de antecipação e não
                  muda nada quanto à cota: as duas são isentas.
                </span>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              A receita não decide sozinha
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Ter <strong>outra empresa no quadro de sócios</strong> afasta o enquadramento como ME
              ou EPP mesmo com a receita dentro do limite (LC 123/2006, art. 3º §4º, I). Nesses
              casos a tela não afirma nem isenção nem sujeição: o porte aparece com{' '}
              <strong>"a confirmar"</strong> e a coluna do aprendiz fica <strong>"A conferir"</strong>{' '}
              — o quadro societário vem de um retrato do cartão CNPJ, que pode estar
              desatualizado, e nenhuma das duas conclusões pode sair de um dado assim sem alguém
              olhar. Como isentas elas não são, entram no filtro{' '}
              <strong>"Sujeitas a contratar aprendiz"</strong>: quem for analisar os CBOs precisa
              vê-las.
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
            <strong>Duas leituras que costumam sair erradas.</strong> "Sem dados" não é o mesmo que
            "isenta": é empresa que não deu para classificar por falta de faturamento, e pode muito
            bem estar sujeita. E o porte da Receita Federal não substitui o apurado aqui — quando os
            dois divergem, a tela mostra os dois lado a lado, sem corrigir um pelo outro.
          </div>

          <div className="text-xs text-gray-500 leading-relaxed">
            Esta tela apura <strong>quem</strong> está sujeito à cota, não <strong>quantos</strong>{' '}
            aprendizes cada uma deve contratar — esse cálculo depende dos empregados em funções que
            exigem formação profissional (CBO), que não estão neste sistema.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Escolha de o que atualizar.
 *
 * As duas operações têm o mesmo efeito visível — a tela fica em dia — mas
 * custos que diferem em três ordens de grandeza: uma reaplica as regras sobre o
 * que já está no banco, a outra percorre a base inteira consultando uma
 * procedure do SCI serializada por lock. Botão único levaria alguém a pagar
 * meia hora de SCI para refletir uma troca de regime no cadastro.
 *
 * Não há terceira opção "ambos": a coleta do SCI já relê o cadastro a cada
 * rodada, então ela É os dois. Oferecer as duas coisas separadas e mais a soma
 * delas seria dar três botões para dois resultados.
 */
function ModalAtualizar({
  onFechar,
  onCadastro,
  onSci,
  ocupado,
}: {
  onFechar: () => void;
  onCadastro: () => void;
  onSci: () => void;
  ocupado: boolean;
}) {
  const opcao = (
    icone: React.ReactNode,
    titulo: string,
    descricao: string,
    custo: string,
    onClick: () => void,
    destaque: boolean
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md
        disabled:opacity-50 disabled:cursor-not-allowed
        ${destaque ? 'border-blue-300 bg-blue-50/50 hover:border-blue-400' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${destaque ? 'text-blue-600' : 'text-gray-500'}`}>{icone}</div>
        <div className="flex-1">
          <div className="font-semibold text-gray-800 text-sm">{titulo}</div>
          <div className="text-xs text-gray-600 mt-1 leading-relaxed">{descricao}</div>
          <div
            className={`text-[11px] font-semibold mt-1.5 ${
              destaque ? 'text-blue-700' : 'text-amber-700'
            }`}
          >
            {custo}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" onClick={onFechar} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-800">Atualizar</h3>
            <button
              type="button"
              onClick={onFechar}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
            >
              ×
            </button>
          </div>

          <div className="p-5 space-y-3">
            {opcao(
              <BoltIcon className="h-5 w-5" />,
              'Atualizar Dados Cadastrais',
              'Reaplica as regras usando o faturamento que já está no sistema. Use depois de alterar regime tributário, quadro societário ou data de abertura.',
              'Alguns segundos · não consulta o SCI',
              onCadastro,
              true
            )}
            {opcao(
              <ArrowPathIcon className="h-5 w-5" />,
              'Atualizar Faturamento SCI',
              'Consulta o faturamento de cada cliente no SCI e reapura tudo. Já inclui os dados cadastrais — não é preciso rodar as duas.',
              'Alguns minutos · ocupa o SCI durante a apuração',
              onSci,
              false
            )}
          </div>

          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={onFechar}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Domínio fixo dos destinatários. O usuário digita só o prefixo — quem usa a
 * tela é sempre alguém de dentro, e digitar o domínio inteiro toda vez é onde
 * nascem os erros de digitação que fazem o relatório sumir sem aviso.
 */
const DOMINIO_EMAIL = '@central-rnc.com.br';

/** Prefixos válidos de caixa: sem espaço, sem @ e sem acento. */
const PREFIXO_VALIDO = /^[a-z0-9._+-]+$/;

/**
 * Normaliza o que foi digitado no campo de prefixo.
 *
 * Aceita colar o endereço inteiro ("ti@central-rnc.com.br") e fica só com o
 * que vem antes do @ — caso contrário o envio sairia para
 * "ti@central-rnc.com.br@central-rnc.com.br".
 */
export function normalizarPrefixoEmail(valor: string): string {
  return (valor || '').trim().toLowerCase().split('@')[0] ?? '';
}

/** Nome do aviso na linguagem da tela (o backend usa o enum). */
const rotuloAviso = (t: TipoAviso) =>
  t === 'COTA' ? 'Cota de Aprendizagem' : 'Enquadramento de Porte';

/**
 * Espera do envio, dentro do próprio modal.
 *
 * O envio dispara SMTP e pode levar alguns segundos. Fechar o modal e deixar o
 * usuário olhando a listagem faz parecer que nada aconteceu — e ele clica de
 * novo, gerando e-mail duplicado. Prender a interação aqui, com o destino à
 * vista, responde "está indo, e é para lá" sem ele precisar procurar.
 */
function VistaEnviando({ email, tipos }: { email: string; tipos: TipoAviso[] }) {
  return (
    <div className="p-8 flex flex-col items-center text-center">
      <div className="relative h-16 w-16 mb-5">
        {/* Trilho estático + arco girando: leitura de progresso sem dar um
            percentual que não temos como medir de verdade. */}
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <EnvelopeIcon className="h-6 w-6 text-blue-600 animate-pulse" />
        </div>
      </div>
      <div className="text-sm font-semibold text-gray-800">Enviando...</div>
      <div className="text-xs text-gray-500 mt-1.5 break-all">
        {tipos.map(rotuloAviso).join(' e ')} para{' '}
        <span className="font-semibold text-gray-700">{email}</span>
      </div>
      <div className="text-[11px] text-gray-400 mt-3">Isso pode levar alguns segundos.</div>
    </div>
  );
}

/**
 * Desfecho do envio, dentro do modal.
 *
 * Distingue três desfechos porque eles pedem ações diferentes: tudo certo
 * (fechar), erro na chamada (tentar de novo) e parcial — um aviso saiu e o
 * outro não, que é o caso que um "enviado com sucesso" genérico esconderia.
 */
function VistaResultado({
  resultado,
  erro,
  email,
  onFechar,
  onVoltar,
}: {
  resultado: ResultadoEnvio[] | null;
  erro: string | null;
  email: string;
  onFechar: () => void;
  onVoltar: () => void;
}) {
  // Entrada suave do selo: sem isso o ícone "pisca" no lugar quando a resposta
  // volta rápida, e o usuário não registra a troca de estado.
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMontado(true), 20);
    return () => clearTimeout(t);
  }, []);

  const enviados = (resultado ?? []).filter((r) => r.enviado);
  const falhos = (resultado ?? []).filter((r) => !r.enviado);
  const tudoCerto = !erro && enviados.length > 0 && falhos.length === 0;
  const tudoFalhou = !!erro || enviados.length === 0;

  const cor = tudoCerto
    ? { bg: 'bg-emerald-100', fg: 'text-emerald-600', ring: 'ring-emerald-50' }
    : tudoFalhou
      ? { bg: 'bg-red-100', fg: 'text-red-600', ring: 'ring-red-50' }
      : { bg: 'bg-amber-100', fg: 'text-amber-600', ring: 'ring-amber-50' };

  const titulo = tudoCerto
    ? 'Enviado com sucesso'
    : tudoFalhou
      ? 'Não foi enviado'
      : 'Enviado em parte';

  return (
    <>
      <div className="p-6 flex flex-col items-center text-center">
        <div
          className={`h-16 w-16 rounded-full ${cor.bg} ring-8 ${cor.ring} flex items-center justify-center
            transition-all duration-300 ease-out ${montado ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
        >
          {tudoCerto ? (
            <CheckCircleIcon className={`h-9 w-9 ${cor.fg}`} />
          ) : (
            <ExclamationTriangleIcon className={`h-8 w-8 ${cor.fg}`} />
          )}
        </div>

        <div className="text-base font-bold text-gray-800 mt-4">{titulo}</div>

        {erro ? (
          <div className="text-xs text-red-600 mt-2 break-words">{erro}</div>
        ) : (
          <div className="w-full mt-4 space-y-2 text-left">
            {enviados.map((r) => (
              <div
                key={r.tipo}
                className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2"
              >
                <CheckCircleIcon className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-gray-700 min-w-0">
                  <span className="font-semibold text-gray-800">{rotuloAviso(r.tipo)}</span>
                  <div className="text-gray-600 break-all">
                    {r.destinatarios.join(', ') || email}
                  </div>
                </div>
              </div>
            ))}
            {falhos.map((r) => (
              <div
                key={r.tipo}
                className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2"
              >
                <ExclamationTriangleIcon className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-gray-700 min-w-0">
                  <span className="font-semibold text-gray-800">{rotuloAviso(r.tipo)}</span>
                  <div className="text-gray-600 break-words">
                    {r.erro || r.motivo || 'falha no envio'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex gap-3">
        {!tudoCerto && (
          <button
            type="button"
            onClick={onVoltar}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold text-sm"
          >
            Tentar de novo
          </button>
        )}
        <button
          type="button"
          onClick={onFechar}
          className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm ${
            tudoCerto
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Fechar
        </button>
      </div>
    </>
  );
}

/**
 * Envio dos avisos da competência, em duas etapas.
 *
 * Etapa 1 — QUAIS relatórios. A apuração gera DOIS e-mails, com recortes
 * diferentes: enquadramento (porte ME/EPP/Demais) e cota (quem está sujeito).
 * São caixas de seleção, e não botões de ação direta, porque o usuário pode
 * querer os dois na mesma leitura.
 *
 * Etapa 2 — PARA QUEM. O destino é o próprio usuário, então o campo já vem com
 * o domínio fixo e ele completa só o prefixo.
 */
function ModalEmail({
  competencia,
  onFechar,
  onEnviar,
  ocupado,
  resultado,
  erroEnvio,
  onLimparResultado,
}: {
  competencia: string;
  onFechar: () => void;
  onEnviar: (tipos: TipoAviso[], email: string) => void;
  ocupado: boolean;
  resultado: ResultadoEnvio[] | null;
  erroEnvio: string | null;
  onLimparResultado: () => void;
}) {
  const [etapa, setEtapa] = useState<'tipos' | 'destino'>('tipos');
  const [tipos, setTipos] = useState<TipoAviso[]>([]);
  const [prefixo, setPrefixo] = useState('');

  const alternar = (tipo: TipoAviso) =>
    setTipos((atual) =>
      atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]
    );

  const prefixoLimpo = normalizarPrefixoEmail(prefixo);
  const prefixoOk = PREFIXO_VALIDO.test(prefixoLimpo);
  const emailFinal = `${prefixoLimpo}${DOMINIO_EMAIL}`;

  // A vista é derivada, não um quarto valor de `etapa`: enquanto envia e ao
  // mostrar o desfecho, a escolha de tipos/destino continua guardada — é o que
  // permite "Tentar de novo" voltar direto ao destino, já preenchido.
  const vista: 'tipos' | 'destino' | 'enviando' | 'resultado' = ocupado
    ? 'enviando'
    : resultado || erroEnvio
      ? 'resultado'
      : etapa;

  // Durante o envio não há o que cancelar: fechar deixaria o disparo órfão e o
  // usuário sem o retorno.
  const podeFechar = vista !== 'enviando';
  const fechar = () => {
    if (podeFechar) onFechar();
  };

  const legenda: Record<typeof vista, string> = {
    tipos: 'Passo 1 de 2: o que enviar',
    destino: 'Passo 2 de 2: para quem',
    enviando: 'Enviando',
    resultado: 'Resultado',
  };

  const opcao = (tipo: TipoAviso, titulo: string, publico: string, descricao: string) => {
    const marcado = tipos.includes(tipo);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={marcado}
        onClick={() => alternar(tipo)}
        disabled={ocupado}
        className={`w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md
          disabled:opacity-50 disabled:cursor-not-allowed ${
            marcado
              ? 'border-blue-400 bg-blue-50/60'
              : 'border-gray-200 hover:border-gray-300'
          }`}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center
              text-[10px] font-bold leading-none ${
                marcado ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
              }`}
          >
            {marcado ? '✓' : ''}
          </span>
          <span className="font-semibold text-gray-800 text-sm">{titulo}</span>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide ml-auto">
            {publico}
          </span>
        </div>
        <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">{descricao}</div>
      </button>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" onClick={fechar} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Enviar e-mail</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Competência {competencia} · {legenda[vista]}
              </p>
            </div>
            {podeFechar && (
              <button
                type="button"
                onClick={fechar}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
              >
                ×
              </button>
            )}
          </div>

          {vista === 'enviando' ? (
            <VistaEnviando email={emailFinal} tipos={tipos} />
          ) : vista === 'resultado' ? (
            <VistaResultado
              resultado={resultado}
              erro={erroEnvio}
              email={emailFinal}
              onFechar={onFechar}
              onVoltar={() => {
                onLimparResultado();
                setEtapa('destino');
              }}
            />
          ) : vista === 'tipos' ? (
            <>
              <div className="p-5 space-y-3">
                {opcao(
                  'ENQUADRAMENTO',
                  'Enquadramento de Porte',
                  'fiscal',
                  'Mudança de porte ME/EPP/Demais, projeções e prazos. Não menciona cota.'
                )}
                {opcao(
                  'COTA',
                  'Cota de Aprendizagem',
                  'dep. pessoal',
                  'Quem está sujeito à cota, quem entrou, quem saiu e a relação completa. Não menciona ME→EPP.'
                )}
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Pode marcar os dois — nesse caso chegam dois e-mails separados, um por
                  relatório.
                </p>
              </div>

              <div className="px-5 pb-5 flex gap-3">
                <button
                  type="button"
                  onClick={onFechar}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setEtapa('destino')}
                  disabled={tipos.length === 0 || ocupado}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Avançar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-5 space-y-4">
                <div>
                  <label
                    htmlFor="cota-email-prefixo"
                    className="block text-xs font-semibold text-gray-700 mb-1.5"
                  >
                    Enviar para
                  </label>
                  {/* Domínio como sufixo fixo, fora do input: o usuário não
                      consegue apagá-lo nem duplicá-lo sem perceber. */}
                  <div className="flex items-stretch rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-blue-500 transition-colors">
                    <input
                      id="cota-email-prefixo"
                      type="text"
                      autoFocus
                      value={prefixo}
                      onChange={(e) => setPrefixo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && prefixoOk && !ocupado) {
                          onEnviar(tipos, emailFinal);
                        }
                      }}
                      placeholder="seu.nome"
                      className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none"
                    />
                    <span className="px-3 py-2.5 bg-gray-50 text-gray-600 text-sm font-medium border-l-2 border-gray-200 whitespace-nowrap">
                      {DOMINIO_EMAIL}
                    </span>
                  </div>
                  {prefixoLimpo !== '' && !prefixoOk && (
                    <p className="text-[11px] text-red-600 mt-1.5">
                      Use apenas letras, números e . _ + - (sem espaço e sem acento).
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Vai receber
                  </div>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {tipos.includes('ENQUADRAMENTO') && <li>• Enquadramento de Porte</li>}
                    {tipos.includes('COTA') && <li>• Cota de Aprendizagem</li>}
                  </ul>
                  {prefixoOk && (
                    <div className="text-xs text-gray-600 mt-2 break-all">
                      em <span className="font-semibold text-gray-800">{emailFinal}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 pb-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEtapa('tipos')}
                  disabled={ocupado}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold text-sm disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => onEnviar(tipos, emailFinal)}
                  disabled={!prefixoOk || ocupado}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <EnvelopeIcon className="h-4 w-4" />
                  {ocupado ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

type FiltroStatus = 'todos' | 'sujeitas' | 'mudou' | 'projecao' | 'sem-dados' | 'revisar';

export default function CotaAprendizagemTab() {
  const [dados, setDados] = useState<Classificacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [reclassificando, setReclassificando] = useState(false);
  const [modalAtualizar, setModalAtualizar] = useState(false);
  const [progresso, setProgresso] = useState<{ processados: number; total: number } | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroPorte, setFiltroPorte] = useState<'todos' | Porte>('todos');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [exportando, setExportando] = useState(false);
  const [modalEmail, setModalEmail] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  // Desfecho do envio: mora aqui e é exibido DENTRO do modal, para o usuário
  // ver a confirmação no mesmo lugar em que clicou.
  const [resultadoEnvio, setResultadoEnvio] = useState<ResultadoEnvio[] | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoCliente | null>(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);
      setDados(await cotaAprendizagemService.classificacao());
    } catch (e: any) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar a classificação');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Acompanha uma apuração em andamento no servidor.
   *
   * Separado do botão de propósito: a apuração roda no BACKEND e sobrevive a um
   * F5 — o que se perde ao recarregar é só este intervalo, que é estado de
   * componente. Por isso ele também é rearmado na montagem quando o servidor
   * responde que ainda está processando.
   */
  const acompanhar = useCallback(() => {
    if (pollRef.current) return; // já acompanhando
    setSincronizando(true);
    pollRef.current = setInterval(async () => {
      try {
        const s = await cotaAprendizagemService.status();
        setProgresso({ processados: s.processados, total: s.total });
        if (!s.rodando) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSincronizando(false);
          setProgresso(null);
          if (s.ultimoResumo) {
            setAviso(
              `Apuração de ${labelCompetencia(s.ultimoResumo.bdref)} concluída: ` +
                `${s.ultimoResumo.processados} cliente(s), ${s.ultimoResumo.mudancas} mudança(s), ` +
                `${s.ultimoResumo.semDados} sem dados, ${s.ultimoResumo.semCodigoSci} sem código SCI` +
                (s.ultimoResumo.erros > 0 ? `, ${s.ultimoResumo.erros} erro(s)` : '') + '.'
            );
          }
          await carregar();
        }
      } catch {
        /* falha de poll é transitória — a próxima tentativa resolve */
      }
    }, 5000);
  }, [carregar]);

  useEffect(() => {
    void (async () => {
      await carregar();
      // Se o servidor já estava apurando quando a página abriu (F5 no meio da
      // rodada, ou o job do dia 5 rodando), retoma o acompanhamento em vez de
      // mostrar a tela como se nada estivesse acontecendo.
      try {
        const s = await cotaAprendizagemService.status();
        if (s.rodando) {
          setProgresso({ processados: s.processados, total: s.total });
          acompanhar();
        }
      } catch {
        /* sem status não há o que retomar */
      }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [carregar, acompanhar]);

  const sincronizar = async () => {
    try {
      setErro(null);
      setAviso(null);
      setModalAtualizar(false);
      await cotaAprendizagemService.sincronizar({});
      acompanhar();
    } catch (e: any) {
      setSincronizando(false);
      setErro(e?.response?.data?.error || e?.message || 'Erro ao iniciar a sincronização');
    }
  };

  /**
   * Reaplica as regras sem consultar o SCI.
   *
   * É o caminho para quando o CADASTRO muda — regime tributário, quadro
   * societário, data de abertura. Nada disso depende de faturamento novo, e a
   * coleta do SCI leva minutos; aqui são segundos.
   */
  const reclassificar = async () => {
    try {
      setErro(null);
      setAviso(null);
      setModalAtualizar(false);
      setReclassificando(true);
      const r = await cotaAprendizagemService.reclassificar({});
      await carregar();
      setAviso(
        `${r.total} cliente(s) reclassificados em ${(r.duracaoMs / 1000).toFixed(1)}s` +
          (r.mudancas > 0 ? ` · ${r.mudancas} mudança(s) de porte` : '') +
          '. O faturamento não foi consultado novamente.'
      );
    } catch (e: any) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao reclassificar');
    } finally {
      setReclassificando(false);
    }
  };

  const exportar = async () => {
    try {
      setExportando(true);
      const blob = await cotaAprendizagemService.exportarXlsx(dados?.bdref ?? undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cota_Aprendizagem_${dados?.bdref ?? 'atual'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao exportar');
    } finally {
      setExportando(false);
    }
  };

  /**
   * Dispara os avisos escolhidos no modal, para o endereço informado.
   *
   * Com os DOIS marcados, a chamada vai sem `tipo` — o backend já manda os dois
   * nessa forma, e uma requisição só evita dois envios parciais discordando
   * entre si. `destinatarios` sobrescreve as listas padrão (Fiscal / DP), então
   * o relatório chega só na caixa de quem pediu.
   *
   * A resposta é uma LISTA — um resultado por aviso —, e cada um pode ter ido
   * ou falhado por conta própria. Antes o código lia `r.enviado` de um array e
   * anunciava "não enviado" mesmo quando os dois tinham saído.
   *
   * O modal NÃO é fechado aqui: a espera e o desfecho são exibidos dentro dele
   * (`VistaEnviando` / `VistaResultado`). Fechar no clique mandava o usuário de
   * volta à listagem sem retorno nenhum, e o reflexo era clicar outra vez.
   */
  const enviarEmail = async (tipos: TipoAviso[], email: string) => {
    if (tipos.length === 0) return;
    const tipo = tipos.length === 1 ? tipos[0] : undefined;
    try {
      setEnviandoEmail(true);
      setResultadoEnvio(null);
      setErroEnvio(null);
      const r = await cotaAprendizagemService.enviarAviso({
        bdref: dados?.bdref ?? undefined,
        forcar: true,
        destinatarios: [email],
        ...(tipo ? { tipo } : {}),
      });
      setResultadoEnvio(r);
    } catch (e: any) {
      setErroEnvio(e?.response?.data?.error || e?.message || 'Erro ao enviar o e-mail');
    } finally {
      setEnviandoEmail(false);
    }
  };

  /** Fecha o modal e zera o desfecho, para a próxima abertura começar limpa. */
  const fecharModalEmail = () => {
    setModalEmail(false);
    setResultadoEnvio(null);
    setErroEnvio(null);
  };

  // A linha da listagem tem o que o endpoint de histórico não devolve:
  // diagnóstico, porte declarado na Receita e as ressalvas.
  const linhaDoCliente = useMemo(() => {
    if (!historico) return null;
    return dados?.clientes.find((c) => c.id === historico.cliente.id) ?? null;
  }, [historico, dados]);
  const diagnosticoDoCliente = linhaDoCliente?.diagnostico ?? null;

  const abrirHistorico = async (clienteId: string) => {
    try {
      setCarregandoHistorico(true);
      setHistorico(await cotaAprendizagemService.historico(clienteId));
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar o histórico');
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const clientesFiltrados = useMemo(() => {
    const lista = dados?.clientes ?? [];
    const termo = busca.trim().toLowerCase();
    return lista.filter((c) => {
      if (termo) {
        const alvo = `${c.razao_social} ${c.cnpj} ${c.codigo_sci ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (filtroPorte !== 'todos' && c.porte !== filtroPorte) return false;
      switch (filtroStatus) {
        // "Sujeitas" inclui quem tem sócio PJ e não é Demais. Pela receita
        // essas empresas cairiam em ME/EPP, mas o art. 3º §4º, I afasta esse
        // enquadramento — então elas NÃO são isentas, e quem for analisar os
        // CBOs precisa vê-las na lista. Deixá-las de fora seria dispensar da
        // análise justamente o caso em que a isenção é duvidosa.
        case 'sujeitas':
          return c.sujeita_cota === true || c.impedimento_societario;
        case 'mudou':
          return c.mudou;
        case 'projecao':
          return c.excede_teto_epp || c.excede_teto_me;
        case 'sem-dados':
          return c.porte === 'SEM_DADOS';
        case 'revisar':
          return c.revisar_juridico;
        default:
          return true;
      }
    });
  }, [dados, busca, filtroPorte, filtroStatus]);

  const viradas = useMemo(
    () => (dados?.clientes ?? []).filter((c) => c.mudou && c.porte === 'DEMAIS'),
    [dados]
  );
  /** Contagem por porte — o resumo do backend traz "sujeitas/isentas", que são
   *  agregados destes números; os cartões mostram a distribuição em si. */
  const porPorte = useMemo(() => {
    const base: Record<Porte, number> = { ME: 0, EPP: 0, DEMAIS: 0, SEM_DADOS: 0 };
    for (const c of dados?.clientes ?? []) base[c.porte]++;
    return base;
  }, [dados]);

  /**
   * Clique no cartão: filtra por aquele porte, e clicar de novo desfaz.
   *
   * Zera também o filtro de situação. Sem isso, quem estivesse com "A conferir"
   * ligado clicaria no cartão que diz 96 e veria 3 linhas — e concluiria, com
   * razão, que o número do cartão está errado.
   */
  const filtrarPorPorte = (porte: Porte) => {
    setFiltroStatus('todos');
    setFiltroPorte((atual) => (atual === porte ? 'todos' : porte));
  };

  const limparFiltros = () => {
    setFiltroPorte('todos');
    setFiltroStatus('todos');
    setBusca('');
  };

  if (loading) return <LoadingSpinner />;

  const r = dados?.resumo;
  const semFiltro = filtroPorte === 'todos' && filtroStatus === 'todos' && busca.trim() === '';
  /** Fatia do total avaliado, para a barra de proporção do cartão. */
  const fracao = (n: number) => (r && r.total > 0 ? n / r.total : 0);
  // Ano da competência, para o cabeçalho dizer "Receita 2026" em vez de "RBA".
  const anoRef = dados?.bdref ? Math.floor(dados.bdref / 100) : new Date().getFullYear();

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Enquadramento de Porte</h2>
          <p className="text-sm text-gray-500">
            Quem é ME, EPP ou Demais pela receita bruta — e quem, por isso, fica sujeito a contratar
            aprendiz. Competência <strong>{labelCompetencia(dados?.bdref ?? null)}</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Botão único: a escolha entre reaplicar as regras (segundos) e
              consultar o SCI (minutos) vai para o modal, onde cabe explicar o
              custo de cada uma. Enquanto algo roda, o próprio botão vira o
              indicador de progresso. */}
          <button
            type="button"
            onClick={() => setModalAtualizar(true)}
            disabled={sincronizando || reclassificando}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${sincronizando ? 'animate-spin' : reclassificando ? 'animate-pulse' : ''}`}
            />
            {sincronizando
              ? progresso
                ? `Apurando ${progresso.processados}/${progresso.total}...`
                : 'Apurando...'
              : reclassificando
                ? 'Atualizando...'
                : 'Atualizar'}
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={exportando || !dados?.bdref}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {exportando ? 'Gerando...' : 'Excel'}
          </button>
          {/* A confirmação em dois botões inline mudava a largura da barra ao
              ser acionada e não dizia O QUE seria enviado — agora são dois
              e-mails, com públicos diferentes. A escolha foi para o modal. */}
          <button
            type="button"
            onClick={() => setModalEmail(true)}
            disabled={!dados?.bdref || enviandoEmail}
            className="px-4 py-2 bg-white text-gray-700 border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <EnvelopeIcon className={`h-4 w-4 ${enviandoEmail ? 'animate-pulse' : ''}`} />
            {enviandoEmail ? 'Enviando...' : 'Enviar e-mail'}
          </button>
        </div>
      </div>

      {modalAtualizar && (
        <ModalAtualizar
          onFechar={() => setModalAtualizar(false)}
          onCadastro={reclassificar}
          onSci={sincronizar}
          ocupado={sincronizando || reclassificando}
        />
      )}

      {modalEmail && (
        <ModalEmail
          competencia={labelCompetencia(dados?.bdref ?? null)}
          onFechar={fecharModalEmail}
          onEnviar={enviarEmail}
          ocupado={enviandoEmail}
          resultado={resultadoEnvio}
          erroEnvio={erroEnvio}
          onLimparResultado={() => {
            setResultadoEnvio(null);
            setErroEnvio(null);
          }}
        />
      )}

      {erro && <Alert type="error" onClose={() => setErro(null)}>{erro}</Alert>}
      {aviso && <Alert type="success" onClose={() => setAviso(null)}>{aviso}</Alert>}

      <ComoFunciona />

      {/* Cards — a distribuição por porte, que é o que a aba apura.
          "Sujeitas à cota" saiu: era o mesmo número de "Demais" com outro nome,
          e dois cartões para a mesma contagem fazem procurar diferença onde não
          há. Agora a consequência vem escrita no próprio cartão do porte. */}
      {r && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <CardResumo
            titulo="Avaliados"
            valor={r.total}
            tom="neutro"
            faixa="clientes com faturamento no SCI"
            ativo={semFiltro}
            onClick={limparFiltros}
          />
          <CardResumo
            titulo="ME"
            valor={porPorte.ME}
            tom="me"
            proporcao={fracao(porPorte.ME)}
            faixa="até R$ 360 mil por ano"
            consequencia="isenta da cota"
            ativo={filtroPorte === 'ME'}
            onClick={() => filtrarPorPorte('ME')}
          />
          <CardResumo
            titulo="EPP"
            valor={porPorte.EPP}
            tom="epp"
            proporcao={fracao(porPorte.EPP)}
            faixa="de R$ 360 mil a R$ 4,8 mi"
            consequencia="isenta da cota"
            ativo={filtroPorte === 'EPP'}
            onClick={() => filtrarPorPorte('EPP')}
          />
          <CardResumo
            titulo="Demais"
            valor={porPorte.DEMAIS}
            tom="demais"
            proporcao={fracao(porPorte.DEMAIS)}
            faixa="acima de R$ 4,8 mi"
            consequencia="sujeitas a contratar aprendiz"
            ativo={filtroPorte === 'DEMAIS'}
            onClick={() => filtrarPorPorte('DEMAIS')}
          />
          <CardResumo
            titulo="Sem dados"
            valor={porPorte.SEM_DADOS}
            tom="semDados"
            proporcao={fracao(porPorte.SEM_DADOS)}
            faixa="faturamento insuficiente"
            consequencia="não são isentas"
            ativo={filtroPorte === 'SEM_DADOS'}
            onClick={() => filtrarPorPorte('SEM_DADOS')}
          />
        </div>
      )}

      {/* Faixa de alerta: o que já vale × o que vale em 1º/jan */}
      {viradas.length > 0 && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-800 text-sm">
                {viradas.length === 1
                  ? '1 cliente passou a Demais — a cota já é exigível'
                  : `${viradas.length} clientes passaram a Demais — a cota já é exigível`}
              </div>
              <div className="text-xs text-red-700 mt-1">
                A receita do ano passou de R$ 5.760.000,00, e aí o enquadramento cai ainda dentro do
                ano corrente, no mês seguinte ao excesso (LC 123/2006, art. 3º §9º-A). Não espera
                janeiro.
              </div>
              <ul className="mt-2 space-y-1">
                {viradas.map((c) => (
                  <li key={c.id} className="text-xs text-red-900">
                    <strong>{c.razao_social}</strong> — {moeda(c.rba)} · vale a partir de{' '}
                    {dataBr(c.data_efeito)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* As faixas de "mudam em 1º/jan" e "a conferir" saíram: ambas repetiam,
          em bloco grande, o que a tabela já mostra por cliente (coluna Situação
          e coluna Ressalvas) e o que os filtros isolam sob demanda. Só a faixa
          vermelha acima continua, porque anuncia obrigação que JÁ vale — e essa
          não pode depender de o usuário pensar em filtrar. */}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por razão social, CNPJ ou código SCI..."
          className="flex-1 min-w-[240px] px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroPorte}
          onChange={(e) => setFiltroPorte(e.target.value as any)}
          className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="todos">Todos os portes</option>
          <option value="ME">ME</option>
          <option value="EPP">EPP</option>
          <option value="DEMAIS">Demais</option>
          <option value="SEM_DADOS">Sem dados</option>
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
          className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="todos">Todas as situações</option>
          <option value="sujeitas">Sujeitas a contratar aprendiz</option>
          <option value="mudou">Mudaram de porte neste ano</option>
          <option value="projecao">Mudam em 1º de janeiro</option>
          <option value="sem-dados">Não foi possível classificar</option>
          <option value="revisar">A conferir antes de valer</option>
        </select>
      </div>

      {/* Tabela */}
      {clientesFiltrados.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <p className="text-sm text-gray-500">
            {dados?.bdref
              ? 'Nenhum cliente com os filtros atuais.'
              : 'Nenhuma apuração ainda. Clique em "Sincronizar agora".'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              {/* Cabeçalhos alinhados ao conteúdo da coluna: texto à esquerda,
                  números à direita, selos e status centralizados. */}
              {/* Sem sigla no cabeçalho: "RBAA" e "RBA" são o vocabulário da
                  lei, não o de quem confere. O ano vai escrito, e a segunda
                  linha diz para que serve cada coluna. */}
              <tr className="align-middle">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">
                  Porte
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    na Receita &rarr; apurado
                  </div>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  Receita {anoRef - 1}
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    define o porte do ano
                  </div>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  Receita {anoRef}
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    acumulada até {labelCompetencia(dados?.bdref ?? null)}
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Situação
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    quando muda
                  </div>
                </th>
                {/* "Sujeita?" e não "precisa contratar?": o porte só coloca a
                    empresa dentro da regra. Quantos aprendizes — ou se algum —
                    sai da análise de CBO, que é do Departamento Pessoal. */}
                <th className="px-4 py-3 text-center font-semibold text-gray-600">
                  Aprendiz
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">sujeita?</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ressalvas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {clientesFiltrados.map((c) => {
                // Percentual medido contra o teto da faixa DA EMPRESA — para
                // uma ME o teto é 360 mil, para uma EPP é 4,8 mi. Medir todo
                // mundo contra o mesmo limite não diria nada sobre nenhuma.
                const pct =
                  c.diagnostico.percentualDoLimite !== null
                    ? Math.min(c.diagnostico.percentualDoLimite, 150)
                    : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => abrirHistorico(c.id)}
                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${c.mudou ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.razao_social}</div>
                      <div className="text-xs text-gray-500">
                        {formatCNPJ(c.cnpj)}
                        {c.codigo_sci ? ` · SCI ${c.codigo_sci}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TransicaoPorte
                        declarado={normalizarPorteDeclarado(c.porte_declarado)}
                        apurado={c.porte}
                        impedimento={c.impedimento_societario}
                      />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{moeda(c.rbaa)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{moeda(c.rba)}</td>
                    <td className="px-4 py-3">
                      <SituacaoCelula diagnostico={c.diagnostico} pct={pct} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.sujeita_cota === null ? (
                        <span
                          className="text-xs font-medium text-amber-700"
                          title={
                            c.impedimento_societario
                              ? 'Há sócio pessoa jurídica no quadro: o art. 3º §4º, I afasta ME/EPP independentemente da receita. Confirme o cartão CNPJ antes de tratar como isenta.'
                              : 'Não foi possível concluir o porte por falta de faturamento — não significa que esteja isenta.'
                          }
                        >
                          A conferir
                        </span>
                      ) : c.sujeita_cota ? (
                        <span
                          className="text-xs font-bold text-red-700"
                          title="Porte Demais: a empresa está sujeita à cota. Quantos aprendizes contratar depende da análise das funções por CBO, no Departamento Pessoal."
                        >
                          Sujeita
                        </span>
                      ) : (
                        <span
                          className="text-xs font-medium text-emerald-700"
                          title="ME e EPP são isentas da cota (IN SIT/MTE 146/2018, art. 3º, I)."
                        >
                          Isenta
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {!c.dado_confiavel && (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                            title={`Faltam ${c.meses_faltantes} mês(es): ${c.meses_faltantes_lista || ''}`}
                          >
                            {c.meses_faltantes} mês(es) sem dado
                          </span>
                        )}
                        {c.revisar_motivos.map((m) => {
                          const s = SELO_REVISAO[m];
                          if (!s) return null;
                          return (
                            <span
                              key={m}
                              className={`text-[11px] px-1.5 py-0.5 rounded border ${s.classe}`}
                              title={s.descricao}
                            >
                              {s.rotulo}
                            </span>
                          );
                        })}
                        {c.revisar_juridico && c.revisar_motivos.length === 0 && (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200"
                            title="Marcado para conferência jurídica."
                          >
                            revisar
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        <strong className="text-gray-600">Clique em qualquer linha</strong> para ver o faturamento
        mês a mês do cliente e em que mês cada limite foi ultrapassado.
      </p>

      {/* Modal de histórico */}
      {(historico || carregandoHistorico) && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
            onClick={() => setHistorico(null)}
          />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 overflow-y-auto">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {carregandoHistorico ? (
                <div className="p-10">
                  <LoadingSpinner />
                </div>
              ) : historico ? (
                <>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 rounded-t-2xl flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{historico.cliente.razao_social}</h3>
                      <p className="text-sm text-white/90">
                        {formatCNPJ(historico.cliente.cnpj)}
                        {historico.cliente.codigo_sci ? ` · SCI ${historico.cliente.codigo_sci}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => setHistorico(null)}
                      className="text-white hover:text-gray-200 p-1 rounded-lg hover:bg-white/10 text-2xl leading-none"
                    >
                      ×
                    </button>
                  </div>

                  <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
                    {/* Diagnóstico em texto: onde está, para onde vai, quando */}
                    {diagnosticoDoCliente && (
                      <div
                        className={`rounded-xl border-2 p-4 ${
                          diagnosticoDoCliente.situacao === 'MUDOU_NO_ANO' ||
                          diagnosticoDoCliente.situacao === 'JA_SUJEITA'
                            ? 'border-red-200 bg-red-50'
                            : diagnosticoDoCliente.situacao === 'MUDA_EM_JANEIRO'
                              ? 'border-amber-200 bg-amber-50'
                              : diagnosticoDoCliente.situacao === 'INDETERMINADO'
                                ? 'border-slate-200 bg-slate-50'
                                : 'border-emerald-200 bg-emerald-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <BadgePorte porte={diagnosticoDoCliente.porteAtual} />
                          {diagnosticoDoCliente.proximoPorte && (
                            <>
                              <span className="text-gray-400 text-sm">&rarr;</span>
                              <BadgePorte porte={diagnosticoDoCliente.proximoPorte} />
                            </>
                          )}
                          <span className="text-xs font-semibold text-gray-600 ml-1">
                            {diagnosticoDoCliente.sujeitaCota === true
                              ? 'sujeita à cota'
                              : diagnosticoDoCliente.sujeitaCota === false
                                ? 'isenta da cota'
                                : 'não foi possível concluir'}
                          </span>
                        </div>

                        {/* A divergência com o cadastro da Receita aparecia só
                            na tabela; abrindo o cliente, ela sumia — e é aqui
                            que a pessoa vai conferir o caso. */}
                        {(() => {
                          const declarado = normalizarPorteDeclarado(
                            linhaDoCliente?.porte_declarado ?? null
                          );
                          if (!declarado || declarado === diagnosticoDoCliente.porteAtual) {
                            return null;
                          }
                          return (
                            <div className="mb-2 text-xs text-gray-600 bg-white/70 border border-gray-200 rounded-lg px-3 py-2">
                              Na Receita Federal consta{' '}
                              <strong>{ROTULO_PORTE[declarado]}</strong>; pela receita bruta apurada
                              é <strong>{ROTULO_PORTE[diagnosticoDoCliente.porteAtual]}</strong>. O
                              cadastro da Receita não muda o porte apurado aqui — vale conferir qual
                              dos dois está desatualizado.
                            </div>
                          );
                        })()}

                        <p className="text-sm text-gray-700 leading-relaxed">
                          {diagnosticoDoCliente.resumo}
                        </p>

                        {/* As ressalvas da linha também não apareciam no modal. */}
                        {linhaDoCliente && linhaDoCliente.revisar_motivos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {linhaDoCliente.revisar_motivos.map((m) => {
                              const s = SELO_REVISAO[m];
                              if (!s) return null;
                              return (
                                <span
                                  key={m}
                                  className={`text-[11px] px-1.5 py-0.5 rounded border ${s.classe}`}
                                  title={s.descricao}
                                >
                                  {s.rotulo}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Faturamento mês a mês (consolidado matriz + filiais)
                      </h4>
                      {historico.faturamento.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 px-3 py-4 text-center text-gray-500 text-xs">
                          Nenhum faturamento coletado.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {agruparPorAno(historico.faturamento, portePorAno(historico)).map((grupo) => (
                            <div
                              key={grupo.ano}
                              className="overflow-hidden rounded-lg border border-gray-200"
                            >
                              {/* Cabeçalho do ano com o total — é o total do ano
                                  anterior que vira a RBAA, então ele precisa
                                  estar visível sem somar à mão. */}
                              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-800">{grupo.ano}</span>
                                  {portePorAno(historico).get(grupo.ano) && (
                                    <BadgePorte porte={portePorAno(historico).get(grupo.ano)!} />
                                  )}
                                </div>
                                <span className="text-xs text-slate-600">
                                  {grupo.meses.length} {grupo.meses.length === 1 ? 'mês' : 'meses'}
                                  {' · total '}
                                  <strong className="text-slate-800">{brl.format(grupo.total)}</strong>
                                </span>
                              </div>
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Mês</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600">Faturamento</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600">
                                      Acumulado no ano
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {grupo.meses.map((m) => (
                                    <tr
                                      key={m.bdref}
                                      className={
                                        m.gravidade === 'critico'
                                          ? 'bg-red-50 border-l-4 border-red-500'
                                          : m.gravidade === 'alerta'
                                            ? 'bg-amber-50 border-l-4 border-amber-500'
                                            : m.gravidade === 'aviso'
                                              ? 'bg-yellow-50 border-l-4 border-yellow-400'
                                              : ''
                                      }
                                    >
                                      <td className="px-3 py-2">
                                        <span className={m.gravidade ? 'font-bold text-gray-900' : ''}>
                                          {MESES[m.mes - 1]}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right">{brl.format(m.faturamento)}</td>
                                      <td className="px-3 py-2 text-right">
                                        <span
                                          className={
                                            m.acumulado > LIMITE_20PCT
                                              ? 'font-bold text-red-700'
                                              : m.acumulado > LIMITE_EPP
                                                ? 'font-semibold text-amber-700'
                                                : 'text-gray-700'
                                          }
                                        >
                                          {brl.format(m.acumulado)}
                                        </span>
                                        {m.marco && (
                                          <div
                                            className={`text-[11px] mt-0.5 font-semibold ${
                                              m.gravidade === 'critico'
                                                ? 'text-red-800'
                                                : m.gravidade === 'alerta'
                                                  ? 'text-amber-800'
                                                  : 'text-yellow-800'
                                            }`}
                                          >
                                            {m.marco}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Classificação por competência
                      </h4>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Competência</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Porte</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">RBAA</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">RBA</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Motivo</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Efeito</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {historico.classificacoes.map((c) => (
                              <tr key={c.bdref} className={c.mudou ? 'bg-red-50/40' : ''}>
                                <td className="px-3 py-2">{MESES[c.mes - 1]}/{c.ano}</td>
                                <td className="px-3 py-2"><BadgePorte porte={c.porte} /></td>
                                <td className="px-3 py-2 text-right">{moeda(c.rbaa)}</td>
                                <td className="px-3 py-2 text-right">{moeda(c.rba)}</td>
                                <td
                                  className="px-3 py-2 text-xs text-gray-600"
                                  title={DESCRICAO_MOTIVO[c.motivo] ?? ''}
                                >
                                  {rotuloMotivo(c.motivo)}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600">{dataBr(c.data_efeito)}</td>
                              </tr>
                            ))}
                            {historico.classificacoes.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-gray-500 text-xs">
                                  Nenhuma classificação registrada.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
