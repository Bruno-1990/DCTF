/**
 * Context de autenticação da área IRPF 2026 (Central).
 * Gerencia token, usuário, role (admin/cliente) e redirecionamento pós-login.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { irpf2026Api, setIrpf2026Token, getIrpf2026Token, type Irpf2026Role, type Irpf2026User } from '../services/irpf2026';

interface Irpf2026AuthState {
  token: string | null;
  user: Irpf2026User | null;
  role: Irpf2026Role | null;
  loading: boolean;
  checked: boolean;
}

interface Irpf2026AuthContextValue extends Irpf2026AuthState {
  estaLogado: boolean;
  ehAdmin: boolean;
  login: (login: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const initialState: Irpf2026AuthState = {
  token: null,
  user: null,
  role: null,
  loading: false,
  checked: false,
};

const Irpf2026AuthContext = createContext<Irpf2026AuthContextValue | null>(null);

export function Irpf2026AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Irpf2026AuthState>(initialState);

  const refreshMe = useCallback(async () => {
    const token = getIrpf2026Token();
    if (!token) {
      setState((s) => ({ ...s, token: null, user: null, role: null, checked: true }));
      return;
    }
    try {
      const res = await irpf2026Api.getMe();
      if (res.success && res.user && res.role) {
        setState((s) => ({ ...s, token, user: res.user!, role: res.role!, checked: true }));
      } else {
        setIrpf2026Token(null);
        setState((s) => ({ ...s, token: null, user: null, role: null, checked: true }));
      }
    } catch {
      setIrpf2026Token(null);
      setState((s) => ({ ...s, token: null, user: null, role: null, checked: true }));
    }
  }, []);

  useEffect(() => {
    const token = getIrpf2026Token();
    if (token) {
      refreshMe();
    } else {
      setState((s) => ({ ...s, checked: true }));
    }
  }, [refreshMe]);

  const login = useCallback(async (loginParam: string, senha: string) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await irpf2026Api.login(loginParam, senha);
      if (res.success && res.token && res.user && res.role) {
        setIrpf2026Token(res.token);
        setState({
          token: res.token,
          user: res.user,
          role: res.role,
          loading: false,
          checked: true,
        });
        return { success: true };
      }
      setState((s) => ({ ...s, loading: false }));
      return { success: false, error: res.error || 'Falha ao fazer login' };
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false }));
      return { success: false, error: err?.response?.data?.error || err?.message || 'Erro ao fazer login' };
    }
  }, []);

  const logout = useCallback(() => {
    setIrpf2026Token(null);
    setState({ ...initialState, checked: true });
  }, []);

  const value: Irpf2026AuthContextValue = {
    ...state,
    estaLogado: !!state.token && !!state.user,
    ehAdmin: state.role === 'admin',
    login,
    logout,
    refreshMe,
  };

  return (
    <Irpf2026AuthContext.Provider value={value}>
      {children}
    </Irpf2026AuthContext.Provider>
  );
}

export function useIrpf2026Auth(): Irpf2026AuthContextValue {
  const ctx = useContext(Irpf2026AuthContext);
  if (!ctx) throw new Error('useIrpf2026Auth must be used within Irpf2026AuthProvider');
  return ctx;
}
