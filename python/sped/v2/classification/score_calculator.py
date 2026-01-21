"""
Score de Confiança - Calculador de Score para Divergências
Calcula score de confiança (0-100) para cada divergência baseado em múltiplos fatores
"""

from typing import Dict, Any, Optional
from decimal import Decimal
from dataclasses import dataclass, field
import logging

from ..validation.xml_efd_validator import Divergencia
from .matriz_legitimacao import FeaturesContexto, DivergenciaClassificada, Classificacao

logger = logging.getLogger(__name__)


@dataclass
class FatoresScore:
    """Fatores individuais que compõem o score"""
    match: Decimal = Decimal('0.00')  # Qualidade do match (0-100)
    impacto: Decimal = Decimal('0.00')  # Impacto da divergência (0-100)
    ajustes: Decimal = Decimal('0.00')  # Presença de ajustes (0-100)
    cfop: Decimal = Decimal('0.00')  # Tipo de CFOP (0-100)
    st: Decimal = Decimal('0.00')  # Substituição tributária (0-100)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte fatores para dicionário"""
        return {
            'match': float(self.match),
            'impacto': float(self.impacto),
            'ajustes': float(self.ajustes),
            'cfop': float(self.cfop),
            'st': float(self.st),
        }


@dataclass
class ResultadoScore:
    """Resultado do cálculo de score"""
    score_final: Decimal  # 0-100
    fatores: FatoresScore
    classificacao_sugerida: Classificacao
    explicacao: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'score_final': float(self.score_final),
            'fatores': self.fatores.to_dict(),
            'classificacao_sugerida': self.classificacao_sugerida.value,
            'explicacao': self.explicacao,
        }


class ScoreCalculator:
    """Calculador de score de confiança para divergências"""
    
    # Pesos dos fatores
    PESO_MATCH = Decimal('0.30')
    PESO_IMPACTO = Decimal('0.35')
    PESO_AJUSTES = Decimal('0.10')
    PESO_CFOP = Decimal('0.15')
    PESO_ST = Decimal('0.10')
    
    # Limiares de classificação
    LIMIAR_ERRO = Decimal('80.00')
    LIMIAR_REVISAR = Decimal('50.00')
    
    def __init__(self):
        """Inicializa o calculador de score"""
        pass
    
    def calcular_score(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> ResultadoScore:
        """
        Calcula score de confiança para uma divergência
        
        Args:
            divergencia: Divergência a avaliar
            features: Features de contexto da divergência
        
        Returns:
            Resultado do cálculo de score
        """
        # Calcular fatores individuais
        fatores = FatoresScore()
        
        fatores.match = self._calcular_fator_match(divergencia, features)
        fatores.impacto = self._calcular_fator_impacto(divergencia, features)
        fatores.ajustes = self._calcular_fator_ajustes(divergencia, features)
        fatores.cfop = self._calcular_fator_cfop(divergencia, features)
        fatores.st = self._calcular_fator_st(divergencia, features)
        
        # Calcular score final (média ponderada)
        score_final = (
            fatores.match * self.PESO_MATCH +
            fatores.impacto * self.PESO_IMPACTO +
            fatores.ajustes * self.PESO_AJUSTES +
            fatores.cfop * self.PESO_CFOP +
            fatores.st * self.PESO_ST
        )
        
        # Garantir que score está entre 0 e 100
        score_final = max(Decimal('0.00'), min(Decimal('100.00'), score_final))
        
        # Determinar classificação sugerida
        if score_final >= self.LIMIAR_ERRO:
            classificacao_sugerida = Classificacao.ERRO
        elif score_final >= self.LIMIAR_REVISAR:
            classificacao_sugerida = Classificacao.REVISAR
        else:
            classificacao_sugerida = Classificacao.LEGITIMO
        
        # Gerar explicação
        explicacao = self._gerar_explicacao(score_final, fatores, classificacao_sugerida)
        
        return ResultadoScore(
            score_final=score_final,
            fatores=fatores,
            classificacao_sugerida=classificacao_sugerida,
            explicacao=explicacao
        )
    
    def _calcular_fator_match(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> Decimal:
        """
        Calcula fator de qualidade do match
        
        Args:
            divergencia: Divergência
            features: Features de contexto
        
        Returns:
            Score do fator match (0-100)
        """
        # Se há documento correspondente, match é bom
        if divergencia.documento_xml and divergencia.documento_efd:
            # Match perfeito por chave
            if divergencia.documento_xml.chave_acesso and divergencia.documento_efd.chave_acesso:
                if divergencia.documento_xml.chave_acesso == divergencia.documento_efd.chave_acesso:
                    return Decimal('100.00')
                else:
                    return Decimal('70.00')  # Match por outros critérios
            else:
                return Decimal('60.00')  # Match sem chave
        elif divergencia.documento_xml or divergencia.documento_efd:
            return Decimal('30.00')  # Match parcial
        else:
            return Decimal('0.00')  # Sem match
    
    def _calcular_fator_impacto(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> Decimal:
        """
        Calcula fator de impacto da divergência
        
        Args:
            divergencia: Divergência
            features: Features de contexto
        
        Returns:
            Score do fator impacto (0-100)
        """
        # Impacto baseado na severidade original
        if divergencia.severidade == 'alta':
            base_score = Decimal('90.00')
        elif divergencia.severidade == 'media':
            base_score = Decimal('60.00')
        else:
            base_score = Decimal('30.00')
        
        # Ajustar baseado no percentual de diferença
        if features.percentual_diferenca:
            if features.percentual_diferenca > Decimal('10.0'):
                # Diferenças muito grandes aumentam impacto
                base_score = min(Decimal('100.00'), base_score + Decimal('10.00'))
            elif features.percentual_diferenca < Decimal('1.0'):
                # Diferenças pequenas reduzem impacto
                base_score = max(Decimal('0.00'), base_score - Decimal('20.00'))
        
        # Ajustar baseado no valor absoluto da diferença
        if features.valor_diferenca:
            if features.valor_diferenca > Decimal('1000.00'):
                # Diferenças grandes em valores absolutos
                base_score = min(Decimal('100.00'), base_score + Decimal('5.00'))
            elif features.valor_diferenca < Decimal('0.10'):
                # Diferenças muito pequenas (arredondamento)
                base_score = max(Decimal('0.00'), base_score - Decimal('30.00'))
        
        # Tipo de divergência afeta impacto
        if divergencia.tipo == 'operacao_ausente':
            base_score = Decimal('95.00')  # Operação ausente é sempre alto impacto
        elif divergencia.tipo == 'tributo':
            base_score = min(Decimal('100.00'), base_score + Decimal('5.00'))
        
        return max(Decimal('0.00'), min(Decimal('100.00'), base_score))
    
    def _calcular_fator_ajustes(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> Decimal:
        """
        Calcula fator de ajustes (presença de ajustes reduz score)
        
        Args:
            divergencia: Divergência
            features: Features de contexto
        
        Returns:
            Score do fator ajustes (0-100)
        """
        if features.tem_ajustes:
            # Ajustes podem explicar divergências, reduzindo score
            return Decimal('30.00')
        else:
            # Sem ajustes, divergência é mais suspeita
            return Decimal('80.00')
    
    def _calcular_fator_cfop(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> Decimal:
        """
        Calcula fator baseado no tipo de CFOP
        
        Args:
            divergencia: Divergência
            features: Features de contexto
        
        Returns:
            Score do fator CFOP (0-100)
        """
        if not features.cfop:
            return Decimal('70.00')  # Sem CFOP, score neutro
        
        cfop = str(features.cfop).strip()
        
        # CFOPs de devolução, brinde, remessa reduzem score (são mais legítimos)
        cfops_legitimos = [
            '1202', '1203', '1204', '1205', '1410', '1411',  # Devolução
            '2202', '2203', '2204', '2205', '2410', '2411',  # Devolução
            '5915', '5916', '6915', '6916',  # Brinde
            '1411', '1414', '1415', '2411', '2414', '2415',  # Remessa
            '1151', '1152', '1153', '1154',  # Industrialização
            '2151', '2152', '2153', '2154',  # Industrialização
        ]
        
        if cfop in cfops_legitimos:
            return Decimal('20.00')  # CFOPs legítimos reduzem score
        
        # CFOPs de entrada (5xxx, 6xxx) podem ter diferenças legítimas
        if cfop.startswith('5') or cfop.startswith('6'):
            return Decimal('50.00')
        
        # CFOPs normais (1xxx, 2xxx) são mais críticos
        if cfop.startswith('1') or cfop.startswith('2'):
            return Decimal('80.00')
        
        return Decimal('70.00')  # Score neutro para outros CFOPs
    
    def _calcular_fator_st(
        self,
        divergencia: Divergencia,
        features: FeaturesContexto
    ) -> Decimal:
        """
        Calcula fator baseado em substituição tributária
        
        Args:
            divergencia: Divergência
            features: Features de contexto
        
        Returns:
            Score do fator ST (0-100)
        """
        # Se há ICMS ST, divergências são mais comuns (reduz score)
        if features.tipo_tributo == 'ICMS_ST':
            return Decimal('30.00')
        
        # Se há DIFAL/FCP, também pode ter diferenças legítimas
        if features.tipo_tributo == 'DIFAL_FCP':
            return Decimal('40.00')
        
        # ICMS próprio é mais crítico
        if features.tipo_tributo == 'ICMS':
            return Decimal('80.00')
        
        # IPI também é crítico
        if features.tipo_tributo == 'IPI':
            return Decimal('75.00')
        
        return Decimal('70.00')  # Score neutro
    
    def _gerar_explicacao(
        self,
        score_final: Decimal,
        fatores: FatoresScore,
        classificacao: Classificacao
    ) -> str:
        """
        Gera explicação do score
        
        Args:
            score_final: Score final calculado
            fatores: Fatores individuais
            classificacao: Classificação sugerida
        
        Returns:
            Explicação em texto
        """
        explicacoes = []
        
        # Explicar fatores principais
        if fatores.impacto > Decimal('80.00'):
            explicacoes.append("Alto impacto da divergência")
        elif fatores.impacto < Decimal('40.00'):
            explicacoes.append("Baixo impacto da divergência")
        
        if fatores.match < Decimal('50.00'):
            explicacoes.append("Match de baixa qualidade")
        
        if fatores.ajustes < Decimal('40.00'):
            explicacoes.append("Presença de ajustes fiscais")
        
        if fatores.cfop < Decimal('40.00'):
            explicacoes.append("CFOP que permite diferenças legítimas")
        
        if fatores.st < Decimal('40.00'):
            explicacoes.append("Substituição tributária presente")
        
        # Explicar classificação
        if classificacao == Classificacao.ERRO:
            explicacoes.append("Classificação: ERRO (divergência grave)")
        elif classificacao == Classificacao.REVISAR:
            explicacoes.append("Classificação: REVISAR (necessita análise)")
        else:
            explicacoes.append("Classificação: LEGÍTIMO (divergência aceitável)")
        
        return ". ".join(explicacoes) if explicacoes else f"Score: {score_final:.2f}"
    
    def ajustar_score_por_classificacao(
        self,
        score_base: Decimal,
        classificacao: Classificacao
    ) -> Decimal:
        """
        Ajusta score base baseado na classificação da matriz de legitimação
        
        Args:
            score_base: Score base calculado
            classificacao: Classificação da matriz de legitimação
        
        Returns:
            Score ajustado
        """
        if classificacao == Classificacao.LEGITIMO:
            # Se foi classificado como legítimo, reduzir score
            return max(Decimal('0.00'), score_base - Decimal('30.00'))
        elif classificacao == Classificacao.ERRO:
            # Se foi classificado como erro, aumentar score
            return min(Decimal('100.00'), score_base + Decimal('10.00'))
        else:
            # REVISAR mantém score
            return score_base

