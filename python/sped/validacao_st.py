#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Substituição Tributária (ST)
Valida tratamento correto de ICMS ST.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ICMSDistinguido:
    """ICMS próprio e ST distinguidos"""
    icms_proprio: float
    icms_st: float
    base_icms_proprio: float
    base_icms_st: float


@dataclass
class ResultadoSTSemCredito:
    """Resultado da identificação de ST sem crédito"""
    st_sem_credito: bool
    motivo: Optional[str]


@dataclass
class ResultadoCalculoST:
    """Resultado da validação de cálculo de ST"""
    valido: bool
    st_calculado: float
    st_informado: float
    diferenca: float


@dataclass
class ResultadoValidacaoST:
    """Resultado da validação de ST"""
    valido: bool
    exige_bloco_substituto: bool
    divergencias: List[str]


def distinguir_icms_proprio_st(c170_item: Dict[str, Any]) -> ICMSDistinguido:
    """
    Distingue ICMS próprio vs ICMS ST
    
    Args:
        c170_item: Registro C170
    
    Returns:
        ICMSDistinguido
    """
    vl_icms = float(c170_item.get("VL_ICMS", 0) or 0)
    vl_icms_st = float(c170_item.get("VL_ICMS_ST", 0) or 0)
    vl_bc_icms = float(c170_item.get("VL_BC_ICMS", 0) or 0)
    vl_bc_icms_st = float(c170_item.get("VL_BC_ICMS_ST", 0) or 0)
    
    return ICMSDistinguido(
        icms_proprio=vl_icms,
        icms_st=vl_icms_st,
        base_icms_proprio=vl_bc_icms,
        base_icms_st=vl_bc_icms_st
    )


def validar_st_contribuinte_substituido(
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]],
    tem_bloco_substituto: bool
) -> ResultadoValidacaoST:
    """
    Valida tratamento para contribuinte apenas substituído
    
    Args:
        c100_record: Registro C100
        c170_items: Lista de C170s
        tem_bloco_substituto: Se tem bloco/fechamentos de substituto
    
    Returns:
        ResultadoValidacaoST
    """
    divergencias = []
    
    # Verificar se há ST nos itens
    tem_st = any(
        float(item.get("VL_ICMS_ST", 0) or 0) > 0
        for item in c170_items
    )
    
    # Se tem ST mas não tem bloco de substituto, pode ser apenas substituído
    # Nesse caso, não deve exigir bloco/fechamentos de substituto
    exige_bloco = tem_st and tem_bloco_substituto
    
    if tem_st and not tem_bloco_substituto:
        # Contribuinte apenas substituído - não exige bloco
        valido = True
    elif tem_st and tem_bloco_substituto:
        # Contribuinte substituto - deve ter bloco
        valido = True
    else:
        # Sem ST - não precisa validar
        valido = True
    
    return ResultadoValidacaoST(
        valido=valido,
        exige_bloco_substituto=exige_bloco,
        divergencias=divergencias
    )


def identificar_st_sem_credito(c170_item: Dict[str, Any]) -> ResultadoSTSemCredito:
    """
    Identifica quando ST não gera crédito para adquirente
    
    Args:
        c170_item: Registro C170
    
    Returns:
        ResultadoSTSemCredito
    """
    cfop = str(c170_item.get("CFOP", "")).strip()
    uf_dest = str(c170_item.get("UF_DEST", "")).strip()
    vl_icms_st = float(c170_item.get("VL_ICMS_ST", 0) or 0)
    
    # ST não gera crédito em:
    # 1. Operações interestaduais para consumidor final (CFOP 6xxx)
    # 2. Operações internas para consumidor final sem crédito
    st_sem_credito = False
    motivo = None
    
    if vl_icms_st > 0:
        # CFOPs 6xxx são operações interestaduais para consumidor final
        if cfop.startswith("6"):
            st_sem_credito = True
            motivo = "ST em operação interestadual para consumidor final não gera crédito"
        # CFOPs 5xxx podem ter ST com crédito ou sem crédito dependendo do cenário
        elif cfop.startswith("5"):
            # Verificar se é operação para consumidor final sem crédito
            # (isso pode depender de outros campos como IND_FINAL)
            pass
    
    return ResultadoSTSemCredito(
        st_sem_credito=st_sem_credito,
        motivo=motivo
    )


def validar_calculos_st(
    c170_item: Dict[str, Any],
    tolerancia: float = 0.01
) -> ResultadoCalculoST:
    """
    Valida cálculos de ST corretamente
    
    Fórmula: ST = (Base ST - Base ICMS) * Alíquota ST
    
    Args:
        c170_item: Registro C170
        tolerancia: Tolerância para diferenças
    
    Returns:
        ResultadoCalculoST
    """
    vl_bc_icms = float(c170_item.get("VL_BC_ICMS", 0) or 0)
    vl_bc_icms_st = float(c170_item.get("VL_BC_ICMS_ST", 0) or 0)
    aliq_icms_st = float(c170_item.get("ALIQ_ICMS_ST", 0) or 0)
    vl_icms_st = float(c170_item.get("VL_ICMS_ST", 0) or 0)
    
    # Calcular ST esperado
    base_st = vl_bc_icms_st - vl_bc_icms
    st_calculado = base_st * (aliq_icms_st / 100.0)
    
    # Comparar com ST informado
    diferenca = abs(st_calculado - vl_icms_st)
    valido = diferenca <= tolerancia
    
    return ResultadoCalculoST(
        valido=valido,
        st_calculado=st_calculado,
        st_informado=vl_icms_st,
        diferenca=diferenca
    )



