import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export type EventoTipo = 'backup' | 'correcao' | 'pulado' | 'validacao' | 'download' | 'erro' | 'info';

export interface EventoExecucao {
  id: string;
  tipo: EventoTipo;
  timestamp: Date;
  mensagem: string;
  detalhes?: string;
  sucesso: boolean;
  progresso?: number;
}

export interface Step7ExecutionProps {
  loteId: string;
  totalCorrecoes: number;
  onCompleto?: (arquivoDownload?: string) => void;
  onErro?: (erro: string) => void;
  useSSE?: boolean;
}

const Step7Execution: React.FC<Step7ExecutionProps> = ({
  loteId,
  totalCorrecoes,
  onCompleto,
  onErro,
  useSSE = false,
}) => {
  const [eventos, setEventos] = useState<EventoExecucao[]>([]);
  const [status, setStatus] = useState<'running' | 'completed' | 'error' | 'idle'>('idle');
  const [progresso, setProgresso] = useState<number>(0);
  const [arquivoDownload, setArquivoDownload] = useState<string | null>(null);
  const [logTecnicoExpandido, setLogTecnicoExpandido] = useState<boolean>(false);
  const [filtroLog, setFiltroLog] = useState<EventoTipo | 'todos'>('todos');
  const eventSourceRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Conectar a SSE ou usar polling
  useEffect(() => {
    if (status === 'idle') {
      setStatus('running');
      adicionarEvento('info', 'Iniciando execução das correções...', true);
    }

    if (useSSE) {
      conectarSSE();
    } else {
      iniciarPolling();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loteId, useSSE]);

  const conectarSSE = () => {
    try {
      const eventSource = new EventSource(`/api/sped-v2/execucao/${loteId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processarEvento(data);
      };

      eventSource.onerror = (error) => {
        console.error('Erro na conexão SSE:', error);
        adicionarEvento('erro', 'Erro na conexão. Tentando reconectar...', false);
        // Fallback para polling
        iniciarPolling();
      };
    } catch (error) {
      console.error('Erro ao conectar SSE:', error);
      iniciarPolling();
    }
  };

  const iniciarPolling = () => {
    intervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/sped-v2/execucao/${loteId}/status`);
        const data = await response.json();
        processarEvento(data);
      } catch (error) {
        console.error('Erro no polling:', error);
      }
    }, 2000);
  };

  const processarEvento = (data: any) => {
    const tipo = data.tipo || 'info';
    const mensagem = data.mensagem || 'Evento recebido';
    const sucesso = data.sucesso !== false;
    const progresso = data.progresso;

    adicionarEvento(tipo, mensagem, sucesso, data.detalhes, progresso);

    // Atualizar progresso
    if (progresso !== undefined) {
      setProgresso(progresso);
    }

    // Verificar se completou
    if (data.status === 'completed') {
      setStatus('completed');
      setProgresso(100);
      if (data.arquivo_download) {
        setArquivoDownload(data.arquivo_download);
      }
      if (onCompleto) {
        onCompleto(data.arquivo_download);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    } else if (data.status === 'error') {
      setStatus('error');
      if (onErro) {
        onErro(data.erro || 'Erro na execução');
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  };

  const adicionarEvento = (
    tipo: EventoTipo,
    mensagem: string,
    sucesso: boolean,
    detalhes?: string,
    progressoEvento?: number
  ) => {
    const evento: EventoExecucao = {
      id: `${Date.now()}-${Math.random()}`,
      tipo,
      timestamp: new Date(),
      mensagem,
      detalhes,
      sucesso,
      progresso: progressoEvento,
    };

    setEventos((prev) => [...prev, evento]);
  };

  const getEventoIcon = (tipo: EventoTipo, sucesso: boolean) => {
    const className = 'h-5 w-5';
    switch (tipo) {
      case 'backup':
        return <DocumentCheckIcon className={classNames(className, 'text-blue-500')} />;
      case 'correcao':
        return sucesso ? (
          <CheckCircleIcon className={classNames(className, 'text-green-500')} />
        ) : (
          <XCircleIcon className={classNames(className, 'text-red-500')} />
        );
      case 'pulado':
        return <ExclamationTriangleIcon className={classNames(className, 'text-yellow-500')} />;
      case 'validacao':
        return <CheckCircleIcon className={classNames(className, 'text-indigo-500')} />;
      case 'download':
        return <ArrowDownTrayIcon className={classNames(className, 'text-green-500')} />;
      case 'erro':
        return <XCircleIcon className={classNames(className, 'text-red-500')} />;
      case 'info':
        return <InformationCircleIcon className={classNames(className, 'text-gray-500')} />;
    }
  };

  const getEventoLabel = (tipo: EventoTipo): string => {
    switch (tipo) {
      case 'backup':
        return 'Backup';
      case 'correcao':
        return 'Correção';
      case 'pulado':
        return 'Pulado';
      case 'validacao':
        return 'Validação';
      case 'download':
        return 'Download';
      case 'erro':
        return 'Erro';
      case 'info':
        return 'Info';
    }
  };

  const formatarTimestamp = (timestamp: Date): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp);
  };

  const eventosFiltrados = eventos.filter((e) => filtroLog === 'todos' || e.tipo === filtroLog);

  const handleDownload = async () => {
    if (!arquivoDownload) return;

    try {
      const response = await fetch(`/api/sped-v2/execucao/${loteId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sped_corrigido_${loteId}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      adicionarEvento('erro', 'Erro ao baixar arquivo', false);
    }
  };

  const correcoesAplicadas = eventos.filter((e) => e.tipo === 'correcao' && e.sucesso).length;
  const itensPulados = eventos.filter((e) => e.tipo === 'pulado').length;
  const erros = eventos.filter((e) => e.tipo === 'erro' || (e.tipo === 'correcao' && !e.sucesso)).length;

  return (
    <div className="space-y-6">
      {/* Header com status */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Execução de Correções</h2>
          <div
            className={classNames(
              'flex items-center space-x-2 px-4 py-2 rounded-full',
              status === 'running' && 'bg-blue-100 text-blue-800',
              status === 'completed' && 'bg-green-100 text-green-800',
              status === 'error' && 'bg-red-100 text-red-800',
              status === 'idle' && 'bg-gray-100 text-gray-800'
            )}
          >
            {status === 'running' && <ArrowPathIcon className="h-5 w-5 animate-spin" />}
            {status === 'completed' && <CheckCircleIcon className="h-5 w-5" />}
            {status === 'error' && <XCircleIcon className="h-5 w-5" />}
            <span className="font-medium">
              {status === 'running' && 'Em Execução'}
              {status === 'completed' && 'Concluído'}
              {status === 'error' && 'Erro'}
              {status === 'idle' && 'Aguardando'}
            </span>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progresso</span>
            <span className="text-sm text-gray-500">{progresso}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={classNames(
                'h-3 rounded-full transition-all duration-300',
                status === 'completed' && 'bg-green-500',
                status === 'error' && 'bg-red-500',
                status === 'running' && 'bg-blue-500',
                status === 'idle' && 'bg-gray-400'
              )}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-lg font-bold text-gray-900">{totalCorrecoes}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Aplicadas</div>
            <div className="text-lg font-bold text-green-600">{correcoesAplicadas}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Puladas</div>
            <div className="text-lg font-bold text-yellow-600">{itensPulados}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Erros</div>
            <div className="text-lg font-bold text-red-600">{erros}</div>
          </div>
        </div>
      </div>

      {/* Timeline de eventos */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Timeline de Execução</h3>
        <div className="space-y-4">
          {eventos.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Aguardando eventos...</p>
          ) : (
            eventos.map((evento, idx) => (
              <div key={evento.id} className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">{getEventoIcon(evento.tipo, evento.sucesso)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {getEventoLabel(evento.tipo)}
                      </span>
                      <span className="text-xs text-gray-500">{formatarTimestamp(evento.timestamp)}</span>
                    </div>
                    {evento.progresso !== undefined && (
                      <span className="text-xs text-gray-500">{evento.progresso}%</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{evento.mensagem}</p>
                  {evento.detalhes && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        Ver detalhes
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {evento.detalhes}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Log técnico */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Log Técnico</h3>
          <div className="flex items-center space-x-4">
            <select
              value={filtroLog}
              onChange={(e) => setFiltroLog(e.target.value as EventoTipo | 'todos')}
              className="text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="todos">Todos</option>
              <option value="backup">Backup</option>
              <option value="correcao">Correções</option>
              <option value="validacao">Validação</option>
              <option value="erro">Erros</option>
              <option value="info">Info</option>
            </select>
            <button
              onClick={() => setLogTecnicoExpandido(!logTecnicoExpandido)}
              className="text-sm text-indigo-600 hover:text-indigo-900"
            >
              {logTecnicoExpandido ? 'Recolher' : 'Expandir'}
            </button>
          </div>
        </div>

        {logTecnicoExpandido && (
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 max-h-96 overflow-y-auto">
            {eventosFiltrados.length === 0 ? (
              <div className="text-gray-500">Nenhum evento no log</div>
            ) : (
              eventosFiltrados.map((evento) => (
                <div key={evento.id} className="mb-1">
                  <span className="text-gray-500">[{formatarTimestamp(evento.timestamp)}]</span>
                  <span className="ml-2">{getEventoLabel(evento.tipo).toUpperCase()}</span>
                  <span className="ml-2">{evento.mensagem}</span>
                  {evento.detalhes && (
                    <div className="ml-8 text-gray-400 text-xs">{evento.detalhes}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Download */}
      {status === 'completed' && arquivoDownload && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Arquivo Corrigido Disponível</h3>
              <p className="text-sm text-gray-500 mt-1">O arquivo SPED corrigido está pronto para download</p>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step7Execution;

