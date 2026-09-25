/**
 * Trabalhista > DARF — a carteira do lote mensal da Acessórias.
 *
 * Quem está nesta lista tem, todo mês e sem ninguém clicar, o DARF
 * previdenciário emitido, gravado na pasta que o robô da Acessórias lê e
 * relatado por e-mail ao DP.
 *
 * POR QUE A TELA MOSTRA A ÚLTIMA RODADA JUNTO DA LISTA:
 *   A pergunta que traz alguém aqui quase nunca é "quem está no lote?" — é
 *   "a competência passada saiu?". Separar as duas coisas em telas diferentes
 *   obrigaria a abrir o e-mail para responder a segunda.
 *
 * DESLIGAR NÃO É REMOVER, e os dois existem de propósito. Desligar guarda a
 * linha e o histórico de quando o cliente entrou — é o que se faz quando ele
 * sai da rotina, que costuma ser temporário. Remover é para quem entrou errado.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  darfLoteService,
  formatCnpj,
  formatMoeda,
  itensDaExecucao,
  abortoDaExecucao,
  type ClienteLote,
  type ExecucaoLote,
} from '../../services/darf';
import { useToast } from '../../hooks/useToast';
import { clientesService } from '../../services/clientes';
import type { Cliente } from '../../types';

/** Espera entre a última tecla e a busca — evita uma requisição por letra. */
const DEBOUNCE_MS = 250;

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const competencia = (mes: string, ano: string): string =>
  `${MES_CURTO[Number(mes) - 1] ?? mes}/${ano}`;

const quando = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** Cartão da rodada mais recente — o resumo que responde "saiu ou não saiu?". */
const UltimaRodada: React.FC<{ execucao: ExecucaoLote }> = ({ execucao }) => {
  const abortado = abortoDaExecucao(execucao);
  const itens = itensDaExecucao(execucao);
  const falhas = itens.filter((i) => i.status === 'falha');
  const entregues = itens.length - falhas.length;

  if (abortado) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-800">
              A rodada de {competencia(execucao.mes_pa, execucao.ano_pa)} não foi executada
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-red-700">{abortado}</p>
            <p className="mt-1 text-[10px] text-red-500">{quando(execucao.iniciado_em)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">
          Última rodada · {competencia(execucao.mes_pa, execucao.ano_pa)}
          <span className="ml-2 font-normal text-gray-500">{quando(execucao.iniciado_em)}</span>
        </p>
        {/* Relatório não enviado não invalida a rodada — as guias estão na
            pasta —, mas ninguém foi avisado, e isso precisa aparecer. */}
        {execucao.email_enviado ? (
          <span className="text-[11px] text-gray-500">relatório enviado ao DP</span>
        ) : (
          <span className="text-[11px] font-medium text-amber-700">relatório NÃO enviado</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {entregues} {entregues === 1 ? 'guia na pasta' : 'guias na pasta'}
        </span>
        {execucao.reaproveitados > 0 && (
          <span className="text-gray-500">{execucao.reaproveitados} já emitidas antes</span>
        )}
        {falhas.length > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            {falhas.length} sem guia
          </span>
        )}
        {Number(execucao.valor_total ?? 0) > 0 && (
          <span className="tabular-nums font-semibold text-gray-700">
            {formatMoeda(execucao.valor_total)}
          </span>
        )}
      </div>

      {/* O motivo por extenso, e não só a contagem: é o que diz se o caso é
          "não teve movimento" ou "a declaração não foi transmitida". */}
      {falhas.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-gray-200 pt-2">
          {falhas.map((f) => (
            <li key={f.cnpj} className="text-[11px] leading-relaxed text-gray-600">
              <span className="font-medium text-gray-800">
                {f.razaoSocial || formatCnpj(f.cnpj)}
              </span>
              {' — '}
              {f.erro}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const LoteAcessorias: React.FC = () => {
  const toast = useToast();
  const [lista, setLista] = useState<ClienteLote[]>([]);
  const [execucao, setExecucao] = useState<ExecucaoLote | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [novoCnpj, setNovoCnpj] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [sugestoes, setSugestoes] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  // Resposta que chega fora de ordem (termo antigo mais lento que o novo) não
  // pode sobrescrever a lista do termo atual.
  const buscaSeq = useRef(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Em paralelo: são duas leituras independentes, e encadeá-las só somaria
      // as duas esperas.
      const [clientes, execucoes] = await Promise.all([
        darfLoteService.listar(),
        darfLoteService.execucoes(1),
      ]);
      setLista(clientes);
      setExecucao(execucoes[0] ?? null);
    } catch {
      toast.error('Não foi possível carregar a carteira do lote.');
    } finally {
      setCarregando(false);
    }
    // `toast` FICA DE FORA DAS DEPENDÊNCIAS DE PROPÓSITO, e isto não é
    // desleixo: `useToast()` devolve um objeto novo a cada render, e o próprio
    // contexto muda de identidade quando um toast entra na fila. Com ele aqui,
    // uma falha de carregamento vira laço infinito — erro dispara toast, toast
    // recria `carregar`, `carregar` redispara o efeito. Foi exatamente o que
    // aconteceu: quinze avisos vermelhos empilhados na tela por uma única falha.
    // O mesmo cuidado está em `carregarHistorico`, no DarfTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativos = useMemo(() => lista.filter((c) => c.ativo).length, [lista]);

  const noLote = useMemo(() => new Set(lista.map((c) => c.cnpj.replace(/\D/g, ''))), [lista]);

  // Busca enquanto digita: nome, CNPJ ou código SCI (a API /clientes já trata
  // os três no parâmetro `search`). Quem já está no lote sai das sugestões.
  useEffect(() => {
    const termo = novoCnpj.trim();
    if (termo.length < 2) {
      setSugestoes([]);
      setBuscando(false);
      return;
    }
    const seq = ++buscaSeq.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const { items } = await clientesService.getAll({ search: termo, limit: 10, ativo: 'ativos' });
        if (seq !== buscaSeq.current) return;
        const filtrados = items.filter(
          (c) => !noLote.has(String(c.cnpj_limpo || c.cnpj || '').replace(/\D/g, ''))
        );
        setSugestoes(filtrados.slice(0, 8));
        setDestaque(0);
      } catch {
        if (seq === buscaSeq.current) setSugestoes([]);
      } finally {
        if (seq === buscaSeq.current) setBuscando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [novoCnpj, noLote]);

  const incluir = async (cnpjEscolhido?: string) => {
    const digitos = (cnpjEscolhido ?? novoCnpj).replace(/\D/g, '');
    if (digitos.length !== 14) {
      // Texto que não é CNPJ: a sugestão destacada é o que a pessoa quis dizer.
      const escolhida = sugestoes[destaque] ?? sugestoes[0];
      if (!cnpjEscolhido && escolhida) {
        void incluir(String(escolhida.cnpj_limpo || escolhida.cnpj));
        return;
      }
      toast.error('Escolha uma empresa da lista ou informe os 14 dígitos do CNPJ.');
      return;
    }
    if (noLote.has(digitos)) {
      toast.error('Essa empresa já está no lote.');
      return;
    }
    setSalvando(true);
    try {
      await darfLoteService.adicionar(digitos);
      setNovoCnpj('');
      setSugestoes([]);
      await carregar();
      toast.success('Cliente incluído no lote.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const alternar = async (c: ClienteLote) => {
    try {
      await darfLoteService.alternarAtivo(c.id, !c.ativo);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remover = async (c: ClienteLote) => {
    try {
      await darfLoteService.remover(c.id);
      await carregar();
      toast.success('Cliente removido do lote.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <FolderArrowDownIcon className="h-4.5 w-4.5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Lote mensal · Acessórias</h2>
            <p className="text-xs text-gray-500">
              {carregando
                ? 'carregando…'
                : `${ativos} ${ativos === 1 ? 'empresa ativa' : 'empresas ativas'}` +
                  (lista.length > ativos ? ` · ${lista.length - ativos} desligadas` : '')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void carregar()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium
              text-gray-600 transition hover:bg-gray-100"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition
              hover:bg-gray-100"
          >
            {aberto ? 'Ocultar lista' : 'Ver e editar lista'}
          </button>
        </div>
      </header>

      <div className="space-y-4 px-6 py-4">
        {execucao ? (
          <UltimaRodada execucao={execucao} />
        ) : (
          // Estado vazio explicando o mecanismo: sem isto a seção parece
          // quebrada no primeiro mês, antes de qualquer rodada existir.
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-500">
            Nenhuma rodada registrada ainda. O lote roda sozinho todo mês e emite a competência do
            mês anterior; o relatório vai por e-mail para o DP.
          </div>
        )}

        {aberto && (
          <>
            <div className="flex flex-wrap items-start gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  value={novoCnpj}
                  onChange={(e) => {
                    setNovoCnpj(e.target.value);
                    setMostrarSugestoes(true);
                  }}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={() => setMostrarSugestoes(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setDestaque((i) => Math.min(i + 1, Math.max(sugestoes.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setDestaque((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Escape') {
                      setMostrarSugestoes(false);
                    } else if (e.key === 'Enter') {
                      void incluir();
                    }
                  }}
                  placeholder="Buscar empresa por nome, CNPJ ou código SCI"
                  autoComplete="off"
                  className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm
                    focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />

                {mostrarSugestoes && novoCnpj.trim().length >= 2 && (
                  <ul
                    className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border
                      border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {buscando && sugestoes.length === 0 ? (
                      <li className="px-4 py-2.5 text-xs text-gray-500">buscando…</li>
                    ) : sugestoes.length === 0 ? (
                      <li className="px-4 py-2.5 text-xs text-gray-500">
                        Nenhuma empresa encontrada fora do lote.
                      </li>
                    ) : (
                      sugestoes.map((c, i) => {
                        const cnpj = String(c.cnpj_limpo || c.cnpj || '');
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              // mousedown sem preventDefault tiraria o foco do
                              // input e a lista sumiria antes do clique.
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={() => setDestaque(i)}
                              onClick={() => void incluir(cnpj)}
                              className={`flex w-full flex-col px-4 py-2 text-left transition ${
                                i === destaque ? 'bg-emerald-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <span className="truncate text-sm font-medium text-gray-900">
                                {c.razao_social || c.nome}
                              </span>
                              <span className="text-xs text-gray-500">
                                {c.codigo_sci ? `SCI ${c.codigo_sci} · ` : ''}
                                {formatCnpj(cnpj)}
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => void incluir()}
                disabled={salvando}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4
                  text-sm font-semibold text-white transition hover:bg-emerald-700
                  active:scale-[.99] disabled:opacity-60"
              >
                <PlusIcon className="h-4 w-4" />
                Incluir
              </button>
            </div>

            <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
              {lista.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${c.ativo ? '' : 'bg-gray-50/60'}`}
                >
                  <BuildingOffice2Icon
                    className={`h-4 w-4 shrink-0 ${c.ativo ? 'text-gray-400' : 'text-gray-300'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        c.ativo ? 'text-gray-800' : 'text-gray-400 line-through'
                      }`}
                    >
                      {c.razaoSocial || 'Sem cadastro em clientes'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {c.codigoSci ? `SCI ${c.codigoSci} · ` : ''}
                      {formatCnpj(c.cnpj)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void alternar(c)}
                    title={c.ativo ? 'Desligar — sai do lote, o registro fica' : 'Religar no lote'}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      c.ativo
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {c.ativo ? 'ativo' : 'desligado'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remover(c)}
                    title="Remover do lote de vez"
                    className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {lista.length === 0 && !carregando && (
                <li className="px-4 py-6 text-center text-xs text-gray-500">
                  Nenhuma empresa no lote. Inclua a primeira pelo campo acima.
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </section>
  );
};

export default LoteAcessorias;
