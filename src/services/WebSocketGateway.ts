import { randomUUID } from 'crypto';
import { Server as HttpServer } from 'http';
import { Namespace, Server as SocketIOServer, Socket } from 'socket.io';

type Metrics = {
  activeConnections: number;
  totalConnections: number;
  eventsEmitted: Record<string, number>;
  lastConnectionAt: string | null;
};

type GatewayOptions = {
  corsOrigin: string | string[];
  path?: string;
};

type EventPayload = Record<string, unknown>;

export class WebSocketGateway {
  private static instance: WebSocketGateway | null = null;

  private readonly io: SocketIOServer;

  private readonly namespace: Namespace;

  private readonly metrics: Metrics = {
    activeConnections: 0,
    totalConnections: 0,
    eventsEmitted: {},
    lastConnectionAt: null,
  };

  private constructor(server: HttpServer, options: GatewayOptions) {
    this.io = new SocketIOServer(server, {
      path: options.path ?? '/socket.io',
      cors: {
        origin: options.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.namespace = this.io.of('/realtime');

    this.configureAuthentication();
    this.registerListeners();
  }

  static initialize(server: HttpServer, options: GatewayOptions): WebSocketGateway {
    if (!this.instance) {
      this.instance = new WebSocketGateway(server, options);
    }
    return this.instance;
  }

  static getInstance(): WebSocketGateway | null {
    return this.instance;
  }

  emitToClient(event: string, clienteId: string, payload: EventPayload): void {
    const room = `client:${clienteId}`;
    this.namespace.to(room).emit(event, this.withMetadata(payload));
    this.trackEvent(event);
  }

  emitToAnalysis(event: string, analysisId: string, payload: EventPayload): void {
    const room = `analysis:${analysisId}`;
    this.namespace.to(room).emit(event, this.withMetadata(payload));
    this.trackEvent(event);
  }

  broadcastCritical(event: string, payload: EventPayload): void {
    this.namespace.to('global:critical').emit(event, this.withMetadata(payload));
    this.trackEvent(event);
  }

  getMetrics(): Metrics {
    return {
      activeConnections: this.metrics.activeConnections,
      totalConnections: this.metrics.totalConnections,
      eventsEmitted: { ...this.metrics.eventsEmitted },
      lastConnectionAt: this.metrics.lastConnectionAt,
    };
  }

  private configureAuthentication(): void {
    this.namespace.use((socket, next) => {
      const requiredKey = process.env['API_KEY'];

      if (!requiredKey) {
        next();
        return;
      }

      const token = this.extractToken(socket);
      if (!token || token !== requiredKey) {
        next(new Error('Unauthorized'));
        return;
      }

      next();
    });
  }

  private extractToken(socket: Socket): string | null {
    const authFromHandshake = socket.handshake.auth?.token;
    if (typeof authFromHandshake === 'string') {
      return this.cleanToken(authFromHandshake);
    }

    const header = socket.handshake.headers['authorization'];
    if (typeof header === 'string') {
      return this.cleanToken(header);
    }
    if (Array.isArray(header)) {
      const first = header[0];
      return typeof first === 'string' ? this.cleanToken(first) : null;
    }

    return null;
  }

  private cleanToken(value: string): string {
    if (value.toLowerCase().startsWith('bearer ')) {
      return value.slice(7).trim();
    }
    return value.trim();
  }

  private registerListeners(): void {
    this.namespace.on('connection', (socket) => {
      this.metrics.activeConnections += 1;
      this.metrics.totalConnections += 1;
      this.metrics.lastConnectionAt = new Date().toISOString();

      const clienteId = this.asString(socket.handshake.query['clienteId']);
      const analysisId = this.asString(socket.handshake.query['analysisId']);
      const joinCritical = this.asBoolean(socket.handshake.query['globalCritical']);

      if (clienteId) {
        void socket.join(`client:${clienteId}`);
        socket.data.clienteId = clienteId;
      }

      if (analysisId) {
        void socket.join(`analysis:${analysisId}`);
        socket.data.analysisId = analysisId;
      }

      if (joinCritical) {
        void socket.join('global:critical');
        socket.data.globalCritical = true;
      }

      socket.on('join:analysis', (payload: { analysisId?: string }) => {
        const id = this.asString(payload?.analysisId);
        if (id) {
          void socket.join(`analysis:${id}`);
        }
      });

      socket.on('leave:analysis', (payload: { analysisId?: string }) => {
        const id = this.asString(payload?.analysisId);
        if (id) {
          void socket.leave(`analysis:${id}`);
        }
      });

      socket.on('disconnect', () => {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
      });
    });
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      return typeof first === 'string' ? first.trim() : null;
    }

    return null;
  }

  private asBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      return normalized === 'true' || normalized === '1';
    }

    if (Array.isArray(value) && value.length > 0) {
      return this.asBoolean(value[0]);
    }

    return false;
  }

  private withMetadata<T extends EventPayload>(payload: T): T & { eventId: string; timestamp: string } {
    return {
      ...payload,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };
  }

  private trackEvent(event: string): void {
    if (!this.metrics.eventsEmitted[event]) {
      this.metrics.eventsEmitted[event] = 0;
    }
    this.metrics.eventsEmitted[event] += 1;
  }
}

