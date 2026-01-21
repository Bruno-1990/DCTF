"""
Guardrails - Sistema de Proteção para Aplicação de Correções
Verifica condições antes de aplicar correções para garantir segurança
"""

from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from dataclasses import dataclass, field
import logging

from .plan_generator import Correcao, PlanoCorrecoes

logger = logging.getLogger(__name__)


@dataclass
class ResultadoGuardrail:
    """Resultado da verificação de guardrail"""
    permitido: bool
    motivo: Optional[str] = None
    avisos: List[str] = field(default_factory=list)
    bloqueios: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'permitido': self.permitido,
            'motivo': self.motivo,
            'avisos': self.avisos,
            'bloqueios': self.bloqueios,
        }


class Guardrails:
    """Sistema de guardrails para proteção na aplicação de correções"""
    
    # Limites de segurança
    LIMITE_DIFERENCA_PERCENTUAL = Decimal('50.00')  # 50% de diferença máxima
    LIMITE_DIFERENCA_ABSOLUTA = Decimal('10000.00')  # R$ 10.000,00 máximo
    SCORE_MINIMO_APROVACAO = Decimal('70.00')  # Score mínimo para aprovação automática
    
    def __init__(
        self,
        limite_diferenca_percentual: Decimal = LIMITE_DIFERENCA_PERCENTUAL,
        limite_diferenca_absoluta: Decimal = LIMITE_DIFERENCA_ABSOLUTA,
        score_minimo: Decimal = SCORE_MINIMO_APROVACAO
    ):
        """
        Inicializa o sistema de guardrails
        
        Args:
            limite_diferenca_percentual: Limite máximo de diferença percentual permitida
            limite_diferenca_absoluta: Limite máximo de diferença absoluta permitida
            score_minimo: Score mínimo para aprovação automática
        """
        self.limite_diferenca_percentual = limite_diferenca_percentual
        self.limite_diferenca_absoluta = limite_diferenca_absoluta
        self.score_minimo = score_minimo
    
    def verificar_correcao(self, correcao: Correcao) -> ResultadoGuardrail:
        """
        Verifica se uma correção pode ser aplicada
        
        Args:
            correcao: Correção a verificar
        
        Returns:
            Resultado da verificação
        """
        resultado = ResultadoGuardrail(permitido=True)
        
        # 1. Verificar se está bloqueado
        if correcao.bloqueado:
            resultado.permitido = False
            resultado.motivo = correcao.motivo_bloqueio or "Correção bloqueada (classificada como REVISAR)"
            resultado.bloqueios.append("Item bloqueado - necessita análise manual")
            return resultado
        
        # 2. Verificar classificação
        if correcao.classificacao == "LEGÍTIMO":
            resultado.permitido = False
            resultado.motivo = "Correção classificada como LEGÍTIMO - não deve ser aplicada"
            resultado.bloqueios.append("Divergência legítima - não requer correção")
            return resultado
        
        # 3. Verificar diferença percentual
        if correcao.valor_antes > 0:
            diferenca_percentual = abs((correcao.diferenca / correcao.valor_antes) * 100)
            if diferenca_percentual > self.limite_diferenca_percentual:
                resultado.permitido = False
                resultado.motivo = f"Diferença percentual muito alta ({diferenca_percentual:.2f}%) - excede limite de {self.limite_diferenca_percentual}%"
                resultado.bloqueios.append(f"Diferença percentual: {diferenca_percentual:.2f}%")
                return resultado
            elif diferenca_percentual > self.limite_diferenca_percentual * Decimal('0.8'):
                resultado.avisos.append(f"Diferença percentual alta: {diferenca_percentual:.2f}%")
        
        # 4. Verificar diferença absoluta
        if correcao.diferenca > self.limite_diferenca_absoluta:
            resultado.permitido = False
            resultado.motivo = f"Diferença absoluta muito alta (R$ {correcao.diferenca:.2f}) - excede limite de R$ {self.limite_diferenca_absoluta:.2f}"
            resultado.bloqueios.append(f"Diferença absoluta: R$ {correcao.diferenca:.2f}")
            return resultado
        elif correcao.diferenca > self.limite_diferenca_absoluta * Decimal('0.8'):
            resultado.avisos.append(f"Diferença absoluta alta: R$ {correcao.diferenca:.2f}")
        
        # 5. Verificar score de confiança
        if correcao.score_confianca < self.score_minimo:
            resultado.avisos.append(f"Score de confiança baixo: {correcao.score_confianca:.2f} (mínimo recomendado: {self.score_minimo:.2f})")
            # Não bloqueia, mas avisa
        
        # 6. Verificar se há regra aplicada
        if not correcao.regra_aplicada:
            resultado.avisos.append("Nenhuma regra de legitimação aplicada - verificar manualmente")
        
        # 7. Verificar valores negativos
        if correcao.valor_depois < 0:
            resultado.permitido = False
            resultado.motivo = "Valor após correção seria negativo - não permitido"
            resultado.bloqueios.append("Valor negativo não permitido")
            return resultado
        
        return resultado
    
    def verificar_plano(self, plano: PlanoCorrecoes) -> Dict[str, ResultadoGuardrail]:
        """
        Verifica todas as correções de um plano
        
        Args:
            plano: Plano de correções
        
        Returns:
            Dicionário {id_correcao: resultado_guardrail}
        """
        resultados: Dict[str, ResultadoGuardrail] = {}
        
        for correcao in plano.correcoes:
            resultados[correcao.id] = self.verificar_correcao(correcao)
        
        return resultados
    
    def filtrar_correcoes_permitidas(
        self,
        plano: PlanoCorrecoes
    ) -> PlanoCorrecoes:
        """
        Filtra plano para incluir apenas correções permitidas pelos guardrails
        
        Args:
            plano: Plano original
        
        Returns:
            Plano filtrado com apenas correções permitidas
        """
        resultados = self.verificar_plano(plano)
        
        correcoes_permitidas = [
            correcao for correcao in plano.correcoes
            if resultados[correcao.id].permitido
        ]
        
        # Criar novo plano com correções permitidas
        plano_filtrado = PlanoCorrecoes()
        plano_filtrado.correcoes = correcoes_permitidas
        plano_filtrado.totais_por_tipo = plano.totais_por_tipo  # Recalcular depois se necessário
        plano_filtrado.itens_bloqueados = [c for c in correcoes_permitidas if c.bloqueado]
        plano_filtrado.impacto_total = sum(c.impacto_estimado for c in correcoes_permitidas if not c.bloqueado)
        plano_filtrado.impacto_bloqueadas = sum(c.impacto_estimado for c in plano_filtrado.itens_bloqueados)
        plano_filtrado.total_correcoes = len(correcoes_permitidas)
        plano_filtrado.total_erro = sum(1 for c in correcoes_permitidas if c.classificacao == "ERRO")
        plano_filtrado.total_revisar = sum(1 for c in correcoes_permitidas if c.classificacao == "REVISAR")
        plano_filtrado.total_legitimo = sum(1 for c in correcoes_permitidas if c.classificacao == "LEGÍTIMO")
        plano_filtrado.metadata = {
            **plano.metadata,
            'total_bloqueadas_guardrails': len(plano.correcoes) - len(correcoes_permitidas),
            'resultados_guardrails': {k: v.to_dict() for k, v in resultados.items()}
        }
        
        return plano_filtrado
    
    def get_estatisticas_guardrails(
        self,
        resultados: Dict[str, ResultadoGuardrail]
    ) -> Dict[str, Any]:
        """
        Gera estatísticas dos guardrails
        
        Args:
            resultados: Resultados das verificações
        
        Returns:
            Dicionário com estatísticas
        """
        total = len(resultados)
        permitidas = sum(1 for r in resultados.values() if r.permitido)
        bloqueadas = total - permitidas
        com_avisos = sum(1 for r in resultados.values() if r.avisos)
        
        return {
            'total_verificadas': total,
            'permitidas': permitidas,
            'bloqueadas': bloqueadas,
            'com_avisos': com_avisos,
            'percentual_permitidas': (permitidas / total * 100) if total > 0 else 0.0,
            'percentual_bloqueadas': (bloqueadas / total * 100) if total > 0 else 0.0,
        }

