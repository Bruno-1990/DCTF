import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CloudArrowUpIcon,
  TrashIcon,
  DocumentTextIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  estudoViabilidadeService,
  subscribeProgress,
  type DocumentoResumo,
  type ClienteMatch,
  type ProgressMessage,
} from '../services/estudoViabilidade';

type TabId = 'clientes' | 'importar' | 'documentos';

const TABS: { id: TabId; label: string; gradient: string }[] = [
  { id: 'clientes',   label: 'Clientes por Legislacao', gradient: 'from-blue-500 to-indigo-600 shadow-blue-500/30' },
  { id: 'importar',   label: 'Importar Documento',      gradient: 'from-emerald-500 to-teal-600 shadow-emerald-500/30' },
  { id: 'documentos', label: 'Documentos Ingeridos',    gradient: 'from-amber-500 to-orange-600 shadow-amber-500/30' },
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
};

const formatCnpj = (cnpj: string): string => {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};

// ─── Autocomplete de cidade ──────────────────────────────────────────────

interface Cidade { municipio: string; uf: string | null; total: number }

const CidadeAutocomplete: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [sugestoes, setSugestoes] = useState<Cidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await estudoViabilidadeService.listarCidades(input.trim(), 15);
        setSugestoes(r.items || []);
        setHighlightIdx(-1);
      } catch {
        setSugestoes([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [input, open]);

  const selecionar = (cidade: Cidade) => {
    setInput(cidade.municipio);
    onChange(cidade.municipio);
    setOpen(false);
    setHighlightIdx(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(sugestoes.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && sugestoes[highlightIdx]) {
      e.preventDefault();
      selecionar(sugestoes[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-52">
      <div className="relative">
        <input
          type="text"
          value={input}
          placeholder="Cidade..."
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {input && (
          <button
            type="button"
            onClick={() => { setInput(''); onChange(''); setSugestoes([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label="Limpar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-500">Buscando...</div>
          ) : sugestoes.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">
              {input.trim() ? 'Nenhuma cidade encontrada' : 'Digite para buscar'}
            </div>
          ) : (
            sugestoes.map((c, idx) => (
              <button
                key={`${c.municipio}-${c.uf || ''}`}
                type="button"
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => selecionar(c)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                  idx === highlightIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{c.municipio}</span>
                  {c.uf && <span className="text-xs text-gray-500 font-mono">/{c.uf}</span>}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{c.total} cli.</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const grauRiscoBadge = (grau: string): string => {
  const g = grau.toLowerCase();
  if (g.includes('dispensa') || g.includes('isent')) return 'bg-gray-100 text-gray-700';
  if (/\bi\b|\b1\b|baixo|leve/.test(g)) return 'bg-green-100 text-green-800';
  if (/\bii\b|\b2\b|medio|moderado/.test(g)) return 'bg-yellow-100 text-yellow-800';
  if (/\biii\b|\b3\b|alto|elevado|grave/.test(g)) return 'bg-red-100 text-red-800';
  return 'bg-blue-100 text-blue-800';
};

const Legalizacao: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('clientes');
  const [refreshDocsKey, setRefreshDocsKey] = useState(0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-2">Legalização</h1>
      <p className="text-sm text-gray-500 mb-6">
        Importe uma legislacao em PDF ou DOCX. O sistema extrai os CNAEs do documento e cruza com a base de clientes.
      </p>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 mb-6 overflow-hidden">
        <div className="px-6 pt-4 pb-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  activeTab === tab.id
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={activeTab === 'clientes' ? '' : 'hidden'}>
        <ClientesTab refreshKey={refreshDocsKey} />
      </div>
      <div className={activeTab === 'importar' ? '' : 'hidden'}>
        <ImportarTab onProcessado={() => setRefreshDocsKey(k => k + 1)} />
      </div>
      <div className={activeTab === 'documentos' ? '' : 'hidden'}>
        <DocumentosTab refreshKey={refreshDocsKey} onChanged={() => setRefreshDocsKey(k => k + 1)} />
      </div>
    </div>
  );
};

// ─── Aba 1: Clientes por Legislacao ───────────────────────────────────────

const ClientesTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [items, setItems] = useState<ClienteMatch[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [nome, setNome] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [documentoId, setDocumentoId] = useState<number | ''>('');
  const [documentos, setDocumentos] = useState<DocumentoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDocs = useCallback(async () => {
    try {
      const r = await estudoViabilidadeService.listarDocumentos(1, 200);
      setDocumentos(r.items.filter(d => d.status === 'concluido'));
    } catch { /* sem documentos ainda */ }
  }, []);

  const carregar = useCallback(async (page = 1) => {
    setLoading(true);
    setErro(null);
    try {
      const r = await estudoViabilidadeService.listarClientes({
        page, limit: 50,
        cnpj: cnpj || undefined,
        nome: nome || undefined,
        municipio: municipio || undefined,
        documentoId: documentoId || undefined,
      });
      setItems(r.items || []);
      setPagination(r.pagination);
    } catch (e: any) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [cnpj, nome, municipio, documentoId]);

  useEffect(() => { carregarDocs(); }, [carregarDocs, refreshKey]);
  useEffect(() => { carregar(1); }, [refreshKey, documentoId, municipio]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBlurBusca = () => carregar(1);

  return (
    <div>
      {erro && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{erro}</div>}

      <div className="flex flex-wrap gap-3 mb-4 bg-white border border-gray-200 rounded-xl p-4">
        <input
          type="text"
          value={cnpj}
          onChange={e => setCnpj(e.target.value)}
          onBlur={onBlurBusca}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onBlurBusca(); } }}
          placeholder="Filtrar por CNPJ..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <input
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          onBlur={onBlurBusca}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onBlurBusca(); } }}
          placeholder="Filtrar por razao social..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
        />
        <CidadeAutocomplete value={municipio} onChange={setMunicipio} />
        <select
          value={documentoId}
          onChange={e => setDocumentoId(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os documentos</option>
          {documentos.map(d => (
            <option key={d.id} value={d.id}>{d.nome_original}</option>
          ))}
        </select>
        {loading && (
          <div className="flex items-center text-xs text-gray-500">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2" />
            Buscando...
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum cliente encontrado para os CNAEs da legislacao ingerida.</p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">CNPJ</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Razao Social</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">CNAE</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Origem</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Grau de Risco</th>
                  <th className="px-3 py-2 font-medium">Denominacao / Detalhes</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((row, idx) => (
                  <tr key={`${row.cliente_id}-${row.cnae_match}-${row.documento_id}-${idx}`} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{formatCnpj(row.cnpj_limpo)}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={row.razao_social}>{row.razao_social}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{row.cnae_match}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.origem_cnae === 'principal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {row.origem_cnae}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.grau_risco ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${grauRiscoBadge(row.grau_risco)}`}>
                          {row.grau_risco}
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[420px]">
                      {row.denominacao && <div className="font-medium text-gray-800">{row.denominacao}</div>}
                      {row.orgao_vigilancia && <div className="text-xs text-gray-600 mt-0.5"><span className="font-medium">Orgao:</span> {row.orgao_vigilancia}</div>}
                      {row.condicao_classificacao_risco && <div className="text-xs text-gray-600 mt-0.5"><span className="font-medium">Condicao:</span> {row.condicao_classificacao_risco}</div>}
                      {row.compreende_atuacao && <div className="text-xs text-gray-500 mt-1 line-clamp-3" title={row.compreende_atuacao}>{row.compreende_atuacao}</div>}
                      {!row.denominacao && !row.descricao && !row.compreende_atuacao && row.trecho && <div className="text-xs text-gray-500 line-clamp-3">{row.trecho}</div>}
                      {!row.denominacao && !row.descricao && !row.compreende_atuacao && !row.trecho && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{row.documento_nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>{pagination.total} match(es) — Pagina {pagination.page} de {pagination.totalPages}</span>
              <div className="flex gap-2">
                <button disabled={pagination.page <= 1} onClick={() => carregar(pagination.page - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button disabled={pagination.page >= pagination.totalPages} onClick={() => carregar(pagination.page + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Proxima</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Aba 2: Importar Documento ───────────────────────────────────────────

interface FaseAtual {
  label: string;
  detalhe?: string;
  chars?: number;
  cnaes?: number;
}

const ImportarTab: React.FC<{ onProcessado: () => void }> = ({ onProcessado }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docEmProcesso, setDocEmProcesso] = useState<DocumentoResumo | null>(null);
  const [fase, setFase] = useState<FaseAtual | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<{ close: () => void } | null>(null);

  const isValidFile = (f: File) => {
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const fecharSse = () => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
  };

  useEffect(() => () => fecharSse(), []);

  const iniciarSse = (documentoId: number) => {
    fecharSse();
    sseRef.current = subscribeProgress(documentoId, (evt: ProgressMessage) => {
      switch (evt.phase) {
        case 'snapshot':
          if (evt.status) {
            setDocEmProcesso({
              id: documentoId,
              nome_original: evt.nome_original || '',
              mime_type: '',
              tamanho_bytes: 0,
              status: evt.status,
              erro_mensagem: evt.erro_mensagem || null,
              total_cnaes: evt.total_cnaes || 0,
              criado_em: '',
              processado_em: null,
            });
          }
          break;
        case 'parse':
          setFase({ label: 'Extraindo texto', detalhe: evt.message });
          break;
        case 'llm_start':
          setFase({ label: 'Chamando Claude', detalhe: evt.model ? `modelo ${evt.model}` : undefined });
          break;
        case 'llm_progress':
          setFase({
            label: 'Recebendo resposta do Claude',
            chars: evt.chars_received,
            cnaes: evt.cnaes_parciais,
          });
          break;
        case 'persist':
          setFase({ label: 'Salvando no banco', cnaes: evt.total });
          break;
        case 'done':
          fecharSse();
          setFase(null);
          setMessage({ type: 'success', text: `Documento processado: ${evt.total_cnaes || 0} CNAE(s) extraido(s).` });
          (async () => {
            try {
              const final = await estudoViabilidadeService.obterStatus(documentoId);
              setDocEmProcesso(final);
            } catch { /* ignore */ }
          })();
          onProcessado();
          break;
        case 'error':
          fecharSse();
          setFase(null);
          setMessage({ type: 'error', text: evt.message || 'Erro no processamento.' });
          (async () => {
            try {
              const final = await estudoViabilidadeService.obterStatus(documentoId);
              setDocEmProcesso(final);
            } catch { /* ignore */ }
          })();
          onProcessado();
          break;
      }
    });
  };

  const processFile = async (file: File) => {
    if (!isValidFile(file)) {
      setMessage({ type: 'error', text: 'Apenas .pdf ou .docx.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    setDocEmProcesso(null);
    setFase(null);
    try {
      const r = await estudoViabilidadeService.uploadDocumento(file);
      const initial = await estudoViabilidadeService.obterStatus(r.documentoId);
      setDocEmProcesso(initial);
      iniciarSse(r.documentoId);
      onProcessado();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || e?.message || 'Erro no upload.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0; setIsDragging(false);
    const f = Array.from(e.dataTransfer.files).find(isValidFile);
    if (!f) { setMessage({ type: 'error', text: 'Apenas .pdf ou .docx.' }); return; }
    processFile(f);
  }, []);
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  return (
    <div>
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && !docEmProcesso && fileInputRef.current?.click()}
        className={`relative border-dashed rounded-2xl p-12 min-h-[220px] flex flex-col items-center justify-center transition-all duration-200 cursor-pointer mb-6 ${
          isDragging
            ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-100 scale-[1.02] border-3'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 border-3'
        } ${(uploading || docEmProcesso?.status === 'processando') ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileInput}
          disabled={uploading || docEmProcesso?.status === 'processando'}
          className="hidden"
        />

        {isDragging ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center animate-pulse">
              <CloudArrowUpIcon className="h-8 w-8 text-white" />
            </div>
            <p className="text-xl font-semibold text-emerald-600">Solte o arquivo aqui</p>
          </div>
        ) : docEmProcesso?.status === 'processando' ? (
          <div className="text-center space-y-3 max-w-md">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <ArrowPathIcon className="h-8 w-8 text-emerald-600 animate-spin" />
            </div>
            <p className="text-lg font-medium text-gray-700">Processando {docEmProcesso.nome_original}</p>
            {fase ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-emerald-700">{fase.label}</p>
                {fase.detalhe && <p className="text-xs text-gray-500">{fase.detalhe}</p>}
                {(fase.chars != null || fase.cnaes != null) && (
                  <div className="inline-flex items-center gap-3 text-xs text-gray-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                    {fase.cnaes != null && <span><strong className="text-emerald-700">{fase.cnaes}</strong> CNAE(s)</span>}
                    {fase.chars != null && <span><strong>{fase.chars.toLocaleString('pt-BR')}</strong> chars</span>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Aguardando inicio...</p>
            )}
          </div>
        ) : docEmProcesso?.status === 'concluido' ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-medium text-gray-700">{docEmProcesso.nome_original}</p>
            <p className="text-sm text-gray-500">{docEmProcesso.total_cnaes} CNAE(s) extraido(s). Veja na aba <strong>Clientes</strong>.</p>
            <button onClick={(e) => { e.stopPropagation(); setDocEmProcesso(null); }}
              className="text-sm text-emerald-600 hover:underline">Importar outro documento</button>
          </div>
        ) : docEmProcesso?.status === 'erro' ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-lg font-medium text-gray-700">Falha ao processar {docEmProcesso.nome_original}</p>
            <p className="text-sm text-red-600 max-w-md">{docEmProcesso.erro_mensagem}</p>
            <button onClick={(e) => { e.stopPropagation(); setDocEmProcesso(null); }}
              className="text-sm text-emerald-600 hover:underline">Tentar novamente</button>
          </div>
        ) : uploading ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
            <p className="text-lg font-medium text-gray-700">Enviando...</p>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <DocumentTextIcon className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-lg font-medium text-gray-700">Arraste o PDF ou DOCX da legislacao aqui</p>
            <p className="text-sm text-gray-500">ou clique para selecionar</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="inline-flex items-center px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg cursor-pointer transition-colors shadow-md hover:shadow-lg hover:bg-emerald-700"
            >
              <CloudArrowUpIcon className="h-5 w-5 mr-2" /> Selecionar arquivo
            </button>
            <p className="text-xs text-gray-400">Aceita .pdf e .docx — ate 25 MB</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Aba 3: Documentos Ingeridos ─────────────────────────────────────────

const DocumentosTab: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [docs, setDocs] = useState<DocumentoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await estudoViabilidadeService.listarDocumentos(1, 200);
      setDocs(r.items || []);
    } catch (e: any) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const executarExclusao = async () => {
    if (!confirmId) return;
    setExcluindo(true);
    try {
      await estudoViabilidadeService.excluirDocumento(confirmId);
      setConfirmId(null);
      await carregar();
      onChanged();
    } catch (e: any) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao excluir');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div>
      {erro && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{erro}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum documento ingerido. Use a aba <strong>Importar Documento</strong>.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Importado em</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Tamanho</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap text-right">CNAEs</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{d.nome_original}</div>
                    {d.status === 'erro' && d.erro_mensagem && (
                      <div className="text-xs text-red-600 mt-0.5">{d.erro_mensagem}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{formatDateTime(d.criado_em)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{formatBytes(d.tamanho_bytes)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {d.status === 'concluido' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircleIcon className="h-3 w-3" />Concluido</span>}
                    {d.status === 'processando' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"><ArrowPathIcon className="h-3 w-3 animate-spin" />Processando</span>}
                    {d.status === 'erro' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><ExclamationTriangleIcon className="h-3 w-3" />Erro</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs">{d.total_cnaes}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button
                      onClick={() => setConfirmId(d.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <TrashIcon className="h-4 w-4" /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !excluindo && setConfirmId(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <TrashIcon className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Excluir documento?</h3>
                <p className="text-sm text-gray-500">Todos os CNAEs extraidos serao removidos. Esta acao nao pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirmId(null)} disabled={excluindo}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
              <button onClick={executarExclusao} disabled={excluindo}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2">
                {excluindo ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Excluindo...</>
                ) : (
                  <><TrashIcon className="h-4 w-4" /> Excluir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={carregar}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" /> Atualizar
        </button>
      </div>
    </div>
  );
};

export default Legalizacao;
