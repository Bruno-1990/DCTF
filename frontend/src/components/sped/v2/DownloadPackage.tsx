import React, { useState } from 'react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentCheckIcon,
  DocumentIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';

// Helper function for conditional classNames
const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export interface ArquivoDownload {
  id: string;
  nome: string;
  tipo: 'sped' | 'relatorio' | 'audit' | 'diff' | 'plano';
  formato: 'txt' | 'pdf' | 'html' | 'json';
  tamanho?: number;
  url?: string;
  disponivel: boolean;
}

interface DownloadPackageProps {
  loteId: string;
  arquivos: ArquivoDownload[];
  onDownload?: (arquivo: ArquivoDownload) => void;
  onDownloadAll?: () => void;
}

const DownloadPackage: React.FC<DownloadPackageProps> = ({
  loteId,
  arquivos,
  onDownload,
  onDownloadAll,
}) => {
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const handleDownload = async (arquivo: ArquivoDownload) => {
    if (!arquivo.disponivel || downloading.has(arquivo.id)) {
      return;
    }

    setDownloading((prev) => new Set(prev).add(arquivo.id));

    try {
      if (onDownload) {
        onDownload(arquivo);
      } else {
        // Download padrão
        const response = await fetch(`/api/sped-v2/execucao/${loteId}/download/${arquivo.id}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${arquivo.nome}.${arquivo.formato}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
    } finally {
      setDownloading((prev) => {
        const novo = new Set(prev);
        novo.delete(arquivo.id);
        return novo;
      });
    }
  };

  const handleDownloadAll = async () => {
    if (onDownloadAll) {
      onDownloadAll();
    } else {
      // Download ZIP com todos os arquivos
      try {
        const response = await fetch(`/api/sped-v2/execucao/${loteId}/download-all`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sped_v2_pacote_${loteId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error('Erro ao baixar pacote:', error);
      }
    }
  };

  const getFileIcon = (tipo: string) => {
    switch (tipo) {
      case 'sped':
        return <DocumentTextIcon className="h-6 w-6 text-blue-500" />;
      case 'relatorio':
        return <DocumentArrowDownIcon className="h-6 w-6 text-green-500" />;
      case 'audit':
        return <ClipboardDocumentCheckIcon className="h-6 w-6 text-purple-500" />;
      case 'diff':
        return <DocumentIcon className="h-6 w-6 text-yellow-500" />;
      case 'plano':
        return <DocumentIcon className="h-6 w-6 text-indigo-500" />;
      default:
        return <DocumentIcon className="h-6 w-6 text-gray-500" />;
    }
  };

  const getFileTypeLabel = (tipo: string) => {
    switch (tipo) {
      case 'sped':
        return 'SPED Corrigido';
      case 'relatorio':
        return 'Relatório';
      case 'audit':
        return 'Audit Log';
      case 'diff':
        return 'Diff SPED';
      case 'plano':
        return 'Plano de Correções';
      default:
        return tipo;
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const arquivosDisponiveis = arquivos.filter((a) => a.disponivel);
  const todosDisponiveis = arquivosDisponiveis.length === arquivos.length && arquivos.length > 0;

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Pacote de Download</h2>
        {todosDisponiveis && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <ArchiveBoxIcon className="h-5 w-5" />
            <span>Download Todos (ZIP)</span>
          </button>
        )}
      </div>

      <div className="space-y-4">
        {arquivos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Nenhum arquivo disponível para download
          </p>
        ) : (
          arquivos.map((arquivo) => (
            <div
              key={arquivo.id}
              className={classNames(
                'border rounded-lg p-4',
                arquivo.disponivel
                  ? 'border-gray-200 hover:border-indigo-300'
                  : 'border-gray-100 bg-gray-50 opacity-60'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="flex-shrink-0">{getFileIcon(arquivo.tipo)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-medium text-gray-900">
                        {getFileTypeLabel(arquivo.tipo)}
                      </h3>
                      <span className="text-xs text-gray-500 uppercase">.{arquivo.formato}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{arquivo.nome}</p>
                    {arquivo.tamanho && (
                      <p className="text-xs text-gray-400 mt-1">
                        Tamanho: {formatFileSize(arquivo.tamanho)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {arquivo.disponivel ? (
                    <button
                      onClick={() => handleDownload(arquivo)}
                      disabled={downloading.has(arquivo.id)}
                      className={classNames(
                        'flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium',
                        downloading.has(arquivo.id)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      )}
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      <span>{downloading.has(arquivo.id) ? 'Baixando...' : 'Download'}</span>
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">Indisponível</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Informações adicionais */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total de arquivos:</span>
            <span className="ml-2 font-medium text-gray-900">{arquivos.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Disponíveis:</span>
            <span className="ml-2 font-medium text-green-600">
              {arquivosDisponiveis.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadPackage;

