import React, { useState, useEffect } from 'react';
import { DocumentCheckIcon, ArrowUpTrayIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import FileUploader from '../components/sped/FileUploader';
import ValidationProgress from '../components/sped/ValidationProgress';
import ResultsDashboard from '../components/sped/ResultsDashboard';
import { spedService } from '../services/sped';

const SpedValidacao: React.FC = () => {
  const [validationId, setValidationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUploadStart = async (id: string, setor: string) => {
    setValidationId(id);
    setIsProcessing(true);
    setError(null);
  };

  const handleValidationComplete = () => {
    setIsProcessing(false);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setIsProcessing(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <DocumentCheckIcon className="h-8 w-8 text-blue-600" />
          Validação SPED Fiscal
        </h1>
        <p className="text-gray-600">
          Faça upload do arquivo SPED (.txt) e dos XMLs das notas fiscais para realizar a validação e conferência
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {!validationId && (
        <FileUploader 
          onUploadStart={handleUploadStart}
          onError={handleError}
        />
      )}

      {isProcessing && validationId && (
        <ValidationProgress 
          validationId={validationId}
          onComplete={handleValidationComplete}
          onError={handleError}
        />
      )}

      {validationId && !isProcessing && (
        <ResultsDashboard 
          validationId={validationId}
          onNewValidation={() => {
            setValidationId(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
};

export default SpedValidacao;

