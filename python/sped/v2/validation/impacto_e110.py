#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validador de Impacto E110 - Calcula impacto real das divergências na apuração
Conforme roteiro item 4.3: "A divergência é PRIORIDADE quando altera a apuração do período"
"""

from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ImpactoE110:
    """Resultado do cálculo de impacto na apuração E110"""
    divergencia_id: str
    impacto_debitos: Decimal  # Impacto em VL_TOT_DEBITOS
    impacto_creditos: Decimal  # Impacto em VL_TOT_CREDITOS
    impacto_saldo_apurado: Decimal  # Impacto em VL_SLD_APURADO
    impacto_icms_recolher: Decimal  # Impacto em VL_ICMS_RECOLHER
    altera_apuracao: bool  # Se altera significativamente a apuração
    prioridade: str  # 'ALTA', 'MEDIA', 'BAIXA'
    explicacao: str
    metadata: Dict[str, Any]


class ValidadorImpactoE110:
    """
    Valida impacto real de divergências na apuração E110
    
    Conforme roteiro:
    - Divergência com impacto na apuração = PRIORIDADE
    - Divergência sem impacto = Baixa prioridade ou "Revisar"
    """
    
    def __init__(self, tolerancia_minima: Decimal = Decimal('0.50')):
        """
        Inicializa validador
        
        Args:
            tolerancia_minima: Tolerância mínima para considerar impacto relevante
        """
        self.tolerancia_minima = tolerancia_minima
    
    def calcular_impacto(
        self,
        divergencia: Any,
        e110_original: Optional[Any] = None,
        perfil_fiscal: Optional[Dict[str, Any]] = None
    ) -> ImpactoE110:
        """
        Calcula impacto de uma divergência na apuração E110
        
        Args:
            divergencia: Objeto Divergencia
            e110_original: Registro E110 original (se disponível)
            perfil_fiscal: Perfil fiscal do cliente
        
        Returns:
            ImpactoE110 com cálculos de impacto
        """
        try:
            # Extrair informações da divergência
            diferenca = divergencia.diferenca or Decimal('0')
            tipo = divergencia.tipo
            contexto = divergencia.contexto or {}
            
            # Determinar se é entrada ou saída
            tpNF = contexto.get('tpNF', '1')  # '0'=Entrada, '1'=Saída
            is_saida = tpNF == '1'
            
            # Determinar se é ICMS próprio ou ST
            tem_st = contexto.get('tem_st', False)
            cst = contexto.get('cst', '')
            
            # Calcular impactos
            impacto_debitos = Decimal('0')
            impacto_creditos = Decimal('0')
            impacto_saldo_apurado = Decimal('0')
            impacto_icms_recolher = Decimal('0')
            
            explicacao_parts = []
            
            # Lógica de cálculo baseada no tipo de divergência
            if 'icms' in tipo.lower() and not tem_st:
                # Divergência em ICMS próprio
                if is_saida:
                    # Saída = débito de ICMS
                    impacto_debitos = abs(diferenca)
                    impacto_saldo_apurado = -abs(diferenca)  # Mais débito = menos saldo
                    impacto_icms_recolher = abs(diferenca)  # Mais a recolher
                    explicacao_parts.append(f"Saída: divergência de ICMS afeta débitos (+{impacto_debitos:.2f})")
                else:
                    # Entrada = crédito de ICMS
                    impacto_creditos = abs(diferenca)
                    impacto_saldo_apurado = abs(diferenca)  # Mais crédito = mais saldo
                    impacto_icms_recolher = -abs(diferenca)  # Menos a recolher
                    explicacao_parts.append(f"Entrada: divergência de ICMS afeta créditos (+{impacto_creditos:.2f})")
            
            elif 'st' in tipo.lower() or tem_st:
                # ICMS ST não afeta E110 diretamente (é recolhido por substituição)
                explicacao_parts.append("ICMS ST: não afeta E110 (recolhimento por ST)")
            
            elif 'valor_total' in tipo.lower() or 'valor_produtos' in tipo.lower():
                # Divergência de valor total pode indicar erro na base de cálculo
                # Estimar impacto proporcional (assumir alíquota média de 12%)
                aliquota_estimada = Decimal('0.12')
                
                if is_saida:
                    impacto_debitos = abs(diferenca) * aliquota_estimada
                    impacto_saldo_apurado = -abs(diferenca) * aliquota_estimada
                    impacto_icms_recolher = abs(diferenca) * aliquota_estimada
                    explicacao_parts.append(f"Valor total (saída): impacto estimado em débitos (±{impacto_debitos:.2f})")
                else:
                    impacto_creditos = abs(diferenca) * aliquota_estimada
                    impacto_saldo_apurado = abs(diferenca) * aliquota_estimada
                    impacto_icms_recolher = -abs(diferenca) * aliquota_estimada
                    explicacao_parts.append(f"Valor total (entrada): impacto estimado em créditos (±{impacto_creditos:.2f})")
            
            elif 'totalizacao' in tipo.lower():
                # Divergências de totalização têm impacto direto e alto
                # Assumir que a diferença é diretamente em ICMS
                cadeia = contexto.get('cadeia', '')
                
                if 'c100' in cadeia.lower() and 'e110' in cadeia.lower():
                    # C100→E110: impacto direto no período
                    impacto_saldo_apurado = abs(diferenca)
                    impacto_icms_recolher = abs(diferenca)
                    explicacao_parts.append(f"Totalização {cadeia}: impacto direto na apuração")
                else:
                    # Outras cadeias: impacto indireto
                    impacto_saldo_apurado = abs(diferenca)
                    explicacao_parts.append(f"Totalização {cadeia}: impacto indireto")
            
            # Calcular se altera significativamente a apuração
            impacto_total = abs(impacto_debitos) + abs(impacto_creditos) + abs(impacto_saldo_apurado)
            altera_apuracao = impacto_total > self.tolerancia_minima
            
            # Determinar prioridade
            if impacto_total > Decimal('100.00'):
                prioridade = 'ALTA'
            elif impacto_total > Decimal('10.00'):
                prioridade = 'MEDIA'
            else:
                prioridade = 'BAIXA'
            
            # Se não altera apuração significativamente, reduzir prioridade
            if not altera_apuracao:
                prioridade = 'BAIXA'
                explicacao_parts.append(f"Impacto < tolerância ({self.tolerancia_minima})")
            
            # Se E110 original disponível, calcular percentual de impacto
            if e110_original:
                icms_recolher_original = e110_original.vl_icms_recolher or Decimal('0')
                if icms_recolher_original > 0:
                    percentual_impacto = (abs(impacto_icms_recolher) / icms_recolher_original) * Decimal('100')
                    explicacao_parts.append(f"Impacto {percentual_impacto:.2f}% do ICMS a recolher")
                    
                    # Ajustar prioridade baseado no percentual
                    if percentual_impacto > Decimal('10'):
                        prioridade = 'ALTA'
                    elif percentual_impacto > Decimal('2'):
                        if prioridade == 'BAIXA':
                            prioridade = 'MEDIA'
            
            explicacao = "; ".join(explicacao_parts)
            
            return ImpactoE110(
                divergencia_id=getattr(divergencia, 'id', ''),
                impacto_debitos=impacto_debitos,
                impacto_creditos=impacto_creditos,
                impacto_saldo_apurado=impacto_saldo_apurado,
                impacto_icms_recolher=impacto_icms_recolher,
                altera_apuracao=altera_apuracao,
                prioridade=prioridade,
                explicacao=explicacao,
                metadata={
                    'tipo_divergencia': tipo,
                    'diferenca_original': float(diferenca),
                    'impacto_total': float(impacto_total),
                    'is_saida': is_saida,
                    'tem_st': tem_st,
                }
            )
            
        except Exception as e:
            logger.error(f"Erro ao calcular impacto E110: {e}", exc_info=True)
            # Retornar impacto neutro em caso de erro
            return ImpactoE110(
                divergencia_id=getattr(divergencia, 'id', ''),
                impacto_debitos=Decimal('0'),
                impacto_creditos=Decimal('0'),
                impacto_saldo_apurado=Decimal('0'),
                impacto_icms_recolher=Decimal('0'),
                altera_apuracao=False,
                prioridade='BAIXA',
                explicacao=f"Erro ao calcular impacto: {str(e)}",
                metadata={'erro': str(e)}
            )
    
    def calcular_impactos_lote(
        self,
        divergencias: List[Any],
        e110_original: Optional[Any] = None,
        perfil_fiscal: Optional[Dict[str, Any]] = None
    ) -> List[ImpactoE110]:
        """
        Calcula impacto de múltiplas divergências
        
        Args:
            divergencias: Lista de divergências
            e110_original: Registro E110 original
            perfil_fiscal: Perfil fiscal do cliente
        
        Returns:
            Lista de ImpactoE110
        """
        impactos = []
        
        for div in divergencias:
            impacto = self.calcular_impacto(div, e110_original, perfil_fiscal)
            impactos.append(impacto)
        
        return impactos
    
    def priorizar_divergencias(
        self,
        divergencias: List[Any],
        e110_original: Optional[Any] = None,
        perfil_fiscal: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Any], List[Any], List[Any]]:
        """
        Prioriza divergências baseado no impacto E110
        
        Args:
            divergencias: Lista de divergências
            e110_original: Registro E110 original
            perfil_fiscal: Perfil fiscal do cliente
        
        Returns:
            Tupla (alta_prioridade, media_prioridade, baixa_prioridade)
        """
        alta = []
        media = []
        baixa = []
        
        for div in divergencias:
            impacto = self.calcular_impacto(div, e110_original, perfil_fiscal)
            
            # Adicionar informações de impacto ao contexto da divergência
            if not hasattr(div, 'contexto'):
                div.contexto = {}
            
            div.contexto.update({
                'impacto_e110': {
                    'impacto_debitos': float(impacto.impacto_debitos),
                    'impacto_creditos': float(impacto.impacto_creditos),
                    'impacto_saldo_apurado': float(impacto.impacto_saldo_apurado),
                    'impacto_icms_recolher': float(impacto.impacto_icms_recolher),
                    'altera_apuracao': impacto.altera_apuracao,
                    'prioridade': impacto.prioridade,
                    'explicacao': impacto.explicacao,
                }
            })
            
            # Classificar
            if impacto.prioridade == 'ALTA':
                alta.append(div)
            elif impacto.prioridade == 'MEDIA':
                media.append(div)
            else:
                baixa.append(div)
        
        logger.info(f"Priorização E110: {len(alta)} ALTA, {len(media)} MEDIA, {len(baixa)} BAIXA")
        
        return (alta, media, baixa)


if __name__ == '__main__':
    # Teste standalone
    print("✅ ValidadorImpactoE110 criado com sucesso")

