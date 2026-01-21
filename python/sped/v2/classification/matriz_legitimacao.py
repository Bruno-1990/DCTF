"""
Matriz de Legitimação e Classificação
Classifica divergências como ERRO, REVISAR ou LEGÍTIMO baseado em features de contexto
"""

from typing import List, Optional, Dict, Any, Set
from decimal import Decimal
from dataclasses import dataclass, field
from enum import Enum
import logging
from pathlib import Path

from ..validation.xml_efd_validator import Divergencia
from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.item_fiscal import ItemFiscal

logger = logging.getLogger(__name__)


class Classificacao(Enum):
    """Classificação de uma divergência"""
    ERRO = "ERRO"
    REVISAR = "REVISAR"
    LEGITIMO = "LEGÍTIMO"


@dataclass
class FeaturesContexto:
    """Features de contexto extraídas de uma divergência"""
    cfop: Optional[str] = None
    cst: Optional[str] = None
    tipo_operacao: Optional[str] = None  # 0=Entrada, 1=Saída
    finalidade: Optional[str] = None
    tem_ajustes: bool = False
    tipo_tributo: Optional[str] = None  # ICMS, ICMS_ST, DIFAL, FCP, IPI
    percentual_diferenca: Optional[Decimal] = None
    valor_diferenca: Optional[Decimal] = None
    severidade_original: Optional[str] = None
    tipo_divergencia: Optional[str] = None
    segmento: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte features para dicionário"""
        return {
            'cfop': self.cfop,
            'cst': self.cst,
            'tipo_operacao': self.tipo_operacao,
            'finalidade': self.finalidade,
            'tem_ajustes': self.tem_ajustes,
            'tipo_tributo': self.tipo_tributo,
            'percentual_diferenca': float(self.percentual_diferenca) if self.percentual_diferenca else None,
            'valor_diferenca': float(self.valor_diferenca) if self.valor_diferenca else None,
            'severidade_original': self.severidade_original,
            'tipo_divergencia': self.tipo_divergencia,
            'segmento': self.segmento,
        }


@dataclass
class RegraLegitimacao:
    """Regra que identifica divergências legítimas"""
    nome: str
    descricao: str
    condicoes: Dict[str, Any]  # Condições que devem ser satisfeitas
    segmentos: Optional[List[str]] = None  # Segmentos onde a regra se aplica (None = todos)
    prioridade: int = 0  # Prioridade da regra (maior = mais prioritária)
    
    def matches(self, features: FeaturesContexto) -> bool:
        """
        Verifica se a regra corresponde às features
        
        Args:
            features: Features de contexto da divergência
        
        Returns:
            True se a regra corresponde, False caso contrário
        """
        # Verificar segmento
        if self.segmentos and features.segmento:
            if features.segmento not in self.segmentos:
                return False
        
        # Verificar condições
        for key, value in self.condicoes.items():
            feature_value = getattr(features, key, None)
            
            if value is None:
                continue  # Condição não especificada
            
            if isinstance(value, list):
                # Lista de valores aceitos
                if feature_value not in value:
                    return False
            elif isinstance(value, dict):
                # Condição complexa (ex: {'min': 0, 'max': 5})
                if 'min' in value and feature_value is not None:
                    if isinstance(feature_value, Decimal):
                        if feature_value < Decimal(str(value['min'])):
                            return False
                    elif feature_value < value['min']:
                        return False
                if 'max' in value and feature_value is not None:
                    if isinstance(feature_value, Decimal):
                        if feature_value > Decimal(str(value['max'])):
                            return False
                    elif feature_value > value['max']:
                        return False
            else:
                # Valor exato
                if feature_value != value:
                    return False
        
        return True


@dataclass
class DivergenciaClassificada:
    """Divergência com classificação"""
    divergencia: Divergencia
    classificacao: Classificacao
    features: FeaturesContexto
    regra_aplicada: Optional[RegraLegitimacao] = None
    motivo: Optional[str] = None
    score_confidence: Decimal = Decimal('0.00')  # 0-100
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte para dicionário"""
        return {
            'divergencia': {
                'tipo': self.divergencia.tipo,
                'nivel': self.divergencia.nivel,
                'severidade': self.divergencia.severidade,
                'descricao': self.divergencia.descricao,
                'valor_xml': float(self.divergencia.valor_xml) if self.divergencia.valor_xml else None,
                'valor_efd': float(self.divergencia.valor_efd) if self.divergencia.valor_efd else None,
                'diferenca': float(self.divergencia.diferenca) if self.divergencia.diferenca else None,
                'percentual_diferenca': float(self.divergencia.percentual_diferenca) if self.divergencia.percentual_diferenca else None,
            },
            'classificacao': self.classificacao.value,
            'features': self.features.to_dict(),
            'regra_aplicada': self.regra_aplicada.nome if self.regra_aplicada else None,
            'motivo': self.motivo,
            'score_confidence': float(self.score_confidence),
        }


class MatrizLegitimacao:
    """Classificador de divergências usando matriz de legitimação"""
    
    def __init__(self, segmento: Optional[str] = None):
        """
        Inicializa a matriz de legitimação
        
        Args:
            segmento: Segmento do cliente (autopeças, etc.)
        """
        self.segmento = segmento
        self.regras: List[RegraLegitimacao] = []
        self._carregar_regras_padrao()
    
    def _carregar_regras_padrao(self):
        """Carrega regras padrão de legitimação"""
        # Regras baseadas em CFOPs de devolução
        self.regras.append(RegraLegitimacao(
            nome="CFOP_Devolucao",
            descricao="CFOP de devolução - ajustes de impostos podem causar diferenças legítimas",
            condicoes={
                'cfop': ['1202', '1203', '1204', '1205', '1410', '1411', '2202', '2203', '2204', '2205', '2410', '2411'],
            },
            prioridade=10
        ))
        
        # Regras baseadas em CFOPs de brinde/bonificação
        self.regras.append(RegraLegitimacao(
            nome="CFOP_Brinde",
            descricao="CFOP de brinde/bonificação - tratamento fiscal diferenciado",
            condicoes={
                'cfop': ['5915', '5916', '6915', '6916'],
            },
            prioridade=10
        ))
        
        # Regras baseadas em CFOPs de remessa/retorno
        self.regras.append(RegraLegitimacao(
            nome="CFOP_Remessa",
            descricao="CFOP de remessa/retorno - valores podem diferir conforme natureza da operação",
            condicoes={
                'cfop': ['1411', '1414', '1415', '2411', '2414', '2415'],
            },
            prioridade=8
        ))
        
        # Regras baseadas em CFOPs de industrialização
        self.regras.append(RegraLegitimacao(
            nome="CFOP_Industrializacao",
            descricao="CFOP de industrialização - tratamento fiscal diferenciado",
            condicoes={
                'cfop': ['1151', '1152', '1153', '1154', '2151', '2152', '2153', '2154'],
            },
            prioridade=8
        ))
        
        # Regras baseadas em diferenças pequenas (arredondamento)
        self.regras.append(RegraLegitimacao(
            nome="Diferenca_Arredondamento",
            descricao="Diferença pequena - provável arredondamento",
            condicoes={
                'valor_diferenca': {'max': 0.10},
                'percentual_diferenca': {'max': 1.0},
            },
            prioridade=5
        ))
        
        # Regras baseadas em operações de entrada
        self.regras.append(RegraLegitimacao(
            nome="Operacao_Entrada",
            descricao="Operação de entrada - diferenças podem ocorrer por ajustes de crédito",
            condicoes={
                'tipo_operacao': '0',  # Entrada
            },
            prioridade=6
        ))
        
        # Regras baseadas em CST de isenção/não-incidência
        self.regras.append(RegraLegitimacao(
            nome="CST_Isencao",
            descricao="CST de isenção ou não-incidência - valores podem ser zero no EFD",
            condicoes={
                'cst': ['40', '41', '50', '60', '70'],
            },
            prioridade=7
        ))
        
        # Regras baseadas em diferenças percentuais pequenas
        self.regras.append(RegraLegitimacao(
            nome="Diferenca_Pequena_Percentual",
            descricao="Diferença percentual pequena - geralmente aceitável",
            condicoes={
                'percentual_diferenca': {'max': 5.0},
                'severidade_original': ['baixa', 'media'],
            },
            prioridade=4
        ))
    
    def extrair_features(self, divergencia: Divergencia) -> FeaturesContexto:
        """
        Extrai features de contexto de uma divergência
        
        Args:
            divergencia: Divergência a analisar
        
        Returns:
            Features de contexto extraídas
        """
        features = FeaturesContexto(
            tipo_divergencia=divergencia.tipo,
            severidade_original=divergencia.severidade,
            percentual_diferenca=divergencia.percentual_diferenca,
            valor_diferenca=divergencia.diferenca,
            segmento=self.segmento,
        )
        
        # Extrair do documento XML ou EFD
        doc = divergencia.documento_xml or divergencia.documento_efd
        if doc:
            features.tipo_operacao = doc.tipo_operacao
            features.tem_ajustes = len(doc.ajustes) > 0
        
        # Extrair do item se disponível
        item = divergencia.item_xml or divergencia.item_efd
        if item:
            features.cfop = item.cfop
            if item.icms:
                features.cst = item.icms.cst
                features.tipo_tributo = 'ICMS'
            if item.icms_st:
                features.tipo_tributo = 'ICMS_ST'
            if item.difal or item.fcp:
                features.tipo_tributo = 'DIFAL_FCP'
            if item.ipi:
                features.tipo_tributo = 'IPI'
        
        # Se não tem item, tentar extrair do documento
        if not features.cfop and doc:
            # Pegar CFOP do primeiro item
            if doc.itens:
                features.cfop = doc.itens[0].cfop
                if doc.itens[0].icms:
                    features.cst = doc.itens[0].icms.cst
        
        # Extrair do contexto da divergência
        if divergencia.contexto:
            if 'cfop' in divergencia.contexto:
                features.cfop = divergencia.contexto['cfop']
            if 'cst' in divergencia.contexto:
                features.cst = divergencia.contexto['cst']
            if 'tributo' in divergencia.contexto:
                features.tipo_tributo = divergencia.contexto['tributo']
        
        return features
    
    def classificar(self, divergencia: Divergencia) -> DivergenciaClassificada:
        """
        Classifica uma divergência como ERRO, REVISAR ou LEGÍTIMO
        
        Args:
            divergencia: Divergência a classificar
        
        Returns:
            Divergência classificada
        """
        # Extrair features
        features = self.extrair_features(divergencia)
        
        # Verificar regras de legitimação (em ordem de prioridade)
        regras_ordenadas = sorted(self.regras, key=lambda r: r.prioridade, reverse=True)
        regra_aplicada = None
        motivo = None
        
        for regra in regras_ordenadas:
            if regra.matches(features):
                regra_aplicada = regra
                motivo = regra.descricao
                break
        
        # Determinar classificação
        if regra_aplicada:
            classificacao = Classificacao.LEGITIMO
            score_confidence = Decimal('85.00')  # Alta confiança para regras de whitelist
        elif divergencia.severidade == 'alta':
            classificacao = Classificacao.ERRO
            score_confidence = Decimal('90.00')
        elif divergencia.severidade == 'media':
            classificacao = Classificacao.REVISAR
            score_confidence = Decimal('70.00')
        else:
            classificacao = Classificacao.REVISAR
            score_confidence = Decimal('60.00')
        
        # Ajustar classificação baseado em features adicionais
        if features.percentual_diferenca and features.percentual_diferenca > Decimal('10.0'):
            # Diferenças muito grandes são sempre ERRO
            if classificacao == Classificacao.LEGITIMO:
                classificacao = Classificacao.ERRO
                score_confidence = Decimal('95.00')
                motivo = "Diferença percentual muito alta (>10%) - não pode ser legítima"
        
        return DivergenciaClassificada(
            divergencia=divergencia,
            classificacao=classificacao,
            features=features,
            regra_aplicada=regra_aplicada,
            motivo=motivo,
            score_confidence=score_confidence
        )
    
    def classificar_lote(self, divergencias: List[Divergencia]) -> List[DivergenciaClassificada]:
        """
        Classifica um lote de divergências
        
        Args:
            divergencias: Lista de divergências a classificar
        
        Returns:
            Lista de divergências classificadas
        """
        return [self.classificar(div) for div in divergencias]
    
    def adicionar_regra(self, regra: RegraLegitimacao):
        """
        Adiciona uma regra de legitimação
        
        Args:
            regra: Regra a adicionar
        """
        self.regras.append(regra)
        # Reordenar por prioridade
        self.regras.sort(key=lambda r: r.prioridade, reverse=True)
    
    def carregar_regras_segmento(self, segmento: str, regras: List[RegraLegitimacao]):
        """
        Carrega regras específicas de um segmento
        
        Args:
            segmento: Nome do segmento
            regras: Lista de regras do segmento
        """
        for regra in regras:
            if not regra.segmentos:
                regra.segmentos = [segmento]
            elif segmento not in regra.segmentos:
                regra.segmentos.append(segmento)
            self.adicionar_regra(regra)
    
    def get_estatisticas(self, divergencias_classificadas: List[DivergenciaClassificada]) -> Dict[str, Any]:
        """
        Gera estatísticas das classificações
        
        Args:
            divergencias_classificadas: Lista de divergências classificadas
        
        Returns:
            Dicionário com estatísticas
        """
        total = len(divergencias_classificadas)
        if total == 0:
            return {
                'total': 0,
                'erro': 0,
                'revisar': 0,
                'legitimo': 0,
                'percentual_erro': 0.0,
                'percentual_revisar': 0.0,
                'percentual_legitimo': 0.0,
            }
        
        erro = sum(1 for d in divergencias_classificadas if d.classificacao == Classificacao.ERRO)
        revisar = sum(1 for d in divergencias_classificadas if d.classificacao == Classificacao.REVISAR)
        legitimo = sum(1 for d in divergencias_classificadas if d.classificacao == Classificacao.LEGITIMO)
        
        return {
            'total': total,
            'erro': erro,
            'revisar': revisar,
            'legitimo': legitimo,
            'percentual_erro': (erro / total * 100) if total > 0 else 0.0,
            'percentual_revisar': (revisar / total * 100) if total > 0 else 0.0,
            'percentual_legitimo': (legitimo / total * 100) if total > 0 else 0.0,
        }

