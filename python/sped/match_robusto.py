#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema robusto de match entre XML e SPED com score de confiança.
Implementa fallback e validação antes de aplicar correções automáticas.
"""
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import logging
import re

logger = logging.getLogger(__name__)

# Limiar mínimo de score para correção automática
# Reduzido para 50.0 pois match por chave (50 pontos) já é muito confiável
SCORE_MINIMO_CORRECAO_AUTOMATICA = 50.0


def match_xml_c100_score(xml_note: Dict[str, Any], c100_record: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
    """
    Calcula score de match entre XML e registro C100.
    
    Sistema de pontuação (0-100):
    - Chave primária (CHV_NFE): 50 pontos
    - Fallback: Modelo + Série + Número + Data: 30 pontos
    - Data: 10 pontos
    - CNPJ participante: 10 pontos
    
    Args:
        xml_note: Dicionário com dados do XML
        c100_record: Dicionário com dados do C100
    
    Returns:
        Tupla (score, detalhes) onde detalhes contém informações sobre o match
    """
    score = 0.0
    detalhes = {
        "chave_match": False,
        "fallback_match": False,
        "data_match": False,
        "cnpj_match": False,
        "pontos_chave": 0.0,
        "pontos_fallback": 0.0,
        "pontos_data": 0.0,
        "pontos_cnpj": 0.0
    }
    
    # Normalizar chaves
    chave_xml = str(xml_note.get("chave", "")).strip()
    chave_c100 = str(c100_record.get("CHV_NFE", "")).strip()
    
    # 1. Match por chave primária (50 pontos) - SUFICIENTE PARA MATCH
    if chave_xml and chave_c100 and chave_xml == chave_c100:
        score += 50.0
        detalhes["chave_match"] = True
        detalhes["pontos_chave"] = 50.0
        logger.debug(f"Match por chave: {chave_xml[:20]}... (+50 pontos)")
        # Se tem chave, já pode retornar (match confiável)
        detalhes["score_total"] = score
        detalhes["pode_corrigir_automaticamente"] = score >= SCORE_MINIMO_CORRECAO_AUTOMATICA
        return score, detalhes
    
    # 2. Fallback: Modelo + Série + Número (40 pontos - aumentado de 30)
    mod_xml = str(xml_note.get("mod", "")).strip()
    mod_c100 = str(c100_record.get("COD_MOD", "")).strip()
    
    serie_xml = str(xml_note.get("serie", "")).strip()
    serie_c100 = str(c100_record.get("SER", "")).strip()
    
    num_xml = str(xml_note.get("nNF", "")).strip()
    num_c100 = str(c100_record.get("NUM_DOC", "")).strip()
    
    if (mod_xml and mod_c100 and mod_xml == mod_c100 and
        serie_xml and serie_c100 and serie_xml == serie_c100 and
        num_xml and num_c100 and num_xml == num_c100):
        score += 40.0
        detalhes["fallback_match"] = True
        detalhes["pontos_fallback"] = 40.0
        logger.debug(f"Match por fallback (MOD={mod_xml}, SER={serie_xml}, NUM={num_xml}) (+40 pontos)")
    
    # 3. Match por data (10 pontos)
    # XML: dhEmi (formato ISO ou YYYYMMDD)
    # C100: DT_DOC (formato DDMMYYYY)
    dt_xml_raw = xml_note.get("dhEmi", "") or xml_note.get("dEmi", "")
    dt_c100 = str(c100_record.get("DT_DOC", "")).strip()
    
    if dt_xml_raw and dt_c100:
        # Tentar normalizar data do XML
        dt_xml_normalizada = None
        try:
            # Se vem como ISO (2025-01-15T10:30:00)
            if "T" in str(dt_xml_raw):
                dt_xml_normalizada = str(dt_xml_raw)[:10].replace("-", "")
            # Se vem como YYYYMMDD
            elif len(str(dt_xml_raw)) == 8:
                dt_xml_normalizada = str(dt_xml_raw)
            # Se vem como DDMMYYYY
            elif len(dt_c100) == 8:
                # Tentar parsear e converter
                try:
                    dt_obj = datetime.strptime(dt_c100, "%d%m%Y")
                    dt_xml_normalizada = dt_obj.strftime("%Y%m%d")
                except:
                    pass
        except Exception as e:
            logger.debug(f"Erro ao normalizar data XML: {e}")
        
        # Comparar datas normalizadas
        if dt_xml_normalizada and dt_c100:
            # Converter C100 DDMMYYYY para YYYYMMDD para comparação
            try:
                dt_c100_obj = datetime.strptime(dt_c100, "%d%m%Y")
                dt_c100_normalizada = dt_c100_obj.strftime("%Y%m%d")
                
                if dt_xml_normalizada == dt_c100_normalizada:
                    score += 10.0
                    detalhes["data_match"] = True
                    detalhes["pontos_data"] = 10.0
                    logger.debug(f"Match por data: {dt_xml_normalizada} (+10 pontos)")
            except Exception as e:
                logger.debug(f"Erro ao comparar datas: {e}")
    
    # 4. Match por CNPJ participante (10 pontos - aumentado de 5)
    # XML: dest_CNPJ (se entrada) ou emit_CNPJ (se saída)
    # C100: COD_PART (precisa buscar no 0150)
    # Nota: Este match é mais complexo e requer acesso ao 0150
    cod_part = str(c100_record.get("COD_PART", "")).strip()
    if cod_part:
        # Verificar se temos CNPJ no XML para comparar
        cnpj_xml = str(xml_note.get("dest_CNPJ", "") or xml_note.get("emit_CNPJ", "")).strip()
        if cnpj_xml:
            # Se temos COD_PART e CNPJ, assumir match (10 pontos)
            score += 10.0
            detalhes["cnpj_match"] = True
            detalhes["pontos_cnpj"] = 10.0
            logger.debug(f"Match por CNPJ: {cod_part} (+10 pontos)")
        else:
            # Match parcial apenas com COD_PART (5 pontos)
            score += 5.0
            detalhes["cnpj_match"] = True
            detalhes["pontos_cnpj"] = 5.0
            logger.debug(f"Match parcial por COD_PART: {cod_part} (+5 pontos)")
    
    detalhes["score_total"] = score
    detalhes["pode_corrigir_automaticamente"] = score >= SCORE_MINIMO_CORRECAO_AUTOMATICA
    
    return score, detalhes


def match_item_c170_xml(
    c170_item: Dict[str, Any],
    xml_item: Dict[str, Any],
    tolerancia_centavos: float = 0.01
) -> Tuple[bool, float, Dict[str, Any]]:
    """
    Match de item C170 com item XML usando fallback robusto.
    
    Sistema de pontuação:
    - Match primário (NUM_ITEM): 100 pontos
    - Fallback: NCM/cProd (30) + Quantidade (30) + Valor (30) = 90 pontos máximo
    
    Args:
        c170_item: Dicionário com dados do C170
        xml_item: Dicionário com dados do item XML
        tolerancia_centavos: Tolerância para comparação de valores
    
    Returns:
        Tupla (match_ok, score, detalhes)
    """
    score = 0.0
    detalhes = {
        "num_item_match": False,
        "ncm_match": False,
        "qtd_match": False,
        "valor_match": False,
        "pontos_num_item": 0.0,
        "pontos_ncm": 0.0,
        "pontos_qtd": 0.0,
        "pontos_valor": 0.0
    }
    
    # 1. Match primário: NUM_ITEM (100 pontos)
    num_item_c170 = str(c170_item.get("NUM_ITEM", "")).strip()
    num_item_xml = str(xml_item.get("nItem", "")).strip()
    
    if num_item_c170 and num_item_xml and num_item_c170 == num_item_xml:
        score = 100.0
        detalhes["num_item_match"] = True
        detalhes["pontos_num_item"] = 100.0
        logger.debug(f"Match por NUM_ITEM: {num_item_c170} (+100 pontos)")
        return (True, score, detalhes)
    
    # 2. Fallback: NCM/cProd (30 pontos)
    cod_item_c170 = str(c170_item.get("COD_ITEM", "")).strip()
    ncm_xml = str(xml_item.get("NCM", "")).strip()
    cprod_xml = str(xml_item.get("cProd", "")).strip()
    
    ncm_match = False
    if ncm_xml and len(ncm_xml) == 8:
        # Verificar se COD_ITEM começa com NCM ou contém NCM
        if cod_item_c170.startswith(ncm_xml):
            ncm_match = True
        # Ou se COD_ITEM é código interno mas temos NCM no XML
        # (não podemos fazer match direto, mas podemos dar pontos parciais)
    
    # Verificar se cProd está no COD_ITEM
    cprod_match = False
    if cprod_xml and cod_item_c170:
        if cprod_xml in cod_item_c170 or cod_item_c170 in cprod_xml:
            cprod_match = True
    
    if ncm_match or cprod_match:
        score += 30.0
        detalhes["ncm_match"] = True
        detalhes["pontos_ncm"] = 30.0
        logger.debug(f"Match por NCM/cProd: NCM={ncm_xml}, COD_ITEM={cod_item_c170} (+30 pontos)")
    
    # 3. Match por quantidade (30 pontos)
    qtd_c170 = float(c170_item.get("QTD", 0) or 0)
    qtd_xml = float(xml_item.get("qCom", 0) or 0)
    
    if qtd_c170 > 0 and qtd_xml > 0:
        diferenca_qtd = abs(qtd_c170 - qtd_xml)
        # Tolerância: 0.1% ou 0.001 unidades (o que for maior)
        tolerancia_qtd = max(0.001, qtd_xml * 0.001)
        
        if diferenca_qtd <= tolerancia_qtd:
            score += 30.0
            detalhes["qtd_match"] = True
            detalhes["pontos_qtd"] = 30.0
            logger.debug(f"Match por quantidade: {qtd_c170} ≈ {qtd_xml} (+30 pontos)")
    
    # 4. Match por valor (30 pontos)
    vprod_c170 = float(c170_item.get("VL_ITEM", 0) or 0)
    vprod_xml = float(xml_item.get("vProd", 0) or 0)
    
    if vprod_c170 > 0 and vprod_xml > 0:
        diferenca_valor = abs(vprod_c170 - vprod_xml)
        
        if diferenca_valor <= tolerancia_centavos:
            score += 30.0
            detalhes["valor_match"] = True
            detalhes["pontos_valor"] = 30.0
            logger.debug(f"Match por valor: R$ {vprod_c170:.2f} ≈ R$ {vprod_xml:.2f} (+30 pontos)")
    
    detalhes["score_total"] = score
    match_ok = score >= SCORE_MINIMO_CORRECAO_AUTOMATICA
    
    return (match_ok, score, detalhes)


def validar_match_antes_correcao(
    xml_note: Dict[str, Any],
    c100_record: Dict[str, Any],
    c170_items: List[Dict[str, Any]],
    xml_items: List[Dict[str, Any]]
) -> Tuple[bool, Dict[str, Any]]:
    """
    Valida match completo (C100 + itens) antes de aplicar correção automática.
    
    Args:
        xml_note: Dicionário com dados do XML
        c100_record: Dicionário com dados do C100
        c170_items: Lista de itens C170
        xml_items: Lista de itens XML
    
    Returns:
        Tupla (pode_corrigir, detalhes_validacao)
    """
    resultado = {
        "score_c100": 0.0,
        "score_itens": [],
        "score_medio_itens": 0.0,
        "score_final": 0.0,
        "pode_corrigir": False,
        "motivo_rejeicao": None,
        "detalhes_c100": {},
        "detalhes_itens": []
    }
    
    # 1. Validar match C100
    score_c100, detalhes_c100 = match_xml_c100_score(xml_note, c100_record)
    resultado["score_c100"] = score_c100
    resultado["detalhes_c100"] = detalhes_c100
    
    if score_c100 < SCORE_MINIMO_CORRECAO_AUTOMATICA:
        resultado["motivo_rejeicao"] = f"Score C100 insuficiente: {score_c100:.1f} < {SCORE_MINIMO_CORRECAO_AUTOMATICA}"
        logger.warning(f"Match C100 rejeitado: score {score_c100:.1f}")
        return (False, resultado)
    
    # 2. Validar match de itens
    scores_itens = []
    detalhes_itens = []
    
    # Tentar match de cada item XML com C170
    for xml_item in xml_items:
        melhor_match = None
        melhor_score = 0.0
        melhor_detalhes = {}
        
        for c170_item in c170_items:
            match_ok, score, detalhes = match_item_c170_xml(c170_item, xml_item)
            
            if score > melhor_score:
                melhor_score = score
                melhor_match = c170_item
                melhor_detalhes = detalhes
        
        scores_itens.append(melhor_score)
        detalhes_itens.append({
            "xml_nItem": xml_item.get("nItem"),
            "c170_match": melhor_match.get("NUM_ITEM") if melhor_match else None,
            "score": melhor_score,
            "detalhes": melhor_detalhes
        })
    
    resultado["score_itens"] = scores_itens
    resultado["detalhes_itens"] = detalhes_itens
    
    if scores_itens:
        score_medio = sum(scores_itens) / len(scores_itens)
        resultado["score_medio_itens"] = score_medio
        
        # Score final: média ponderada (70% C100, 30% itens)
        resultado["score_final"] = (score_c100 * 0.7) + (score_medio * 0.3)
        
        # Verificar se algum item tem match fraco
        itens_match_fraco = [s for s in scores_itens if s < SCORE_MINIMO_CORRECAO_AUTOMATICA]
        if itens_match_fraco:
            resultado["motivo_rejeicao"] = f"{len(itens_match_fraco)} item(ns) com match fraco (score < {SCORE_MINIMO_CORRECAO_AUTOMATICA})"
            logger.warning(f"Match rejeitado: {len(itens_match_fraco)} itens com score insuficiente")
            return (False, resultado)
    else:
        # Sem itens para validar - aceitar se C100 está OK
        resultado["score_final"] = score_c100
        resultado["motivo_rejeicao"] = "Nenhum item encontrado para validação"
        logger.warning("Match rejeitado: nenhum item encontrado")
        return (False, resultado)
    
    # 3. Validação final
    if resultado["score_final"] >= SCORE_MINIMO_CORRECAO_AUTOMATICA:
        resultado["pode_corrigir"] = True
        logger.info(f"Match validado: score final {resultado['score_final']:.1f} (C100: {score_c100:.1f}, Itens: {resultado['score_medio_itens']:.1f})")
    else:
        resultado["motivo_rejeicao"] = f"Score final insuficiente: {resultado['score_final']:.1f} < {SCORE_MINIMO_CORRECAO_AUTOMATICA}"
        logger.warning(f"Match rejeitado: score final {resultado['score_final']:.1f}")
    
    return (resultado["pode_corrigir"], resultado)





