#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Algoritmo de Correção C170
Implementa correções automáticas nos registros C170 baseadas em dados do XML.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Score mínimo para correção automática
SCORE_MINIMO_CORRECAO = 50.0


@dataclass
class CorrecaoAplicada:
    """Representa uma correção aplicada"""
    campo: str
    valor_antigo: Any
    valor_novo: Any
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ResultadoCorrecaoC170:
    """Resultado da correção de um C170"""
    corrigido: bool
    campo_corrigido: Optional[str] = None
    valor_antigo: Optional[Any] = None
    valor_novo: Optional[Any] = None
    timestamp: Optional[datetime] = None
    log: Optional[str] = None
    correcoes_aplicadas: List[CorrecaoAplicada] = field(default_factory=list)


def normalizar_cfop(cfop: Optional[str]) -> str:
    """
    Normaliza CFOP removendo espaços e zeros à esquerda
    
    Args:
        cfop: CFOP a normalizar
    
    Returns:
        CFOP normalizado (4 dígitos)
    """
    if cfop is None:
        return ""
    
    # Remove espaços e converte para string
    cfop_str = "".join(str(cfop).strip().split())
    
    # CFOP deve ter 4 dígitos
    if len(cfop_str) > 4:
        # Se tiver mais de 4 dígitos, remove zeros à esquerda e pega últimos 4
        cfop_str = cfop_str.lstrip("0")
        if len(cfop_str) > 4:
            cfop_str = cfop_str[-4:]
    elif len(cfop_str) < 4 and cfop_str.isdigit():
        # Se tiver menos de 4 dígitos, preenche com zeros à esquerda
        cfop_str = cfop_str.zfill(4)
    
    return cfop_str


def corrigir_vl_item_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC170:
    """
    Corrige VL_ITEM do C170 baseado em XML
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC170
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC170(corrigido=False)
    
    vl_item_c170 = float(c170_item.get("VL_ITEM", 0) or 0)
    vprod_xml = float(xml_item.get("vProd", 0) or 0)
    
    if abs(vl_item_c170 - vprod_xml) < 0.01:
        # Valores já estão iguais (dentro da tolerância)
        return ResultadoCorrecaoC170(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção VL_ITEM: {vl_item_c170:.2f} → {vprod_xml:.2f}"
    
    return ResultadoCorrecaoC170(
        corrigido=True,
        campo_corrigido="VL_ITEM",
        valor_antigo=vl_item_c170,
        valor_novo=vprod_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("VL_ITEM", vl_item_c170, vprod_xml, timestamp)]
    )


def corrigir_qtd_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float,
    tolerancia: float = 0.001
) -> ResultadoCorrecaoC170:
    """
    Corrige QTD do C170 baseado em XML
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
        tolerancia: Tolerância para considerar diferença
    
    Returns:
        ResultadoCorrecaoC170
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC170(corrigido=False)
    
    qtd_c170 = float(c170_item.get("QTD", 0) or 0)
    qcom_xml = float(xml_item.get("qCom", 0) or 0)
    
    if abs(qtd_c170 - qcom_xml) < tolerancia:
        # Quantidades já estão iguais (dentro da tolerância)
        return ResultadoCorrecaoC170(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção QTD: {qtd_c170} → {qcom_xml}"
    
    return ResultadoCorrecaoC170(
        corrigido=True,
        campo_corrigido="QTD",
        valor_antigo=qtd_c170,
        valor_novo=qcom_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("QTD", qtd_c170, qcom_xml, timestamp)]
    )


def corrigir_cfop_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC170:
    """
    Corrige CFOP do C170 quando score ≥ 50%
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC170
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC170(corrigido=False)
    
    cfop_c170 = str(c170_item.get("CFOP", "")).strip()
    cfop_xml = str(xml_item.get("CFOP", "")).strip()
    
    # Normalizar ambos
    cfop_c170_norm = normalizar_cfop(cfop_c170)
    cfop_xml_norm = normalizar_cfop(cfop_xml)
    
    if cfop_c170_norm == cfop_xml_norm:
        # CFOPs já são iguais (após normalização)
        return ResultadoCorrecaoC170(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção CFOP: {cfop_c170} → {cfop_xml_norm} (normalizado)"
    
    return ResultadoCorrecaoC170(
        corrigido=True,
        campo_corrigido="CFOP",
        valor_antigo=cfop_c170,
        valor_novo=cfop_xml_norm,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("CFOP", cfop_c170, cfop_xml_norm, timestamp)]
    )


def corrigir_cst_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC170:
    """
    Corrige CST do C170 quando score ≥ 50%
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC170
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC170(corrigido=False)
    
    cst_c170 = str(c170_item.get("CST_ICMS", "")).strip()
    cst_xml = str(xml_item.get("CST", "")).strip()
    
    if cst_c170 == cst_xml:
        # CSTs já são iguais
        return ResultadoCorrecaoC170(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção CST_ICMS: {cst_c170} → {cst_xml}"
    
    return ResultadoCorrecaoC170(
        corrigido=True,
        campo_corrigido="CST_ICMS",
        valor_antigo=cst_c170,
        valor_novo=cst_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("CST_ICMS", cst_c170, cst_xml, timestamp)]
    )


def corrigir_ncm_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC170:
    """
    Corrige NCM do C170 quando score ≥ 50%
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC170
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC170(corrigido=False)
    
    ncm_c170 = str(c170_item.get("NCM", "")).strip()
    ncm_xml = str(xml_item.get("NCM", "")).strip()
    
    if ncm_c170 == ncm_xml:
        # NCMs já são iguais
        return ResultadoCorrecaoC170(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção NCM: {ncm_c170} → {ncm_xml}"
    
    return ResultadoCorrecaoC170(
        corrigido=True,
        campo_corrigido="NCM",
        valor_antigo=ncm_c170,
        valor_novo=ncm_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("NCM", ncm_c170, ncm_xml, timestamp)]
    )


def aplicar_correcoes_c170(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC170:
    """
    Aplica todas as correções possíveis em um C170
    
    Args:
        c170_item: Registro C170
        xml_item: Item do XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC170 com todas as correções aplicadas
    """
    correcoes_aplicadas = []
    logs = []
    
    # 1. Corrigir VL_ITEM
    resultado_vl = corrigir_vl_item_c170(c170_item, xml_item, score)
    if resultado_vl.corrigido:
        correcoes_aplicadas.extend(resultado_vl.correcoes_aplicadas)
        logs.append(resultado_vl.log)
    
    # 2. Corrigir QTD
    resultado_qtd = corrigir_qtd_c170(c170_item, xml_item, score)
    if resultado_qtd.corrigido:
        correcoes_aplicadas.extend(resultado_qtd.correcoes_aplicadas)
        logs.append(resultado_qtd.log)
    
    # 3. Corrigir CFOP (normalização sempre, correção se score ≥ 50%)
    resultado_cfop = corrigir_cfop_c170(c170_item, xml_item, score)
    if resultado_cfop.corrigido:
        correcoes_aplicadas.extend(resultado_cfop.correcoes_aplicadas)
        logs.append(resultado_cfop.log)
    
    # 4. Corrigir CST (se score ≥ 50%)
    resultado_cst = corrigir_cst_c170(c170_item, xml_item, score)
    if resultado_cst.corrigido:
        correcoes_aplicadas.extend(resultado_cst.correcoes_aplicadas)
        logs.append(resultado_cst.log)
    
    # 5. Corrigir NCM (se score ≥ 50%)
    resultado_ncm = corrigir_ncm_c170(c170_item, xml_item, score)
    if resultado_ncm.corrigido:
        correcoes_aplicadas.extend(resultado_ncm.correcoes_aplicadas)
        logs.append(resultado_ncm.log)
    
    if correcoes_aplicadas:
        return ResultadoCorrecaoC170(
            corrigido=True,
            timestamp=datetime.now(),
            log="\n".join(logs),
            correcoes_aplicadas=correcoes_aplicadas
        )
    else:
        return ResultadoCorrecaoC170(corrigido=False)

