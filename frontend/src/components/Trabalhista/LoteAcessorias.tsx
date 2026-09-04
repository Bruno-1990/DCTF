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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FolderArrowDownIcon,
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

  const incluir = async () => {
    const digitos = novoCnpj.replace(/\D/g, '');
    if (digitos.length !== 14) {
      toast.error('Informe os 14 dígitos do CNPJ.');
      return;
    }
    setSalvando(true);
    try {
      await darfLoteService.adicionar(digitos);
      setNovoCnpj('');
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={novoCnpj}
                onChange={(e) => setNovoCnpj(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void incluir();
                }}
                placeholder="CNPJ da empresa a incluir"
                className="h-10 flex-1 rounded-xl border border-gray-200 px-3 text-sm
                  focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
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
