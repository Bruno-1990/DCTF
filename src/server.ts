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
import adminDashboardRoutes from './routes/admin-dashboard';
import adminDashboardConferenceRoutes from './routes/admin-dashboard-conferences';
import pagamentosRoutes from './routes/pagamentos';
import receitaPagamentosRoutes from './routes/receita-pagamentos';
import receitaRoutes from './routes/receita';
import conferenciasRoutes from './routes/conferencias';
import conferencesRoutes from './routes/conferences';
import situacaoFiscalRoutes from './routes/situacao-fiscal';
import hostDadosRoutes from './routes/host-dados';
import sciRoutes from './routes/sci';
import spedRoutes from './routes/sped';

class Server {
  private app: express.Application;

  private httpServer: HttpServer;

  private port: number;

  constructor(customPort?: number) {
    this.app = express();
    this.port = customPort || config.port;
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
    const allowedOrigins = process.env['FRONTEND_URL'] 
      ? process.env['FRONTEND_URL'].split(',').map(url => url.trim())
      : ['http://localhost:5173', 'https://centralcontabil.github.io'];
    
    this.app.use(cors({
      origin: (origin, callback) => {
        // Permitir requisições sem origin (mobile apps, Postman, etc.) em desenvolvimento
        if (!origin && process.env['NODE_ENV'] === 'development') {
          return callback(null, true);
        }
        // Verificar se a origin está na lista permitida
        if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
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
    this.app.use('/api/dashboard/admin', adminDashboardRoutes);
    this.app.use('/api/dashboard/admin/conferences', adminDashboardConferenceRoutes);
    this.app.use('/api/pagamentos', pagamentosRoutes);
    this.app.use('/api/receita-pagamentos', receitaPagamentosRoutes);
    this.app.use('/api/receita', receitaRoutes);
    this.app.use('/api/conferencias', conferenciasRoutes);
    this.app.use('/api/conferences', conferencesRoutes);
    this.app.use('/api/situacao-fiscal', situacaoFiscalRoutes);
    this.app.use('/api/host-dados', hostDadosRoutes);
    this.app.use('/api/sci', sciRoutes);
    // Rotas de correções automáticas (DEVEM vir ANTES de /api/sped para evitar conflito)
    const spedCorrecoesRoutes = require('./routes/sped_correcoes').default;
    this.app.use('/api/sped/correcoes', spedCorrecoesRoutes);
    console.log('✅ Rotas de correções registradas: /api/sped/correcoes');
    console.log('   - POST /api/sped/correcoes/aplicar');
    console.log('   - POST /api/sped/correcoes/aplicar-todas');
    console.log('   - GET /api/sped/correcoes/:validationId/download');
    
    this.app.use('/api/sped', spedRoutes);

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
    const host = process.env['HOST'] || '0.0.0.0';
    this.httpServer.listen(this.port, host, () => {
      const displayHost = host === '0.0.0.0' ? '192.168.0.47' : host;
      console.log(`Server running on http://${displayHost}:${this.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Health check: http://${displayHost}:${this.port}/health`);
      console.log(`API: http://${displayHost}:${this.port}/api`);
      console.log(`WebSocket Health: http://${displayHost}:${this.port}/ws/health`);
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








