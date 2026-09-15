import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  BuildingOffice2Icon,
  InboxIcon,
  LockClosedIcon,
  PencilSquareIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import fiscalService, { CHAVE_COLABORADOR } from '../services/fiscal';
import ModoFoco from '../components/Fiscal/ModoFoco';
import type {
  ClienteDisponivel,
  Colaborador,
  EdicaoFicha,
  LinhaFicha,
  OpcoesFicha,
} from '../services/fiscal';

/**
 * Aba Fiscal — cada colaborador preenche perfil, volume de NF, envia SPED e
 * particularidade da própria carteira.
 *
 * Isto substitui a planilha Distribuicao_por_colaborador.xlsx. As quatro
 * primeiras colunas dela (CNPJ, razão social, regime, benefício) NÃO são
 * editáveis aqui: vêm do cadastro em toda leitura, e é justamente por isso que
 * não envelhecem como envelheciam na planilha. O que se digita são as quatro
 * últimas — três listas fechadas e um texto livre.
 *
 * A tabela é operável inteiramente pelo teclado, como uma planilha: quem tem 65
 * empresas não vai clicar 195 vezes. Ver `COLUNAS_EDITAVEIS` e `aoTeclar`.
 */

// ─── Helpers ───

const formatCnpj = (cnpj: string | null) => {
  if (!cnpj) return '—';
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** Linha respondida = as três listas fechadas preenchidas. A particularidade é opcional. */
const estaCompleta = (l: LinhaFicha) => !!(l.perfil && l.volumeNf && l.enviaSped);

/** Iniciais para o disco do colaborador — "MARIA HELENA" → "MH". */
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/**
 * A ordem das colunas editáveis na navegação por teclado. O índice é o
 * `data-coluna` de cada campo, e o nome é a chave que vai no PATCH — é o que
 * permite o Ctrl+D copiar "a de cima" sem saber em qual coluna está.
 */
const COLUNAS_EDITAVEIS = ['perfil', 'volumeNf', 'enviaSped', 'particularidade'] as const;
type ColunaEditavel = (typeof COLUNAS_EDITAVEIS)[number];

/**
 * Os quatro baldes da lista. Cada um é o filtro do tile de mesmo nome, e mostra
 * exatamente a quantidade que o tile anuncia — "Na carteira 16" abre 16 linhas,
 * não 17. `carteira` = tudo que não foi dispensado (respondidas + pendentes).
 */
type Filtro = 'carteira' | 'preenchidas' | 'pendentes' | 'inutilizadas';

/** Estado de gravação por linha, para o usuário ver que o dado saiu do lugar. */
type StatusLinha = 'salvando' | 'salvo' | 'erro';

/**
 * Conta até o valor novo em vez de trocar de um quadro para o outro.
 *
 * O salto seco de "14" para "13" é fácil de não ver — quem acabou de preencher
 * uma linha olha para o campo, não para o cartão. A contagem puxa o olho para a
 * mudança. Com `prefers-reduced-motion` ligado, assume o valor direto.
 */
function useNumeroAnimado(valor: number, reduzido: boolean): number {
  const [exibido, setExibido] = useState(valor);
  const atualRef = useRef(valor);

  useEffect(() => {
    if (reduzido) {
      atualRef.current = valor;
      setExibido(valor);
      return;
    }
    const de = atualRef.current;
    if (de === valor) return;

    const inicio = performance.now();
    const duracao = 380;
    let raf = 0;

    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(de + (valor - de) * eased);
      atualRef.current = v;
      setExibido(v);
      if (p < 1) raf = requestAnimationFrame(passo);
      else atualRef.current = valor;
    };

    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, reduzido]);

  return exibido;
}

// ─── Stat tile ───

interface TileProps {
  label: string;
  valor: number;
  ativo: boolean;
  onClick: () => void;
  /** Cor do disco/realce. Identidade do card, não status do dado. */
  tom: 'slate' | 'emerald' | 'amber' | 'gray';
  icone: React.ComponentType<{ className?: string }>;
  reduzido: boolean;
}

const TONS: Record<TileProps['tom'], { disco: string; texto: string; anel: string }> = {
  slate: { disco: 'bg-slate-100 text-slate-600', texto: 'text-slate-900', anel: 'ring-slate-400' },
  emerald: {
    disco: 'bg-emerald-100 text-emerald-700',
    texto: 'text-emerald-700',
    anel: 'ring-emerald-500',
  },
  amber: { disco: 'bg-amber-100 text-amber-700', texto: 'text-amber-700', anel: 'ring-amber-500' },
  gray: { disco: 'bg-gray-100 text-gray-500', texto: 'text-gray-500', anel: 'ring-gray-400' },
};

/**
 * Cada tile é também o filtro da lista — clicar em "Faltam responder" mostra as
 * pendentes. Um número que não leva a lugar nenhum obrigaria o usuário a
 * traduzir "faltam 44" num filtro que ele teria de achar noutro canto da tela.
 *
 * O valor usa figuras proporcionais (sem `tabular-nums`): estas contagens são
 * números soltos e grandes, não uma coluna que precise alinhar verticalmente.
 */
const Tile: React.FC<TileProps> = ({
  label,
  valor,
  ativo,
  onClick,
  tom,
  icone: Icone,
  reduzido,
}) => {
  const t = TONS[tom];
  const exibido = useNumeroAnimado(valor, reduzido);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      whileHover={reduzido ? undefined : { y: -2 }}
      whileTap={reduzido ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`group flex flex-1 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left
        shadow-sm transition-shadow hover:shadow-md
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
        ${ativo ? `border-transparent ring-2 ${t.anel}` : 'border-gray-100'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.disco}`}>
        <Icone className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className={`block text-2xl font-semibold leading-none ${t.texto}`}>{exibido}</span>
        <span className="mt-1 block truncate text-xs font-medium text-gray-500">{label}</span>
      </span>
    </motion.button>
  );
};

// ─── Célula de seleção ───

interface SelectCelulaProps {
  valor: string | null;
  opcoes: string[];
  onChange: (valor: string | null) => void;
  desabilitado?: boolean;
  largura?: string;
  linha: number;
  coluna: number;
}

/**
 * O select das colunas de lista fechada.
 *
 * A opção vazia existe de propósito: é como se desfaz uma escolha errada. Sem
 * ela, marcar "Serviço" por engano numa empresa seria irreversível pela tela.
 *
 * Vazio ganha borda âmbar, mas a cor não é o único sinal — o campo mostra "—"
 * e o tile "Faltam responder" conta essas linhas. Quem não distingue o âmbar
 * continua vendo que não há valor ali.
 */
const SelectCelula: React.FC<SelectCelulaProps> = ({
  valor,
  opcoes,
  onChange,
  desabilitado,
  largura = 'w-full',
  linha,
  coluna,
}) => (
  <select
    value={valor ?? ''}
    disabled={desabilitado}
    data-linha={linha}
    data-coluna={coluna}
    onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    className={`${largura} cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm shadow-sm transition
      ${valor
        ? 'border-gray-200 bg-white text-gray-900 hover:border-gray-300'
        : 'border-amber-300 bg-amber-50/70 text-gray-400 hover:border-amber-400'}
      disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400
      focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
  >
    <option value="">—</option>
    {opcoes.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

// ─── Chip ───

const Chip: React.FC<{ children: React.ReactNode; tom?: 'cinza' | 'indigo'; title?: string }> = ({
  children,
  tom = 'cinza',
  title,
}) => (
  <span
    title={title}
    className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium ${
      tom === 'indigo' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'
    }`}
  >
    {children}
  </span>
);

/** Tecla desenhada como tecla, para a dica de atalhos. */
const Tecla: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-gray-600 shadow-sm">
    {children}
  </kbd>
);

// ─── Modal: adicionar empresa ───

interface ModalAdicionarProps {
  colaboradorId: number;
  nomeColaborador: string;
  onFechar: () => void;
  onAdicionada: (linha: LinhaFicha, aviso: string | null) => void;
}

/**
 * Busca entre os clientes JÁ CADASTRADOS que ainda não estão na carteira.
 *
 * Não existe campo de CNPJ livre aqui: cadastro nasce na tela de Clientes, com
 * razão social conferida. Empresa que falta aparece como pendência do import,
 * não como digitação avulsa que entraria no banco sem revisão.
 */
const ModalAdicionar: React.FC<ModalAdicionarProps> = ({
  colaboradorId,
  nomeColaborador,
  onFechar,
  onAdicionada,
}) => {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ClienteDisponivel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState<string | null>(null);

  // Debounce: sem ele, cada tecla vira uma consulta e as respostas voltam fora
  // de ordem — a lista pisca com o resultado de um termo que já não está no
  // campo.
  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro(null);
      try {
        const dados = await fiscalService.clientesDisponiveis(colaboradorId, termo);
        if (!cancelado) setResultados(dados);
      } catch {
        if (!cancelado) setErro('Não foi possível buscar as empresas.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, colaboradorId]);

  const adicionar = async (cliente: ClienteDisponivel) => {
    setAdicionando(cliente.id);
    setErro(null);
    try {
      const { linha, aviso } = await fiscalService.adicionar(colaboradorId, cliente.id);
      onAdicionada(linha, aviso);
      setResultados((r) => r.filter((c) => c.id !== cliente.id));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAdicionando(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-20 backdrop-blur-sm"
      onClick={onFechar}
    >
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Adicionar empresa</h2>
            <p className="text-xs text-blue-100">para a carteira de {nomeColaborador}</p>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Razão social, CNPJ ou código SCI"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {erro && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}

          <div className="mt-3 max-h-96 overflow-y-auto">
            {carregando && <p className="py-10 text-center text-sm text-gray-400">Buscando…</p>}

            {!carregando && resultados.length === 0 && (
              <div className="py-10 text-center">
                <BuildingOffice2Icon className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">
                  {termo
                    ? 'Nenhuma empresa encontrada fora desta carteira.'
                    : 'Digite para buscar entre os clientes cadastrados.'}
                </p>
              </div>
            )}

            {!carregando &&
              resultados.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-blue-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {c.razaoSocial}
                      {!c.ativo && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                          inativa no cadastro
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {formatCnpj(c.cnpj)}
                      {c.codigoSci ? ` · SCI ${c.codigoSci}` : ''}
                      {c.regimeTributario ? ` · ${c.regimeTributario}` : ''}
                    </p>
                    {c.jaCom.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                        <ExclamationTriangleIcon className="h-3 w-3 shrink-0" />
                        já está com {c.jaCom.join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => adicionar(c)}
                    disabled={adicionando === c.id}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {adicionando === c.id ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Modal: não é minha ───

interface ModalInutilizarProps {
  linha: LinhaFicha;
  onFechar: () => void;
  onConfirmar: (motivo: string | null) => void;
}

const ModalInutilizar: React.FC<ModalInutilizarProps> = ({ linha, onFechar, onConfirmar }) => {
  const [motivo, setMotivo] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onFechar}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmar(motivo.trim() || null);
        }}
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <NoSymbolIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Esta empresa não é minha</h2>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{linha.razaoSocial}</span> continua na
              lista, riscada, e pode ser desfeito a qualquer momento. Nada é excluído.
            </p>
          </div>
        </div>

        <div className="px-6 pb-5 pt-4">
          <label className="block text-sm font-medium text-gray-700">
            Motivo <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={255}
            placeholder="Ex.: passou para o Arthur"
            className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-600"
          >
            Confirmar
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
};

// ─── Página ───

const Fiscal: React.FC = () => {
  const reduzido = !!useReducedMotion();

  const [opcoes, setOpcoes] = useState<OpcoesFicha | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [colaboradorId, setColaboradorId] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<LinhaFicha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>('carteira');
  const [busca, setBusca] = useState('');
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [linhaInutilizar, setLinhaInutilizar] = useState<LinhaFicha | null>(null);
  const [status, setStatus] = useState<Record<number, StatusLinha>>({});
  /**
   * Modo foco. `sequencia` é a lista de ids congelada na abertura — ver a
   * explicação em ModoFoco.tsx: se ela acompanhasse o filtro, responder uma
   * empresa reorganizaria a fila sob o dedo de quem preenche.
   */
  const [foco, setFoco] = useState<{ sequencia: number[]; inicial: number } | null>(null);

  const gradeRef = useRef<HTMLDivElement>(null);

  // Timers do "salvo" que some sozinho — guardados para limpar no unmount e
  // não chamar setState em componente desmontado.
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    },
    []
  );

  // Esc fecha o que estiver aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setModalAdicionar(false);
      setLinhaInutilizar(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Carga inicial ───

  useEffect(() => {
    (async () => {
      try {
        const [ops, colabs] = await Promise.all([
          fiscalService.opcoes(),
          fiscalService.colaboradores(),
        ]);
        setOpcoes(ops);
        setColaboradores(colabs);

        const salvo = Number(localStorage.getItem(CHAVE_COLABORADOR));
        const inicial = colabs.find((c) => c.id === salvo)?.id ?? colabs[0]?.id ?? null;
        setColaboradorId(inicial);
      } catch {
        setErro('Não foi possível carregar a aba Fiscal. O servidor está no ar?');
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const carregarFicha = useCallback(async (id: number) => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await fiscalService.ficha(id));
    } catch {
      setErro('Não foi possível carregar a carteira.');
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (colaboradorId === null) return;
    localStorage.setItem(CHAVE_COLABORADOR, String(colaboradorId));
    carregarFicha(colaboradorId);
  }, [colaboradorId, carregarFicha]);

  // ─── Gravação ───

  const marcarStatus = useCallback((id: number, valor: StatusLinha) => {
    setStatus((s) => ({ ...s, [id]: valor }));
    clearTimeout(timersRef.current[id]);
    if (valor === 'salvo') {
      timersRef.current[id] = setTimeout(() => {
        setStatus((s) => {
          const { [id]: _, ...resto } = s;
          return resto;
        });
      }, 1500);
    }
  }, []);

  /**
   * Grava um campo e reconcilia a linha com o que o banco devolveu.
   *
   * Otimista na ida (o select já mostra o valor novo) e corretivo na volta: se
   * o backend recusar, a linha volta ao que era e o erro aparece. Sem isso, uma
   * gravação falha ficaria invisível — a pessoa sairia da tela achando que
   * respondeu.
   */
  const salvarCampo = useCallback(
    async (linha: LinhaFicha, edicao: EdicaoFicha) => {
      const anterior = linha;
      setLinhas((ls) => ls.map((l) => (l.id === linha.id ? { ...l, ...edicao } : l)));
      marcarStatus(linha.id, 'salvando');
      try {
        const atualizada = await fiscalService.salvar(linha.id, edicao);
        setLinhas((ls) => ls.map((l) => (l.id === atualizada.id ? atualizada : l)));
        marcarStatus(linha.id, 'salvo');
        setErro(null);
      } catch (e: any) {
        setLinhas((ls) => ls.map((l) => (l.id === anterior.id ? anterior : l)));
        marcarStatus(linha.id, 'erro');
        setErro(e.message);
      }
    },
    [marcarStatus]
  );

  const inutilizar = async (motivo: string | null) => {
    if (!linhaInutilizar) return;
    const alvo = linhaInutilizar;
    setLinhaInutilizar(null);
    try {
      const atualizada = await fiscalService.inutilizar(alvo.id, motivo);
      setLinhas((ls) => ls.map((l) => (l.id === atualizada.id ? atualizada : l)));
    } catch (e: any) {
      setErro(e.message);
    }
  };

  /**
   * Abre o modo foco. Sem índice, começa na primeira que ainda falta responder
   * — é o que a pessoa quer em 9 de 10 vezes; se estiver tudo respondido, começa
   * do início.
   */
  const abrirFoco = (indice?: number) => {
    if (visiveis.length === 0) return;
    const sequencia = visiveis.map((l) => l.id);
    const primeiraPendente = visiveis.findIndex((l) => !l.inutilizado && !estaCompleta(l));
    setFoco({
      sequencia,
      inicial: indice ?? (primeiraPendente >= 0 ? primeiraPendente : 0),
    });
  };

  /**
   * Abre o modo foco já na fila do que falta responder.
   *
   * Troca o filtro junto, de propósito: quem sai do cartão com Esc precisa
   * encontrar na tabela a mesma lista em que estava trabalhando, e não a
   * carteira inteira de novo. A sequência é montada aqui em vez de reaproveitar
   * `visiveis` porque `setFiltro` só vale no próximo render — usar `visiveis`
   * agora pegaria a lista do filtro ANTIGO.
   */
  const focarPendentes = () => {
    const pendentes = linhas.filter((l) => !l.inutilizado && !estaCompleta(l));
    if (pendentes.length > 0) {
      setFiltro('pendentes');
      setFoco({ sequencia: pendentes.map((l) => l.id), inicial: 0 });
      return;
    }
    // Tudo respondido: o modo ainda serve para reler empresa por empresa.
    const ativas = linhas.filter((l) => !l.inutilizado);
    if (ativas.length === 0) return;
    setFiltro('carteira');
    setFoco({ sequencia: ativas.map((l) => l.id), inicial: 0 });
  };

  /** Mesma gravação da tabela — o modo foco não tem caminho próprio até o banco. */
  const inutilizarDireto = async (linha: LinhaFicha, motivo: string | null) => {
    try {
      const atualizada = await fiscalService.inutilizar(linha.id, motivo);
      setLinhas((ls) => ls.map((l) => (l.id === atualizada.id ? atualizada : l)));
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const reativar = async (linha: LinhaFicha) => {
    try {
      const atualizada = await fiscalService.reativar(linha.id);
      setLinhas((ls) => ls.map((l) => (l.id === atualizada.id ? atualizada : l)));
    } catch (e: any) {
      setErro(e.message);
    }
  };

  // ─── Derivados ───

  const colaborador = colaboradores.find((c) => c.id === colaboradorId) ?? null;

  const contagem = useMemo(() => {
    const ativas = linhas.filter((l) => !l.inutilizado);
    const preenchidas = ativas.filter(estaCompleta).length;
    return {
      total: ativas.length,
      preenchidas,
      pendentes: ativas.length - preenchidas,
      inutilizadas: linhas.filter((l) => l.inutilizado).length,
    };
  }, [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return linhas.filter((l) => {
      if (filtro === 'carteira' && l.inutilizado) return false;
      if (filtro === 'pendentes' && (l.inutilizado || estaCompleta(l))) return false;
      if (filtro === 'preenchidas' && (l.inutilizado || !estaCompleta(l))) return false;
      if (filtro === 'inutilizadas' && !l.inutilizado) return false;
      if (!termo) return true;
      return (
        l.razaoSocial.toLowerCase().includes(termo) ||
        (!!digitos && (l.cnpj ?? '').includes(digitos)) ||
        (l.codigoSci ?? '').toLowerCase().includes(termo)
      );
    });
  }, [linhas, filtro, busca]);

  const pct = contagem.total ? Math.round((contagem.preenchidas / contagem.total) * 100) : 0;
  const pctAnimado = useNumeroAnimado(pct, reduzido);
  const completo = contagem.total > 0 && contagem.preenchidas === contagem.total;

  // ─── Teclado: a tabela se opera como planilha ───

  /** Foca a célula (linha, coluna), pulando as desabilitadas na direção do movimento. */
  const mover = useCallback(
    (origem: HTMLElement, dLinha: number, dColuna: number) => {
      const grade = gradeRef.current;
      if (!grade) return;

      let linha = Number(origem.dataset.linha);
      let coluna = Number(origem.dataset.coluna);
      if (Number.isNaN(linha) || Number.isNaN(coluna)) return;

      // O laço existe por causa das linhas dispensadas: os campos delas estão
      // desabilitados, e parar em cima de uma prenderia a navegação.
      for (let i = 0; i < 500; i++) {
        linha += dLinha;
        coluna += dColuna;
        if (coluna < 0 || coluna >= COLUNAS_EDITAVEIS.length) return;
        if (linha < 0 || linha >= visiveis.length) return;

        const alvo = grade.querySelector<HTMLElement>(
          `[data-linha="${linha}"][data-coluna="${coluna}"]`
        );
        if (alvo && !(alvo as HTMLInputElement).disabled) {
          alvo.focus();
          if (alvo instanceof HTMLInputElement) alvo.select();
          alvo.scrollIntoView({ block: 'nearest', behavior: reduzido ? 'auto' : 'smooth' });
          return;
        }
        // Andando na horizontal, a linha inteira está desabilitada — não adianta
        // continuar procurando na mesma linha.
        if (dLinha === 0) return;
      }
    },
    [visiveis.length, reduzido]
  );

  /**
   * Atalhos da grade.
   *
   * As setas ↑↓ navegam em vez de trocar o valor do `<select>` — num `<select>`
   * fechado o Chrome muda a opção na seta, e numa tabela de 65 linhas isso vira
   * dado errado gravado sem ninguém perceber. Para escolher, digita-se a
   * inicial (type-ahead nativo) ou abre-se a lista com Alt+↓, que continua
   * passando direto.
   */
  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const alvo = e.target as HTMLElement;
      if (!alvo?.dataset?.linha) return;
      if (e.altKey) return; // Alt+↓ abre a lista nativa

      const ehTexto = alvo instanceof HTMLInputElement;
      const linhaIdx = Number(alvo.dataset.linha);
      const colunaIdx = Number(alvo.dataset.coluna);

      if (e.key === 'Enter') {
        e.preventDefault();
        mover(alvo, e.shiftKey ? -1 : 1, 0);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mover(alvo, e.key === 'ArrowDown' ? 1 : -1, 0);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Em campo de texto a seta é do cursor; só vira navegação quando o
        // cursor já está na ponta, como numa planilha.
        if (ehTexto) {
          const inp = alvo as HTMLInputElement;
          const naPonta =
            e.key === 'ArrowRight'
              ? inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length
              : inp.selectionStart === 0 && inp.selectionEnd === 0;
          if (!naPonta) return;
        }
        e.preventDefault();
        mover(alvo, 0, e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      // Ctrl+D repete o valor da linha de cima, como numa planilha.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const acima = visiveis[linhaIdx - 1];
        const atual = visiveis[linhaIdx];
        if (!acima || !atual || atual.inutilizado) return;
        const campo = COLUNAS_EDITAVEIS[colunaIdx] as ColunaEditavel;
        const valor = (acima[campo] ?? null) as string | null;
        if ((atual[campo] ?? null) === valor) return;
        salvarCampo(atual, { [campo]: valor } as EdicaoFicha);
      }
    },
    [mover, visiveis, salvarCampo]
  );

  // ─── Render ───

  if (!opcoes && carregando) {
    return (
      <div className="mx-auto max-w-[110rem] px-4 py-6">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-gray-200/50" />
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-gray-200/40" />
      </div>
    );
  }

  const transicaoLinha = reduzido ? { duration: 0 } : { duration: 0.18 };

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-6">
      {/* ── Cabeçalho ── */}
      <motion.div
        initial={reduzido ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-5 shadow-lg shadow-blue-600/20"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <ClipboardDocumentListIcon className="h-6 w-6 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white">Fiscal</h1>
            <p className="mt-0.5 text-sm text-blue-100">
              Perfil, volume de notas e envio de SPED por empresa. CNPJ, razão social, regime e
              benefício vêm do cadastro — aqui você preenche só as quatro últimas colunas.
            </p>
          </div>
          {/* Discreto de propósito: o questionário é ocasional, a ficha é o
              trabalho do dia. Um botão do mesmo peso disputaria o olho. */}
          <Link
            to="/fiscal/questionario"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <ClipboardDocumentCheckIcon className="h-4 w-4" />
            Questionário
          </Link>
        </div>
      </motion.div>

      {/* ── Painel do colaborador + indicadores ── */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {/* Colaborador, com a figura-herói da tela */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-md shadow-blue-500/30">
              {colaborador ? iniciais(colaborador.nome) : '—'}
            </span>
            <div className="min-w-0 flex-1">
              <label
                htmlFor="fiscal-colaborador"
                className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400"
              >
                Colaborador
              </label>
              <select
                id="fiscal-colaborador"
                value={colaboradorId ?? ''}
                onChange={(e) => setColaboradorId(Number(e.target.value))}
                className="-ml-1 w-full cursor-pointer rounded-lg border-0 bg-transparent px-1 py-0.5 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {colaboradores.map((c) => {
                  // O selecionado usa a contagem viva desta tela; os outros, a
                  // que veio do servidor. Sem isto o combo continuaria mostrando
                  // "3/17" depois de preencher a quarta linha.
                  const n = c.id === colaboradorId ? contagem : c;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({n.preenchidas}/{n.total})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div>
              {/* Figura-herói: uma só por tela. Proporcional, não tabular. */}
              <span
                className={`text-5xl font-bold leading-none transition-colors duration-300 ${
                  completo ? 'text-emerald-600' : 'text-blue-700'
                }`}
              >
                {pctAnimado}
                <span className="text-2xl font-semibold">%</span>
              </span>
              <p className="mt-1.5 text-xs text-gray-500">
                {contagem.preenchidas} de {contagem.total} respondidas
              </p>
            </div>
            <AnimatePresence>
              {completo && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="mb-1 flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  completa
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Medidor: trilho é um passo mais claro da MESMA rampa do preenchimento,
              não cinza — assim o estado se lê ao longo da barra inteira. */}
          <div
            className={`mt-3 h-2.5 overflow-hidden rounded-full transition-colors duration-300 ${
              completo ? 'bg-emerald-100' : 'bg-blue-100'
            }`}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso do preenchimento"
          >
            <motion.div
              className={`h-full rounded-full ${completo ? 'bg-emerald-500' : 'bg-blue-600'}`}
              animate={{ width: `${pct}%` }}
              transition={
                reduzido ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }
              }
            />
          </div>

          {/* A conclusão natural de "faltam 15": preencher. Fica colado ao
              número em vez de escondido na barra de ferramentas — é a ação
              principal da tela, e era a menos visível. */}
          {contagem.total > 0 && (
            <motion.button
              onClick={focarPendentes}
              whileHover={reduzido ? undefined : { y: -1 }}
              whileTap={reduzido ? undefined : { scale: 0.98 }}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-shadow hover:shadow-lg ${
                completo
                  ? 'bg-white text-gray-600 shadow-none ring-1 ring-gray-200 hover:bg-gray-50'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-blue-600/25 hover:shadow-blue-600/30'
              }`}
            >
              <RectangleStackIcon className="h-4 w-4" />
              {completo
                ? 'Revisar uma por uma'
                : `Preencher ${contagem.pendentes === 1 ? 'a que falta' : `as ${contagem.pendentes} que faltam`}`}
            </motion.button>
          )}
        </div>

        {/* Indicadores — cada um é também o filtro da lista */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Tile
              label="Na carteira"
              valor={contagem.total}
              tom="slate"
              icone={BuildingOffice2Icon}
              ativo={filtro === 'carteira'}
              onClick={() => setFiltro('carteira')}
              reduzido={reduzido}
            />
            <Tile
              label="Respondidas"
              valor={contagem.preenchidas}
              tom="emerald"
              icone={CheckCircleIcon}
              ativo={filtro === 'preenchidas'}
              onClick={() => setFiltro('preenchidas')}
              reduzido={reduzido}
            />
            <Tile
              label="Faltam responder"
              valor={contagem.pendentes}
              tom="amber"
              icone={PencilSquareIcon}
              ativo={filtro === 'pendentes'}
              onClick={() => setFiltro('pendentes')}
              reduzido={reduzido}
            />
            <Tile
              label="Não são minhas"
              valor={contagem.inutilizadas}
              tom="gray"
              icone={NoSymbolIcon}
              ativo={filtro === 'inutilizadas'}
              onClick={() => setFiltro('inutilizadas')}
              reduzido={reduzido}
            />
          </div>

          {/* Busca + adicionar */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="relative min-w-[16rem] flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por razão social, CNPJ ou código SCI"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  aria-label="Limpar filtro"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <motion.button
              onClick={() => abrirFoco()}
              disabled={visiveis.length === 0}
              whileHover={reduzido ? undefined : { y: -1 }}
              whileTap={reduzido ? undefined : { scale: 0.97 }}
              title="Uma empresa por vez, em tela cheia — a próxima entra sozinha ao responder as três"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition-shadow hover:shadow-lg hover:shadow-blue-600/30 disabled:opacity-50 disabled:shadow-none"
            >
              <RectangleStackIcon className="h-4 w-4" />
              Modo foco
            </motion.button>

            <motion.button
              onClick={() => setModalAdicionar(true)}
              disabled={colaboradorId === null}
              whileHover={reduzido ? undefined : { y: -1 }}
              whileTap={reduzido ? undefined : { scale: 0.97 }}
              title="Trazer para esta carteira uma empresa já cadastrada"
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Adicionar empresa
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── Alertas ── */}
      <AnimatePresence>
        {erro && (
          <motion.div
            key="erro"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{erro}</span>
            <button
              onClick={() => setErro(null)}
              className="shrink-0 text-red-400 hover:text-red-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {aviso && (
          <motion.div
            key="aviso"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{aviso}</span>
            <button
              onClick={() => setAviso(null)}
              className="shrink-0 text-amber-500 hover:text-amber-700"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabela ── */}
      <div
        ref={gradeRef}
        onKeyDown={aoTeclar}
        className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
      >
        <div className="max-h-[calc(100vh-26rem)] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              {/* Duas faixas de cabeçalho: o que vem pronto do cadastro e o que
                  se preenche. É a explicação de por que metade da linha não é
                  clicável, dita uma vez em vez de repetida em cada célula. */}
              <tr>
                <th className="border-b border-gray-100 bg-white px-4 pb-1 pt-3 text-left" />
                <th
                  colSpan={2}
                  className="border-b border-gray-100 bg-white px-3 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                >
                  <span className="inline-flex items-center gap-1">
                    <LockClosedIcon className="h-3 w-3" />
                    Do cadastro
                  </span>
                </th>
                <th
                  colSpan={4}
                  className="border-b border-l border-gray-100 bg-blue-50/40 px-3 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-blue-600"
                >
                  <span className="inline-flex items-center gap-1">
                    <PencilSquareIcon className="h-3 w-3" />
                    Preencher
                  </span>
                </th>
                <th className="border-b border-gray-100 bg-white" />
              </tr>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="min-w-[15rem] border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left font-semibold">
                  Empresa
                </th>
                <th className="border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left font-semibold">
                  Regime
                </th>
                <th className="border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left font-semibold">
                  Benefício
                </th>
                <th className="border-b border-l border-gray-200 bg-blue-50/60 px-3 py-2.5 text-left font-semibold text-blue-700">
                  Perfil
                </th>
                <th className="border-b border-gray-200 bg-blue-50/60 px-3 py-2.5 text-left font-semibold text-blue-700">
                  Volume de NF
                </th>
                <th className="border-b border-gray-200 bg-blue-50/60 px-3 py-2.5 text-left font-semibold text-blue-700">
                  SPED
                </th>
                <th className="border-b border-gray-200 bg-blue-50/60 px-3 py-2.5 text-left font-semibold text-blue-700">
                  Particularidade
                </th>
                <th className="border-b border-gray-200 bg-gray-50 px-3 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                    Carregando…
                  </td>
                </tr>
              )}

              {!carregando && visiveis.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <InboxIcon className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-400">
                      {linhas.length === 0
                        ? 'Nenhuma empresa nesta carteira ainda. Use "Adicionar empresa".'
                        : 'Nada corresponde a este filtro.'}
                    </p>
                  </td>
                </tr>
              )}

              <AnimatePresence initial={false}>
                {!carregando &&
                  visiveis.map((l, idx) => {
                    const st = status[l.id];
                    const completa = estaCompleta(l);
                    return (
                      <motion.tr
                        key={l.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={transicaoLinha}
                        className={`group ${st === 'salvo' ? 'linha-salva' : ''} ${
                          l.inutilizado ? 'bg-gray-50/70' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* Empresa */}
                        <td className="w-[25%] min-w-[15rem] max-w-0 border-b border-gray-50 px-4 py-2.5 align-middle">
                          <div className="flex items-center gap-2">
                            {/* Marcador de estado da linha: barra fina à esquerda */}
                            <motion.span
                              animate={{
                                backgroundColor: l.inutilizado
                                  ? '#d1d5db'
                                  : completa
                                  ? '#34d399'
                                  : '#fcd34d',
                              }}
                              transition={{ duration: reduzido ? 0 : 0.3 }}
                              className="h-8 w-1 shrink-0 rounded-full"
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => abrirFoco(idx)}
                                title={`${l.razaoSocial} — abrir no modo foco`}
                                className={`block w-full truncate text-left font-medium transition hover:text-blue-700 hover:underline ${
                                  l.inutilizado ? 'text-gray-400 line-through' : 'text-gray-900'
                                }`}
                              >
                                {l.razaoSocial}
                              </button>
                              <p className="truncate text-xs text-gray-500">
                                {formatCnpj(l.cnpj)}
                                {l.codigoSci ? ` · SCI ${l.codigoSci}` : ''}
                              </p>
                              {!l.clienteAtivo && (
                                <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                  inativa no cadastro
                                </span>
                              )}
                              {l.inutilizado && (
                                <p className="mt-0.5 truncate text-xs italic text-amber-600">
                                  não é minha
                                  {l.inutilizadoMotivo ? ` — ${l.inutilizadoMotivo}` : ''}
                                </p>
                              )}
                            </div>
                            <span className="w-5 shrink-0">
                              <AnimatePresence mode="wait">
                                {st === 'salvando' && (
                                  <motion.span
                                    key="s"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="block h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
                                  />
                                )}
                                {st === 'salvo' && (
                                  <motion.span
                                    key="ok"
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                    className="block"
                                  >
                                    <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                                  </motion.span>
                                )}
                                {st === 'erro' && (
                                  <motion.span
                                    key="e"
                                    animate={{ x: [0, 3, -3, 2, -2, 0] }}
                                    transition={{ duration: 0.35 }}
                                    className="block"
                                  >
                                    <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                          </div>
                        </td>

                        {/* Do cadastro — somente leitura */}
                        <td className="border-b border-gray-50 px-3 py-2.5 align-middle">
                          {l.regimeTributario ? (
                            <Chip>{l.regimeTributario}</Chip>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="w-[11%] max-w-0 border-b border-gray-50 px-3 py-2.5 align-middle">
                          {l.beneficiosFiscais ? (
                            <Chip tom="indigo" title={l.beneficiosFiscais}>
                              {l.beneficiosFiscais}
                            </Chip>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* Preencher */}
                        <td className="border-b border-l border-gray-50 bg-blue-50/20 px-3 py-2.5 align-middle">
                          <SelectCelula
                            valor={l.perfil}
                            opcoes={opcoes?.perfis ?? []}
                            desabilitado={l.inutilizado}
                            largura="w-full min-w-[7rem]"
                            linha={idx}
                            coluna={0}
                            onChange={(v) => salvarCampo(l, { perfil: v })}
                          />
                        </td>
                        <td className="border-b border-gray-50 bg-blue-50/20 px-3 py-2.5 align-middle">
                          <SelectCelula
                            valor={l.volumeNf}
                            opcoes={opcoes?.volumesNf ?? []}
                            desabilitado={l.inutilizado}
                            largura="w-full min-w-[9.5rem]"
                            linha={idx}
                            coluna={1}
                            onChange={(v) => salvarCampo(l, { volumeNf: v })}
                          />
                        </td>
                        <td className="border-b border-gray-50 bg-blue-50/20 px-3 py-2.5 align-middle">
                          <SelectCelula
                            valor={l.enviaSped}
                            opcoes={opcoes?.opcoesSped ?? []}
                            desabilitado={l.inutilizado}
                            largura="w-full min-w-[10.5rem]"
                            linha={idx}
                            coluna={2}
                            onChange={(v) => salvarCampo(l, { enviaSped: v })}
                          />
                        </td>
                        <td className="w-[16%] border-b border-gray-50 bg-blue-50/20 px-3 py-2.5 align-middle">
                          <input
                            defaultValue={l.particularidade ?? ''}
                            key={`${l.id}:${l.particularidade ?? ''}`}
                            data-linha={idx}
                            data-coluna={3}
                            disabled={l.inutilizado}
                            maxLength={opcoes?.particularidadeMax ?? 500}
                            placeholder="texto livre"
                            // Grava ao sair do campo, não a cada tecla: é texto
                            // livre e longo, e um PATCH por caractere entupiria a
                            // rede sem dar nada em troca.
                            onBlur={(e) => {
                              const novo = e.target.value.trim();
                              if (novo === (l.particularidade ?? '')) return;
                              salvarCampo(l, { particularidade: novo || null });
                            }}
                            className="w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm shadow-sm transition placeholder:text-gray-300 hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100"
                          />
                        </td>

                        {/* Ação */}
                        <td className="w-14 whitespace-nowrap border-b border-gray-50 px-2 py-2.5 text-right align-middle">
                          {l.inutilizado ? (
                            <button
                              onClick={() => reativar(l)}
                              title="Desfazer — voltar para a minha lista"
                              aria-label="Desfazer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            >
                              <ArrowUturnLeftIcon className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setLinhaInutilizar(l)}
                              title="Esta empresa não é minha"
                              aria-label="Marcar que esta empresa não é minha"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 group-hover:text-gray-400"
                            >
                              <NoSymbolIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Atalhos: a tabela é operável sem mouse, mas ninguém adivinha isso. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50/70 px-4 py-2 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla>
            <Tecla>←</Tecla>
            <Tecla>→</Tecla> navegam
          </span>
          <span className="flex items-center gap-1">
            <Tecla>Enter</Tecla> desce
          </span>
          <span className="flex items-center gap-1">
            digite a inicial para escolher · <Tecla>Alt</Tecla>+<Tecla>↓</Tecla> abre a lista
          </span>
          <span className="flex items-center gap-1">
            <Tecla>Ctrl</Tecla>+<Tecla>D</Tecla> repete a de cima
          </span>
        </div>
      </div>

      {colaborador && !carregando && (
        <p className="mt-3 px-1 text-xs text-gray-400">
          Mostrando {visiveis.length} {visiveis.length === 1 ? 'linha' : 'linhas'} · carteira de{' '}
          {colaborador.nome}
          {contagem.inutilizadas > 0 &&
            ` · ${contagem.inutilizadas} ${
              contagem.inutilizadas === 1 ? 'marcada' : 'marcadas'
            } como "não é minha"`}
        </p>
      )}

      <AnimatePresence>
        {modalAdicionar && colaboradorId !== null && (
          <ModalAdicionar
            colaboradorId={colaboradorId}
            nomeColaborador={colaborador?.nome ?? ''}
            onFechar={() => setModalAdicionar(false)}
            onAdicionada={(linha, av) => {
              setLinhas((ls) =>
                [...ls.filter((l) => l.id !== linha.id), linha].sort(
                  (x, y) =>
                    Number(x.inutilizado) - Number(y.inutilizado) ||
                    x.razaoSocial.localeCompare(y.razaoSocial, 'pt-BR')
                )
              );
              setAviso(av);
            }}
          />
        )}

        {foco && opcoes && (
          <ModoFoco
            sequencia={foco.sequencia}
            indiceInicial={foco.inicial}
            linhas={linhas}
            opcoes={opcoes}
            reduzido={reduzido}
            onSalvar={salvarCampo}
            onInutilizar={inutilizarDireto}
            onReativar={reativar}
            onFechar={() => setFoco(null)}
          />
        )}

        {linhaInutilizar && (
          <ModalInutilizar
            linha={linhaInutilizar}
            onFechar={() => setLinhaInutilizar(null)}
            onConfirmar={inutilizar}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Fiscal;
