#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de IPI
Valida consistência de totais de IPI entre C100 e C190.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DivergenciaIPI:
    """Representa uma divergência de IPI"""
    cfop: str
    cst: str
    vl_ipi_c190: float
    vl_ipi_esperado: float
    diferenca: float
    severidade: str


@dataclass
class ResultadoValidacaoIPI:
    """Resultado da validação de IPI"""
    valido: bool
    vl_ipi_c100: float
    total_ipi_c190: float
    diferenca: float
    divergencias: List[DivergenciaIPI]
    aplicavel: bool


def calcular_total_ipi_c190(c190_items: List[Dict[str, Any]]) -> float:
    """
    Calcula total de IPI dos C190s vinculados ao C100
    
    Args:
        c190_items: Lista de registros C190
    
    Returns:
        Soma dos VL_IPI
    """
    total = 0.0
    
    for c190 in c190_items:
        vl_ipi = float(c190.get("VL_IPI", 0) or 0)
        total += vl_ipi
    
    return total


def verificar_aplicabilidade_ipi(
    c190_items: List[Dict[str, Any]]
) -> bool:
    """
    Verifica se IPI é aplicável ao cenário fiscal
    
    Args:
        c190_items: Lista de registros C190
    
    Returns:
        True se IPI é aplicável
    """
    # IPI é aplicável se houver pelo menos um C190 com VL_IPI > 0
    for c190 in c190_items:
        vl_ipi = float(c190.get("VL_IPI", 0) or 0)
        if vl_ipi > 0:
            return True
    
    return False


def validar_ipi_c100_c190(
    c100_record: Dict[str, Any],
    c190_items: List[Dict[str, Any]],
    tolerancia: float = 0.01
) -> ResultadoValidacaoIPI:
    """
    Valida consistência de totais de IPI entre C100 e C190
    
    Args:
        c100_record: Registro C100
        c190_items: Lista de registros C190 vinculados ao C100
        tolerancia: Tolerância para diferenças (em reais)
    
    Returns:
        ResultadoValidacaoIPI
    """
    # 1. Obter VL_IPI do C100
    vl_ipi_c100 = float(c100_record.get("VL_IPI", 0) or 0)
    
    # 2. Calcular total de IPI dos C190s
    total_ipi_c190 = calcular_total_ipi_c190(c190_items)
    
    # 3. Verificar aplicabilidade
    aplicavel = verificar_aplicabilidade_ipi(c190_items)
    
    # 4. Se não aplicável, validação passa
    if not aplicavel and vl_ipi_c100 == 0:
        return ResultadoValidacaoIPI(
            valido=True,
            vl_ipi_c100=vl_ipi_c100,
            total_ipi_c190=total_ipi_c190,
            diferenca=0.0,
            divergencias=[],
            aplicavel=False
        )
    
    # 5. Calcular diferença
    diferenca = abs(vl_ipi_c100 - total_ipi_c190)
    
    # 6. Validar
    valido = diferenca <= tolerancia
    
    # 7. Gerar divergências se necessário
    divergencias = []
    if not valido:
        # Apontar origem das divergências por C190
        for c190 in c190_items:
            vl_ipi_c190 = float(c190.get("VL_IPI", 0) or 0)
            cfop = str(c190.get("CFOP", "")).strip()
            cst = str(c190.get("CST_ICMS", "")).strip()
            
            # Calcular diferença proporcional deste C190
            if total_ipi_c190 > 0:
                proporcao = vl_ipi_c190 / total_ipi_c190
                vl_ipi_esperado = vl_ipi_c100 * proporcao
                diferenca_item = abs(vl_ipi_c190 - vl_ipi_esperado)
            else:
                diferenca_item = diferenca
            
            if diferenca_item > tolerancia:
                severidade = "alta" if diferenca_item > 10 else ("media" if diferenca_item > 1 else "baixa")
                divergencias.append(DivergenciaIPI(
                    cfop=cfop,
                    cst=cst,
                    vl_ipi_c190=vl_ipi_c190,
                    vl_ipi_esperado=vl_ipi_c100 if total_ipi_c190 == 0 else (vl_ipi_c100 * (vl_ipi_c190 / total_ipi_c190)),
                    diferenca=diferenca_item,
                    severidade=severidade
                ))
    
    return ResultadoValidacaoIPI(
        valido=valido,
        vl_ipi_c100=vl_ipi_c100,
        total_ipi_c190=total_ipi_c190,
        diferenca=diferenca,
        divergencias=divergencias,
        aplicavel=aplicavel
    )

