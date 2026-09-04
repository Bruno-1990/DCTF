/**
 * Trabalhista > DARF — emissão do DARF numerado e o histórico do que foi emitido.
 *
 * Só existe esta via. Contribuição previdenciária e de terceiros se declara na
 * DCTFWeb e só a guia dela quita a declaração; o DARF avulso do Sicalc (o
 * "preto") chegou a ser implementado aqui e foi retirado justamente porque, na
 * rotina trabalhista, é sempre o documento errado.
 *
 * EXCLUIR APAGA O PDF, NÃO O REGISTRO. A lixeira remove o arquivo (~150 KB por
 * guia, que já foi baixado e entregue) e mantém a linha: número do documento,
 * valores, competência e quem emitiu. O registro fica porque em 31/08/2026 um
 * DARF sumiu do histórico sem rastro de quem tinha pedido, e é ele que responde
 * "esta guia chegou a ser emitida?" depois. O PDF não volta na restauração.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
  InboxIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { TrashIcon as TrashSolidIcon } from '@heroicons/react/24/solid';
import Modal from '../UI/Modal';
import {
  darfService,
  formatCnpj,
  formatMoeda,
  formatData,
  type CategoriaDctfWeb,
  type DarfHistorico,
} from '../../services/darf';
import { useToast } from '../../hooks/useToast';
import GuiaDctfWebForm from './GuiaDctfWebForm';
import LoteAcessorias from './LoteAcessorias';
import { type ClienteOpcao } from './SeletorCliente';

const MES_CURTO = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Competência da linha. As categorias de 13º são anuais e não têm mês. */
function competencia(d: DarfHistorico): string {
  if (!d.ano_pa) return '—';
  if (!d.mes_pa) return `${d.ano_pa}`;
  const i = Number(d.mes_pa) - 1;
  return `${MES_CURTO[i] ?? d.mes_pa}/${d.ano_pa}`;
}

/**
 * Multa e juros da linha.
 *
 * A API do DCTFWeb não devolve nenhum dos dois — o que se tem é o principal e o
 * total, lidos do PDF. Então o acréscimo aqui é a diferença, e não uma soma.
 */
function acrescimos(d: DarfHistorico): number | null {
  const total = d.valor_total != null ? Number(d.valor_total) : null;
  const principal = d.valor_imposto != null ? Number(d.valor_imposto) : null;
  if (total == null || principal == null || isNaN(total) || isNaN(principal)) return null;
  return total - principal;
}

/** Dias até o vencimento. Negativo = já passou. */
function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * Etiqueta do vencimento.
 *
 * Uma data solta não diz nada a quem bate o olho na lista; "vence em 3 dias" e
 * "venceu" dizem. A cor só entra quando há algo a fazer — pintar tudo tira o
 * peso justamente das linhas que importam.
 */
const Vencimento: React.FC<{ iso: string | null; apagado?: boolean }> = ({ iso, apagado }) => {
  const dias = diasAte(iso);
  if (!iso || dias === null) return <span className="text-gray-300">—</span>;

  const data = formatData(iso);
  let tom = 'text-gray-600';
  let nota = '';
  if (!apagado) {
    if (dias < 0) {
      tom = 'text-red-600 font-semibold';
      nota = 'venceu';
    } else if (dias === 0) {
      tom = 'text-red-600 font-semibold';
      nota = 'vence hoje';
    } else if (dias <= 5) {
      tom = 'text-amber-700 font-semibold';
      nota = `em ${dias}d`;
    }
  }
  return (
    <span className={`whitespace-nowrap tabular-nums ${tom}`}>
      {data}
      {nota && <span className="ml-1 text-[10px] font-normal opacity-80">· {nota}</span>}
    </span>
  );
};

const DarfTab: React.FC = () => {
  const toast = useToast();

  const [cliente, setCliente] = useState<ClienteOpcao | null>(null);
  const [categorias, setCategorias] = useState<CategoriaDctfWeb[]>([]);
  const [historico, setHistorico] = useState<DarfHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtrarPeloCliente, setFiltrarPeloCliente] = useState(false);
  const [verExcluidos, setVerExcluidos] = useState(false);

  /**
   * O que a confirmação está segurando. null = modal fechado.
   *
   * `modo` distingue as duas exclusões, que têm consequências bem diferentes:
   *   'pdf'        → apaga o arquivo, mantém o registro (dá para restaurar)
   *   'definitivo' → apaga o registro do banco, sem volta
   */
  const [aConfirmar, setAConfirmar] = useState<{
    guia: DarfHistorico;
    modo: 'pdf' | 'definitivo';
  } | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // As categorias são carregadas AQUI, e não dentro do formulário, porque a
  // tabela também precisa delas — é o que transforma `GERAL_13o_SALARIO` em
  // "Geral — 13º salário" na listagem, sem duplicar o dicionário.
  useEffect(() => {
    darfService
      .categorias()
      .then(setCategorias)
      .catch(() => toast.error('Não foi possível carregar as categorias da DCTFWeb.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotuloCategoria = useMemo(() => {
    const m = new Map(categorias.map((c) => [c.id, c.rotulo]));
    return (id: string | null) => (id ? (m.get(id as any) ?? id) : '—');
  }, [categorias]);

  const carregarHistorico = useCallback(async () => {
    setCarregando(true);
    try {
      setHistorico(
        await darfService.historico(
          filtrarPeloCliente && cliente ? cliente.cnpj : undefined,
          verExcluidos
        )
      );
    } catch {
      toast.error('Não foi possível carregar o histórico de DARFs.');
    } finally {
      setCarregando(false);
    }
    // `toast` é recriado a cada render do provider; incluí-lo aqui recarregaria
    // o histórico sem parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, filtrarPeloCliente, verExcluidos]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  /**
   * Contagem e soma do cabeçalho.
   *
   * As duas precisam falar do MESMO conjunto. Contar tudo e somar só os ativos
   * produzia "7 guias · R$ 35.409,11" com o dinheiro de seis — um número que
   * não fecha com nada e faz duvidar do resto da tela.
   */
  const totais = useMemo(() => {
    const ativos = historico.filter((d) => !d.excluido_em);
    return {
      ativos: ativos.length,
      excluidos: historico.length - ativos.length,
      soma: ativos.reduce((s, d) => s + (Number(d.valor_total) || 0), 0),
    };
  }, [historico]);

  const confirmar = async () => {
    if (!aConfirmar) return;
    const { guia, modo } = aConfirmar;
    setExcluindo(true);
    try {
      if (modo === 'definitivo') {
        await darfService.excluirDefinitivo(guia.id);
        toast.success('Registro apagado em definitivo.');
      } else {
        await darfService.excluir(guia.id);
        toast.success('PDF apagado. O registro da emissão continua no histórico.');
      }
      setAConfirmar(null);
      void carregarHistorico();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível excluir.');
    } finally {
      setExcluindo(false);
    }
  };

  const restaurar = async (d: DarfHistorico) => {
    try {
      await darfService.restaurar(d.id);
      toast.success('Restaurado.');
      void carregarHistorico();
    } catch {
      toast.error('Não foi possível restaurar.');
    }
  };

  const filtro =
    'inline-flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ' +
    'font-medium text-gray-600 transition hover:bg-gray-100';
  const caixinha =
    'h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400 focus:ring-offset-0';

  return (
    <div className="space-y-6">
      <GuiaDctfWebForm
        cliente={cliente}
        onCliente={setCliente}
        categorias={categorias}
        onEmitido={() => void carregarHistorico()}
      />

      <LoteAcessorias />

      {/* ─── Histórico ───────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-bold text-gray-900">DARFs emitidos</h2>
            {historico.length > 0 && (
              <span className="text-xs text-gray-500">
                {totais.ativos} {totais.ativos === 1 ? 'guia' : 'guias'}
                {totais.soma > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold tabular-nums text-gray-700">
                      {formatMoeda(totais.soma)}
                    </span>
                  </>
                )}
                {totais.excluidos > 0 && (
                  <span className="text-gray-400">
                    {' · '}
                    {totais.excluidos} {totais.excluidos === 1 ? 'excluída' : 'excluídas'}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {cliente && (
              <label className={filtro}>
                <input
                  type="checkbox"
                  checked={filtrarPeloCliente}
                  onChange={(e) => setFiltrarPeloCliente(e.target.checked)}
                  className={caixinha}
                />
                só deste cliente
              </label>
            )}
            <label
              className={filtro}
              title="Marque para ver as guias excluídas. O registro delas continua aqui — só o PDF foi apagado."
            >
              <input
                type="checkbox"
                checked={verExcluidos}
                onChange={(e) => setVerExcluidos(e.target.checked)}
                className={caixinha}
              />
              mostrar excluídos
            </label>
            <button
              type="button"
              onClick={() => void carregarHistorico()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium
                text-gray-600 transition hover:bg-gray-100"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </header>

        {carregando && historico.length === 0 ? (
          // Esqueleto em vez de "Carregando…": a lista não muda de altura
          // quando os dados chegam, e a tela não dá aquele pulo.
          <div className="divide-y divide-gray-50">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-gray-50" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : historico.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <InboxIcon className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">Nenhuma guia emitida ainda</p>
            <p className="mt-1 text-xs text-gray-500">
              Escolha o contribuinte e a competência acima para gerar a primeira.
            </p>
          </div>
        ) : (
          // O scroll horizontal fica NESTE contêiner, e não no corpo da página:
          // com a tabela solta, as colunas da direita (documento e ações) saíam
          // do card e ficavam inalcançáveis.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-2.5 text-left font-semibold">Contribuinte</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Declaração</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Principal</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Multa+juros</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Pagar até</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Documento</th>
                  <th className="px-6 py-2.5 text-right font-semibold">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historico.map((d) => {
                  const excluido = !!d.excluido_em;
                  const acresc = acrescimos(d);
                  const semValores = d.valor_total == null;
                  return (
                    <tr
                      key={d.id}
                      className={`transition ${
                        excluido ? 'bg-gray-50/70 text-gray-400' : 'hover:bg-emerald-50/40'
                      }`}
                    >
                      <td className="px-6 py-3">
                        <div
                          className={`max-w-[220px] truncate font-medium ${
                            excluido ? '' : 'text-gray-900'
                          }`}
                          title={d.razao_social ?? ''}
                        >
                          {d.razao_social || '—'}
                        </div>
                        <div className="text-[11px] tabular-nums text-gray-500">
                          {formatCnpj(d.cnpj)}
                        </div>
                        {excluido && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                            title={d.motivo_exclusao ?? ''}
                          >
                            excluído {formatData(d.excluido_em)}
                            {d.excluido_por ? ` · ${d.excluido_por}` : ''}
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        <div className={excluido ? '' : 'text-gray-800'}>
                          {rotuloCategoria(d.categoria)}
                        </div>
                        <div className="text-[11px] tabular-nums text-gray-500">
                          {competencia(d)}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        {formatMoeda(d.valor_imposto)}
                      </td>

                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${
                          excluido ? '' : 'text-amber-700'
                        }`}
                      >
                        {acresc != null && acresc > 0 ? formatMoeda(acresc) : '—'}
                      </td>

                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums ${
                          excluido ? '' : 'text-gray-900'
                        }`}
                      >
                        {formatMoeda(d.valor_total)}
                      </td>

                      <td className="px-3 py-3 text-xs">
                        <Vencimento iso={d.vencimento} apagado={excluido} />
                      </td>

                      <td className="px-3 py-3">
                        {d.numero_documento ? (
                          <div className="whitespace-nowrap font-mono text-[11px] text-gray-700">
                            {d.numero_documento}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        {/* Estas linhas saíram antes de o backend passar a ler
                            os dados do PDF. Um traço solto pareceria guia
                            zerada; dizer o motivo evita a leitura errada. */}
                        {semValores && (
                          <div className="text-[10px] text-gray-400">valores não lidos</div>
                        )}
                        <div className="text-[10px] text-gray-400">
                          {formatData(d.criado_em)}
                          {d.emitido_por ? ` · ${d.emitido_por}` : ''}
                        </div>
                      </td>

                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {d.tem_pdf ? (
                            <a
                              href={darfService.urlPdf(d.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-emerald-100 hover:text-emerald-700"
                              title="Abrir o PDF emitido"
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="p-2 text-gray-200" title="Sem PDF guardado">
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </span>
                          )}
                          {excluido ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void restaurar(d)}
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-emerald-100 hover:text-emerald-700"
                                title="Trazer o registro de volta para a lista (o PDF não volta)"
                              >
                                <ArrowUturnLeftIcon className="h-4 w-4" />
                              </button>
                              {/* Só aparece em linha já excluída — é o segundo
                                  passo, e o ícone é o sólido justamente para não
                                  se confundir com a lixeira do primeiro. */}
                              <button
                                type="button"
                                onClick={() => setAConfirmar({ guia: d, modo: 'definitivo' })}
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-red-600 hover:text-white"
                                title="Apagar o registro em definitivo (sem volta)"
                              >
                                <TrashSolidIcon className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAConfirmar({ guia: d, modo: 'pdf' })}
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-red-100 hover:text-red-600"
                              title="Excluir (apaga o PDF; o registro da emissão fica)"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
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
      </section>

      {/* ─── Confirmação de exclusão ─────────────────────────────────────── */}
      {/* Era um `window.prompt`, que abre o diálogo do navegador ("192.168.0.47
          diz…") — fora do desenho da tela e pedindo um motivo que ninguém
          preenchia. Aqui a pergunta é só sim ou não, e o resumo da guia fica à
          vista para ninguém confirmar a linha errada. */}
      <Modal isOpen={!!aConfirmar} onClose={() => !excluindo && setAConfirmar(null)} size="sm">
        {aConfirmar && (
          <div>
            <div className="flex gap-4">
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
                  aConfirmar.modo === 'definitivo'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                <ExclamationTriangleIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                {aConfirmar.modo === 'definitivo' ? (
                  <>
                    <h3 className="text-base font-bold text-gray-900">
                      Apagar este registro em definitivo?
                    </h3>
                    <p className="mt-1 text-sm leading-snug text-gray-600">
                      A linha sai do banco e{' '}
                      <span className="font-semibold text-red-700">não há como recuperar</span>.
                      Some o registro de que esta guia foi emitida — número, valores, data e autor.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-bold text-gray-900">Excluir esta guia?</h3>
                    <p className="mt-1 text-sm leading-snug text-gray-600">
                      O <span className="font-medium">PDF será apagado</span> — se ainda precisar
                      dele, baixe antes. O registro da emissão (número, valores e data) continua
                      guardado.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Qual guia é. Confirmar sem ver o que se está removendo é como o
                prompt do navegador era: uma pergunta sem contexto. */}
            <div
              className={`mt-4 rounded-xl p-3.5 ${
                aConfirmar.modo === 'definitivo'
                  ? 'bg-red-50/70 ring-1 ring-red-100'
                  : 'bg-gray-50 ring-1 ring-gray-100'
              }`}
            >
              <div className="truncate text-sm font-semibold text-gray-900">
                {aConfirmar.guia.razao_social || formatCnpj(aConfirmar.guia.cnpj)}
              </div>
              <div className="mt-0.5 text-xs text-gray-600">
                {rotuloCategoria(aConfirmar.guia.categoria)} · {competencia(aConfirmar.guia)}
                {aConfirmar.guia.valor_total != null && (
                  <>
                    {' · '}
                    <span className="font-semibold tabular-nums">
                      {formatMoeda(aConfirmar.guia.valor_total)}
                    </span>
                  </>
                )}
              </div>
              {aConfirmar.guia.numero_documento && (
                <div className="mt-1 font-mono text-[11px] text-gray-500">
                  {aConfirmar.guia.numero_documento}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAConfirmar(null)}
                disabled={excluindo}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-gray-600 transition
                  hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmar()}
                disabled={excluindo}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm
                  font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700
                  active:scale-[.99] disabled:opacity-60"
              >
                {excluindo && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {excluindo
                  ? 'Apagando…'
                  : aConfirmar.modo === 'definitivo'
                    ? 'Apagar em definitivo'
                    : 'Excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DarfTab;
