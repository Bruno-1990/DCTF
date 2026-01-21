"""
Pack de Segmento: Comércio
Regras, CFOPs típicos e tolerâncias para o segmento de comércio
"""

from typing import Set, Dict
from .base import SegmentPack, SegmentConfig, SegmentRule


class ComercioPack(SegmentPack):
    """Pack para segmento de Comércio"""
    
    def get_segment_name(self) -> str:
        return "COMERCIO"
    
    def get_config(self) -> SegmentConfig:
        # CFOPs típicos de comércio
        cfops_tipicos: Set[str] = {
            '5101',  # Venda de produção do estabelecimento
            '5102',  # Venda de mercadoria adquirida ou recebida de terceiros
            '5103',  # Venda de produção do estabelecimento efetuada fora do estabelecimento
            '5104',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária
            '5105',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária
            '5106',  # Venda de produção do estabelecimento destinada a não contribuinte
            '5109',  # Venda de produção do estabelecimento para ZFM
            '5110',  # Venda de mercadoria adquirida ou recebida de terceiros para ZFM
            '5401',  # Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto
            '5402',  # Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos do mesmo produto
            '5403',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária
            '5405',  # Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído
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
        
        # Tolerâncias para comércio
        tolerancias: Dict[str, float] = {
            'icms': 0.01,  # R$ 0,01 para ICMS
            'icms_st': 0.05,  # R$ 0,05 para ICMS ST
            'ipi': 0.01,  # R$ 0,01 para IPI
            'total_documento': 0.10,  # R$ 0,10 para total do documento
            'total_periodo': 0.50,  # R$ 0,50 para total do período
        }
        
        # Regras específicas de comércio
        regras_especificas = [
            SegmentRule(
                rule_id='COM-001',
                rule_name='Validação de CFOP de Venda',
                rule_type='VALIDACAO',
                rule_category='C100',
                description='CFOP de venda deve estar entre os CFOPs típicos de comércio',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='COM-002',
                rule_name='Validação de ICMS em Operações de Venda',
                rule_type='VALIDACAO',
                rule_category='C170',
                description='ICMS deve ser calculado corretamente em operações de venda',
                metadata={'severity': 'high'}
            ),
            SegmentRule(
                rule_id='COM-003',
                rule_name='Tolerância de Totalização',
                rule_type='TOLERANCIA',
                rule_category='C190',
                description='Tolerância de R$ 0,10 para totalização de documentos',
                metadata={'tolerancia': 0.10}
            ),
        ]
        
        return SegmentConfig(
            segment_name='COMERCIO',
            cfops_tipicos=cfops_tipicos,
            cests_criticos=set(),  # Comércio geral não tem CESTs críticos específicos
            tolerancias=tolerancias,
            regras_especificas=regras_especificas,
            metadata={
                'descricao': 'Pack para segmento de Comércio',
                'versao': '1.0',
                'cfops_count': len(cfops_tipicos),
            }
        )

