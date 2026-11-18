import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import {
  ouvirParticipacao,
  participacaoSitfService,
  type EventoLote,
  type ItemPrevia,
  type LoteInterrompido,
  type SituacaoParticipacao,
} from '../../services/participacaoSitf';

/** Quanto tempo a linha fica destacada depois de mudar ao vivo. */
const DESTAQUE_MS = 15_000;

/**
 * Painel da aba Participação: leva ao cadastro os sócios da Situação Fiscal consultada NO MÊS
 * CORRENTE. Quem não tem a do mês (desatualizada ou nunca consultada) entra na consulta obrigatória
 * e não pode ser aplicado até ser consultado de novo.
 */

const ROTULO: Record<SituacaoParticipacao, string> = {
  atualizar: 'Para atualizar',
  revisar: 'Revisar',
  em_dia: 'Em dia',
  desatualizada: 'Desatualizada',
  sem_sitf: 'Sem Situação Fiscal',
};

const COR: Record<SituacaoParticipacao, string> = {
  atualizar: 'bg-amber-100 text-amber-900 border-amber-300',
  revisar: 'bg-rose-50 text-rose-800 border-rose-200',
  em_dia: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  desatualizada: 'bg-orange-50 text-orange-800 border-orange-300',
  sem_sitf: 'bg-gray-100 text-gray-700 border-gray-300',
};

const ORDEM: SituacaoParticipacao[] = ['atualizar', 'revisar', 'em_dia', 'desatualizada', 'sem_sitf'];

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const cnpjFmt = (c: string) =>
  c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
const mesAtual = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

interface Props {
  /** Chamado com os clientes gravados, para a aba recarregar só esses. */
  onAtualizados: (clienteIds: string[]) => void;
  /** Data da Situação Fiscal de quem está em dia com ela, por cliente (atualiza ao vivo). */
  onConsultas?: (consultadoEm: Record<string, string | null>) => void;
  /**
   * 'admin': só a consulta obrigatória em lote (iniciar, acompanhar, parar), para a Administração.
   * 'participacao' (padrão): prévia e aplicação; o lote só é acompanhado, sem iniciar nem parar.
   */
  modo?: 'participacao' | 'admin';
}

export default function AtualizarParticipacaoSitf({ onAtualizados, onConsultas, modo = 'participacao' }: Props) {
  const ehAdmin = modo === 'admin';
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [itens, setItens] = useState<ItemPrevia[] | null>(null);
  const [filtro, setFiltro] = useState<SituacaoParticipacao>('atualizar');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [lote, setLote] = useState<EventoLote | null>(null);
  const [interrompido, setInterrompido] = useState<LoteInterrompido | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [erroInicio, setErroInicio] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState(false);
  const [destacados, setDestacados] = useState<Record<string, string>>({});
  const aplicandoAqui = useRef<Set<string>>(new Set());
  const onAtualizadosRef = useRef(onAtualizados);
  onAtualizadosRef.current = onAtualizados;
  const itensRef = useRef<ItemPrevia[] | null>(itens);
  itensRef.current = itens;
  const onConsultasRef = useRef(onConsultas);
  onConsultasRef.current = onConsultas;
  useEffect(() => {
    if (!itens) return;
    // Só conta como atualizado quem já confere com a Situação Fiscal: com mudança pendente, não.
    onConsultasRef.current?.(
      Object.fromEntries(itens.map((i) => [i.clienteId, i.situacao === 'em_dia' ? i.consultadoEm : null])),
    );
  }, [itens]);

  const destacar = (clienteId: string, texto: string) => {
    setDestacados((d) => ({ ...d, [clienteId]: texto }));
    setTimeout(
      () =>
        setDestacados((d) => {
          const { [clienteId]: _removido, ...resto } = d;
          return resto;
        }),
      DESTAQUE_MS,
    );
  };

  // SSE: o que está sendo atualizado agora (lote, extração de cada empresa, gravações de qualquer aba).
  useEffect(() => {
    const canal = ouvirParticipacao({
      onConexao: setAoVivo,
      onPronto: (l, parado) => {
        setLote(l);
        setInterrompido(parado);
      },
      onLote: (l) => {
        setLote(l);
        if (l.status === 'em_andamento') setInterrompido(null);
        if (l.status === 'interrompida') {
          setInterrompido({ ...l, iniciadoEm: null, finalizadoEm: new Date().toISOString() });
          return;
        }
        if (l.status === 'concluida' || l.status === 'cancelada') {
          toast.info(
            `Lote de Situação Fiscal ${l.status === 'concluida' ? 'concluído' : 'cancelado'}: ` +
              `${l.sucessos} ok, ${l.erros} com erro. A prévia já está atualizada.`,
          );
        }
      },
      onAplicado: ({ clienteId }) => {
        // Gravado por esta aba: quem recarrega é o próprio aplicar(). Gravado por outra: recarrega aqui.
        if (!aplicandoAqui.current.has(clienteId)) onAtualizadosRef.current([clienteId]);
      },
      onCliente: (item) => {
        if (!itensRef.current) return;
        const antes = itensRef.current.find((i) => i.clienteId === item.clienteId);
        let texto = '';
        if (antes && antes.situacao !== item.situacao) texto = `${ROTULO[antes.situacao]} → ${ROTULO[item.situacao]}`;
        else if (!antes || antes.extraidoEm !== item.extraidoEm) texto = 'Situação Fiscal nova';
        setItens((lista) => {
          if (!lista) return lista;
          return lista.some((i) => i.clienteId === item.clienteId)
            ? lista.map((i) => (i.clienteId === item.clienteId ? item : i))
            : [...lista, item];
        });
        setSelecionados((s) => {
          const n = new Set(s);
          if (item.situacao === 'atualizar') n.add(item.clienteId);
          else n.delete(item.clienteId);
          return n;
        });
        if (texto) destacar(item.clienteId, texto);
      },
    });
    return () => canal.fechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const { itens: lista } = await participacaoSitfService.previa();
      setItens(lista);
      setSelecionados(new Set(lista.filter((i) => i.situacao === 'atualizar').map((i) => i.clienteId)));
      if (!lista.some((i) => i.situacao === 'atualizar')) {
        setFiltro(ORDEM.find((s) => lista.some((i) => i.situacao === s)) ?? 'atualizar');
      }
    } catch (e: unknown) {
      toast.error('Não foi possível montar a prévia da participação.');
      console.error('[Participação SITF] prévia', e);
    } finally {
      setCarregando(false);
    }
  };

  // A prévia carrega ao abrir a aba: a consulta obrigatória do mês precisa aparecer sem clicar em nada.
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = () => {
    setAberto(true);
    if (!itens && !carregando) void carregar();
  };

  const contagem = useMemo(() => {
    const t: Record<SituacaoParticipacao, number> = { atualizar: 0, revisar: 0, em_dia: 0, desatualizada: 0, sem_sitf: 0 };
    for (const i of itens ?? []) t[i.situacao]++;
    return t;
  }, [itens]);

  const visiveis = useMemo(() => (itens ?? []).filter((i) => i.situacao === filtro), [itens, filtro]);

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const aplicar = async () => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setAplicando(true);
    ids.forEach((id) => aplicandoAqui.current.add(id));
    try {
      const r = await participacaoSitfService.aplicar(ids);
      const socios = r.aplicados.reduce((t, a) => t + a.sociosAtualizados, 0);
      toast.success(`${r.aplicados.length} cliente(s) atualizado(s), ${socios} sócio(s).`);
      if (r.ignorados.length) {
        toast.warning(`${r.ignorados.length} cliente(s) não gravado(s): ${[...new Set(r.ignorados.map((i) => i.motivo))].join('; ')}.`);
      }
      onAtualizados(r.aplicados.map((a) => a.clienteId));
      await carregar();
    } catch (e: unknown) {
      toast.error('Erro ao gravar a participação dos sócios.');
      console.error('[Participação SITF] aplicar', e);
    } finally {
      setAplicando(false);
      // Os avisos 'aplicado' desta gravação podem chegar logo depois da resposta: solta só em seguida.
      setTimeout(() => ids.forEach((id) => aplicandoAqui.current.delete(id)), 5000);
    }
  };

  const consultarObrigatorias = async () => {
    setIniciando(true);
    setErroInicio(null);
    try {
      const andamento = await api.get('/situacao-fiscal/lote/em-andamento');
      if (andamento.data?.emAndamento) {
        const d = andamento.data;
        // Mostra o lote que está rodando em vez de só avisar.
        setLote({
          tipo: 'lote', progressId: d.progressId, status: 'em_andamento', total: Number(d.data?.total ?? 0),
          processados: Number(d.data?.processados ?? 0), sucessos: 0, erros: 0,
          porcentagem: d.data?.total ? Math.round((Number(d.data.processados) / Number(d.data.total)) * 100) : 0,
          cnpjAtual: null,
        });
        setConfirmandoLote(false);
        return;
      }
      const r = await participacaoSitfService.consultarObrigatorias();
      setConfirmandoLote(false);
      if (!r.enfileirados) {
        toast.info(`Todas as empresas já têm a Situação Fiscal de ${r.mesVigente}.`);
        return;
      }
      // A faixa aparece já; o SSE assume a partir do primeiro passo do lote.
      setInterrompido(null);
      setLote((atual) =>
        atual?.status === 'em_andamento'
          ? atual
          : {
              tipo: 'lote', progressId: r.progressId ?? '', status: 'em_andamento', total: r.total ?? r.enfileirados,
              processados: 0, sucessos: 0, erros: 0, porcentagem: 0, cnpjAtual: 'Iniciando a primeira consulta…',
            },
      );
      toast.success(`Consulta obrigatória de ${r.mesVigente} iniciada: ${r.total ?? r.enfileirados} empresa(s).`);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Não foi possível iniciar a consulta obrigatória.';
      setErroInicio(msg);
      console.error('[Participação SITF] consulta obrigatória', e);
    } finally {
      setIniciando(false);
    }
  };

  const pararLote = async (progressId: string) => {
    try {
      await api.post(`/situacao-fiscal/lote/${progressId}/cancelar`);
      toast.info('Lote parando: termina a empresa que está sendo consultada e para.');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Não foi possível parar o lote.');
    }
  };

  const precisamConsulta = contagem.desatualizada + contagem.sem_sitf;
  const loteRodando = lote?.status === 'em_andamento';
  const quando = (v: string | null) =>
    v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const faixaInterrompido = !loteRodando && interrompido && (
    <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
      <strong>O lote de Situação Fiscal{interrompido.iniciadoEm ? ` iniciado em ${quando(interrompido.iniciadoEm)}` : ''} parou
      em {interrompido.processados}/{interrompido.total}</strong>: o servidor foi reiniciado no meio
      {interrompido.finalizadoEm ? ` (detectado em ${quando(interrompido.finalizadoEm)})` : ''}. Nada está rodando agora.
      {precisamConsulta > 0
        ? ' Para retomar, use a consulta obrigatória abaixo: quem já foi consultado neste mês fica de fora.'
        : ' Todas as empresas já têm a Situação Fiscal do mês.'}
    </div>
  );
  const blocoObrigatoria = itens && precisamConsulta > 0 && !loteRodando && (
    <div className="mb-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-xs text-orange-900 flex flex-wrap items-center justify-between gap-2">
      <span>
        <strong>Consulta obrigatória de {mesAtual()}:</strong> {precisamConsulta} empresa(s) sem a Situação Fiscal do mês
        ({contagem.desatualizada} desatualizada(s), {contagem.sem_sitf} nunca consultada(s)). Só a Situação Fiscal do mês
        corrente pode atualizar a participação. Cada empresa é uma consulta cobrada ao SERPRO, com ~30 s entre elas
        (cerca de {Math.max(1, Math.round((precisamConsulta * 45) / 60))} min no total).
        {!ehAdmin && (
          <>
            {' '}
            <strong>A consulta em lote é feita por um administrador, em Administração › Consultas em lote.</strong>
          </>
        )}
      </span>
      {!ehAdmin ? null : confirmandoLote ? (
        <div className="w-full rounded-lg border-2 border-orange-500 bg-white p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <span className="text-sm text-gray-900">
            <strong>Confirma iniciar {precisamConsulta} consulta(s) cobradas no SERPRO agora?</strong>
            <br />
            <span className="text-xs text-gray-600">O progresso aparece nesta aba e dá para parar a qualquer momento.</span>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => void consultarObrigatorias()}
              disabled={iniciando}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-70 flex items-center gap-2"
            >
              {iniciando && <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              {iniciando ? 'Iniciando…' : 'Sim, iniciar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoLote(false)}
              disabled={iniciando}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 bg-white disabled:opacity-50"
            >
              Cancelar
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setErroInicio(null);
            setConfirmandoLote(true);
          }}
          className="px-3 py-1.5 font-semibold rounded-lg border border-orange-400 text-orange-800 bg-white hover:bg-orange-100"
        >
          Consultar as {precisamConsulta} no SERPRO
        </button>
      )}
      {erroInicio && (
        <div className="w-full rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-rose-800">
          <strong>Não iniciou:</strong> {erroInicio}
        </div>
      )}
    </div>
  );
  const faixaLote = loteRodando && lote && (
    <div className="mb-3 rounded-lg border-2 border-indigo-300 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <strong>Consultando a Situação Fiscal no SERPRO:</strong> {lote.processados}/{lote.total} ({lote.porcentagem}%)
          {lote.erros > 0 && <span className="text-rose-700"> · {lote.erros} com erro</span>}
        </span>
        <span className="flex items-center gap-2 min-w-0 max-w-[70%]">
          <span className="truncate">{lote.cnpjAtual ? `Agora: ${lote.cnpjAtual}` : ''}</span>
          {ehAdmin && (
          <button
            type="button"
            onClick={() => void pararLote(lote.progressId)}
            className="shrink-0 px-2 py-0.5 font-semibold rounded border border-indigo-300 bg-white hover:bg-indigo-100"
            title="Para depois da empresa que está sendo consultada agora"
          >
            Parar lote
          </button>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${lote.porcentagem}%` }} />
      </div>
    </div>
  );

  if (ehAdmin) {
    return (
      <div>
        {faixaLote}
        {faixaInterrompido}
        {blocoObrigatoria}
        {!itens && carregando && <p className="text-sm text-gray-500 py-2">Verificando quem está sem a Situação Fiscal do mês…</p>}
        {itens && precisamConsulta === 0 && !loteRodando && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Todas as empresas já têm a Situação Fiscal de {mesAtual()}. Nada a consultar.
          </p>
        )}
        {itens && (
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {carregando ? 'Verificando…' : 'Verificar de novo'}
          </button>
        )}
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="mb-4">
        {faixaLote}
        {faixaInterrompido}
        {blocoObrigatoria}
        <div className="flex justify-end">
        <button
          type="button"
          onClick={abrir}
          className="px-4 py-2 text-sm font-semibold rounded-xl border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          Atualizar participação pela Situação Fiscal
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-amber-200 p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            Atualizar participação pela Situação Fiscal
            <span
              title={aoVivo ? 'Recebendo as atualizações em tempo real' : 'Sem conexão em tempo real; reconectando…'}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                aoVivo ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${aoVivo ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {aoVivo ? 'ao vivo' : 'reconectando'}
            </span>
          </h3>
          <p className="text-xs text-gray-600 mt-1 max-w-3xl">
            Só vale a Situação Fiscal consultada em {mesAtual()}: a de meses anteriores fica em &quot;Desatualizada&quot;
            e precisa ser consultada de novo. Só preenche CPF vazio e atualiza o percentual; não cria nem apaga
            sócio. Sócio que aparece só de um lado fica em &quot;Revisar&quot;.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {carregando ? 'Carregando…' : 'Recarregar prévia'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
      </div>

      {faixaLote}
      {faixaInterrompido}
      {blocoObrigatoria}

      {itens && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {ORDEM.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltro(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${COR[s]} ${
                  filtro === s ? 'ring-2 ring-offset-1 ring-amber-400' : 'opacity-80 hover:opacity-100'
                }`}
              >
                {ROTULO[s]}: {contagem[s]}
              </button>
            ))}
          </div>

          {filtro === 'atualizar' && contagem.atualizar > 0 && (
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-700 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visiveis.every((i) => selecionados.has(i.clienteId))}
                  onChange={(e) =>
                    setSelecionados(e.target.checked ? new Set(visiveis.map((i) => i.clienteId)) : new Set())
                  }
                />
                Selecionar todos
              </label>
              <button
                type="button"
                onClick={() => void aplicar()}
                disabled={aplicando || selecionados.size === 0}
                className="px-4 py-2 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50"
              >
                {aplicando ? 'Gravando…' : `Aplicar nos selecionados (${selecionados.size})`}
              </button>
            </div>
          )}

          {visiveis.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhuma empresa nesta situação.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {visiveis.map((i) => (
                <LinhaPrevia
                  key={i.clienteId}
                  item={i}
                  selecionavel={i.situacao === 'atualizar'}
                  selecionado={selecionados.has(i.clienteId)}
                  onAlternar={() => alternar(i.clienteId)}
                  destaque={destacados[i.clienteId]}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!itens && carregando && <p className="text-sm text-gray-500 py-4 text-center">Montando a prévia…</p>}
    </div>
  );
}

function LinhaPrevia({
  item,
  selecionavel,
  selecionado,
  onAlternar,
  destaque,
}: {
  item: ItemPrevia;
  selecionavel: boolean;
  selecionado: boolean;
  onAlternar: () => void;
  destaque?: string;
}) {
  const p = item.plano;
  const antiga = !item.vigente && item.situacao !== 'sem_sitf';
  return (
    <div className={`p-3 text-xs flex gap-3 transition-colors duration-700 ${destaque ? 'bg-yellow-50' : ''}`}>
      {selecionavel && <input type="checkbox" className="mt-0.5" checked={selecionado} onChange={onAlternar} />}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-semibold text-gray-900">{item.razaoSocial || '(sem razão social)'}</span>
          <span className="text-gray-500">{cnpjFmt(item.cnpj)}</span>
          {destaque && (
            <span className="px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-900 font-semibold">agora: {destaque}</span>
          )}
          {item.situacao !== 'sem_sitf' && (
            <span className={antiga ? 'text-orange-700 font-semibold' : 'text-gray-500'}>
              {item.consultadoEm
                ? `Consultada em ${new Date(item.consultadoEm).toLocaleDateString('pt-BR')}`
                : 'Data da consulta desconhecida'}
              {antiga ? ` (fora de ${mesAtual()}: entra na consulta obrigatória)` : ''}
            </span>
          )}
        </div>
        {p && (
          <ul className="mt-1 space-y-0.5 text-gray-700">
            {p.mudancas.map((m) => (
              <li key={m.socioId}>
                <span className="font-medium">{m.nome}</span>
                {m.percentual && (
                  <>
                    {' '}
                    — participação {pct(m.percentual.de)} → <strong>{pct(m.percentual.para)}</strong>
                  </>
                )}
                {m.cpf && <> — CPF/CNPJ preenchido</>}
                {m.volta && <> — <strong>volta ao quadro</strong></>}
                {m.casadoPor === 'nome' && <span className="text-gray-400"> (casado pelo nome)</span>}
              </li>
            ))}
            {(p.entradas ?? []).map((s) => (
              <li key={`ent-${s.cpf}`} className="text-emerald-700">
                <strong>Entra no quadro:</strong> {s.nome}
                {s.participacao_percentual !== null ? ` (${pct(s.participacao_percentual)})` : ' (sem capital)'}
              </li>
            ))}
            {(p.saidas ?? []).map((s) => (
              <li key={`sai-${s.socioId}`} className="text-orange-700">
                <strong>Sai do quadro:</strong> {s.nome} — fica marcado como fora do quadro (não é apagado)
              </li>
            ))}
            {p.soNaSitf.map((s) => (
              <li key={`sitf-${s.nome}`} className="text-rose-700">
                Só na Situação Fiscal: {s.nome} ({pct(s.participacao_percentual)}) — não está no cadastro
              </li>
            ))}
            {p.soNoCadastro.map((s) => (
              <li key={`cad-${s.socioId}`} className="text-rose-700">
                Só no cadastro: {s.nome} — não aparece na Situação Fiscal
              </li>
            ))}
            {p.conflitos.map((c) => (
              <li key={`conf-${c.socioId}`} className="text-rose-700">
                {c.nome}: CPF/CNPJ do cadastro diferente do da Situação Fiscal (não alterado)
              </li>
            ))}
            {p.ambiguos.map((nome) => (
              <li key={`amb-${nome}`} className="text-rose-700">
                {nome}: casa com mais de um sócio do cadastro (não alterado)
              </li>
            ))}
            {p.alertas.map((a) => (
              <li key={a} className="text-amber-800">
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
