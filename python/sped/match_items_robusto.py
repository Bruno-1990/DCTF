#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema robusto de matching item a item XML ↔ C170 com múltiplos critérios.
Implementa matching multi-camadas, inferência de CFOP/CST e validação de confiança.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple, Union
from dataclasses import dataclass
from pathlib import Path
import logging
import re
from difflib import SequenceMatcher

from common import parse_decimal, norm_int_like
from parsers import split_sped_line

logger = logging.getLogger(__name__)

# Limiar mínimo de score para considerar match válido
SCORE_MINIMO_MATCH = 60.0
SCORE_ALTA_CONFIANCA = 85.0
SCORE_MEDIA_CONFIANCA = 70.0

# Tolerâncias para comparação
TOL_QUANTIDADE = 0.01  # 1%
TOL_VALOR_UNITARIO = 0.02  # 2%
TOL_VALOR_TOTAL = 0.05  # 5%


@dataclass
class ItemMatchResult:
    """Resultado de matching de item XML com C170"""
    xml_item: Dict[str, Any]
    c170_match: Optional[Dict[str, Any]]
    score: float  # 0-100
    tipo_match: str  # "exato", "ncm_qtd", "descricao", "0200", "fallback"
    confianca: str  # "ALTA", "MEDIA", "BAIXA"
    cfop_inferido: Optional[str]
    cst_inferido: Optional[str]
    confianca_cfop_cst: float  # 0-100
    detalhes: Dict[str, Any]


def normalizar_texto(texto: str) -> str:
    """Normaliza texto para comparação (remove acentos, maiúsculas, espaços)"""
    if not texto:
        return ""
    # Converter para maiúsculas e remover espaços extras
    texto = " ".join(str(texto).upper().split())
    # Remover caracteres especiais comuns
    texto = re.sub(r'[^\w\s]', '', texto)
    return texto.strip()


def similaridade_texto(texto1: str, texto2: str) -> float:
    """Calcula similaridade entre dois textos (0-1) usando SequenceMatcher"""
    if not texto1 or not texto2:
        return 0.0
    texto1_norm = normalizar_texto(texto1)
    texto2_norm = normalizar_texto(texto2)
    if not texto1_norm or not texto2_norm:
        return 0.0
    return SequenceMatcher(None, texto1_norm, texto2_norm).ratio()


def extrair_ncm_de_cod_item(cod_item: str) -> Optional[str]:
    """Tenta extrair NCM de COD_ITEM (pode ser código interno ou NCM direto)"""
    if not cod_item:
        return None
    cod_item = str(cod_item).strip()
    # Se tem 8 dígitos e é numérico, provavelmente é NCM
    if len(cod_item) >= 8 and cod_item[:8].isdigit():
        return cod_item[:8]
    # Se tem mais de 8 dígitos, pode ser código interno com NCM no início
    if len(cod_item) > 8:
        # Tentar extrair NCM dos primeiros 8 dígitos
        ncm_candidato = cod_item[:8]
        if ncm_candidato.isdigit():
            return ncm_candidato
    return None


def parse_efd_0200(file_path: Union[str, Path]) -> Dict[str, Dict[str, Any]]:
    """
    Parseia cadastro 0200 do SPED para mapear COD_ITEM → NCM e descrição.
    
    Retorna: {COD_ITEM: {"NCM": ..., "DESCR_ITEM": ..., "COD_ITEM": ...}}
    """
    map_0200: Dict[str, Dict[str, Any]] = {}
    try:
        if isinstance(file_path, str):
            path = Path(file_path)
        else:
            path = file_path
        if not path.exists():
            return map_0200
        
        with path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.strip().startswith("|0200|"):
                    fs = split_sped_line(ln, min_fields=10)
                    # 0200: REG(1), COD_ITEM(2), DESCR_ITEM(3), COD_BARRA(4), COD_ANT_ITEM(5),
                    #       UNID_INV(6), TIPO_ITEM(7), COD_NCM(8), EX_IPI(9), COD_GEN(10)
                    cod_item = (fs[2] or "").strip()
                    if cod_item:
                        map_0200[cod_item] = {
                            "COD_ITEM": cod_item,
                            "DESCR_ITEM": (fs[3] or "").strip(),
                            "NCM": (fs[8] or "").strip() if len(fs) > 8 else "",
                            "COD_BARRA": (fs[4] or "").strip() if len(fs) > 4 else "",
                            "TIPO_ITEM": (fs[7] or "").strip() if len(fs) > 7 else "",
                        }
    except Exception as e:
        logger.warning(f"Erro ao parsear 0200: {e}")
    
    return map_0200


def match_item_xml_sped_robusto(
    xml_item: Dict[str, Any],
    c170_items: List[Dict[str, Any]],
    map_0200: Optional[Dict[str, Dict[str, Any]]] = None,
    c100_info: Optional[Dict[str, Any]] = None,
    rules: Optional[Dict[str, Any]] = None
) -> ItemMatchResult:
    """
    Matching robusto de item XML com C170 usando múltiplos critérios.
    
    Estratégia de matching (em ordem de prioridade):
    
    CAMADA 1 - Match Exato por NUM_ITEM:
    - Se NUM_ITEM do XML = NUM_ITEM do C170 → Match perfeito (score 100)
    
    CAMADA 2 - Match por NCM + Quantidade + Valor Unitário:
    - NCM do XML = COD_ITEM do C170 (se COD_ITEM é NCM) ou NCM do 0200
    - Quantidade similar (tolerância 1%)
    - Valor unitário similar (tolerância 2%)
    - Score: 90-95
    
    CAMADA 3 - Match por Descrição (Fuzzy) + NCM:
    - Descrição similar (fuzzy match > 85%)
    - NCM igual
    - Score: 80-90
    
    CAMADA 4 - Match por Cadastro 0200:
    - Se COD_ITEM do C170 existe no 0200
    - Buscar NCM no 0200
    - Comparar NCM do XML com NCM do 0200
    - Se match, usar CFOP/CST do C170
    - Score: 75-85
    
    CAMADA 5 - Match por Descrição + Quantidade:
    - Descrição similar (fuzzy match > 80%)
    - Quantidade similar
    - Score: 70-80
    
    CAMADA 6 - Match por Valor Total + CFOP/CST:
    - Valor total similar (tolerância 5%)
    - CFOP/CST iguais
    - Score: 60-70
    
    Returns:
        ItemMatchResult com informações do match
    """
    n_item_xml = str(xml_item.get("nItem", "")).strip()
    ncm_xml = str(xml_item.get("NCM", "")).strip()
    desc_xml = str(xml_item.get("xProd", "")).strip()
    qtd_xml = float(xml_item.get("qCom", 0) or 0)
    vl_item_xml = float(xml_item.get("vUnCom", xml_item.get("vProd", 0)) or 0)
    vl_total_xml = float(xml_item.get("vProd", 0) or 0)
    
    melhor_match: Optional[Dict[str, Any]] = None
    melhor_score = 0.0
    melhor_tipo = "nenhum"
    detalhes_match: Dict[str, Any] = {}
    
    # CAMADA 1: Match exato por NUM_ITEM
    for c170 in c170_items:
        n_item_c170 = str(c170.get("NUM_ITEM", "")).strip()
        if n_item_xml == n_item_c170:
            melhor_match = c170
            melhor_score = 100.0
            melhor_tipo = "exato"
            detalhes_match = {
                "camada": 1,
                "criterio": "NUM_ITEM exato",
                "n_item_xml": n_item_xml,
                "n_item_c170": n_item_c170
            }
            break
    
    # Se encontrou match exato, retornar
    if melhor_match:
        return ItemMatchResult(
            xml_item=xml_item,
            c170_match=melhor_match,
            score=melhor_score,
            tipo_match=melhor_tipo,
            confianca="ALTA",
            cfop_inferido=melhor_match.get("CFOP"),
            cst_inferido=melhor_match.get("CST"),
            confianca_cfop_cst=100.0,
            detalhes=detalhes_match
        )
    
    # CAMADA 2: Match por NCM + Quantidade + Valor Unitário
    for c170 in c170_items:
        cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
        ncm_c170 = extrair_ncm_de_cod_item(cod_item_c170)
        
        # Se não conseguiu extrair NCM do COD_ITEM, tentar via 0200
        if not ncm_c170 and map_0200 and cod_item_c170 in map_0200:
            ncm_c170 = map_0200[cod_item_c170].get("NCM", "").strip()
        
        if ncm_xml and ncm_c170 and ncm_xml == ncm_c170:
            qtd_c170 = float(c170.get("QTD", 0) or 0)
            vl_item_c170 = float(c170.get("VL_ITEM", 0) or 0)
            
            # Verificar quantidade similar
            if qtd_xml > 0 and qtd_c170 > 0:
                diff_qtd = abs(qtd_xml - qtd_c170) / max(qtd_xml, qtd_c170)
                if diff_qtd <= TOL_QUANTIDADE:
                    # Verificar valor unitário similar
                    vl_unit_xml = vl_total_xml / qtd_xml if qtd_xml > 0 else 0
                    vl_unit_c170 = vl_item_c170 / qtd_c170 if qtd_c170 > 0 else 0
                    if vl_unit_xml > 0 and vl_unit_c170 > 0:
                        diff_vl_unit = abs(vl_unit_xml - vl_unit_c170) / max(vl_unit_xml, vl_unit_c170)
                        if diff_vl_unit <= TOL_VALOR_UNITARIO:
                            score = 95.0 - (diff_qtd * 100) - (diff_vl_unit * 50)
                            if score > melhor_score:
                                melhor_match = c170
                                melhor_score = score
                                melhor_tipo = "ncm_qtd"
                                detalhes_match = {
                                    "camada": 2,
                                    "criterio": "NCM + Quantidade + Valor Unitário",
                                    "ncm": ncm_xml,
                                    "qtd_xml": qtd_xml,
                                    "qtd_c170": qtd_c170,
                                    "diff_qtd_pct": diff_qtd * 100,
                                    "diff_vl_unit_pct": diff_vl_unit * 100
                                }
    
    # CAMADA 3: Match por Descrição (Fuzzy) + NCM
    if melhor_score < SCORE_ALTA_CONFIANCA:
        for c170 in c170_items:
            desc_c170 = str(c170.get("DESCR_COMPL", "")).strip()
            cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
            ncm_c170 = extrair_ncm_de_cod_item(cod_item_c170)
            
            if not ncm_c170 and map_0200 and cod_item_c170 in map_0200:
                ncm_c170 = map_0200[cod_item_c170].get("NCM", "").strip()
            
            if ncm_xml and ncm_c170 and ncm_xml == ncm_c170:
                similaridade = similaridade_texto(desc_xml, desc_c170)
                if similaridade >= 0.85:
                    score = 80.0 + (similaridade * 10)  # 80-90
                    if score > melhor_score:
                        melhor_match = c170
                        melhor_score = score
                        melhor_tipo = "descricao"
                        detalhes_match = {
                            "camada": 3,
                            "criterio": "Descrição (Fuzzy) + NCM",
                            "ncm": ncm_xml,
                            "similaridade_desc": similaridade,
                            "desc_xml": desc_xml[:50],
                            "desc_c170": desc_c170[:50]
                        }
    
    # CAMADA 4: Match por Cadastro 0200
    if melhor_score < SCORE_ALTA_CONFIANCA and map_0200:
        for c170 in c170_items:
            cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
            if cod_item_c170 in map_0200:
                ncm_0200 = map_0200[cod_item_c170].get("NCM", "").strip()
                if ncm_xml and ncm_0200 and ncm_xml == ncm_0200:
                    score = 85.0
                    if score > melhor_score:
                        melhor_match = c170
                        melhor_score = score
                        melhor_tipo = "0200"
                        detalhes_match = {
                            "camada": 4,
                            "criterio": "Cadastro 0200",
                            "cod_item": cod_item_c170,
                            "ncm_0200": ncm_0200,
                            "ncm_xml": ncm_xml
                        }
    
    # CAMADA 5: Match por Descrição + Quantidade
    if melhor_score < SCORE_MEDIA_CONFIANCA:
        for c170 in c170_items:
            desc_c170 = str(c170.get("DESCR_COMPL", "")).strip()
            qtd_c170 = float(c170.get("QTD", 0) or 0)
            
            similaridade = similaridade_texto(desc_xml, desc_c170)
            if similaridade >= 0.80 and qtd_xml > 0 and qtd_c170 > 0:
                diff_qtd = abs(qtd_xml - qtd_c170) / max(qtd_xml, qtd_c170)
                if diff_qtd <= TOL_QUANTIDADE:
                    score = 70.0 + (similaridade * 5) - (diff_qtd * 50)
                    if score > melhor_score:
                        melhor_match = c170
                        melhor_score = score
                        melhor_tipo = "descricao_qtd"
                        detalhes_match = {
                            "camada": 5,
                            "criterio": "Descrição + Quantidade",
                            "similaridade_desc": similaridade,
                            "qtd_xml": qtd_xml,
                            "qtd_c170": qtd_c170,
                            "diff_qtd_pct": diff_qtd * 100
                        }
    
    # CAMADA 6: Match por Valor Total + CFOP/CST
    if melhor_score < SCORE_MINIMO_MATCH:
        cfop_xml = str(xml_item.get("CFOP", "")).strip()
        cst_xml = str(xml_item.get("ICMS", {}).get("CST", "")).strip()
        if not cst_xml:
            cst_xml = str(xml_item.get("ICMS", {}).get("CSOSN", "")).strip()
        
        for c170 in c170_items:
            vl_item_c170 = float(c170.get("VL_ITEM", 0) or 0)
            cfop_c170 = str(c170.get("CFOP", "")).strip()
            cst_c170 = str(c170.get("CST", "")).strip()
            
            if vl_total_xml > 0 and vl_item_c170 > 0:
                diff_vl = abs(vl_total_xml - vl_item_c170) / max(vl_total_xml, vl_item_c170)
                if diff_vl <= TOL_VALOR_TOTAL:
                    score = 60.0
                    # Bônus se CFOP/CST coincidem
                    if cfop_xml and cfop_c170 and cfop_xml == cfop_c170:
                        score += 5.0
                    if cst_xml and cst_c170 and cst_xml == cst_c170:
                        score += 5.0
                    
                    if score > melhor_score:
                        melhor_match = c170
                        melhor_score = score
                        melhor_tipo = "valor_cfop_cst"
                        detalhes_match = {
                            "camada": 6,
                            "criterio": "Valor Total + CFOP/CST",
                            "vl_total_xml": vl_total_xml,
                            "vl_item_c170": vl_item_c170,
                            "diff_vl_pct": diff_vl * 100,
                            "cfop_match": cfop_xml == cfop_c170 if cfop_xml and cfop_c170 else False,
                            "cst_match": cst_xml == cst_c170 if cst_xml and cst_c170 else False
                        }
    
    # Determinar confiança
    if melhor_score >= SCORE_ALTA_CONFIANCA:
        confianca = "ALTA"
    elif melhor_score >= SCORE_MEDIA_CONFIANCA:
        confianca = "MEDIA"
    elif melhor_score >= SCORE_MINIMO_MATCH:
        confianca = "BAIXA"
    else:
        confianca = "BAIXA"
        melhor_match = None
    
    # Inferir CFOP/CST se necessário
    cfop_inferido = None
    cst_inferido = None
    confianca_cfop_cst = 0.0
    
    if melhor_match:
        cfop_inferido = melhor_match.get("CFOP")
        cst_inferido = melhor_match.get("CST")
        confianca_cfop_cst = melhor_score  # Usar score do match como confiança
    else:
        # Tentar inferir do SPED mesmo sem match direto
        cfop_inferido, cst_inferido, confianca_cfop_cst = inferir_cfop_cst_do_sped(
            xml_item, c170_items, c100_info, map_0200, rules
        )
    
    return ItemMatchResult(
        xml_item=xml_item,
        c170_match=melhor_match,
        score=melhor_score,
        tipo_match=melhor_tipo,
        confianca=confianca,
        cfop_inferido=cfop_inferido,
        cst_inferido=cst_inferido,
        confianca_cfop_cst=confianca_cfop_cst,
        detalhes=detalhes_match
    )


def inferir_cfop_cst_do_sped(
    xml_item: Dict[str, Any],
    c170_existentes: List[Dict[str, Any]],
    c100_info: Optional[Dict[str, Any]],
    map_0200: Optional[Dict[str, Dict[str, Any]]],
    rules: Optional[Dict[str, Any]]
) -> Tuple[Optional[str], Optional[str], float]:
    """
    Infere CFOP/CST para item do XML baseado na classificação existente no SPED.
    
    Estratégia de inferência (em ordem de prioridade):
    
    1. BUSCA POR NCM + FORNECEDOR (COD_PART):
       - Buscar C170 com mesmo NCM e mesmo COD_PART do C100
       - Se encontrar múltiplos, usar o mais frequente
       - Confiança: ALTA (95%)
    
    2. BUSCA POR NCM + DESCRIÇÃO SIMILAR:
       - Buscar C170 com mesmo NCM e descrição similar (fuzzy > 85%)
       - Confiança: ALTA (90%)
    
    3. BUSCA POR CADASTRO 0200:
       - Se COD_ITEM do C170 existe no 0200
       - Buscar NCM no 0200
       - Comparar com NCM do XML
       - Se match, usar CFOP/CST do C170
       - Confiança: ALTA (85%)
    
    4. BUSCA NO MESMO C100:
       - Buscar outros C170 do mesmo C100 (mesma NF)
       - Se encontrar com NCM similar ou descrição similar
       - Usar CFOP/CST mais frequente
       - Confiança: MÉDIA (75%)
    
    5. BUSCA POR REGRAS DO SETOR:
       - Verificar regras do setor para CFOP/CST esperados
       - Se NCM está em regra específica, usar CFOP/CST sugerido
       - Confiança: MÉDIA (70%)
    
    6. BUSCA HISTÓRICA (outros C100s):
       - Buscar em outros C100s do mesmo período
       - Procurar C170 com mesmo NCM
       - Usar CFOP/CST mais frequente
       - Confiança: MÉDIA (65%)
    
    7. FALLBACK: Usar CFOP/CST do XML:
       - Se nenhuma inferência funcionou
       - Usar valores do XML
       - Confiança: BAIXA (50%)
    
    Returns:
        (cfop, cst, confianca_score) - CFOP, CST e score de confiança (0-100)
    """
    ncm_xml = str(xml_item.get("NCM", "")).strip()
    desc_xml = str(xml_item.get("xProd", "")).strip()
    cfop_xml = str(xml_item.get("CFOP", "")).strip()
    cst_xml = str(xml_item.get("ICMS", {}).get("CST", "")).strip()
    if not cst_xml:
        cst_xml = str(xml_item.get("ICMS", {}).get("CSOSN", "")).strip()
    
    cod_part_c100 = None
    if c100_info:
        cod_part_c100 = str(c100_info.get("COD_PART", "")).strip()
    
    # 1. BUSCA POR NCM + FORNECEDOR (COD_PART)
    if ncm_xml and cod_part_c100:
        cfop_cst_por_ncm_fornecedor: Dict[Tuple[str, str], int] = {}
        for c170 in c170_existentes:
            cod_part_c170 = str(c170.get("COD_PART", "")).strip()
            if cod_part_c170 == cod_part_c100:
                cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
                ncm_c170 = extrair_ncm_de_cod_item(cod_item_c170)
                if not ncm_c170 and map_0200 and cod_item_c170 in map_0200:
                    ncm_c170 = map_0200[cod_item_c170].get("NCM", "").strip()
                
                if ncm_c170 == ncm_xml:
                    cfop = str(c170.get("CFOP", "")).strip()
                    cst = str(c170.get("CST", "")).strip()
                    if cfop and cst:
                        key = (cfop, cst)
                        cfop_cst_por_ncm_fornecedor[key] = cfop_cst_por_ncm_fornecedor.get(key, 0) + 1
        
        if cfop_cst_por_ncm_fornecedor:
            # Pegar o mais frequente
            cfop_cst_mais_frequente = max(cfop_cst_por_ncm_fornecedor.items(), key=lambda x: x[1])
            cfop, cst = cfop_cst_mais_frequente[0]
            return cfop, cst, 95.0
    
    # 2. BUSCA POR NCM + DESCRIÇÃO SIMILAR
    if ncm_xml:
        melhor_cfop_cst = None
        melhor_similaridade = 0.0
        for c170 in c170_existentes:
            cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
            ncm_c170 = extrair_ncm_de_cod_item(cod_item_c170)
            if not ncm_c170 and map_0200 and cod_item_c170 in map_0200:
                ncm_c170 = map_0200[cod_item_c170].get("NCM", "").strip()
            
            if ncm_c170 == ncm_xml:
                desc_c170 = str(c170.get("DESCR_COMPL", "")).strip()
                similaridade = similaridade_texto(desc_xml, desc_c170)
                if similaridade >= 0.85 and similaridade > melhor_similaridade:
                    melhor_similaridade = similaridade
                    melhor_cfop_cst = (
                        str(c170.get("CFOP", "")).strip(),
                        str(c170.get("CST", "")).strip()
                    )
        
        if melhor_cfop_cst and melhor_cfop_cst[0] and melhor_cfop_cst[1]:
            return melhor_cfop_cst[0], melhor_cfop_cst[1], 90.0
    
    # 3. BUSCA POR CADASTRO 0200
    if ncm_xml and map_0200:
        for cod_item, dados_0200 in map_0200.items():
            ncm_0200 = dados_0200.get("NCM", "").strip()
            if ncm_0200 == ncm_xml:
                # Buscar C170 com este COD_ITEM
                for c170 in c170_existentes:
                    cod_item_c170 = str(c170.get("COD_ITEM", "")).strip()
                    if cod_item_c170 == cod_item:
                        cfop = str(c170.get("CFOP", "")).strip()
                        cst = str(c170.get("CST", "")).strip()
                        if cfop and cst:
                            return cfop, cst, 85.0
    
    # 4. BUSCA NO MESMO C100
    if c100_info:
        cfop_cst_por_frequencia: Dict[Tuple[str, str], int] = {}
        for c170 in c170_existentes:
            # Assumir que todos os c170_existentes são do mesmo C100
            cfop = str(c170.get("CFOP", "")).strip()
            cst = str(c170.get("CST", "")).strip()
            if cfop and cst:
                key = (cfop, cst)
                cfop_cst_por_frequencia[key] = cfop_cst_por_frequencia.get(key, 0) + 1
        
        if cfop_cst_por_frequencia:
            # Pegar o mais frequente
            cfop_cst_mais_frequente = max(cfop_cst_por_frequencia.items(), key=lambda x: x[1])
            cfop, cst = cfop_cst_mais_frequente[0]
            return cfop, cst, 75.0
    
    # 5. BUSCA POR REGRAS DO SETOR
    if rules and ncm_xml:
        # Verificar se há regras específicas para este NCM
        ncm_rules = rules.get("ncm_st", {}) if isinstance(rules, dict) else {}
        if ncm_xml in ncm_rules:
            # Se há regra específica, pode sugerir CFOP/CST padrão
            # Por enquanto, não temos CFOP/CST padrão nas regras, então pulamos
            pass
    
    # 6. BUSCA HISTÓRICA (outros C100s)
    # Por enquanto, não temos acesso a outros C100s, então pulamos
    
    # 7. FALLBACK: Usar CFOP/CST do XML
    if cfop_xml and cst_xml:
        return cfop_xml, cst_xml, 50.0
    
    return None, None, 0.0

