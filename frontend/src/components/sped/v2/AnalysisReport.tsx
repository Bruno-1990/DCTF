import React, { useMemo } from 'react';
import type { DivergenciaClassificada } from './ClassificationView';

interface AnalysisReportProps {
  divergencias: DivergenciaClassificada[];
}

export const AnalysisReport: React.FC<AnalysisReportProps> = ({ divergencias }) => {
  const analise = useMemo(() => {
    // Por classificação
    const porClassificacao: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    const porCFOP: Record<string, number> = {};
    const porCST: Record<string, number> = {};
    
    divergencias.forEach(div => {
      // Classificação
      const classif = div.contexto?.classificacao || div.classificacao || 'SEM_CLASSIFICACAO';
      porClassificacao[classif] = (porClassificacao[classif] || 0) + 1;
      
      // Tipo
      const tipo = div.tipo_divergencia || 'DESCONHECIDO';
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
      
      // CFOP
      const cfop = div.contexto_fiscal?.cfop;
      if (cfop) {
        porCFOP[cfop] = (porCFOP[cfop] || 0) + 1;
      }
      
      // CST
      const cst = div.contexto_fiscal?.cst || div.contexto_fiscal?.csosn;
      if (cst) {
        porCST[cst] = (porCST[cst] || 0) + 1;
      }
    });
    
    return {
      total: divergencias.length,
      porClassificacao,
      porTipo,
      porCFOP,
      porCST,
      erros: divergencias.filter(d => (d.contexto?.classificacao || d.classificacao) === 'ERRO'),
      revisar: divergencias.filter(d => (d.contexto?.classificacao || d.classificacao) === 'REVISAR'),
      legitimo: divergencias.filter(d => (d.contexto?.classificacao || d.classificacao) === 'LEGÍTIMO'),
    };
  }, [divergencias]);
  
  const topN = (obj: Record<string, number>, n: number = 10) => {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  };
  
  return (
    <div className="bg-white shadow-lg rounded-lg p-6 my-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">📊 Análise de Divergências</h3>
      
      {/* Total */}
      <div className="mb-6">
        <div className="text-2xl font-bold text-indigo-600">{analise.total} divergências</div>
      </div>
      
      {/* Por Classificação */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-700 mb-2">Por Classificação:</h4>
        <div className="space-y-2">
          {Object.entries(analise.porClassificacao).map(([classif, count]) => {
            const pct = ((count / analise.total) * 100).toFixed(1);
            const color = classif === 'ERRO' ? 'text-red-600' : classif === 'REVISAR' ? 'text-yellow-600' : 'text-green-600';
            return (
              <div key={classif} className="flex justify-between items-center">
                <span className={`font-medium ${color}`}>{classif}</span>
                <span className="text-gray-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Por Tipo */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-700 mb-2">Por Tipo:</h4>
        <div className="space-y-2">
          {topN(analise.porTipo, 5).map(([tipo, count]) => {
            const pct = ((count / analise.total) * 100).toFixed(1);
            return (
              <div key={tipo} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{tipo}</span>
                <span className="text-gray-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Top CFOPs */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-700 mb-2">Top 10 CFOPs:</h4>
        <div className="space-y-1 text-sm">
          {topN(analise.porCFOP, 10).map(([cfop, count]) => {
            const pct = ((count / analise.total) * 100).toFixed(1);
            return (
              <div key={cfop} className="flex justify-between items-center">
                <span className="text-gray-700 font-mono">{cfop}</span>
                <span className="text-gray-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Top CSTs */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-700 mb-2">Top 10 CSTs:</h4>
        <div className="space-y-1 text-sm">
          {topN(analise.porCST, 10).map(([cst, count]) => {
            const pct = ((count / analise.total) * 100).toFixed(1);
            return (
              <div key={cst} className="flex justify-between items-center">
                <span className="text-gray-700 font-mono">{cst}</span>
                <span className="text-gray-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Exemplos de ERROS */}
      {analise.erros.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-red-600 mb-2">Exemplos de ERROS:</h4>
          <div className="space-y-3">
            {analise.erros.slice(0, 3).map((div, idx) => (
              <div key={div.id || idx} className="border-l-4 border-red-500 pl-3 text-sm">
                <div className="font-medium text-gray-900">{div.descricao}</div>
                <div className="text-gray-600">
                  XML: {div.valor_xml}, EFD: {div.valor_efd}
                </div>
                <div className="text-gray-500 text-xs">
                  CFOP: {div.contexto_fiscal?.cfop} | CST: {div.contexto_fiscal?.cst || div.contexto_fiscal?.csosn} | 
                  Score: {div.contexto?.score_confianca}
                </div>
                {div.contexto?.explicacao && (
                  <div className="text-gray-500 text-xs italic mt-1">{div.contexto.explicacao}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

