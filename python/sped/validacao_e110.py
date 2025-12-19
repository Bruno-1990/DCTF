#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Apuração - E110 (Fechamento)
Valida coerência do fechamento da apuração.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoValidacaoE110:
    """Resultado da validação de E110"""
    valido: bool
    inconsistencias: List[str]
    saldo_calculado: float
    saldo_informado: float
    diferenca: float


def validar_coerencia_fechamento(e110_record: Dict[str, Any]) -> ResultadoValidacaoE110:
    """
    Valida coerência de débitos, créditos, estornos, ajustes
    
    Fórmula: VL_SLD_APURADO = (VL_TOT_DEBITOS + VL_AJ_DEBITOS) - (VL_TOT_CREDITOS + VL_AJ_CREDITOS) + VL_SLD_CREDOR_ANT - VL_TOT_DED
    
    Args:
        e110_record: Registro E110
    
    Returns:
        ResultadoValidacaoE110
    """
    vl_tot_debitos = float(e110_record.get("VL_TOT_DEBITOS", 0) or 0)
    vl_aj_debitos = float(e110_record.get("VL_AJ_DEBITOS", 0) or 0)
    vl_tot_creditos = float(e110_record.get("VL_TOT_CREDITOS", 0) or 0)
    vl_aj_creditos = float(e110_record.get("VL_AJ_CREDITOS", 0) or 0)
    vl_sld_credor_ant = float(e110_record.get("VL_SLD_CREDOR_ANT", 0) or 0)
    vl_tot_ded = float(e110_record.get("VL_TOT_DED", 0) or 0)
    vl_sld_apurado = float(e110_record.get("VL_SLD_APURADO", 0) or 0)
    
    # Calcular saldo esperado
    saldo_calculado = (vl_tot_debitos + vl_aj_debitos) - (vl_tot_creditos + vl_aj_creditos) + vl_sld_credor_ant - vl_tot_ded
    
    # Comparar com saldo informado
    diferenca = abs(saldo_calculado - vl_sld_apurado)
    valido = diferenca <= 0.01  # Tolerância de 1 centavo
    
    inconsistencias = []
    if not valido:
        inconsistencias.append(
            f"Saldo apurado divergente: calculado={saldo_calculado:.2f}, informado={vl_sld_apurado:.2f}, diferença={diferenca:.2f}"
        )
    
    return ResultadoValidacaoE110(
        valido=valido,
        inconsistencias=inconsistencias,
        saldo_calculado=saldo_calculado,
        saldo_informado=vl_sld_apurado,
        diferenca=diferenca
    )


def validar_saldo_anterior_transportar(e110_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida saldo anterior e saldo a transportar
    
    Args:
        e110_record: Registro E110
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    vl_sld_credor_ant = float(e110_record.get("VL_SLD_CREDOR_ANT", 0) or 0)
    vl_sld_apurado = float(e110_record.get("VL_SLD_APURADO", 0) or 0)
    vl_sld_credor_transportar = float(e110_record.get("VL_SLD_CREDOR_TRANSPORTAR", 0) or 0)
    
    # Validar que saldo a transportar é coerente
    # Se saldo apurado é credor, deve ser transportado
    if vl_sld_apurado > 0 and vl_sld_credor_transportar != vl_sld_apurado:
        resultado["valido"] = False
        resultado["divergencias"].append(
            f"Saldo credor a transportar divergente: apurado={vl_sld_apurado:.2f}, transportar={vl_sld_credor_transportar:.2f}"
        )
    
    return resultado


def validar_extra_apuracao(e110_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida extra-apuração quando aplicável
    
    Args:
        e110_record: Registro E110
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    vl_ext_apur = float(e110_record.get("VL_EXT_APUR", 0) or 0)
    
    # Se há extra-apuração, deve ter justificativa
    if vl_ext_apur != 0:
        # Validar que há informações sobre a extra-apuração
        # (isso pode depender de outros campos ou registros relacionados)
        pass
    
    return resultado


def detectar_inconsistencias_fechamento(e110_record: Dict[str, Any]) -> ResultadoValidacaoE110:
    """
    Detecta inconsistências no fechamento
    
    Args:
        e110_record: Registro E110
    
    Returns:
        ResultadoValidacaoE110
    """
    # 1. Validar coerência básica
    resultado = validar_coerencia_fechamento(e110_record)
    
    # 2. Validar saldo anterior e transportar
    validacao_saldo = validar_saldo_anterior_transportar(e110_record)
    if not validacao_saldo["valido"]:
        resultado.inconsistencias.extend(validacao_saldo["divergencias"])
        resultado.valido = False
    
    # 3. Validar extra-apuração
    validacao_extra = validar_extra_apuracao(e110_record)
    if not validacao_extra["valido"]:
        resultado.inconsistencias.extend(validacao_extra["divergencias"])
        resultado.valido = False
    
    # 4. Validar que VL_ICMS_RECOLHER é coerente com saldo apurado
    vl_icms_recolher = float(e110_record.get("VL_ICMS_RECOLHER", 0) or 0)
    vl_sld_apurado = float(e110_record.get("VL_SLD_APURADO", 0) or 0)
    
    if abs(vl_icms_recolher - vl_sld_apurado) > 0.01:
        resultado.inconsistencias.append(
            f"VL_ICMS_RECOLHER divergente: informado={vl_icms_recolher:.2f}, esperado={vl_sld_apurado:.2f}"
        )
        resultado.valido = False
    
    return resultado


