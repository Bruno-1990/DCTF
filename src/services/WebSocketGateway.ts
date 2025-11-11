import { randomUUID } from 'crypto';
import { Server as HttpServer } from 'http';
import { Namespace, Server as SocketIOServer, Socket } from 'socket.io';

type Metrics = {
  activeConnections: number;
  totalConnections: number;
  eventsEmitted: Record<string, number>;
  lastConnectionAt: string | null;
  rooms: Record<string, number>;
  lastEvent: { event: string; total: number; timestamp: string } | null;
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
    rooms: {},
    lastEvent: null,
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
      rooms: { ...this.metrics.rooms },
      lastEvent: this.metrics.lastEvent
        ? { ...this.metrics.lastEvent }
        : null,
    };
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
        const room = `client:${clienteId}`;
        void socket.join(room);
        socket.data.clienteId = clienteId;
        this.addSocketToRoom(socket, room);
      }

      if (analysisId) {
        const room = `analysis:${analysisId}`;
        void socket.join(room);
        socket.data.analysisId = analysisId;
        this.addSocketToRoom(socket, room);
      }

      if (joinCritical) {
        const room = 'global:critical';
        void socket.join(room);
        socket.data.globalCritical = true;
        this.addSocketToRoom(socket, room);
      }

      socket.on('join:analysis', (payload: { analysisId?: string }) => {
        const id = this.asString(payload?.analysisId);
        if (id) {
          const room = `analysis:${id}`;
          void socket.join(room);
          this.addSocketToRoom(socket, room);
        }
      });

      socket.on('leave:analysis', (payload: { analysisId?: string }) => {
        const id = this.asString(payload?.analysisId);
        if (id) {
          const room = `analysis:${id}`;
          void socket.leave(room);
          this.removeSocketFromRoom(socket, room);
        }
      });

      socket.on('disconnect', () => {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
        const rooms: Set<string> | undefined = socket.data.rooms;
        if (rooms) {
          rooms.forEach((roomName) => {
            this.decrementRoom(roomName);
          });
          rooms.clear();
        }
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
    const total = (this.metrics.eventsEmitted[event] ?? 0) + 1;
    this.metrics.eventsEmitted[event] = total;
    this.metrics.lastEvent = {
      event,
      total,
      timestamp: new Date().toISOString(),
    };
  }

  private addSocketToRoom(socket: Socket, room: string): void {
    if (!room) {
      return;
    }

    let rooms = socket.data.rooms as Set<string> | undefined;
    if (!rooms) {
      rooms = new Set<string>();
      socket.data.rooms = rooms;
    }

    if (rooms.has(room)) {
      return;
    }

    rooms.add(room);
    this.incrementRoom(room);
  }

  private removeSocketFromRoom(socket: Socket, room: string): void {
    const rooms: Set<string> | undefined = socket.data.rooms;
    if (!rooms || !rooms.has(room)) {
      return;
    }

    rooms.delete(room);
    this.decrementRoom(room);
  }

  private incrementRoom(room: string): void {
    if (!this.metrics.rooms[room]) {
      this.metrics.rooms[room] = 0;
    }
    this.metrics.rooms[room] += 1;
  }

  private decrementRoom(room: string): void {
    if (!this.metrics.rooms[room]) {
      return;
    }

    this.metrics.rooms[room] = Math.max(0, this.metrics.rooms[room] - 1);
    if (this.metrics.rooms[room] === 0) {
      delete this.metrics.rooms[room];
    }
  }
}

