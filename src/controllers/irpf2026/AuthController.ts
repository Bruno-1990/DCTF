/**
 * Controlador de autenticação IRPF 2026.
 * Login (admin ou cliente) e retorno de JWT com role.
 */

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, isAllowedAdminEmail } from '../../middleware/irpf2026Auth';
import {
  findAdminByEmail,
  findUsuarioByEmail,
  findUsuarioById,
  findAdminById,
} from '../../services/irpf2026/Irpf2026Service';
import type { Irpf2026Usuario, Irpf2026Admin } from '../../types';

const JWT_EXPIRES_IN = '24h';

function signToken(payload: { sub: string; role: 'admin' | 'cliente'; email: string }): string {
  return jwt.sign(
    { sub: payload.sub, role: payload.role, email: payload.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { login: loginParam, senha } = req.body as { login?: string; senha?: string };
    const email = (loginParam ?? '').toString().trim().toLowerCase();
    const password = (senha ?? '').toString();

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
      return;
    }

    // 1) Tentar admin (apenas e-mails autorizados na lista IRPF2026_ADMIN_EMAILS)
    const admin = await findAdminByEmail(email);
    if (admin) {
      const match = await bcrypt.compare(password, admin.senha_hash);
      if (match) {
        if (!isAllowedAdminEmail(admin.email)) {
          res.status(403).json({
            success: false,
            error: 'Acesso à área administrativa restrito aos e-mails autorizados.',
          });
          return;
        }
        const token = signToken({ sub: admin.id, role: 'admin', email: admin.email });
        res.json({
          success: true,
          token,
          role: 'admin',
          user: { id: admin.id, email: admin.email, nome_exibicao: admin.nome_exibicao },
        });
        return;
      }
      res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
      return;
    }

    // 2) Tentar usuário (cliente)
    const usuario = await findUsuarioByEmail(email);
    if (usuario) {
      const match = await bcrypt.compare(password, usuario.senha_hash);
      if (match) {
        const token = signToken({ sub: usuario.id, role: 'cliente', email: usuario.email });
        res.json({
          success: true,
          token,
          role: 'cliente',
          user: {
            id: usuario.id,
            email: usuario.email,
            nome_exibicao: usuario.nome_exibicao,
            status_declaracao: usuario.status_declaracao ?? 'pendente',
          },
        });
        return;
      }
    }

    res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
  } catch (err: any) {
    console.error('[Irpf2026 AuthController login]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao fazer login' });
  }
}

/**
 * GET /me - Retorna dados do usuário logado (cliente ou admin).
 */
export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = req.irpf2026Usuario;
    if (!user) {
      res.status(401).json({ success: false, error: 'Não autenticado' });
      return;
    }

    if (user.role === 'admin') {
      const admin = await findAdminById(user.id);
      if (!admin) {
        res.status(404).json({ success: false, error: 'Admin não encontrado' });
        return;
      }
      res.json({
        success: true,
        role: 'admin',
        user: { id: admin.id, email: admin.email, nome_exibicao: admin.nome_exibicao },
      });
      return;
    }

    const usuario = await findUsuarioById(user.id);
    if (!usuario) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      return;
    }
    res.json({
      success: true,
      role: 'cliente',
      user: {
        id: usuario.id,
        email: usuario.email,
        nome_exibicao: usuario.nome_exibicao,
        status_declaracao: usuario.status_declaracao ?? 'pendente',
      },
    });
  } catch (err: any) {
    console.error('[Irpf2026 AuthController me]', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao buscar usuário' });
  }
}
