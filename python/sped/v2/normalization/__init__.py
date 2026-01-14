"""
Camada A - Normalização - SPED v2.0
Normalizadores para converter XML e EFD para modelo canônico
"""

from .xml_normalizer import XMLNormalizer
from .efd_normalizer import EFDNormalizer

__all__ = [
    'XMLNormalizer',
    'EFDNormalizer',
]


