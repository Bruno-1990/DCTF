import React, { useCallback, useState, useRef, useEffect } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

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
  const [formattedBlob, setFormattedBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const dragCounterRef = useRef(0);
  const formatFileFunctionRef = useRef<((file: File) => Promise<void>) | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    // Só desativa quando realmente saiu da área (contador volta a zero)
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
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
    setFormattedBlob(null); // Limpar blob anterior
    setProgress(0); // Resetar progresso
    setIsProcessing(true); // Iniciar processamento imediatamente
    onFileUploaded?.(excelFile);
    
    // Iniciar processamento automático imediatamente
    setTimeout(() => {
      formatFileFunctionRef.current?.(excelFile);
    }, 100);
  }, [onFileUploaded, onError]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const excelFile = files[0];
    setUploadedFile(excelFile);
    setFormattedBlob(null); // Limpar blob anterior
    setProgress(0); // Resetar progresso
    setIsProcessing(true); // Iniciar processamento imediatamente
    onFileUploaded?.(excelFile);
    
    // Iniciar processamento automático imediatamente
    setTimeout(() => {
      formatFileFunctionRef.current?.(excelFile);
    }, 100);
  }, [onFileUploaded]);

  const handleFormatFile = useCallback(async (file?: File) => {
    const fileToProcess = file || uploadedFile;
    if (!fileToProcess) return;

    setIsProcessing(true);
    setProgress(0);

    // Simular progresso durante o upload e processamento
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', fileToProcess);

      const response = await fetch('/api/sci/banco-horas/formatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || 'Erro ao formatar planilha');
      }

      const blob = await response.blob();
      clearInterval(progressInterval);
      setProgress(100);
      
      // Pequeno delay para mostrar 100% antes de completar
      setTimeout(() => {
        setFormattedBlob(blob);
        setIsProcessing(false);
        onFormatComplete?.(blob);
      }, 300);
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      setIsProcessing(false);
      console.error('Erro ao formatar:', error);
      onError?.(error instanceof Error ? error.message : 'Erro ao formatar planilha. Tente novamente.');
    }
  }, [uploadedFile, onFormatComplete, onError]);

  // Armazenar referência da função para uso nos callbacks
  useEffect(() => {
    formatFileFunctionRef.current = async (file: File) => {
      await handleFormatFile(file);
    };
  }, [handleFormatFile]);

  // Garantir que se houver arquivo carregado mas não processado, inicie automaticamente
  useEffect(() => {
    if (uploadedFile && !isProcessing && !formattedBlob) {
      // Pequeno delay para garantir que o estado foi atualizado
      const timer = setTimeout(() => {
        if (uploadedFile && !isProcessing && !formattedBlob && formatFileFunctionRef.current) {
          setIsProcessing(true);
          formatFileFunctionRef.current(uploadedFile);
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [uploadedFile, isProcessing, formattedBlob]);

  const handleDownload = useCallback(() => {
    if (!formattedBlob || !uploadedFile) return;

    // Formatar hora atual no formato HH-MM-SS
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const horaAtual = `${hours}-${minutes}-${seconds}`;

    const url = window.URL.createObjectURL(formattedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Horas-Homen-${horaAtual}_Consolidado.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [formattedBlob, uploadedFile]);

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    setFormattedBlob(null);
    setProgress(0);
    setIsProcessing(false);
  }, []);

  return (
    <div className="mt-6 space-y-4">
      {/* Área de Drag and Drop */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative bg-white rounded-xl shadow-sm border-2 border-dashed p-8 text-center transition-all duration-200
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-[1.01] shadow-lg ring-4 ring-blue-200 ring-opacity-50' 
            : 'border-gray-300 hover:border-gray-400'
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
          disabled={isProcessing || !!formattedBlob}
        />
        <label htmlFor="file-upload" className="cursor-pointer block">
          <CloudArrowUpIcon 
            className={`mx-auto h-12 w-12 transition-colors duration-200 ${
              isDragging ? 'text-blue-500' : isProcessing ? 'text-gray-300' : 'text-gray-400'
            }`} 
          />
          <div className="mt-4">
            <span className={`text-lg font-medium transition-colors duration-200 ${
              isDragging ? 'text-blue-700' : isProcessing ? 'text-gray-400' : 'text-gray-700'
            }`}>
              {isDragging ? 'Solte a planilha aqui' : isProcessing ? 'Processando...' : 'Arraste e solte a planilha aqui'}
            </span>
            <p className={`mt-2 text-sm transition-colors duration-200 ${
              isDragging ? 'text-blue-600' : isProcessing ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {isProcessing ? 'Aguarde enquanto geramos o consolidado' : 'ou clique para selecionar um arquivo Excel (.xlsx ou .xls)'}
            </p>
            {uploadedFile && !isProcessing && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
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
                  className="ml-2 text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </label>
      </div>

      {/* Barra de Progresso durante processamento */}
      {uploadedFile && isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4"
        >
          <div className="relative w-full bg-white rounded-xl shadow-sm border-2 border-blue-600 overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
            <div className="relative w-full p-4 flex items-center justify-center gap-3">
              <ArrowDownTrayIcon className="h-5 w-5 text-white" />
              <span className="text-base font-medium text-white">
                Gerando Consolidado...
              </span>
              <span className="text-sm text-white/90 ml-2">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Botão de Download quando concluído */}
      {uploadedFile && formattedBlob && !isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4"
        >
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 rounded-xl shadow-sm border-2 border-blue-700 p-4 hover:bg-blue-700 hover:shadow-md transition-all duration-200 flex items-center justify-center gap-3 text-white"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            <span className="text-base font-medium">
              Baixar Consolidado
            </span>
          </button>
        </motion.div>
      )}
    </div>
  );
};

