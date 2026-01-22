"""
Módulo de Matching Robusto (Camada C)
Match entre XML e SPED usando modelo canônico
"""

from .match_documentos import (
    DocumentMatcher,
    MatchResult,
    MatchScore,
    MatchStrategy,
)

from .match_itens import (
    ItemMatcher,
    ItemMatchResult,
    MatchConfidence,
    MatchLayer,
)

from .document_family import (
    DocumentFamilyGrouper,
    FamiliaDocumento,
)

__all__ = [
    'DocumentMatcher',
    'MatchResult',
    'MatchScore',
    'MatchStrategy',
    'ItemMatcher',
    'ItemMatchResult',
    'MatchConfidence',
    'MatchLayer',
    'DocumentFamilyGrouper',
    'FamiliaDocumento',
]

