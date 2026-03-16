/**
 * Controlador de documentos IRPF 2026.
 * Upload, listagem e download (cliente vê só os próprios; admin vê todos).
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import {
  listDocumentosByUsuario,
  listDocumentosAdmin,
  findDocumentoById,
  findUsuarioById,
  createDocumento,
} from '../../services/irpf2026/Irpf2026Service';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'irpf2026');
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXT = ['.pdf', '.xlsx', '.xls', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.csv'];

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeCategory(cat: string): string {
  const allowed = [
    'dados_cadastrais', 'rendimentos_salario', 'rendimentos_bancarios', 'rendimentos_aluguel',
    'rendimentos_exterior', 'lucros_dividendos', 'despesas_medicas', 'plano_saude', 'despesas_educacao',
    'pensao_alimenticia', 'previdencia_privada', 'outras_deducoes', 'bens_imoveis_veiculos',
    'saldos_investimentos', 'financiamentos_emprestimos', 'participacao_societaria', 'criptoativos_exterior',
    'movimentacoes_heranca_doacao', 'acoes_judiciais', 'bolsa_valores', 'atividade_rural',
    'novos_ultima_declaracao', 'novos_recibo_entrega', 'novos_docs_pessoais', 'outros',
  ];
  return allowed.includes(cat) ? cat : 'outros';
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user) {
      res.status(401).json({ success: false, error: 'Não autenticado' });
      return;
    }

    const categoria = (req.query.categoria as string) || undefined;
    let docs: Awaited<ReturnType<typeof listDocumentosByUsuario>>;

    if (user.role === 'admin') {
      const usuarioId = (req.query.usuario_id as string) || undefined;
      const limit = parseInt((req.query.limit as string) || '100', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);
      docs = await listDocumentosAdmin({ usuarioId, categoria, limit, offset });
    } else {
      docs = await listDocumentosByUsuario(user.id, categoria);
    }

    const list = docs.map((d) => ({
      id: d.id,
      usuario_id: d.usuario_id,
      nome_original: d.nome_original,
      categoria: d.categoria,
      tamanho_bytes: d.tamanho_bytes,
      mime_type: d.mime_type,
      created_at: d.created_at,
    }));

    res.json({ success: true, data: list });
  } catch (err: any) {
    console.error('[Irpf2026 DocumentosController list]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao listar documentos' });
  }
}

export async function upload(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user) {
      res.status(401).json({ success: false, error: 'Não autenticado' });
      return;
    }
    if (user.role !== 'cliente') {
      res.status(403).json({ success: false, error: 'Apenas clientes podem enviar documentos' });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
      return;
    }

    const categoria = sanitizeCategory((req.body.categoria as string) || 'outros');
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXT.length && !ALLOWED_EXT.includes(ext)) {
      res.status(400).json({
        success: false,
        error: `Tipo de arquivo não permitido. Use: ${ALLOWED_EXT.join(', ')}`,
      });
      return;
    }

    ensureUploadDir();
    const userDir = path.join(UPLOAD_DIR, user.id);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    const nomeArquivo = `${uuidv4()}${ext}`;
    const caminhoArquivo = path.join(userDir, nomeArquivo);
    fs.writeFileSync(caminhoArquivo, file.buffer);

    const relativePath = path.relative(UPLOAD_DIR, caminhoArquivo).replace(/\\/g, '/');
    const doc = await createDocumento({
      usuario_id: user.id,
      nome_original: file.originalname || nomeArquivo,
      nome_arquivo: nomeArquivo,
      categoria,
      tamanho_bytes: file.size,
      mime_type: file.mimetype,
      caminho_arquivo: relativePath,
    });

    res.status(201).json({
      success: true,
      data: {
        id: doc.id,
        nome_original: doc.nome_original,
        categoria: doc.categoria,
        created_at: doc.created_at,
      },
    });
  } catch (err: any) {
    console.error('[Irpf2026 DocumentosController upload]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao enviar documento' });
  }
}

export async function download(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user) {
      res.status(401).json({ success: false, error: 'Não autenticado' });
      return;
    }

    const { id } = req.params;
    const doc = await findDocumentoById(id);
    if (!doc) {
      res.status(404).json({ success: false, error: 'Documento não encontrado' });
      return;
    }

    if (user.role === 'cliente' && doc.usuario_id !== user.id) {
      res.status(403).json({ success: false, error: 'Acesso negado a este documento' });
      return;
    }

    const fullPath = path.join(UPLOAD_DIR, doc.caminho_arquivo);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'Arquivo não encontrado no servidor' });
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nome_original)}"`);
    if (doc.mime_type) res.setHeader('Content-Type', doc.mime_type);
    res.sendFile(fullPath);
  } catch (err: any) {
    console.error('[Irpf2026 DocumentosController download]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao baixar documento' });
  }
}

/**
 * Download todos os documentos de um usuário em um único arquivo ZIP (apenas admin).
 */
export async function downloadZip(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Acesso negado' });
      return;
    }

    const { id: usuarioId } = req.params;
    const usuario = await findUsuarioById(usuarioId);
    if (!usuario) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      return;
    }

    const docs = await listDocumentosAdmin({ usuarioId, limit: 500 });
    if (docs.length === 0) {
      res.status(404).json({ success: false, error: 'Nenhum documento encontrado para este usuário' });
      return;
    }

    const usedNames = new Set<string>();
    const safeEntryName = (nomeOriginal: string): string => {
      const base = nomeOriginal || 'documento';
      let name = base;
      let n = 0;
      while (usedNames.has(name)) {
        const ext = path.extname(base);
        const stem = path.basename(base, ext);
        name = `${stem}_${++n}${ext}`;
      }
      usedNames.add(name);
      return name;
    };

    const filename = `documentos-${(usuario.nome_exibicao || usuario.email || usuarioId).replace(/[^a-zA-Z0-9._-]/g, '_')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err: Error) => {
      console.error('[Irpf2026 DocumentosController downloadZip]', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: err?.message || 'Erro ao gerar ZIP' });
    });
    archive.pipe(res);

    for (const doc of docs) {
      const fullPath = path.join(UPLOAD_DIR, doc.caminho_arquivo);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: safeEntryName(doc.nome_original) });
      }
    }

    await archive.finalize();
  } catch (err: any) {
    console.error('[Irpf2026 DocumentosController downloadZip]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err?.message || 'Erro ao baixar documentos em ZIP' });
    }
  }
}
