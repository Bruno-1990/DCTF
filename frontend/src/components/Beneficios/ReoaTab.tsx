import React, { useEffect, useMemo, useState } from 'react';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  QuestionMarkCircleIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  FunnelIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { beneficiosService } from '../../services/beneficios';
import type { ConferenciaSubstituto, SubstitutoCliente, SubstitutoEstabelecimento, FaturamentoAoVivoResp, EstadoColeta } from '../../services/beneficios';

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const labelMes = (ano: number, mes: number) => `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor compacto (ex.: 1,7M · 249k). */
const compacto = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};

const formatCnpj = (cnpj: string) => {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** Classe de cor de um mês conforme o estado (strings estáticas — Tailwind JIT
 *  não gera classes montadas por interpolação). */
const corMes = (abaixo: boolean, semDados: boolean, forte = false) => {
  if (semDados) return 'bg-gray-100 border-gray-200 text-gray-400';
  if (abaixo) return forte ? 'bg-red-100 border-red-300 text-red-700' : 'bg-red-50 border-red-300 text-red-700';
  return forte ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700';
};

const mesesAbaixoDoCliente = (c: SubstitutoCliente) =>
  c.estabelecimentos.reduce((acc, e) => acc + e.meses.filter(m => m.abaixo).length, 0);

const mesesSemColetaDoCliente = (c: SubstitutoCliente) =>
  c.estabelecimentos.reduce((acc, e) => acc + e.mesesSemDados, 0);

/**
 * Selo de status. Três, e não dois, pelo mesmo motivo do backend: "conferido e
 * dentro do limite" e "não conferido" não podem sair verdes iguais.
 */
const SELO_STATUS: Record<string, { texto: string; classe: string; borda: string }> = {
  ABAIXO: {
    texto: 'Alerta',
    classe: 'bg-red-100 text-red-700',
    borda: 'border-red-200 hover:border-red-300',
  },
  INDETERMINADO: {
    texto: 'A conferir',
    classe: 'bg-amber-100 text-amber-700',
    borda: 'border-amber-200 hover:border-amber-300',
  },
  OK: {
    texto: 'Ok',
    classe: 'bg-emerald-100 text-emerald-700',
    borda: 'border-gray-100 hover:border-gray-200',
  },
};

/**
 * Há quanto tempo o SCI foi consultado para este cliente.
 *
 * Substitui o "● SCI ao vivo", que dizia apenas "existe linha na tabela" — e
 * seguia dizendo isso para dado de um mês atrás. O que o Fiscal precisa saber
 * antes de confiar no verde é a DATA, não a origem.
 */
const rotuloColeta = (c: SubstitutoCliente, agora: boolean) => {
  if (agora) return 'coletado agora';
  if (!c.coletadoEm) return 'nunca coletado';
  const d = new Date(c.coletadoEm);
  if (Number.isNaN(d.getTime())) return 'nunca coletado';
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return dias <= 1 ? `coletado ${data}` : `coletado ${data} · ${dias} dias`;
};


// ─── Cartão de resumo do topo ───
const CardResumo: React.FC<{ titulo: string; valor: React.ReactNode; sub?: string; tom?: 'neutro' | 'alerta' | 'ok' }> = ({ titulo, valor, sub, tom = 'neutro' }) => {
  const tomClasses = tom === 'alerta' ? 'text-red-600' : tom === 'ok' ? 'text-emerald-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${tomClasses}`}>{valor}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

// ─── Fita compacta dos 12 meses (pontos) — cabe no card, sem rolagem ───
const FitaMeses: React.FC<{ estab: SubstitutoEstabelecimento }> = ({ estab }) => (
  <div className="flex flex-wrap gap-1">
    {estab.meses.map(m => (
      <span
        key={m.bdref}
        title={`${labelMes(m.ano, m.mes)}: ${m.semDados ? 'sem dados' : brl.format(m.faturamento ?? 0)}`}
        className={`h-5 w-5 rounded border ${corMes(m.abaixo, m.semDados)}`}
      />
    ))}
  </div>
);

const ReoaTab: React.FC = () => {
  const [data, setData] = useState<ConferenciaSubstituto | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ok' | 'abaixo' | 'indeterminado'>(
    'todos'
  );
  const [selecionado, setSelecionado] = useState<SubstitutoCliente | null>(null);
  // Dados ao vivo do SCI já puxados nesta sessão (por cliente). Sobrepõem o cache
  // no card e no modal — assim, ao fechar o modal, os faturamentos reais permanecem.
  const [liveByCliente, setLiveByCliente] = useState<Map<string, SubstitutoCliente>>(new Map());
  const registrarLive = (cli: SubstitutoCliente) =>
    setLiveByCliente(prev => new Map(prev).set(cli.id, cli));

  // Aviso por e-mail (destinatários como tags)
  const [destinatariosTags, setDestinatariosTags] = useState<string[]>(['fiscal@central-rnc.com.br', 'leg@central-rnc.com.br']);
  const [emailInput, setEmailInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [avisoMsg, setAvisoMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const commitTag = () => {
    const v = emailInput.trim().replace(/,+$/, '').trim();
    if (!v) return;
    setDestinatariosTags(prev => (prev.includes(v) ? prev : [...prev, v]));
    setEmailInput('');
  };
  const onKeyDownEmail = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ',') {
      if (emailInput.trim()) { e.preventDefault(); commitTag(); }
    } else if (e.key === 'Backspace' && !emailInput && destinatariosTags.length) {
      setDestinatariosTags(prev => prev.slice(0, -1));
    }
  };
  const removerTag = (i: number) => setDestinatariosTags(prev => prev.filter((_, idx) => idx !== i));

  const enviarAviso = async () => {
    setEnviando(true); setAvisoMsg(null);
    try {
      // inclui um e-mail que ficou digitado sem virar tag
      const lista = [...destinatariosTags];
      const pend = emailInput.trim().replace(/,+$/, '').trim();
      if (pend && !lista.includes(pend)) lista.push(pend);
      const resp = await beneficiosService.enviarAvisoSubstituto(lista);
      if (resp.success && resp.enviado) {
        setAvisoMsg({ tipo: 'ok', texto: `Aviso enviado (${resp.totalNaoOk} cliente(s)) para ${resp.destinatarios?.join(', ')}.` });
      } else if (resp.success) {
        setAvisoMsg({ tipo: 'ok', texto: resp.mensagem || 'Nenhum cliente fora do limite — nada enviado.' });
      } else {
        setAvisoMsg({ tipo: 'erro', texto: resp.error || 'Falha ao enviar.' });
      }
    } catch (e: any) {
      setAvisoMsg({ tipo: 'erro', texto: e?.response?.data?.error ?? e?.message ?? 'Falha ao enviar o aviso.' });
    } finally { setEnviando(false); setConfirmando(false); }
  };

  const carregar = async () => {
    setLoading(true); setErro(null);
    try {
      setData(await beneficiosService.conferenciaSubstituto());
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e?.message ?? 'Erro ao carregar a conferência.');
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  // Fecha o modal com ESC.
  useEffect(() => {
    if (!selecionado) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelecionado(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecionado]);

  const janela = data?.janela ?? [];

  // Visão efetiva de um cliente: dado ao vivo (se já puxado) sobrepõe o cache.
  const efetivo = (c: SubstitutoCliente) => liveByCliente.get(c.id) ?? c;

  const dadosAte = useMemo(() => {
    let max = 0; let label = '';
    for (const c of data?.clientes ?? []) for (const e of efetivo(c).estabelecimentos) for (const m of e.meses) {
      if (!m.semDados && m.bdref > max) { max = m.bdref; label = labelMes(m.ano, m.mes); }
    }
    return label || '—';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, liveByCliente]);

  const comAlerta = useMemo(
    () => (data?.clientes ?? []).filter(c => efetivo(c).status === 'ABAIXO').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, liveByCliente]
  );

  // Nem alerta nem conformidade: falta mês na janela. A ação é outra — não é
  // cobrar o cliente, é abrir o card e puxar o SCI.
  const aConferir = useMemo(
    () => (data?.clientes ?? []).filter(c => efetivo(c).status === 'INDETERMINADO').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, liveByCliente]
  );

  /**
   * Andamento da coleta em lote.
   *
   * O polling só existe ENQUANTO ela roda, e recarrega a conferência quando
   * termina — a varredura leva minutos e quem clicou precisa ver o resultado
   * sem apertar "Atualizar" de novo. Ao montar, uma consulta única cobre o caso
   * de a coleta ter sido disparada pelo job mensal ou por outra aba.
   */
  const [coleta, setColeta] = useState<EstadoColeta | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const consultar = async () => {
      try {
        const r = await beneficiosService.statusColetaSubstituto();
        if (!vivo) return;
        setColeta((anterior) => {
          // Terminou agora: recarrega a conferência para a tela refletir a coleta.
          if (anterior?.rodando && !r.status.rodando) void carregar();
          return r.status;
        });
        if (!r.status.rodando && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // Status é acessório: falha aqui não pode derrubar a tela.
      }
    };

    void consultar();
    timer = setInterval(consultar, 3000);
    return () => {
      vivo = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const coletarTodos = async () => {
    setErro(null);
    try {
      const r = await beneficiosService.coletarTodosSubstituto();
      if (r.status) setColeta(r.status);
      // Marca como rodando na hora: o 202 volta antes de o primeiro cliente
      // entrar, e sem isto o botão piscaria de volta para "Coletar todos".
      setColeta((a) => ({
        rodando: true,
        bdref: a?.bdref ?? null,
        total: a?.total ?? 0,
        processados: 0,
        clienteAtual: null,
        iniciadoEm: new Date().toISOString(),
        concluidoEm: null,
      }));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErro(msg || 'Falha ao iniciar a coleta.');
    }
  };

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const soDigitos = termo.replace(/\D/g, '');
    return (data?.clientes ?? []).filter(c => {
      // Filtro por status (usa o dado efetivo: ao vivo se já puxado)
      if (filtroStatus !== 'todos') {
        const status = efetivo(c).status;
        if (filtroStatus === 'abaixo' && status !== 'ABAIXO') return false;
        if (filtroStatus === 'ok' && status !== 'OK') return false;
        if (filtroStatus === 'indeterminado' && status !== 'INDETERMINADO') return false;
      }
      // Filtro por busca
      if (termo) {
        const bate = c.razao_social.toLowerCase().includes(termo)
          || (!!soDigitos && (c.cnpj || '').replace(/\D/g, '').includes(soDigitos))
          || String(c.codigo_sci ?? '').includes(termo);
        if (!bate) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, busca, filtroStatus, liveByCliente]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Conferência REOA — grupo Substituto</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Clientes com o benefício <strong>SUBSTITUTO</strong> devem manter o faturamento{' '}
              <strong>mensal de cada estabelecimento acima de {brl.format(data?.threshold ?? 300000)}</strong>.
              Os cards são uma prévia rápida (cache); clique num cliente para puxar os <strong>dados reais do SCI</strong> dos últimos 12 meses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/*
              Coleta em lote — a mesma que o job mensal faz, sob demanda.
              Existe porque abrir card por card era o único jeito de trazer o mês
              novo, e cliente que ninguém abre fica com a janela furada.
            */}
            <button
              type="button"
              onClick={coletarTodos}
              disabled={coleta?.rodando || loading}
              title="Puxa o SCI de todos os clientes do grupo, um a um. Leva alguns minutos; a mesma rotina roda sozinha todo mês."
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 text-sm font-medium transition-colors disabled:opacity-60"
            >
              <CloudArrowDownIcon className={`h-4 w-4 ${coleta?.rodando ? 'animate-pulse' : ''}`} />
              {coleta?.rodando
                ? `Coletando ${coleta.processados}/${coleta.total}…`
                : 'Coletar todos'}
            </button>
            <button type="button" onClick={carregar} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors disabled:opacity-60">
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>
        </div>

        {coleta?.rodando && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="flex items-center justify-between gap-3">
              <span>
                Coletando do SCI{coleta.clienteAtual ? ` — ${coleta.clienteAtual}` : ''}…
              </span>
              <span className="font-mono text-xs">
                {coleta.processados}/{coleta.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-rose-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-300"
                style={{ width: `${coleta.total ? (coleta.processados / coleta.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-rose-600">
              Uma consulta por cliente, em sequência — a procedure do SCI não aceita paralelismo.
              Pode fechar a tela: a coleta segue no servidor.
            </p>
          </div>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{erro}</div>}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="h-8 w-8 border-b-2 border-rose-500 rounded-full animate-spin" />
          <p className="mt-3 text-sm">Carregando conferência…</p>
        </div>
      ) : data && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <CardResumo titulo="Clientes no grupo" valor={data.resumo.totalClientes} />
            <CardResumo titulo="Com alerta" valor={comAlerta} sub="algum mês abaixo do limite" tom={comAlerta > 0 ? 'alerta' : 'ok'} />
            <CardResumo titulo="A conferir" valor={aConferir} sub="falta mês na janela" tom={aConferir > 0 ? 'alerta' : 'ok'} />
            <CardResumo titulo="Limite mensal" valor={brl.format(data.threshold)} />
            <CardResumo
              titulo="Janela"
              valor={janela.length ? `${labelMes(janela[0].ano, janela[0].mes)} → ${labelMes(janela[janela.length - 1].ano, janela[janela.length - 1].mes)}` : '—'}
              sub={`dados até ${dadosAte}`}
            />
          </div>

          {/* Aviso por e-mail — lista dos clientes NÃO ok */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <EnvelopeIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-800">Aviso por e-mail</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Envia a lista dos <strong>{comAlerta}</strong> cliente(s) fora do limite (com faturamentos) e o link da página.
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-start">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-2 border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-rose-500 focus-within:border-rose-500">
                    {destinatariosTags.map((t, i) => (
                      <span key={`${t}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-medium">
                        {t}
                        <button type="button" onClick={() => removerTag(i)} className="text-rose-500 hover:text-red-600" title="Remover">
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={onKeyDownEmail}
                      onBlur={commitTag}
                      placeholder={destinatariosTags.length ? 'adicionar e-mail…' : 'destinatários'}
                      className="flex-1 min-w-[150px] px-1 py-1 text-sm outline-none border-0 focus:ring-0 bg-transparent"
                    />
                  </div>
                  {!confirmando ? (
                    <button
                      type="button"
                      onClick={() => { setAvisoMsg(null); setConfirmando(true); }}
                      disabled={comAlerta === 0 || enviando}
                      className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={comAlerta === 0 ? 'Nenhum cliente fora do limite' : undefined}
                    >
                      <PaperAirplaneIcon className="h-4 w-4" /> Enviar aviso
                    </button>
                  ) : (
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Confirmar envio?</span>
                      <button type="button" onClick={enviarAviso} disabled={enviando}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
                        {enviando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                        {enviando ? 'Enviando…' : 'Confirmar'}
                      </button>
                      <button type="button" onClick={() => setConfirmando(false)} disabled={enviando}
                        className="px-3 py-2 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
                    </div>
                  )}
                </div>
                {avisoMsg && (
                  <p className={`mt-2 text-xs ${avisoMsg.tipo === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{avisoMsg.texto}</p>
                )}
              </div>
            </div>
          </div>

          {/* Busca + filtro + legenda */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="relative w-full sm:w-80">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por razão social, CNPJ ou código SCI…"
                  className="w-full pl-10 pr-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-sm" />
              </div>
              <div className="relative">
                <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rose-500 pointer-events-none" />
                <select
                  value={filtroStatus}
                  onChange={e =>
                    setFiltroStatus(e.target.value as 'todos' | 'ok' | 'abaixo' | 'indeterminado')
                  }
                  className="pl-9 pr-8 py-2.5 border-2 border-gray-200 rounded-xl bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 appearance-none cursor-pointer"
                >
                  <option value="todos">Todos</option>
                  <option value="abaixo">Abaixo (alerta)</option>
                  <option value="indeterminado">A conferir (falta coletar)</option>
                  <option value="ok">OK (janela completa)</option>
                </select>
                <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> Ok</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100 border border-red-300" /> Abaixo</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-100 border border-gray-300" /> Sem dados</span>
            </div>
          </div>

          {/* Grid de cards — cabe na página, sem rolagem horizontal */}
          {clientesFiltrados.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center text-gray-400">
              {data.clientes.length === 0 ? 'Nenhum cliente com benefício SUBSTITUTO.' : 'Nenhum cliente encontrado para a busca.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {clientesFiltrados.map(base => {
                const c = efetivo(base); // usa o dado ao vivo se já foi puxado nesta sessão
                const ehLive = liveByCliente.has(base.id) || !!c.aoVivo; // aoVivo = persistido no banco
                const abaixo = mesesAbaixoDoCliente(c);
                const semColeta = mesesSemColetaDoCliente(c);
                const selo = SELO_STATUS[c.status] ?? SELO_STATUS['OK'];
                return (
                  <button
                    key={base.id}
                    type="button"
                    onClick={() => setSelecionado(base)}
                    className={`text-left bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${selo.borda}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate" title={c.razao_social}>{c.razao_social}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{formatCnpj(c.cnpj)}{c.codigo_sci ? ` · SCI ${c.codigo_sci}` : ''}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${selo.classe}`}
                        title={
                          c.status === 'ABAIXO'
                            ? 'Algum mês da janela ficou comprovadamente abaixo do limite.'
                            : c.status === 'INDETERMINADO'
                              ? 'Falta mês na janela: o SCI não foi consultado para todo o período, então não dá para afirmar nem que está dentro do limite nem que está fora. Abra o card para puxar.'
                              : 'Os 12 meses da janela foram conferidos e todos ficaram acima do limite.'
                        }
                      >
                        {c.status === 'ABAIXO' ? (
                          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                        ) : c.status === 'INDETERMINADO' ? (
                          <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                        )}
                        {selo.texto}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {c.estabelecimentos.map(e => (
                        <div key={e.codigo_empresa}>
                          {c.estabelecimentos.length > 1 && (
                            <p className="text-[11px] font-semibold text-gray-500 mb-1">{e.rotulo}</p>
                          )}
                          <FitaMeses estab={e} />
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span
                        className={
                          abaixo > 0
                            ? 'text-red-600 font-medium'
                            : semColeta > 0
                              ? 'text-amber-600 font-medium'
                              : 'text-gray-400'
                        }
                      >
                        {abaixo > 0
                          ? `${abaixo} ${abaixo === 1 ? 'mês' : 'meses'} abaixo`
                          : semColeta > 0
                            ? `${semColeta} ${semColeta === 1 ? 'mês' : 'meses'} sem coleta`
                            : '12 meses conferidos'}
                      </span>
                      <span className={ehLive ? 'text-gray-500' : 'text-gray-400'}>
                        {rotuloColeta(c, liveByCliente.has(base.id))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de detalhe */}
      {selecionado && (
        <ModalDetalhe
          cliente={efetivo(selecionado)}
          jaAoVivo={liveByCliente.has(selecionado.id) || !!efetivo(selecionado).aoVivo}
          threshold={data?.threshold ?? 300000}
          onLive={registrarLive}
          onClose={() => setSelecionado(null)}
        />
      )}
    </div>
  );
};

// ─── Modal com o detalhe dos 12 meses — puxa AO VIVO do SCI (Quadro 1) ───
const ModalDetalhe: React.FC<{
  cliente: SubstitutoCliente;
  jaAoVivo: boolean;
  threshold: number;
  onLive: (c: SubstitutoCliente) => void;
  onClose: () => void;
}> = ({ cliente, jaAoVivo, threshold, onLive, onClose }) => {
  // Se este cliente já foi puxado do SCI nesta sessão, começa exibindo o dado real
  // (sem re-consultar). Senão, busca ao abrir.
  const [live, setLive] = useState<FaturamentoAoVivoResp | null>(jaAoVivo ? { success: true, cliente, threshold } : null);
  const [loading, setLoading] = useState(!jaAoVivo);
  const [erro, setErro] = useState<string | null>(null);

  const puxar = async () => {
    setLoading(true); setErro(null);
    try {
      const resp = await beneficiosService.faturamentoAoVivoSubstituto(cliente.id);
      setLive(resp);
      if (resp.success && resp.cliente) onLive(resp.cliente); // eleva p/ o pai → card fica atualizado
      else if (!resp.semCodigoSci) setErro(resp.error ?? 'Falha ao consultar o SCI.');
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e?.message ?? 'Falha ao consultar o SCI.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!jaAoVivo) puxar(); /* eslint-disable-next-line */ }, [cliente.id]);

  const aoVivoOk = !!live?.success && !!live.cliente;
  const semSci = !!live?.semCodigoSci;
  // Enquanto carrega/erro, mostra a prévia do cache; quando o SCI responde, usa o dado real.
  const view: SubstitutoCliente = aoVivoOk ? (live!.cliente as SubstitutoCliente) : cliente;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <BuildingOfficeIcon className="h-5 w-5 text-rose-600 shrink-0" />
              <span className="truncate">{view.razao_social}</span>
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {formatCnpj(view.cnpj)}{view.codigo_sci ? ` · SCI ${view.codigo_sci}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={puxar} disabled={loading} title="Puxar do SCI novamente"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                (SELO_STATUS[view.status] ?? SELO_STATUS['OK']).classe
              }`}
            >
              {view.status === 'ABAIXO' ? (
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              ) : view.status === 'INDETERMINADO' ? (
                <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
              ) : (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              )}
              {(SELO_STATUS[view.status] ?? SELO_STATUS['OK']).texto}
            </span>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><XMarkIcon className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Banner de fonte dos dados */}
        {loading ? (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-100 text-rose-700 text-xs flex items-center gap-2">
            <ArrowPathIcon className="h-4 w-4 animate-spin" /> Puxando dados reais do SCI (Quadro 1)… pode levar ~30s. Exibindo prévia do cache.
          </div>
        ) : semSci ? (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs">
            Cliente sem código SCI configurado — exibindo prévia do cache.
          </div>
        ) : erro ? (
          <div className="px-6 py-2.5 bg-red-50 border-b border-red-100 text-red-700 text-xs">
            Falha ao consultar o SCI: {erro} — exibindo prévia do cache.
          </div>
        ) : aoVivoOk ? (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-100 text-emerald-700 text-xs flex items-center gap-1.5">
            <CheckCircleIcon className="h-4 w-4" /> Dados ao vivo do SCI · Quadro 1 (consolidada, por estabelecimento).
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <p className="text-sm text-gray-500">
            Faturamento mensal deve ficar acima de <strong>{brl.format(live?.threshold ?? threshold)}</strong>. Meses em vermelho ficaram abaixo; cinza indica meses ainda não apurados.
          </p>
          {view.estabelecimentos.map(estab => {
            const abaixo = estab.meses.filter(m => m.abaixo).length;
            return (
              <div key={estab.codigo_empresa}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-700">{estab.rotulo}</h3>
                  <span className={`text-xs ${abaixo > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {abaixo > 0 ? `${abaixo} ${abaixo === 1 ? 'mês' : 'meses'} abaixo · ` : ''}{estab.mesesSemDados} sem dados
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {estab.meses.map(m => (
                    <div key={m.bdref} className={`rounded-lg border px-2.5 py-2 ${corMes(m.abaixo, m.semDados, true)}`}>
                      <span className="block text-[10px] uppercase tracking-wide opacity-70">{labelMes(m.ano, m.mes)}</span>
                      <span className="block text-sm font-semibold mt-0.5">
                        {m.semDados ? '—' : brl.format(m.faturamento ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReoaTab;
