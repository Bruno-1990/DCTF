/**
 * Layout da área do cliente IRPF 2026 (Central).
 * Header com marca e logout; conteúdo em Outlet.
 */

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useIrpf2026Auth } from '../../contexts/Irpf2026AuthContext';

export default function Irpf2026ClienteLayout() {
  const navigate = useNavigate();
  const { user, logout } = useIrpf2026Auth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-800/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white tracking-tight">Central</h1>
          <div className="flex items-center gap-4">
            {user?.nome_exibicao && (
              <span className="text-slate-400 text-sm hidden sm:inline">{user.nome_exibicao}</span>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/irpf-2026/cliente/login', { replace: true });
              }}
              className="text-sm text-slate-400 hover:text-white transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
