/**
 * Protege rotas da área do cliente IRPF 2026.
 * Redireciona para login se não autenticado; para admin se for admin.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useIrpf2026Auth } from '../../contexts/Irpf2026AuthContext';

export default function Irpf2026ProtectedCliente() {
  const { estaLogado, ehAdmin, checked } = useIrpf2026Auth();

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (!estaLogado) {
    return <Navigate to="/irpf-2026/cliente/login" replace />;
  }

  if (ehAdmin) {
    return <Navigate to="/irpf-2026/admin" replace />;
  }

  return <Outlet />;
}
