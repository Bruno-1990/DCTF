/**
 * Visão geral administrativa IRPF 2026.
 * Lista de usuários em cards com: dados cadastrais, formulário, GOV.br, documentos, enviar mensagem, notificações.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { irpf2026Api } from '../../services/irpf2026';
import type { VisaoGeralData, UsuarioAdminItem, DocumentoItem, UsuarioCadastroItem, MensagemItem } from '../../services/irpf2026';
import { STATUS_DECLARACAO_LABELS } from './irpf2026Categorias';
import {
  ArrowDownTrayIcon,
  UserIcon,
  DocumentTextIcon,
  DocumentArrowDownIcon,
  UserCircleIcon,
  ClipboardDocumentListIcon,
  BuildingLibraryIcon,
  BellAlertIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const STATUS_OPCOES = ['pendente', 'aguardando_docs', 'em_analise', 'documentacao_incompleta', 'concluida'];

export default function Irpf2026VisaoGeral() {
  const [visao, setVisao] = useState<VisaoGeralData | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdminItem[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [mensagensPorUsuario, setMensagensPorUsuario] = useState<Record<string, MensagemItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [searchNome, setSearchNome] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [mensagemModal, setMensagemModal] = useState<{ usuarioId: string; email: string } | null>(null);
  const [mensagemForm, setMensagemForm] = useState({ titulo: '', texto: '', tipo: 'mensagem' });
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [cadastroModal, setCadastroModal] = useState<{ usuarioId: string } | null>(null);
  const [cadastroData, setCadastroData] = useState<UsuarioCadastroItem | null>(null);
  const [loadingCadastro, setLoadingCadastro] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const [v, u, d] = await Promise.all([
        irpf2026Api.getVisaoGeral(),
        irpf2026Api.getAdminUsuarios(),
        irpf2026Api.listarDocumentos({ limit: 200 }),
      ]);
      if (v.success && v.data) setVisao(v.data);
      const userList = u.success && u.data ? u.data : [];
      setUsuarios(userList);
      if (d.success && d.data) setDocumentos(d.data);
      const msgResults = await Promise.all(
        userList.map((usuario) => irpf2026Api.listarMensagens({ usuario_id: usuario.id }))
      );
      const porUsuario: Record<string, MensagemItem[]> = {};
      userList.forEach((usuario, i) => {
        porUsuario[usuario.id] = msgResults[i]?.success && msgResults[i].data ? msgResults[i].data! : [];
      });
      setMensagensPorUsuario(porUsuario);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = useCallback(async (id: string, nome: string) => {
    try {
      const blob = await irpf2026Api.downloadDocumento(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome || 'documento';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleStatusChange = useCallback(async (usuarioId: string, status: string) => {
    try {
      await irpf2026Api.setStatusUsuario(usuarioId, status);
      load();
    } catch (e) {
      console.error(e);
    }
  }, [load]);

  const handleEnviarMensagem = useCallback(async () => {
    if (!mensagemModal || !mensagemForm.titulo.trim() || !mensagemForm.texto.trim()) return;
    setEnviandoMsg(true);
    try {
      await irpf2026Api.enviarMensagem(
        mensagemModal.usuarioId,
        mensagemForm.tipo,
        mensagemForm.titulo,
        mensagemForm.texto
      );
      setMensagemModal(null);
      setMensagemForm({ titulo: '', texto: '', tipo: 'mensagem' });
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoMsg(false);
    }
  }, [mensagemModal, mensagemForm, load]);

  const openCadastroModal = useCallback(async (usuarioId: string) => {
    setCadastroModal({ usuarioId });
    setCadastroData(null);
    setLoadingCadastro(true);
    try {
      const res = await irpf2026Api.getUsuarioById(usuarioId);
      if (res.success && res.data) setCadastroData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCadastro(false);
    }
  }, []);

  const handleDownloadZip = useCallback(async (usuarioId: string) => {
    setDownloadingZip(true);
    try {
      const blob = await irpf2026Api.downloadDocumentosZip(usuarioId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentos-usuario-${usuarioId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingZip(false);
    }
  }, []);

  const usuariosFiltrados = React.useMemo(() => {
    const term = searchNome.trim().toLowerCase();
    let list = usuarios;
    if (term) {
      list = list.filter(
        (u) =>
          (u.nome_exibicao || '').toLowerCase().includes(term) ||
          (u.email || '').toLowerCase().includes(term)
      );
    }
    if (filtroStatus) {
      list = list.filter((u) => u.status_declaracao === filtroStatus);
    }
    return [...list].sort((a, b) => {
      const na = (a.nome_exibicao || a.email || '').toLowerCase();
      const nb = (b.nome_exibicao || b.email || '').toLowerCase();
      return na.localeCompare(nb);
    });
  }, [usuarios, searchNome, filtroStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg bg-red-900/20 border border-red-800 text-red-400 p-4">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Resumo */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
          <p className="text-slate-400 text-sm">Usuários</p>
          <p className="text-2xl font-semibold text-white">{visao?.total_usuarios ?? 0}</p>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
          <p className="text-slate-400 text-sm">Documentos</p>
          <p className="text-2xl font-semibold text-white">{visao?.total_documentos ?? 0}</p>
        </div>
      </div>

      {/* Pesquisa e filtros */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl bg-slate-800 border border-slate-700 p-4"
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <UserIcon className="w-5 h-5" />
          Usuários
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="search-nome">
            Pesquisar por nome ou e-mail
          </label>
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden />
            <input
              id="search-nome"
              type="search"
              placeholder="Pesquisar por nome ou e-mail"
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Pesquisar por nome ou e-mail"
            />
          </div>
          <label className="sr-only" htmlFor="filtro-status">
            Filtrar por status da declaração
          </label>
          <select
            id="filtro-status"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filtrar por status da declaração"
          >
            <option value="">Todos os status</option>
            {STATUS_OPCOES.map((s) => (
              <option key={s} value={s}>
                {STATUS_DECLARACAO_LABELS[s] || s}
              </option>
            ))}
          </select>
        </div>
      </motion.section>

      {/* Lista de cards por usuário */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="space-y-6"
      >
        {usuariosFiltrados.length === 0 ? (
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-8 text-center text-slate-400">
            Nenhum usuário encontrado com os filtros aplicados.
          </div>
        ) : (
          usuariosFiltrados.map((u, index) => {
            const docsDoUsuario = documentos.filter((d) => d.usuario_id === u.id);
            const notificacoes = mensagensPorUsuario[u.id] || [];
            return (
              <motion.article
                key={u.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * index }}
                className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden"
              >
                {/* Cabeçalho do card */}
                <div className="p-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {u.nome_exibicao || u.email}
                    </h3>
                    {u.nome_exibicao && (
                      <p className="text-slate-400 text-sm mt-0.5">{u.email}</p>
                    )}
                  </div>
                  <select
                    value={u.status_declaracao}
                    onChange={(e) => handleStatusChange(u.id, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    aria-label={`Alterar status de ${u.nome_exibicao || u.email}`}
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_DECLARACAO_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seções do card */}
                <div className="p-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Dados cadastrais */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <UserCircleIcon className="w-4 h-4" />
                      Dados cadastrais
                    </h4>
                    <button
                      type="button"
                      onClick={() => openCadastroModal(u.id)}
                      className="text-sky-400 hover:text-sky-300 text-sm"
                      aria-label={`Ver dados cadastrais de ${u.nome_exibicao || u.email}`}
                    >
                      Ver cadastro
                    </button>
                  </section>

                  {/* Formulário (placeholder) */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-4 h-4" />
                      Formulário
                    </h4>
                    <p className="text-slate-400 text-sm">Em breve</p>
                  </section>

                  {/* GOV.br */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <BuildingLibraryIcon className="w-4 h-4" />
                      GOV.br
                    </h4>
                    <p className="text-slate-400 text-sm">Nenhum dado Gov.br</p>
                  </section>

                  {/* Documentos */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3 sm:col-span-2 lg:col-span-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <DocumentTextIcon className="w-4 h-4" />
                      Documentos
                    </h4>
                    {docsDoUsuario.length === 0 ? (
                      <p className="text-slate-400 text-sm">Nenhum documento enviado.</p>
                    ) : (
                      <>
                        <ul className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                          {docsDoUsuario.map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-white truncate flex-1">{d.nome_original}</span>
                              <span className="text-slate-400 shrink-0">{d.categoria}</span>
                              <button
                                type="button"
                                onClick={() => handleDownload(d.id, d.nome_original)}
                                className="text-emerald-400 hover:text-emerald-300 shrink-0 inline-flex items-center gap-1"
                              >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                Baixar
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => handleDownloadZip(u.id)}
                          disabled={downloadingZip}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                          aria-label={`Baixar todos os documentos de ${u.nome_exibicao || u.email} em ZIP`}
                        >
                          <DocumentArrowDownIcon className="w-4 h-4" />
                          {downloadingZip ? 'Gerando...' : 'Baixar tudo em ZIP'}
                        </button>
                      </>
                    )}
                  </section>

                  {/* Enviar mensagem */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Enviar mensagem</h4>
                    <button
                      type="button"
                      onClick={() => setMensagemModal({ usuarioId: u.id, email: u.email })}
                      className="text-emerald-400 hover:text-emerald-300 text-sm"
                      aria-label={`Enviar mensagem para ${u.nome_exibicao || u.email}`}
                    >
                      Enviar mensagem
                    </button>
                  </section>

                  {/* Notificações */}
                  <section className="rounded-lg bg-slate-700/50 border border-slate-600 p-3 sm:col-span-2">
                    <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <BellAlertIcon className="w-4 h-4" />
                      Notificações
                    </h4>
                    {notificacoes.length === 0 ? (
                      <p className="text-slate-400 text-sm">Nenhuma mensagem ou notificação.</p>
                    ) : (
                      <ul className="space-y-2 max-h-40 overflow-y-auto">
                        {notificacoes.map((m) => (
                          <li key={m.id} className="text-sm border-b border-slate-600/50 pb-2 last:border-0">
                            <span className="font-medium text-white">{m.titulo}</span>
                            <span className="text-slate-400 ml-2">
                              {new Date(m.created_at).toLocaleString('pt-BR')}
                            </span>
                            {m.tipo === 'notificacao' && (
                              <span className="ml-2 text-xs text-amber-400">Notificação</span>
                            )}
                            <p className="text-slate-300 mt-1 line-clamp-2">{m.texto}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </motion.article>
            );
          })
        )}
      </motion.section>

      {/* Modal enviar mensagem */}
      {mensagemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMensagemModal(null)} />
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Enviar mensagem para {mensagemModal.email}</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Título"
                value={mensagemForm.titulo}
                onChange={(e) => setMensagemForm((f) => ({ ...f, titulo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
              />
              <textarea
                placeholder="Texto"
                value={mensagemForm.texto}
                onChange={(e) => setMensagemForm((f) => ({ ...f, texto: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white resize-none"
              />
              <select
                value={mensagemForm.tipo}
                onChange={(e) => setMensagemForm((f) => ({ ...f, tipo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
              >
                <option value="mensagem">Mensagem</option>
                <option value="notificacao">Notificação</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setMensagemModal(null)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEnviarMensagem}
                disabled={enviandoMsg || !mensagemForm.titulo.trim() || !mensagemForm.texto.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {enviandoMsg ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dados cadastrais */}
      {cadastroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setCadastroModal(null); setCadastroData(null); }} />
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-600 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <UserCircleIcon className="w-5 h-5" />
              Dados cadastrais
            </h3>
            {loadingCadastro && <p className="text-slate-400 text-sm">Carregando...</p>}
            {!loadingCadastro && cadastroData && (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-slate-400">Nome</dt>
                  <dd className="text-white">{cadastroData.nome_exibicao || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">E-mail</dt>
                  <dd className="text-white">{cadastroData.email}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Status declaração</dt>
                  <dd className="text-white">{STATUS_DECLARACAO_LABELS[cadastroData.status_declaracao] || cadastroData.status_declaracao}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Ativo</dt>
                  <dd className="text-white">{cadastroData.ativo ? 'Sim' : 'Não'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Criado em</dt>
                  <dd className="text-white">{new Date(cadastroData.created_at).toLocaleString('pt-BR')}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Atualizado em</dt>
                  <dd className="text-white">{new Date(cadastroData.updated_at).toLocaleString('pt-BR')}</dd>
                </div>
              </dl>
            )}
            {!loadingCadastro && !cadastroData && cadastroModal && (
              <p className="text-slate-400 text-sm">Usuário não encontrado.</p>
            )}
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => { setCadastroModal(null); setCadastroData(null); }}
                className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
