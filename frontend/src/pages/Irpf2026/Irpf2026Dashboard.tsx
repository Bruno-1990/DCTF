/**
 * Dashboard do cliente IRPF 2026 (Central).
 * Cards: questionário, envio de documentos (com progresso), notificações e mensagens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useIrpf2026Auth } from '../../contexts/Irpf2026AuthContext';
import { irpf2026Api, type DocumentoItem, type MensagemItem } from '../../services/irpf2026';
import { IRPF2026_CATEGORIAS, STATUS_DECLARACAO_LABELS } from './irpf2026Categorias';
import Irpf2026UploadModal from './Irpf2026UploadModal';
import {
  DocumentTextIcon,
  FolderIcon,
  BellAlertIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

export default function Irpf2026Dashboard() {
  const { user, refreshMe } = useIrpf2026Auth();
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(true);
  const [uploadModal, setUploadModal] = useState<{ categoria: string; label: string } | null>(null);

  const loadDocumentos = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await irpf2026Api.listarDocumentos();
      if (res.success && res.data) setDocumentos(res.data);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const loadMensagens = useCallback(async () => {
    setLoadingMsg(true);
    try {
      const res = await irpf2026Api.listarMensagens();
      if (res.success && res.data) setMensagens(res.data);
    } finally {
      setLoadingMsg(false);
    }
  }, []);

  useEffect(() => {
    loadDocumentos();
  }, [loadDocumentos]);

  useEffect(() => {
    loadMensagens();
    refreshMe();
  }, [loadMensagens, refreshMe]);

  const categoriasComDoc = new Set(documentos.map((d) => d.categoria));
  const totalCategorias = IRPF2026_CATEGORIAS.length;
  const concluidas = IRPF2026_CATEGORIAS.filter((c) => categoriasComDoc.has(c.code)).length;
  const progresso = totalCategorias ? Math.round((concluidas / totalCategorias) * 100) : 0;

  const statusLabel = user?.status_declaracao
    ? STATUS_DECLARACAO_LABELS[user.status_declaracao] || user.status_declaracao
    : 'Pendente';

  return (
    <div className="space-y-8">
      {/* Barra de progresso */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-slate-800/80 border border-slate-700 p-4"
      >
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Documentos enviados</span>
          <span>{concluidas} de {totalCategorias} categorias</span>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progresso}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </motion.div>

      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
        {/* Card Questionário */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-slate-800/80 border border-slate-700 p-6 hover:border-slate-600 transition cursor-pointer"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-slate-700/80 p-3">
              <ClipboardDocumentListIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Questionário</h2>
              <p className="text-slate-400 text-sm mt-1">
                Dados cadastrais e informações para a declaração. Clique para preencher.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Card Notificações e mensagens */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-slate-800/80 border border-slate-700 p-6"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-slate-700/80 p-3">
              <BellAlertIcon className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white">Status e mensagens</h2>
              <p className="text-slate-400 text-sm mt-1">Status da declaração: <strong className="text-slate-300">{statusLabel}</strong></p>
              {loadingMsg ? (
                <p className="text-slate-500 text-sm mt-2">Carregando...</p>
              ) : mensagens.length === 0 ? (
                <p className="text-slate-500 text-sm mt-2">Nenhuma mensagem.</p>
              ) : (
                <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                  {mensagens.slice(0, 5).map((m) => (
                    <li key={m.id} className="text-sm flex items-center justify-between gap-2">
                      <span>
                        <span className={m.lida ? 'text-slate-400' : 'text-white font-medium'}>{m.titulo}</span>
                        <span className="text-slate-500 ml-1">– {new Date(m.created_at).toLocaleDateString('pt-BR')}</span>
                      </span>
                      {!m.lida && (
                        <button
                          type="button"
                          onClick={async () => {
                            await irpf2026Api.marcarMensagemLida(m.id);
                            loadMensagens();
                          }}
                          className="text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Card bloco Envio de documentos */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl bg-slate-800/80 border border-slate-700 p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FolderIcon className="w-5 h-5 text-emerald-400" />
          Envio de documentos
        </h2>
        {loadingDocs ? (
          <p className="text-slate-500">Carregando...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IRPF2026_CATEGORIAS.map((cat) => {
              const concluido = categoriasComDoc.has(cat.code);
              return (
                <motion.button
                  key={cat.code}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setUploadModal({ categoria: cat.code, label: cat.label })}
                  className={`flex items-center gap-3 rounded-lg border p-4 text-left transition ${
                    concluido
                      ? 'bg-emerald-900/30 border-emerald-600/60 text-slate-200'
                      : 'bg-slate-700/40 border-slate-600 hover:border-slate-500 text-slate-300'
                  }`}
                >
                  {concluido ? (
                    <CheckCircleSolid className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <DocumentTextIcon className="w-5 h-5 text-slate-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{cat.label}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      {uploadModal && (
        <Irpf2026UploadModal
          categoria={uploadModal.categoria}
          label={uploadModal.label}
          onClose={() => setUploadModal(null)}
          onSuccess={loadDocumentos}
        />
      )}
    </div>
  );
}
