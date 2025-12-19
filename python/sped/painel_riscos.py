#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Painel de Riscos
Classifica e visualiza riscos de divergências.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoClassificacaoRisco:
    """Resultado da classificação de risco"""
    tipo_risco: str  # "estrutural", "fiscal", "operacional"
    prioridade: str  # "alta", "media", "baixa"
    severidade: str
    impacto: str


# Mapeamento de tipos de divergência para tipo de risco
MAPEAMENTO_TIPO_RISCO = {
    # Riscos estruturais (afetam aceitação do arquivo)
    "COD_PART_NAO_ENCONTRADO": "estrutural",
    "COD_ITEM_NAO_ENCONTRADO": "estrutural",
    "UNID_NAO_ENCONTRADA": "estrutural",
    "C100_SEM_XML": "estrutural",
    "XML_SEM_C100": "estrutural",
    
    # Riscos fiscais (afetam créditos/débitos)
    "VL_ICMS_DIVERGENTE": "fiscal",
    "VL_IPI_DIVERGENTE": "fiscal",
    "VL_ST_DIVERGENTE": "fiscal",
    "CST_INVALIDO": "fiscal",
    "CFOP_INVALIDO": "fiscal",
    "E110_INCOERENTE": "fiscal",
    "E116_SEM_SUPORTE": "fiscal",
    
    # Riscos operacionais (afetam prazos/retificações)
    "DATA_DOCUMENTO_INVALIDA": "operacional",
    "DATA_EMISSAO_INVALIDA": "operacional",
    "CHV_NFE_INVALIDA": "operacional",
    "DUPLICIDADE": "operacional"
}


def classificar_risco(divergencia: Dict[str, Any]) -> ResultadoClassificacaoRisco:
    """
    Classifica risco: estrutural, fiscal, operacional
    
    Args:
        divergencia: Dicionário com informações da divergência
    
    Returns:
        ResultadoClassificacaoRisco
    """
    tipo_divergencia = str(divergencia.get("TIPO", "")).strip()
    severidade = str(divergencia.get("SEVERIDADE", "baixa")).strip().lower()
    
    # Determinar tipo de risco
    tipo_risco = MAPEAMENTO_TIPO_RISCO.get(tipo_divergencia, "operacional")
    
    # Se não encontrou no mapeamento, inferir pelo tipo
    if tipo_risco == "operacional" and tipo_divergencia:
        tipo_upper = tipo_divergencia.upper()
        if "COD_" in tipo_upper or "CADASTRO" in tipo_upper:
            tipo_risco = "estrutural"
        elif "VL_" in tipo_upper or "ICMS" in tipo_upper or "IPI" in tipo_upper or "ST" in tipo_upper:
            tipo_risco = "fiscal"
    
    # Priorizar baseado na severidade e tipo de risco
    if severidade == "alta" or tipo_risco == "estrutural":
        prioridade = "alta"
    elif severidade == "media":
        prioridade = "media"
    else:
        prioridade = "baixa"
    
    # Determinar impacto
    if tipo_risco == "estrutural":
        impacto = "Arquivo pode ser rejeitado"
    elif tipo_risco == "fiscal":
        impacto = "Pode afetar créditos/débitos fiscais"
    else:
        impacto = "Pode causar retificações"
    
    return ResultadoClassificacaoRisco(
        tipo_risco=tipo_risco,
        prioridade=prioridade,
        severidade=severidade,
        impacto=impacto
    )


def priorizar_risco(divergencia: Dict[str, Any]) -> ResultadoClassificacaoRisco:
    """
    Prioriza risco: alta, média, baixa
    
    Args:
        divergencia: Dicionário com informações da divergência
    
    Returns:
        ResultadoClassificacaoRisco com prioridade
    """
    resultado = classificar_risco(divergencia)
    return resultado


def calcular_distribuicao_riscos(divergencias: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calcula distribuição de riscos
    
    Args:
        divergencias: Lista de divergências
    
    Returns:
        Distribuição de riscos por tipo e prioridade
    """
    distribuicao = {
        "estrutural": {"alta": 0, "media": 0, "baixa": 0, "total": 0},
        "fiscal": {"alta": 0, "media": 0, "baixa": 0, "total": 0},
        "operacional": {"alta": 0, "media": 0, "baixa": 0, "total": 0}
    }
    
    for divergencia in divergencias:
        resultado = classificar_risco(divergencia)
        tipo = resultado.tipo_risco
        prioridade = resultado.prioridade
        
        if tipo in distribuicao:
            distribuicao[tipo][prioridade] += 1
            distribuicao[tipo]["total"] += 1
    
    return distribuicao


def filtrar_riscos(
    riscos: List[Dict[str, Any]],
    tipo_risco: Optional[str] = None,
    periodo: Optional[str] = None,
    cliente: Optional[str] = None,
    prioridade: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Filtra riscos por período, cliente, tipo de risco, prioridade
    
    Args:
        riscos: Lista de riscos
        tipo_risco: Tipo de risco a filtrar
        periodo: Período a filtrar
        cliente: Cliente a filtrar
        prioridade: Prioridade a filtrar
    
    Returns:
        Lista de riscos filtrados
    """
    riscos_filtrados = []
    
    for risco in riscos:
        # Classificar risco se ainda não foi classificado
        if "tipo_risco" not in risco:
            resultado = classificar_risco(risco)
            risco["tipo_risco"] = resultado.tipo_risco
            risco["prioridade"] = resultado.prioridade
        
        # Aplicar filtros
        if tipo_risco and risco.get("tipo_risco") != tipo_risco:
            continue
        
        if periodo and risco.get("periodo") != periodo:
            continue
        
        if cliente and risco.get("cliente") != cliente:
            continue
        
        if prioridade and risco.get("prioridade") != prioridade:
            continue
        
        riscos_filtrados.append(risco)
    
    return riscos_filtrados


