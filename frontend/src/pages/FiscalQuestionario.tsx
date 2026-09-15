import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  UsersIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import fiscalService, { CHAVE_COLABORADOR, PREFIXO_OBSERVACAO } from '../services/fiscal';
import type {
  Colaborador,
  MapaRespostas,
  PerguntaDefinicao,
  QuestionarioDefinicao,
  RespostaQuestionario,
} from '../services/fiscal';

/**
 * Questionário da aba Fiscal — o analista responde no app, não num HTML por
 * link, e a resposta fica gravada no nome dele.
 *
 * Duas telas no mesmo lugar: RESPONDER (o formulário, com autosave) e
 * CONSOLIDADO (quem marcou o quê, por pergunta). O consolidado existe porque a
 * pergunta que o time faz depois não é "o que eu respondi", é "a equipe
 * concorda?" — e isso só se lê com as respostas lado a lado.
 *
 * O formulário é montado a partir da definição que vem do backend
 * (/api/fiscal/questionarios/:slug), que é a MESMA estrutura usada lá para
 * validar o que chega. Nada de enunciado ou opção está escrito nesta tela.
 */

/**
 * Por ora existe um questionário só, e a rota é /fiscal/questionario (sem
 * slug). Quando houver o segundo, a rota ganha `:slug` e esta constante vira
 * `useParams()` — a página inteira já trabalha em cima da definição que chega.
 */
const SLUG = 'cfop-xml-ou-sped';

/** Espera depois da última tecla antes de gravar. */
const DEBOUNCE_MS = 900;

type Status = 'ocioso' | 'salvando' | 'salvo' | 'erro';
type Modo = 'responder' | 'consolidado';

/** Uma resposta conta como "respondeu" se marcou ao menos uma pergunta. */
const temResposta = (r: RespostaQuestionario) =>
  Object.keys(r.respostas).some((k) => !k.startsWith(PREFIXO_OBSERVACAO)) ||
  !!(r.observacoes && r.observacoes.trim());

const horaCurta = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/** Todas as perguntas, achatadas — a numeração e a consolidação andam por aqui. */
const perguntasDe = (d: QuestionarioDefinicao) => d.secoes.flatMap((s) => s.perguntas);

export default function FiscalQuestionario(): React.ReactElement {
  const reduzido = useReducedMotion();

  const [definicao, setDefinicao] = useState<QuestionarioDefinicao | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [colaboradorId, setColaboradorId] = useState<number | null>(null);
  const [respostas, setRespostas] = useState<MapaRespostas>({});
  const [observacoes, setObservacoes] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>('ocioso');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const [modo, setModo] = useState<Modo>('responder');
  const [consolidado, setConsolidado] = useState<RespostaQuestionario[] | null>(null);
  const [carregandoConsolidado, setCarregandoConsolidado] = useState(false);

  // O timer do autosave e o que ainda não foi gravado. Em ref, não em estado:
  // mudar isto não redesenha nada, e o valor precisa sobreviver ao re-render
  // que a própria digitação provoca.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendenteRef = useRef<{ respostas: MapaRespostas; observacoes: string } | null>(null);
  const colaboradorIdRef = useRef<number | null>(null);

  useEffect(() => {
    colaboradorIdRef.current = colaboradorId;
  }, [colaboradorId]);

  // ─── Carga inicial ───

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [def, colabs] = await Promise.all([
          fiscalService.questionario(SLUG),
          fiscalService.colaboradores(),
        ]);
        if (!vivo) return;
        setDefinicao(def);
        setColaboradores(colabs);
        // Só restaura quem já estava escolhido. Escolher sozinho seria pior:
        // a pessoa responderia 21 perguntas no nome de outra.
        const salvo = Number(localStorage.getItem(CHAVE_COLABORADOR));
        if (salvo && colabs.some((c) => c.id === salvo)) setColaboradorId(salvo);
      } catch (e: any) {
        if (vivo) setErro(e?.message || 'Não foi possível carregar o questionário.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // ─── Respostas do colaborador escolhido ───

  useEffect(() => {
    if (colaboradorId === null) {
      setRespostas({});
      setObservacoes('');
      setStatus('ocioso');
      setSalvoEm(null);
      return;
    }
    localStorage.setItem(CHAVE_COLABORADOR, String(colaboradorId));

    let vivo = true;
    (async () => {
      // Trocar de pessoa no meio de um autosave gravaria a resposta dela no
      // nome do outro. Descarta o pendente antes de buscar.
      if (timerRef.current) clearTimeout(timerRef.current);
      pendenteRef.current = null;
      try {
        const linha = await fiscalService.questionarioResposta(SLUG, colaboradorId);
        if (!vivo) return;
        setRespostas(linha?.respostas ?? {});
        setObservacoes(linha?.observacoes ?? '');
        setSalvoEm(linha?.atualizadoEm ?? null);
        setStatus(linha ? 'salvo' : 'ocioso');
        setErroSalvar(null);
      } catch (e: any) {
        if (vivo) setErroSalvar(e?.message || 'Não foi possível carregar suas respostas.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [colaboradorId]);

  // ─── Autosave ───

  const gravar = useCallback(async () => {
    const id = colaboradorIdRef.current;
    const pendente = pendenteRef.current;
    if (id === null || !pendente) return;
    pendenteRef.current = null;
    setStatus('salvando');
    try {
      const linha = await fiscalService.salvarQuestionario(
        SLUG,
        id,
        pendente.respostas,
        pendente.observacoes.trim() === '' ? null : pendente.observacoes
      );
      setStatus('salvo');
      setSalvoEm(linha.atualizadoEm ?? new Date().toISOString());
      setErroSalvar(null);
    } catch (e: any) {
      setStatus('erro');
      setErroSalvar(e?.message || 'Não foi possível salvar.');
    }
  }, []);

  const agendar = useCallback(
    (proximas: MapaRespostas, proximasObs: string) => {
      if (colaboradorIdRef.current === null) return;
      pendenteRef.current = { respostas: proximas, observacoes: proximasObs };
      setStatus('salvando');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void gravar();
      }, DEBOUNCE_MS);
    },
    [gravar]
  );

  // Sair da página no meio do debounce perderia a última marcação — e a pessoa
  // não tem como saber disso. Grava o que ficou pendente.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendenteRef.current) void gravar();
    },
    [gravar]
  );

  const aplicar = useCallback(
    (proximas: MapaRespostas) => {
      setRespostas(proximas);
      agendar(proximas, observacoes);
    },
    [agendar, observacoes]
  );

  const marcarUnica = useCallback(
    (pergunta: PerguntaDefinicao, valor: string) => {
      aplicar({ ...respostas, [pergunta.id]: valor });
    },
    [aplicar, respostas]
  );

  const alternarMultipla = useCallback(
    (pergunta: PerguntaDefinicao, valor: string) => {
      const atual = respostas[pergunta.id];
      const lista = Array.isArray(atual) ? atual : [];
      const proxima = lista.includes(valor)
        ? lista.filter((v) => v !== valor)
        : [...lista, valor];
      const proximas = { ...respostas };
      // Lista vazia é "não respondeu", não "respondeu nada": some com a chave,
      // para o consolidado não contar quem desmarcou tudo como respondente.
      if (proxima.length === 0) delete proximas[pergunta.id];
      else proximas[pergunta.id] = proxima;
      aplicar(proximas);
    },
    [aplicar, respostas]
  );

  const mudarObsPergunta = useCallback(
    (pergunta: PerguntaDefinicao, texto: string) => {
      const chave = `${PREFIXO_OBSERVACAO}${pergunta.id}`;
      const proximas = { ...respostas };
      if (texto === '') delete proximas[chave];
      else proximas[chave] = texto;
      aplicar(proximas);
    },
    [aplicar, respostas]
  );

  const mudarObservacoesGerais = useCallback(
    (texto: string) => {
      setObservacoes(texto);
      agendar(respostas, texto);
    },
    [agendar, respostas]
  );

  // ─── Consolidado ───

  const abrirConsolidado = useCallback(async () => {
    setModo('consolidado');
    setCarregandoConsolidado(true);
    try {
      const linhas = await fiscalService.questionarioRespostas(SLUG);
      setConsolidado(linhas);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o consolidado.');
    } finally {
      setCarregandoConsolidado(false);
    }
  }, []);

  const perguntas = useMemo(() => (definicao ? perguntasDe(definicao) : []), [definicao]);

  const respondidas = useMemo(
    () => perguntas.filter((p) => respostas[p.id] !== undefined).length,
    [perguntas, respostas]
  );

  const somenteLeitura = colaboradorId === null;

  // ─── Render ───

  if (carregando) {
    return (
      <div className="mx-auto max-w-[110rem] px-4 py-6">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-gray-200/50" />
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-gray-200/40" />
      </div>
    );
  }

  if (!definicao) {
    return (
      <div className="mx-auto max-w-[110rem] px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {erro || 'Questionário não encontrado.'}
          <div className="mt-3">
            <Link to="/fiscal" className="font-semibold text-red-800 underline">
              ← Fiscal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-6 pb-24">
      {/* ── Cabeçalho ── */}
      <motion.div
        initial={reduzido ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-5 shadow-lg shadow-blue-600/20"
      >
        <Link
          to="/fiscal"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-100 transition hover:text-white"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Fiscal
        </Link>

        <div className="mt-3 flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            {definicao.chapeu && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                {definicao.chapeu}
              </p>
            )}
            <h1 className="text-2xl font-bold text-white">{definicao.titulo}</h1>
            <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-blue-100">
              {definicao.lead}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (modo === 'consolidado' ? setModo('responder') : void abrirConsolidado())}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            {modo === 'consolidado' ? (
              <>
                <PencilSquareIcon className="h-4 w-4" />
                Responder
              </>
            ) : (
              <>
                <UsersIcon className="h-4 w-4" />
                Ver consolidado
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* ── Quem está respondendo ── */}
      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[16rem]">
            <label
              htmlFor="questionario-colaborador"
              className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400"
            >
              Respondido por
            </label>
            <select
              id="questionario-colaborador"
              value={colaboradorId ?? ''}
              onChange={(e) =>
                setColaboradorId(e.target.value === '' ? null : Number(e.target.value))
              }
              className="mt-1 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">— escolha quem está respondendo —</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {!somenteLeitura && modo === 'responder' && (
            <p className="text-sm text-gray-500">
              <span className="text-2xl font-bold text-blue-700">{respondidas}</span>
              <span className="ml-1">de {perguntas.length} perguntas respondidas</span>
            </p>
          )}
        </div>

        {somenteLeitura && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Escolha quem está respondendo para começar. Até lá o questionário fica só para
              leitura — nada é gravado.
            </span>
          </div>
        )}
      </div>

      {/* ── Como responder ── */}
      {modo === 'responder' && definicao.comoResponder.length > 0 && (
        <div className="mb-6 rounded-2xl border-l-4 border-blue-500 bg-blue-50/60 px-5 py-4">
          {definicao.comoResponder.map((paragrafo, i) => (
            <p key={i} className={`text-sm leading-relaxed text-gray-700 ${i > 0 ? 'mt-2' : ''}`}>
              {paragrafo}
            </p>
          ))}
        </div>
      )}

      {erro && modo === 'consolidado' && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {modo === 'responder' ? (
        <FormularioQuestionario
          definicao={definicao}
          respostas={respostas}
          observacoes={observacoes}
          somenteLeitura={somenteLeitura}
          aoMarcarUnica={marcarUnica}
          aoAlternarMultipla={alternarMultipla}
          aoMudarObs={mudarObsPergunta}
          aoMudarObservacoesGerais={mudarObservacoesGerais}
        />
      ) : (
        <VisaoConsolidada
          definicao={definicao}
          linhas={consolidado}
          totalColaboradores={colaboradores.length}
          carregando={carregandoConsolidado}
        />
      )}

      {/* ── Indicador de gravação ── */}
      {modo === 'responder' && !somenteLeitura && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
              status === 'erro'
                ? 'bg-red-600 text-white'
                : status === 'salvando'
                  ? 'bg-gray-800 text-white'
                  : 'bg-emerald-600 text-white'
            }`}
          >
            {status === 'erro' ? (
              <>
                <ExclamationTriangleIcon className="h-4 w-4" />
                {erroSalvar || 'Não foi possível salvar.'}
              </>
            ) : status === 'salvando' ? (
              <>
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : status === 'salvo' ? (
              <>
                <CheckCircleIcon className="h-4 w-4" />
                Salvo{salvoEm ? ` às ${horaCurta(salvoEm)}` : ''}
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-4 w-4" />
                As respostas são salvas sozinhas
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formulário ───

interface FormularioProps {
  definicao: QuestionarioDefinicao;
  respostas: MapaRespostas;
  observacoes: string;
  somenteLeitura: boolean;
  aoMarcarUnica: (p: PerguntaDefinicao, valor: string) => void;
  aoAlternarMultipla: (p: PerguntaDefinicao, valor: string) => void;
  aoMudarObs: (p: PerguntaDefinicao, texto: string) => void;
  aoMudarObservacoesGerais: (texto: string) => void;
}

function FormularioQuestionario({
  definicao,
  respostas,
  observacoes,
  somenteLeitura,
  aoMarcarUnica,
  aoAlternarMultipla,
  aoMudarObs,
  aoMudarObservacoesGerais,
}: FormularioProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {definicao.secoes.map((secao) => (
        <section
          key={secao.codigo}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-baseline gap-3 text-[13px] font-semibold uppercase tracking-widest text-blue-700">
            <span className="font-mono text-gray-400">{secao.codigo}</span>
            {secao.titulo}
          </h2>
          {secao.intro && (
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-gray-500">{secao.intro}</p>
          )}

          <div className="mt-5 divide-y divide-gray-100">
            {secao.perguntas.map((pergunta) => (
              <Pergunta
                key={pergunta.id}
                pergunta={pergunta}
                respostas={respostas}
                somenteLeitura={somenteLeitura}
                aoMarcarUnica={aoMarcarUnica}
                aoAlternarMultipla={aoAlternarMultipla}
                aoMudarObs={aoMudarObs}
              />
            ))}
          </div>

          {secao.observacoesGerais && (
            <textarea
              aria-label="Observações gerais"
              value={observacoes}
              disabled={somenteLeitura}
              onChange={(e) => aoMudarObservacoesGerais(e.target.value)}
              placeholder={secao.observacoesGerais.placeholder}
              className="mt-4 min-h-[8rem] w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-solid focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
            />
          )}
        </section>
      ))}
    </div>
  );
}

interface PerguntaProps {
  pergunta: PerguntaDefinicao;
  respostas: MapaRespostas;
  somenteLeitura: boolean;
  aoMarcarUnica: (p: PerguntaDefinicao, valor: string) => void;
  aoAlternarMultipla: (p: PerguntaDefinicao, valor: string) => void;
  aoMudarObs: (p: PerguntaDefinicao, texto: string) => void;
}

function Pergunta({
  pergunta,
  respostas,
  somenteLeitura,
  aoMarcarUnica,
  aoAlternarMultipla,
  aoMudarObs,
}: PerguntaProps): React.ReactElement {
  const valor = respostas[pergunta.id];
  const marcadas = Array.isArray(valor) ? valor : [];
  const obs = respostas[`${PREFIXO_OBSERVACAO}${pergunta.id}`];

  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 py-5 first:pt-0">
      {/* O número em coluna própria, como num formulário de papel: o olho desce
          pela borda esquerda e acha a pergunta 14 sem ler as treze anteriores. */}
      <span className="pt-0.5 font-mono text-sm text-gray-400">{pergunta.numero}</span>

      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug text-gray-900">
          {pergunta.enunciado}
        </p>

        {pergunta.caso && pergunta.caso.length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {pergunta.caso.map((linha, i) => (
              <React.Fragment key={i}>
                <dt className="pt-0.5 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                  {linha.rotulo}
                </dt>
                <dd className="tabular-nums">{linha.texto}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}

        {pergunta.opcoes && pergunta.opcoes.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {pergunta.opcoes.map((opcao) => {
              const multipla = pergunta.tipo === 'multipla';
              const marcada = multipla ? marcadas.includes(opcao.valor) : valor === opcao.valor;
              return (
                <label
                  key={opcao.valor}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                    marcada
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                  } ${somenteLeitura ? 'cursor-default opacity-70' : ''}`}
                >
                  <input
                    type={multipla ? 'checkbox' : 'radio'}
                    name={pergunta.id}
                    value={opcao.valor}
                    checked={marcada}
                    disabled={somenteLeitura}
                    onChange={() =>
                      multipla
                        ? aoAlternarMultipla(pergunta, opcao.valor)
                        : aoMarcarUnica(pergunta, opcao.valor)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="text-sm leading-snug text-gray-800">{opcao.texto}</span>
                </label>
              );
            })}
          </div>
        )}

        {pergunta.tipo === 'texto' && (
          <textarea
            aria-label={pergunta.enunciado}
            value={typeof valor === 'string' ? valor : ''}
            disabled={somenteLeitura}
            onChange={(e) => aoMarcarUnica(pergunta, e.target.value)}
            className="mt-3 min-h-[5rem] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
          />
        )}

        {pergunta.defineNoMotor && (
          <p className="mt-2.5 flex flex-wrap items-baseline gap-2 text-xs text-gray-500">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-blue-600">
              Define no motor
            </span>
            <span className="min-w-0">{pergunta.defineNoMotor}</span>
          </p>
        )}

        <textarea
          aria-label={`Observação da pergunta ${pergunta.numero}`}
          value={typeof obs === 'string' ? obs : ''}
          disabled={somenteLeitura}
          onChange={(e) => aoMudarObs(pergunta, e.target.value)}
          placeholder={pergunta.placeholderObs || 'Observação (opcional)'}
          className="mt-2 min-h-[2.75rem] w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-solid focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

// ─── Consolidado ───

interface ConsolidadoProps {
  definicao: QuestionarioDefinicao;
  linhas: RespostaQuestionario[] | null;
  totalColaboradores: number;
  carregando: boolean;
}

function VisaoConsolidada({
  definicao,
  linhas,
  totalColaboradores,
  carregando,
}: ConsolidadoProps): React.ReactElement {
  if (carregando || linhas === null) {
    return <div className="h-64 animate-pulse rounded-2xl bg-gray-200/50" />;
  }

  const responderam = linhas.filter(temResposta);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <p className="text-sm text-gray-600">
          <span className="text-2xl font-bold text-blue-700">{responderam.length}</span>
          <span className="ml-1">
            de {totalColaboradores} colaboradores responderam
          </span>
        </p>
        {responderam.length > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {responderam.map((r) => r.colaboradorNome).join(' · ')}
          </p>
        )}
      </div>

      {definicao.secoes.map((secao) => (
        <section
          key={secao.codigo}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-baseline gap-3 text-[13px] font-semibold uppercase tracking-widest text-blue-700">
            <span className="font-mono text-gray-400">{secao.codigo}</span>
            {secao.titulo}
          </h2>

          <div className="mt-5 divide-y divide-gray-100">
            {secao.perguntas.map((pergunta) => (
              <PerguntaConsolidada key={pergunta.id} pergunta={pergunta} linhas={linhas} />
            ))}
          </div>

          {secao.observacoesGerais && (
            <div className="mt-4 space-y-2">
              {linhas
                .filter((l) => l.observacoes && l.observacoes.trim())
                .map((l) => (
                  <ObservacaoDe key={l.id} nome={l.colaboradorNome} texto={l.observacoes as string} />
                ))}
              {linhas.every((l) => !l.observacoes || !l.observacoes.trim()) && (
                <p className="text-sm text-gray-400">Ninguém deixou observações gerais.</p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function PerguntaConsolidada({
  pergunta,
  linhas,
}: {
  pergunta: PerguntaDefinicao;
  linhas: RespostaQuestionario[];
}): React.ReactElement {
  /** Quem marcou cada opção. Múltipla escolha aparece em mais de uma lista. */
  const quemMarcou = (valorOpcao: string) =>
    linhas
      .filter((l) => {
        const v = l.respostas[pergunta.id];
        return Array.isArray(v) ? v.includes(valorOpcao) : v === valorOpcao;
      })
      .map((l) => l.colaboradorNome);

  const observacoes = linhas
    .map((l) => ({
      nome: l.colaboradorNome,
      texto: l.respostas[`${PREFIXO_OBSERVACAO}${pergunta.id}`],
    }))
    .filter((o) => typeof o.texto === 'string' && o.texto.trim() !== '') as {
    nome: string;
    texto: string;
  }[];

  const respostasEmTexto = linhas
    .map((l) => ({ nome: l.colaboradorNome, texto: l.respostas[pergunta.id] }))
    .filter((o) => typeof o.texto === 'string' && o.texto.trim() !== '') as {
    nome: string;
    texto: string;
  }[];

  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 py-5 first:pt-0">
      <span className="pt-0.5 font-mono text-sm text-gray-400">{pergunta.numero}</span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug text-gray-900">
          {pergunta.enunciado}
        </p>

        {pergunta.opcoes && pergunta.opcoes.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {pergunta.opcoes.map((opcao) => {
              const nomes = quemMarcou(opcao.valor);
              return (
                <li
                  key={opcao.valor}
                  className={`rounded-lg border px-3 py-2 ${
                    nomes.length > 0 ? 'border-blue-200 bg-blue-50/60' : 'border-gray-100'
                  }`}
                >
                  <p
                    className={`text-sm leading-snug ${
                      nomes.length > 0 ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {opcao.texto}
                  </p>
                  {nomes.length > 0 && (
                    <p className="mt-1 text-xs font-semibold text-blue-700">
                      {nomes.join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pergunta.tipo === 'texto' && respostasEmTexto.length > 0 && (
          <div className="mt-3 space-y-2">
            {respostasEmTexto.map((r) => (
              <ObservacaoDe key={r.nome} nome={r.nome} texto={r.texto} />
            ))}
          </div>
        )}

        {observacoes.length > 0 && (
          <div className="mt-3 space-y-2">
            {observacoes.map((o) => (
              <ObservacaoDe key={o.nome} nome={o.nome} texto={o.texto} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ObservacaoDe({ nome, texto }: { nome: string; texto: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{nome}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{texto}</p>
    </div>
  );
}
