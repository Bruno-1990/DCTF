import React from 'react';

export interface DashboardFilters {
  period: '3m' | '6m' | '12m' | 'current_month' | 'current_quarter' | 'custom';
  customPeriodStart?: string;
  customPeriodEnd?: string;
  status?: 'all' | 'pending' | 'completed' | 'error';
  clientId?: string;
  clientSearch?: string;
}

interface DashboardFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  clients?: Array<{ id: string; name: string; cnpj: string }>;
  loading?: boolean;
}

const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  filters,
  onFiltersChange,
  clients = [],
  loading = false,
}) => {
  const handlePeriodChange = (period: DashboardFilters['period']) => {
    onFiltersChange({
      ...filters,
      period,
      customPeriodStart: undefined,
      customPeriodEnd: undefined,
    });
  };

  const handleStatusChange = (status: DashboardFilters['status']) => {
    onFiltersChange({
      ...filters,
      status,
    });
  };

  const handleClientSearchChange = (clientSearch: string) => {
    onFiltersChange({
      ...filters,
      clientSearch,
      clientId: undefined,
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      period: '6m',
      status: 'all',
      clientSearch: undefined,
      clientId: undefined,
    });
  };

  const activeFiltersCount = [
    filters.period !== '6m',
    filters.status !== 'all',
    !!filters.clientSearch,
  ].filter(Boolean).length;

  // Filtrar clientes baseado na busca
  const filteredClients = React.useMemo(() => {
    if (!filters.clientSearch || filters.clientSearch.length < 3) {
      return [];
    }
    const searchLower = filters.clientSearch.toLowerCase();
    return clients
      .filter(
        (client) =>
          client.name.toLowerCase().includes(searchLower) ||
          client.cnpj.replace(/\D/g, '').includes(searchLower.replace(/\D/g, ''))
      )
      .slice(0, 10);
  }, [clients, filters.clientSearch]);

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Filtros</h3>
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
            </span>
            <button
              onClick={handleClearFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Filtro de Período */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Período
          </label>
          <select
            value={filters.period}
            onChange={(e) => handlePeriodChange(e.target.value as DashboardFilters['period'])}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="current_month">Mês atual</option>
            <option value="current_quarter">Trimestre atual</option>
          </select>
        </div>

        {/* Filtro de Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleStatusChange(e.target.value as DashboardFilters['status'])}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendente</option>
            <option value="completed">Concluído</option>
            <option value="error">Erro</option>
          </select>
        </div>

        {/* Busca de Cliente */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Cliente (CNPJ ou Nome)
          </label>
          <input
            type="text"
            value={filters.clientSearch || ''}
            onChange={(e) => handleClientSearchChange(e.target.value)}
            placeholder="Digite CNPJ ou nome do cliente..."
            disabled={loading}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {filteredClients.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    onFiltersChange({
                      ...filters,
                      clientId: client.id,
                      clientSearch: client.name,
                    });
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  <p className="font-medium text-gray-800">{client.name}</p>
                  <p className="text-xs text-gray-500">{client.cnpj}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardFilters;

