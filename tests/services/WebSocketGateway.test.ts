import { createServer, Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketGateway } from '../../src/services/WebSocketGateway';

type GatewaySetup = {
  gateway: WebSocketGateway;
  server: HttpServer;
  port: number;
};

const ORIGINAL_API_KEY = process.env['API_KEY'];

jest.setTimeout(10000);

async function setupGateway(apiKey?: string): Promise<GatewaySetup> {
  if (apiKey) {
    process.env['API_KEY'] = apiKey;
  } else {
    delete process.env['API_KEY'];
  }

  // Reset instância singleton entre os testes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (WebSocketGateway as any).instance = null;

  const server = createServer();
  const gateway = WebSocketGateway.initialize(server, { corsOrigin: '*' });
  const port = await startServer(server);

  return { gateway, server, port };
}

function startServer(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve((address as AddressInfo).port);
        return;
      }
      reject(new Error('Não foi possível obter porta'));
    });
  });
}

function stopServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function waitForConnection(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout aguardando conexão'));
    }, 5000);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    const onConnect = (): void => {
      cleanup();
      resolve();
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando evento ${event}`));
    }, 5000);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off(event, handler);
    };

    const handler = (payload: T): void => {
      cleanup();
      resolve(payload);
    };

    socket.once(event, handler);
  });
}

function createClient(port: number, options?: { token?: string; query?: Record<string, string> }): ClientSocket {
  return io(`http://127.0.0.1:${port}/realtime`, {
    autoConnect: false,
    forceNew: true,
    transports: ['websocket'],
    auth: options?.token ? { token: options.token } : undefined,
    query: options?.query,
  });
}

describe('WebSocketGateway', () => {
  afterAll(() => {
    if (ORIGINAL_API_KEY) {
      process.env['API_KEY'] = ORIGINAL_API_KEY;
    } else {
      delete process.env['API_KEY'];
    }
  });

  it('conecta cliente, propaga eventos com metadados e atualiza métricas', async () => {
    const { gateway, server, port } = await setupGateway();
    const client = createClient(port, { query: { clienteId: '123' } });

    await waitForConnection(client);

    const payloadPromise = waitForEvent<Record<string, unknown>>(client, 'analysis.completed');
    gateway.emitToClient('analysis.completed', '123', { summary: 'ok' });
    const payload = await payloadPromise;

    expect(payload).toMatchObject({
      summary: 'ok',
      eventId: expect.any(String),
      timestamp: expect.any(String),
    });

    const metrics = gateway.getMetrics();
    expect(metrics.activeConnections).toBe(1);
    expect(metrics.totalConnections).toBe(1);
    expect(metrics.eventsEmitted['analysis.completed']).toBe(1);

    client.disconnect();
    client.close();
    await stopServer(server);
  });

  it('permite conexão mesmo quando API_KEY está configurada', async () => {
    const { gateway, server, port } = await setupGateway('super-secret');
    const client = createClient(port);

    await waitForConnection(client);

    const metrics = gateway.getMetrics();
    expect(metrics.activeConnections).toBe(1);
    expect(metrics.totalConnections).toBe(1);

    client.disconnect();
    client.close();
    await stopServer(server);
  });

  it('rastrea salas assinadas e registra o último evento emitido', async () => {
    const { gateway, server, port } = await setupGateway();
    const client = createClient(port, {
      query: { clienteId: '321', analysisId: 'a-9', globalCritical: 'true' },
    });

    await waitForConnection(client);

    try {
      gateway.emitToClient('analysis.completed', '321', { score: 70 });
      gateway.broadcastCritical('flags.created', {
        dctfId: 'a-9',
        clienteId: '321',
        severidade: 'critica',
      });

      const metrics = gateway.getMetrics() as Record<string, unknown>;

      expect(metrics.eventsEmitted['analysis.completed']).toBe(1);
      expect(metrics.eventsEmitted['flags.created']).toBe(1);
      expect(metrics.rooms).toMatchObject({
        'client:321': 1,
        'analysis:a-9': 1,
        'global:critical': 1,
      });
      expect(metrics.lastEvent).toMatchObject({
        event: 'flags.created',
        total: 1,
      });
    } finally {
      client.disconnect();
      client.close();
      await stopServer(server);
    }
  });

  it('permite envio de token opcional no handshake e segue emitindo eventos', async () => {
    const { gateway, server, port } = await setupGateway('secret');
    const client = createClient(port, { token: 'secret', query: { analysisId: 'a-1' } });

    await waitForConnection(client);

    const payloadPromise = waitForEvent<Record<string, unknown>>(client, 'flags.created');
    gateway.emitToAnalysis('flags.created', 'a-1', { codigo: 'F001' });
    const payload = await payloadPromise;

    expect(payload).toMatchObject({
      codigo: 'F001',
      eventId: expect.any(String),
      timestamp: expect.any(String),
    });

    const metrics = gateway.getMetrics();
    expect(metrics.eventsEmitted['flags.created']).toBe(1);

    client.disconnect();
    client.close();
    await stopServer(server);
  });
});

