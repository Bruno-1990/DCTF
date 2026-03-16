/**
 * Controlador da área administrativa IRPF 2026.
 * Visão geral, listar usuários, definir status, etc.
 */

import { Request, Response } from 'express';
import {
  countUsuarios,
  countDocumentos,
  countDocumentosByCategoria,
  findUsuarioById,
  listDocumentosAdmin,
  listUsuariosAdmin,
  updateUsuarioStatus,
} from '../../services/irpf2026/Irpf2026Service';

export async function visaoGeral(req: Request, res: Response): Promise<void> {
  try {
    const [totalUsuarios, totalDocumentos, porCategoria] = await Promise.all([
      countUsuarios(),
      countDocumentos(),
      countDocumentosByCategoria(),
    ]);

    const ultimosDocs = await listDocumentosAdmin({ limit: 10, offset: 0 });

    res.json({
      success: true,
      data: {
        total_usuarios: totalUsuarios,
        total_documentos: totalDocumentos,
        por_categoria: porCategoria,
        ultimos_documentos: ultimosDocs.map((d) => ({
          id: d.id,
          usuario_id: d.usuario_id,
          nome_original: d.nome_original,
          categoria: d.categoria,
          created_at: d.created_at,
        })),
      },
    });
  } catch (err: any) {
    console.error('[Irpf2026 AdminController visaoGeral]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao buscar visão geral' });
  }
}

export async function listUsuarios(req: Request, res: Response): Promise<void> {
  try {
    const list = await listUsuariosAdmin();
    res.json({
      success: true,
      data: list.map((u) => ({
        id: u.id,
        email: u.email,
        nome_exibicao: u.nome_exibicao,
        status_declaracao: u.status_declaracao ?? 'pendente',
        documentos_count: (u as any).documentos_count ?? 0,
        updated_at: u.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('[Irpf2026 AdminController listUsuarios]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao listar usuários' });
  }
}

export async function getUsuario(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const usuario = await findUsuarioById(id);
    if (!usuario) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: usuario.id,
        email: usuario.email,
        nome_exibicao: usuario.nome_exibicao ?? null,
        status_declaracao: usuario.status_declaracao ?? 'pendente',
        ativo: !!usuario.ativo,
        created_at: usuario.created_at,
        updated_at: usuario.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[Irpf2026 AdminController getUsuario]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao buscar usuário' });
  }
}

export async function setStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status_declaracao } = req.body as { status_declaracao?: string };
    if (!status_declaracao || typeof status_declaracao !== 'string') {
      res.status(400).json({ success: false, error: 'status_declaracao é obrigatório' });
      return;
    }

    const allowed = ['pendente', 'aguardando_docs', 'em_analise', 'documentacao_incompleta', 'concluida'];
    if (!allowed.includes(status_declaracao)) {
      res.status(400).json({ success: false, error: 'status_declaracao inválido' });
      return;
    }

    await updateUsuarioStatus(id, status_declaracao);
    res.json({ success: true, status_declaracao });
  } catch (err: any) {
    console.error('[Irpf2026 AdminController setStatus]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao atualizar status' });
  }
}
