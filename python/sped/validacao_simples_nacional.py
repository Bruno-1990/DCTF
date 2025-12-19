#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Simples Nacional
Valida tratamento correto de créditos no Simples Nacional.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class CreditoEncontrado:
    """Crédito encontrado em um local"""
    local: str  # "C170", "C197", "E111"
    valor: float
    codigo_ajuste: Optional[str] = None


@dataclass
class ResultadoBuscaCredito:
    """Resultado da busca de crédito em múltiplos locais"""
    total_credito: float
    locais_credito: List[CreditoEncontrado]


@dataclass
class ResultadoValidacaoSimplesNacional:
    """Resultado da validação de Simples Nacional"""
    valido: bool
    divergencias: List[str]
    creditos_encontrados: ResultadoBuscaCredito


def buscar_credito_multiplos_locais(
    c170_items: List[Dict[str, Any]],
    c197_records: List[Dict[str, Any]] = None,
    e111_records: List[Dict[str, Any]] = None
) -> ResultadoBuscaCredito:
    """
    Busca crédito em múltiplos locais (C197, E111, campos de ICMS do item)
    
    Args:
        c170_items: Lista de registros C170
        c197_records: Lista de registros C197 (créditos de ICMS)
        e111_records: Lista de registros E111 (ajustes de apuração)
    
    Returns:
        ResultadoBuscaCredito
    """
    locais_credito = []
    total_credito = 0.0
    
    # 1. Buscar crédito nos campos de ICMS do item (C170)
    for c170 in c170_items:
        vl_icms = float(c170.get("VL_ICMS", 0) or 0)
        if vl_icms > 0:
            locais_credito.append(CreditoEncontrado(
                local="C170",
                valor=vl_icms
            ))
            total_credito += vl_icms
    
    # 2. Buscar crédito em C197 (créditos de ICMS)
    if c197_records:
        for c197 in c197_records:
            vl_cred = float(c197.get("VL_CRED_ORIG", 0) or 0)
            if vl_cred > 0:
                cod_aj = str(c197.get("COD_AJ", "")).strip()
                locais_credito.append(CreditoEncontrado(
                    local="C197",
                    valor=vl_cred,
                    codigo_ajuste=cod_aj
                ))
                total_credito += vl_cred
    
    # 3. Buscar crédito em E111 (ajustes de apuração)
    if e111_records:
        for e111 in e111_records:
            vl_aj = float(e111.get("VL_AJ_APUR", 0) or 0)
            if vl_aj > 0:
                cod_aj = str(e111.get("COD_AJ_APUR", "")).strip()
                locais_credito.append(CreditoEncontrado(
                    local="E111",
                    valor=vl_aj,
                    codigo_ajuste=cod_aj
                ))
                total_credito += vl_aj
    
    return ResultadoBuscaCredito(
        total_credito=total_credito,
        locais_credito=locais_credito
    )


def validar_ajustes_documento_apuracao(
    c197_records: List[Dict[str, Any]] = None,
    e111_records: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Valida ajustes de documento e apuração
    
    Args:
        c197_records: Lista de registros C197
        e111_records: Lista de registros E111
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    # Validar consistência entre ajustes de documento (C197) e apuração (E111)
    if c197_records and e111_records:
        # Agrupar por código de ajuste
        c197_por_cod = {}
        for c197 in c197_records:
            cod_aj = str(c197.get("COD_AJ", "")).strip()
            vl_cred = float(c197.get("VL_CRED_ORIG", 0) or 0)
            if cod_aj:
                c197_por_cod[cod_aj] = c197_por_cod.get(cod_aj, 0) + vl_cred
        
        e111_por_cod = {}
        for e111 in e111_records:
            cod_aj = str(e111.get("COD_AJ_APUR", "")).strip()
            vl_aj = float(e111.get("VL_AJ_APUR", 0) or 0)
            if cod_aj:
                e111_por_cod[cod_aj] = e111_por_cod.get(cod_aj, 0) + vl_aj
        
        # Comparar valores
        for cod_aj in set(list(c197_por_cod.keys()) + list(e111_por_cod.keys())):
            vl_c197 = c197_por_cod.get(cod_aj, 0)
            vl_e111 = e111_por_cod.get(cod_aj, 0)
            
            if abs(vl_c197 - vl_e111) > 0.01:
                resultado["valido"] = False
                resultado["divergencias"].append(
                    f"Divergência no ajuste {cod_aj}: C197={vl_c197}, E111={vl_e111}"
                )
    
    return resultado


def identificar_cenarios_simples_nacional(
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Identifica cenários específicos do Simples Nacional
    
    Args:
        c100_record: Registro C100
        c170_items: Lista de C170s
    
    Returns:
        Informações sobre o cenário
    """
    # Verificar se é Simples Nacional
    # (isso pode depender de campos específicos ou configuração externa)
    
    # Por enquanto, retornar estrutura básica
    return {
        "simples_nacional": True,  # Assumir que é Simples Nacional para validação
        "cenarios": []
    }


def validar_regras_simples_nacional(
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]],
    c197_records: List[Dict[str, Any]] = None,
    e111_records: List[Dict[str, Any]] = None
) -> ResultadoValidacaoSimplesNacional:
    """
    Valida regras específicas do regime Simples Nacional
    
    Args:
        c100_record: Registro C100
        c170_items: Lista de C170s
        c197_records: Lista de C197s
        e111_records: Lista de E111s
    
    Returns:
        ResultadoValidacaoSimplesNacional
    """
    divergencias = []
    
    # 1. Buscar créditos em múltiplos locais
    creditos = buscar_credito_multiplos_locais(
        c170_items=c170_items,
        c197_records=c197_records or [],
        e111_records=e111_records or []
    )
    
    # 2. Validar ajustes de documento e apuração
    validacao_ajustes = validar_ajustes_documento_apuracao(
        c197_records=c197_records or [],
        e111_records=e111_records or []
    )
    
    if not validacao_ajustes["valido"]:
        divergencias.extend(validacao_ajustes["divergencias"])
    
    # 3. Identificar cenários específicos
    cenarios = identificar_cenarios_simples_nacional(
        c100_record=c100_record,
        c170_items=c170_items
    )
    
    valido = len(divergencias) == 0
    
    return ResultadoValidacaoSimplesNacional(
        valido=valido,
        divergencias=divergencias,
        creditos_encontrados=creditos
    )


