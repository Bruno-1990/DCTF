/**
 * Serviço de acesso ao banco para a área IRPF 2026.
 * Usuários, admin, documentos e mensagens.
 */

import { executeQuery } from '../../config/mysql';
import type { Irpf2026Usuario, Irpf2026Admin, Irpf2026Documento, Irpf2026Mensagem } from '../../types';
import { v4 as uuidv4 } from 'uuid';

const TABLES = {
  usuarios: 'irpf2026_usuarios',
  admin: 'irpf2026_admin',
  documentos: 'irpf2026_documentos',
  mensagens: 'irpf2026_mensagens',
} as const;

export async function findUsuarioByEmail(email: string): Promise<Irpf2026Usuario | null> {
  const rows = await executeQuery<Irpf2026Usuario>(
    `SELECT * FROM \`${TABLES.usuarios}\` WHERE email = ? AND ativo = 1 LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findAdminByEmail(email: string): Promise<Irpf2026Admin | null> {
  const rows = await executeQuery<Irpf2026Admin>(
    `SELECT * FROM \`${TABLES.admin}\` WHERE email = ? AND ativo = 1 LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findUsuarioById(id: string): Promise<Irpf2026Usuario | null> {
  const rows = await executeQuery<Irpf2026Usuario>(
    `SELECT * FROM \`${TABLES.usuarios}\` WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findAdminById(id: string): Promise<Irpf2026Admin | null> {
  const rows = await executeQuery<Irpf2026Admin>(
    `SELECT * FROM \`${TABLES.admin}\` WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listDocumentosByUsuario(usuarioId: string, categoria?: string): Promise<Irpf2026Documento[]> {
  let query = `SELECT * FROM \`${TABLES.documentos}\` WHERE usuario_id = ?`;
  const params: string[] = [usuarioId];
  if (categoria) {
    query += ' AND categoria = ?';
    params.push(categoria);
  }
  query += ' ORDER BY created_at DESC';
  const rows = await executeQuery<Irpf2026Documento>(query, params);
  return rows || [];
}

export async function listDocumentosAdmin(filters: {
  usuarioId?: string;
  categoria?: string;
  limit?: number;
  offset?: number;
}): Promise<Irpf2026Documento[]> {
  let query = `SELECT * FROM \`${TABLES.documentos}\` WHERE 1=1`;
  const params: (string | number)[] = [];
  if (filters.usuarioId) {
    query += ' AND usuario_id = ?';
    params.push(filters.usuarioId);
  }
  if (filters.categoria) {
    query += ' AND categoria = ?';
    params.push(filters.categoria);
  }
  query += ' ORDER BY created_at DESC';
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  query += ` LIMIT ${limit} OFFSET ${offset}`;
  const rows = await executeQuery<Irpf2026Documento>(query, params.length ? params : undefined);
  return rows || [];
}

export async function findDocumentoById(id: string): Promise<Irpf2026Documento | null> {
  const rows = await executeQuery<Irpf2026Documento>(
    `SELECT * FROM \`${TABLES.documentos}\` WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createDocumento(data: {
  usuario_id: string;
  nome_original: string;
  nome_arquivo: string;
  categoria: string;
  tamanho_bytes?: number;
  mime_type?: string;
  caminho_arquivo: string;
}): Promise<Irpf2026Documento> {
  const id = uuidv4();
  await executeQuery(
    `INSERT INTO \`${TABLES.documentos}\` (id, usuario_id, nome_original, nome_arquivo, categoria, tamanho_bytes, mime_type, caminho_arquivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.usuario_id,
      data.nome_original,
      data.nome_arquivo,
      data.categoria,
      data.tamanho_bytes ?? null,
      data.mime_type ?? null,
      data.caminho_arquivo,
    ]
  );
  const doc = await findDocumentoById(id);
  if (!doc) throw new Error('Falha ao criar documento');
  return doc;
}

export async function listMensagensByUsuario(usuarioId: string): Promise<Irpf2026Mensagem[]> {
  const rows = await executeQuery<Irpf2026Mensagem>(
    `SELECT * FROM \`${TABLES.mensagens}\` WHERE usuario_id = ? ORDER BY created_at DESC`,
    [usuarioId]
  );
  return rows || [];
}

export async function findMensagemById(id: string): Promise<Irpf2026Mensagem | null> {
  const rows = await executeQuery<Irpf2026Mensagem>(
    `SELECT * FROM \`${TABLES.mensagens}\` WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateMensagemLida(id: string, usuarioId: string): Promise<boolean> {
  const [result] = await executeQuery<{ affectedRows: number }>(
    `UPDATE \`${TABLES.mensagens}\` SET lida = 1 WHERE id = ? AND usuario_id = ?`,
    [id, usuarioId]
  );
  return (result as any)?.affectedRows > 0;
}

export async function createMensagem(data: {
  usuario_id: string;
  admin_id?: string;
  tipo: string;
  titulo: string;
  texto: string;
}): Promise<Irpf2026Mensagem> {
  const id = uuidv4();
  await executeQuery(
    `INSERT INTO \`${TABLES.mensagens}\` (id, usuario_id, admin_id, tipo, titulo, texto, lida)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, data.usuario_id, data.admin_id ?? null, data.tipo, data.titulo, data.texto]
  );
  const msg = await findMensagemById(id);
  if (!msg) throw new Error('Falha ao criar mensagem');
  return msg;
}

export async function listMensagensAdmin(filters?: { usuarioId?: string }): Promise<Irpf2026Mensagem[]> {
  let query = `SELECT * FROM \`${TABLES.mensagens}\` WHERE 1=1`;
  const params: string[] = [];
  if (filters?.usuarioId) {
    query += ' AND usuario_id = ?';
    params.push(filters.usuarioId);
  }
  query += ' ORDER BY created_at DESC LIMIT 500';
  const rows = await executeQuery<Irpf2026Mensagem>(query, params.length ? params : undefined);
  return rows || [];
}

export async function countDocumentosByUsuario(usuarioId: string): Promise<number> {
  const rows = await executeQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM \`${TABLES.documentos}\` WHERE usuario_id = ?`,
    [usuarioId]
  );
  return Number((rows[0] as any)?.total ?? 0);
}

export async function countUsuarios(): Promise<number> {
  const rows = await executeQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM \`${TABLES.usuarios}\` WHERE ativo = 1`
  );
  return Number((rows[0] as any)?.total ?? 0);
}

export async function countDocumentos(): Promise<number> {
  const rows = await executeQuery<{ total: number }>(`SELECT COUNT(*) AS total FROM \`${TABLES.documentos}\``);
  return Number((rows[0] as any)?.total ?? 0);
}

export async function countDocumentosByCategoria(): Promise<Record<string, number>> {
  const rows = await executeQuery<{ categoria: string; total: number }>(
    `SELECT categoria, COUNT(*) AS total FROM \`${TABLES.documentos}\` GROUP BY categoria`
  );
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    out[(r as any).categoria] = Number((r as any).total ?? 0);
  }
  return out;
}

export async function listUsuariosAdmin(): Promise<(Irpf2026Usuario & { documentos_count?: number })[]> {
  const usuarios = await executeQuery<Irpf2026Usuario>(
    `SELECT * FROM \`${TABLES.usuarios}\` WHERE ativo = 1 ORDER BY updated_at DESC`
  );
  const list = usuarios || [];
  const withCount = await Promise.all(
    list.map(async (u) => {
      const count = await countDocumentosByUsuario(u.id);
      return { ...u, documentos_count: count };
    })
  );
  return withCount;
}

export async function updateUsuarioStatus(usuarioId: string, status_declaracao: string): Promise<boolean> {
  await executeQuery(
    `UPDATE \`${TABLES.usuarios}\` SET status_declaracao = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status_declaracao, usuarioId]
  );
  return true;
}
