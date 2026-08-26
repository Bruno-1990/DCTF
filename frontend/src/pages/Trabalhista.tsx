import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ExclamationTriangleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  detService,
  formatCnpj,
  desde,
  rotuloColeta,
  formatData,
  type DetResumo,
  type DetCliente,
  type DetNotificacao,
} from '../services/det';

type TabId = 'det';

const TABS: { id: TabId; label: string; gradient: string }[] = [
  { id: 'det', label: 'DET', gradient: 'from-sky-500 to-blue-600 shadow-sky-500/30' },
];

// ─── Cartão de contagem — e filtro ─────────────────────────────────────────
// Mesmo padrão dos cartões de porte na aba Cota de Aprendizagem.

const TONS = {
  neutro: {
    valor: 'text-gray-800',
    barra: 'bg-gray-400',
    consequencia: 'text-gray-500',
    ativo: 'border-gray-400 bg-gray-50 ring-2 ring-gray-100',
    inativo: 'border-gray-200 hover:border-gray-300',
  },
  ok: {
    valor: 'text-emerald-600',
    barra: 'bg-emerald-500',
    consequencia: 'text-emerald-700',
    ativo: 'border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-100',
    inativo: 'border-gray-200 hover:border-emerald-300',
  },
  falta: {
    valor: 'text-red-600',
    barra: 'bg-red-500',
    consequencia: 'text-red-700',
    ativo: 'border-red-400 bg-red-50/60 ring-2 ring-red-100',
    inativo: 'border-red-200 hover:border-red-300',
  },
  atencao: {
    valor: 'text-amber-600',
    barra: 'bg-amber-500',
    consequencia: 'text-amber-700',
    ativo: 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-100',
    inativo: 'border-gray-200 hover:border-amber-300',
  },
} as const;

/**
 * Clicar filtra a lista para exatamente aquele grupo, e clicar de novo desfaz.
 * O número do cartão passa a ser o número de linhas da lista — por isso o
 * clique LIMPA a busca: se preservasse, o cartão diria 132 e a lista mostraria 3.
 */
function CardResumo({
  titulo,
  valor,
  tom,
  faixa,
  consequencia,
  proporcao,
  ajuda,
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
  ajuda?: string;
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
          : (ajuda ?? `Clique para ver só estes ${valor}`)
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

// ─── Painel lateral de detalhe ─────────────────────────────────────────────

const PainelCliente: React.FC<{
  cliente: DetCliente;
  onFechar: () => void;
  onInformou: () => void;
}> = ({ cliente, onFechar, onInformou }) => {
  const [notifs, setNotifs] = useState<DetNotificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCarregando(true);
    detService
      .notificacoes(cliente.cnpj)
      .then(setNotifs)
      .catch(() => setNotifs([]))
      .finally(() => setCarregando(false));
  }, [cliente.cnpj]);

  const informar = async () => {
    setSalvando(true);
    try {
      await detService.informarProcuracao(cliente.cnpj, true);
      onInformou();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <aside className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 leading-tight">{cliente.razao_social}</h3>
            <p className="text-sm text-gray-500">{formatCnpj(cliente.cnpj)} · {cliente.tipo}</p>
          </div>
          <button onClick={onFechar} className="p-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Procuração */}
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Procuração
            </h4>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p className="text-gray-700">{cliente.observacao ?? '—'}</p>
              {cliente.outorgante_cnpj && cliente.outorgante_cnpj !== cliente.cnpj && (
                <p className="text-gray-500">
                  Outorgada por <strong>{formatCnpj(cliente.outorgante_cnpj)}</strong>
                </p>
              )}
              {cliente.vigencia_fim && (
                <p className="text-gray-500">Vigente até {formatData(cliente.vigencia_fim)}</p>
              )}
              {cliente.origem === 'manual' && (
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                  Informado manualmente — ainda não confirmado no DET.
                </p>
              )}
            </div>

            {cliente.situacao === 'indeferido' && (
              <button
                onClick={informar}
                disabled={salvando}
                className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/30 disabled:opacity-50"
              >
                {salvando ? 'Registrando...' : 'Informar que já tem procuração'}
              </button>
            )}
          </section>

          {/* Caixa postal */}
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Caixa postal
            </h4>

            {carregando ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : notifs.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4">
                Nada coletado ainda para este cliente.
              </p>
            ) : (
              (() => {
                // Notificação e Aviso NÃO têm o mesmo peso: Notificação tem prazo
                // legal correndo (ex.: FGTS Digital), Aviso é ruído recorrente
                // (Crédito do Trabalhador, mensal). Numa lista única a Notificação
                // some no meio de dezenas de Avisos idênticos — que é justamente
                // o que não pode acontecer. Aqui elas vão para o topo, num bloco
                // próprio, e os Avisos ficam abaixo. Dentro de cada grupo, a
                // ordem por data que a API já devolve é preservada.
                const ehNotificacao = (t: string) => /notifica/i.test(t || '');
                const notificacoes = notifs.filter((n) => ehNotificacao(n.tipo));
                const avisos = notifs.filter((n) => !ehNotificacao(n.tipo));

                const Item = (n: DetNotificacao) => (
                  <li
                    key={n.id}
                    className={`rounded-xl border p-3 ${
                      ehNotificacao(n.tipo)
                        ? n.nao_lida
                          ? 'border-red-300 bg-red-50'
                          : 'border-red-100 bg-white'
                        : n.nao_lida
                          ? 'border-sky-200 bg-sky-50'
                          : 'border-gray-100 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ehNotificacao(n.tipo)
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {n.tipo}
                      </span>
                      <span className="text-xs text-gray-400">{n.data_texto ?? formatData(n.data_envio)}</span>
                      {!!n.nao_lida && (
                        <span
                          className={`text-[10px] font-bold ${
                            ehNotificacao(n.tipo) ? 'text-red-700' : 'text-sky-700'
                          }`}
                        >
                          NÃO LIDA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800">{n.assunto}</p>
                    {n.remetente && <p className="text-xs text-gray-400 mt-0.5">{n.remetente}</p>}
                  </li>
                );

                return (
                  <div className="space-y-4">
                    {notificacoes.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                          Notificações — têm prazo legal ({notificacoes.length})
                        </p>
                        <ul className="space-y-2">{notificacoes.map(Item)}</ul>
                      </div>
                    )}
                    {avisos.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          Avisos ({avisos.length})
                        </p>
                        <ul className="space-y-2">{avisos.map(Item)}</ul>
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
              O sistema lê apenas a listagem. <strong>Abrir a mensagem no DET gera
              ciência</strong> e dispara o prazo legal — faça isso conscientemente.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
};

// ─── Aba DET ───────────────────────────────────────────────────────────────

type Filtro = 'todos' | 'com' | 'sem' | 'novas';

const DteTab: React.FC = () => {
  const [resumo, setResumo] = useState<DetResumo | null>(null);
  const [clientes, setClientes] = useState<DetCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  // Abre já filtrado nas empresas COM PROCURAÇÃO (deferidas): são as que entram
  // na coleta e as que têm caixa postal para acompanhar. As sem procuração
  // (indeferidas) são ruído para o dia a dia — o usuário troca o filtro se
  // quiser vê-las. Clicar de novo no card "Com procuração" limpa para 'todos'.
  const [filtro, setFiltro] = useState<Filtro>('com');
  const [selecionado, setSelecionado] = useState<DetCliente | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [r, c] = await Promise.all([detService.resumo(), detService.clientes()]);
      setResumo(r);
      setClientes(c);
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase().replace(/\D/g, '');
    const qTexto = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtro === 'com' && c.situacao !== 'deferido') return false;
      if (filtro === 'sem' && c.situacao !== 'indeferido') return false;
      if (filtro === 'novas' && Number(c.nao_lidas) === 0) return false;
      if (!qTexto) return true;
      return (
        c.razao_social.toLowerCase().includes(qTexto) ||
        (q.length > 0 && c.cnpj.includes(q))
      );
    });
  }, [clientes, busca, filtro]);

  /** Clicar no cartão ativo desfaz; clicar em outro troca e limpa a busca. */
  const filtrarPor = (f: Filtro) => {
    setBusca('');
    setFiltro((atual) => (atual === f ? 'todos' : f));
  };

  const fracao = (n: number) => (resumo && resumo.total > 0 ? n / resumo.total : 0);

  if (erro) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-red-100 p-6 text-center">
        <ExclamationTriangleIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700">{erro}</p>
        <button onClick={carregar} className="mt-3 text-sm text-blue-600 font-semibold">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cartões — contagem e filtro ao mesmo tempo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CardResumo
            titulo="Estabelecimentos"
            valor={resumo.total}
            tom="neutro"
            faixa={`${resumo.matrizes} matrizes · ${resumo.filiais} filiais`}
            ativo={filtro === 'todos' && busca.trim() === ''}
            onClick={() => {
              setBusca('');
              setFiltro('todos');
            }}
          />
          <CardResumo
            titulo="Com procuração"
            valor={resumo.deferidos}
            tom="ok"
            proporcao={fracao(resumo.deferidos)}
            faixa="o escritório já acessa a caixa postal"
            consequencia="entram na coleta diária"
            ativo={filtro === 'com'}
            onClick={() => filtrarPor('com')}
          />
          <CardResumo
            titulo="Sem procuração"
            valor={resumo.indeferidos}
            tom="falta"
            proporcao={fracao(resumo.indeferidos)}
            faixa="nenhuma procuração ativa no SPE"
            consequencia="invisíveis para a coleta"
            ajuda="Sem procuração o escritório não abre a caixa postal do cliente — e não fica sabendo de notificação nenhuma. Cada um exige outorga nova pelo SPE."
            ativo={filtro === 'sem'}
            onClick={() => filtrarPor('sem')}
          />
          <CardResumo
            titulo="Com novidade"
            valor={resumo.naoLidas}
            tom="atencao"
            proporcao={fracao(resumo.naoLidas)}
            faixa={`${resumo.notificacoesNovas} são Notificação, com prazo`}
            consequencia="ninguém deu ciência ainda"
            ajuda="Mensagens não lidas na caixa postal. Aviso e Notificação contam juntos aqui, mas só Notificação tem prazo legal correndo — por isso o número aparece separado."
            ativo={filtro === 'novas'}
            onClick={() => filtrarPor('novas')}
          />
        </div>
      )}

      {/* O SPE caiu na última rodada. Isto NÃO pode ser silencioso: a coleta
          seguiu com a lista da vez anterior, então quem outorgou procuração
          depois dela simplesmente não foi varrido — e nada na tela denunciaria
          isso sem este aviso. */}
      {resumo?.ultimaColeta?.spe_erro && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs"
          title={`Motivo: ${resumo.ultimaColeta.spe_erro}`}
        >
          <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-900">
            <strong>Procurações desatualizadas</strong>
            {resumo.procuracoesAtualizadasEm && (
              <>
                {' — lista de '}
                <strong>
                  {new Date(resumo.procuracoesAtualizadasEm).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>{' '}
                ({desde(resumo.procuracoesAtualizadasEm)})
              </>
            )}
            <span className="text-amber-700">
              {' · quem outorgou depois ficou de fora'}
            </span>
          </span>
        </div>
      )}

      {/* Frescor do dado — informação, não filtro, por isso fora dos cartões */}
      <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
        <ClockIcon className="w-4 h-4 text-gray-400" />
        <span
          title={resumo?.ultimaColeta?.iniciado_em ?? 'o coletor ainda não rodou'}
        >
          Última coleta:{' '}
          <strong className="text-gray-700">
            {resumo?.ultimaColeta ? desde(resumo.ultimaColeta.iniciado_em) : 'nunca'}
          </strong>
          {resumo?.ultimaColeta
            ? ` · ${resumo.ultimaColeta.coletados} de ${resumo.ultimaColeta.total_clientes}`
            : ' · coletor ainda não implantado'}
          {/* A varredura de procurações abre toda coleta e define QUEM foi
              varrido. Quando ela roda, o número aparece aqui; quando falha, o
              aviso ao lado explica que a lista usada era a da rodada anterior. */}
          {resumo?.ultimaColeta?.procuracoes_lidas != null && (
            <>
              {' · '}
              {resumo.ultimaColeta.procuracoes_lidas} procuração(ões) relida(s) no SPE
              {!!resumo.ultimaColeta.procuracoes_ganharam && (
                <span className="text-emerald-700 font-semibold">
                  {' '}(+{resumo.ultimaColeta.procuracoes_ganharam})
                </span>
              )}
              {!!resumo.ultimaColeta.procuracoes_perderam && (
                <span className="text-red-700 font-semibold">
                  {' '}(-{resumo.ultimaColeta.procuracoes_perderam})
                </span>
              )}
            </>
          )}
        </span>
        {!!resumo?.vigenciasVencendo && (
          <span className="ml-auto text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
            {resumo.vigenciasVencendo} procuração(ões) vencem em 90 dias
          </span>
        )}
      </div>

      {/* Busca + filtros */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por razão social ou CNPJ..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {lista.length} de {clientes.length}
          </span>
          <button
            onClick={carregar}
            title="Recarregar"
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 flex-shrink-0"
          >
            <ArrowPathIcon className={`w-5 h-5 text-gray-500 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        {carregando ? (
          <p className="p-8 text-center text-sm text-gray-400">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Nenhum estabelecimento encontrado.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lista.map((c) => {
              const naoLidas = Number(c.nao_lidas);
              return (
                <li
                  key={c.cnpj}
                  onClick={() => setSelecionado(c)}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div
                    className={`w-2 h-10 rounded-full flex-shrink-0 ${
                      c.situacao === 'deferido' ? 'bg-emerald-400' : 'bg-rose-300'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{c.razao_social}</p>
                    <p className="text-xs text-gray-500">
                      {formatCnpj(c.cnpj)}
                      <span className="mx-1.5 text-gray-300">·</span>
                      {c.tipo}
                      {c.outorgante_cnpj && c.outorgante_cnpj !== c.cnpj && (
                        <>
                          <span className="mx-1.5 text-gray-300">·</span>
                          <span className="text-gray-400">via matriz</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Estado da caixa — SEMPRE visível quando há algo, para o
                      cliente nunca parecer vazio se na verdade tem conteúdo.
                      Prioridade pelo que tem peso legal:
                      1. Notificações (prazo) — vermelho, mesmo já lidas, porque
                         um cliente com notificação NÃO pode sumir da vista só
                         porque alguém abriu a mensagem (foi o caso do CINCO
                         ESTRELAS: 2 notificações lidas, e a linha aparecia vazia).
                      2. Novas não lidas (avisos + notif) — azul.
                      3. Só mensagens lidas, sem notificação — cinza discreto,
                         para indicar que há conteúdo conferido. */}
                  {(() => {
                    const notif = Number(c.notificacoes) || 0;
                    const total = Number(c.mensagens) || 0;
                    const badges = [];
                    if (notif > 0) {
                      badges.push(
                        <span
                          key="notif"
                          title={`${notif} notificação(ões) — têm prazo legal`}
                          className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex-shrink-0"
                        >
                          {notif} notif.
                        </span>
                      );
                    }
                    if (naoLidas > 0) {
                      badges.push(
                        <span
                          key="novas"
                          title={`${naoLidas} não lida(s)`}
                          className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex-shrink-0"
                        >
                          {naoLidas} nova{naoLidas > 1 ? 's' : ''}
                        </span>
                      );
                    }
                    // só mostra "N msgs" quando não há nenhum badge acima mas há
                    // mensagens (todas lidas, sem notificação): evita linha vazia
                    if (badges.length === 0 && total > 0) {
                      badges.push(
                        <span
                          key="msgs"
                          title={`${total} mensagem(ns), todas lidas`}
                          className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex-shrink-0"
                        >
                          {total} msg{total > 1 ? 's' : ''}
                        </span>
                      );
                    }
                    return badges;
                  })()}

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                      c.situacao === 'deferido'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {c.situacao === 'deferido' ? 'deferido' : 'indeferido'}
                  </span>

                  <span
                    className={`text-xs w-24 text-right flex-shrink-0 hidden sm:block ${
                      c.ultima_coleta_status === 'erro'
                        ? 'text-rose-500'
                        : c.ultima_coleta_status === 'vazia'
                          ? 'text-gray-400 italic'
                          : 'text-gray-400'
                    }`}
                    title={
                      c.ultima_coleta
                        ? `Última coleta: ${c.ultima_coleta}` +
                          (c.ultima_coleta_status === 'vazia' ? ' — caixa vazia' : '')
                        : 'nunca coletado'
                    }
                  >
                    {rotuloColeta(c)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selecionado && (
        <PainelCliente
          cliente={selecionado}
          onFechar={() => setSelecionado(null)}
          onInformou={() => {
            setSelecionado(null);
            carregar();
          }}
        />
      )}
    </div>
  );
};

// ─── Página ────────────────────────────────────────────────────────────────

const Trabalhista: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('det');

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-2">Trabalhista</h1>
      <p className="text-sm text-gray-500 mb-6">
        Rotinas trabalhistas dos clientes do escritório.
      </p>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 mb-6 overflow-hidden">
        <div className="px-6 pt-4 pb-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  activeTab === tab.id
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={activeTab === 'det' ? '' : 'hidden'}>
        <DteTab />
      </div>
    </div>
  );
};

export default Trabalhista;
