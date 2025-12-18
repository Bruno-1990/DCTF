#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Revalidação
Implementa endpoint e lógica de revalidação do SPED corrigido.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class MetricasValidacao:
    """Métricas de uma validação"""
    total_divergencias: int
    divergencias_alta: int
    divergencias_media: int
    divergencias_baixa: int
    divergencias_legitimas: int


@dataclass
class Melhoria:
    """Resultado do cálculo de melhoria"""
    reducao_total: int
    reducao_alta: int
    reducao_media: int
    reducao_baixa: int
    percentual_melhoria: float


@dataclass
class ResultadoComparacao:
    """Resultado da comparação antes/depois"""
    melhorou: bool
    reducao_total: int
    melhorias: Melhoria
    novas_divergencias: int


def calcular_melhoria(
    metricas_antes: MetricasValidacao,
    metricas_depois: MetricasValidacao
) -> Melhoria:
    """
    Calcula melhoria entre métricas antes/depois
    
    Args:
        metricas_antes: Métricas antes das correções
        metricas_depois: Métricas depois das correções
    
    Returns:
        Melhoria calculada
    """
    reducao_total = metricas_antes.total_divergencias - metricas_depois.total_divergencias
    reducao_alta = metricas_antes.divergencias_alta - metricas_depois.divergencias_alta
    reducao_media = metricas_antes.divergencias_media - metricas_depois.divergencias_media
    reducao_baixa = metricas_antes.divergencias_baixa - metricas_depois.divergencias_baixa
    
    percentual = 0.0
    if metricas_antes.total_divergencias > 0:
        percentual = (reducao_total / metricas_antes.total_divergencias) * 100.0
    
    return Melhoria(
        reducao_total=reducao_total,
        reducao_alta=reducao_alta,
        reducao_media=reducao_media,
        reducao_baixa=reducao_baixa,
        percentual_melhoria=percentual
    )


def comparar_metricas_antes_depois(
    metricas_antes: MetricasValidacao,
    metricas_depois: MetricasValidacao
) -> ResultadoComparacao:
    """
    Compara métricas antes e depois das correções
    
    Args:
        metricas_antes: Métricas antes das correções
        metricas_depois: Métricas depois das correções
    
    Returns:
        ResultadoComparacao
    """
    melhorias = calcular_melhoria(metricas_antes, metricas_depois)
    
    melhorou = melhorias.reducao_total > 0
    novas_divergencias = max(0, metricas_depois.total_divergencias - metricas_antes.total_divergencias)
    
    return ResultadoComparacao(
        melhorou=melhorou,
        reducao_total=melhorias.reducao_total,
        melhorias=melhorias,
        novas_divergencias=novas_divergencias
    )

