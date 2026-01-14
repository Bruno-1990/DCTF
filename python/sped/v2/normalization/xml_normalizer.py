"""
XML Normalizer - Converte XMLs de NF-e para Modelo Canônico
Unifica conceitos fiscais e preserva metadados
"""

from pathlib import Path
from typing import List, Optional, Dict, Any
import logging

from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.parsers import parse_xml_to_canonical

logger = logging.getLogger(__name__)


class XMLNormalizer:
    """Normalizador de XMLs para modelo canônico"""
    
    def __init__(self):
        """Inicializa o normalizador"""
        pass
    
    def normalize_file(self, xml_path: Path) -> Optional[DocumentoFiscal]:
        """
        Normaliza um arquivo XML para modelo canônico
        
        Args:
            xml_path: Caminho do arquivo XML
            
        Returns:
            DocumentoFiscal normalizado ou None se erro
        """
        try:
            if not xml_path.exists():
                logger.error(f"Arquivo XML não encontrado: {xml_path}")
                return None
            
            doc = parse_xml_to_canonical(xml_path)
            
            if doc:
                # Aplicar normalizações adicionais
                self._normalize_documento(doc)
            
            return doc
            
        except Exception as e:
            logger.error(f"Erro ao normalizar XML {xml_path}: {e}")
            return None
    
    def normalize_folder(self, folder_path: Path) -> List[DocumentoFiscal]:
        """
        Normaliza todos os XMLs de uma pasta
        
        Args:
            folder_path: Caminho da pasta com XMLs
            
        Returns:
            Lista de DocumentoFiscal normalizados
        """
        documentos: List[DocumentoFiscal] = []
        
        if not folder_path.is_dir():
            logger.error(f"Pasta não encontrada: {folder_path}")
            return documentos
        
        # Buscar todos os XMLs
        xml_files = sorted(folder_path.glob("*.xml"))
        
        for xml_file in xml_files:
            doc = self.normalize_file(xml_file)
            if doc:
                documentos.append(doc)
        
        logger.info(f"Normalizados {len(documentos)} XMLs de {len(xml_files)} arquivos")
        return documentos
    
    def _normalize_documento(self, doc: DocumentoFiscal) -> None:
        """
        Aplica normalizações adicionais ao documento
        
        Args:
            doc: Documento fiscal a normalizar
        """
        # Normalizar CNPJs (remover formatação)
        if doc.cnpj_emitente:
            doc.cnpj_emitente = self._normalize_cnpj(doc.cnpj_emitente)
        if doc.cnpj_destinatario:
            doc.cnpj_destinatario = self._normalize_cnpj(doc.cnpj_destinatario)
        
        # Normalizar chave de acesso (remover espaços)
        if doc.chave_acesso:
            doc.chave_acesso = doc.chave_acesso.strip().replace(' ', '')
        
        # Normalizar valores totais (garantir consistência)
        doc.valor_total = doc.calcular_valor_total()
        
        # Normalizar itens
        for item in doc.itens:
            self._normalize_item(item)
    
    def _normalize_item(self, item: Any) -> None:
        """
        Aplica normalizações adicionais ao item
        
        Args:
            item: Item fiscal a normalizar
        """
        # Normalizar CFOP (remover espaços, garantir 4 dígitos)
        if item.cfop:
            item.cfop = item.cfop.strip().replace(' ', '').zfill(4)
        
        # Normalizar NCM (remover pontos, garantir 8 dígitos)
        if item.ncm:
            item.ncm = item.ncm.strip().replace('.', '').replace(' ', '').zfill(8)
        
        # Normalizar CST (remover espaços, garantir 2-3 dígitos)
        if item.icms and item.icms.cst:
            item.icms.cst = item.icms.cst.strip().replace(' ', '').zfill(2)
        if item.icms_st and item.icms_st.cst:
            item.icms_st.cst = item.icms_st.cst.strip().replace(' ', '').zfill(2)
        if item.ipi and item.ipi.cst:
            item.ipi.cst = item.ipi.cst.strip().replace(' ', '').zfill(2)
        
        # Garantir consistência de valores
        if item.quantidade > 0 and item.valor_unitario == 0:
            # Recalcular valor unitário se necessário
            item.valor_unitario = item.valor_total / item.quantidade
    
    def _normalize_cnpj(self, cnpj: str) -> str:
        """Normaliza CNPJ removendo formatação"""
        if not cnpj:
            return ""
        return ''.join(filter(str.isdigit, str(cnpj)))


def normalize_xml(xml_path: Path) -> Optional[DocumentoFiscal]:
    """
    Função de conveniência para normalizar um XML
    
    Args:
        xml_path: Caminho do arquivo XML
        
    Returns:
        DocumentoFiscal normalizado ou None
    """
    normalizer = XMLNormalizer()
    return normalizer.normalize_file(xml_path)


def normalize_xml_folder(folder_path: Path) -> List[DocumentoFiscal]:
    """
    Função de conveniência para normalizar uma pasta de XMLs
    
    Args:
        folder_path: Caminho da pasta
        
    Returns:
        Lista de DocumentoFiscal normalizados
    """
    normalizer = XMLNormalizer()
    return normalizer.normalize_folder(folder_path)


