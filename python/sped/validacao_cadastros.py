#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Cadastros
Valida que todos os códigos referenciados no SPED existem nos cadastros correspondentes.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoValidacaoCadastros:
    """Resultado da validação de cadastros"""
    valido: bool
    codigos_nao_encontrados: List[str]
    severidade: str  # "alta" para erros estruturais
    tipo_cadastro: str  # "0150", "0200", "0190", "0220"
    registros_afetados: List[Dict[str, Any]]


def validar_cadastro_participantes(
    c100_records: List[Dict[str, Any]],
    cadastro_0150: Dict[str, Dict[str, Any]]
) -> ResultadoValidacaoCadastros:
    """
    Valida que COD_PART do C100 existe no cadastro 0150
    
    Args:
        c100_records: Lista de registros C100
        cadastro_0150: Dicionário de participantes (chave: COD_PART)
    
    Returns:
        ResultadoValidacaoCadastros
    """
    codigos_nao_encontrados = []
    registros_afetados = []
    
    # Obter conjunto de COD_PART válidos
    cod_part_validos = set(cadastro_0150.keys())
    
    # Validar cada C100
    for c100 in c100_records:
        cod_part = str(c100.get("COD_PART", "")).strip()
        
        if cod_part and cod_part not in cod_part_validos:
            codigos_nao_encontrados.append(cod_part)
            registros_afetados.append({
                "registro": "C100",
                "cod_part": cod_part,
                "chv_nfe": c100.get("CHV_NFE", "")
            })
    
    valido = len(codigos_nao_encontrados) == 0
    
    return ResultadoValidacaoCadastros(
        valido=valido,
        codigos_nao_encontrados=list(set(codigos_nao_encontrados)),
        severidade="alta",  # Erro estrutural
        tipo_cadastro="0150",
        registros_afetados=registros_afetados
    )


def validar_cadastro_itens(
    c170_records: List[Dict[str, Any]],
    cadastro_0200: Dict[str, Dict[str, Any]]
) -> ResultadoValidacaoCadastros:
    """
    Valida que COD_ITEM do C170 existe no cadastro 0200
    
    Args:
        c170_records: Lista de registros C170
        cadastro_0200: Dicionário de itens (chave: COD_ITEM)
    
    Returns:
        ResultadoValidacaoCadastros
    """
    codigos_nao_encontrados = []
    registros_afetados = []
    
    # Obter conjunto de COD_ITEM válidos
    cod_item_validos = set(cadastro_0200.keys())
    
    # Validar cada C170
    for c170 in c170_records:
        cod_item = str(c170.get("COD_ITEM", "")).strip()
        
        if cod_item and cod_item not in cod_item_validos:
            codigos_nao_encontrados.append(cod_item)
            registros_afetados.append({
                "registro": "C170",
                "cod_item": cod_item,
                "cfop": c170.get("CFOP", ""),
                "cst": c170.get("CST_ICMS", "")
            })
    
    valido = len(codigos_nao_encontrados) == 0
    
    return ResultadoValidacaoCadastros(
        valido=valido,
        codigos_nao_encontrados=list(set(codigos_nao_encontrados)),
        severidade="alta",  # Erro estrutural
        tipo_cadastro="0200",
        registros_afetados=registros_afetados
    )


def validar_cadastro_unidades(
    c170_records: List[Dict[str, Any]],
    cadastro_0190: Dict[str, Dict[str, Any]]
) -> ResultadoValidacaoCadastros:
    """
    Valida que UNID do C170 existe no cadastro 0190
    
    Args:
        c170_records: Lista de registros C170
        cadastro_0190: Dicionário de unidades (chave: UNID)
    
    Returns:
        ResultadoValidacaoCadastros
    """
    codigos_nao_encontrados = []
    registros_afetados = []
    
    # Obter conjunto de UNID válidos
    unid_validos = set(cadastro_0190.keys())
    
    # Validar cada C170
    for c170 in c170_records:
        unid = str(c170.get("UNID", "")).strip()
        
        if unid and unid not in unid_validos:
            codigos_nao_encontrados.append(unid)
            registros_afetados.append({
                "registro": "C170",
                "unid": unid,
                "cod_item": c170.get("COD_ITEM", "")
            })
    
    valido = len(codigos_nao_encontrados) == 0
    
    return ResultadoValidacaoCadastros(
        valido=valido,
        codigos_nao_encontrados=list(set(codigos_nao_encontrados)),
        severidade="alta",  # Erro estrutural
        tipo_cadastro="0190",
        registros_afetados=registros_afetados
    )


def validar_conversao_unidades(
    c170_records: List[Dict[str, Any]],
    cadastro_0220: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Valida coerência na conversão de unidades (0220)
    
    Args:
        c170_records: Lista de registros C170
        cadastro_0220: Dicionário de conversões (chave: COD_ITEM)
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    # Validar cada C170 que tem conversão
    for c170 in c170_records:
        cod_item = str(c170.get("COD_ITEM", "")).strip()
        
        if cod_item in cadastro_0220:
            conversao = cadastro_0220[cod_item]
            unid = str(c170.get("UNID", "")).strip()
            unid_conversao = str(conversao.get("UNID", "")).strip()
            
            # Validar que a unidade do C170 corresponde à conversão
            if unid != unid_conversao:
                resultado["valido"] = False
                resultado["divergencias"].append(
                    f"Unidade {unid} do item {cod_item} não corresponde à conversão {unid_conversao}"
                )
    
    return resultado

