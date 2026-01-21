"""
Pack de Segmento: Bebidas
Regras específicas para ST/PMPF/MVA e CESTs críticos de bebidas
"""

from typing import Set, Dict
from .base import SegmentPack, SegmentConfig, SegmentRule


class BebidasPack(SegmentPack):
    """Pack para segmento de Bebidas"""
    
    def get_segment_name(self) -> str:
        return "BEBIDAS"
    
    def get_config(self) -> SegmentConfig:
        # CFOPs típicos de bebidas (inclui comércio + específicos)
        cfops_tipicos: Set[str] = {
            '5101', '5102', '5103', '5104', '5105', '5106',
            '5401', '5402', '5403', '5405',
            '6101', '6102', '6103', '6104', '6105', '6106',
            '6401', '6402', '6403', '6404',
        }
        
        # CESTs críticos para bebidas
        cests_criticos: Set[str] = {
            '0300100',  # Cerveja
            '0300200',  # Refrigerante
            '0300300',  # Água
            '0300400',  # Bebida alcoólica (exceto cerveja)
            '0300500',  # Bebida não alcoólica
        }
        
        # Tolerâncias para bebidas (mais rigorosas devido a ST)
        tolerancias: Dict[str, float] = {
            'icms': 0.01,
            'icms_st': 0.02,  # Mais rigoroso para ST
            'pmf': 0.01,  # PMF (Preço Médio Fiscal)
            'mva': 0.01,  # MVA (Margem de Valor Agregado)
            'ipi': 0.01,
            'total_documento': 0.05,  # Mais rigoroso
            'total_periodo': 0.20,  # Mais rigoroso
        }
        
        # Regras específicas de bebidas
        regras_especificas = [
            SegmentRule(
                rule_id='BEB-001',
                rule_name='Validação de CEST em Bebidas',
                rule_type='OBRIGATORIEDADE',
                rule_category='C170',
                description='CEST é obrigatório para produtos de bebidas',
                metadata={'severity': 'critical'}
            ),
            SegmentRule(
                rule_id='BEB-002',
                rule_name='Validação de ST/PMPF/MVA',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='ST, PMPF e MVA devem ser calculados corretamente para bebidas',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='BEB-003',
                rule_name='Validação de CEST Crítico',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='CESTs críticos de bebidas devem ser validados com atenção especial',
                metadata={'severity': 'high', 'cests_criticos': list(cests_criticos)}
            ),
            SegmentRule(
                rule_id='BEB-004',
                rule_name='Tolerância Reduzida para ST',
                rule_type='TOLERANCIA',
                rule_category='C190',
                description='Tolerância reduzida de R$ 0,02 para ICMS ST em bebidas',
                metadata={'tolerancia': 0.02}
            ),
        ]
        
        return SegmentConfig(
            segment_name='BEBIDAS',
            cfops_tipicos=cfops_tipicos,
            cests_criticos=cests_criticos,
            tolerancias=tolerancias,
            regras_especificas=regras_especificas,
            metadata={
                'descricao': 'Pack para segmento de Bebidas com regras específicas para ST/PMPF/MVA',
                'versao': '1.0',
                'cfops_count': len(cfops_tipicos),
                'cests_count': len(cests_criticos),
            }
        )

