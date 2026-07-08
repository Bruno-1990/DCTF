/**
 * Controlador de Estudo de Viabilidade
 *   - Upload de PDF/DOCX de legislacao
 *   - Listagem/exclusao de documentos ingeridos
 *   - Listagem de clientes cujos CNAEs aparecem na legislacao
 */

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import {
  criarDocumentoProcessando,
  processarDocumentoEmBackground,
  listarDocumentos,
  obterStatusDocumento,
  excluirDocumento,
  listarClientesPorLegislacao,
  listarCidadesComClientes,
  progressEmitter,
  type ProgressEvent,
} from '../services/EstudoViabilidadeService';

const MAX_FILE_SIZE = parseInt(process.env['ESTUDO_VIABILIDADE_MAX_FILE_SIZE'] || `${25 * 1024 * 1024}`, 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx'].includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo nao permitido. Use: .pdf ou .docx'));
  },
});

export const estudoViabilidadeUploadMiddleware = upload.single('arquivo');

export class EstudoViabilidadeController {
  async uploadDocumento(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Arquivo e obrigatorio (campo "arquivo")' });
        return;
      }
      const { originalname, mimetype, size, buffer } = req.file;
      const documentoId = await criarDocumentoProcessando(originalname, mimetype, size);

      // Processa em background — front faz polling em /:id/status
      setImmediate(() => {
        processarDocumentoEmBackground(documentoId, buffer, mimetype, originalname).catch(err => {
          console.error('[ESTUDO_VIABILIDADE] background falhou:', err);
        });
      });

      res.status(202).json({ documentoId, status: 'processando' });
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro upload:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async listarDocumentos(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const result = await listarDocumentos(page, limit);
      res.json(result);
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro listarDocumentos:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async obterStatusDocumento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params['id'] as string, 10);
      if (!id) { res.status(400).json({ error: 'id invalido' }); return; }
      const doc = await obterStatusDocumento(id);
      if (!doc) { res.status(404).json({ error: 'Documento nao encontrado' }); return; }
      res.json(doc);
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro status:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async excluirDocumento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params['id'] as string, 10);
      if (!id) { res.status(400).json({ error: 'id invalido' }); return; }
      const ok = await excluirDocumento(id);
      if (!ok) { res.status(404).json({ error: 'Documento nao encontrado' }); return; }
      res.status(204).send();
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro excluir:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  /**
   * SSE: stream de progresso do processamento de um documento.
   *   1. Envia snapshot inicial (status atual no BD).
   *   2. Se ja concluido/erro, fecha imediatamente.
   *   3. Caso contrario, assina o progressEmitter e encaminha eventos
   *      ate 'done' ou 'error', desinscrevendo no fim ou no close do cliente.
   */
  async streamDocumento(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params['id'] as string, 10);
    if (!id) { res.status(400).end(); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const snapshot = await obterStatusDocumento(id);
      if (!snapshot) {
        send('error', { message: 'Documento nao encontrado' });
        res.end();
        return;
      }
      send('snapshot', snapshot);

      if (snapshot.status === 'concluido') {
        send('done', { total_cnaes: snapshot.total_cnaes });
        res.end();
        return;
      }
      if (snapshot.status === 'erro') {
        send('error', { message: snapshot.erro_mensagem || 'Erro' });
        res.end();
        return;
      }

      // Assinar eventos de progresso do processamento em curso
      const channel = `doc:${id}`;
      const handler = (evt: ProgressEvent) => {
        send(evt.phase, evt);
        if (evt.phase === 'done' || evt.phase === 'error') {
          progressEmitter.off(channel, handler);
          clearInterval(heartbeat);
          res.end();
        }
      };
      progressEmitter.on(channel, handler);

      // Heartbeat (comment line, ignorado pelo EventSource) pra manter conexao viva
      const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 15000);

      req.on('close', () => {
        progressEmitter.off(channel, handler);
        clearInterval(heartbeat);
      });
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro SSE:', error);
      send('error', { message: error?.message || 'Erro interno' });
      res.end();
    }
  }

  async listarClientes(req: Request, res: Response): Promise<void> {
    try {
      const cnpj = (req.query['cnpj'] as string) || undefined;
      const nome = (req.query['nome'] as string) || undefined;
      const municipio = (req.query['municipio'] as string) || undefined;
      const documentoIdRaw = req.query['documentoId'] as string | undefined;
      const documentoId = documentoIdRaw ? parseInt(documentoIdRaw, 10) : undefined;
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const result = await listarClientesPorLegislacao({ cnpj, nome, municipio, documentoId, page, limit });
      res.json(result);
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro listarClientes:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async listarCidades(req: Request, res: Response): Promise<void> {
    try {
      const q = (req.query['q'] as string) || '';
      const limit = parseInt(req.query['limit'] as string) || 20;
      const items = await listarCidadesComClientes(q, limit);
      res.json({ items });
    } catch (error: any) {
      console.error('[ESTUDO_VIABILIDADE] Erro listarCidades:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }
}
