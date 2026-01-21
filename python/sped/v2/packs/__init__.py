"""
Packs por Segmento
Sistema modular e plugável de regras específicas por segmento
"""

from .base import SegmentPack, SegmentConfig, SegmentRule
from .comercio import ComercioPack
from .bebidas import BebidasPack
from .industria import IndustriaPack
from .ecommerce import EcommercePack

# Mapa de packs disponíveis
AVAILABLE_PACKS = {
    'COMERCIO': ComercioPack,
    'BEBIDAS': BebidasPack,
    'INDUSTRIA': IndustriaPack,
    'ECOMMERCE': EcommercePack,
}


def get_pack(segmento: str) -> SegmentPack:
    """
    Retorna o pack para um segmento específico
    
    Args:
        segmento: Nome do segmento (COMERCIO, BEBIDAS, INDUSTRIA, ECOMMERCE)
    
    Returns:
        Instância do pack do segmento
    
    Raises:
        ValueError: Se o segmento não for suportado
    """
    segmento_upper = segmento.upper()
    
    if segmento_upper not in AVAILABLE_PACKS:
        raise ValueError(f"Segmento não suportado: {segmento}. Segmentos disponíveis: {list(AVAILABLE_PACKS.keys())}")
    
    return AVAILABLE_PACKS[segmento_upper]()


def list_available_segments() -> list:
    """Retorna lista de segmentos disponíveis"""
    return list(AVAILABLE_PACKS.keys())


__all__ = [
    'SegmentPack',
    'SegmentConfig',
    'SegmentRule',
    'ComercioPack',
    'BebidasPack',
    'IndustriaPack',
    'EcommercePack',
    'get_pack',
    'list_available_segments',
    'AVAILABLE_PACKS',
]

