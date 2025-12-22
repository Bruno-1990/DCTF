#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Operações Especiais
Identifica e valida cenários especiais (cupom, referência, CFOPs específicos).
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ItemChecklist:
    """Item do checklist de validação"""
    descricao: str
    valido: bool
    observacao: Optional[str] = None


@dataclass
class ChecklistOperacao:
    """Checklist de validação para uma operação especial"""
    tipo_operacao: str
    itens: List[ItemChecklist]
    valido: bool


@dataclass
class ResultadoValidacaoOperacaoEspecial:
    """Resultado da validação de operação especial"""
    tipo_operacao: str
    valido: bool
    divergencias: List[str]
    checklist: ChecklistOperacao


# CFOPs especiais
CFOPS_DEVOLUCAO = ["1201", "1202", "1203", "1204", "2201", "2202", "2203", "2204"]
CFOPS_RETORNO = ["1411", "1412", "1413", "1414", "2411", "2412", "2413", "2414"]
CFOPS_REMESSA = ["1949", "2949", "3949", "4949", "5949", "6949", "7949", "8949", "9949"]


def identificar_cenarios_especiais(c100_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Identifica cenários especiais (cupom, referência, CFOPs específicos)
    
    Args:
        c100_record: Registro C100
    
    Returns:
        Informações sobre o cenário especial
    """
    cod_mod = str(c100_record.get("COD_MOD", "")).strip()
    cod_sit = str(c100_record.get("COD_SIT", "")).strip()
    cfop = str(c100_record.get("CFOP", "")).strip()
    
    tipo_operacao = "normal"
    caracteristicas = []
    
    # 1. Cupom Fiscal (COD_MOD = 02)
    if cod_mod == "02":
        tipo_operacao = "cupom_fiscal"
        caracteristicas.append("cupom_fiscal")
    
    # 2. Nota de Referência (COD_SIT = 04)
    if cod_sit == "04":
        tipo_operacao = "nota_referencia"
        caracteristicas.append("nota_referencia")
    
    # 3. CFOPs de Devolução
    if cfop in CFOPS_DEVOLUCAO:
        tipo_operacao = "devolucao"
        caracteristicas.append("devolucao")
    
    # 4. CFOPs de Retorno
    if cfop in CFOPS_RETORNO:
        tipo_operacao = "retorno"
        caracteristicas.append("retorno")
    
    # 5. CFOPs de Remessa para Conserto/Reparo
    if cfop in CFOPS_REMESSA:
        tipo_operacao = "remessa_conserto"
        caracteristicas.append("remessa_conserto")
    
    return {
        "tipo_operacao": tipo_operacao,
        "caracteristicas": caracteristicas,
        "cod_mod": cod_mod,
        "cod_sit": cod_sit,
        "cfop": cfop
    }


def aplicar_checklist_operacao_especial(
    tipo_operacao: str,
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]]
) -> ChecklistOperacao:
    """
    Aplica checklist próprio para cada cenário
    
    Args:
        tipo_operacao: Tipo de operação especial
        c100_record: Registro C100
        c170_items: Lista de C170s
    
    Returns:
        ChecklistOperacao
    """
    itens = []
    
    if tipo_operacao == "cupom_fiscal":
        # Checklist para cupom fiscal
        itens.append(ItemChecklist(
            descricao="Cupom fiscal deve ter COD_MOD = 02",
            valido=str(c100_record.get("COD_MOD", "")).strip() == "02"
        ))
        itens.append(ItemChecklist(
            descricao="Cupom fiscal não deve ter C170s",
            valido=len(c170_items) == 0
        ))
    
    elif tipo_operacao == "nota_referencia":
        # Checklist para nota de referência
        itens.append(ItemChecklist(
            descricao="Nota de referência deve ter COD_SIT = 04",
            valido=str(c100_record.get("COD_SIT", "")).strip() == "04"
        ))
    
    elif tipo_operacao == "devolucao":
        # Checklist para devolução
        itens.append(ItemChecklist(
            descricao="Devolução deve ter CFOP de devolução",
            valido=str(c100_record.get("CFOP", "")).strip() in CFOPS_DEVOLUCAO
        ))
        itens.append(ItemChecklist(
            descricao="Devolução deve ter CHV_NFE_REF (chave da nota original)",
            valido=bool(c100_record.get("CHV_NFE_REF", ""))
        ))
    
    elif tipo_operacao == "retorno":
        # Checklist para retorno
        itens.append(ItemChecklist(
            descricao="Retorno deve ter CFOP de retorno",
            valido=str(c100_record.get("CFOP", "")).strip() in CFOPS_RETORNO
        ))
    
    elif tipo_operacao == "remessa_conserto":
        # Checklist para remessa para conserto
        itens.append(ItemChecklist(
            descricao="Remessa para conserto deve ter CFOP 1949/2949/etc",
            valido=str(c100_record.get("CFOP", "")).strip() in CFOPS_REMESSA
        ))
    
    else:
        # Operação normal - checklist básico
        itens.append(ItemChecklist(
            descricao="Operação normal",
            valido=True
        ))
    
    valido = all(item.valido for item in itens)
    
    return ChecklistOperacao(
        tipo_operacao=tipo_operacao,
        itens=itens,
        valido=valido
    )


def validar_regras_operacao_especial(
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]]
) -> ResultadoValidacaoOperacaoEspecial:
    """
    Valida regras específicas de cada tipo de operação
    
    Args:
        c100_record: Registro C100
        c170_items: Lista de C170s
    
    Returns:
        ResultadoValidacaoOperacaoEspecial
    """
    # 1. Identificar cenário especial
    cenario = identificar_cenarios_especiais(c100_record)
    tipo_operacao = cenario["tipo_operacao"]
    
    # 2. Aplicar checklist
    checklist = aplicar_checklist_operacao_especial(
        tipo_operacao=tipo_operacao,
        c100_record=c100_record,
        c170_items=c170_items
    )
    
    # 3. Gerar divergências
    divergencias = []
    for item in checklist.itens:
        if not item.valido:
            divergencias.append(f"{item.descricao}: {item.observacao or 'Falhou'}")
    
    valido = len(divergencias) == 0 and checklist.valido
    
    return ResultadoValidacaoOperacaoEspecial(
        tipo_operacao=tipo_operacao,
        valido=valido,
        divergencias=divergencias,
        checklist=checklist
    )



