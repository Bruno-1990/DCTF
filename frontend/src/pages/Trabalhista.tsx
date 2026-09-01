import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ExclamationTriangleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
  EnvelopeIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import {
  detService,
  formatCnpj,
  desde,
  rotuloColeta,
  tituloColeta,
  formatData,
  type DetResumo,
  type DetCliente,
  type DetNotificacao,
} from '../services/det';
import {
  DOMINIO_EMAIL,
  PREFIXO_VALIDO,
  normalizarPrefixoEmail,
} from '../utils/emailDestino';

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

// ─── Envio por e-mail ──────────────────────────────────────────────────────

/**
 * Manda a lista de empresas com notificação para alguém do escritório.
 *
 * O QUE VAI no e-mail não se escolhe aqui: é sempre o recorte "tem
 * Notificação" — o mesmo do filtro da tela. O que se escolhe é PARA QUEM, e o
 * domínio é fixo, então o campo pede só o prefixo.
 *
 * A prévia existe para conferir antes de disparar: mandar um aviso de prazo
 * legal para o departamento errado, ou mandar um relatório vazio sem perceber,
 * são os dois erros que ela evita. A lista mostrada é a mesma que o servidor
 * relê do banco na hora de montar o e-mail.
 */
const ModalEmailNotificacoes: React.FC<{
  empresas: DetCliente[];
  onFechar: () => void;
}> = ({ empresas, onFechar }) => {
  const [prefixo, setPrefixo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ empresas: number; notificacoes: number } | null>(null);

  const prefixoLimpo = normalizarPrefixoEmail(prefixo);
  const prefixoOk = PREFIXO_VALIDO.test(prefixoLimpo);
  const emailFinal = `${prefixoLimpo}${DOMINIO_EMAIL}`;

  const totalNotificacoes = empresas.reduce((s, c) => s + numero(c.notificacoes), 0);
  const totalSemCiencia = empresas.reduce((s, c) => s + numero(c.nao_lidas), 0);

  const enviar = async () => {
    if (!prefixoOk || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await detService.enviarEmailNotificacoes(emailFinal);
      setEnviado({ empresas: r.empresas, notificacoes: r.notificacoes });
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? e?.message ?? 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  // Durante o envio não há o que cancelar: fechar deixaria o disparo órfão e o
  // usuário sem o retorno.
  const fechar = () => {
    if (!enviando) onFechar();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" onClick={fechar} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-base font-bold text-gray-800">Enviar notificações do DET</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {enviado
                  ? 'Resultado'
                  : enviando
                    ? 'Enviando'
                    : `${empresas.length} empresa(s) com notificação`}
              </p>
            </div>
            {!enviando && (
              <button
                type="button"
                onClick={fechar}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>

          {enviando ? (
            <div className="p-8 flex flex-col items-center text-center">
              <div className="relative h-16 w-16 mb-5">
                {/* Trilho estático + arco girando: leitura de progresso sem dar
                    um percentual que não temos como medir de verdade. */}
                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <EnvelopeIcon className="h-6 w-6 text-blue-600 animate-pulse" />
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-800">Enviando...</div>
              <div className="text-xs text-gray-500 mt-1.5 break-all">
                para <span className="font-semibold text-gray-700">{emailFinal}</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-3">Isso pode levar alguns segundos.</div>
            </div>
          ) : enviado ? (
            <>
              <div className="p-6 flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-full bg-emerald-100 ring-8 ring-emerald-50 flex items-center justify-center">
                  <CheckCircleIcon className="h-9 w-9 text-emerald-600" />
                </div>
                <div className="text-base font-bold text-gray-800 mt-4">Enviado com sucesso</div>
                <div className="text-xs text-gray-600 mt-2 break-all">
                  {enviado.empresas} empresa(s) e {enviado.notificacoes} notificação(ões) para{' '}
                  <span className="font-semibold text-gray-800">{emailFinal}</span>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={onFechar}
                  className="w-full px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-5 space-y-4 overflow-y-auto">
                <div>
                  <label
                    htmlFor="det-email-prefixo"
                    className="block text-xs font-semibold text-gray-700 mb-1.5"
                  >
                    Enviar para
                  </label>
                  {/* Domínio como sufixo fixo, fora do input: o usuário não
                      consegue apagá-lo nem duplicá-lo sem perceber. */}
                  <div className="flex items-stretch rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-blue-500 transition-colors">
                    <input
                      id="det-email-prefixo"
                      type="text"
                      autoFocus
                      value={prefixo}
                      onChange={(e) => setPrefixo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') enviar();
                      }}
                      placeholder="seu.nome"
                      className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none"
                    />
                    <span className="px-3 py-2.5 bg-gray-50 text-gray-600 text-sm font-medium border-l-2 border-gray-200 whitespace-nowrap">
                      {DOMINIO_EMAIL}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Só endereços {DOMINIO_EMAIL} — a caixa postal é dado de cliente.
                  </p>
                </div>

                {/* Prévia: o que exatamente vai no e-mail. */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700">Vai no e-mail</span>
                    <span className="text-[11px] text-gray-400">
                      {empresas.length} empresa(s) · {totalNotificacoes} notificação(ões)
                      {totalSemCiencia > 0 && ` · ${totalSemCiencia} sem ciência`}
                    </span>
                  </div>

                  {empresas.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-amber-50 border border-amber-100 rounded-xl p-3">
                      Nenhuma empresa com notificação no momento. O e-mail sairia vazio.
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-gray-100">
                      {empresas.map((c) => (
                        <div key={c.cnpj} className="flex items-center gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 truncate">
                              {c.razao_social}
                            </p>
                            <p className="text-[11px] text-gray-400">{formatCnpj(c.cnpj)}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-bold flex-shrink-0">
                            {numero(c.notificacoes)} notif.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                    Só Notificação — Aviso não entra, porque chega todo mês e não tem prazo.
                    Notificação já lida continua na lista: abrir no portal é o que dispara o
                    prazo.
                  </p>
                </div>

                {erro && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 break-words">
                    {erro}
                  </p>
                )}
              </div>

              <div className="px-5 pb-5 pt-1 flex gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={onFechar}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={enviar}
                  disabled={!prefixoOk}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Aba DET ───────────────────────────────────────────────────────────────

type Filtro = 'todos' | 'com' | 'sem' | 'novas';

/** Eixo de conteúdo da caixa postal — independente do de procuração acima.
 *  Os três estados são EXCLUSIVOS: quem tem notificação não reaparece em
 *  "Caixa postal". Assim as contagens somam a lista inteira e ninguém precisa
 *  raciocinar sobre sobreposição para saber quantos clientes faltam olhar. */
type FiltroCaixa = 'todas' | 'notificacoes' | 'avisos' | 'vazias';

const numero = (v: number | string | null | undefined) => Number(v) || 0;

/** Notificação tem precedência sobre aviso: um cliente com os dois é um caso
 *  de prazo legal, e é assim que ele precisa aparecer. */
const classeCaixa = (c: DetCliente): Exclude<FiltroCaixa, 'todas'> =>
  numero(c.notificacoes) > 0 ? 'notificacoes' : numero(c.mensagens) > 0 ? 'avisos' : 'vazias';

const PILL_TONS: Record<FiltroCaixa, { ativo: string; inativo: string }> = {
  todas: {
    ativo: 'bg-gray-800 text-white border-gray-800',
    inativo: 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
  },
  notificacoes: {
    ativo: 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-500/30',
    inativo: 'bg-white text-red-700 border-red-200 hover:border-red-400',
  },
  avisos: {
    ativo: 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/30',
    inativo: 'bg-white text-sky-700 border-sky-200 hover:border-sky-400',
  },
  vazias: {
    ativo: 'bg-gray-500 text-white border-gray-500',
    inativo: 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
  },
};

const PillCaixa: React.FC<{
  id: FiltroCaixa;
  label: string;
  valor: number;
  atual: FiltroCaixa;
  titulo?: string;
  onSelect: (f: FiltroCaixa) => void;
}> = ({ id, label, valor, atual, titulo, onSelect }) => {
  const ativo = atual === id;
  const t = PILL_TONS[id];
  return (
    <button
      type="button"
      title={titulo}
      /* Clicar na pílula ativa desfaz e volta para "Todas" — mesmo gesto dos
         cartões de cima, para o filtro nunca ficar preso. */
      onClick={() => onSelect(ativo && id !== 'todas' ? 'todas' : id)}
      className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
        ativo ? t.ativo : t.inativo
      }`}
    >
      {label}
      <span className={`ml-1.5 tabular-nums ${ativo ? 'opacity-80' : 'opacity-60'}`}>{valor}</span>
    </button>
  );
};

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
  const [caixa, setCaixa] = useState<FiltroCaixa>('todas');
  const [selecionado, setSelecionado] = useState<DetCliente | null>(null);
  const [modalEmail, setModalEmail] = useState(false);

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

  /** Lista pelos outros eixos (procuração + busca), ANTES do filtro de caixa:
   *  é sobre ela que as pílulas contam, para o número em cada uma ser
   *  exatamente quantas linhas aparecem se você clicar nela. */
  const listaBase = useMemo(() => {
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

  const contagens = useMemo(() => {
    const acc = { todas: listaBase.length, notificacoes: 0, avisos: 0, vazias: 0 };
    for (const c of listaBase) acc[classeCaixa(c)]++;
    return acc;
  }, [listaBase]);

  /** Recorte do e-mail: NAO segue os filtros da tela, para que o que sai por
   *  e-mail seja sempre o mesmo conjunto, tenha quem clicou filtrado o que for. */
  const comNotificacao = useMemo(
    () => clientes.filter((c) => numero(c.notificacoes) > 0),
    [clientes]
  );

  const lista = useMemo(
    () => (caixa === 'todas' ? listaBase : listaBase.filter((c) => classeCaixa(c) === caixa)),
    [listaBase, caixa]
  );

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
          {/* Envio por e-mail. Fica junto do recarregar por ser acao sobre a
              lista inteira, nao sobre a linha — as acoes de linha vivem no
              painel lateral. O contador no cantinho diz de quantas empresas se
              trata antes de abrir. */}
          <button
            onClick={() => setModalEmail(true)}
            title={`Enviar por e-mail as ${comNotificacao.length} empresa(s) com notificacao`}
            className="relative p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-blue-300 flex-shrink-0 group"
          >
            <EnvelopeIcon className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
            {comNotificacao.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {comNotificacao.length}
              </span>
            )}
          </button>
          <button
            onClick={carregar}
            title="Recarregar"
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 flex-shrink-0"
          >
            <ArrowPathIcon className={`w-5 h-5 text-gray-500 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Conteúdo da caixa postal. Combina com os cartões de cima em vez de
            competir com eles: "Com procuração" + "Notificações" é a pergunta
            do dia a dia — quem eu consigo acessar e tem prazo correndo. */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
            Caixa
          </span>
          <PillCaixa
            id="todas"
            label="Todas"
            valor={contagens.todas}
            atual={caixa}
            titulo="Sem filtrar pelo conteúdo da caixa postal"
            onSelect={setCaixa}
          />
          <PillCaixa
            id="notificacoes"
            label="Notificações"
            valor={contagens.notificacoes}
            atual={caixa}
            titulo="Têm ao menos uma Notificação — prazo legal correndo, lida ou não"
            onSelect={setCaixa}
          />
          <PillCaixa
            id="avisos"
            label="Caixa postal"
            valor={contagens.avisos}
            atual={caixa}
            titulo="Têm mensagem, mas nenhuma Notificação — só Avisos, sem prazo"
            onSelect={setCaixa}
          />
          <PillCaixa
            id="vazias"
            label="Sem mensagem"
            valor={contagens.vazias}
            atual={caixa}
            titulo="Nada na caixa postal — inclui quem nunca foi coletado"
            onSelect={setCaixa}
          />
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
                    title={tituloColeta(c)}
                  >
                    {rotuloColeta(c)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modalEmail && (
        <ModalEmailNotificacoes
          empresas={comNotificacao}
          onFechar={() => setModalEmail(false)}
        />
      )}

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
