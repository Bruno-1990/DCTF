#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dashboard de Qualidade - SPED 2.0
Monitora métricas de qualidade ao longo do tempo
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from decimal import Decimal
from dataclasses import dataclass, field, asdict


@dataclass
class ExecutacaoMetrica:
    """Registro de uma execução de testes"""
    timestamp: str
    total_casos: int
    acertos: int
    erros: int
    precisao_geral: float
    recall: float
    especificidade: float
    taxa_fp: float
    taxa_fn: float
    falsos_positivos: int
    falsos_negativos: int
    verdadeiros_positivos: int
    verdadeiros_negativos: int
    score_medio: float
    casos_errados: List[Dict[str, Any]] = field(default_factory=list)
    casos_sucesso: Dict[str, int] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte para dicionário"""
        return asdict(self)


class DashboardQualidade:
    """Dashboard de métricas de qualidade"""
    
    def __init__(self, historico_path: Optional[Path] = None):
        """
        Inicializa dashboard
        
        Args:
            historico_path: Caminho para arquivo de histórico JSON
        """
        if historico_path is None:
            historico_path = Path(__file__).parent.parent / 'tests' / 'historico_qualidade.json'
        
        self.historico_path = historico_path
        self.historico: List[ExecutacaoMetrica] = []
        self._carregar_historico()
    
    def _carregar_historico(self):
        """Carrega histórico de execuções anteriores"""
        if not self.historico_path.exists():
            return
        
        try:
            with open(self.historico_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self.historico = [
                ExecutacaoMetrica(**exec_data)
                for exec_data in data.get('execucoes', [])
            ]
        except Exception as e:
            print(f"⚠️ Erro ao carregar histórico: {e}")
    
    def adicionar_execucao(self, metricas: Dict[str, Any], resultados: List[Any]):
        """
        Adiciona nova execução ao histórico
        
        Args:
            metricas: Dicionário de métricas da execução
            resultados: Lista de ResultadoTeste
        """
        # Extrair casos errados
        casos_errados = []
        for r in resultados:
            if not r.acertou:
                casos_errados.append({
                    'caso_id': r.caso_id,
                    'titulo': r.titulo,
                    'esperado': r.esperado,
                    'obtido': r.obtido,
                    'score': r.score_confianca
                })
        
        # Contar sucessos por categoria
        casos_sucesso = {}
        for r in resultados:
            if r.acertou:
                cat = r.esperado
                casos_sucesso[cat] = casos_sucesso.get(cat, 0) + 1
        
        # Criar registro
        execucao = ExecutacaoMetrica(
            timestamp=datetime.now().isoformat(),
            total_casos=metricas['total_casos'],
            acertos=metricas['acertos'],
            erros=metricas['erros'],
            precisao_geral=metricas['precisao_geral'],
            recall=metricas['recall'],
            especificidade=metricas['especificidade'],
            taxa_fp=metricas['taxa_fp'],
            taxa_fn=metricas['taxa_fn'],
            falsos_positivos=metricas['falsos_positivos'],
            falsos_negativos=metricas['falsos_negativos'],
            verdadeiros_positivos=metricas['verdadeiros_positivos'],
            verdadeiros_negativos=metricas['verdadeiros_negativos'],
            score_medio=metricas['score_medio'],
            casos_errados=casos_errados,
            casos_sucesso=casos_sucesso
        )
        
        self.historico.append(execucao)
        self._salvar_historico()
    
    def _salvar_historico(self):
        """Salva histórico em arquivo JSON"""
        try:
            self.historico_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.historico_path, 'w', encoding='utf-8') as f:
                json.dump({
                    'execucoes': [exec.to_dict() for exec in self.historico],
                    'ultima_atualizacao': datetime.now().isoformat()
                }, f, indent=2, ensure_ascii=False)
        
        except Exception as e:
            print(f"⚠️ Erro ao salvar histórico: {e}")
    
    def gerar_relatorio_evolucao(self) -> str:
        """
        Gera relatório de evolução das métricas
        
        Returns:
            Relatório em texto
        """
        if not self.historico:
            return "📊 Nenhuma execução registrada ainda."
        
        relatorio = []
        relatorio.append("="*80)
        relatorio.append("📈 RELATÓRIO DE EVOLUÇÃO DA QUALIDADE")
        relatorio.append("="*80)
        
        # Última execução
        ultima = self.historico[-1]
        relatorio.append(f"\n🎯 ÚLTIMA EXECUÇÃO ({ultima.timestamp[:10]})")
        relatorio.append(f"   Precisão: {ultima.precisao_geral}%")
        relatorio.append(f"   Recall: {ultima.recall}%")
        relatorio.append(f"   Especificidade: {ultima.especificidade}%")
        relatorio.append(f"   Taxa FP: {ultima.taxa_fp}%")
        relatorio.append(f"   Taxa FN: {ultima.taxa_fn}%")
        
        # Evolução (últimas 5)
        if len(self.historico) >= 2:
            relatorio.append(f"\n📊 EVOLUÇÃO (Últimas {min(5, len(self.historico))} Execuções)")
            relatorio.append(f"{'Data':<12} {'Precisão':>10} {'Recall':>10} {'FP':>8} {'FN':>8}")
            relatorio.append("-"*50)
            
            for exec in self.historico[-5:]:
                data = exec.timestamp[:10]
                relatorio.append(
                    f"{data:<12} {exec.precisao_geral:>9.2f}% {exec.recall:>9.2f}% "
                    f"{exec.taxa_fp:>7.2f}% {exec.taxa_fn:>7.2f}%"
                )
        
        # Tendências
        if len(self.historico) >= 3:
            relatorio.append(f"\n📈 TENDÊNCIAS")
            
            ultimas_3 = self.historico[-3:]
            precisoes = [e.precisao_geral for e in ultimas_3]
            recalls = [e.recall for e in ultimas_3]
            fps = [e.taxa_fp for e in ultimas_3]
            
            # Calcular tendência (simples: última vs primeiras 2)
            precisao_trend = precisoes[-1] - sum(precisoes[:-1]) / 2
            recall_trend = recalls[-1] - sum(recalls[:-1]) / 2
            fp_trend = fps[-1] - sum(fps[:-1]) / 2
            
            def emoji_trend(val):
                if val > 1:
                    return "📈 Melhorando"
                elif val < -1:
                    return "📉 Piorando"
                else:
                    return "➡️ Estável"
            
            relatorio.append(f"   Precisão: {emoji_trend(precisao_trend)} ({precisao_trend:+.2f}%)")
            relatorio.append(f"   Recall: {emoji_trend(recall_trend)} ({recall_trend:+.2f}%)")
            relatorio.append(f"   Falsos Positivos: {emoji_trend(-fp_trend)} ({fp_trend:+.2f}%)")
        
        # Casos que mais erraram
        if ultima.casos_errados:
            relatorio.append(f"\n❌ CASOS MAIS PROBLEMÁTICOS (Última Execução)")
            for caso in ultima.casos_errados[:5]:
                relatorio.append(f"   • {caso['caso_id']}: {caso['titulo'][:50]}")
                relatorio.append(f"     Esperado: {caso['esperado']}, Obtido: {caso['obtido']}")
        
        # Meta de qualidade
        relatorio.append(f"\n🎯 META DE QUALIDADE")
        meta_precisao = 90.0
        meta_recall = 90.0
        meta_fp = 5.0
        
        atingiu_metas = (
            ultima.precisao_geral >= meta_precisao and
            ultima.recall >= meta_recall and
            ultima.taxa_fp <= meta_fp
        )
        
        if atingiu_metas:
            relatorio.append("   ✅ METAS ATINGIDAS!")
            relatorio.append(f"   Precisão: {ultima.precisao_geral}% (meta: ≥{meta_precisao}%)")
            relatorio.append(f"   Recall: {ultima.recall}% (meta: ≥{meta_recall}%)")
            relatorio.append(f"   Taxa FP: {ultima.taxa_fp}% (meta: ≤{meta_fp}%)")
        else:
            relatorio.append("   ⚠️ METAS NÃO ATINGIDAS")
            if ultima.precisao_geral < meta_precisao:
                delta = meta_precisao - ultima.precisao_geral
                relatorio.append(f"   Precisão: {ultima.precisao_geral}% (faltam {delta:.2f}% para meta)")
            if ultima.recall < meta_recall:
                delta = meta_recall - ultima.recall
                relatorio.append(f"   Recall: {ultima.recall}% (faltam {delta:.2f}% para meta)")
            if ultima.taxa_fp > meta_fp:
                delta = ultima.taxa_fp - meta_fp
                relatorio.append(f"   Taxa FP: {ultima.taxa_fp}% (excede meta em {delta:.2f}%)")
        
        relatorio.append("\n" + "="*80)
        
        return "\n".join(relatorio)
    
    def exportar_html(self, output_path: Optional[Path] = None) -> Path:
        """
        Exporta dashboard em HTML
        
        Args:
            output_path: Caminho para salvar HTML
        
        Returns:
            Path do arquivo gerado
        """
        if output_path is None:
            output_path = Path(__file__).parent.parent / 'tests' / 'dashboard_qualidade.html'
        
        if not self.historico:
            html = "<html><body><h1>Nenhuma execução registrada</h1></body></html>"
        else:
            ultima = self.historico[-1]
            
            # Dados para gráfico
            labels = [e.timestamp[:10] for e in self.historico[-10:]]
            precisoes = [e.precisao_geral for e in self.historico[-10:]]
            recalls = [e.recall for e in self.historico[-10:]]
            fps = [e.taxa_fp for e in self.historico[-10:]]
            
            html = f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard de Qualidade - SPED 2.0</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {{
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
        }}
        .metrics {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .metric-card {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .metric-value {{
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
        }}
        .metric-label {{
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }}
        .chart-container {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .status {{
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
        }}
        .status-excelente {{
            background-color: #10b981;
            color: white;
        }}
        .status-bom {{
            background-color: #3b82f6;
            color: white;
        }}
        .status-aceitavel {{
            background-color: #f59e0b;
            color: white;
        }}
        .status-insuficiente {{
            background-color: #ef4444;
            color: white;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Dashboard de Qualidade - SPED 2.0</h1>
        <p>Monitoramento de métricas do Golden Dataset</p>
        <p style="opacity: 0.8;">Última atualização: {ultima.timestamp}</p>
    </div>
    
    <div class="metrics">
        <div class="metric-card">
            <div class="metric-value">{ultima.precisao_geral:.1f}%</div>
            <div class="metric-label">Precisão Geral</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{ultima.recall:.1f}%</div>
            <div class="metric-label">Recall</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{ultima.especificidade:.1f}%</div>
            <div class="metric-label">Especificidade</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{ultima.taxa_fp:.1f}%</div>
            <div class="metric-label">Taxa de Falsos Positivos</div>
        </div>
    </div>
    
    <div class="chart-container">
        <h2>Evolução das Métricas</h2>
        <canvas id="metricsChart"></canvas>
    </div>
    
    <div class="chart-container">
        <h2>Status Atual</h2>
        <p>Com base na precisão geral:</p>
        <p>
            {"<span class='status status-excelente'>✅ EXCELENTE</span>" if ultima.precisao_geral == 100 else
             "<span class='status status-bom'>✅ BOM</span>" if ultima.precisao_geral >= 90 else
             "<span class='status status-aceitavel'>⚠️ ACEITÁVEL</span>" if ultima.precisao_geral >= 70 else
             "<span class='status status-insuficiente'>❌ INSUFICIENTE</span>"}
        </p>
    </div>
    
    <script>
        const ctx = document.getElementById('metricsChart').getContext('2d');
        new Chart(ctx, {{
            type: 'line',
            data: {{
                labels: {labels},
                datasets: [
                    {{
                        label: 'Precisão (%)',
                        data: {precisoes},
                        borderColor: '#667eea',
                        tension: 0.4
                    }},
                    {{
                        label: 'Recall (%)',
                        data: {recalls},
                        borderColor: '#10b981',
                        tension: 0.4
                    }},
                    {{
                        label: 'Taxa FP (%)',
                        data: {fps},
                        borderColor: '#ef4444',
                        tension: 0.4
                    }}
                ]
            }},
            options: {{
                responsive: true,
                plugins: {{
                    legend: {{
                        position: 'top',
                    }},
                    title: {{
                        display: false
                    }}
                }},
                scales: {{
                    y: {{
                        beginAtZero: true,
                        max: 100
                    }}
                }}
            }}
        }});
    </script>
</body>
</html>
"""
        
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)
            
            print(f"✅ Dashboard HTML gerado: {output_path}")
            return output_path
        
        except Exception as e:
            print(f"❌ Erro ao gerar HTML: {e}")
            return None


if __name__ == '__main__':
    # Exemplo de uso
    dashboard = DashboardQualidade()
    print(dashboard.gerar_relatorio_evolucao())

