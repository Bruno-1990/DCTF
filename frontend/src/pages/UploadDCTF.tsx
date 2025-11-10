import { useCallback, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Toast from '../components/UI/Toast';

type PreviewRow = Record<string, any>;

type ValidateResponse = {
  success: boolean;
  data?: {
    metadados: any;
    totalLinhas: number;
    validos: number;
    invalidos: number;
    dados: PreviewRow[];
  };
  errors?: string[];
  warnings?: string[];
  error?: string;
};

type ImportResponse = {
  success: boolean;
  data?: {
    totalLinhasArquivo: number;
    validos: number;
    invalidos: number;
    persisted: number;
    failed: number;
    chunkSize: number;
  };
  errors?: string[];
  warnings?: string[];
  error?: string;
};

export default function UploadDCTF() {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [counts, setCounts] = useState<{ total?: number; validos?: number; invalidos?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [declaracaoId, setDeclaracaoId] = useState('');
  const [chunkSize, setChunkSize] = useState(1000);
  const [importResult, setImportResult] = useState<ImportResponse['data'] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; msg: string } | null>(null);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setCounts(null);
      setImportResult(null);
      setError(null);
      setWarnings([]);
    }
  }, []);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setCounts(null);
      setImportResult(null);
      setError(null);
      setWarnings([]);
    }
  }, []);

  const handleValidate = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    setPreview(null);
    setCounts(null);
    try {
      const form = new FormData();
      form.append('arquivo', file);
      const res = await fetch('/api/spreadsheet/validate', {
        method: 'POST',
        body: form,
      });
      const json: ValidateResponse = await res.json();
      if (!json.success) {
        setError(json.error || 'Falha ao validar');
      } else {
        setToast({ type: 'success', msg: 'Validação concluída' });
      }
      setWarnings(json.warnings || []);
      setPreview(json.data?.dados || null);
      setCounts({ total: json.data?.totalLinhas, validos: json.data?.validos, invalidos: json.data?.invalidos });
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [file]);

  const handleImport = useCallback(async () => {
    if (!file || !declaracaoId) {
      setError(!declaracaoId ? 'Informe o declaracaoId' : 'Selecione um arquivo');
      return;
    }
    setLoading(true);
    setError(null);
    setWarnings([]);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append('arquivo', file);
      form.append('declaracaoId', declaracaoId);
      form.append('chunkSize', String(chunkSize));
      const res = await fetch('/api/spreadsheet/import', {
        method: 'POST',
        body: form,
      });
      const json: ImportResponse = await res.json();
      if (!json.success) {
        setError(json.error || 'Falha ao importar');
        setToast({ type: 'error', msg: json.error || 'Falha ao importar' });
      } else {
        const d = json.data;
        const resumo = d
          ? `Total: ${d.totalLinhasArquivo} • Válidos: ${d.validos} • Inválidos: ${d.invalidos} • Persistidos: ${d.persisted}`
          : 'Importação concluída';
        setToast({ type: 'success', msg: resumo });
      }
      setWarnings(json.warnings || []);
      setImportResult(json.data || null);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [file, declaracaoId, chunkSize]);

  const columns = useMemo(() => {
    if (!preview || preview.length === 0) return [] as string[];
    const keys = Object.keys(preview[0] || {});
    return keys.filter(k => k !== '__valid');
  }, [preview]);

  return (
    <div className="p-4 space-y-4">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}
      <h1 className="text-xl font-semibold">Upload de Planilhas DCTF</h1>

      <div
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
        onClick={() => inputRef.current?.click()}
      >
        <p className="mb-2">Arraste e solte o arquivo aqui, ou clique para selecionar</p>
        <p className="text-sm text-gray-500">Formatos: .xls, .xlsx, .csv</p>
        <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={onSelect} />
      </div>

      {file && (
        <div className="flex items-center gap-3 text-sm text-gray-700">
          <div>Arquivo selecionado: <strong>{file.name}</strong></div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={!file || !declaracaoId || loading}
              className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-60"
            >
              Fazer Upload
            </button>
            <button
              onClick={() => { setFile(null); setPreview(null); setCounts(null); setImportResult(null); setError(null); setWarnings([]); }}
              disabled={loading}
              className="px-3 py-1 rounded bg-gray-500 text-white disabled:opacity-60"
            >
              Remover
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col">
          <label className="text-sm">Declaracao ID</label>
          <input className="border rounded px-2 py-1" value={declaracaoId} onChange={(e) => setDeclaracaoId(e.target.value)} placeholder="UUID da declaração" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Chunk size</label>
          <input className="border rounded px-2 py-1 w-28" type="number" min={1} max={5000} value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} />
        </div>
        <div className="flex gap-2">
          <button disabled={!file || loading} onClick={handleValidate} className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60">Validar</button>
          <button disabled={!file || !declaracaoId || loading} onClick={handleImport} className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-60">Importar</button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <LoadingSpinner />
          <span>Processando...</span>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {warnings.length > 0 && (
        <div className="text-sm text-yellow-700">
          {warnings.map((w, i) => (<div key={i}>• {w}</div>))}
        </div>
      )}

      {counts && (
        <div className="text-sm text-gray-700">
          Total: <strong>{counts.total ?? 0}</strong> · Válidos: <strong>{counts.validos ?? 0}</strong> · Inválidos: <strong>{counts.invalidos ?? 0}</strong>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="overflow-auto">
          <table className="min-w-full text-sm border">
            <thead>
              <tr className="bg-gray-50">
                {columns.map(col => (
                  <th key={col} className="text-left p-2 border-b">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, idx) => (
                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                  {columns.map(col => (
                    <td key={col} className="p-2 border-b">{String(row[col] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importResult && (
        <div className="text-sm text-gray-700 space-y-1">
          <div>Importação concluída</div>
          <div>Total arquivo: <strong>{importResult.totalLinhasArquivo}</strong></div>
          <div>Válidos: <strong>{importResult.validos}</strong> · Inválidos: <strong>{importResult.invalidos}</strong></div>
          <div>Persistidos: <strong>{importResult.persisted}</strong> · Falhas: <strong>{importResult.failed}</strong></div>
          <div>Chunk: <strong>{importResult.chunkSize}</strong></div>
        </div>
      )}
    </div>
  );
}


