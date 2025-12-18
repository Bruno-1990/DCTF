#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Validação C170 → C190 (Resumo por CST/CFOP/ALIQ)
Valida coerência entre os itens (C170) e os resumos (C190) agrupados por combinação CST/CFOP/ALIQ.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DivergenciaC170C190:
    """Representa uma divergência entre C170 e C190"""
    combinacao: Tuple[str, str, str]  # (CST, CFOP, ALIQ)
    campo: str
    valor_c170: float
    valor_c190: float
    diferenca: float
    severidade: str
    itens_causadores: List[str]  # NUM_ITEM dos C170s que causam a divergência


@dataclass
class ResultadoValidacaoC170C190:
    """Resultado da validação C170 → C190"""
    combinacoes_validas: List[Tuple[str, str, str]]
    divergencias: List[DivergenciaC170C190]
    c190_faltantes: List[Dict[str, Any]]
    total_combinacoes: int
    total_divergencias: int


def agrupar_c170_por_combinacao(
    c170_items: List[Dict[str, Any]]
) -> Dict[Tuple[str, str, str], List[Dict[str, Any]]]:
    """
    Para cada C100, agrupa C170s por combinação (CST, CFOP, ALIQ)
    
    Args:
        c170_items: Lista de registros C170
    
    Returns:
        Dicionário com chave (CST, CFOP, ALIQ) e valor lista de C170s
    """
    grupos: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
    
    for c170 in c170_items:
        cst = str(c170.get("CST_ICMS", "")).strip()
        cfop = str(c170.get("CFOP", "")).strip()
        aliq = str(c170.get("ALIQ_ICMS", "")).strip()
        
        if not cst or not cfop:
            continue
        
        chave = (cst, cfop, aliq)
        
        if chave not in grupos:
            grupos[chave] = []
        
        grupos[chave].append(c170)
    
    return grupos


def calcular_totais_esperados_c170(
    c170_items_grupo: List[Dict[str, Any]]
) -> Dict[str, float]:
    """
    Calcula totais esperados de VL_OPR, VL_BC_ICMS, VL_ICMS para um grupo de C170s
    
    Args:
        c170_items_grupo: Lista de C170s do mesmo grupo (mesma combinação CST/CFOP/ALIQ)
    
    Returns:
        Dicionário com totais calculados
    """
    totais = {
        "VL_OPR": 0.0,
        "VL_BC_ICMS": 0.0,
        "VL_ICMS": 0.0,
        "VL_BC_ICMS_ST": 0.0,
        "VL_ICMS_ST": 0.0,
        "VL_IPI": 0.0
    }
    
    for c170 in c170_items_grupo:
        totais["VL_OPR"] += float(c170.get("VL_OPR", 0) or 0)
        totais["VL_BC_ICMS"] += float(c170.get("VL_BC_ICMS", 0) or 0)
        totais["VL_ICMS"] += float(c170.get("VL_ICMS", 0) or 0)
        totais["VL_BC_ICMS_ST"] += float(c170.get("VL_BC_ICMS_ST", 0) or 0)
        totais["VL_ICMS_ST"] += float(c170.get("VL_ICMS_ST", 0) or 0)
        totais["VL_IPI"] += float(c170.get("VL_IPI", 0) or 0)
    
    return totais


def comparar_c170_c190(
    combinacao: Tuple[str, str, str],
    totais_c170: Dict[str, float],
    c190_item: Dict[str, Any],
    tolerancia: float = 0.01
) -> Dict[str, Any]:
    """
    Compara valores esperados (de C170s) com C190 correspondente
    
    Args:
        combinacao: Tupla (CST, CFOP, ALIQ)
        totais_c170: Totais calculados dos C170s
        c190_item: Registro C190 correspondente
        tolerancia: Tolerância para diferenças (em reais)
    
    Returns:
        Dicionário com resultado da comparação
    """
    divergencias = []
    
    campos = ["VL_OPR", "VL_BC_ICMS", "VL_ICMS", "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_IPI"]
    
    for campo in campos:
        valor_c170 = totais_c170.get(campo, 0.0)
        valor_c190 = float(c190_item.get(campo, 0) or 0)
        diferenca = abs(valor_c170 - valor_c190)
        
        if diferenca > tolerancia:
            severidade = "alta" if diferenca > 10 else ("media" if diferenca > 1 else "baixa")
            divergencias.append({
                "combinacao": combinacao,
                "campo": campo,
                "valor_c170": valor_c170,
                "valor_c190": valor_c190,
                "diferenca": diferenca,
                "severidade": severidade
            })
    
    return {
        "valido": len(divergencias) == 0,
        "divergencias": divergencias
    }


def validar_c170_c190(
    c170_items: List[Dict[str, Any]],
    c190_items: List[Dict[str, Any]],
    tolerancia: float = 0.01
) -> ResultadoValidacaoC170C190:
    """
    Valida coerência entre os itens (C170) e os resumos (C190) agrupados por combinação CST/CFOP/ALIQ
    
    Args:
        c170_items: Lista de registros C170
        c190_items: Lista de registros C190
        tolerancia: Tolerância para diferenças (em reais)
    
    Returns:
        ResultadoValidacaoC170C190 com todas as divergências encontradas
    """
    # 1. Agrupar C170s por combinação
    grupos_c170 = agrupar_c170_por_combinacao(c170_items)
    
    # 2. Criar mapa de C190s por combinação
    # C190 pode não ter ALIQ_ICMS, então usamos (CST, CFOP) como chave primária
    c190_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    c190_map_sem_aliq: Dict[Tuple[str, str], Dict[str, Any]] = {}
    
    for c190 in c190_items:
        cst = str(c190.get("CST_ICMS", "")).strip()
        cfop = str(c190.get("CFOP", "")).strip()
        aliq = str(c190.get("ALIQ_ICMS", "")).strip()
        
        if cst and cfop:
            if aliq:
                chave = (cst, cfop, aliq)
                c190_map[chave] = c190
            # Também indexar sem ALIQ para fallback
            chave_sem_aliq = (cst, cfop)
            c190_map_sem_aliq[chave_sem_aliq] = c190
    
    # 3. Validar cada grupo
    combinacoes_validas = []
    divergencias = []
    c190_faltantes = []
    
    for combinacao, c170s_grupo in grupos_c170.items():
        # Calcular totais esperados
        totais_c170 = calcular_totais_esperados_c170(c170s_grupo)
        
        # Buscar C190 correspondente
        c190_item = c190_map.get(combinacao)
        
        # Se não encontrou com ALIQ, tentar sem ALIQ (fallback)
        if not c190_item:
            chave_sem_aliq = (combinacao[0], combinacao[1])  # (CST, CFOP)
            c190_item = c190_map_sem_aliq.get(chave_sem_aliq)
        
        if not c190_item:
            # C190 faltante
            c190_faltantes.append({
                "CST": combinacao[0],
                "CFOP": combinacao[1],
                "ALIQ": combinacao[2],
                "VL_OPR_esperado": totais_c170["VL_OPR"],
                "VL_BC_ICMS_esperado": totais_c170["VL_BC_ICMS"],
                "VL_ICMS_esperado": totais_c170["VL_ICMS"],
                "itens_causadores": [c170.get("NUM_ITEM") for c170 in c170s_grupo]
            })
            continue
        
        # Comparar valores
        resultado = comparar_c170_c190(combinacao, totais_c170, c190_item, tolerancia)
        
        if resultado["valido"]:
            combinacoes_validas.append(combinacao)
        else:
            # Adicionar itens causadores às divergências
            for div in resultado["divergencias"]:
                divergencias.append(DivergenciaC170C190(
                    combinacao=combinacao,
                    campo=div["campo"],
                    valor_c170=div["valor_c170"],
                    valor_c190=div["valor_c190"],
                    diferenca=div["diferenca"],
                    severidade=div["severidade"],
                    itens_causadores=[c170.get("NUM_ITEM") for c170 in c170s_grupo]
                ))
    
    return ResultadoValidacaoC170C190(
        combinacoes_validas=combinacoes_validas,
        divergencias=divergencias,
        c190_faltantes=c190_faltantes,
        total_combinacoes=len(grupos_c170),
        total_divergencias=len(divergencias)
    )

