#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Algoritmo de Correção C100
Implementa correções automáticas nos registros C100 baseadas em dados do XML.
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
class ResultadoCorrecaoC100:
    """Resultado da correção de um C100"""
    corrigido: bool
    campo_corrigido: Optional[str] = None
    valor_antigo: Optional[Any] = None
    valor_novo: Optional[Any] = None
    timestamp: Optional[datetime] = None
    log: Optional[str] = None
    correcoes_aplicadas: List[CorrecaoAplicada] = field(default_factory=list)


def _parsear_data_xml(data_xml: Any) -> Optional[str]:
    """
    Converte data do XML para formato DDMMYYYY do SPED
    
    Args:
        data_xml: Data do XML (pode ser ISO, YYYYMMDD, etc.)
    
    Returns:
        Data no formato DDMMYYYY ou None
    """
    if not data_xml:
        return None
    
    data_str = str(data_xml).strip()
    
    # Formato ISO: 2024-01-15 ou 2024-01-15T10:30:00
    if "T" in data_str:
        data_str = data_str.split("T")[0]
    
    if "-" in data_str:
        # Formato YYYY-MM-DD
        partes = data_str.split("-")
        if len(partes) == 3:
            ano, mes, dia = partes
            return f"{dia}{mes}{ano}"  # DDMMYYYY
    
    # Formato YYYYMMDD
    if len(data_str) == 8 and data_str.isdigit():
        ano = data_str[:4]
        mes = data_str[4:6]
        dia = data_str[6:8]
        return f"{dia}{mes}{ano}"  # DDMMYYYY
    
    # Formato DDMMYYYY (já está correto)
    if len(data_str) == 8 and data_str.isdigit():
        return data_str
    
    return None


def corrigir_vl_doc_c100(
    c100_record: Dict[str, Any],
    xml_note: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC100:
    """
    Corrige VL_DOC do C100 baseado em XML
    
    Args:
        c100_record: Registro C100
        xml_note: Nota XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC100
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC100(corrigido=False)
    
    vl_doc_c100 = float(c100_record.get("VL_DOC", 0) or 0)
    vnf_xml = float(xml_note.get("vNF", 0) or 0)
    
    if abs(vl_doc_c100 - vnf_xml) < 0.01:
        # Valores já estão iguais (dentro da tolerância)
        return ResultadoCorrecaoC100(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção VL_DOC: {vl_doc_c100:.2f} → {vnf_xml:.2f}"
    
    return ResultadoCorrecaoC100(
        corrigido=True,
        campo_corrigido="VL_DOC",
        valor_antigo=vl_doc_c100,
        valor_novo=vnf_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("VL_DOC", vl_doc_c100, vnf_xml, timestamp)]
    )


def corrigir_dt_doc_c100(
    c100_record: Dict[str, Any],
    xml_note: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC100:
    """
    Corrige DT_DOC do C100 baseado em XML
    
    Args:
        c100_record: Registro C100
        xml_note: Nota XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC100
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC100(corrigido=False)
    
    dt_doc_c100 = str(c100_record.get("DT_DOC", "")).strip()
    d_emi_xml = xml_note.get("dEmi") or xml_note.get("dhEmi")
    
    dt_doc_xml = _parsear_data_xml(d_emi_xml)
    
    if not dt_doc_xml:
        return ResultadoCorrecaoC100(corrigido=False)
    
    if dt_doc_c100 == dt_doc_xml:
        # Datas já são iguais
        return ResultadoCorrecaoC100(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção DT_DOC: {dt_doc_c100} → {dt_doc_xml}"
    
    return ResultadoCorrecaoC100(
        corrigido=True,
        campo_corrigido="DT_DOC",
        valor_antigo=dt_doc_c100,
        valor_novo=dt_doc_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("DT_DOC", dt_doc_c100, dt_doc_xml, timestamp)]
    )


def corrigir_dt_e_s_c100(
    c100_record: Dict[str, Any],
    xml_note: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC100:
    """
    Corrige DT_E_S do C100 baseado em XML
    
    Args:
        c100_record: Registro C100
        xml_note: Nota XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC100
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC100(corrigido=False)
    
    dt_e_s_c100 = str(c100_record.get("DT_E_S", "")).strip()
    d_emi_xml = xml_note.get("dEmi") or xml_note.get("dhEmi")
    
    dt_e_s_xml = _parsear_data_xml(d_emi_xml)
    
    if not dt_e_s_xml:
        return ResultadoCorrecaoC100(corrigido=False)
    
    if dt_e_s_c100 == dt_e_s_xml:
        # Datas já são iguais
        return ResultadoCorrecaoC100(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção DT_E_S: {dt_e_s_c100} → {dt_e_s_xml}"
    
    return ResultadoCorrecaoC100(
        corrigido=True,
        campo_corrigido="DT_E_S",
        valor_antigo=dt_e_s_c100,
        valor_novo=dt_e_s_xml,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("DT_E_S", dt_e_s_c100, dt_e_s_xml, timestamp)]
    )


def corrigir_cod_sit_c100(
    c100_record: Dict[str, Any],
    xml_note: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC100:
    """
    Corrige COD_SIT do C100 quando aplicável
    
    Args:
        c100_record: Registro C100
        xml_note: Nota XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC100
    """
    if score < SCORE_MINIMO_CORRECAO:
        return ResultadoCorrecaoC100(corrigido=False)
    
    cod_sit_c100 = str(c100_record.get("COD_SIT", "")).strip()
    
    # Verificar eventos no XML
    eventos = xml_note.get("eventos", [])
    
    # Verificar se há cancelamento
    tem_cancelamento = any(
        evento.get("tpEvento") == "110111" for evento in eventos
    )
    
    # Verificar se há denegação
    tem_denegacao = any(
        evento.get("tpEvento") in ["110110", "110112"] for evento in eventos
    )
    
    # Verificar se há inutilização
    tem_inutilizacao = any(
        evento.get("tpEvento") == "110111" for evento in eventos
    )
    
    cod_sit_correto = None
    if tem_cancelamento:
        cod_sit_correto = "02"
    elif tem_denegacao:
        cod_sit_correto = "03"
    elif tem_inutilizacao:
        cod_sit_correto = "05"
    else:
        # Documento autorizado
        cod_sit_correto = "00"
    
    if cod_sit_c100 == cod_sit_correto:
        # COD_SIT já está correto
        return ResultadoCorrecaoC100(corrigido=False)
    
    timestamp = datetime.now()
    log = f"[{timestamp.isoformat()}] Correção COD_SIT: {cod_sit_c100} → {cod_sit_correto}"
    
    return ResultadoCorrecaoC100(
        corrigido=True,
        campo_corrigido="COD_SIT",
        valor_antigo=cod_sit_c100,
        valor_novo=cod_sit_correto,
        timestamp=timestamp,
        log=log,
        correcoes_aplicadas=[CorrecaoAplicada("COD_SIT", cod_sit_c100, cod_sit_correto, timestamp)]
    )


def aplicar_correcoes_c100(
    c100_record: Dict[str, Any],
    xml_note: Dict[str, Any],
    score: float
) -> ResultadoCorrecaoC100:
    """
    Aplica todas as correções possíveis em um C100
    
    Args:
        c100_record: Registro C100
        xml_note: Nota XML
        score: Score de confiança do match
    
    Returns:
        ResultadoCorrecaoC100 com todas as correções aplicadas
    """
    correcoes_aplicadas = []
    logs = []
    
    # 1. Corrigir VL_DOC
    resultado_vl = corrigir_vl_doc_c100(c100_record, xml_note, score)
    if resultado_vl.corrigido:
        correcoes_aplicadas.extend(resultado_vl.correcoes_aplicadas)
        logs.append(resultado_vl.log)
    
    # 2. Corrigir DT_DOC
    resultado_dt_doc = corrigir_dt_doc_c100(c100_record, xml_note, score)
    if resultado_dt_doc.corrigido:
        correcoes_aplicadas.extend(resultado_dt_doc.correcoes_aplicadas)
        logs.append(resultado_dt_doc.log)
    
    # 3. Corrigir DT_E_S
    resultado_dt_e_s = corrigir_dt_e_s_c100(c100_record, xml_note, score)
    if resultado_dt_e_s.corrigido:
        correcoes_aplicadas.extend(resultado_dt_e_s.correcoes_aplicadas)
        logs.append(resultado_dt_e_s.log)
    
    # 4. Corrigir COD_SIT (quando aplicável)
    resultado_cod_sit = corrigir_cod_sit_c100(c100_record, xml_note, score)
    if resultado_cod_sit.corrigido:
        correcoes_aplicadas.extend(resultado_cod_sit.correcoes_aplicadas)
        logs.append(resultado_cod_sit.log)
    
    if correcoes_aplicadas:
        return ResultadoCorrecaoC100(
            corrigido=True,
            timestamp=datetime.now(),
            log="\n".join(logs),
            correcoes_aplicadas=correcoes_aplicadas
        )
    else:
        return ResultadoCorrecaoC100(corrigido=False)

