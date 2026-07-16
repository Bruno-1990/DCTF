import React, { useState, useCallback, useRef } from 'react';
import { CloudArrowUpIcon, TrashIcon, MagnifyingGlassIcon, DocumentTextIcon, XMarkIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { beneficiosService } from '../services/beneficios';
import type { ComparacaoItem, PaginatedResponse } from '../services/beneficios';
import FontePlanilha from '../components/Beneficios/FontePlanilha';
import ReoaTab from '../components/Beneficios/ReoaTab';

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
};

const formatCnpj = (cnpj: string) => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
};

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

type TabId = 'compete' | 'invest' | 'reoa';

const TABS: { id: TabId; label: string; gradient: string }[] = [
  { id: 'compete', label: 'Compete', gradient: 'from-blue-500 to-indigo-600 shadow-blue-500/30' },
  { id: 'invest', label: 'Invest', gradient: 'from-emerald-500 to-teal-600 shadow-emerald-500/30' },
  { id: 'reoa', label: 'REOA', gradient: 'from-rose-500 to-pink-600 shadow-rose-500/30' },
];

// Cada aba importa a lista de um programa diferente, publicada numa seção
// diferente do Portal da Transparência do ES — daí a fonte ser por aba e não
// um aviso único na página.
// O backend confirma seção/descrição ao resolver o arquivo; isto é só o que
// aparece enquanto ele não respondeu (ou se o portal estiver fora).
const FONTES: Record<'compete' | 'invest', { programa: 'compete' | 'invest'; secao: string; descricao: string }> = {
  compete: { programa: 'compete', secao: '04', descricao: 'Lista de Beneficiários do programa Compete' },
  invest: { programa: 'invest', secao: '05', descricao: 'Lista de Beneficiários do programa Invest' },
};

// ─── Colunas de exibição por aba ───

const COMPETE_COLS: { key: string; label: string; date?: boolean }[] = [
  { key: 'razao_social', label: 'Razão Social' },
  { key: 'inscricao_estadual', label: 'IE' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'municipio', label: 'Município' },
  { key: 'portaria_inclusao', label: 'Port. Inclusão' },
  { key: 'data_portaria', label: 'Data Portaria', date: true },
  { key: 'portaria_exclusao', label: 'Port. Exclusão' },
  { key: 'data_portaria_exclusao', label: 'Data Excl.', date: true },
  { key: 'contrato', label: 'Contrato' },
  { key: 'processo', label: 'Processo' },
  { key: 'processo_inclusao', label: 'Proc. Inclusão' },
  { key: 'processo_exclusao', label: 'Proc. Exclusão' },
  { key: 'data_inicio', label: 'Data Início', date: true },
  { key: 'data_final', label: 'Data Final', date: true },
];

const INVEST_COLS: { key: string; label: string; date?: boolean }[] = [
  { key: 'numero', label: 'Número' },
  { key: 'data_cadastro', label: 'Data Cadastro', date: true },
  { key: 'processo', label: 'Processo' },
  { key: 'ementa', label: 'Ementa' },
  { key: 'base_legal', label: 'Base Legal' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'inscricao_estadual', label: 'IE' },
  { key: 'razao_social', label: 'Razão Social' },
  { key: 'municipio', label: 'Município' },
  { key: 'situacao', label: 'Situação' },
  { key: 'data_assinatura', label: 'Assinatura', date: true },
  { key: 'data_publicacao_dio', label: 'Publicação DIO', date: true },
  { key: 'data_inicio_vigencia', label: 'Início Vigência', date: true },
  { key: 'data_final_vigencia', label: 'Final Vigência', date: true },
  { key: 'data_prorrogacao', label: 'Prorrogação', date: true },
  { key: 'data_cancelamento', label: 'Cancelamento', date: true },
  { key: 'data_suspensao', label: 'Suspensão', date: true },
  { key: 'data_revogacao', label: 'Revogação', date: true },
];

// ─── Componente principal ───

const Beneficios: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('compete');

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Benefícios Fiscais</h1>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 mb-6 overflow-hidden">
        <div className="px-6 pt-4 pb-2">
          <div className="flex space-x-1">
            {TABS.map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 relative ${
                  activeTab === tab.id
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg transform scale-105`
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                }`}>
                {tab.label}
                {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={activeTab === 'compete' ? '' : 'hidden'}>
        <BeneficioTab
          columns={COMPETE_COLS}
          importar={beneficiosService.importarCompete}
          listar={beneficiosService.listarCompete}
          comparar={beneficiosService.comparacaoCompete}
          limpar={beneficiosService.limparCompete}
          accentColor="blue"
          fonte={FONTES.compete}
        />
      </div>
      <div className={activeTab === 'invest' ? '' : 'hidden'}>
        <BeneficioTab
          columns={INVEST_COLS}
          importar={beneficiosService.importarInvest}
          listar={beneficiosService.listarInvest}
          comparar={beneficiosService.comparacaoInvest}
          limpar={beneficiosService.limparInvest}
          accentColor="emerald"
          fonte={FONTES.invest}
        />
      </div>
      <div className={activeTab === 'reoa' ? '' : 'hidden'}>
        <ReoaTab />
      </div>
    </div>
  );
};

// ─── Tab genérica reutilizável ───

interface BeneficioTabProps {
  columns: { key: string; label: string; date?: boolean }[];
  importar: (file: File) => Promise<any>;
  listar: (page: number, limit: number, busca?: string) => Promise<PaginatedResponse<any>>;
  comparar: (page: number, limit: number, busca?: string) => Promise<PaginatedResponse<ComparacaoItem>>;
  limpar: () => Promise<any>;
  accentColor: 'blue' | 'emerald';
  fonte: { programa: 'compete' | 'invest'; secao: string; descricao: string };
}

const BeneficioTab: React.FC<BeneficioTabProps> = ({ columns, importar, listar, comparar, limpar, accentColor, fonte }) => {
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comparação
  const [compData, setCompData] = useState<ComparacaoItem[]>([]);
  const [compPag, setCompPag] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [compLoading, setCompLoading] = useState(false);
  const [compBusca, setCompBusca] = useState('');
  const [compVisible, setCompVisible] = useState(false);
  const [compLoaded, setCompLoaded] = useState(false);

  // Confirmar exclusão
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const carregar = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await listar(page, 50, busca || undefined);
      setData(result.items || []);
      setPagination(result.pagination);
      setLoaded(true);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Erro ao carregar.' });
    } finally { setLoading(false); }
  }, [busca, listar]);

  const isValidFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const processFile = async (file: File) => {
    if (!isValidFile(file)) { setMessage({ type: 'error', text: 'Use: .csv, .xls ou .xlsx' }); return; }
    setSelectedFile(file); setUploading(true); setMessage(null);
    try {
      const result = await importar(file);
      setMessage({ type: 'success', text: result.message || `${result.importados} registros importados.` });
      await carregar(1);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.response?.data?.error || error?.message || 'Erro ao importar.' });
    } finally { setUploading(false); }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current += 1; if (e.dataTransfer.types.includes('Files')) setIsDragging(true); }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current -= 1; if (dragCounterRef.current === 0) setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setIsDragging(false);
    const validFile = Array.from(e.dataTransfer.files).find(f => isValidFile(f));
    if (!validFile) { setMessage({ type: 'error', text: 'Use: .csv, .xls ou .xlsx' }); return; }
    processFile(validFile);
  }, []);
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; };

  const executarLimpar = async () => {
    setLimpando(true);
    try {
      await limpar();
      setMessage({ type: 'success', text: 'Registros excluídos.' });
      setData([]); setPagination({ page: 1, limit: 50, total: 0, totalPages: 0 }); setSelectedFile(null);
      setCompVisible(false); setCompLoaded(false); setCompData([]);
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Erro.' }); }
    finally { setLimpando(false); setConfirmLimpar(false); }
  };

  const carregarComp = useCallback(async (page = 1) => {
    setCompLoading(true);
    try {
      const result = await comparar(page, 50, compBusca || undefined);
      setCompData(result.items || []); setCompPag(result.pagination); setCompLoaded(true); setCompVisible(true);
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Erro na comparação.' }); }
    finally { setCompLoading(false); }
  }, [compBusca, comparar]);

  const accent = accentColor === 'blue' ? { bg: 'bg-blue-600 hover:bg-blue-700', ring: 'focus:ring-blue-500', spin: 'border-blue-600', badge: 'bg-blue-100 text-blue-700' }
    : { bg: 'bg-emerald-600 hover:bg-emerald-700', ring: 'focus:ring-emerald-500', spin: 'border-emerald-600', badge: 'bg-emerald-100 text-emerald-700' };

  return (
    <>
      {/* Mensagem */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Onde baixar a planilha — vem antes do dropzone porque baixar precede importar */}
      <FontePlanilha programa={fonte.programa} secao={fonte.secao} descricao={fonte.descricao} accentColor={accentColor} />

      {/* Dropzone */}
      <div onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-dashed rounded-2xl p-12 min-h-[200px] flex flex-col items-center justify-center transition-all duration-200 cursor-pointer mb-6 ${
          isDragging ? `border-${accentColor}-500 bg-gradient-to-br from-${accentColor}-50 to-${accentColor}-100 scale-[1.02] border-3` : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 border-3'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleFileInput} disabled={uploading} className="hidden" />
        <div className="text-center space-y-4">
          {isDragging ? (
            <><div className={`mx-auto w-16 h-16 ${accent.bg} rounded-full flex items-center justify-center animate-pulse`}><CloudArrowUpIcon className="h-8 w-8 text-white" /></div>
              <p className={`text-xl font-semibold text-${accentColor}-600`}>Solte o arquivo aqui</p></>
          ) : uploading ? (
            <><div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center"><div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${accent.spin}`} /></div>
              <p className="text-lg font-medium text-gray-400">Importando...</p><p className="text-sm text-gray-400">Aguarde enquanto os dados são importados</p></>
          ) : (
            <><div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center"><CloudArrowUpIcon className="h-8 w-8 text-gray-400" /></div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-700">Arraste e solte a planilha aqui</p>
                <p className="text-sm text-gray-500">ou</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className={`inline-flex items-center px-6 py-3 ${accent.bg} text-white font-medium rounded-lg cursor-pointer transition-colors shadow-md hover:shadow-lg`}>
                  <CloudArrowUpIcon className="h-5 w-5 mr-2" /> Selecionar arquivo
                </button>
                <p className="text-xs text-gray-400">Aceita .csv, .xls, .xlsx</p>
              </div></>
          )}
          {selectedFile && !uploading && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">{selectedFile.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="ml-1 text-blue-600 hover:text-blue-800"><XMarkIcon className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {loaded && data.length > 0 && (
          <button onClick={() => setConfirmLimpar(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <TrashIcon className="h-4 w-4" /> Limpar tudo
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); carregar(1); }} className="flex items-center gap-2">
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar razão social, CNPJ ou município..."
              className={`w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${accent.ring}`} />
            <button type="submit" className={`p-2 text-gray-500 hover:text-${accentColor}-600`}><MagnifyingGlassIcon className="h-5 w-5" /></button>
          </form>
          <button type="button" onClick={() => { setCompVisible(true); carregarComp(1); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-amber-600 text-white hover:bg-amber-700">
            <ArrowsRightLeftIcon className="h-4 w-4" /> Comparação
          </button>
        </div>
      </div>

      {/* Tabela de dados importados */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${accent.spin}`} /></div>
      ) : !loaded ? (
        <p className="text-gray-400 text-sm">Importe uma planilha ou clique em buscar para carregar os dados.</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum registro encontrado.</p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>{columns.map(c => <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-gray-50">
                    {columns.map(c => (
                      <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.key === 'cnpj' ? 'font-mono text-xs' : ''}`}>
                        {c.date ? formatDate(row[c.key]) : (row[c.key] || '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>{pagination.total} registro(s) — Página {pagination.page} de {pagination.totalPages}</span>
              <div className="flex gap-2">
                <button disabled={pagination.page <= 1} onClick={() => carregar(pagination.page - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button disabled={pagination.page >= pagination.totalPages} onClick={() => carregar(pagination.page + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Próxima</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Confirmar Exclusão */}
      {confirmLimpar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !limpando && setConfirmLimpar(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><TrashIcon className="h-5 w-5 text-red-600" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900">Excluir todos os registros?</h3><p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirmLimpar(false)} disabled={limpando} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
              <button onClick={executarLimpar} disabled={limpando} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2">
                {limpando ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Excluindo...</> : <><TrashIcon className="h-4 w-4" /> Excluir tudo</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Comparação */}
      {compVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setCompVisible(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <ArrowsRightLeftIcon className="h-5 w-5 text-amber-600" /> Comparação — Sistema vs Planilha
                {compLoaded && <span className="text-sm font-normal text-gray-500">({compPag.total} encontrados)</span>}
              </h2>
              <button onClick={() => setCompVisible(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50">
              <form onSubmit={(e) => { e.preventDefault(); carregarComp(1); }} className="flex items-center gap-2">
                <input type="text" value={compBusca} onChange={e => setCompBusca(e.target.value)} placeholder="Filtrar por razão social ou CNPJ..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
                  <MagnifyingGlassIcon className="h-4 w-4" /> Filtrar
                </button>
              </form>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {compLoading ? (
                <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-amber-600" /></div>
              ) : compData.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Nenhum cliente encontrado em ambas as fontes.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-left sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">CNPJ</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">Razão Social</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Sistema</span></th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Planilha</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {compData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{formatCnpj(row.cnpj)}</td>
                          <td className="px-4 py-3 whitespace-nowrap max-w-[250px] truncate" title={row.razao_social}>{row.razao_social}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.beneficio_sistema ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{row.beneficio_sistema}</span> : <span className="text-gray-400 text-xs italic">Vazio</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.beneficio_planilha ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{row.beneficio_planilha}</span> : <span className="text-gray-400 text-xs italic">Vazio</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {compLoaded && compPag.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50/50">
                <span className="text-sm text-gray-600">{compPag.total} registro(s) — Página {compPag.page} de {compPag.totalPages}</span>
                <div className="flex gap-2">
                  <button disabled={compPag.page <= 1} onClick={() => carregarComp(compPag.page - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-100">Anterior</button>
                  <button disabled={compPag.page >= compPag.totalPages} onClick={() => carregarComp(compPag.page + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-100">Próxima</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Beneficios;
