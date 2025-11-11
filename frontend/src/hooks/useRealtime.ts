import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RealtimeEventType =
  | 'analysis.completed'
  | 'flags.created'
  | 'flags.updated'
  | 'health.ping';

export type NotificationLevel = 'info' | 'warning' | 'critical';

export interface RealtimeNotification<T = unknown> {
  id: string;
  type: RealtimeEventType;
  level: NotificationLevel;
  timestamp: string;
  title: string;
  message: string;
  data: T;
}

export interface UseRealtimeOptions {
  token?: string;
  clienteId?: string;
  analysisId?: string;
  joinCritical?: boolean;
  enabled?: boolean;
  maxNotifications?: number;
}

export interface UseRealtimeResult {
  status: RealtimeStatus;
  notifications: RealtimeNotification[];
  lastError: string | null;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  joinAnalysis: (analysisId: string) => void;
  leaveAnalysis: (analysisId: string) => void;
  reconnect: () => void;
}

type TypedSocket = Socket & {
  close?: () => void;
};

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_MAX_NOTIFICATIONS = 50;

const resolveBaseUrl = (): string => {
  const envUrl = import.meta.env?.VITE_API_URL as string | undefined;
  if (envUrl && typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_BASE_URL;
};

const normalizeBaseUrl = (url: string): string => {
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  }
  return url;
};

const determineLevel = (type: RealtimeEventType, payload: any): NotificationLevel => {
  if (type === 'analysis.completed') {
    if (payload?.summary?.critical && payload.summary.critical > 0) {
      return 'critical';
    }
    if (payload?.summary?.high && payload.summary.high > 0) {
      return 'warning';
    }
    return 'info';
  }

  if (type === 'flags.created' || type === 'flags.updated') {
    const severity = payload?.severidade ?? payload?.severity ?? '';
    if (typeof severity === 'string' && severity.toLowerCase() === 'critica') {
      return 'critical';
    }
    if (typeof severity === 'string' && (severity.toLowerCase() === 'alta' || severity.toLowerCase() === 'high')) {
      return 'warning';
    }
    return 'info';
  }

  if (type === 'health.ping') {
    return 'info';
  }

  return 'info';
};

const determineTitle = (type: RealtimeEventType): string => {
  switch (type) {
    case 'analysis.completed':
      return 'Análise concluída';
    case 'flags.created':
      return 'Flag registrada';
    case 'flags.updated':
      return 'Flag atualizada';
    case 'health.ping':
      return 'Sinal de saúde';
    default:
      return 'Atualização em tempo real';
  }
};

const determineMessage = (type: RealtimeEventType, payload: any): string => {
  switch (type) {
    case 'analysis.completed': {
      const periodo = payload?.periodo ?? payload?.period ?? 'período não informado';
      const risco = payload?.riskScore != null ? `Risco ${payload.riskScore}` : 'Risco não calculado';
      return `Análise ${payload?.dctfId ?? ''} finalizada (${periodo}) - ${risco}`;
    }
    case 'flags.created':
    case 'flags.updated': {
      const codigo = payload?.codigo ?? payload?.code ?? '';
      const severidade = payload?.severidade ?? payload?.severity ?? '';
      return `Flag ${codigo} (${severidade || 'severidade desconhecida'})`;
    }
    case 'health.ping':
      return 'Gateway WebSocket ativo';
    default:
      return 'Evento recebido em tempo real';
  }
};

const safeRandomId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

export const useRealtime = (options: UseRealtimeOptions = {}): UseRealtimeResult => {
  const {
    token,
    clienteId,
    analysisId,
    joinCritical = false,
    enabled = true,
    maxNotifications = DEFAULT_MAX_NOTIFICATIONS,
  } = options;

  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'connecting' : 'disconnected');
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<TypedSocket | null>(null);

  const connectionConfig = useMemo(() => {
    const base = normalizeBaseUrl(resolveBaseUrl());
    const query: Record<string, string> = {};

    if (clienteId) {
      query['clienteId'] = clienteId;
    }
    if (analysisId) {
      query['analysisId'] = analysisId;
    }
    if (joinCritical) {
      query['globalCritical'] = 'true';
    }

    return {
      url: `${base}/realtime`,
      options: {
        transports: ['websocket'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 5000,
        auth: token ? { token } : undefined,
        query,
      } as const,
    };
  }, [analysisId, clienteId, joinCritical, token]);

  const addNotification = useCallback((type: RealtimeEventType, payload: any) => {
    const id = payload?.eventId ?? safeRandomId();
    const timestamp = payload?.timestamp ?? new Date().toISOString();
    const level = determineLevel(type, payload);
    const title = determineTitle(type);
    const message = determineMessage(type, payload);

    setNotifications((prev) => {
      const next: RealtimeNotification[] = [
        {
          id,
          type,
          level,
          timestamp,
          title,
          message,
          data: payload,
        },
        ...prev,
      ];
      if (next.length > maxNotifications) {
        return next.slice(0, maxNotifications);
      }
      return next;
    });
  }, [maxNotifications]);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const disconnectSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.disconnect();
    if (typeof socket.close === 'function') {
      socket.close();
    }
    socketRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnectSocket();
      setStatus('disconnected');
      return;
    }

    const socket = io(connectionConfig.url, connectionConfig.options) as TypedSocket;
    socketRef.current = socket;
    setStatus('connecting');
    setLastError(null);

    const handleConnect = (): void => {
      setStatus('connected');
      setLastError(null);
    };

    const handleDisconnect = (): void => {
      setStatus('disconnected');
    };

    const handleConnectError = (error: Error): void => {
      setStatus('error');
      setLastError(error.message);
    };

    const handleAnalysisCompleted = (payload: any): void => {
      addNotification('analysis.completed', payload);
    };

    const handleFlagCreated = (payload: any): void => {
      addNotification('flags.created', payload);
    };

    const handleFlagUpdated = (payload: any): void => {
      addNotification('flags.updated', payload);
    };

    const handleHealthPing = (payload: any): void => {
      addNotification('health.ping', payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('analysis.completed', handleAnalysisCompleted);
    socket.on('flags.created', handleFlagCreated);
    socket.on('flags.updated', handleFlagUpdated);
    socket.on('health.ping', handleHealthPing);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('analysis.completed', handleAnalysisCompleted);
      socket.off('flags.created', handleFlagCreated);
      socket.off('flags.updated', handleFlagUpdated);
      socket.off('health.ping', handleHealthPing);
      disconnectSocket();
    };
  }, [addNotification, connectionConfig, disconnectSocket, enabled]);

  const joinAnalysis = useCallback((id: string) => {
    if (!id) return;
    socketRef.current?.emit('join:analysis', { analysisId: id });
  }, []);

  const leaveAnalysis = useCallback((id: string) => {
    if (!id) return;
    socketRef.current?.emit('leave:analysis', { analysisId: id });
  }, []);

  const reconnect = useCallback(() => {
    if (!socketRef.current) return;
    if (status === 'connected') return;
    socketRef.current.connect();
  }, [status]);

  return {
    status,
    notifications,
    lastError,
    clearNotification,
    clearAll,
    joinAnalysis,
    leaveAnalysis,
    reconnect,
  };
};

