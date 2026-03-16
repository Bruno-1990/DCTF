/**
 * Página de login da área IRPF 2026 (Central).
 * Redireciona para /irpf-2026/cliente ou /irpf-2026/admin conforme o role.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIrpf2026Auth } from '../../contexts/Irpf2026AuthContext';
import { motion } from 'framer-motion';

export default function Irpf2026LoginPage() {
  const navigate = useNavigate();
  const { login, loading, estaLogado, ehAdmin } = useIrpf2026Auth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  React.useEffect(() => {
    if (estaLogado) {
      navigate(ehAdmin ? '/irpf-2026/admin' : '/irpf-2026/cliente', { replace: true });
    }
  }, [estaLogado, ehAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    const res = await login(email, senha);
    if (!res.success) {
      setErro(res.error || 'Falha ao fazer login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Central</h1>
          <p className="text-slate-400 mt-1">Área do cliente – IRPF 2026</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-slate-300 mb-1">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="••••••••"
                required
              />
            </div>
            {erro && (
              <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{erro}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Envio seguro de documentos para declaração de IRPF 2026.
        </p>
      </motion.div>
    </div>
  );
}
