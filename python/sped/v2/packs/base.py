"""
Base para Packs por Segmento
Estrutura modular e plugável para regras específicas por segmento
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any, Set
from dataclasses import dataclass, field


@dataclass
class SegmentRule:
    """Regra específica de um segmento"""
    rule_id: str
    rule_name: str
    rule_type: str  # VALIDACAO, OBRIGATORIEDADE, TOLERANCIA, EXCECAO
    rule_category: Optional[str] = None  # C100, C170, C190, etc.
    condition: Optional[str] = None
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SegmentConfig:
    """Configuração de um segmento"""
    segment_name: str
    cfops_tipicos: Set[str] = field(default_factory=set)
    cests_criticos: Set[str] = field(default_factory=set)
    tolerancias: Dict[str, float] = field(default_factory=dict)
    regras_especificas: List[SegmentRule] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class SegmentPack(ABC):
    """Classe base para packs de segmento"""
    
    def __init__(self):
        self.config = self.get_config()
    
    @abstractmethod
    def get_config(self) -> SegmentConfig:
        """Retorna a configuração do segmento"""
        pass
    
    @abstractmethod
    def get_segment_name(self) -> str:
        """Retorna o nome do segmento"""
        pass
    
    def get_cfops_tipicos(self) -> Set[str]:
        """Retorna CFOPs típicos do segmento"""
        return self.config.cfops_tipicos
    
    def get_cests_criticos(self) -> Set[str]:
        """Retorna CESTs críticos do segmento"""
        return self.config.cests_criticos
    
    def get_tolerancias(self) -> Dict[str, float]:
        """Retorna tolerâncias do segmento"""
        return self.config.tolerancias
    
    def get_regras_especificas(self) -> List[SegmentRule]:
        """Retorna regras específicas do segmento"""
        return self.config.regras_especificas
    
    def is_cfop_tipico(self, cfop: str) -> bool:
        """Verifica se um CFOP é típico do segmento"""
        return cfop in self.config.cfops_tipicos
    
    def is_cest_critico(self, cest: str) -> bool:
        """Verifica se um CEST é crítico do segmento"""
        return cest in self.config.cests_criticos
    
    def get_tolerancia(self, tipo: str, default: float = 0.0) -> float:
        """Retorna tolerância para um tipo específico"""
        return self.config.tolerancias.get(tipo, default)
    
    def apply_segment_rules(self, contexto: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Aplica regras específicas do segmento ao contexto
        
        Retorna lista de validações/regras aplicadas
        """
        resultados = []
        
        for regra in self.config.regras_especificas:
            if self._evaluate_rule(regra, contexto):
                resultados.append({
                    'rule_id': regra.rule_id,
                    'rule_name': regra.rule_name,
                    'rule_type': regra.rule_type,
                    'description': regra.description,
                    'metadata': regra.metadata
                })
        
        return resultados
    
    def _evaluate_rule(self, regra: SegmentRule, contexto: Dict[str, Any]) -> bool:
        """
        Avalia se uma regra se aplica ao contexto
        
        Por padrão, retorna True se a condição não for especificada
        Em implementações específicas, pode avaliar condições complexas
        """
        if not regra.condition:
            return True
        
        # Por enquanto, avaliação simples
        # Em produção, pode usar um engine de regras mais sofisticado
        try:
            # Avaliar condição como expressão Python simples
            # ATENÇÃO: Em produção, usar um parser seguro de expressões
            return eval(regra.condition, {"__builtins__": {}}, contexto)
        except:
            return False
    
    def get_metadata(self) -> Dict[str, Any]:
        """Retorna metadados do segmento"""
        return self.config.metadata

