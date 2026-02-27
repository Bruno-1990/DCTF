/**
 * IRPF Produção — Detalhe do case (PRD-IRPF-001)
 * Tabs: Triagem, Documentos, Checklist, Validações, Aprovação, Auditoria
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowDownTrayIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { irpfProducaoService, type IrpfProducaoCase } from '../../services/irpfProducao';

const TABS = [
  { id: 'triagem', label: 'Triagem' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'validacoes', label: 'Validações' },
  { id: 'aprovacao', label: 'Aprovação' },
  { id: 'auditoria', label: 'Auditoria' },
];

const IrpfProducaoCase: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<IrpfProducaoCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('triagem');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [generatingDec, setGeneratingDec] = useState(false);
  const [downloadingDec, setDownloadingDec] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await irpfProducaoService.getCase(parseInt(id, 10));
      setCaseData(res.data);
      if (!newStatus && res.data?.status) setNewStatus(res.data.status);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao carregar case');
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleStatusChange = async () => {
    if (!id || !newStatus || newStatus === caseData?.status) return;
    setUpdating(true);
    try {
      await irpfProducaoService.updateCaseStatus(parseInt(id, 10), newStatus);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao atualizar status');
    } finally {
      setUpdating(false);
    }
  };

  const decDocument = caseData?.documents?.find((d) => d.doc_type === 'DEC_GERADO');

  const handleGenerateDec = async () => {
    if (!id) return;
    setGeneratingDec(true);
    setError(null);
    try {
      await irpfProducaoService.generateDec(parseInt(id, 10));
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao gerar .dec');
    } finally {
      setGeneratingDec(false);
    }
  };

  const handleDownloadDec = async () => {
    if (!decDocument || !caseData) return;
    setDownloadingDec(true);
    try {
      await irpfProducaoService.downloadDocument(decDocument.id, `${caseData.case_code}.dec`);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao baixar .dec');
    } finally {
      setDownloadingDec(false);
    }
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (error && !caseData) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
        <Link to="/irpf-producao" className="mt-4 inline-flex items-center gap-1 text-indigo-600 hover:underline">
          <ArrowLeftIcon className="h-4 w-4" /> Voltar ao Kanban
        </Link>
      </div>
    );
  }
  if (!caseData) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/irpf-producao"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Voltar"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 font-mono">{caseData.case_code}</h1>
            <p className="text-sm text-gray-500">
              Exercício {caseData.exercicio} · Ano-base {caseData.ano_base}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {['NEW', 'INTAKE_IN_PROGRESS', 'INTAKE_COMPLETE', 'READY_FOR_REVIEW', 'APPROVED', 'CLOSED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={updating || newStatus === caseData.status}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {updating ? 'Salvando...' : 'Atualizar status'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-4 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/50 p-6">
        {activeTab === 'triagem' && (
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Folha de rosto (triagem)</h3>
            <p className="text-sm text-gray-500">
              Marcadores e fontes pagadoras serão preenchidos aqui.
            </p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
            {caseData.triagem_json && (
              <pre className="mt-4 overflow-auto rounded bg-white p-4 text-xs">
                {JSON.stringify(caseData.triagem_json, null, 2)}
              </pre>
            )}
          </div>
        )}
        {activeTab === 'documentos' && (
          <div>
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
              <h3 className="font-medium text-emerald-900 mb-1">Arquivo .dec para importar na Receita</h3>
              <p className="text-sm text-emerald-700 mb-3">
                Ao final do fluxo, use o arquivo .dec para importar na Receita Federal.
              </p>
              {decDocument ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-800">
                    Arquivo gerado em {new Date(decDocument.created_at).toLocaleString('pt-BR')}.
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadDec}
                    disabled={downloadingDec}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {downloadingDec ? 'Baixando...' : 'Baixar .dec'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateDec}
                  disabled={generatingDec}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                  {generatingDec ? 'Gerando...' : 'Gerar arquivo .dec'}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500">Upload e lista de documentos por categoria.</p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
          </div>
        )}
        {activeTab === 'checklist' && (
          <div>
            <p className="text-sm text-gray-500">Checklist por perfil e pendências INFO/WARN/BLOCKER.</p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
          </div>
        )}
        {activeTab === 'validacoes' && (
          <div>
            <p className="text-sm text-gray-500">Validações e divergências.</p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
          </div>
        )}
        {activeTab === 'aprovacao' && (
          <div>
            <p className="text-sm text-gray-500">Aprovação e reprovação com justificativa.</p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
          </div>
        )}
        {activeTab === 'auditoria' && (
          <div>
            <p className="text-sm text-gray-500">Trilha de auditoria (eventos do case).</p>
            <span className="inline-block mt-2 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Em breve</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default IrpfProducaoCase;
