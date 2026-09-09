import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  NoSymbolIcon,
  ArrowUturnLeftIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import type { EdicaoFicha, LinhaFicha, OpcoesFicha } from '../../services/fiscal';

/**
 * Modo foco — uma empresa por vez, em vez da tabela.
 *
 * A tabela continua sendo a casa: é onde se compara, confere e corrige. Este
 * modo existe para o trabalho oposto — a primeira passada em volume, em que
 * ver 17 linhas ao mesmo tempo só divide a atenção e deixa marcar a linha
 * errada. Aqui só existe uma empresa, com espaço para as opções virarem botão
 * (um clique em vez de abrir-escolher-fechar) e para mostrar dados do cadastro
 * que não cabem em coluna nenhuma.
 *
 * A SEQUÊNCIA É CONGELADA NA ABERTURA, de propósito. Ela nasce da lista que
 * estava na tela, mas guarda só os ids: se guardasse a posição, responder uma
 * empresa a tiraria do filtro "faltam responder" e a fila se reorganizaria sob
 * o dedo de quem está preenchendo — a próxima empresa mudaria de identidade
 * entre olhar e clicar. Os dados de cada cartão continuam vindo da lista viva,
 * então o que se grava aparece na hora; só a ORDEM é que fica parada.
 */

interface ModoFocoProps {
  /** Ids de `fiscal_ficha`, na ordem em que estavam na tela. Congelado. */
  sequencia: number[];
  /** Lista viva — de onde sai o conteúdo de cada cartão. */
  linhas: LinhaFicha[];
  indiceInicial: number;
  opcoes: OpcoesFicha;
  reduzido: boolean;
  onSalvar: (linha: LinhaFicha, edicao: EdicaoFicha) => Promise<void>;
  onInutilizar: (linha: LinhaFicha, motivo: string | null) => Promise<void>;
  onReativar: (linha: LinhaFicha) => Promise<void>;
  onFechar: () => void;
}

const formatCnpj = (cnpj: string | null) => {
  if (!cnpj) return '—';
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const estaCompleta = (l: LinhaFicha) => !!(l.perfil && l.volumeNf && l.enviaSped);

/** Tempo entre completar a terceira resposta e o cartão andar sozinho. */
const MS_AVANCO_AUTOMATICO = 750;

// ─── Grupo de escolha ───

interface GrupoProps {
  rotulo: string;
  valor: string | null;
  opcoes: string[];
  desabilitado?: boolean;
  onEscolher: (valor: string | null) => void;
}

/**
 * As opções viram botões, não `<select>`.
 *
 * É o que o espaço do cartão compra: escolher passa a ser um clique em vez de
 * abrir, procurar e fechar. Clicar na opção já marcada desmarca — é como se
 * desfaz uma resposta errada, já que aqui não existe a linha "—" do select.
 *
 * São `<button aria-pressed>` e não `<input type=radio>` de propósito: num
 * grupo de rádios nativo as setas ← → trocam a opção, e aqui elas são a
 * navegação entre empresas.
 */
const Grupo: React.FC<GrupoProps> = ({ rotulo, valor, opcoes, desabilitado, onEscolher }) => (
  <div className="py-3">
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {rotulo}
      </span>
      {!valor && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          falta
        </span>
      )}
    </div>
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const ativo = valor === o;
        return (
          <button
            key={o}
            type="button"
            disabled={desabilitado}
            aria-pressed={ativo}
            onClick={() => onEscolher(ativo ? null : o)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              disabled:cursor-not-allowed disabled:opacity-50
              ${
                ativo
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Componente ───

const ModoFoco: React.FC<ModoFocoProps> = ({
  sequencia,
  linhas,
  indiceInicial,
  opcoes,
  reduzido,
  onSalvar,
  onInutilizar,
  onReativar,
  onFechar,
}) => {
  const [indice, setIndice] = useState(indiceInicial);
  const [direcao, setDirecao] = useState(1);
  const [confirmandoInutilizar, setConfirmandoInutilizar] = useState(false);
  const [motivo, setMotivo] = useState('');

  const porId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);
  const atual = porId.get(sequencia[indice] ?? -1) ?? null;
  const anterior = indice > 0 ? porId.get(sequencia[indice - 1] ?? -1) ?? null : null;

  const total = sequencia.length;
  const respondidas = sequencia.filter((id) => {
    const l = porId.get(id);
    return l && !l.inutilizado && estaCompleta(l);
  }).length;

  // ─── Navegação ───

  const irPara = useCallback(
    (novo: number) => {
      if (novo < 0 || novo >= total) return;
      setDirecao(novo > indice ? 1 : -1);
      setIndice(novo);
      setConfirmandoInutilizar(false);
      setMotivo('');
    },
    [indice, total]
  );

  const proxima = useCallback(() => irPara(indice + 1), [irPara, indice]);
  const anteriorCartao = useCallback(() => irPara(indice - 1), [irPara, indice]);

  /**
   * Avanço automático ao completar a terceira resposta.
   *
   * É a ideia central do modo: terminar a empresa e a próxima entrar sozinha.
   * O atraso existe para a pessoa ver o cartão ficar verde antes de sair —
   * trocar no mesmo quadro em que se clica dá a impressão de que o clique errou
   * o alvo. Qualquer navegação manual cancela o timer pendente.
   */
  const completaRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Onde o clique COMEÇOU. Clicar fora fecha, mas selecionar texto dentro da
   * particularidade e soltar o botão fora do cartão também dispara um `click`
   * no fundo — e fechar aí apagaria o que a pessoa estava justamente marcando
   * para copiar. Só fecha quando o gesto inteiro aconteceu no fundo.
   */
  const gestoComecouNoFundo = useRef(false);

  const cancelarAvanco = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Ao trocar de cartão, o estado de referência é o do cartão novo — senão a
    // primeira renderização de uma empresa já respondida dispararia o avanço.
    completaRef.current = atual ? estaCompleta(atual) && !atual.inutilizado : false;
    cancelarAvanco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  useEffect(() => {
    if (!atual) return;
    const agoraCompleta = estaCompleta(atual) && !atual.inutilizado;
    if (agoraCompleta && !completaRef.current) {
      completaRef.current = true;
      if (indice < total - 1) {
        cancelarAvanco();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          proxima();
        }, reduzido ? 0 : MS_AVANCO_AUTOMATICO);
      }
    } else if (!agoraCompleta) {
      completaRef.current = false;
      cancelarAvanco();
    }
  }, [atual, indice, total, proxima, cancelarAvanco, reduzido]);

  useEffect(() => cancelarAvanco, [cancelarAvanco]);

  // ─── Teclado ───

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando =
        alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement;

      if (e.key === 'Escape') {
        if (confirmandoInutilizar) {
          setConfirmandoInutilizar(false);
          return;
        }
        onFechar();
        return;
      }
      // Num campo de texto as setas são do cursor, não da navegação.
      if (digitando) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        cancelarAvanco();
        proxima();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cancelarAvanco();
        anteriorCartao();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [proxima, anteriorCartao, onFechar, cancelarAvanco, confirmandoInutilizar]);

  // ─── Ações ───

  const salvar = (edicao: EdicaoFicha) => {
    if (!atual) return;
    cancelarAvanco();
    void onSalvar(atual, edicao);
  };

  /** Copia as três respostas da empresa anterior da sequência. */
  const repetirAnterior = () => {
    if (!atual || !anterior) return;
    cancelarAvanco();
    void onSalvar(atual, {
      perfil: anterior.perfil,
      volumeNf: anterior.volumeNf,
      enviaSped: anterior.enviaSped,
    });
  };

  const confirmarInutilizar = async () => {
    if (!atual) return;
    cancelarAvanco();
    await onInutilizar(atual, motivo.trim() || null);
    setConfirmandoInutilizar(false);
    setMotivo('');
    if (indice < total - 1) proxima();
  };

  if (!atual) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-2xl">
          <p className="text-sm text-gray-500">Esta empresa saiu da lista.</p>
          <button
            onClick={onFechar}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Voltar à tabela
          </button>
        </div>
      </div>
    );
  }

  const completa = estaCompleta(atual);
  const pct = total > 0 ? Math.round((respondidas / total) * 100) : 0;

  const variantes = {
    entra: (d: number) => ({ opacity: 0, x: reduzido ? 0 : d * 40 }),
    centro: { opacity: 1, x: 0 },
    sai: (d: number) => ({ opacity: 0, x: reduzido ? 0 : d * -40 }),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => {
        gestoComecouNoFundo.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!gestoComecouNoFundo.current) return;
        cancelarAvanco();
        onFechar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Barra superior: posição, progresso e saída */}
        <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  cancelarAvanco();
                  anteriorCartao();
                }}
                disabled={indice === 0}
                aria-label="Empresa anterior"
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold tabular-nums text-white">
                {indice + 1} <span className="font-normal text-blue-200">de {total}</span>
              </span>
              <button
                onClick={() => {
                  cancelarAvanco();
                  proxima();
                }}
                disabled={indice >= total - 1}
                aria-label="Próxima empresa"
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-blue-100 sm:block">
                {respondidas} respondidas
              </span>
              <button
                onClick={onFechar}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
              >
                <XMarkIcon className="h-4 w-4" />
                Voltar à tabela
              </button>
            </div>
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-blue-900/40">
            <motion.div
              className="h-full rounded-full bg-white/90"
              animate={{ width: `${pct}%` }}
              transition={reduzido ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
        </div>

        {/* Cartão */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" custom={direcao} initial={false}>
            <motion.div
              key={atual.id}
              custom={direcao}
              variants={variantes}
              initial="entra"
              animate="centro"
              exit="sai"
              transition={reduzido ? { duration: 0 } : { duration: 0.2 }}
              className="px-6 py-5"
            >
              {/* Identificação — o que o cartão tem espaço de mostrar */}
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    atual.inutilizado
                      ? 'bg-gray-100 text-gray-400'
                      : completa
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-amber-100 text-amber-600'
                  }`}
                >
                  {completa && !atual.inutilizado ? (
                    <CheckCircleIcon className="h-5 w-5" />
                  ) : (
                    <BuildingOffice2Icon className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    className={`text-lg font-bold leading-tight ${
                      atual.inutilizado ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {atual.razaoSocial}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatCnpj(atual.cnpj)}
                    {atual.codigoSci ? ` · SCI ${atual.codigoSci}` : ''}
                    {atual.municipio ? ` · ${atual.municipio}${atual.uf ? `/${atual.uf}` : ''}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {atual.regimeTributario && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {atual.regimeTributario}
                      </span>
                    )}
                    {atual.beneficiosFiscais && (
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {atual.beneficiosFiscais}
                      </span>
                    )}
                    {!atual.clienteAtivo && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        inativa no cadastro
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {atual.inutilizado ? (
                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-center">
                  <NoSymbolIcon className="mx-auto h-7 w-7 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-600">
                    Marcada como “não é minha”
                  </p>
                  {atual.inutilizadoMotivo && (
                    <p className="mt-0.5 text-xs italic text-amber-600">{atual.inutilizadoMotivo}</p>
                  )}
                  <button
                    onClick={() => void onReativar(atual)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4" />
                    Desfazer
                  </button>
                </div>
              ) : (
                <div className="mt-3 divide-y divide-gray-100">
                  <Grupo
                    rotulo="Perfil"
                    valor={atual.perfil}
                    opcoes={opcoes.perfis}
                    onEscolher={(v) => salvar({ perfil: v })}
                  />
                  <Grupo
                    rotulo="Volume de NF"
                    valor={atual.volumeNf}
                    opcoes={opcoes.volumesNf}
                    onEscolher={(v) => salvar({ volumeNf: v })}
                  />
                  <Grupo
                    rotulo="SPED"
                    valor={atual.enviaSped}
                    opcoes={opcoes.opcoesSped}
                    onEscolher={(v) => salvar({ enviaSped: v })}
                  />

                  <div className="py-3">
                    <label
                      htmlFor="foco-particularidade"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                    >
                      Particularidade{' '}
                      <span className="font-normal normal-case tracking-normal text-gray-400">
                        (opcional)
                      </span>
                    </label>
                    <input
                      id="foco-particularidade"
                      key={`${atual.id}:${atual.particularidade ?? ''}`}
                      defaultValue={atual.particularidade ?? ''}
                      maxLength={opcoes.particularidadeMax}
                      placeholder="O que essa empresa tem de diferente das outras"
                      onBlur={(e) => {
                        const novo = e.target.value.trim();
                        if (novo === (atual.particularidade ?? '')) return;
                        salvar({ particularidade: novo || null });
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Rodapé de ações */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <AnimatePresence mode="wait">
            {confirmandoInutilizar ? (
              <motion.div
                key="confirma"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  autoFocus
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={255}
                  placeholder="Motivo (opcional) — ex.: passou para o Arthur"
                  className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  onClick={() => setConfirmandoInutilizar(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmarInutilizar()}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
                >
                  Confirmar
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="acoes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <button
                  onClick={() => setConfirmandoInutilizar(true)}
                  disabled={atual.inutilizado}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
                >
                  <NoSymbolIcon className="h-4 w-4" />
                  Não é minha
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={repetirAnterior}
                    disabled={!anterior || atual.inutilizado}
                    title={
                      anterior
                        ? `Copiar as respostas de ${anterior.razaoSocial}`
                        : 'Não há empresa anterior nesta sequência'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                    Repetir anterior
                  </button>
                  <button
                    onClick={() => {
                      cancelarAvanco();
                      proxima();
                    }}
                    disabled={indice >= total - 1}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:shadow-lg disabled:opacity-40 disabled:shadow-none"
                  >
                    Próxima
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-2 text-center text-[11px] text-gray-400">
            ← → mudam de empresa · Esc volta à tabela · ao responder as três, a próxima entra
            sozinha
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ModoFoco;
