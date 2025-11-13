import { useCallback, useRef, useState } from 'react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Toast from '../components/UI/Toast';
import { useNavigate } from 'react-router-dom';

type UploadResponse = {
  success: boolean;
  data?: {
    totalProcessados: number;
    jaExistentes: number;
    criados: number;
    ok: number;
    fail: number;
    erros: string[];
  };
  message?: string;
  error?: string;
};

export default function UploadClientes() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse['data'] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; msg: string } | null>(null);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setUploadResult(null);
      setError(null);
    }
  }, []);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setUploadResult(null);
      setError(null);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Selecione um arquivo');
      return;
    }
    
    setLoading(true);
    setError(null);
    setUploadResult(null);
    
    try {
      const form = new FormData();
      form.append('arquivo', file);
      
      const res = await fetch('/api/clientes/upload', {
        method: 'POST',
        body: form,
      });
      
      // Ler o body apenas uma vez - verificar content-type primeiro
      const contentType = res.headers.get('content-type') || '';
      let json: UploadResponse;
      
      if (contentType.includes('application/json')) {
        // Tentar ler como JSON
        try {
          json = await res.json();
        } catch (parseError) {
          // Se falhar ao parsear JSON, mostrar erro genérico
          setError(`Erro ${res.status}: ${res.statusText || 'Erro ao processar resposta'}`);
          setToast({ type: 'error', msg: `Erro ${res.status}: Resposta inválida do servidor` });
          return;
        }
      } else {
        // Se não for JSON, ler como texto (mas só uma vez)
        const errorText = await res.text();
        setError(`Erro do servidor: ${errorText || `Erro ${res.status}: ${res.statusText}`}`);
        setToast({ type: 'error', msg: errorText || `Erro ${res.status}` });
        return;
      }
      
      // Processar resposta JSON
      if (!res.ok || !json.success) {
        const errorMsg = json.error || json.message || `Erro ${res.status}: ${res.statusText}`;
        setError(errorMsg);
        setToast({ type: 'error', msg: errorMsg });
      } else {
        const d = json.data;
        const resumo = d
          ? `Processados: ${d.totalProcessados} | Já existentes: ${d.jaExistentes} | Criados: ${d.criados} | Falhas: ${d.fail}`
          : 'Upload concluído';
        setToast({ type: 'success', msg: resumo });
        setUploadResult(d || null);
        
        // Redirecionar para a página de clientes após 2 segundos
        setTimeout(() => {
          navigate('/clientes');
        }, 2000);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado');
      setToast({ type: 'error', msg: err?.message || 'Erro inesperado' });
    } finally {
      setLoading(false);
    }
  }, [file, navigate]);

  return (
    <div className="container mx-auto px-4 py-8">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}
      
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload de Planilhas de Clientes</h1>
            <p className="text-gray-600">
              Faça upload de uma planilha Excel (.xlsx, .xls) ou CSV com os dados dos clientes.
              O sistema verificará automaticamente se os clientes já existem (por CNPJ) e processará apenas os novos registros.
            </p>
          </div>
          <button
            onClick={() => {
              window.open('/api/clientes/modelo', '_blank');
            }}
            className="ml-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Baixar Modelo</span>
          </button>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                💡 Dica: Baixe o modelo antes de criar sua planilha
              </p>
              <p className="text-sm text-blue-700">
                Use o botão <strong>"Baixar Modelo"</strong> acima para obter uma planilha com a estrutura correta e um exemplo de preenchimento. 
                Isso garante que sua planilha tenha o formato esperado e evita erros no processamento.
              </p>
              <p className="text-xs text-blue-600 mt-2">
                <strong>Campos obrigatórios:</strong> <span className="font-semibold text-blue-800">CNPJ</span> (14 dígitos, aceita com ou sem formatação) e <span className="font-semibold text-blue-800">Razão Social</span>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                <strong>Campos opcionais:</strong> Email, Telefone, Endereço
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-4">
          <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div>
            <p className="text-lg font-medium text-gray-700 mb-1">Arraste e solte o arquivo aqui</p>
            <p className="text-sm text-gray-500">ou clique para selecionar</p>
          </div>
          <p className="text-xs text-gray-400">Formatos aceitos: .xlsx, .xls, .csv</p>
        </div>
        <input 
          ref={inputRef} 
          type="file" 
          accept=".xlsx,.xls,.csv" 
          className="hidden" 
          onChange={onSelect}
          data-testid="upload-input"
        />
      </div>

      {file && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={loading}
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <LoadingSpinner />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Fazer Upload</span>
                  </>
                )}
              </button>
              <button
                onClick={() => { 
                  setFile(null); 
                  setUploadResult(null); 
                  setError(null); 
                }}
                disabled={loading}
                className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-60"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">{error}</p>
          </div>
        </div>
      )}

      {uploadResult && (
        <div className="mt-4 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resultado do Upload</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Processados</p>
              <p className="text-2xl font-bold text-blue-600">{uploadResult.totalProcessados}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Já Existentes</p>
              <p className="text-2xl font-bold text-yellow-600">{uploadResult.jaExistentes}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Criados</p>
              <p className="text-2xl font-bold text-green-600">{uploadResult.criados}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Falhas</p>
              <p className="text-2xl font-bold text-red-600">{uploadResult.fail}</p>
            </div>
          </div>
          
          {uploadResult.erros && uploadResult.erros.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Erros encontrados:</p>
              <div className="bg-red-50 border border-red-200 rounded p-3 max-h-40 overflow-y-auto">
                <ul className="list-disc list-inside text-sm text-red-800">
                  {uploadResult.erros.map((erro, idx) => (
                    <li key={idx}>{erro}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => navigate('/clientes')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Ver Clientes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

