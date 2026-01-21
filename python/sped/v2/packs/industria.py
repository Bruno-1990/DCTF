"""
Pack de Segmento: Indústria
Regras específicas para IPI, insumos e Bloco G
"""

from typing import Set, Dict
from .base import SegmentPack, SegmentConfig, SegmentRule


class IndustriaPack(SegmentPack):
    """Pack para segmento de Indústria"""
    
    def get_segment_name(self) -> str:
        return "INDUSTRIA"
    
    def get_config(self) -> SegmentConfig:
        # CFOPs típicos de indústria
        cfops_tipicos: Set[str] = {
            '5101',  # Venda de produção do estabelecimento
            '5103',  # Venda de produção do estabelecimento efetuada fora do estabelecimento
            '5104',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária
            '5106',  # Venda de produção do estabelecimento destinada a não contribuinte
            '5109',  # Venda de produção do estabelecimento para ZFM
            '5401',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto
            '5402',  # Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos do mesmo produto
            '1101',  # Compra para industrialização
            '1102',  # Compra para comercialização
            '1201',  # Devolução de venda de produção do estabelecimento
            '1202',  # Devolução de venda de mercadoria adquirida ou recebida de terceiros
            '1401',  # Compra para industrialização em operação com produto sujeito ao regime de substituição tributária
            '1402',  # Compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária
            '2101',  # Compra para industrialização
            '2102',  # Compra para comercialização
            '2201',  # Devolução de venda de produção do estabelecimento
            '2202',  # Devolução de venda de mercadoria adquirida ou recebida de terceiros
            '2401',  # Compra para industrialização em operação com produto sujeito ao regime de substituição tributária
            '2402',  # Compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária
        }
        
        # CESTs críticos para indústria (produtos industrializados)
        cests_criticos: Set[str] = {
            # CESTs de produtos industrializados variam muito
            # Exemplos genéricos
        }
        
        # Tolerâncias para indústria
        tolerancias: Dict[str, float] = {
            'icms': 0.01,
            'icms_st': 0.05,
            'ipi': 0.02,  # IPI é mais relevante na indústria
            'insumos': 0.01,  # Tolerância para insumos
            'total_documento': 0.10,
            'total_periodo': 0.50,
        }
        
        # Regras específicas de indústria
        regras_especificas = [
            SegmentRule(
                rule_id='IND-001',
                rule_name='Validação de IPI em Indústria',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='IPI deve ser calculado corretamente em operações industriais',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='IND-002',
                rule_name='Validação de Insumos',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='Insumos devem ser identificados e tratados corretamente',
                metadata={'severity': 'medium'}
            ),
            SegmentRule(
                rule_id='IND-003',
                rule_name='Validação de Bloco G',
                rule_type='OBRIGATORIEDADE',
                rule_category='G',
                description='Bloco G (Controle de Crédito de ICMS do Ativo Permanente) é obrigatório para indústria',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='IND-004',
                rule_name='Validação de CFOP de Industrialização',
                rule_type='VALIDACAO',
                rule_category='C100',
                description='CFOPs de industrialização devem ser validados',
                metadata={'severity': 'medium'}
            ),
            SegmentRule(
                rule_id='IND-005',
                rule_name='Tolerância para IPI',
                rule_type='TOLERANCIA',
                rule_category='C190',
                description='Tolerância de R$ 0,02 para IPI em indústria',
                metadata={'tolerancia': 0.02}
            ),
        ]
        
        return SegmentConfig(
            segment_name='INDUSTRIA',
            cfops_tipicos=cfops_tipicos,
            cests_criticos=cests_criticos,
            tolerancias=tolerancias,
            regras_especificas=regras_especificas,
            metadata={
                'descricao': 'Pack para segmento de Indústria com regras para IPI, insumos e Bloco G',
                'versao': '1.0',
                'cfops_count': len(cfops_tipicos),
                'bloco_g_obrigatorio': True,
            }
        )

