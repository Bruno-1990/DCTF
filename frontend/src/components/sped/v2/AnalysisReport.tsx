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
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl shadow-md border border-indigo-100 overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-indigo-600 px-6 py-4">
        <h3 className="text-xl font-bold text-white flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Análise de Divergências
        </h3>
      </div>
      
      <div className="p-6">
        {/* Total - Destaque */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 text-center border-l-4 border-indigo-600">
          <div className="text-4xl font-bold text-indigo-600 mb-1">{analise.total}</div>
          <div className="text-sm text-gray-600 font-medium uppercase tracking-wide">Divergências Encontradas</div>
        </div>
      
        {/* Grid de Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Por Classificação */}
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-200">
            <h4 className="font-bold text-gray-800 mb-4 flex items-center text-sm uppercase tracking-wide">
              <svg className="w-4 h-4 mr-2 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
              Classificação
            </h4>
            <div className="space-y-3">
              {Object.entries(analise.porClassificacao).map(([classif, count]) => {
                const pct = ((count / analise.total) * 100).toFixed(1);
                const bgColor = classif === 'ERRO' ? 'bg-red-100' : classif === 'REVISAR' ? 'bg-yellow-100' : 'bg-green-100';
                const textColor = classif === 'ERRO' ? 'text-red-700' : classif === 'REVISAR' ? 'text-yellow-700' : 'text-green-700';
                const icon = classif === 'ERRO' ? 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z' : classif === 'REVISAR' ? 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z' : 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z';
                return (
                  <div key={classif} className={`${bgColor} rounded-lg p-3 flex items-center justify-between`}>
                    <div className="flex items-center space-x-2">
                      <svg className={`w-5 h-5 ${textColor}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d={icon} clipRule="evenodd" />
                      </svg>
                      <span className={`font-semibold ${textColor} text-sm`}>{classif}</span>
                    </div>
                    <span className={`${textColor} font-bold text-lg`}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
      
          {/* Top CFOPs */}
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-200">
            <h4 className="font-bold text-gray-800 mb-4 flex items-center text-sm uppercase tracking-wide">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              Top 5 CFOPs
            </h4>
            <div className="space-y-2">
              {topN(analise.porCFOP, 5).map(([cfop, count], idx) => {
                const pct = ((count / analise.total) * 100).toFixed(1);
                return (
                  <div key={cfop} className="flex items-center justify-between text-sm hover:bg-blue-50 rounded px-2 py-1 transition-colors">
                    <div className="flex items-center space-x-2">
                      <span className="bg-blue-100 text-blue-700 font-bold rounded px-2 py-0.5 text-xs">{idx + 1}</span>
                      <span className="font-mono font-semibold text-gray-800">{cfop}</span>
                    </div>
                    <span className="text-gray-600 font-medium">{count} <span className="text-xs text-gray-400">({pct}%)</span></span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Top CSTs */}
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-200">
            <h4 className="font-bold text-gray-800 mb-4 flex items-center text-sm uppercase tracking-wide">
              <svg className="w-4 h-4 mr-2 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Top 5 CSTs
            </h4>
            <div className="space-y-2">
              {topN(analise.porCST, 5).map(([cst, count], idx) => {
                const pct = ((count / analise.total) * 100).toFixed(1);
                return (
                  <div key={cst} className="flex items-center justify-between text-sm hover:bg-purple-50 rounded px-2 py-1 transition-colors">
                    <div className="flex items-center space-x-2">
                      <span className="bg-purple-100 text-purple-700 font-bold rounded px-2 py-0.5 text-xs">{idx + 1}</span>
                      <span className="font-mono font-semibold text-gray-800">{cst}</span>
                    </div>
                    <span className="text-gray-600 font-medium">{count} <span className="text-xs text-gray-400">({pct}%)</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      
        {/* Exemplos de ERROS */}
        {analise.erros.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-5 border border-red-200 border-l-4">
            <h4 className="font-bold text-red-600 mb-4 flex items-center text-sm uppercase tracking-wide">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              Exemplos de Erros ({analise.erros.length} total)
            </h4>
            <div className="space-y-3">
              {analise.erros.slice(0, 3).map((div, idx) => {
                return (
                  <div key={div.id || idx} className="bg-red-50 rounded-lg p-4 hover:bg-red-100 transition-colors">
                    <div className="font-semibold text-gray-900 mb-2">{div.descricao}</div>
                    <div className="flex flex-wrap gap-3 text-sm mb-2">
                      <span className="bg-white px-2 py-1 rounded border border-red-200">
                        <span className="text-gray-500">XML:</span> <span className="font-mono font-bold text-red-600">{div.valor_xml}</span>
                      </span>
                      <span className="bg-white px-2 py-1 rounded border border-red-200">
                        <span className="text-gray-500">EFD:</span> <span className="font-mono font-bold text-red-600">{div.valor_efd}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {div.contexto_fiscal?.cfop && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono">CFOP: {div.contexto_fiscal.cfop}</span>
                      )}
                      {(div.contexto_fiscal?.cst || div.contexto_fiscal?.csosn) && (
                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded font-mono">
                          CST: {div.contexto_fiscal.cst || div.contexto_fiscal.csosn}
                        </span>
                      )}
                      {div.contexto?.score_confianca && (
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">Score: {div.contexto.score_confianca}%</span>
                      )}
                    </div>
                    {div.contexto?.explicacao && (
                      <div className="mt-2 text-xs text-gray-600 italic bg-white p-2 rounded">{div.contexto.explicacao}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
