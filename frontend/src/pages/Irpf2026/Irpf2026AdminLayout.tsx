/**
 * Layout da área administrativa IRPF 2026.
 * Header com Central Admin e logout.
 */

import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useIrpf2026Auth } from '../../contexts/Irpf2026AuthContext';

export default function Irpf2026AdminLayout() {
  const navigate = useNavigate();
  const { user, logout } = useIrpf2026Auth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-800/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white tracking-tight">Central IRPF – Visão geral</h1>
          <div className="flex items-center gap-4">
            {user?.email && (
              <span className="text-slate-400 text-sm hidden sm:inline">{user.email}</span>
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
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
