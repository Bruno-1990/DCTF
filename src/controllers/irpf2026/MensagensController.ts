/**
 * Controlador de mensagens/notificações IRPF 2026.
 * Cliente: listar e marcar como lida. Admin: criar mensagem.
 */

import { Request, Response } from 'express';
import {
  listMensagensByUsuario,
  findMensagemById,
  createMensagem,
  updateMensagemLida,
  listMensagensAdmin,
} from '../../services/irpf2026/Irpf2026Service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user) {
      res.status(401).json({ success: false, error: 'Não autenticado' });
      return;
    }

    if (user.role === 'admin') {
      const usuarioId = (req.query.usuario_id as string) || undefined;
      const list = await listMensagensAdmin({ usuarioId });
      res.json({ success: true, data: list });
      return;
    }

    const list = await listMensagensByUsuario(user.id);
    res.json({
      success: true,
      data: list.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        titulo: m.titulo,
        texto: m.texto,
        lida: !!m.lida,
        created_at: m.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[Irpf2026 MensagensController list]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao listar mensagens' });
  }
}

export async function marcarLida(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user || user.role !== 'cliente') {
      res.status(403).json({ success: false, error: 'Apenas cliente pode marcar mensagem como lida' });
      return;
    }

    const { id } = req.params;
    const msg = await findMensagemById(id);
    if (!msg || msg.usuario_id !== user.id) {
      res.status(404).json({ success: false, error: 'Mensagem não encontrada' });
      return;
    }

    await updateMensagemLida(id, user.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Irpf2026 MensagensController marcarLida]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao atualizar mensagem' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Apenas administradores podem enviar mensagens' });
      return;
    }

    const { usuario_id, tipo, titulo, texto } = req.body as {
      usuario_id?: string;
      tipo?: string;
      titulo?: string;
      texto?: string;
    };

    if (!usuario_id || !titulo || !texto) {
      res.status(400).json({ success: false, error: 'usuario_id, titulo e texto são obrigatórios' });
      return;
    }

    const msg = await createMensagem({
      usuario_id,
      admin_id: user.id,
      tipo: tipo === 'notificacao' ? 'notificacao' : 'mensagem',
      titulo: String(titulo).trim(),
      texto: String(texto).trim(),
    });

    res.status(201).json({ success: true, data: { id: msg.id, created_at: msg.created_at } });
  } catch (err: any) {
    console.error('[Irpf2026 MensagensController create]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao enviar mensagem' });
  }
}
