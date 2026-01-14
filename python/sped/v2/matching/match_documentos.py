#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Matching Robusto de Documentos (Camada C)
Match entre XML (normalizado) e SPED (normalizado) usando modelo canônico

Estratégias de matching:
1. Match por chave NF-e (prioritário) - 50 pontos
2. Fallback: CNPJ + modelo + série + número + data + vNF - 40 pontos
3. Fallback probabilístico: tolerâncias + heurística - variável
"""

from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from decimal import Decimal
import logging

from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.item_fiscal import ItemFiscal

logger = logging.getLogger(__name__)

# Limiar mínimo de score para match confiável
SCORE_MINIMO_MATCH = 50.0
SCORE_MATCH_CHAVE = 50.0
SCORE_MATCH_FALLBACK = 40.0


class MatchStrategy(Enum):
    """Estratégia de matching utilizada"""
    CHAVE_NFE = "chave_nfe"
    FALLBACK_COMPLETO = "fallback_completo"
    FALLBACK_PROBABILISTICO = "fallback_probabilistico"
    NENHUM = "nenhum"


@dataclass
class MatchScore:
    """Score de matching com detalhes"""
    score_total: float
    strategy: MatchStrategy
    pontos_chave: float = 0.0
    pontos_fallback: float = 0.0
    pontos_probabilistico: float = 0.0
    detalhes: Dict[str, Any] = field(default_factory=dict)
    confiavel: bool = False
    
    def is_confiavel(self) -> bool:
        """Verifica se o match é confiável"""
        return self.score_total >= SCORE_MINIMO_MATCH


@dataclass
class MatchResult:
    """Resultado do matching entre XML e SPED"""
    xml_doc: DocumentoFiscal
    sped_doc: Optional[DocumentoFiscal]
    match_score: MatchScore
    matched: bool = False
    itens_matched: List[Tuple[ItemFiscal, ItemFiscal, float]] = field(default_factory=list)
    itens_nao_matched_xml: List[ItemFiscal] = field(default_factory=list)
    itens_nao_matched_sped: List[ItemFiscal] = field(default_factory=list)
    
    def is_confiavel(self) -> bool:
        """Verifica se o match é confiável"""
        return self.matched and self.match_score.is_confiavel()


class DocumentMatcher:
    """Matcher robusto de documentos usando modelo canônico"""
    
    def __init__(
        self,
        tolerancia_valor: float = 0.01,
        tolerancia_data_dias: int = 1,
        tolerancia_percentual: float = 0.001
    ):
        """
        Inicializa o matcher
        
        Args:
            tolerancia_valor: Tolerância para valores em reais
            tolerancia_data_dias: Tolerância para datas em dias
            tolerancia_percentual: Tolerância percentual para valores
        """
        self.tolerancia_valor = tolerancia_valor
        self.tolerancia_data_dias = tolerancia_data_dias
        self.tolerancia_percentual = tolerancia_percentual
    
    def match_documentos(
        self,
        xml_docs: List[DocumentoFiscal],
        sped_docs: List[DocumentoFiscal]
    ) -> List[MatchResult]:
        """
        Faz matching entre lista de XMLs e SPEDs
        
        Args:
            xml_docs: Lista de documentos XML normalizados
            sped_docs: Lista de documentos SPED normalizados
            
        Returns:
            Lista de MatchResult
        """
        results: List[MatchResult] = []
        
        for xml_doc in xml_docs:
            if not xml_doc.is_valido():
                logger.debug(f"XML {xml_doc.chave_acesso} inválido (cancelado/denegado), pulando")
                continue
            
            # Buscar melhor match
            melhor_match = self._find_best_match(xml_doc, sped_docs)
            
            if melhor_match:
                # Fazer matching de itens
                self._match_itens(melhor_match)
                results.append(melhor_match)
            else:
                # Nenhum match encontrado
                results.append(MatchResult(
                    xml_doc=xml_doc,
                    sped_doc=None,
                    match_score=MatchScore(
                        score_total=0.0,
                        strategy=MatchStrategy.NENHUM,
                        confiavel=False
                    ),
                    matched=False,
                    itens_nao_matched_xml=xml_doc.itens.copy()
                ))
        
        return results
    
    def _find_best_match(
        self,
        xml_doc: DocumentoFiscal,
        sped_docs: List[DocumentoFiscal]
    ) -> Optional[MatchResult]:
        """Encontra o melhor match para um XML"""
        melhor_score = 0.0
        melhor_sped: Optional[DocumentoFiscal] = None
        melhor_match_score: Optional[MatchScore] = None
        
        for sped_doc in sped_docs:
            score_obj = self._calculate_match_score(xml_doc, sped_doc)
            
            if score_obj.score_total > melhor_score:
                melhor_score = score_obj.score_total
                melhor_sped = sped_doc
                melhor_match_score = score_obj
        
        if melhor_match_score and melhor_match_score.is_confiavel() and melhor_sped:
            return MatchResult(
                xml_doc=xml_doc,
                sped_doc=melhor_sped,
                match_score=melhor_match_score,
                matched=True
            )
        
        return None
    
    def _calculate_match_score(
        self,
        xml_doc: DocumentoFiscal,
        sped_doc: DocumentoFiscal
    ) -> MatchScore:
        """
        Calcula score de matching entre XML e SPED
        
        Sistema de pontuação:
        - Chave NF-e: 50 pontos (suficiente para match)
        - Fallback completo: 40 pontos
        - Fallback probabilístico: variável (até 30 pontos)
        """
        score_total = 0.0
        strategy = MatchStrategy.NENHUM
        detalhes: Dict[str, Any] = {}
        
        # 1. Match por chave NF-e (50 pontos) - PRIORITÁRIO
        if xml_doc.chave_acesso and sped_doc.chave_acesso:
            if xml_doc.chave_acesso == sped_doc.chave_acesso:
                score_total = SCORE_MATCH_CHAVE
                strategy = MatchStrategy.CHAVE_NFE
                detalhes['chave_match'] = True
                detalhes['chave'] = xml_doc.chave_acesso
                
                return MatchScore(
                    score_total=score_total,
                    strategy=strategy,
                    pontos_chave=SCORE_MATCH_CHAVE,
                    detalhes=detalhes,
                    confiavel=True
                )
        
        # 2. Fallback: CNPJ + modelo + série + número + data + vNF (40 pontos)
        fallback_score = self._calculate_fallback_score(xml_doc, sped_doc)
        if fallback_score >= SCORE_MATCH_FALLBACK:
            score_total = fallback_score
            strategy = MatchStrategy.FALLBACK_COMPLETO
            detalhes['fallback_match'] = True
            detalhes.update(self._get_fallback_details(xml_doc, sped_doc))
            
            return MatchScore(
                score_total=score_total,
                strategy=strategy,
                pontos_fallback=fallback_score,
                detalhes=detalhes,
                confiavel=score_total >= SCORE_MINIMO_MATCH
            )
        
        # 3. Fallback probabilístico: tolerâncias + heurística
        probabilistic_score = self._calculate_probabilistic_score(xml_doc, sped_doc)
        if probabilistic_score > 0:
            score_total = fallback_score + probabilistic_score
            strategy = MatchStrategy.FALLBACK_PROBABILISTICO
            detalhes['probabilistic_match'] = True
            detalhes.update(self._get_probabilistic_details(xml_doc, sped_doc))
        
        return MatchScore(
            score_total=score_total,
            strategy=strategy,
            pontos_fallback=fallback_score,
            pontos_probabilistico=probabilistic_score,
            detalhes=detalhes,
            confiavel=score_total >= SCORE_MINIMO_MATCH
        )
    
    def _calculate_fallback_score(
        self,
        xml_doc: DocumentoFiscal,
        sped_doc: DocumentoFiscal
    ) -> float:
        """Calcula score do fallback completo"""
        score = 0.0
        
        # Modelo (10 pontos)
        if xml_doc.modelo and sped_doc.modelo:
            if str(xml_doc.modelo).strip() == str(sped_doc.modelo).strip():
                score += 10.0
        
        # Série (10 pontos)
        if xml_doc.serie and sped_doc.serie:
            if str(xml_doc.serie).strip() == str(sped_doc.serie).strip():
                score += 10.0
        
        # Número (10 pontos)
        if xml_doc.numero and sped_doc.numero:
            if str(xml_doc.numero).strip() == str(sped_doc.numero).strip():
                score += 10.0
        
        # Data (5 pontos)
        if xml_doc.data_emissao and sped_doc.data_emissao:
            if self._compare_dates(xml_doc.data_emissao, sped_doc.data_emissao):
                score += 5.0
        
        # CNPJ (5 pontos)
        if self._compare_cnpj(xml_doc, sped_doc):
            score += 5.0
        
        return score
    
    def _calculate_probabilistic_score(
        self,
        xml_doc: DocumentoFiscal,
        sped_doc: DocumentoFiscal
    ) -> float:
        """Calcula score probabilístico usando tolerâncias"""
        score = 0.0
        
        # Valor total (15 pontos)
        if xml_doc.valor_total > 0 and sped_doc.valor_total > 0:
            diferenca = abs(float(xml_doc.valor_total - sped_doc.valor_total))
            percentual = diferenca / float(xml_doc.valor_total) if xml_doc.valor_total > 0 else 1.0
            
            if diferenca <= self.tolerancia_valor:
                score += 15.0
            elif percentual <= self.tolerancia_percentual:
                score += 10.0
            elif diferenca <= self.tolerancia_valor * 10:
                score += 5.0
        
        # Data com tolerância (10 pontos)
        if xml_doc.data_emissao and sped_doc.data_emissao:
            diff_dias = abs((xml_doc.data_emissao - sped_doc.data_emissao).days)
            if diff_dias <= self.tolerancia_data_dias:
                score += 10.0
            elif diff_dias <= self.tolerancia_data_dias * 2:
                score += 5.0
        
        # CNPJ parcial (5 pontos)
        if self._compare_cnpj_partial(xml_doc, sped_doc):
            score += 5.0
        
        return score
    
    def _compare_dates(self, date1: datetime, date2: datetime) -> bool:
        """Compara duas datas (ignorando hora)"""
        return (date1.year == date2.year and
                date1.month == date2.month and
                date1.day == date2.day)
    
    def _compare_cnpj(self, xml_doc: DocumentoFiscal, sped_doc: DocumentoFiscal) -> bool:
        """Compara CNPJs (emitente ou destinatário)"""
        # Normalizar CNPJs (remover formatação)
        def normalize_cnpj(cnpj: Optional[str]) -> str:
            if not cnpj:
                return ""
            return "".join(filter(str.isdigit, str(cnpj)))
        
        xml_cnpj_emit = normalize_cnpj(xml_doc.cnpj_emitente)
        xml_cnpj_dest = normalize_cnpj(xml_doc.cnpj_destinatario)
        sped_cnpj_emit = normalize_cnpj(sped_doc.cnpj_emitente)
        sped_cnpj_dest = normalize_cnpj(sped_doc.cnpj_destinatario)
        
        # Comparar emitente com emitente ou destinatário
        if xml_cnpj_emit and (xml_cnpj_emit == sped_cnpj_emit or xml_cnpj_emit == sped_cnpj_dest):
            return True
        
        # Comparar destinatário com emitente ou destinatário
        if xml_cnpj_dest and (xml_cnpj_dest == sped_cnpj_emit or xml_cnpj_dest == sped_cnpj_dest):
            return True
        
        return False
    
    def _compare_cnpj_partial(self, xml_doc: DocumentoFiscal, sped_doc: DocumentoFiscal) -> bool:
        """Compara CNPJs parcialmente (primeiros 8 dígitos)"""
        def get_cnpj_prefix(cnpj: Optional[str]) -> str:
            if not cnpj:
                return ""
            normalized = "".join(filter(str.isdigit, str(cnpj)))
            return normalized[:8] if len(normalized) >= 8 else ""
        
        xml_prefixes = [
            get_cnpj_prefix(xml_doc.cnpj_emitente),
            get_cnpj_prefix(xml_doc.cnpj_destinatario)
        ]
        sped_prefixes = [
            get_cnpj_prefix(sped_doc.cnpj_emitente),
            get_cnpj_prefix(sped_doc.cnpj_destinatario)
        ]
        
        for xml_pref in xml_prefixes:
            if xml_pref and xml_pref in sped_prefixes:
                return True
        
        return False
    
    def _get_fallback_details(
        self,
        xml_doc: DocumentoFiscal,
        sped_doc: DocumentoFiscal
    ) -> Dict[str, Any]:
        """Retorna detalhes do fallback"""
        return {
            'modelo_match': xml_doc.modelo == sped_doc.modelo,
            'serie_match': xml_doc.serie == sped_doc.serie,
            'numero_match': xml_doc.numero == sped_doc.numero,
            'data_match': self._compare_dates(xml_doc.data_emissao, sped_doc.data_emissao) if xml_doc.data_emissao and sped_doc.data_emissao else False,
            'cnpj_match': self._compare_cnpj(xml_doc, sped_doc),
        }
    
    def _get_probabilistic_details(
        self,
        xml_doc: DocumentoFiscal,
        sped_doc: DocumentoFiscal
    ) -> Dict[str, Any]:
        """Retorna detalhes do match probabilístico"""
        diferenca_valor = abs(float(xml_doc.valor_total - sped_doc.valor_total)) if xml_doc.valor_total and sped_doc.valor_total else None
        diff_dias = None
        if xml_doc.data_emissao and sped_doc.data_emissao:
            diff_dias = abs((xml_doc.data_emissao - sped_doc.data_emissao).days)
        
        return {
            'diferenca_valor': diferenca_valor,
            'diff_dias': diff_dias,
            'cnpj_partial_match': self._compare_cnpj_partial(xml_doc, sped_doc),
        }
    
    def _match_itens(self, match_result: MatchResult):
        """Faz matching de itens entre XML e SPED"""
        if not match_result.sped_doc:
            match_result.itens_nao_matched_xml = match_result.xml_doc.itens.copy()
            return
        
        xml_itens = match_result.xml_doc.itens.copy()
        sped_itens = match_result.sped_doc.itens.copy()
        matched_pairs: List[Tuple[ItemFiscal, ItemFiscal, float]] = []
        
        # Tentar match por número do item primeiro
        for xml_item in xml_itens[:]:
            melhor_match: Optional[ItemFiscal] = None
            melhor_score = 0.0
            
            for sped_item in sped_itens[:]:
                score = self._calculate_item_score(xml_item, sped_item)
                
                if score > melhor_score and score >= 50.0:  # Score mínimo para match de item
                    melhor_score = score
                    melhor_match = sped_item
            
            if melhor_match:
                matched_pairs.append((xml_item, melhor_match, melhor_score))
                xml_itens.remove(xml_item)
                sped_itens.remove(melhor_match)
        
        # Tentar match probabilístico para itens restantes
        for xml_item in xml_itens[:]:
            melhor_match: Optional[ItemFiscal] = None
            melhor_score = 0.0
            
            for sped_item in sped_itens[:]:
                score = self._calculate_item_score(xml_item, sped_item)
                
                if score > melhor_score and score >= 30.0:  # Score menor para match probabilístico
                    melhor_score = score
                    melhor_match = sped_item
            
            if melhor_match and melhor_score >= 30.0:
                matched_pairs.append((xml_item, melhor_match, melhor_score))
                xml_itens.remove(xml_item)
                sped_itens.remove(melhor_match)
        
        match_result.itens_matched = matched_pairs
        match_result.itens_nao_matched_xml = xml_itens
        match_result.itens_nao_matched_sped = sped_itens
    
    def _calculate_item_score(
        self,
        xml_item: ItemFiscal,
        sped_item: ItemFiscal
    ) -> float:
        """Calcula score de matching entre itens"""
        score = 0.0
        
        # Match por número do item (50 pontos)
        if xml_item.numero_item and sped_item.numero_item:
            if str(xml_item.numero_item).strip() == str(sped_item.numero_item).strip():
                score += 50.0
                return score  # Match perfeito, retornar
        
        # Match por código do item (30 pontos)
        if xml_item.codigo_item and sped_item.codigo_item:
            xml_cod = str(xml_item.codigo_item).strip()
            sped_cod = str(sped_item.codigo_item).strip()
            
            if xml_cod == sped_cod:
                score += 30.0
            elif xml_cod in sped_cod or sped_cod in xml_cod:
                score += 15.0
        
        # Match por quantidade (10 pontos)
        if xml_item.quantidade > 0 and sped_item.quantidade > 0:
            diferenca = abs(float(xml_item.quantidade - sped_item.quantidade))
            percentual = diferenca / float(xml_item.quantidade)
            
            if diferenca <= 0.001:  # Tolerância mínima
                score += 10.0
            elif percentual <= self.tolerancia_percentual:
                score += 5.0
        
        # Match por valor (10 pontos)
        if xml_item.valor_total > 0 and sped_item.valor_total > 0:
            diferenca = abs(float(xml_item.valor_total - sped_item.valor_total))
            
            if diferenca <= self.tolerancia_valor:
                score += 10.0
            elif diferenca <= self.tolerancia_valor * 10:
                score += 5.0
        
        return score


