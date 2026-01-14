"""
Módulo de Validação Interna da EFD (Camada B)
Valida consistência interna do SPED: C170→C190→C100→E110/E111
"""

from .efd_internal_validator import (
    EFDInternalValidator,
    ValidationResult,
    ValidationIssue,
    ValidationSeverity,
)

__all__ = [
    'EFDInternalValidator',
    'ValidationResult',
    'ValidationIssue',
    'ValidationSeverity',
]


