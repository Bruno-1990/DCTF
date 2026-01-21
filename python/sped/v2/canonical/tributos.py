"""
Classes de Tributos Fiscais - Modelo Canônico
Normalização de conceitos fiscais: ICMS próprio, ST, DIFAL/FCP, IPI
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from decimal import Decimal


@dataclass
class TributoICMS:
    """ICMS Próprio - Tributo normal"""
    base_calculo: Decimal = Decimal('0.00')
    aliquota: Decimal = Decimal('0.00')
    valor: Decimal = Decimal('0.00')
    cst: Optional[str] = None  # CST ou CSOSN
    cfop: Optional[str] = None
    origem: Optional[str] = None  # 0-8
    modalidade_base_calculo: Optional[str] = None  # 0-3
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TributoICMSST:
    """ICMS Substituição Tributária"""
    base_calculo_st: Decimal = Decimal('0.00')
    aliquota_st: Decimal = Decimal('0.00')
    valor_st: Decimal = Decimal('0.00')
    mva: Optional[Decimal] = None  # Margem de Valor Agregado
    base_calculo_icms_proprio: Optional[Decimal] = None
    valor_icms_proprio: Optional[Decimal] = None
    cst: Optional[str] = None
    cfop: Optional[str] = None
    motivo_desoneracao: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TributoIPI:
    """IPI - Imposto sobre Produtos Industrializados"""
    base_calculo: Decimal = Decimal('0.00')
    aliquota: Decimal = Decimal('0.00')
    valor: Decimal = Decimal('0.00')
    cst: Optional[str] = None  # CST IPI
    codigo_enquadramento: Optional[str] = None
    codigo_selo: Optional[str] = None
    quantidade_selo: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TributoDIFAL:
    """DIFAL - Diferencial de Alíquota (Interestadual)"""
    base_calculo: Decimal = Decimal('0.00')
    aliquota_origem: Decimal = Decimal('0.00')
    aliquota_destino: Decimal = Decimal('0.00')
    aliquota_diferencial: Decimal = Decimal('0.00')
    valor_origem: Decimal = Decimal('0.00')
    valor_destino: Decimal = Decimal('0.00')
    valor_total: Decimal = Decimal('0.00')
    uf_origem: Optional[str] = None
    uf_destino: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TributoFCP:
    """FCP - Fundo de Combate à Pobreza"""
    base_calculo: Decimal = Decimal('0.00')
    aliquota: Decimal = Decimal('0.00')
    valor: Decimal = Decimal('0.00')
    tipo: Optional[str] = None  # 'FCP', 'FCP_ST', 'FCP_RET'
    metadata: Dict[str, Any] = field(default_factory=dict)








