#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Apuração - E116 (Valores a Recolher)
Valida valores a recolher.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoValidacaoE116:
    """Resultado da validação de E116"""
    valido: bool
    divergencias: List[str]
    valores_sem_suporte: List[Dict[str, Any]]
    total_recolher_e116: float
    total_suportado_e110: float


def validar_valores_recolher_suportados(
    e110_record: Dict[str, Any],
    e116_records: List[Dict[str, Any]]
) -> ResultadoValidacaoE116:
    """
    Valida que valores a recolher são suportados pelo fechamento E110
    
    Args:
        e110_record: Registro E110
        e116_records: Lista de registros E116
    
    Returns:
        ResultadoValidacaoE116
    """
    divergencias = []
    valores_sem_suporte = []
    
    # Obter valor suportado do E110
    vl_icms_recolher = float(e110_record.get("VL_ICMS_RECOLHER", 0) or 0)
    vl_sld_apurado = float(e110_record.get("VL_SLD_APURADO", 0) or 0)
    
    # Usar o maior valor entre VL_ICMS_RECOLHER e VL_SLD_APURADO
    total_suportado = max(vl_icms_recolher, vl_sld_apurado)
    
    # Calcular total de valores a recolher no E116
    total_recolher = sum(
        float(e116.get("VL_RECOLHER", 0) or 0)
        for e116 in e116_records
    )
    
    # Validar que total não excede o suportado
    if total_recolher > total_suportado + 0.01:  # Tolerância de 1 centavo
        divergencias.append(
            f"Total de valores a recolher ({total_recolher:.2f}) excede o suportado pelo fechamento ({total_suportado:.2f})"
        )
        
        # Identificar quais E116s estão causando o problema
        for e116 in e116_records:
            vl_recolher = float(e116.get("VL_RECOLHER", 0) or 0)
            if vl_recolher > 0:
                valores_sem_suporte.append({
                    "cod_or": str(e116.get("COD_OR", "")).strip(),
                    "vl_recolher": vl_recolher
                })
    
    valido = len(divergencias) == 0
    
    return ResultadoValidacaoE116(
        valido=valido,
        divergencias=divergencias,
        valores_sem_suporte=valores_sem_suporte,
        total_recolher_e116=total_recolher,
        total_suportado_e110=total_suportado
    )


def validar_coerencia_e116_e110(
    e110_record: Dict[str, Any],
    e116_records: List[Dict[str, Any]]
) -> ResultadoValidacaoE116:
    """
    Valida coerência entre E116 e E110
    
    Args:
        e110_record: Registro E110
        e116_records: Lista de registros E116
    
    Returns:
        ResultadoValidacaoE116
    """
    # Usar a mesma validação de valores suportados
    return validar_valores_recolher_suportados(e110_record, e116_records)


def detectar_valores_sem_suporte(
    e110_record: Dict[str, Any],
    e116_records: List[Dict[str, Any]]
) -> ResultadoValidacaoE116:
    """
    Detecta valores a recolher sem suporte no fechamento
    
    Args:
        e110_record: Registro E110
        e116_records: Lista de registros E116
    
    Returns:
        ResultadoValidacaoE116
    """
    resultado = validar_valores_recolher_suportados(e110_record, e116_records)
    
    # Se há valores sem suporte, marcar como inválido
    if len(resultado.valores_sem_suporte) > 0:
        resultado.valido = False
    
    return resultado


