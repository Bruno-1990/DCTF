import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRealtime } from '../useRealtime';
import { io } from 'socket.io-client';

type Listener = (...args: any[]) => void;

type MockSocket = {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  trigger: (event: string, payload?: any) => void;
  listeners: Record<string, Listener[]>;
};

const createMockSocket = (): MockSocket => {
  const listeners: Record<string, Listener[]> = {};

  const register = (event: string, handler: Listener): void => {
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(handler);
  };

  const unregister = (event: string, handler: Listener): void => {
    const handlers = listeners[event];
    if (!handlers) return;
    listeners[event] = handlers.filter(fn => fn !== handler);
  };

  const trigger = (event: string, payload?: any): void => {
    const handlers = listeners[event] || [];
    handlers.forEach(handler => handler(payload));
  };

  const mockSocket = {
    on: vi.fn((event: string, handler: Listener) => {
      register(event, handler);
      return mockSocket;
    }),
    off: vi.fn((event: string, handler: Listener) => {
      unregister(event, handler);
      return mockSocket;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    close: vi.fn(),
    connect: vi.fn(),
    trigger,
    listeners,
  };

  return mockSocket;
};

const socketInstances: MockSocket[] = [];

vi.mock('socket.io-client', () => {
  const ioMock = vi.fn(() => {
    const socket = createMockSocket();
    socketInstances.push(socket);
    return socket;
  });

  return {
    io: ioMock,
  };
});

const getLastSocket = (): MockSocket => {
  if (socketInstances.length === 0) {
    throw new Error('Nenhum socket mockado foi criado');
  }
  return socketInstances[socketInstances.length - 1];
};

describe('useRealtime', () => {
  beforeEach(() => {
    socketInstances.length = 0;
    vi.mocked(io).mockClear();
  });

  it('conecta ao gateway com parâmetros e atualiza status', async () => {
    const { result } = renderHook(() => useRealtime({
      token: 'api-token',
      clienteId: 'cliente-123',
      analysisId: 'analysis-999',
      joinCritical: true,
    }));

    await waitFor(() => expect(vi.mocked(io)).toHaveBeenCalled());

    const socket = getLastSocket();

    expect(vi.mocked(io)).toHaveBeenCalledWith(
      'http://localhost:3000/realtime',
      expect.objectContaining({
        transports: ['websocket'],
        withCredentials: true,
        reconnection: true,
        auth: { token: 'api-token' },
        query: {
          clienteId: 'cliente-123',
          analysisId: 'analysis-999',
          globalCritical: 'true',
        },
      }),
    );

    act(() => {
      socket.trigger('connect');
    });

    expect(result.current.status).toBe('connected');

    act(() => {
      socket.trigger('disconnect');
    });

    expect(result.current.status).toBe('disconnected');
  });

  it('adiciona notificações ao receber eventos críticos de análise', async () => {
    const { result } = renderHook(() => useRealtime({
      clienteId: 'cliente-999',
    }));

    await waitFor(() => expect(vi.mocked(io)).toHaveBeenCalled());
    const socket = getLastSocket();

    const payload = {
      eventId: 'evt-1',
      dctfId: 'd1',
      clienteId: 'cliente-999',
      periodo: '2025-01',
      summary: { critical: 2, high: 0 },
      riskScore: 80,
    };

    act(() => {
      socket.trigger('analysis.completed', payload);
    });

    await waitFor(() => expect(result.current.notifications.length).toBe(1));

    const [notification] = result.current.notifications;
    expect(notification.type).toBe('analysis.completed');
    expect(notification.level).toBe('critical');
    expect(notification.data).toMatchObject(payload);

    act(() => {
      result.current.clearNotification(notification.id);
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('emite comandos join/leave para salas de análise', async () => {
    const { result, unmount } = renderHook(() => useRealtime({
      clienteId: 'cliente-321',
      enabled: true,
    }));

    await waitFor(() => expect(vi.mocked(io)).toHaveBeenCalled());
    const socket = getLastSocket();

    act(() => {
      result.current.joinAnalysis('analysis-123');
    });

    expect(socket.emit).toHaveBeenCalledWith('join:analysis', { analysisId: 'analysis-123' });

    act(() => {
      result.current.leaveAnalysis('analysis-123');
    });

    expect(socket.emit).toHaveBeenCalledWith('leave:analysis', { analysisId: 'analysis-123' });

    unmount();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});

