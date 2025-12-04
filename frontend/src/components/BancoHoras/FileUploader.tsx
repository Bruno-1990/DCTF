import React, { useCallback, useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface FileUploaderProps {
  onFileUploaded?: (file: File) => void;
  onFormatComplete?: (formattedFile: Blob) => void;
  onError?: (error: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFileUploaded, 
  onFormatComplete,
  onError
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );

    if (!excelFile) {
      onError?.('Por favor, envie um arquivo Excel (.xlsx ou .xls)');
      return;
    }

    setUploadedFile(excelFile);
    onFileUploaded?.(excelFile);
    
    // Processar formatação
    await handleFormatFile(excelFile);
  }, [onFileUploaded, onError]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const excelFile = files[0];
    setUploadedFile(excelFile);
    onFileUploaded?.(excelFile);
    
    await handleFormatFile(excelFile);
  }, [onFileUploaded]);

  const handleFormatFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/sci/banco-horas/formatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || 'Erro ao formatar planilha');
      }

      const blob = await response.blob();
      onFormatComplete?.(blob);
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.(xlsx|xls)$/i, '_FORMATADO.xlsx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao formatar:', error);
      onError?.(error instanceof Error ? error.message : 'Erro ao formatar planilha. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
  }, []);

  return (
    <div className="mt-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-105' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          }
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
          disabled={isProcessing}
        />
        <label htmlFor="file-upload" className="cursor-pointer block">
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <div className="mt-4">
                <span className="text-lg font-medium text-gray-700">
                  Formatando planilha...
                </span>
                <p className="mt-2 text-sm text-gray-500">
                  Aguarde enquanto aplicamos a formatação profissional
                </p>
              </div>
            </>
          ) : (
            <>
              <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-4">
                <span className="text-lg font-medium text-gray-700">
                  Arraste e solte a planilha aqui
                </span>
                <p className="mt-2 text-sm text-gray-500">
                  ou clique para selecionar um arquivo Excel (.xlsx ou .xls)
                </p>
                {uploadedFile && (
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                    <DocumentArrowDownIcon className="h-5 w-5 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium">
                      {uploadedFile.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveFile();
                      }}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </label>
      </div>
    </div>
  );
};

