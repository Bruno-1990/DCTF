/**
 * Bloco compacto: Base legal e "O que fazer" por seção de conferência.
 * Consome os campos baseLegal e recomendacao da API (ou fallback estático).
 */

import { InformationCircleIcon } from '@heroicons/react/24/outline';

export interface BaseLegal {
  norma: string;
  descricao: string;
}

interface Props {
  baseLegal?: BaseLegal | null;
  recomendacao?: string | null;
}

export function BaseLegalRecomendacao({ baseLegal, recomendacao }: Props) {
  if (!baseLegal && !recomendacao) return null;

  return (
    <div className="mx-6 mt-4 mb-2 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <InformationCircleIcon className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          {baseLegal && (
            <p className="text-slate-700">
              <span className="font-semibold text-slate-800">Base legal:</span>{' '}
              {baseLegal.norma} – {baseLegal.descricao}
            </p>
          )}
          {recomendacao && (
            <p className={`text-slate-700 ${baseLegal ? 'mt-1' : ''}`}>
              <span className="font-semibold text-slate-800">O que fazer:</span> {recomendacao}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
