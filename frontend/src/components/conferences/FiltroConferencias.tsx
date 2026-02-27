/**
 * Campo de busca para filtrar listas de conferências por CNPJ ou Razão Social.
 */

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function FiltroConferencias({
  value,
  onChange,
  placeholder = 'Filtrar por CNPJ ou Razão Social',
  className = '',
}: Props) {
  return (
    <div className={`mx-6 mt-4 mb-2 ${className}`}>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="Filtrar por CNPJ ou Razão Social"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            aria-label="Limpar filtro"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Filtra itens para manter apenas os que têm Razão Social e CNPJ válido (14 dígitos).
 * Usado quando o checkbox "Todos com procuração" está desmarcado.
 */
export function filtrarPorProcuracao<T extends { cnpj?: string | null; razao_social?: string | null }>(
  itens: T[]
): T[] {
  return itens.filter((item) => {
    const temRazaoSocial = (item.razao_social || '').trim() !== '';
    const cnpjLimpo = (item.cnpj || '').replace(/\D/g, '');
    const temCNPJ = cnpjLimpo.length === 14;
    return temRazaoSocial && temCNPJ;
  });
}

/**
 * Filtra itens que tenham cnpj e/ou razao_social pelo termo de busca
 * (busca em CNPJ apenas dígitos; em Razão Social case-insensitive).
 */
export function filtrarPorCnpjOuRazao<T extends { cnpj?: string | null; razao_social?: string | null }>(
  itens: T[],
  termo: string
): T[] {
  const t = termo.trim();
  if (!t) return itens;
  const tLower = t.toLowerCase();
  const tDigits = t.replace(/\D/g, '');
  return itens.filter((item) => {
    const cnpj = (item.cnpj || '').replace(/\D/g, '');
    const razao = (item.razao_social || '').toLowerCase();
    return (tDigits.length > 0 && cnpj.includes(tDigits)) || (tLower.length > 0 && razao.includes(tLower));
  });
}
