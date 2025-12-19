#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Validação C100 ↔ C170 (Itens)
Valida correspondência entre itens do XML e registros C170 no SPED.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DivergenciaItem:
    """Representa uma divergência encontrada em um item"""
    nItem: str
    campo: str
    valor_xml: Any
    valor_c170: Any
    severidade: str  # "alta", "media", "baixa"
    descricao: str


@dataclass
class ResultadoValidacaoC100C170:
    """Resultado da validação C100 ↔ C170"""
    contagem_valida: bool
    total_itens_xml: int
    total_itens_c170: int
    divergencias: List[DivergenciaItem]
    itens_sem_c170: List[Dict[str, Any]]
    c170s_sem_xml: List[Dict[str, Any]]


def validar_contagem_itens(
    xml_items: List[Dict[str, Any]],
    c170_items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Valida contagem de itens (nItem XML x NUM_ITEM C170)
    
    Args:
        xml_items: Lista de itens do XML
        c170_items: Lista de registros C170
    
    Returns:
        Dicionário com resultado da validação
    """
    total_xml = len(xml_items)
    total_c170 = len(c170_items)
    
    divergencias = []
    if total_xml != total_c170:
        divergencias.append({
            "campo": "CONTAGEM",
            "valor_xml": total_xml,
            "valor_c170": total_c170,
            "severidade": "alta",
            "descricao": f"Contagem divergente: XML tem {total_xml} itens, SPED tem {total_c170} itens"
        })
    
    return {
        "valido": len(divergencias) == 0,
        "total_xml": total_xml,
        "total_c170": total_c170,
        "divergencias": divergencias
    }


def validar_campos_fiscais(
    xml_item: Dict[str, Any],
    c170_item: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Valida campos fiscais: COD_ITEM, NCM, CFOP, CST
    
    Args:
        xml_item: Item do XML
        c170_item: Registro C170
    
    Returns:
        Dicionário com resultado da validação
    """
    divergencias = []
    
    # Validar COD_ITEM
    cod_item_xml = str(xml_item.get("COD_ITEM", "")).strip()
    cod_item_c170 = str(c170_item.get("COD_ITEM", "")).strip()
    if cod_item_xml and cod_item_c170 and cod_item_xml != cod_item_c170:
        divergencias.append({
            "campo": "COD_ITEM",
            "valor_xml": cod_item_xml,
            "valor_c170": cod_item_c170,
            "severidade": "media",
            "descricao": f"COD_ITEM divergente: XML={cod_item_xml}, C170={cod_item_c170}"
        })
    
    # Validar NCM
    ncm_xml = str(xml_item.get("NCM", "")).strip()
    ncm_c170 = str(c170_item.get("NCM", "")).strip()
    if ncm_xml and ncm_c170 and ncm_xml != ncm_c170:
        divergencias.append({
            "campo": "NCM",
            "valor_xml": ncm_xml,
            "valor_c170": ncm_c170,
            "severidade": "alta",
            "descricao": f"NCM divergente: XML={ncm_xml}, C170={ncm_c170}"
        })
    
    # Validar CFOP
    cfop_xml = str(xml_item.get("CFOP", "")).strip()
    cfop_c170 = str(c170_item.get("CFOP", "")).strip()
    if cfop_xml and cfop_c170 and cfop_xml != cfop_c170:
        divergencias.append({
            "campo": "CFOP",
            "valor_xml": cfop_xml,
            "valor_c170": cfop_c170,
            "severidade": "alta",
            "descricao": f"CFOP divergente: XML={cfop_xml}, C170={cfop_c170}"
        })
    
    # Validar CST
    cst_xml = str(xml_item.get("CST", "")).strip()
    cst_c170 = str(c170_item.get("CST_ICMS", "")).strip()
    if cst_xml and cst_c170 and cst_xml != cst_c170:
        divergencias.append({
            "campo": "CST",
            "valor_xml": cst_xml,
            "valor_c170": cst_c170,
            "severidade": "alta",
            "descricao": f"CST divergente: XML={cst_xml}, C170={cst_c170}"
        })
    
    return {
        "valido": len(divergencias) == 0,
        "divergencias": divergencias
    }


def validar_quantidades(
    xml_item: Dict[str, Any],
    c170_item: Dict[str, Any],
    tolerancia: float = 0.001
) -> Dict[str, Any]:
    """
    Valida quantidades: QTD e UNID do C170 vs XML
    
    Args:
        xml_item: Item do XML
        c170_item: Registro C170
        tolerancia: Tolerância para comparação de quantidades
    
    Returns:
        Dicionário com resultado da validação
    """
    divergencias = []
    
    # Validar QTD
    qtd_xml = float(xml_item.get("qCom", 0) or 0)
    qtd_c170 = float(c170_item.get("QTD", 0) or 0)
    
    if abs(qtd_xml - qtd_c170) > tolerancia:
        divergencias.append({
            "campo": "QTD",
            "valor_xml": qtd_xml,
            "valor_c170": qtd_c170,
            "severidade": "alta",
            "descricao": f"Quantidade divergente: XML={qtd_xml}, C170={qtd_c170}"
        })
    
    # Validar UNID
    unid_xml = str(xml_item.get("uCom", "")).strip().upper()
    unid_c170 = str(c170_item.get("UNID", "")).strip().upper()
    
    if unid_xml and unid_c170 and unid_xml != unid_c170:
        divergencias.append({
            "campo": "UNID",
            "valor_xml": unid_xml,
            "valor_c170": unid_c170,
            "severidade": "media",
            "descricao": f"Unidade divergente: XML={unid_xml}, C170={unid_c170}"
        })
    
    return {
        "valido": len(divergencias) == 0,
        "divergencias": divergencias
    }


def validar_valores(
    xml_item: Dict[str, Any],
    c170_item: Dict[str, Any],
    tolerancia: float = 0.01
) -> Dict[str, Any]:
    """
    Valida valores: VL_ITEM do C170 vs valor do item no XML
    
    Args:
        xml_item: Item do XML
        c170_item: Registro C170
        tolerancia: Tolerância para comparação de valores (em reais)
    
    Returns:
        Dicionário com resultado da validação
    """
    divergencias = []
    
    # Validar VL_ITEM
    vprod_xml = float(xml_item.get("vProd", 0) or 0)
    vitem_c170 = float(c170_item.get("VL_ITEM", 0) or 0)
    
    if abs(vprod_xml - vitem_c170) > tolerancia:
        divergencias.append({
            "campo": "VL_ITEM",
            "valor_xml": vprod_xml,
            "valor_c170": vitem_c170,
            "severidade": "alta",
            "descricao": f"Valor do item divergente: XML=R${vprod_xml:.2f}, C170=R${vitem_c170:.2f}"
        })
    
    return {
        "valido": len(divergencias) == 0,
        "divergencias": divergencias
    }


def validar_rateios(
    xml_item: Dict[str, Any],
    c170_item: Dict[str, Any],
    xml_note: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Identifica e valida rateios de frete, seguro, outros e desconto
    
    Args:
        xml_item: Item do XML
        c170_item: Registro C170
        xml_note: Nota XML completa (para totais de rateio)
    
    Returns:
        Dicionário com resultado da validação de rateios
    """
    # TODO: Implementar validação de rateios
    # Por enquanto, retorna estrutura vazia
    return {
        "valido": True,
        "rateios": []
    }


def validar_c100_c170(
    xml_note: Dict[str, Any],
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]]
) -> ResultadoValidacaoC100C170:
    """
    Valida correspondência completa entre itens do XML e registros C170 no SPED
    
    Args:
        xml_note: Nota XML completa
        c100_record: Registro C100 correspondente
        c170_items: Lista de registros C170
    
    Returns:
        ResultadoValidacaoC100C170 com todas as divergências encontradas
    """
    xml_items = xml_note.get("items", [])
    
    # 1. Validar contagem de itens
    resultado_contagem = validar_contagem_itens(xml_items, c170_items)
    
    # 2. Criar mapas para matching de itens
    xml_items_map = {str(item.get("nItem", "")).strip(): item for item in xml_items}
    c170_items_map = {str(item.get("NUM_ITEM", "")).strip(): item for item in c170_items}
    
    # 3. Validar cada item
    divergencias = []
    itens_sem_c170 = []
    c170s_sem_xml = []
    
    # Validar itens do XML
    for n_item, xml_item in xml_items_map.items():
        c170_item = c170_items_map.get(n_item)
        
        if not c170_item:
            itens_sem_c170.append(xml_item)
            divergencias.append(DivergenciaItem(
                nItem=n_item,
                campo="ITEM_FALTANTE",
                valor_xml="Item existe no XML",
                valor_c170="Item não encontrado no C170",
                severidade="alta",
                descricao=f"Item {n_item} não encontrado no C170"
            ))
            continue
        
        # Validar campos fiscais
        resultado_fiscais = validar_campos_fiscais(xml_item, c170_item)
        for div in resultado_fiscais["divergencias"]:
            divergencias.append(DivergenciaItem(
                nItem=n_item,
                campo=div["campo"],
                valor_xml=div["valor_xml"],
                valor_c170=div["valor_c170"],
                severidade=div["severidade"],
                descricao=div["descricao"]
            ))
        
        # Validar quantidades
        resultado_qtd = validar_quantidades(xml_item, c170_item)
        for div in resultado_qtd["divergencias"]:
            divergencias.append(DivergenciaItem(
                nItem=n_item,
                campo=div["campo"],
                valor_xml=div["valor_xml"],
                valor_c170=div["valor_c170"],
                severidade=div["severidade"],
                descricao=div["descricao"]
            ))
        
        # Validar valores
        resultado_valores = validar_valores(xml_item, c170_item)
        for div in resultado_valores["divergencias"]:
            divergencias.append(DivergenciaItem(
                nItem=n_item,
                campo=div["campo"],
                valor_xml=div["valor_xml"],
                valor_c170=div["valor_c170"],
                severidade=div["severidade"],
                descricao=div["descricao"]
            ))
    
    # Validar C170s sem XML correspondente
    for num_item, c170_item in c170_items_map.items():
        if num_item not in xml_items_map:
            c170s_sem_xml.append(c170_item)
            divergencias.append(DivergenciaItem(
                nItem=num_item,
                campo="ITEM_EXTRA",
                valor_xml="Item não existe no XML",
                valor_c170="Item existe no C170",
                severidade="media",
                descricao=f"Item {num_item} existe no C170 mas não no XML"
            ))
    
    return ResultadoValidacaoC100C170(
        contagem_valida=resultado_contagem["valido"],
        total_itens_xml=resultado_contagem["total_xml"],
        total_itens_c170=resultado_contagem["total_c170"],
        divergencias=divergencias,
        itens_sem_c170=itens_sem_c170,
        c170s_sem_xml=c170s_sem_xml
    )


