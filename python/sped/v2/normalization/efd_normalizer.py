"""
EFD Normalizer - Converte EFD para Modelo Canônico
Unifica conceitos fiscais e preserva metadados
"""

from pathlib import Path
from typing import List, Optional, Dict, Any
import logging

from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.item_fiscal import ItemFiscal
from ..canonical.parsers import (
    parse_efd_c100_to_canonical,
    parse_efd_c170_to_canonical,
    split_sped_line,
    parse_decimal
)

logger = logging.getLogger(__name__)


class EFDNormalizer:
    """Normalizador de EFD para modelo canônico"""
    
    def __init__(self):
        """Inicializa o normalizador"""
        pass
    
    def normalize_file(self, efd_path: Path) -> List[DocumentoFiscal]:
        """
        Normaliza um arquivo EFD para modelo canônico
        
        Args:
            efd_path: Caminho do arquivo EFD
            
        Returns:
            Lista de DocumentoFiscal normalizados com itens associados
        """
        try:
            if not efd_path.exists():
                logger.error(f"Arquivo EFD não encontrado: {efd_path}")
                return []
            
            # Parsear documentos C100
            documentos = parse_efd_c100_to_canonical(efd_path)
            
            # Parsear itens C170 e associar aos documentos
            itens_por_chave = self._parse_c170_by_chave(efd_path)
            
            # Associar itens aos documentos
            for doc in documentos:
                chave = doc.chave_acesso
                if chave and chave in itens_por_chave:
                    doc.itens = itens_por_chave[chave]
                else:
                    # Tentar associar por número/série/modelo
                    chave_alternativa = f"{doc.modelo}:{doc.serie}:{doc.numero}"
                    if chave_alternativa in itens_por_chave:
                        doc.itens = itens_por_chave[chave_alternativa]
                
                # Aplicar normalizações adicionais
                self._normalize_documento(doc)
            
            logger.info(f"Normalizados {len(documentos)} documentos do EFD")
            return documentos
            
        except Exception as e:
            logger.error(f"Erro ao normalizar EFD {efd_path}: {e}")
            return []
    
    def _parse_c170_by_chave(self, efd_path: Path) -> Dict[str, List[ItemFiscal]]:
        """
        Parseia C170 e agrupa por chave de acesso
        
        Args:
            efd_path: Caminho do arquivo EFD
            
        Returns:
            Dicionário {chave: [itens]}
        """
        itens_por_chave: Dict[str, List[ItemFiscal]] = {}
        current_chave: Optional[str] = None
        current_triple: Optional[str] = None  # modelo:serie:numero
        
        try:
            with efd_path.open("r", encoding="latin1", errors="ignore") as f:
                for line in f:
                    # Atualizar referência quando encontrar C100
                    if line.startswith("|C100|"):
                        fs = split_sped_line(line, min_fields=10)
                        current_chave = fs[9] if len(fs) > 9 else None
                        current_triple = None
                        if len(fs) > 5:
                            modelo = fs[5] or ''
                            serie = fs[7] or ''
                            numero = fs[8] or ''
                            current_triple = f"{modelo}:{serie}:{numero}"
                        continue
                    
                    if not line.startswith("|C170|"):
                        continue
                    
                    # Parsear item C170
                    fs = split_sped_line(line, min_fields=30)
                    
                    # Criar item
                    item = ItemFiscal(
                        numero_item=int(parse_decimal(fs[2] if len(fs) > 2 else None)),
                        codigo_item=fs[3] if len(fs) > 3 else None,
                        descricao=fs[4] if len(fs) > 4 else None,
                        unidade=fs[5] if len(fs) > 5 else None,
                        quantidade=parse_decimal(fs[6] if len(fs) > 6 else None),
                        valor_unitario=parse_decimal(fs[7] if len(fs) > 7 else None),
                        valor_total=parse_decimal(fs[8] if len(fs) > 8 else None),
                        valor_desconto=parse_decimal(fs[9] if len(fs) > 9 else None),
                        cfop=fs[10] if len(fs) > 10 else None,
                        referencia_sped=f"C170:{current_chave or current_triple}:{fs[2] if len(fs) > 2 else ''}",
                        metadata={'raw_line': line.strip()}
                    )
                    
                    # Adicionar tributos se disponíveis
                    from ..canonical.tributos import TributoICMS, TributoICMSST, TributoIPI
                    
                    if len(fs) > 13:
                        item.icms = TributoICMS(
                            base_calculo=parse_decimal(fs[13] if len(fs) > 13 else None),
                            aliquota=parse_decimal(fs[14] if len(fs) > 14 else None),
                            valor=parse_decimal(fs[15] if len(fs) > 15 else None),
                            cst=fs[12] if len(fs) > 12 else None,
                            cfop=item.cfop,
                        )
                    
                    if len(fs) > 18:
                        item.icms_st = TributoICMSST(
                            base_calculo_st=parse_decimal(fs[16] if len(fs) > 16 else None),
                            aliquota_st=parse_decimal(fs[17] if len(fs) > 17 else None),
                            valor_st=parse_decimal(fs[18] if len(fs) > 18 else None),
                            base_calculo_icms_proprio=item.icms.base_calculo if item.icms else None,
                            valor_icms_proprio=item.icms.valor if item.icms else None,
                            cst=item.icms.cst if item.icms else None,
                            cfop=item.cfop,
                        )
                    
                    if len(fs) > 22:
                        item.ipi = TributoIPI(
                            base_calculo=parse_decimal(fs[19] if len(fs) > 19 else None),
                            aliquota=parse_decimal(fs[20] if len(fs) > 20 else None),
                            valor=parse_decimal(fs[21] if len(fs) > 21 else None),
                            cst=fs[22] if len(fs) > 22 else None,
                        )
                    
                    # Adicionar à lista apropriada
                    if current_chave:
                        if current_chave not in itens_por_chave:
                            itens_por_chave[current_chave] = []
                        itens_por_chave[current_chave].append(item)
                    
                    if current_triple:
                        if current_triple not in itens_por_chave:
                            itens_por_chave[current_triple] = []
                        itens_por_chave[current_triple].append(item)
                        
        except Exception as e:
            logger.error(f"Erro ao parsear C170: {e}")
        
        return itens_por_chave
    
    def _normalize_documento(self, doc: DocumentoFiscal) -> None:
        """
        Aplica normalizações adicionais ao documento
        
        Args:
            doc: Documento fiscal a normalizar
        """
        # Normalizar chave de acesso
        if doc.chave_acesso:
            doc.chave_acesso = doc.chave_acesso.strip().replace(' ', '')
        
        # Normalizar valores totais (garantir consistência)
        doc.valor_total = doc.calcular_valor_total()
        
        # Normalizar itens
        for item in doc.itens:
            self._normalize_item(item)
    
    def _normalize_item(self, item: ItemFiscal) -> None:
        """
        Aplica normalizações adicionais ao item
        
        Args:
            item: Item fiscal a normalizar
        """
        # Normalizar CFOP
        if item.cfop:
            item.cfop = item.cfop.strip().replace(' ', '').zfill(4)
        
        # Normalizar NCM
        if item.ncm:
            item.ncm = item.ncm.strip().replace('.', '').replace(' ', '').zfill(8)
        
        # Normalizar CST
        if item.icms and item.icms.cst:
            item.icms.cst = item.icms.cst.strip().replace(' ', '').zfill(2)
        if item.icms_st and item.icms_st.cst:
            item.icms_st.cst = item.icms_st.cst.strip().replace(' ', '').zfill(2)
        if item.ipi and item.ipi.cst:
            item.ipi.cst = item.ipi.cst.strip().replace(' ', '').zfill(2)
        
        # Garantir consistência de valores
        if item.quantidade > 0 and item.valor_unitario == 0:
            item.valor_unitario = item.valor_total / item.quantidade


def normalize_efd(efd_path: Path) -> List[DocumentoFiscal]:
    """
    Função de conveniência para normalizar um EFD
    
    Args:
        efd_path: Caminho do arquivo EFD
        
    Returns:
        Lista de DocumentoFiscal normalizados
    """
    normalizer = EFDNormalizer()
    return normalizer.normalize_file(efd_path)

