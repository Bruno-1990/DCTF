/**
 * Serviço de Autenticação
 * Gerencia autenticação e autorização do sistema
 */

import { supabase } from '../config/database';
import { ApiResponse } from '../types';

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
}

export class AuthService {
  /**
   * Fazer login do usuário
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; session: any }>> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data.user || !data.session) {
        return {
          success: false,
          error: 'Falha na autenticação',
        };
      }

      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        role: 'user', // TODO: Implementar sistema de roles
        createdAt: new Date(data.user.created_at),
        lastLoginAt: new Date(),
      };

      return {
        success: true,
        data: {
          user,
          session: data.session,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Registrar novo usuário
   */
  async register(registerData: RegisterData): Promise<ApiResponse<User>> {
    try {
      // Validar senhas
      if (registerData.password !== registerData.confirmPassword) {
        return {
          success: false,
          error: 'Senhas não coincidem',
        };
      }

      if (registerData.password.length < 6) {
        return {
          success: false,
          error: 'Senha deve ter pelo menos 6 caracteres',
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: registerData.email,
        password: registerData.password,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data.user) {
        return {
          success: false,
          error: 'Falha no registro',
        };
      }

      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        role: 'user',
        createdAt: new Date(data.user.created_at),
      };

      return {
        success: true,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Fazer logout do usuário
   */
  async logout(): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Obter usuário atual
   */
  async getCurrentUser(): Promise<ApiResponse<User | null>> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      if (!user) {
        return {
          success: true,
          data: null,
        };
      }

      const userData: User = {
        id: user.id,
        email: user.email || '',
        role: 'user', // TODO: Implementar sistema de roles
        createdAt: new Date(user.created_at),
      };

      return {
        success: true,
        data: userData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Verificar se usuário está autenticado
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return !!user;
    } catch {
      return false;
    }
  }

  /**
   * Verificar se usuário tem permissão
   */
  async hasPermission(permission: string): Promise<boolean> {
    try {
      const userResult = await this.getCurrentUser();
      if (!userResult.success || !userResult.data) {
        return false;
      }

      // TODO: Implementar sistema de permissões
      // Por enquanto, todos os usuários autenticados têm todas as permissões
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atualizar perfil do usuário
   */
  async updateProfile(updates: Partial<User>): Promise<ApiResponse<User>> {
    try {
      const currentUserResult = await this.getCurrentUser();
      if (!currentUserResult.success || !currentUserResult.data) {
        return {
          success: false,
          error: 'Usuário não autenticado',
        };
      }

      // TODO: Implementar atualização de perfil
      // Por enquanto, apenas retorna o usuário atual
      return {
        success: true,
        data: currentUserResult.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Alterar senha do usuário
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<boolean>> {
    try {
      if (newPassword.length < 6) {
        return {
          success: false,
          error: 'Nova senha deve ter pelo menos 6 caracteres',
        };
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Solicitar reset de senha
   */
  async requestPasswordReset(email: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/reset-password`,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Verificar token de reset de senha
   */
  async verifyResetToken(token: string): Promise<ApiResponse<boolean>> {
    try {
      // TODO: Implementar verificação de token
      // Por enquanto, sempre retorna true
      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Resetar senha com token
   */
  async resetPassword(token: string, newPassword: string): Promise<ApiResponse<boolean>> {
    try {
      if (newPassword.length < 6) {
        return {
          success: false,
          error: 'Nova senha deve ter pelo menos 6 caracteres',
        };
      }

      // TODO: Implementar reset de senha com token
      // Por enquanto, apenas atualiza a senha
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}
