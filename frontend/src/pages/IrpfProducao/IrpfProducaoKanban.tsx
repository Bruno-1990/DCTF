/**
 * IRPF Produção — Kanban de cases (PRD-IRPF-001)
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentTextIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { irpfProducaoService, type IrpfProducaoCase } from '../../services/irpfProducao';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Novo',
  INTAKE_IN_PROGRESS: 'Em triagem',
  INTAKE_COMPLETE: 'Triagem ok',
  PROCESSING: 'Processando',
  PENDING_INTERNAL: 'Pend. interno',
  PENDING_DOCS: 'Pend. docs',
  READY_FOR_REVIEW: 'Pronto revisão',
  APPROVED: 'Aprovado',
  SUBMITTED: 'Enviado',
  POST_DELIVERY: 'Pós-entrega',
  CLOSED: 'Encerrado',
};

const IrpfProducaoKanban: React.FC = () => {
  const [cases, setCases] = useState<IrpfProducaoCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterExercicio, setFilterExercicio] = useState<string>('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newExercicio, setNewExercicio] = useState(new Date().getFullYear());
  const [newAnoBase, setNewAnoBase] = useState(new Date().getFullYear() - 1);
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<IrpfProducaoCase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; exercicio?: number } = {};
      if (filterStatus) params.status = filterStatus;
      if (filterExercicio) params.exercicio = parseInt(filterExercicio, 10);
      const res = await irpfProducaoService.listCases(params);
      setCases(res.data || []);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao carregar cases');
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterStatus, filterExercicio]);

  const handleCreate = async () => {
    if (!newExercicio || !newAnoBase) return;
    setCreating(true);
    try {
      await irpfProducaoService.createCase({
        exercicio: newExercicio,
        ano_base: newAnoBase,
      });
      setShowNewModal(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao criar case');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await irpfProducaoService.deleteCase(deleteConfirm.id);
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao excluir case');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Cabeçalho no estilo Clientes: card com barra em gradiente */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 border-b border-indigo-500/30">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DocumentTextIcon className="h-7 w-7 text-white/90" />
            IRPF Produção
          </h1>
          <p className="text-sm text-white/80 mt-0.5">Cases e acompanhamento de declarações</p>
        </div>
        <div className="px-6 py-4 bg-gradient-to-br from-gray-50 to-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos os status</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={filterExercicio}
                onChange={(e) => setFilterExercicio(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos os exercícios</option>
                {[2026, 2025, 2024].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all"
            >
              <PlusIcon className="h-5 w-5" />
              Novo case
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          Nenhum case encontrado. Crie um novo case para começar.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="relative rounded-lg border border-gray-200 bg-white shadow-sm hover:border-indigo-300 hover:shadow transition-shadow"
            >
              <Link
                to={`/irpf-producao/cases/${c.id}`}
                className="block p-4 pr-10"
              >
                <div className="flex justify-between">
                  <span className="font-mono font-medium text-indigo-600">{c.case_code}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Exercício {c.exercicio} · Ano-base {c.ano_base}
                </div>
                {c.assigned_to && (
                  <div className="mt-1 text-xs text-gray-400">Responsável: {c.assigned_to}</div>
                )}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteConfirm(c);
                }}
                className="absolute top-3 right-3 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Excluir case"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Excluir case?</h3>
            <p className="text-sm text-gray-600 mb-4">
              O case <strong>{deleteConfirm.case_code}</strong> (Exercício {deleteConfirm.exercicio}) será excluído. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Novo case</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Exercício</label>
                <input
                  type="number"
                  value={newExercicio}
                  onChange={(e) => setNewExercicio(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Ano-base</label>
                <input
                  type="number"
                  value={newAnoBase}
                  onChange={(e) => setNewAnoBase(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IrpfProducaoKanban;
