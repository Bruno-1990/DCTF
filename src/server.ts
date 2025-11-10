import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, Server as HttpServer } from 'http';
import config from './config';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import { WebSocketGateway } from './services/WebSocketGateway';

// Importar rotas
import clientesRoutes from './routes/clientes';
import dctfRoutes from './routes/dctf';
import relatoriosRoutes from './routes/relatorios';
import spreadsheetRoutes from './routes/spreadsheet';
import flagsRoutes from './routes/flags';

class Server {
  private app: express.Application;

  private httpServer: HttpServer;

  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    this.httpServer = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env['FRONTEND_URL'] || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined'));
    this.app.use(requestLogger);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv
      });
    });
  }

  private setupRoutes(): void {
    this.app.get('/ws/health', (_req, res) => {
      const gateway = WebSocketGateway.getInstance();
      res.status(200).json({
        status: gateway ? 'OK' : 'INITIALIZING',
        namespace: '/realtime',
        metrics: gateway?.getMetrics() ?? {
          activeConnections: 0,
          totalConnections: 0,
          eventsEmitted: {},
          lastConnectionAt: null,
        },
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    this.app.use('/api/clientes', clientesRoutes);
    this.app.use('/api/dctf', dctfRoutes);
    this.app.use('/api/relatorios', relatoriosRoutes);
    this.app.use('/api/spreadsheet', spreadsheetRoutes);
    this.app.use('/api/flags', flagsRoutes);

    // Root endpoint
    this.app.get('/', (_req, res) => {
      res.json({
        message: 'DCTF MPC API',
        version: '1.0.0',
        documentation: '/api/docs',
        health: '/health'
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);
    
    // Global error handler
    this.app.use(errorHandler);
  }

  private setupWebSocket(): void {
    WebSocketGateway.initialize(this.httpServer, {
      corsOrigin: process.env['FRONTEND_URL'] || 'http://localhost:5173',
    });
  }

  public start(): void {
    this.httpServer.listen(this.port, () => {
      console.log(`🚀 Server running on port ${this.port}`);
      console.log(`📊 Environment: ${config.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${this.port}/health`);
      console.log(`📚 API Documentation: http://localhost:${this.port}/api/docs`);
      console.log(`📡 WebSocket Health: http://localhost:${this.port}/ws/health`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getHttpServer(): HttpServer {
    return this.httpServer;
  }
}

export default Server;
