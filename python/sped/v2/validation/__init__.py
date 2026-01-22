"""
Módulo de Validação (Camadas B e C)
- Camada B: Validação interna da EFD
- Camada C: Validação conceitual XML × EFD
"""

from .xml_efd_validator import XmlEfdValidator, ResultadoValidacao, Divergencia
from .efd_internal_validator import EFDInternalValidator, ValidationResult, ValidationIssue, ValidationSeverity
from .totaling_engine import TotalingEngine, ResultadoTotalizacao
from .legitimacao_matrix import MatrizLegitimacao, ClassificacaoDivergencia, ContextoFiscal
from .context_validator import ContextValidator
from .beneficios_fiscais import (
    BeneficioFiscal,
    IdentificadorBeneficio,
    ValidadorBeneficio,
    IntegradorBeneficioMatriz
)

__all__ = [
    'XmlEfdValidator',
    'ResultadoValidacao',
    'Divergencia',
    'EFDInternalValidator',
    'ValidationResult',
    'ValidationIssue',
    'ValidationSeverity',
    'TotalingEngine',
    'ResultadoTotalizacao',
    'MatrizLegitimacao',
    'ClassificacaoDivergencia',
    'ContextoFiscal',
    'ContextValidator',
]
