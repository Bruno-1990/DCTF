import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import type { Cliente } from '../types';

const Clientes: React.FC = () => {
  const { clientes, loadClientes, createCliente, updateClienteById, deleteClienteById, loading, error, clearError } = useClientes();
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [lastPageCount, setLastPageCount] = useState<number>(0);
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ show: boolean; cliente: Cliente | null }>({ show: false, cliente: null });
  const [isClosing, setIsClosing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  // Debounce do search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page when searching
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load clientes when debounced search, page or limit changes
  useEffect(() => {
    loadClientes({ page, limit, nome: debouncedSearch }).then(({ items, pagination }) => {
      setLastPageCount(items.length);
      setTotal(pagination?.total ?? null);
      setTotalPages(pagination?.totalPages ?? null);
    }).catch(() => {});
  }, [page, limit, debouncedSearch]);

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      setShowSuccess(false); // Close success toast if error occurs
      setShowError(true);
      setTimeout(() => {
        setShowError(false);
        clearError();
      }, 5000);
    }
  }, [error, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Sempre garantir que cnpj_limpo seja fornecido (sem formatação)
    const cnpjLimpo = formData.cnpj_limpo || (formData.cnpj ? formData.cnpj.replace(/\D/g, '') : '');
    const razaoSocial = formData.razao_social || formData.nome;
    const payload = { 
      razao_social: razaoSocial, 
      cnpj_limpo: cnpjLimpo 
    } as Partial<Cliente>;
    try {
      if (editingCliente) {
        await updateClienteById(editingCliente.id!, payload);
        setSuccessMessage('Cliente atualizado com sucesso!');
      } else {
        await createCliente(payload);
        setSuccessMessage('Cliente cadastrado com sucesso!');
      }
      setShowForm(false);
      setEditingCliente(null);
      setFormData({});
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err) {
      // Error is already handled by useClientes hook
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    const cnpjLimpo = cliente.cnpj_limpo || (cliente.cnpj ? cliente.cnpj.replace(/\D/g, '') : '');
    setFormData({ 
      razao_social: cliente.razao_social || cliente.nome, 
      cnpj_limpo: cnpjLimpo,
      cnpj: formatCNPJ(cnpjLimpo)
    });
    setShowForm(true);
  };

  const handleDeleteClick = (cliente: Cliente) => {
    setIsClosing(false);
    setDeleteConfirmModal({ show: true, cliente });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmModal.cliente) {
      await deleteClienteById(deleteConfirmModal.cliente.id!);
      handleDeleteCancel();
    }
  };

  const handleDeleteCancel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setDeleteConfirmModal({ show: false, cliente: null });
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  const formatCNPJ = (value: string) => {
    const v = (value || '').replace(/\D/g, '').slice(0, 14);
    return v
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const displayCNPJ = (cnpj: string | undefined) => {
    if (!cnpj) return '-';
    return formatCNPJ(cnpj);
  };

  const canGoNext = totalPages != null ? page < totalPages : lastPageCount === limit;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Buscar por Razão Social ou CNPJ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Novo Cliente
          </button>
          <Link
            to="/clientes/upload"
            className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
          >
            Upload de planilhas
          </Link>
        </div>
      </div>


      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">{editingCliente ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                <input type="text" value={formData.razao_social || formData.nome || ''} onChange={(e) => setFormData({ ...formData, razao_social: e.target.value, nome: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input type="text" placeholder="00.000.000/0000-00" value={formData.cnpj || ''} onChange={(e) => { const formatted = formatCNPJ(e.target.value); setFormData({ ...formData, cnpj_limpo: formatted.replace(/\D/g, ''), cnpj: formatted }); }} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            </div>
            <div className="flex space-x-4">
              <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60">{editingCliente ? 'Atualizar' : 'Criar'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingCliente(null); setFormData({}); }} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">Razão Social</th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
              <th className="px-6 py-3 text-left text-base font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clientes.map((cliente) => (
              <tr key={cliente.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente.razao_social || cliente.nome || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{displayCNPJ(cliente.cnpj_limpo || cliente.cnpj)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button onClick={() => handleEdit(cliente)} className="text-blue-600 hover:text-blue-900 mr-3">Editar</button>
                  <button onClick={() => handleDeleteClick(cliente)} className="text-red-600 hover:text-red-900">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-center mt-8 mb-6">
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50 hover:bg-gray-200">Anterior</button>
          <span className="text-sm px-4">{page}{totalPages != null ? ` de ${totalPages}` : ''}</span>
          <button disabled={!canGoNext} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50 hover:bg-gray-200">Próxima</button>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="ml-4 px-3 py-2 border rounded">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
        <div className="text-sm text-gray-600 mt-2">
          {total != null && totalPages != null
            ? `Total: ${total} clientes`
            : `Mostrando ${clientes.length} clientes`}
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmModal.show && deleteConfirmModal.cliente && (
        <div 
          className="fixed inset-0 bg-gradient-to-br from-blue-900/60 via-blue-800/60 to-blue-900/60 backdrop-blur-sm flex items-center justify-center z-50"
          style={{ animation: `${isClosing ? 'fadeOut' : 'fadeIn'} 0.3s ease-out` }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 transform transition-all"
            style={{ animation: `${isClosing ? 'slideDown' : 'slideUp'} 0.3s ease-out` }}
          >
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-12 h-12 mx-auto bg-gradient-to-br from-red-50 to-red-100 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-3">
                Confirmar Exclusão
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                Tem certeza que deseja excluir o cliente 
                <br />
                <strong className="text-gray-900 font-semibold">{deleteConfirmModal.cliente.razao_social || deleteConfirmModal.cliente.nome}</strong>?
                <br />
                <span className="text-red-600 font-medium">Esta ação não pode ser desfeita.</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
                >
                  {loading ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast de sucesso */}
      {showSuccess && successMessage && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{successMessage}</p>
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Toast de erro */}
      {showError && error && (
        <div className="fixed top-4 right-4 z-50 animate-toast-slide-in">
          <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[320px] animate-toast-fade-in">
            <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{error}</p>
            </div>
            <button
              onClick={() => {
                setShowError(false);
                clearError();
              }}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideDown {
          from { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
        }
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toast-fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-toast-slide-in {
          animation: toast-slide-in 0.3s ease-out;
        }
        .animate-toast-fade-in {
          animation: toast-fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Clientes;
