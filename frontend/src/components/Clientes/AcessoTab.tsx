/**
 * Aba "Acesso" na página Clientes: formulário simples que envia dados
 * para o webhook n8n (processamento e envio por e-mail).
 * Campos alinhados ao formulário do n8n: Nome, Senha, Maquina Local.
 */

import React, { useState } from 'react';
import { n8nWebhookService } from '../../services/n8nWebhook';
import { useToast } from '../../hooks/useToast';
import { KeyIcon, UserIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';

const AcessoTab: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    senha: '',
    maquinaLocal: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.senha.trim() || !form.maquinaLocal.trim()) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const result = await n8nWebhookService.sendToN8n({
        nome: form.nome.trim(),
        senha: form.senha,
        maquinaLocal: form.maquinaLocal.trim(),
      });

      if (result.success) {
        toast.success('Dados enviados. O processamento e o e-mail serão realizados pelo n8n.');
        setForm({ nome: '', senha: '', maquinaLocal: '' });
      } else {
        toast.error(result.error || 'Falha ao enviar para o webhook.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50">
        <h2 className="text-lg font-bold text-gray-900">Dados do Usuário</h2>
        <p className="text-sm text-gray-600 mt-1">
          Preencha e envie para processar via n8n (webhook) e receber por e-mail.
        </p>
      </div>

      <div className="p-6 max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="acesso-nome" className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="acesso-nome"
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Insira o Primeiro Nome"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="acesso-senha" className="block text-sm font-medium text-gray-700 mb-1.5">
              Senha <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <KeyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="acesso-senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                placeholder="Senha"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="acesso-maquina" className="block text-sm font-medium text-gray-700 mb-1.5">
              Máquina Local <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <ComputerDesktopIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="acesso-maquina"
                type="text"
                value={form.maquinaLocal}
                onChange={(e) => setForm((f) => ({ ...f, maquinaLocal: e.target.value }))}
                placeholder="User Maquina Local"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-red-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AcessoTab;
