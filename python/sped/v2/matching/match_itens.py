#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Matching Robusto de Itens (Camada C)
Matching de itens XML com C170 usando múltiplas camadas e inferência de CFOP/CST

Estratégia de matching (6 camadas):
1. Match exato por NUM_ITEM (100 pontos)
2. Match por NCM + Quantidade + Valor Unitário (90-95 pontos)
3. Match por Descrição (Fuzzy) + NCM (80-90 pontos)
4. Match por Cadastro 0200 (75-85 pontos)
5. Match por Descrição + Quantidade (70-80 pontos)
6. Match por Valor Total + CFOP/CST (60-70 pontos)

Inferência de CFOP/CST quando item não está no SPED
"""

from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from decimal import Decimal
from difflib import SequenceMatcher
import logging
import re

from ..canonical.item_fiscal import ItemFiscal
from ..canonical.documento_fiscal import DocumentoFiscal

logger = logging.getLogger(__name__)

# Limiares de score
SCORE_MINIMO_MATCH = 60.0
SCORE_ALTA_CONFIANCA = 85.0
SCORE_MEDIA_CONFIANCA = 70.0

# Tolerâncias
TOL_QUANTIDADE = 0.01  # 1%
TOL_VALOR_UNITARIO = 0.02  # 2%
TOL_VALOR_TOTAL = 0.05  # 5%


class MatchConfidence(Enum):
    """Nível de confiança do match"""
    ALTA = "alta"
    MEDIA = "media"
    BAIXA = "baixa"
    NENHUMA = "nenhuma"


class MatchLayer(Enum):
    """Camada de matching utilizada"""
    EXATO_NUM_ITEM = 1
    NCM_QTD_VALOR = 2
    DESCRICAO_NCM = 3
    CADASTRO_0200 = 4
    DESCRICAO_QTD = 5
    VALOR_CFOP_CST = 6
    NENHUMA = 0


@dataclass
class ItemMatchResult:
    """Resultado de matching de item"""
    xml_item: ItemFiscal
    sped_item: Optional[ItemFiscal]
    score: float  # 0-100
    layer: MatchLayer
    confidence: MatchConfidence
    cfop_inferido: Optional[str] = None
    cst_inferido: Optional[str] = None
    confianca_cfop_cst: float = 0.0
    detalhes: Dict[str, Any] = field(default_factory=dict)
    matched: bool = False
    
    def is_confiavel(self) -> bool:
        """Verifica se o match é confiável"""
        return self.matched and self.score >= SCORE_MINIMO_MATCH


class ItemMatcher:
    """Matcher robusto de itens com múltiplas camadas"""
    
    def __init__(
        self,
        map_0200: Optional[Dict[str, Dict[str, Any]]] = None,
        rules: Optional[Dict[str, Any]] = None
    ):
        """
        Inicializa o matcher
        
        Args:
            map_0200: Mapeamento de COD_ITEM → dados do cadastro 0200
            rules: Regras de classificação CFOP/CST
        """
        self.map_0200 = map_0200 or {}
        self.rules = rules or {}
    
    def match_itens(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        documento_sped: Optional[DocumentoFiscal] = None
    ) -> ItemMatchResult:
        """
        Faz matching de um item XML com lista de itens SPED
        
        Args:
            xml_item: Item do XML normalizado
            sped_itens: Lista de itens do SPED normalizados
            documento_sped: Documento SPED (opcional, para contexto)
            
        Returns:
            ItemMatchResult com informações do match
        """
        melhor_match: Optional[ItemFiscal] = None
        melhor_score = 0.0
        melhor_layer = MatchLayer.NENHUMA
        detalhes: Dict[str, Any] = {}
        
        # CAMADA 1: Match exato por NUM_ITEM (100 pontos)
        if xml_item.numero_item:
            for sped_item in sped_itens:
                if (sped_item.numero_item and 
                    str(xml_item.numero_item).strip() == str(sped_item.numero_item).strip()):
                    melhor_match = sped_item
                    melhor_score = 100.0
                    melhor_layer = MatchLayer.EXATO_NUM_ITEM
                    detalhes = {
                        'camada': 1,
                        'criterio': 'NUM_ITEM exato',
                        'numero_item': xml_item.numero_item
                    }
                    break
        
        # CAMADA 2: Match por NCM + Quantidade + Valor Unitário (90-95 pontos)
        if melhor_score < SCORE_ALTA_CONFIANCA:
            melhor_match, melhor_score, melhor_layer, detalhes = self._match_camada_2(
                xml_item, sped_itens, melhor_match, melhor_score, melhor_layer, detalhes
            )
        
        # CAMADA 3: Match por Descrição (Fuzzy) + NCM (80-90 pontos)
        if melhor_score < SCORE_ALTA_CONFIANCA:
            melhor_match, melhor_score, melhor_layer, detalhes = self._match_camada_3(
                xml_item, sped_itens, melhor_match, melhor_score, melhor_layer, detalhes
            )
        
        # CAMADA 4: Match por Cadastro 0200 (75-85 pontos)
        if melhor_score < SCORE_ALTA_CONFIANCA:
            melhor_match, melhor_score, melhor_layer, detalhes = self._match_camada_4(
                xml_item, sped_itens, melhor_match, melhor_score, melhor_layer, detalhes
            )
        
        # CAMADA 5: Match por Descrição + Quantidade (70-80 pontos)
        if melhor_score < SCORE_MEDIA_CONFIANCA:
            melhor_match, melhor_score, melhor_layer, detalhes = self._match_camada_5(
                xml_item, sped_itens, melhor_match, melhor_score, melhor_layer, detalhes
            )
        
        # CAMADA 6: Match por Valor Total + CFOP/CST (60-70 pontos)
        if melhor_score < SCORE_MINIMO_MATCH:
            melhor_match, melhor_score, melhor_layer, detalhes = self._match_camada_6(
                xml_item, sped_itens, melhor_match, melhor_score, melhor_layer, detalhes
            )
        
        # Determinar confiança
        if melhor_score >= SCORE_ALTA_CONFIANCA:
            confidence = MatchConfidence.ALTA
        elif melhor_score >= SCORE_MEDIA_CONFIANCA:
            confidence = MatchConfidence.MEDIA
        elif melhor_score >= SCORE_MINIMO_MATCH:
            confidence = MatchConfidence.BAIXA
        else:
            confidence = MatchConfidence.NENHUMA
            melhor_match = None
        
        # Inferir CFOP/CST
        cfop_inferido, cst_inferido, confianca_cfop_cst = self._inferir_cfop_cst(
            xml_item, melhor_match, sped_itens, documento_sped
        )
        
        return ItemMatchResult(
            xml_item=xml_item,
            sped_item=melhor_match,
            score=melhor_score,
            layer=melhor_layer,
            confidence=confidence,
            cfop_inferido=cfop_inferido,
            cst_inferido=cst_inferido,
            confianca_cfop_cst=confianca_cfop_cst,
            detalhes=detalhes,
            matched=melhor_match is not None and melhor_score >= SCORE_MINIMO_MATCH
        )
    
    def _match_camada_2(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        melhor_match: Optional[ItemFiscal],
        melhor_score: float,
        melhor_layer: MatchLayer,
        detalhes: Dict[str, Any]
    ) -> Tuple[Optional[ItemFiscal], float, MatchLayer, Dict[str, Any]]:
        """CAMADA 2: Match por NCM + Quantidade + Valor Unitário"""
        if not xml_item.ncm:
            return melhor_match, melhor_score, melhor_layer, detalhes
        
        for sped_item in sped_itens:
            ncm_sped = self._get_ncm_item(sped_item)
            
            if xml_item.ncm == ncm_sped:
                # Verificar quantidade similar
                if xml_item.quantidade > 0 and sped_item.quantidade > 0:
                    diff_qtd = abs(float(xml_item.quantidade - sped_item.quantidade))
                    max_qtd = max(float(xml_item.quantidade), float(sped_item.quantidade))
                    diff_qtd_pct = diff_qtd / max_qtd if max_qtd > 0 else 1.0
                    
                    if diff_qtd_pct <= TOL_QUANTIDADE:
                        # Verificar valor unitário similar
                        vl_unit_xml = float(xml_item.valor_unitario) if xml_item.valor_unitario > 0 else 0
                        vl_unit_sped = float(sped_item.valor_unitario) if sped_item.valor_unitario > 0 else 0
                        
                        if vl_unit_xml > 0 and vl_unit_sped > 0:
                            diff_vl_unit = abs(vl_unit_xml - vl_unit_sped)
                            max_vl_unit = max(vl_unit_xml, vl_unit_sped)
                            diff_vl_unit_pct = diff_vl_unit / max_vl_unit if max_vl_unit > 0 else 1.0
                            
                            if diff_vl_unit_pct <= TOL_VALOR_UNITARIO:
                                score = 95.0 - (diff_qtd_pct * 100) - (diff_vl_unit_pct * 50)
                                
                                if score > melhor_score:
                                    melhor_match = sped_item
                                    melhor_score = score
                                    melhor_layer = MatchLayer.NCM_QTD_VALOR
                                    detalhes = {
                                        'camada': 2,
                                        'criterio': 'NCM + Quantidade + Valor Unitário',
                                        'ncm': xml_item.ncm,
                                        'qtd_xml': float(xml_item.quantidade),
                                        'qtd_sped': float(sped_item.quantidade),
                                        'diff_qtd_pct': diff_qtd_pct * 100,
                                        'diff_vl_unit_pct': diff_vl_unit_pct * 100
                                    }
        
        return melhor_match, melhor_score, melhor_layer, detalhes
    
    def _match_camada_3(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        melhor_match: Optional[ItemFiscal],
        melhor_score: float,
        melhor_layer: MatchLayer,
        detalhes: Dict[str, Any]
    ) -> Tuple[Optional[ItemFiscal], float, MatchLayer, Dict[str, Any]]:
        """CAMADA 3: Match por Descrição (Fuzzy) + NCM"""
        if not xml_item.ncm or not xml_item.descricao:
            return melhor_match, melhor_score, melhor_layer, detalhes
        
        for sped_item in sped_itens:
            ncm_sped = self._get_ncm_item(sped_item)
            
            if xml_item.ncm == ncm_sped and sped_item.descricao:
                similaridade = self._similaridade_texto(
                    xml_item.descricao, sped_item.descricao
                )
                
                if similaridade >= 0.85:
                    score = 80.0 + (similaridade * 10)  # 80-90
                    
                    if score > melhor_score:
                        melhor_match = sped_item
                        melhor_score = score
                        melhor_layer = MatchLayer.DESCRICAO_NCM
                        detalhes = {
                            'camada': 3,
                            'criterio': 'Descrição (Fuzzy) + NCM',
                            'ncm': xml_item.ncm,
                            'similaridade_desc': similaridade,
                            'desc_xml': xml_item.descricao[:50] if xml_item.descricao else '',
                            'desc_sped': sped_item.descricao[:50] if sped_item.descricao else ''
                        }
        
        return melhor_match, melhor_score, melhor_layer, detalhes
    
    def _match_camada_4(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        melhor_match: Optional[ItemFiscal],
        melhor_score: float,
        melhor_layer: MatchLayer,
        detalhes: Dict[str, Any]
    ) -> Tuple[Optional[ItemFiscal], float, MatchLayer, Dict[str, Any]]:
        """CAMADA 4: Match por Cadastro 0200"""
        if not xml_item.ncm or not self.map_0200:
            return melhor_match, melhor_score, melhor_layer, detalhes
        
        for sped_item in sped_itens:
            if sped_item.codigo_item and sped_item.codigo_item in self.map_0200:
                ncm_0200 = self.map_0200[sped_item.codigo_item].get('NCM', '').strip()
                
                if xml_item.ncm == ncm_0200:
                    score = 85.0
                    
                    if score > melhor_score:
                        melhor_match = sped_item
                        melhor_score = score
                        melhor_layer = MatchLayer.CADASTRO_0200
                        detalhes = {
                            'camada': 4,
                            'criterio': 'Cadastro 0200',
                            'cod_item': sped_item.codigo_item,
                            'ncm_0200': ncm_0200,
                            'ncm_xml': xml_item.ncm
                        }
        
        return melhor_match, melhor_score, melhor_layer, detalhes
    
    def _match_camada_5(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        melhor_match: Optional[ItemFiscal],
        melhor_score: float,
        melhor_layer: MatchLayer,
        detalhes: Dict[str, Any]
    ) -> Tuple[Optional[ItemFiscal], float, MatchLayer, Dict[str, Any]]:
        """CAMADA 5: Match por Descrição + Quantidade"""
        if not xml_item.descricao or xml_item.quantidade <= 0:
            return melhor_match, melhor_score, melhor_layer, detalhes
        
        for sped_item in sped_itens:
            if not sped_item.descricao or sped_item.quantidade <= 0:
                continue
            
            similaridade = self._similaridade_texto(xml_item.descricao, sped_item.descricao)
            
            if similaridade >= 0.80:
                diff_qtd = abs(float(xml_item.quantidade - sped_item.quantidade))
                max_qtd = max(float(xml_item.quantidade), float(sped_item.quantidade))
                diff_qtd_pct = diff_qtd / max_qtd if max_qtd > 0 else 1.0
                
                if diff_qtd_pct <= TOL_QUANTIDADE:
                    score = 70.0 + (similaridade * 5) - (diff_qtd_pct * 50)
                    
                    if score > melhor_score:
                        melhor_match = sped_item
                        melhor_score = score
                        melhor_layer = MatchLayer.DESCRICAO_QTD
                        detalhes = {
                            'camada': 5,
                            'criterio': 'Descrição + Quantidade',
                            'similaridade_desc': similaridade,
                            'qtd_xml': float(xml_item.quantidade),
                            'qtd_sped': float(sped_item.quantidade),
                            'diff_qtd_pct': diff_qtd_pct * 100
                        }
        
        return melhor_match, melhor_score, melhor_layer, detalhes
    
    def _match_camada_6(
        self,
        xml_item: ItemFiscal,
        sped_itens: List[ItemFiscal],
        melhor_match: Optional[ItemFiscal],
        melhor_score: float,
        melhor_layer: MatchLayer,
        detalhes: Dict[str, Any]
    ) -> Tuple[Optional[ItemFiscal], float, MatchLayer, Dict[str, Any]]:
        """CAMADA 6: Match por Valor Total + CFOP/CST"""
        if xml_item.valor_total <= 0:
            return melhor_match, melhor_score, melhor_layer, detalhes
        
        cfop_xml = xml_item.cfop
        cst_xml = (xml_item.icms.cst if xml_item.icms and hasattr(xml_item.icms, 'cst') else None)
        
        for sped_item in sped_itens:
            if sped_item.valor_total <= 0:
                continue
            
            diff_vl = abs(float(xml_item.valor_total - sped_item.valor_total))
            max_vl = max(float(xml_item.valor_total), float(sped_item.valor_total))
            diff_vl_pct = diff_vl / max_vl if max_vl > 0 else 1.0
            
            if diff_vl_pct <= TOL_VALOR_TOTAL:
                score = 60.0
                
                # Bônus se CFOP/CST coincidem
                if cfop_xml and sped_item.cfop and cfop_xml == sped_item.cfop:
                    score += 5.0
                
                if (cst_xml and sped_item.icms and 
                    hasattr(sped_item.icms, 'cst') and sped_item.icms.cst == cst_xml):
                    score += 5.0
                
                if score > melhor_score:
                    melhor_match = sped_item
                    melhor_score = score
                    melhor_layer = MatchLayer.VALOR_CFOP_CST
                    detalhes = {
                        'camada': 6,
                        'criterio': 'Valor Total + CFOP/CST',
                        'vl_total_xml': float(xml_item.valor_total),
                        'vl_total_sped': float(sped_item.valor_total),
                        'diff_vl_pct': diff_vl_pct * 100,
                        'cfop_match': cfop_xml == sped_item.cfop if cfop_xml and sped_item.cfop else False,
                        'cst_match': (cst_xml == (sped_item.icms.cst if (sped_item.icms and hasattr(sped_item.icms, 'cst')) else None) if cst_xml else False)
                    }
        
        return melhor_match, melhor_score, melhor_layer, detalhes
    
    def _get_ncm_item(self, item: ItemFiscal) -> Optional[str]:
        """Obtém NCM do item (do próprio item ou do cadastro 0200)"""
        if item.ncm:
            return item.ncm
        
        if item.codigo_item and item.codigo_item in self.map_0200:
            return self.map_0200[item.codigo_item].get('NCM', '').strip() or None
        
        # Tentar extrair NCM do código do item
        if item.codigo_item:
            codigo = str(item.codigo_item).strip()
            if len(codigo) >= 8 and codigo[:8].isdigit():
                return codigo[:8]
        
        return None
    
    def _similaridade_texto(self, texto1: str, texto2: str) -> float:
        """Calcula similaridade entre dois textos (0-1)"""
        if not texto1 or not texto2:
            return 0.0
        
        texto1_norm = self._normalizar_texto(texto1)
        texto2_norm = self._normalizar_texto(texto2)
        
        if not texto1_norm or not texto2_norm:
            return 0.0
        
        return SequenceMatcher(None, texto1_norm, texto2_norm).ratio()
    
    def _normalizar_texto(self, texto: str) -> str:
        """Normaliza texto para comparação"""
        if not texto:
            return ""
        texto = " ".join(str(texto).upper().split())
        texto = re.sub(r'[^\w\s]', '', texto)
        return texto.strip()
    
    def _inferir_cfop_cst(
        self,
        xml_item: ItemFiscal,
        matched_item: Optional[ItemFiscal],
        sped_itens: List[ItemFiscal],
        documento_sped: Optional[DocumentoFiscal]
    ) -> Tuple[Optional[str], Optional[str], float]:
        """
        Infere CFOP/CST para item do XML baseado no SPED
        
        Returns:
            Tupla (cfop_inferido, cst_inferido, confianca)
        """
        # Se há match, usar CFOP/CST do item matched
        if matched_item:
            cfop = matched_item.cfop
            cst = (matched_item.icms.cst if (matched_item.icms and hasattr(matched_item.icms, 'cst')) else None)
            confianca = 100.0  # Alta confiança quando há match
            return cfop, cst, confianca
        
        # Tentar inferir de outros itens do mesmo documento
        if documento_sped and sped_itens:
            # Buscar item similar por NCM
            ncm_xml = xml_item.ncm
            if ncm_xml:
                for sped_item in sped_itens:
                    ncm_sped = self._get_ncm_item(sped_item)
                    if ncm_xml == ncm_sped:
                        cfop = sped_item.cfop
                        cst = (sped_item.icms.cst if (sped_item.icms and hasattr(sped_item.icms, 'cst')) else None)
                        confianca = 70.0  # Média confiança
                        return cfop, cst, confianca
            
            # Buscar item similar por descrição
            if xml_item.descricao:
                melhor_similaridade = 0.0
                melhor_item: Optional[ItemFiscal] = None
                
                for sped_item in sped_itens:
                    if sped_item.descricao:
                        similaridade = self._similaridade_texto(
                            xml_item.descricao, sped_item.descricao
                        )
                        if similaridade > melhor_similaridade and similaridade >= 0.75:
                            melhor_similaridade = similaridade
                            melhor_item = sped_item
                
                if melhor_item:
                    cfop = melhor_item.cfop
                    cst = (melhor_item.icms.cst if (melhor_item.icms and hasattr(melhor_item.icms, 'cst')) else None)
                    confianca = 60.0 + (melhor_similaridade * 20)  # 60-80
                    return cfop, cst, confianca
        
        # Tentar inferir do cadastro 0200
        if xml_item.codigo_item and xml_item.codigo_item in self.map_0200:
            # Não podemos inferir CFOP/CST apenas do 0200
            # Mas podemos usar regras se disponíveis
            pass
        
        # Não foi possível inferir
        return None, None, 0.0

