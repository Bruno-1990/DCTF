#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Cruzamento Estrutural XML → C100
Realiza match robusto entre XMLs autorizados e registros C100 no SPED.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple, Set
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import logging
import pandas as pd

from match_robusto import match_xml_c100_score, SCORE_MINIMO_CORRECAO_AUTOMATICA
from parsers import parse_efd_c100, parse_xml_nfe
from common import norm_int_like

logger = logging.getLogger(__name__)


# COD_SIT para diferentes tipos de documentos
COD_SIT_AUTORIZADO = {"00", "01", "0", ""}
COD_SIT_CANCELADO = {"02", "2"}
COD_SIT_DENEGADO = {"03", "3"}
COD_SIT_INUTILIZADO = {"05", "5"}


@dataclass
class MatchResult:
    """Resultado de um match XML → C100"""
    xml_chave: str
    c100_chave: Optional[str]
    score: float
    tipo_match: str  # "chave", "fallback", "nenhum"
    c100_record: Optional[Dict[str, Any]]
    xml_record: Dict[str, Any]
    detalhes: Dict[str, Any]
    periodo_valido: bool
    cod_sit: Optional[str]
    tipo_documento: str  # "autorizado", "cancelado", "denegado", "inutilizado"


@dataclass
class MatchReport:
    """Relatório completo de matches XML → C100"""
    matches_encontrados: List[MatchResult]
    xmls_sem_c100: List[Dict[str, Any]]
    c100s_sem_xml: List[Dict[str, Any]]
    duplicidades_chave: List[Dict[str, Any]]
    duplicidades_fallback: List[Dict[str, Any]]
    por_tipo_documento: Dict[str, List[MatchResult]]


def normalizar_cnpj(cnpj: Optional[str]) -> str:
    """Remove formatação do CNPJ"""
    if not cnpj:
        return ""
    return "".join(filter(str.isdigit, str(cnpj)))


def validar_periodo_c100(
    c100_record: Dict[str, Any],
    periodo_ano: int,
    periodo_mes: int
) -> bool:
    """
    Valida se o C100 está no período correto
    
    Args:
        c100_record: Registro C100
        periodo_ano: Ano do período esperado
        periodo_mes: Mês do período esperado
    
    Returns:
        True se está no período correto
    """
    dt_doc = str(c100_record.get("DT_DOC", "")).strip()
    if not dt_doc or len(dt_doc) != 8:
        return False
    
    try:
        # DT_DOC está no formato DDMMYYYY
        dia = int(dt_doc[0:2])
        mes = int(dt_doc[2:4])
        ano = int(dt_doc[4:8])
        
        return ano == periodo_ano and mes == periodo_mes
    except (ValueError, IndexError):
        return False


def classificar_tipo_documento(cod_sit: Optional[str]) -> str:
    """
    Classifica o tipo de documento baseado em COD_SIT
    
    Args:
        cod_sit: COD_SIT do C100
    
    Returns:
        "autorizado", "cancelado", "denegado", "inutilizado" ou "desconhecido"
    """
    if not cod_sit:
        return "desconhecido"
    
    cod_sit = str(cod_sit).strip()
    
    if cod_sit in COD_SIT_AUTORIZADO:
        return "autorizado"
    elif cod_sit in COD_SIT_CANCELADO:
        return "cancelado"
    elif cod_sit in COD_SIT_DENEGADO:
        return "denegado"
    elif cod_sit in COD_SIT_INUTILIZADO:
        return "inutilizado"
    else:
        return "desconhecido"


def detectar_duplicidades_chave(efd_c100: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detecta duplicidades por chave (CHV_NFE)
    
    Args:
        efd_c100: DataFrame com registros C100
    
    Returns:
        Lista de duplicidades encontradas
    """
    duplicidades = []
    
    if efd_c100.empty:
        return duplicidades
    
    # Contar ocorrências de cada chave
    chaves_counts = efd_c100["CHV_NFE"].value_counts()
    chaves_duplicadas = chaves_counts[chaves_counts > 1]
    
    for chave, count in chaves_duplicadas.items():
        if chave and str(chave).strip():
            registros = efd_c100[efd_c100["CHV_NFE"] == chave]
            duplicidades.append({
                "chave": chave,
                "quantidade": int(count),
                "registros": registros.to_dict("records")
            })
    
    return duplicidades


def detectar_duplicidades_fallback(efd_c100: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detecta duplicidades por combinação modelo+série+número+emitente
    
    Args:
        efd_c100: DataFrame com registros C100
    
    Returns:
        Lista de duplicidades encontradas
    """
    duplicidades = []
    
    if efd_c100.empty:
        return duplicidades
    
    # Criar chave composta: COD_MOD + SER + NUM_DOC + COD_PART
    efd_c100_copy = efd_c100.copy()
    efd_c100_copy["chave_composta"] = (
        efd_c100_copy["COD_MOD"].astype(str).str.strip() + "|" +
        efd_c100_copy["SER"].astype(str).str.strip() + "|" +
        efd_c100_copy["NUM_DOC"].astype(str).str.strip() + "|" +
        efd_c100_copy["COD_PART"].astype(str).str.strip()
    )
    
    # Contar ocorrências
    chaves_counts = efd_c100_copy["chave_composta"].value_counts()
    chaves_duplicadas = chaves_counts[chaves_counts > 1]
    
    for chave_composta, count in chaves_duplicadas.items():
        registros = efd_c100_copy[efd_c100_copy["chave_composta"] == chave_composta]
        duplicidades.append({
            "chave_composta": chave_composta,
            "quantidade": int(count),
            "registros": registros.to_dict("records")
        })
    
    return duplicidades


def match_xml_c100_completo(
    xml_notes: List[Dict[str, Any]],
    efd_c100: pd.DataFrame,
    periodo_ano: Optional[int] = None,
    periodo_mes: Optional[int] = None,
    map_0150: Optional[Dict[str, Dict[str, Any]]] = None
) -> MatchReport:
    """
    Realiza match completo entre XMLs e registros C100
    
    Args:
        xml_notes: Lista de notas XML
        efd_c100: DataFrame com registros C100
        periodo_ano: Ano do período (opcional, para validação)
        periodo_mes: Mês do período (opcional, para validação)
        map_0150: Mapa de participantes (COD_PART -> dados) para match por CNPJ
    
    Returns:
        MatchReport com todos os resultados
    """
    matches_encontrados = []
    xmls_sem_c100 = []
    c100s_sem_xml = []
    por_tipo_documento = {
        "autorizado": [],
        "cancelado": [],
        "denegado": [],
        "inutilizado": [],
        "desconhecido": []
    }
    
    # Criar índices para busca rápida
    efd_map_por_chave: Dict[str, Dict[str, Any]] = {}
    efd_map_por_fallback: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    c100_chaves_processadas: Set[str] = set()
    
    # Indexar C100s por chave
    for _, row in efd_c100.iterrows():
        chave = str(row.get("CHV_NFE", "")).strip()
        if chave:
            efd_map_por_chave[chave] = row.to_dict()
            c100_chaves_processadas.add(chave)
        
        # Indexar também por fallback (MOD + SER + NUM + COD_PART)
        mod = str(row.get("COD_MOD", "")).strip()
        ser = str(row.get("SER", "")).strip()
        num = str(row.get("NUM_DOC", "")).strip()
        cod_part = str(row.get("COD_PART", "")).strip()
        
        if mod and ser and num:
            chave_fallback = (mod, ser, num, cod_part)
            # Se já existe, não sobrescrever (manter o primeiro)
            if chave_fallback not in efd_map_por_fallback:
                efd_map_por_fallback[chave_fallback] = row.to_dict()
    
    # Processar cada XML
    for xml_note in xml_notes:
        xml_chave = str(xml_note.get("chave", "")).strip()
        if not xml_chave:
            continue
        
        # Tentar match por chave primeiro
        c100_record = efd_map_por_chave.get(xml_chave)
        tipo_match = "chave"
        score = 0.0
        detalhes = {}
        
        if c100_record:
            # Match por chave encontrado
            score, detalhes = match_xml_c100_score(xml_note, c100_record)
            tipo_match = "chave"
        else:
            # Tentar match por fallback
            mod_xml = str(xml_note.get("mod", "")).strip()
            serie_xml = str(xml_note.get("serie", "")).strip()
            num_xml = str(xml_note.get("nNF", "")).strip()
            
            # Tentar encontrar CNPJ do emitente no XML
            emit_cnpj = normalizar_cnpj(xml_note.get("emit_CNPJ"))
            dest_cnpj = normalizar_cnpj(xml_note.get("dest_CNPJ"))
            
            # Buscar COD_PART correspondente no map_0150
            cod_part_match = None
            if map_0150:
                for cod_part, dados_part in map_0150.items():
                    cnpj_part = normalizar_cnpj(dados_part.get("CNPJ") or dados_part.get("CPF"))
                    if cnpj_part == emit_cnpj or cnpj_part == dest_cnpj:
                        cod_part_match = cod_part
                        break
            
            # Tentar match por fallback
            if mod_xml and serie_xml and num_xml:
                # Tentar com COD_PART se encontrado
                if cod_part_match:
                    chave_fallback = (mod_xml, serie_xml, num_xml, cod_part_match)
                    c100_record = efd_map_por_fallback.get(chave_fallback)
                
                # Se não encontrou, tentar sem COD_PART (busca mais ampla)
                if not c100_record:
                    for chave_fallback, c100_candidate in efd_map_por_fallback.items():
                        if (chave_fallback[0] == mod_xml and
                            chave_fallback[1] == serie_xml and
                            chave_fallback[2] == num_xml):
                            c100_record = c100_candidate
                            break
                
                if c100_record:
                    score, detalhes = match_xml_c100_score(xml_note, c100_record)
                    tipo_match = "fallback"
        
        # Validar período se fornecido
        periodo_valido = True
        if periodo_ano and periodo_mes and c100_record:
            periodo_valido = validar_periodo_c100(c100_record, periodo_ano, periodo_mes)
        
        # Classificar tipo de documento
        cod_sit = c100_record.get("COD_SIT") if c100_record else None
        tipo_doc = classificar_tipo_documento(cod_sit)
        
        if c100_record and score >= SCORE_MINIMO_CORRECAO_AUTOMATICA:
            match_result = MatchResult(
                xml_chave=xml_chave,
                c100_chave=str(c100_record.get("CHV_NFE", "")).strip(),
                score=score,
                tipo_match=tipo_match,
                c100_record=c100_record,
                xml_record=xml_note,
                detalhes=detalhes,
                periodo_valido=periodo_valido,
                cod_sit=cod_sit,
                tipo_documento=tipo_doc
            )
            matches_encontrados.append(match_result)
            por_tipo_documento[tipo_doc].append(match_result)
        else:
            # XML sem C100 correspondente
            xmls_sem_c100.append({
                "chave": xml_chave,
                "mod": xml_note.get("mod"),
                "serie": xml_note.get("serie"),
                "nNF": xml_note.get("nNF"),
                "emit_CNPJ": xml_note.get("emit_CNPJ"),
                "dEmi": xml_note.get("dEmi"),
                "score_tentativa": score,
                "motivo": "Score insuficiente" if c100_record else "C100 não encontrado"
            })
    
    # Encontrar C100s sem XML correspondente
    xml_chaves_processadas = {str(xml.get("chave", "")).strip() for xml in xml_notes if xml.get("chave")}
    
    for _, row in efd_c100.iterrows():
        chave_c100 = str(row.get("CHV_NFE", "")).strip()
        
        # Se não tem chave, tentar por fallback
        if not chave_c100:
            mod = str(row.get("COD_MOD", "")).strip()
            ser = str(row.get("SER", "")).strip()
            num = str(row.get("NUM_DOC", "")).strip()
            
            # Verificar se existe XML correspondente por fallback
            encontrado = False
            for xml_note in xml_notes:
                mod_xml = str(xml_note.get("mod", "")).strip()
                serie_xml = str(xml_note.get("serie", "")).strip()
                num_xml = str(xml_note.get("nNF", "")).strip()
                
                if (mod_xml == mod and serie_xml == ser and num_xml == num):
                    encontrado = True
                    break
            
            if not encontrado:
                c100s_sem_xml.append({
                    "COD_MOD": mod,
                    "SER": ser,
                    "NUM_DOC": num,
                    "CHV_NFE": chave_c100 or "",
                    "COD_PART": row.get("COD_PART"),
                    "DT_DOC": row.get("DT_DOC"),
                    "VL_DOC": row.get("VL_DOC"),
                    "COD_SIT": row.get("COD_SIT"),
                    "motivo": "Chave vazia e fallback não encontrado"
                })
        elif chave_c100 not in xml_chaves_processadas:
            # Tem chave mas não tem XML correspondente
            c100s_sem_xml.append({
                "COD_MOD": row.get("COD_MOD"),
                "SER": row.get("SER"),
                "NUM_DOC": row.get("NUM_DOC"),
                "CHV_NFE": chave_c100,
                "COD_PART": row.get("COD_PART"),
                "DT_DOC": row.get("DT_DOC"),
                "VL_DOC": row.get("VL_DOC"),
                "COD_SIT": row.get("COD_SIT"),
                "motivo": "Chave não encontrada nos XMLs"
            })
    
    # Detectar duplicidades
    duplicidades_chave = detectar_duplicidades_chave(efd_c100)
    duplicidades_fallback = detectar_duplicidades_fallback(efd_c100)
    
    return MatchReport(
        matches_encontrados=matches_encontrados,
        xmls_sem_c100=xmls_sem_c100,
        c100s_sem_xml=c100s_sem_xml,
        duplicidades_chave=duplicidades_chave,
        duplicidades_fallback=duplicidades_fallback,
        por_tipo_documento=por_tipo_documento
    )


def gerar_relatorio_match(report: MatchReport) -> Dict[str, Any]:
    """
    Gera relatório estruturado do match XML → C100
    
    Args:
        report: MatchReport com resultados
    
    Returns:
        Dicionário com relatório estruturado
    """
    return {
        "resumo": {
            "total_matches": len(report.matches_encontrados),
            "total_xmls_sem_c100": len(report.xmls_sem_xml),
            "total_c100s_sem_xml": len(report.c100s_sem_xml),
            "total_duplicidades_chave": len(report.duplicidades_chave),
            "total_duplicidades_fallback": len(report.duplicidades_fallback),
            "por_tipo_documento": {
                tipo: len(matches) for tipo, matches in report.por_tipo_documento.items()
            }
        },
        "matches_encontrados": [
            {
                "xml_chave": m.xml_chave,
                "c100_chave": m.c100_chave,
                "score": m.score,
                "tipo_match": m.tipo_match,
                "periodo_valido": m.periodo_valido,
                "cod_sit": m.cod_sit,
                "tipo_documento": m.tipo_documento,
                "detalhes": m.detalhes
            }
            for m in report.matches_encontrados
        ],
        "xmls_sem_c100": report.xmls_sem_c100,
        "c100s_sem_xml": report.c100s_sem_xml,
        "duplicidades_chave": report.duplicidades_chave,
        "duplicidades_fallback": report.duplicidades_fallback
    }

