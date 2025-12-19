#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Tolerância Configurável
Implementa sistema de tolerâncias configuráveis para evitar falsos positivos.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class ResultadoTolerancia:
    """Resultado da verificação de tolerância"""
    dentro_tolerancia: bool
    tolerancia_aplicada: float
    diferenca: float
    justificativa: Optional[str] = None


# Configuração padrão de tolerâncias
TOLERANCIA_PADRAO = {
    "por_item": 0.01,  # R$ 0,01 por item
    "por_documento": 0.10,  # R$ 0,10 por documento
    "por_periodo": 1.00  # R$ 1,00 por período
}


def configurar_tolerancia_item(valor: float) -> float:
    """
    Configura tolerância por item
    
    Args:
        valor: Valor da tolerância (ex: R$ 0,01)
    
    Returns:
        Tolerância configurada
    """
    return float(valor)


def configurar_tolerancia_documento(valor: float) -> float:
    """
    Configura tolerância por documento
    
    Args:
        valor: Valor da tolerância (ex: R$ 0,10)
    
    Returns:
        Tolerância configurada
    """
    return float(valor)


def configurar_tolerancia_periodo(valor: float) -> float:
    """
    Configura tolerância por período
    
    Args:
        valor: Valor da tolerância (ex: R$ 1,00)
    
    Returns:
        Tolerância configurada
    """
    return float(valor)


def verificar_diferenca_dentro_tolerancia(
    diferenca: float,
    tipo: str,
    config: Dict[str, float] = None
) -> ResultadoTolerancia:
    """
    Verifica se diferença está dentro da tolerância
    
    Args:
        diferenca: Diferença encontrada (valor absoluto)
        tipo: Tipo de tolerância ("item", "documento", "periodo")
        config: Configuração de tolerâncias (usa padrão se None)
    
    Returns:
        ResultadoTolerancia
    """
    if config is None:
        config = TOLERANCIA_PADRAO
    
    # Obter tolerância apropriada
    if tipo == "item":
        tolerancia = config.get("por_item", TOLERANCIA_PADRAO["por_item"])
    elif tipo == "documento":
        tolerancia = config.get("por_documento", TOLERANCIA_PADRAO["por_documento"])
    elif tipo == "periodo":
        tolerancia = config.get("por_periodo", TOLERANCIA_PADRAO["por_periodo"])
    else:
        tolerancia = 0.0
    
    # Verificar se está dentro da tolerância
    dentro_tolerancia = abs(diferenca) <= tolerancia
    
    return ResultadoTolerancia(
        dentro_tolerancia=dentro_tolerancia,
        tolerancia_aplicada=tolerancia,
        diferenca=abs(diferenca)
    )


def registrar_diferenca_tolerancia(
    diferenca: float,
    tipo: str,
    justificativa: str,
    config: Dict[str, float] = None
) -> Dict[str, Any]:
    """
    Registra diferenças dentro da tolerância com justificativa
    
    Args:
        diferenca: Diferença encontrada
        tipo: Tipo de tolerância
        justificativa: Justificativa (rateio/arredondamento)
        config: Configuração de tolerâncias
    
    Returns:
        Registro da diferença
    """
    resultado_verificacao = verificar_diferenca_dentro_tolerancia(diferenca, tipo, config)
    
    registro = {
        "timestamp": datetime.now().isoformat(),
        "diferenca": abs(diferenca),
        "tipo": tipo,
        "tolerancia_aplicada": resultado_verificacao.tolerancia_aplicada,
        "dentro_tolerancia": resultado_verificacao.dentro_tolerancia,
        "justificativa": justificativa,
        "registrado": True
    }
    
    return registro


