"""
Modelo Canônico Fiscal - SPED v2.0
Classes base para normalização de dados fiscais
"""

from .documento_fiscal import DocumentoFiscal
from .item_fiscal import ItemFiscal
from .tributos import TributoICMS, TributoICMSST, TributoIPI, TributoDIFAL, TributoFCP

__all__ = [
    'DocumentoFiscal',
    'ItemFiscal',
    'TributoICMS',
    'TributoICMSST',
    'TributoIPI',
    'TributoDIFAL',
    'TributoFCP',
]








