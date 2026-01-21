"""
Gerador de Plano de Correções
Gera plano estruturado de correções com antes/depois, impacto e classificação
"""

from typing import List, Dict, Any, Optional
from decimal import Decimal
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import json
import logging

from ..validation.xml_efd_validator import Divergencia
from ..classification.matriz_legitimacao import DivergenciaClassificada, Classificacao
from ..classification.score_calculator import ResultadoScore

logger = logging.getLogger(__name__)


@dataclass
class Correcao:
    """Representa uma correção a ser aplicada"""
    id: str  # ID único da correção
    chave_nfe: Optional[str] = None
    tipo: str  # 'icms', 'icms_st', 'ipi', 'valor', 'quantidade', 'tributo'
    campo: str  # Nome do campo a corrigir
    valor_antes: Decimal = Decimal('0.00')
    valor_depois: Decimal = Decimal('0.00')
    diferenca: Decimal = Decimal('0.00')
    regra_aplicada: Optional[str] = None
    score_confianca: Decimal = Decimal('0.00')
    impacto_estimado: Decimal = Decimal('0.00')  # Impacto em valores
    classificacao: str = "REVISAR"  # ERRO, REVISAR, LEGÍTIMO
    bloqueado: bool = False  # Se está bloqueado (REVISAR)
    motivo_bloqueio: Optional[str] = None
    explicacao: Optional[str] = None
    contexto: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte correção para dicionário"""
        return {
            'id': self.id,
            'chave_nfe': self.chave_nfe,
            'tipo': self.tipo,
            'campo': self.campo,
            'valor_antes': float(self.valor_antes),
            'valor_depois': float(self.valor_depois),
            'diferenca': float(self.diferenca),
            'regra_aplicada': self.regra_aplicada,
            'score_confianca': float(self.score_confianca),
            'impacto_estimado': float(self.impacto_estimado),
            'classificacao': self.classificacao,
            'bloqueado': self.bloqueado,
            'motivo_bloqueio': self.motivo_bloqueio,
            'explicacao': self.explicacao,
            'contexto': self.contexto,
        }


@dataclass
class TotaisCorrecao:
    """Totais agrupados por tipo de correção"""
    tipo: str
    quantidade: int = 0
    impacto_total: Decimal = Decimal('0.00')
    quantidade_bloqueadas: int = 0
    impacto_bloqueadas: Decimal = Decimal('0.00')
    quantidade_erro: int = 0
    quantidade_revisar: int = 0
    quantidade_legitimo: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte totais para dicionário"""
        return {
            'tipo': self.tipo,
            'quantidade': self.quantidade,
            'impacto_total': float(self.impacto_total),
            'quantidade_bloqueadas': self.quantidade_bloqueadas,
            'impacto_bloqueadas': float(self.impacto_bloqueadas),
            'quantidade_erro': self.quantidade_erro,
            'quantidade_revisar': self.quantidade_revisar,
            'quantidade_legitimo': self.quantidade_legitimo,
        }


@dataclass
class PlanoCorrecoes:
    """Plano completo de correções"""
    correcoes: List[Correcao] = field(default_factory=list)
    totais_por_tipo: Dict[str, TotaisCorrecao] = field(default_factory=dict)
    itens_bloqueados: List[Correcao] = field(default_factory=list)
    impacto_total: Decimal = Decimal('0.00')
    impacto_bloqueadas: Decimal = Decimal('0.00')
    total_correcoes: int = 0
    total_erro: int = 0
    total_revisar: int = 0
    total_legitimo: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte plano para dicionário"""
        return {
            'correcoes': [c.to_dict() for c in self.correcoes],
            'totais_por_tipo': {k: v.to_dict() for k, v in self.totais_por_tipo.items()},
            'itens_bloqueados': [c.to_dict() for c in self.itens_bloqueados],
            'impacto_total': float(self.impacto_total),
            'impacto_bloqueadas': float(self.impacto_bloqueadas),
            'total_correcoes': self.total_correcoes,
            'total_erro': self.total_erro,
            'total_revisar': self.total_revisar,
            'total_legitimo': self.total_legitimo,
            'metadata': self.metadata,
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Converte plano para JSON"""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


class PlanGenerator:
    """Gerador de planos de correções"""
    
    def __init__(self):
        """Inicializa o gerador de planos"""
        pass
    
    def gerar_plano(
        self,
        divergencias_classificadas: List[DivergenciaClassificada],
        resultados_score: Optional[List[ResultadoScore]] = None
    ) -> PlanoCorrecoes:
        """
        Gera plano de correções a partir de divergências classificadas
        
        Args:
            divergencias_classificadas: Lista de divergências classificadas
            resultados_score: Lista de resultados de score (opcional)
        
        Returns:
            Plano completo de correções
        """
        plano = PlanoCorrecoes()
        
        # Criar índice de scores por divergência
        score_index: Dict[str, ResultadoScore] = {}
        if resultados_score:
            for idx, score in enumerate(resultados_score):
                score_index[str(idx)] = score
        
        # Gerar correções
        for idx, div_class in enumerate(divergencias_classificadas):
            div = div_class.divergencia
            
            # Determinar valor antes e depois
            valor_antes = div.valor_efd if div.valor_efd else Decimal('0.00')
            valor_depois = div.valor_xml if div.valor_xml else Decimal('0.00')
            
            # Se não há valor XML, usar valor EFD como correto
            if not div.valor_xml and div.valor_efd:
                valor_depois = div.valor_efd
            
            # Calcular diferença
            diferenca = abs(valor_antes - valor_depois) if valor_antes and valor_depois else Decimal('0.00')
            
            # Obter score se disponível
            score_confianca = div_class.score_confidence
            if resultados_score and str(idx) in score_index:
                score_confianca = score_index[str(idx)].score_final
            
            # Calcular impacto estimado
            impacto_estimado = self._calcular_impacto(div, diferenca, div_class.classificacao)
            
            # Determinar se está bloqueado
            bloqueado = div_class.classificacao == Classificacao.REVISAR
            motivo_bloqueio = None
            if bloqueado:
                motivo_bloqueio = "Item classificado como REVISAR - necessita análise manual antes de aplicar correção"
            
            # Criar correção
            correcao = Correcao(
                id=f"corr_{idx}",
                chave_nfe=div.documento_xml.chave_acesso if div.documento_xml else None,
                tipo=div.tipo,
                campo=div.contexto.get('campo', div.tipo) if div.contexto else div.tipo,
                valor_antes=valor_antes,
                valor_depois=valor_depois,
                diferenca=diferenca,
                regra_aplicada=div_class.regra_aplicada.nome if div_class.regra_aplicada else None,
                score_confianca=score_confianca,
                impacto_estimado=impacto_estimado,
                classificacao=div_class.classificacao.value,
                bloqueado=bloqueado,
                motivo_bloqueio=motivo_bloqueio,
                explicacao=div_class.motivo or div.descricao,
                contexto={
                    'nivel': div.nivel,
                    'severidade': div.severidade,
                    'percentual_diferenca': float(div.percentual_diferenca) if div.percentual_diferenca else None,
                    **div.contexto
                }
            )
            
            plano.correcoes.append(correcao)
            
            # Adicionar a lista de bloqueados se necessário
            if bloqueado:
                plano.itens_bloqueados.append(correcao)
        
        # Calcular totais
        plano.totais_por_tipo = self._calcular_totais_por_tipo(plano.correcoes)
        
        # Calcular impacto total
        plano.impacto_total = sum(c.impacto_estimado for c in plano.correcoes if not c.bloqueado)
        plano.impacto_bloqueadas = sum(c.impacto_estimado for c in plano.itens_bloqueados)
        
        # Estatísticas gerais
        plano.total_correcoes = len(plano.correcoes)
        plano.total_erro = sum(1 for c in plano.correcoes if c.classificacao == "ERRO")
        plano.total_revisar = sum(1 for c in plano.correcoes if c.classificacao == "REVISAR")
        plano.total_legitimo = sum(1 for c in plano.correcoes if c.classificacao == "LEGÍTIMO")
        
        # Metadados
        plano.metadata = {
            'data_geracao': datetime.now().isoformat(),
            'total_divergencias': len(divergencias_classificadas),
            'total_correcoes_aprovadas': plano.total_correcoes - len(plano.itens_bloqueados),
            'percentual_bloqueadas': (len(plano.itens_bloqueados) / plano.total_correcoes * 100) if plano.total_correcoes > 0 else 0.0,
        }
        
        return plano
    
    def _calcular_impacto(
        self,
        divergencia: Divergencia,
        diferenca: Decimal,
        classificacao: Classificacao
    ) -> Decimal:
        """
        Calcula impacto estimado de uma correção
        
        Args:
            divergencia: Divergência original
            diferenca: Diferença entre valores
            classificacao: Classificação da divergência
        
        Returns:
            Impacto estimado
        """
        # Impacto base é a diferença absoluta
        impacto_base = diferenca
        
        # Ajustar baseado na classificação
        if classificacao == Classificacao.ERRO:
            # Erros têm impacto total
            return impacto_base
        elif classificacao == Classificacao.REVISAR:
            # Revisar tem impacto reduzido (50%)
            return impacto_base * Decimal('0.50')
        else:
            # Legítimo tem impacto zero
            return Decimal('0.00')
    
    def _calcular_totais_por_tipo(self, correcoes: List[Correcao]) -> Dict[str, TotaisCorrecao]:
        """
        Calcula totais agrupados por tipo de correção
        
        Args:
            correcoes: Lista de correções
        
        Returns:
            Dicionário com totais por tipo
        """
        totais: Dict[str, TotaisCorrecao] = {}
        
        for correcao in correcoes:
            if correcao.tipo not in totais:
                totais[correcao.tipo] = TotaisCorrecao(tipo=correcao.tipo)
            
            total = totais[correcao.tipo]
            total.quantidade += 1
            total.impacto_total += correcao.impacto_estimado
            
            if correcao.bloqueado:
                total.quantidade_bloqueadas += 1
                total.impacto_bloqueadas += correcao.impacto_estimado
            
            if correcao.classificacao == "ERRO":
                total.quantidade_erro += 1
            elif correcao.classificacao == "REVISAR":
                total.quantidade_revisar += 1
            elif correcao.classificacao == "LEGÍTIMO":
                total.quantidade_legitimo += 1
        
        return totais
    
    def filtrar_correcoes(
        self,
        plano: PlanoCorrecoes,
        filtros: Dict[str, Any]
    ) -> PlanoCorrecoes:
        """
        Filtra correções do plano baseado em critérios
        
        Args:
            plano: Plano original
            filtros: Dicionário com filtros (tipo, classificacao, bloqueado, etc.)
        
        Returns:
            Plano filtrado
        """
        correcoes_filtradas = plano.correcoes.copy()
        
        # Filtrar por tipo
        if 'tipo' in filtros:
            correcoes_filtradas = [c for c in correcoes_filtradas if c.tipo == filtros['tipo']]
        
        # Filtrar por classificação
        if 'classificacao' in filtros:
            correcoes_filtradas = [c for c in correcoes_filtradas if c.classificacao == filtros['classificacao']]
        
        # Filtrar por bloqueado
        if 'bloqueado' in filtros:
            correcoes_filtradas = [c for c in correcoes_filtradas if c.bloqueado == filtros['bloqueado']]
        
        # Filtrar por score mínimo
        if 'score_minimo' in filtros:
            score_min = Decimal(str(filtros['score_minimo']))
            correcoes_filtradas = [c for c in correcoes_filtradas if c.score_confianca >= score_min]
        
        # Criar novo plano com correções filtradas
        plano_filtrado = PlanoCorrecoes()
        plano_filtrado.correcoes = correcoes_filtradas
        plano_filtrado.totais_por_tipo = self._calcular_totais_por_tipo(correcoes_filtradas)
        plano_filtrado.itens_bloqueados = [c for c in correcoes_filtradas if c.bloqueado]
        plano_filtrado.impacto_total = sum(c.impacto_estimado for c in correcoes_filtradas if not c.bloqueado)
        plano_filtrado.impacto_bloqueadas = sum(c.impacto_estimado for c in plano_filtrado.itens_bloqueados)
        plano_filtrado.total_correcoes = len(correcoes_filtradas)
        plano_filtrado.total_erro = sum(1 for c in correcoes_filtradas if c.classificacao == "ERRO")
        plano_filtrado.total_revisar = sum(1 for c in correcoes_filtradas if c.classificacao == "REVISAR")
        plano_filtrado.total_legitimo = sum(1 for c in correcoes_filtradas if c.classificacao == "LEGÍTIMO")
        plano_filtrado.metadata = {**plano.metadata, 'filtrado': True, 'filtros_aplicados': filtros}
        
        return plano_filtrado

