import React from "react";
import { Link } from "react-router-dom";
import type { ConferenceSummary } from "../../services/conferences-modules";
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

interface ConferenceSummaryCardProps {
  data: ConferenceSummary | null;
  error?: string | null;
  loading?: boolean;
}

const STAT_LABELS: Record<keyof ConferenceSummary["estatisticas"], string> = {
  totalClientesSemDCTFVigente: "Sem DCTF na competência",
  totalClientesSemDCTFComMovimento: "Sem DCTF com movimento",
  totalDCTFsForaDoPrazo: "Fora do prazo",
  totalDCTFsPeriodoInconsistente: "Período inconsistente",
  totalClientesSemMovimentacao: "Sem movimentação",
  totalDCTFsEmAndamento: "Em andamento",
  totalClientesDispensadosDCTF: "Dispensados",
  totalIssues: "Total de ocorrências",
};

const ConferenceSummaryCard: React.FC<ConferenceSummaryCardProps> = ({
  data,
  error,
  loading,
}) => {
  if (loading) {
    return (
      <section className="mb-8">
        <div className="bg-white shadow rounded-lg p-6 h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500">Carregando conferências...</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardDocumentCheckIcon className="h-5 w-5 text-gray-500" />
              Conferências DCTF
            </h2>
            <Link
              to="/conferencias"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Ver conferências
            </Link>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {error || "Não foi possível carregar o resumo de conferências."}
          </p>
          <Link
            to="/conferencias"
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Abrir página de Conferências
          </Link>
        </div>
      </section>
    );
  }

  const stats = data.estatisticas;
  const statEntries = (Object.keys(STAT_LABELS) as (keyof typeof stats)[]).filter(
    (k) => k !== "totalIssues"
  );

  return (
    <section className="mb-8">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardDocumentCheckIcon className="h-5 w-5 text-gray-500" />
            Conferências DCTF
          </h2>
          <Link
            to="/conferencias"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Ver todas
          </Link>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Total de ocorrências: {stats.totalIssues}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statEntries.map((key) => {
            const value = stats[key];
            const hasValue = value > 0;
            return (
              <div
                key={key}
                className={`p-3 rounded-lg border text-center ${
                  hasValue
                    ? "bg-red-50 border-red-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-600 mt-1">{STAT_LABELS[key]}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ConferenceSummaryCard;
