import React from 'react';
import { useRouteError, Link } from 'react-router-dom';

const ErrorPage: React.FC = () => {
  const error = useRouteError() as Error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Oops! Algo deu errado
        </h1>
        <p className="text-gray-600 mb-6">
          {error?.message || 'Ocorreu um erro inesperado. Tente novamente.'}
        </p>
        <div className="space-y-3">
          <Link
            to="/"
            className="block w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Voltar ao Início
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="block w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;

