"""
Sistema de Monitoramento de Cobertura de Regras
Registra casos não explicados pelas regras hardcoded para análise posterior
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class CasoNaoCoberto:
    """Representa uma divergência que não foi explicada pelas regras"""
    id: str
    tipo_divergencia: str
    campo: str
    cfop: Optional[str]
    cst: Optional[str]
    diferenca: float
    percentual_diferenca: float
    chave_nfe: str
    timestamp: str
    score_obtido: int
    explicacao_parcial: str
    contexto_completo: Dict[str, Any]
    
    @property
    def padrao(self) -> str:
        """Retorna padrão único para agrupamento"""
        return f"CFOP_{self.cfop or 'NA'}_CST_{self.cst or 'NA'}"
    
    @property
    def hash_padrao(self) -> str:
        """Gera hash único para este padrão"""
        dados = f"{self.cfop}-{self.cst}-{self.tipo_divergencia}-{self.campo}"
        return hashlib.md5(dados.encode()).hexdigest()[:8]


class MonitorCobertura:
    """Monitora e registra casos não cobertos pelas regras hardcoded"""
    
    def __init__(self, storage_path: str = ".taskmaster/validation_monitoring"):
        """
        Args:
            storage_path: Diretório onde os logs serão salvos
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Cache em memória durante execução
        self.casos_sessao: List[CasoNaoCoberto] = []
    
    def registrar_caso(
        self,
        tipo_divergencia: str,
        campo: str,
        cfop: Optional[str],
        cst: Optional[str],
        diferenca: float,
        percentual_diferenca: float,
        chave_nfe: str,
        score_obtido: int,
        explicacao_parcial: str,
        contexto_completo: Dict[str, Any]
    ) -> str:
        """
        Registra um caso não coberto pelas regras
        
        Returns:
            ID do caso registrado
        """
        caso = CasoNaoCoberto(
            id=f"caso_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(chave_nfe.encode()).hexdigest()[:8]}",
            tipo_divergencia=tipo_divergencia,
            campo=campo,
            cfop=cfop,
            cst=cst,
            diferenca=diferenca,
            percentual_diferenca=percentual_diferenca,
            chave_nfe=chave_nfe,
            timestamp=datetime.now().isoformat(),
            score_obtido=score_obtido,
            explicacao_parcial=explicacao_parcial,
            contexto_completo=contexto_completo
        )
        
        # Adicionar ao cache da sessão
        self.casos_sessao.append(caso)
        
        # Salvar em arquivo mensal
        self._salvar_caso(caso)
        
        # Verificar se precisa gerar alerta urgente
        self._verificar_alerta_urgente(caso)
        
        return caso.id
    
    def _salvar_caso(self, caso: CasoNaoCoberto):
        """Salva caso em arquivo JSON mensal"""
        mes_atual = datetime.now().strftime('%Y%m')
        arquivo = self.storage_path / f"casos_nao_cobertos_{mes_atual}.jsonl"
        
        with open(arquivo, 'a', encoding='utf-8') as f:
            json.dump(asdict(caso), f, ensure_ascii=False)
            f.write('\n')
    
    def _verificar_alerta_urgente(self, caso: CasoNaoCoberto):
        """
        Verifica se deve gerar alerta urgente
        Critério: 5+ casos com mesmo padrão na sessão atual
        """
        casos_similares = [
            c for c in self.casos_sessao 
            if c.padrao == caso.padrao
        ]
        
        if len(casos_similares) >= 5:
            self._gerar_alerta(caso, len(casos_similares))
    
    def _gerar_alerta(self, caso: CasoNaoCoberto, total_similares: int):
        """Gera alerta de regra faltando"""
        alerta = {
            "tipo": "REGRA_FALTANDO_OU_DESATUALIZADA",
            "timestamp": datetime.now().isoformat(),
            "padrao": caso.padrao,
            "cfop": caso.cfop,
            "cst": caso.cst,
            "tipo_divergencia": caso.tipo_divergencia,
            "campo": caso.campo,
            "ocorrencias": total_similares,
            "mensagem": f"Detectado padrão repetido não explicado: {caso.padrao}",
            "acao_sugerida": "Consultar RAG e gerar regra automática"
        }
        
        arquivo_alertas = self.storage_path / "alertas_urgentes.jsonl"
        with open(arquivo_alertas, 'a', encoding='utf-8') as f:
            json.dump(alerta, f, ensure_ascii=False)
            f.write('\n')
        
        print(f"[MONITOR] ALERTA: {total_similares} casos com padrão {caso.padrao}")
    
    def carregar_casos_mes_atual(self) -> List[CasoNaoCoberto]:
        """Carrega todos os casos do mês atual"""
        mes_atual = datetime.now().strftime('%Y%m')
        arquivo = self.storage_path / f"casos_nao_cobertos_{mes_atual}.jsonl"
        
        if not arquivo.exists():
            return []
        
        casos = []
        with open(arquivo, 'r', encoding='utf-8') as f:
            for linha in f:
                if linha.strip():
                    dados = json.loads(linha)
                    caso = CasoNaoCoberto(**dados)
                    casos.append(caso)
        
        return casos
    
    def obter_padroes_frequentes(self, min_ocorrencias: int = 3) -> Dict[str, List[CasoNaoCoberto]]:
        """
        Agrupa casos por padrão e retorna apenas os frequentes
        
        Args:
            min_ocorrencias: Mínimo de ocorrências para considerar padrão
        
        Returns:
            Dict com padrão como chave e lista de casos como valor
        """
        casos = self.carregar_casos_mes_atual()
        
        # Agrupar por padrão
        grupos: Dict[str, List[CasoNaoCoberto]] = {}
        for caso in casos:
            padrao = caso.padrao
            if padrao not in grupos:
                grupos[padrao] = []
            grupos[padrao].append(caso)
        
        # Filtrar apenas padrões frequentes
        frequentes = {
            padrao: casos
            for padrao, casos in grupos.items()
            if len(casos) >= min_ocorrencias
        }
        
        return frequentes
    
    def gerar_resumo(self) -> Dict[str, Any]:
        """Gera resumo estatístico dos casos não cobertos"""
        casos = self.carregar_casos_mes_atual()
        padroes = self.obter_padroes_frequentes(min_ocorrencias=1)
        
        return {
            "total_casos": len(casos),
            "total_padroes_unicos": len(padroes),
            "padroes_frequentes": {
                padrao: len(casos)
                for padrao, casos in sorted(
                    padroes.items(),
                    key=lambda x: len(x[1]),
                    reverse=True
                )[:10]  # Top 10
            },
            "ultima_atualizacao": datetime.now().isoformat()
        }

