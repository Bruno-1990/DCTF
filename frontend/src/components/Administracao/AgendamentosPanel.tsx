/**
 * Painel de agendamentos — o que roda sozinho, quando roda e para quem avisa.
 *
 * A lista vem do catálogo do backend, não de cadastro manual: job novo aparece
 * aqui sozinho. O que se edita é horário, liga/desliga e destinatários — e vale
 * na próxima verificação (um minuto), sem reiniciar o serviço.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ClockIcon,
  EnvelopeIcon,
  PlayIcon,
  PlusIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../hooks/useToast';
import {
  agendamentosService,
  type Agendamento,
  type UltimaExecucao,
} from '../../services/agendamentos';

const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const dataHora = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function SeloExecucao({ ultima }: { ultima: UltimaExecucao | null }) {
  if (!ultima) return <span className="text-gray-400">nunca executou</span>;
  const cores = {
    concluida: 'text-green-700 bg-green-50 border-green-200',
    'em-andamento': 'text-blue-700 bg-blue-50 border-blue-200',
    erro: 'text-red-700 bg-red-50 border-red-200',
  } as const;
  const rotulo = {
    concluida: 'concluída',
    'em-andamento': 'em andamento',
    erro: 'com erro',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${cores[ultima.situacao]}`}>
      {dataHora(ultima.inicio)} · {rotulo[ultima.situacao]}
    </span>
  );
}

interface Props {
  className?: string;
}

export default function AgendamentosPanel({ className = '' }: Props) {
  const toast = useToast();
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      setItens(await agendamentosService.listar());
    } catch (err: any) {
      // toast fora das dependências de propósito: com ele aqui, o useCallback
      // muda a cada render e o useEffect abaixo vira laço infinito.
      toast.error(err.message);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Troca um campo e devolve a linha atualizada pelo backend (janela e próxima execução recalculadas). */
  const salvar = async (item: Agendamento, patch: Record<string, unknown>, descricao: string) => {
    setSalvando(item.id);
    try {
      const r = await agendamentosService.salvar(item.id, patch as any);
      setItens((atual) =>
        atual.map((i) =>
          i.id === item.id
            ? { ...i, config: r.config, janela: r.janela, proximaExecucao: r.proximaExecucao }
            : i
        )
      );
      toast.success(descricao);
    } catch (err: any) {
      toast.error(err.message);
      void carregar(); // o backend recusou: volta para a verdade do servidor
    } finally {
      setSalvando(null);
    }
  };

  const adicionarEmail = async (item: Agendamento, lista: string) => {
    const chave = `${item.id}:${lista}`;
    const email = (novoEmail[chave] ?? '').trim();
    if (!email) return;
    try {
      const enderecos = await agendamentosService.adicionarEmail(item.id, lista, email);
      setItens((atual) =>
        atual.map((i) =>
          i.id === item.id
            ? { ...i, emails: i.emails.map((l) => (l.chave === lista ? { ...l, enderecos } : l)) }
            : i
        )
      );
      setNovoEmail((n) => ({ ...n, [chave]: '' }));
      toast.success(`${email} adicionado.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const removerEmail = async (item: Agendamento, lista: string, email: string) => {
    try {
      const enderecos = await agendamentosService.removerEmail(item.id, lista, email);
      setItens((atual) =>
        atual.map((i) =>
          i.id === item.id
            ? { ...i, emails: i.emails.map((l) => (l.chave === lista ? { ...l, enderecos } : l)) }
            : i
        )
      );
      toast.success(`${email} removido.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const executarAgora = async (item: Agendamento) => {
    try {
      await agendamentosService.executarAgora(item.id);
      toast.success(`${item.nome}: execução iniciada. Acompanhe pela última execução.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (carregando) {
    return (
      <div className={`bg-white shadow-lg rounded-lg p-6 mb-6 ${className}`}>
        <LoadingSpinner text="Carregando agendamentos..." />
      </div>
    );
  }

  return (
    <div className={`bg-white shadow-lg rounded-lg p-6 mb-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClockIcon className="h-6 w-6 text-indigo-600" />
            Agendamentos e envios de e-mail
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Tudo que o sistema dispara sozinho. Alterações valem na próxima verificação, cerca de um
            minuto, sem reiniciar o serviço.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <div className="space-y-4">
        {itens.map((item) => {
          const cfg = item.config;
          const editando = salvando === item.id;
          const sobDemanda = item.tipo === 'sob-demanda';
          return (
            <div key={item.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[260px] flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{item.nome}</h3>
                    {cfg.ativo ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 border border-green-200">
                        <CheckCircleIcon className="h-3 w-3" /> ligado
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 border border-gray-200">
                        desligado
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{item.descricao}</p>
                  <p className="text-sm text-gray-800 mt-2">
                    <span className="font-medium">{item.janela}</span>
                    {item.proximaExecucao && (
                      <span className="text-gray-500"> · próxima: {dataHora(item.proximaExecucao)}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Última execução: <SeloExecucao ultima={item.ultimaExecucao} />
                    {item.ultimaExecucao?.erro && (
                      <span className="text-red-600"> — {item.ultimaExecucao.erro}</span>
                    )}
                  </p>
                </div>

                {/* Horário */}
                <div className="flex items-end gap-2">
                  {item.tipo === 'mensal' && item.editavel && (
                    <label className="text-xs text-gray-600">
                      Dia
                      <input
                        type="number"
                        min={1}
                        max={28}
                        defaultValue={cfg.dia ?? 1}
                        disabled={editando}
                        onBlur={(e) => {
                          const dia = Number(e.target.value);
                          if (dia !== cfg.dia) void salvar(item, { dia }, `${item.nome}: dia ${dia}.`);
                        }}
                        className="mt-1 block w-16 rounded border-gray-300 text-sm"
                      />
                    </label>
                  )}
                  {!sobDemanda && item.editavel && (
                    <label className="text-xs text-gray-600">
                      Hora
                      <input
                        type="time"
                        defaultValue={`${String(cfg.hora ?? 0).padStart(2, '0')}:${String(cfg.minuto ?? 0).padStart(2, '0')}`}
                        disabled={editando}
                        onBlur={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number);
                          if (h !== cfg.hora || m !== (cfg.minuto ?? 0)) {
                            void salvar(item, { hora: h, minuto: m }, `${item.nome}: ${e.target.value}.`);
                          }
                        }}
                        className="mt-1 block rounded border-gray-300 text-sm"
                      />
                    </label>
                  )}
                  {!sobDemanda && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={cfg.ativo}
                        disabled={editando}
                        onChange={(e) =>
                          void salvar(
                            item,
                            { ativo: e.target.checked },
                            `${item.nome}: ${e.target.checked ? 'ligado' : 'desligado'}.`
                          )
                        }
                        className="rounded border-gray-300"
                      />
                      ligado
                    </label>
                  )}
                  {item.podeExecutarAgora && (
                    <button
                      onClick={() => void executarAgora(item)}
                      className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                    >
                      <PlayIcon className="h-4 w-4" /> Executar agora
                    </button>
                  )}
                </div>
              </div>

              {/* Dias da semana */}
              {item.tipo === 'semanal' && item.editavel && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-600">Dias:</span>
                  {NOMES_DIAS.map((nome, dia) => {
                    const marcado = (cfg.diasSemana ?? []).includes(dia);
                    return (
                      <button
                        key={dia}
                        disabled={editando}
                        onClick={() => {
                          const atuais = cfg.diasSemana ?? [];
                          const novos = marcado ? atuais.filter((d) => d !== dia) : [...atuais, dia].sort();
                          if (novos.length === 0) {
                            toast.error('Deixe ao menos um dia da semana.');
                            return;
                          }
                          void salvar(item, { diasSemana: novos }, `${item.nome}: dias atualizados.`);
                        }}
                        className={`rounded border px-2 py-1 text-xs ${
                          marcado
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}
                      >
                        {nome}
                      </button>
                    );
                  })}
                </div>
              )}

              {item.alerta && (
                <p className="mt-3 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {item.alerta}
                </p>
              )}

              {/* Destinatários */}
              {item.emails.length > 0 && (
                <div className="mt-3 space-y-3">
                  {item.emails.map((lista) => (
                    <div key={lista.chave} className="rounded bg-gray-50 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <EnvelopeIcon className="h-4 w-4 text-gray-500" />
                        {lista.rotulo}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{lista.quando}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {lista.enderecos.length === 0 && (
                          <span className="text-xs text-amber-700">
                            Nenhum destinatário: este aviso não será enviado.
                          </span>
                        )}
                        {lista.enderecos.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700"
                          >
                            {email}
                            <button
                              onClick={() => void removerEmail(item, lista.chave, email)}
                              title={`Remover ${email}`}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            placeholder="novo@central-rnc.com.br"
                            value={novoEmail[`${item.id}:${lista.chave}`] ?? ''}
                            onChange={(e) =>
                              setNovoEmail((n) => ({ ...n, [`${item.id}:${lista.chave}`]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void adicionarEmail(item, lista.chave);
                            }}
                            className="w-56 rounded border-gray-300 text-xs"
                          />
                          <button
                            onClick={() => void adicionarEmail(item, lista.chave)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-white"
                          >
                            <PlusIcon className="h-3 w-3" /> Adicionar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cfg.atualizadoPor && (
                <p className="mt-2 text-[11px] text-gray-400">
                  Última alteração por {cfg.atualizadoPor}
                  {cfg.atualizadoEm ? ` em ${dataHora(String(cfg.atualizadoEm))}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
