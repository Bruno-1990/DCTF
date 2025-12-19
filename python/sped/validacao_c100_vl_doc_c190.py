#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Validação C100.VL_DOC x Σ(C190.VL_OPR)
Valida coerência entre o valor total do documento (C100) e a soma dos valores de operação dos resumos (C190).
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DivergenciaVL_DOC:
    """Representa uma divergência entre C100.VL_DOC e Σ(C190.VL_OPR)"""
    vl_doc_c100: float
    soma_vl_opr_c190: float
    diferenca: float
    severidade: str
    justificativa: Optional[str]  # Justificativa para diferença (rateios, arredondamento, etc.)


@dataclass
class ResultadoValidacaoC100VL_DOC:
    """Resultado da validação C100.VL_DOC x Σ(C190.VL_OPR)"""
    valido: bool
    vl_doc_c100: float
    soma_vl_opr_c190: float
    diferenca: float
    divergencias: List[DivergenciaVL_DOC]
    justificativa: Optional[str]


def somar_vl_opr_c190(c190_items: List[Dict[str, Any]]) -> float:
    """
    Soma todos os VL_OPR dos C190s vinculados ao C100
    
    Args:
        c190_items: Lista de registros C190
    
    Returns:
        Soma dos VL_OPR
    """
    total = 0.0
    
    for c190 in c190_items:
        vl_opr = float(c190.get("VL_OPR", 0) or 0)
        total += vl_opr
    
    return total


def calcular_ajuste_rateios(
    c100_record: Dict[str, Any],
    considerar_rateios: bool = True
) -> float:
    """
    Calcula ajuste considerando descontos, fretes, seguros e outros rateios documentados
    
    Args:
        c100_record: Registro C100
        considerar_rateios: Se True, considera rateios na validação
    
    Returns:
        Valor do ajuste (positivo ou negativo)
    """
    if not considerar_rateios:
        return 0.0
    
    # Descontos reduzem o valor (são subtraídos)
    vl_desc = float(c100_record.get("VL_DESC", 0) or 0)
    
    # Fretes, seguros e outros aumentam o valor (são somados)
    vl_frt = float(c100_record.get("VL_FRT", 0) or 0)
    vl_seg = float(c100_record.get("VL_SEG", 0) or 0)
    vl_out_da = float(c100_record.get("VL_OUT_DA", 0) or 0)
    
    # Ajuste = descontos - (fretes + seguros + outros)
    # Na prática, VL_DOC já deve incluir tudo, então o ajuste é zero
    # Mas podemos usar para justificar diferenças pequenas
    ajuste = vl_frt + vl_seg + vl_out_da - vl_desc
    
    return ajuste


def validar_c100_vl_doc_c190(
    c100_record: Dict[str, Any],
    c190_items: List[Dict[str, Any]],
    tolerancia: float = 0.01,
    considerar_rateios: bool = True
) -> ResultadoValidacaoC100VL_DOC:
    """
    Valida coerência entre o valor total do documento (C100) e a soma dos valores de operação dos resumos (C190)
    
    Args:
        c100_record: Registro C100
        c190_items: Lista de registros C190 vinculados ao C100
        tolerancia: Tolerância configurável para diferenças de arredondamento (em reais)
        considerar_rateios: Se True, considera rateios na validação
    
    Returns:
        ResultadoValidacaoC100VL_DOC com resultado da validação
    """
    # 1. Obter VL_DOC do C100
    vl_doc_c100 = float(c100_record.get("VL_DOC", 0) or 0)
    
    # 2. Somar VL_OPR dos C190s
    soma_vl_opr_c190 = somar_vl_opr_c190(c190_items)
    
    # 3. Calcular diferença
    diferenca = abs(vl_doc_c100 - soma_vl_opr_c190)
    
    # 4. Verificar se está dentro da tolerância
    valido = diferenca <= tolerancia
    
    # 5. Se considerar rateios, ajustar tolerância
    if considerar_rateios and not valido:
        ajuste = calcular_ajuste_rateios(c100_record, considerar_rateios)
        # Ajustar diferença considerando rateios
        diferenca_ajustada = abs(vl_doc_c100 - (soma_vl_opr_c190 + ajuste))
        if diferenca_ajustada <= tolerancia:
            valido = True
    
    # 6. Gerar justificativa se houver diferença
    justificativa = None
    if diferenca > tolerancia:
        if considerar_rateios:
            vl_desc = float(c100_record.get("VL_DESC", 0) or 0)
            vl_frt = float(c100_record.get("VL_FRT", 0) or 0)
            vl_seg = float(c100_record.get("VL_SEG", 0) or 0)
            vl_out_da = float(c100_record.get("VL_OUT_DA", 0) or 0)
            
            if vl_desc > 0 or vl_frt > 0 or vl_seg > 0 or vl_out_da > 0:
                justificativa = f"Diferença pode ser explicada por rateios: DESC={vl_desc:.2f}, FRT={vl_frt:.2f}, SEG={vl_seg:.2f}, OUT={vl_out_da:.2f}"
            else:
                justificativa = f"Diferença significativa sem justificativa aparente: {diferenca:.2f}"
        else:
            justificativa = f"Diferença significativa: {diferenca:.2f}"
    
    # 7. Criar divergências se necessário
    divergencias = []
    if not valido:
        severidade = "alta" if diferenca > 10 else ("media" if diferenca > 1 else "baixa")
        divergencias.append(DivergenciaVL_DOC(
            vl_doc_c100=vl_doc_c100,
            soma_vl_opr_c190=soma_vl_opr_c190,
            diferenca=diferenca,
            severidade=severidade,
            justificativa=justificativa
        ))
    
    return ResultadoValidacaoC100VL_DOC(
        valido=valido,
        vl_doc_c100=vl_doc_c100,
        soma_vl_opr_c190=soma_vl_opr_c190,
        diferenca=diferenca,
        divergencias=divergencias,
        justificativa=justificativa
    )


