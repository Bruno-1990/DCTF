"""
Pack de Segmento: E-commerce
Regras específicas para DIFAL/FCP e operações interestaduais
"""

from typing import Set, Dict
from .base import SegmentPack, SegmentConfig, SegmentRule


class EcommercePack(SegmentPack):
    """Pack para segmento de E-commerce"""
    
    def get_segment_name(self) -> str:
        return "ECOMMERCE"
    
    def get_config(self) -> SegmentConfig:
        # CFOPs típicos de e-commerce (operações interestaduais)
        cfops_tipicos: Set[str] = {
            '6101',  # Venda de produção do estabelecimento
            '6102',  # Venda de mercadoria adquirida ou recebida de terceiros
            '6103',  # Venda de produção do estabelecimento efetuada fora do estabelecimento
            '6104',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária
            '6105',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária
            '6106',  # Venda de produção do estabelecimento destinada a não contribuinte
            '6107',  # Venda de produção do estabelecimento para ZFM
            '6108',  # Venda de mercadoria adquirida ou recebida de terceiros para ZFM
            '6401',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto
            '6402',  # Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos do mesmo produto
            '6403',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária
            '6404',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído
        }
        
        # CESTs críticos para e-commerce (produtos físicos vendidos online)
        cests_criticos: Set[str] = {
            # CESTs variam conforme o produto
        }
        
        # Tolerâncias para e-commerce
        tolerancias: Dict[str, float] = {
            'icms': 0.01,
            'icms_st': 0.05,
            'difal': 0.01,  # DIFAL (Diferencial de Alíquota)
            'fcp': 0.01,  # FCP (Fundo de Combate à Pobreza)
            'ipi': 0.01,
            'total_documento': 0.10,
            'total_periodo': 0.50,
        }
        
        # Regras específicas de e-commerce
        regras_especificas = [
            SegmentRule(
                rule_id='ECO-001',
                rule_name='Validação de DIFAL em E-commerce',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='DIFAL deve ser calculado corretamente em operações interestaduais de e-commerce',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='ECO-002',
                rule_name='Validação de FCP em E-commerce',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='FCP deve ser calculado corretamente em operações interestaduais',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='ECO-003',
                rule_name='Validação de Operações Interestaduais',
                rule_type='VALIDACAO',
                rule_category='C100',
                description='Operações interestaduais devem ser identificadas e tratadas corretamente',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='ECO-004',
                rule_name='Validação de Destinatário Não Contribuinte',
                rule_type='VALIDACAO',
                rule_category='C100',
                description='Vendas para não contribuinte devem ter DIFAL e FCP calculados',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='ECO-005',
                rule_name='Tolerância para DIFAL/FCP',
                rule_type='TOLERANCIA',
                rule_category='C190',
                description='Tolerância de R$ 0,01 para DIFAL e FCP',
                metadata={'tolerancia': 0.01}
            ),
        ]
        
        return SegmentConfig(
            segment_name='ECOMMERCE',
            cfops_tipicos=cfops_tipicos,
            cests_criticos=cests_criticos,
            tolerancias=tolerancias,
            regras_especificas=regras_especificas,
            metadata={
                'descricao': 'Pack para segmento de E-commerce com regras para DIFAL/FCP e operações interestaduais',
                'versao': '1.0',
                'cfops_count': len(cfops_tipicos),
                'difal_obrigatorio': True,
                'fcp_obrigatorio': True,
            }
        )

