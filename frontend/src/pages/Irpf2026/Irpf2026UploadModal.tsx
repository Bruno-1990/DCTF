/**
 * Modal de upload de documento por categoria (IRPF 2026).
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { irpf2026Api } from '../../services/irpf2026';

interface Irpf2026UploadModalProps {
  categoria: string;
  label: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function Irpf2026UploadModal({ categoria, label, onClose, onSuccess }: Irpf2026UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErro('Selecione um arquivo.');
      return;
    }
    setErro('');
    setLoading(true);
    try {
      const res = await irpf2026Api.uploadDocumento(file, categoria);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErro(res.error || 'Falha no envio.');
      }
    } catch (err: any) {
      setErro(err?.response?.data?.error || err?.message || 'Erro ao enviar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl shadow-xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
          <p className="text-slate-400 text-sm mb-4">Envie um arquivo (PDF, planilha ou imagem).</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-600 file:text-white"
            />
            {erro && <p className="text-sm text-red-400">{erro}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
