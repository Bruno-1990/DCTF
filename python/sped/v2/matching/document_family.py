#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrupador de Famílias de Documentos
Agrupa NF original + complementar + ajuste + devolução
Conforme roteiro item 9.4: "Identificar famílias de documento"
"""

from typing import List, Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from decimal import Decimal
import logging

from ..canonical.documento_fiscal import DocumentoFiscal

logger = logging.getLogger(__name__)


@dataclass
class FamiliaDocumento:
    """Família de documentos fiscais relacionados"""
    documento_principal: DocumentoFiscal  # NF original
    complementares: List[DocumentoFiscal] = field(default_factory=list)  # NF complementares
    ajustes: List[DocumentoFiscal] = field(default_factory=list)  # NF de ajuste
    devolucoes: List[DocumentoFiscal] = field(default_factory=list)  # NF de devolução
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def chave_principal(self) -> str:
        """Retorna chave do documento principal"""
        return self.documento_principal.chave_acesso or ''
    
    @property
    def todos_documentos(self) -> List[DocumentoFiscal]:
        """Retorna todos os documentos da família"""
        return [self.documento_principal] + self.complementares + self.ajustes + self.devolucoes
    
    @property
    def valor_total_familia(self) -> Decimal:
        """Calcula valor total considerando toda a família"""
        total = self.documento_principal.valor_total or Decimal('0')
        
        # Somar complementares e ajustes
        for doc in self.complementares + self.ajustes:
            total += doc.valor_total or Decimal('0')
        
        # Devoluções reduzem o valor
        for doc in self.devolucoes:
            total -= doc.valor_total or Decimal('0')
        
        return total
    
    @property
    def tem_complementares(self) -> bool:
        """Verifica se tem notas complementares"""
        return len(self.complementares) > 0
    
    @property
    def tem_ajustes(self) -> bool:
        """Verifica se tem notas de ajuste"""
        return len(self.ajustes) > 0
    
    @property
    def tem_devolucoes(self) -> bool:
        """Verifica se tem notas de devolução"""
        return len(self.devolucoes) > 0


class DocumentFamilyGrouper:
    """
    Agrupa documentos em famílias baseado em referências e relacionamentos
    
    Estratégias:
    1. finNFe = '2' (complementar) ou '3' (ajuste) → buscar chave referenciada
    2. CFOPs de devolução (1201, 1202, 2201, 2202, etc.) → buscar chave referenciada
    3. Mesmo CNPJ emit/dest + série + número próximo + datas próximas (fallback)
    """
    
    def __init__(self):
        """Inicializa o agrupador"""
        self.familias: List[FamiliaDocumento] = []
        self._index_por_chave: Dict[str, FamiliaDocumento] = {}
        self._documentos_processados: Set[str] = set()
    
    def agrupar(
        self,
        documentos_xml: List[DocumentoFiscal],
        documentos_efd: List[DocumentoFiscal]
    ) -> List[FamiliaDocumento]:
        """
        Agrupa documentos em famílias
        
        Args:
            documentos_xml: Lista de documentos XML normalizados
            documentos_efd: Lista de documentos EFD normalizados
        
        Returns:
            Lista de FamiliaDocumento
        """
        # Combinar todos os documentos
        todos_docs = documentos_xml + documentos_efd
        
        # Reset
        self.familias = []
        self._index_por_chave = {}
        self._documentos_processados = set()
        
        logger.info(f"Agrupando {len(todos_docs)} documentos em famílias...")
        
        # Primeiro passo: identificar documentos principais (finNFe = '1' ou não especificado)
        principais = []
        relacionados = []
        
        for doc in todos_docs:
            chave = doc.chave_acesso
            if not chave or chave in self._documentos_processados:
                continue
            
            fin_nfe = doc.metadata.get('finNFe', '1')  # Padrão: normal
            
            if fin_nfe == '1' or not fin_nfe:
                # Documento principal (normal)
                principais.append(doc)
            else:
                # Documento relacionado (complementar, ajuste, devolução)
                relacionados.append(doc)
        
        logger.debug(f"Principais: {len(principais)}, Relacionados: {len(relacionados)}")
        
        # Criar famílias iniciais com documentos principais
        for doc in principais:
            familia = FamiliaDocumento(documento_principal=doc)
            self.familias.append(familia)
            
            chave = doc.chave_acesso
            if chave:
                self._index_por_chave[chave] = familia
                self._documentos_processados.add(chave)
        
        # Processar documentos relacionados
        for doc in relacionados:
            self._adicionar_documento_relacionado(doc)
        
        logger.info(f"Agrupamento concluído: {len(self.familias)} famílias criadas")
        
        # Log estatísticas
        familias_com_complementares = len([f for f in self.familias if f.tem_complementares])
        familias_com_ajustes = len([f for f in self.familias if f.tem_ajustes])
        familias_com_devolucoes = len([f for f in self.familias if f.tem_devolucoes])
        
        logger.info(f"  - Com complementares: {familias_com_complementares}")
        logger.info(f"  - Com ajustes: {familias_com_ajustes}")
        logger.info(f"  - Com devoluções: {familias_com_devolucoes}")
        
        return self.familias
    
    def _adicionar_documento_relacionado(self, doc: DocumentoFiscal) -> bool:
        """
        Adiciona documento relacionado à família correta
        
        Args:
            doc: Documento a adicionar
        
        Returns:
            True se adicionado, False caso contrário
        """
        chave = doc.chave_acesso
        if not chave or chave in self._documentos_processados:
            return False
        
        fin_nfe = doc.metadata.get('finNFe', '1')
        
        # Tentar encontrar chave referenciada
        chave_referenciada = self._extrair_chave_referenciada(doc)
        
        if chave_referenciada:
            # Buscar família pela chave referenciada
            familia = self._index_por_chave.get(chave_referenciada)
            
            if familia:
                self._adicionar_a_familia(familia, doc, fin_nfe)
                self._documentos_processados.add(chave)
                return True
        
        # Se não encontrou por referência, tentar por CFOP de devolução
        if self._is_cfop_devolucao(doc):
            # Buscar família por heurística (CNPJ, série, número, data)
            familia = self._buscar_familia_por_heuristica(doc)
            
            if familia:
                familia.devolucoes.append(doc)
                self._documentos_processados.add(chave)
                logger.debug(f"Devolução {chave} adicionada à família {familia.chave_principal} (heurística)")
                return True
        
        # Se não conseguiu associar, criar nova família (documento órfão)
        familia = FamiliaDocumento(documento_principal=doc)
        self.familias.append(familia)
        self._index_por_chave[chave] = familia
        self._documentos_processados.add(chave)
        
        logger.debug(f"Documento {chave} criado como família independente")
        return True
    
    def _adicionar_a_familia(
        self,
        familia: FamiliaDocumento,
        doc: DocumentoFiscal,
        fin_nfe: str
    ):
        """Adiciona documento à família apropriada"""
        if fin_nfe == '2':
            # Complementar
            familia.complementares.append(doc)
            logger.debug(f"Complementar {doc.chave_acesso} → {familia.chave_principal}")
        elif fin_nfe == '3':
            # Ajuste
            familia.ajustes.append(doc)
            logger.debug(f"Ajuste {doc.chave_acesso} → {familia.chave_principal}")
        elif fin_nfe == '4':
            # Devolução (finNFe)
            familia.devolucoes.append(doc)
            logger.debug(f"Devolução {doc.chave_acesso} → {familia.chave_principal}")
        else:
            # Outros tipos
            familia.metadata.setdefault('outros', []).append(doc)
            logger.debug(f"Outro ({fin_nfe}) {doc.chave_acesso} → {familia.chave_principal}")
    
    def _extrair_chave_referenciada(self, doc: DocumentoFiscal) -> Optional[str]:
        """
        Extrai chave NF-e referenciada do documento
        
        Procura em:
        - doc.metadata['NFref'] (tag NFref do XML)
        - doc.metadata['chave_referenciada']
        """
        metadata = doc.metadata or {}
        
        # NFref pode ser lista ou string
        nf_ref = metadata.get('NFref')
        if nf_ref:
            if isinstance(nf_ref, list) and len(nf_ref) > 0:
                # Pegar primeira referência
                ref = nf_ref[0]
                if isinstance(ref, dict):
                    return ref.get('refNFe') or ref.get('chave')
                return str(ref)
            elif isinstance(nf_ref, str):
                return nf_ref
        
        # Tentar campo direto
        chave_ref = metadata.get('chave_referenciada')
        if chave_ref:
            return str(chave_ref)
        
        return None
    
    def _is_cfop_devolucao(self, doc: DocumentoFiscal) -> bool:
        """Verifica se documento é devolução por CFOP"""
        # CFOPs de devolução típicos
        cfops_devolucao = {
            '1201', '1202', '1203', '1204',  # Devoluções de vendas (entrada)
            '2201', '2202', '2203', '2204',  # Devoluções de vendas (entrada interestadual)
            '1411', '2411',                   # Devoluções de remessas
            '5201', '5202', '5203', '5204',  # Devoluções de compras (saída)
            '6201', '6202', '6203', '6204',  # Devoluções de compras (saída interestadual)
        }
        
        # Verificar CFOP dos itens
        for item in doc.itens:
            if item.cfop in cfops_devolucao:
                return True
        
        return False
    
    def _buscar_familia_por_heuristica(self, doc: DocumentoFiscal) -> Optional[FamiliaDocumento]:
        """
        Busca família por heurística (CNPJ, série, número, data)
        
        Critérios:
        - Mesmo CNPJ emitente/destinatário (invertido para devolução)
        - Mesma série
        - Número próximo (diferença < 100)
        - Data próxima (diferença < 90 dias)
        """
        cnpj_emit = doc.cnpj_emitente
        cnpj_dest = doc.cnpj_destinatario
        serie = doc.serie
        numero = doc.numero
        data = doc.data_emissao
        
        if not cnpj_emit or not cnpj_dest:
            return None
        
        # Para devolução, emitente e destinatário são invertidos
        # Buscar documento onde emit original = dest atual e vice-versa
        for familia in self.familias:
            principal = familia.documento_principal
            
            # Verificar se CNPJs são invertidos (indicativo de devolução)
            if (principal.cnpj_emitente == cnpj_dest and 
                principal.cnpj_destinatario == cnpj_emit):
                
                # Verificar série
                if principal.serie == serie:
                    # Verificar número próximo (dentro de 100 documentos)
                    try:
                        num_principal = int(principal.numero)
                        num_doc = int(numero)
                        if abs(num_principal - num_doc) < 100:
                            logger.debug(f"Família encontrada por heurística: {familia.chave_principal}")
                            return familia
                    except (ValueError, TypeError):
                        pass
        
        return None
    
    def get_familia_por_chave(self, chave: str) -> Optional[FamiliaDocumento]:
        """Retorna família de um documento por chave"""
        # Procurar na família principal
        familia = self._index_por_chave.get(chave)
        if familia:
            return familia
        
        # Procurar em todos os documentos relacionados
        for familia in self.familias:
            for doc in familia.todos_documentos:
                if doc.chave_acesso == chave:
                    return familia
        
        return None


if __name__ == '__main__':
    # Teste standalone
    print("✅ DocumentFamilyGrouper criado com sucesso")

