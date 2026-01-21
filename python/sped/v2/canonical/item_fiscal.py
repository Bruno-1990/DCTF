"""
Item Fiscal - Modelo Canônico
Representa um item de nota fiscal normalizado
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from decimal import Decimal
from .tributos import TributoICMS, TributoICMSST, TributoIPI, TributoDIFAL, TributoFCP


@dataclass
class ItemFiscal:
    """Item fiscal normalizado"""
    # Identificação
    codigo_item: Optional[str] = None
    descricao: Optional[str] = None
    ncm: Optional[str] = None
    cest: Optional[str] = None
    cfop: Optional[str] = None
    
    # Quantidades e Valores
    quantidade: Decimal = Decimal('0.00')
    unidade: Optional[str] = None
    valor_unitario: Decimal = Decimal('0.00')
    valor_total: Decimal = Decimal('0.00')
    valor_desconto: Decimal = Decimal('0.00')
    valor_frete: Decimal = Decimal('0.00')
    valor_seguro: Decimal = Decimal('0.00')
    valor_outros: Decimal = Decimal('0.00')
    
    # Tributos
    icms: Optional[TributoICMS] = None
    icms_st: Optional[TributoICMSST] = None
    ipi: Optional[TributoIPI] = None
    difal: Optional[TributoDIFAL] = None
    fcp: Optional[TributoFCP] = None
    
    # Informações adicionais
    informacoes_adicionais: Optional[str] = None
    codigo_produto_anp: Optional[str] = None  # Para combustíveis
    percentual_glp: Optional[Decimal] = None
    
    # Metadados e referências
    numero_item: Optional[int] = None  # Número sequencial do item na NF
    referencia_sped: Optional[str] = None  # Referência ao registro C170
    referencia_xml: Optional[str] = None  # Referência ao elemento XML
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def calcular_valor_total(self) -> Decimal:
        """Calcula o valor total do item considerando todos os componentes"""
        return (
            self.valor_total
            + (self.valor_frete or Decimal('0.00'))
            + (self.valor_seguro or Decimal('0.00'))
            + (self.valor_outros or Decimal('0.00'))
            - (self.valor_desconto or Decimal('0.00'))
        )
    
    def get_valor_tributos(self) -> Decimal:
        """Retorna o valor total de tributos do item"""
        total = Decimal('0.00')
        if self.icms:
            total += self.icms.valor
        if self.icms_st:
            total += self.icms_st.valor_st
        if self.ipi:
            total += self.ipi.valor
        if self.difal:
            total += self.difal.valor_total
        if self.fcp:
            total += self.fcp.valor
        return total
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte o item para dicionário"""
        return {
            'codigo_item': self.codigo_item,
            'descricao': self.descricao,
            'ncm': self.ncm,
            'cest': self.cest,
            'cfop': self.cfop,
            'quantidade': float(self.quantidade),
            'unidade': self.unidade,
            'valor_unitario': float(self.valor_unitario),
            'valor_total': float(self.valor_total),
            'valor_desconto': float(self.valor_desconto),
            'icms': self.icms.__dict__ if self.icms else None,
            'icms_st': self.icms_st.__dict__ if self.icms_st else None,
            'ipi': self.ipi.__dict__ if self.ipi else None,
            'difal': self.difal.__dict__ if self.difal else None,
            'fcp': self.fcp.__dict__ if self.fcp else None,
            'metadata': self.metadata,
        }








