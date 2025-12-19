#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recálculo Automático de C190
Recalcula C190 automaticamente após correção de C170.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoRecalculoC190:
    """Resultado do recálculo de C190"""
    recalculado: bool
    c190_atualizado: Optional[Dict[str, Any]] = None
    c190_criado: bool = False
    c170s_agrupados: List[Dict[str, Any]] = field(default_factory=list)
    combinacao: Optional[Tuple[str, str, str]] = None
    timestamp: Optional[datetime] = None
    log: Optional[str] = None


def agrupar_c170s_por_combinacao(
    c170_items: List[Dict[str, Any]]
) -> Dict[Tuple[str, str, str], List[Dict[str, Any]]]:
    """
    Agrupa todos os C170s relacionados por combinação (CST, CFOP, ALIQ)
    
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


def calcular_totais_c190(
    c170_items_grupo: List[Dict[str, Any]]
) -> Dict[str, float]:
    """
    Calcula totais esperados para C190 a partir de C170s agrupados
    
    Args:
        c170_items_grupo: Lista de C170s do mesmo grupo
    
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


def criar_c190(
    combinacao: Tuple[str, str, str],
    totais: Dict[str, float]
) -> Dict[str, Any]:
    """
    Cria C190 se não existir para a combinação CST/CFOP/ALIQ
    
    Args:
        combinacao: Tupla (CST, CFOP, ALIQ)
        totais: Totais calculados dos C170s
    
    Returns:
        Registro C190 criado
    """
    cst, cfop, aliq = combinacao
    
    return {
        "CST_ICMS": cst,
        "CFOP": cfop,
        "ALIQ_ICMS": aliq,
        "VL_OPR": round(totais["VL_OPR"], 2),
        "VL_BC_ICMS": round(totais["VL_BC_ICMS"], 2),
        "VL_ICMS": round(totais["VL_ICMS"], 2),
        "VL_BC_ICMS_ST": round(totais["VL_BC_ICMS_ST"], 2),
        "VL_ICMS_ST": round(totais["VL_ICMS_ST"], 2),
        "VL_IPI": round(totais["VL_IPI"], 2)
    }


def atualizar_c190(
    c190_existente: Dict[str, Any],
    totais: Dict[str, float]
) -> Dict[str, Any]:
    """
    Atualiza C190 existente com novos totais
    
    Args:
        c190_existente: Registro C190 existente
        totais: Novos totais calculados
    
    Returns:
        C190 atualizado
    """
    c190_atualizado = c190_existente.copy()
    
    # Atualizar apenas os valores totais
    c190_atualizado["VL_OPR"] = round(totais["VL_OPR"], 2)
    c190_atualizado["VL_BC_ICMS"] = round(totais["VL_BC_ICMS"], 2)
    c190_atualizado["VL_ICMS"] = round(totais["VL_ICMS"], 2)
    c190_atualizado["VL_BC_ICMS_ST"] = round(totais["VL_BC_ICMS_ST"], 2)
    c190_atualizado["VL_ICMS_ST"] = round(totais["VL_ICMS_ST"], 2)
    c190_atualizado["VL_IPI"] = round(totais["VL_IPI"], 2)
    
    return c190_atualizado


def validar_coerencia_totais(
    totais: Dict[str, float]
) -> bool:
    """
    Valida coerência dos totais recalculados
    
    Args:
        totais: Totais calculados
    
    Returns:
        True se os totais são coerentes
    """
    # Validar que valores não são negativos (exceto em casos especiais)
    if totais["VL_OPR"] < 0:
        return False
    
    # Validar que VL_BC_ICMS não é maior que VL_OPR (geralmente)
    if totais["VL_BC_ICMS"] > totais["VL_OPR"] * 1.1:  # Tolerância de 10%
        logger.warning(f"VL_BC_ICMS ({totais['VL_BC_ICMS']}) muito maior que VL_OPR ({totais['VL_OPR']})")
        # Não retornar False, pode ser legítimo em alguns casos
    
    return True


def recalcular_c190_apos_correcao_c170(
    c170_items_corrigidos: List[Dict[str, Any]],
    c190_existente: Optional[Dict[str, Any]] = None
) -> ResultadoRecalculoC190:
    """
    Recalcula C190 automaticamente após correção de C170
    
    Args:
        c170_items_corrigidos: Lista de C170s corrigidos
        c190_existente: C190 existente (se houver)
    
    Returns:
        ResultadoRecalculoC190 com C190 recalculado
    """
    if not c170_items_corrigidos:
        return ResultadoRecalculoC190(recalculado=False)
    
    # 1. Agrupar C170s por combinação
    grupos = agrupar_c170s_por_combinacao(c170_items_corrigidos)
    
    if not grupos:
        return ResultadoRecalculoC190(recalculado=False)
    
    # Pegar o primeiro grupo (assumindo que todos os C170s corrigidos são da mesma combinação)
    # Em produção, isso seria iterado para cada combinação
    combinacao = list(grupos.keys())[0]
    c170s_grupo = grupos[combinacao]
    
    # 2. Calcular totais esperados
    totais = calcular_totais_c190(c170s_grupo)
    
    # 3. Validar coerência
    if not validar_coerencia_totais(totais):
        logger.warning(f"Totais recalculados não são coerentes para combinação {combinacao}")
        return ResultadoRecalculoC190(recalculado=False)
    
    # 4. Criar ou atualizar C190
    c190_criado = False
    if c190_existente:
        c190_atualizado = atualizar_c190(c190_existente, totais)
    else:
        c190_atualizado = criar_c190(combinacao, totais)
        c190_criado = True
    
    timestamp = datetime.now()
    acao = "criado" if c190_criado else "atualizado"
    log = f"[{timestamp.isoformat()}] C190 {acao} para combinação {combinacao}: VL_OPR={totais['VL_OPR']:.2f}, VL_ICMS={totais['VL_ICMS']:.2f}"
    
    return ResultadoRecalculoC190(
        recalculado=True,
        c190_atualizado=c190_atualizado,
        c190_criado=c190_criado,
        c170s_agrupados=c170s_grupo,
        combinacao=combinacao,
        timestamp=timestamp,
        log=log
    )


