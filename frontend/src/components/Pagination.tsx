import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  itemLabel?: string; // Ex: "cliente", "documento", "registro"
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemLabel = 'item',
}) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex justify-center items-center gap-2 py-6 mt-6 border-t border-gray-200">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Anterior
      </button>
      
      <div className="flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pagina) => {
          // Mostrar apenas algumas páginas ao redor da atual
          const mostrarPagina =
            pagina === 1 ||
            pagina === totalPages ||
            (pagina >= currentPage - 1 && pagina <= currentPage + 1);
          
          if (!mostrarPagina) {
            // Mostrar "..." se necessário
            if (pagina === currentPage - 2 || pagina === currentPage + 2) {
              return (
                <span key={pagina} className="px-2 py-1 text-sm text-gray-500">
                  ...
                </span>
              );
            }
            return null;
          }

          return (
            <button
              key={pagina}
              onClick={() => onPageChange(pagina)}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                pagina === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {pagina}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Próxima
      </button>

      <span className="ml-4 text-sm text-gray-500">
        Página {currentPage} de {totalPages} ({totalItems} {itemLabel}{totalItems !== 1 ? 's' : ''})
      </span>
    </div>
  );
};

