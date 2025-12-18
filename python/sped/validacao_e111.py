#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validação de Apuração - E111 (Ajustes)
Valida ajustes da apuração.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ResultadoValidacaoE111:
    """Resultado da validação de E111"""
    valido: bool
    ajustes_sem_justificativa: List[str]
    ajustes_sem_rastreabilidade: List[str]
    classificacoes: List[Dict[str, Any]]


def validar_codigo_motivo_ajuste(e111_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida que todo ajuste tem código/motivo
    
    Args:
        e111_record: Registro E111
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    cod_aj_apur = str(e111_record.get("COD_AJ_APUR", "")).strip()
    descr_compl_aj = str(e111_record.get("DESCR_COMPL_AJ", "")).strip()
    
    # Deve ter código OU descrição
    if not cod_aj_apur and not descr_compl_aj:
        resultado["valido"] = False
        resultado["divergencias"].append(
            "Ajuste sem código (COD_AJ_APUR) e sem descrição (DESCR_COMPL_AJ)"
        )
    elif not cod_aj_apur:
        resultado["valido"] = False
        resultado["divergencias"].append(
            "Ajuste sem código (COD_AJ_APUR)"
        )
    
    return resultado


def validar_rastreabilidade_ajuste(e111_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida rastreabilidade (origem/evidência)
    
    Args:
        e111_record: Registro E111
    
    Returns:
        Resultado da validação
    """
    resultado = {
        "valido": True,
        "divergencias": []
    }
    
    origem = str(e111_record.get("ORIGEM", "")).strip()
    descr_compl_aj = str(e111_record.get("DESCR_COMPL_AJ", "")).strip()
    
    # Rastreabilidade pode estar na descrição ou em campo específico
    # Se não há origem explícita, verificar se descrição menciona origem
    if not origem:
        # Verificar se descrição menciona origem comum (C170, C100, etc)
        descr_upper = descr_compl_aj.upper()
        tem_origem_implicita = any(
            ref in descr_upper for ref in ["C170", "C100", "C190", "ORIGEM", "ORIGINADO", "ORIGIN", "NOTA", "DOCUMENTO"]
        )
        
        # Se descrição está vazia ou muito genérica, considerar sem rastreabilidade
        if not descr_compl_aj or len(descr_compl_aj.strip()) < 10:
            tem_origem_implicita = False
        
        if not tem_origem_implicita:
            resultado["valido"] = False
            resultado["divergencias"].append(
                "Ajuste sem rastreabilidade (origem/evidência não identificada)"
            )
    
    return resultado


def classificar_impacto_risco_ajuste(e111_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Classifica impacto e risco dos ajustes
    
    Args:
        e111_record: Registro E111
    
    Returns:
        Classificação do ajuste
    """
    vl_aj_apur = abs(float(e111_record.get("VL_AJ_APUR", 0) or 0))
    
    # Classificar impacto baseado no valor
    if vl_aj_apur > 10000:
        impacto = "alto"
    elif vl_aj_apur > 1000:
        impacto = "medio"
    else:
        impacto = "baixo"
    
    # Classificar risco baseado na presença de rastreabilidade
    tem_rastreabilidade = bool(
        str(e111_record.get("ORIGEM", "")).strip() or
        any(ref in str(e111_record.get("DESCR_COMPL_AJ", "")).upper() 
            for ref in ["C170", "C100", "C190", "ORIGEM"])
    )
    
    risco = "alto" if not tem_rastreabilidade else ("medio" if vl_aj_apur > 1000 else "baixo")
    
    return {
        "impacto": impacto,
        "risco": risco,
        "valor": vl_aj_apur,
        "tem_rastreabilidade": tem_rastreabilidade
    }


def detectar_ajustes_sem_justificativa(
    e111_records: List[Dict[str, Any]]
) -> ResultadoValidacaoE111:
    """
    Detecta ajustes sem justificativa
    
    Args:
        e111_records: Lista de registros E111
    
    Returns:
        ResultadoValidacaoE111
    """
    ajustes_sem_justificativa = []
    ajustes_sem_rastreabilidade = []
    classificacoes = []
    
    for e111 in e111_records:
        cod_aj = str(e111.get("COD_AJ_APUR", "")).strip()
        descr = str(e111.get("DESCR_COMPL_AJ", "")).strip()
        
        # Verificar se tem justificativa (código ou descrição)
        if not cod_aj and not descr:
            ajustes_sem_justificativa.append(
                f"Ajuste sem código e sem descrição (VL_AJ_APUR={e111.get('VL_AJ_APUR', 0)})"
            )
        
        # Verificar rastreabilidade
        validacao_rastreabilidade = validar_rastreabilidade_ajuste(e111)
        if not validacao_rastreabilidade["valido"]:
            ajustes_sem_rastreabilidade.append(
                f"Ajuste {cod_aj or 'sem código'} sem rastreabilidade"
            )
        
        # Classificar
        classificacao = classificar_impacto_risco_ajuste(e111)
        classificacoes.append({
            "cod_aj_apur": cod_aj,
            **classificacao
        })
    
    valido = len(ajustes_sem_justificativa) == 0 and len(ajustes_sem_rastreabilidade) == 0
    
    return ResultadoValidacaoE111(
        valido=valido,
        ajustes_sem_justificativa=ajustes_sem_justificativa,
        ajustes_sem_rastreabilidade=ajustes_sem_rastreabilidade,
        classificacoes=classificacoes
    )

