"""
Regras por Segmento e Regime Tributário
Implementa validações específicas por tipo de negócio conforme roteiro
"""

from typing import Dict, Set, List, Tuple, Optional
from decimal import Decimal


class RegrasPorSegmento:
    """Regras fiscais específicas por segmento de negócio"""
    
    # ========== CFOPS COMUNS A TODOS SEGMENTOS ==========
    
    # CFOPs de vendas/saídas normais
    CFOPS_VENDA_INTERNA = {'5102', '5103', '5104', '5105', '5106', '5109', '5110', '5111', '5112', '5113', '5114', '5115', '5116', '5117', '5118', '5119', '5120', '5122', '5123'}
    CFOPS_VENDA_INTERESTADUAL = {'6102', '6103', '6104', '6105', '6106', '6107', '6108', '6109', '6110', '6111', '6112', '6113', '6114', '6115', '6116', '6117', '6118', '6119', '6120', '6122', '6123'}
    
    # CFOPs de compras/entradas normais
    CFOPS_COMPRA_INTERNA = {'1102', '1101', '1113', '1116', '1117', '1118', '1120', '1121', '1122', '1124', '1125', '1126'}
    CFOPS_COMPRA_INTERESTADUAL = {'2102', '2101', '2113', '2116', '2117', '2118', '2120', '2121', '2122', '2124', '2125', '2126'}
    
    # CFOPs de devolução
    CFOPS_DEVOLUCAO_COMPRA = {'5201', '5202', '5205', '5206', '5207', '5208', '5209', '5210', '5410', '5411', '5412', '5413', '5414', '5415'}
    CFOPS_DEVOLUCAO_VENDA = {'1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208', '1209', '1210', '1410', '1411', '1414', '1415', '2201', '2202', '2203', '2204', '2205', '2206', '2207', '2208', '2209', '2210'}
    
    # CFOPs de remessa/retorno
    CFOPS_REMESSA = {'5901', '5902', '5903', '5904', '5905', '5906', '5907', '5908', '5909', '5910', '5911', '5912', '5913', '5914', '5915', '5916', '5917', '5918', '5919', '5920', '5921', '5922', '5923', '5924', '5925', '5949'}
    CFOPS_RETORNO = {'1901', '1902', '1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910', '1911', '1912', '1913', '1914', '1915', '1916', '1917', '1918', '1919', '1920', '1921', '1922', '1923', '1924', '1925', '1949'}
    
    # CFOPs de transferência
    CFOPS_TRANSFERENCIA_SAIDA = {'5151', '5152', '5153', '5155', '5156', '5157'}
    CFOPS_TRANSFERENCIA_ENTRADA = {'1151', '1152', '1153', '1154', '1155', '1156', '1157', '2151', '2152', '2153', '2154', '2155', '2156', '2157'}
    
    # CFOPs de bonificação/brinde/amostra
    CFOPS_BONIFICACAO = {'5910', '5911', '5912', '5913', '5914', '5915', '5916'}
    
    # ========== CFOPS ESPECÍFICOS POR SEGMENTO ==========
    
    # COMÉRCIO GERAL
    CFOPS_COMERCIO = {
        'vendas': CFOPS_VENDA_INTERNA | CFOPS_VENDA_INTERESTADUAL,
        'compras': CFOPS_COMPRA_INTERNA | CFOPS_COMPRA_INTERESTADUAL,
        'devolucoes': CFOPS_DEVOLUCAO_COMPRA | CFOPS_DEVOLUCAO_VENDA,
        'transferencias': CFOPS_TRANSFERENCIA_SAIDA | CFOPS_TRANSFERENCIA_ENTRADA,
        'bonificacoes': CFOPS_BONIFICACAO,
    }
    
    # BEBIDAS (forte presença de ST)
    CFOPS_BEBIDAS = {
        'vendas_st': {'5401', '5402', '5403', '5405', '5408', '5409', '5410', '5411', '5412', '5413', '5414', '5415', '6401', '6402', '6403', '6404', '6408', '6409', '6410', '6411', '6412', '6413', '6414', '6415'},
        'compras_st': {'1401', '1403', '1406', '1407', '2401', '2403', '2406', '2407'},
        'vendas': CFOPS_VENDA_INTERNA | CFOPS_VENDA_INTERESTADUAL,
        'compras': CFOPS_COMPRA_INTERNA | CFOPS_COMPRA_INTERESTADUAL,
        'devolucoes': CFOPS_DEVOLUCAO_COMPRA | CFOPS_DEVOLUCAO_VENDA,
    }
    
    # INDÚSTRIA (IPI relevante, insumos)
    CFOPS_INDUSTRIA = {
        'vendas_producao': {'5101', '5102', '5103', '5104', '5105', '6101', '6102', '6103', '6104', '6105'},
        'compras_insumos': {'1101', '1102', '1111', '1113', '1116', '1117', '2101', '2102', '2111', '2113', '2116', '2117'},
        'industrializacao': {'5124', '5125', '1124', '1125', '2124', '2125'},
        'vendas': CFOPS_VENDA_INTERNA | CFOPS_VENDA_INTERESTADUAL,
        'compras': CFOPS_COMPRA_INTERNA | CFOPS_COMPRA_INTERESTADUAL,
        'devolucoes': CFOPS_DEVOLUCAO_COMPRA | CFOPS_DEVOLUCAO_VENDA,
        'remessas': CFOPS_REMESSA | CFOPS_RETORNO,
    }
    
    # E-COMMERCE (operações interestaduais, DIFAL)
    CFOPS_ECOMMERCE = {
        'vendas_consumidor_final': {'5102', '5405', '6107', '6108'},
        'vendas_interestadual': CFOPS_VENDA_INTERESTADUAL,
        'devolucoes': CFOPS_DEVOLUCAO_COMPRA | CFOPS_DEVOLUCAO_VENDA,
    }
    
    # ========== CSTs ESPERADOS POR TIPO DE OPERAÇÃO ==========
    
    # CSTs para operações normais (tributadas)
    CSTS_TRIBUTADO = {'00', '10', '20', '70', '90'}
    CSTS_TRIBUTADO_SIMPLES = {'101', '102', '103', '201', '202', '203', '900'}
    
    # CSTs para ST
    CSTS_ST = {'10', '30', '60', '70', '90', '201', '202', '203', '500', '900'}
    
    # CSTs para isenção/não tributado
    CSTS_ISENTO = {'40', '41', '50'}
    CSTS_ISENTO_SIMPLES = {'102', '103', '300', '400', '500'}
    
    # CSTs para diferimento
    CSTS_DIFERIDO = {'51'}
    
    # ========== VALIDAÇÕES CRUZADAS CFOP × CST ==========
    
    @staticmethod
    def validar_cfop_cst(cfop: str, cst: str, segmento: Optional[str] = None, regime: Optional[str] = None) -> Tuple[bool, str]:
        """
        Valida se a combinação CFOP × CST é coerente
        
        Returns:
            Tupla (is_valid, mensagem_erro)
        """
        # Operações de devolução: CST pode variar
        if cfop in (RegrasPorSegmento.CFOPS_DEVOLUCAO_COMPRA | RegrasPorSegmento.CFOPS_DEVOLUCAO_VENDA):
            return (True, "Devolução: CST pode variar conforme operação original")
        
        # Operações de remessa: geralmente sem tributação ou diferida
        if cfop in RegrasPorSegmento.CFOPS_REMESSA:
            if cst in RegrasPorSegmento.CSTS_ISENTO | RegrasPorSegmento.CSTS_DIFERIDO | {'90'}:
                return (True, "")
            return (False, f"CFOP {cfop} de remessa com CST {cst} inesperado (esperado: isento/diferido)")
        
        # Operações de bonificação: geralmente sem tributação
        if cfop in RegrasPorSegmento.CFOPS_BONIFICACAO:
            if cst in RegrasPorSegmento.CSTS_ISENTO | {'90'}:
                return (True, "")
            return (False, f"CFOP {cfop} de bonificação com CST {cst} inesperado (esperado: isento)")
        
        # Validações específicas por segmento
        if segmento == 'BEBIDAS':
            # Bebidas: alta incidência de ST
            if cfop in RegrasPorSegmento.CFOPS_BEBIDAS.get('vendas_st', set()):
                if cst not in RegrasPorSegmento.CSTS_ST:
                    return (False, f"CFOP {cfop} de venda ST (bebidas) com CST {cst} não-ST")
        
        # Simples Nacional: validar CSTs específicos
        if regime == 'SIMPLES_NACIONAL':
            if cst not in (RegrasPorSegmento.CSTS_TRIBUTADO_SIMPLES | RegrasPorSegmento.CSTS_ISENTO_SIMPLES):
                return (False, f"Regime Simples Nacional com CST {cst} inválido")
        
        return (True, "")
    
    @staticmethod
    def get_tolerancia_por_segmento(segmento: Optional[str] = None) -> Decimal:
        """
        Retorna tolerância de arredondamento por segmento
        Comércio de alto volume tem tolerância maior
        """
        tolerancias = {
            'COMERCIO': Decimal('0.10'),  # Maior tolerância para alto volume
            'BEBIDAS': Decimal('0.05'),   # Tolerância média (ST)
            'INDUSTRIA': Decimal('0.02'), # Menor tolerância (IPI preciso)
            'ECOMMERCE': Decimal('0.05'), # Tolerância média
        }
        return tolerancias.get(segmento or '', Decimal('0.02'))
    
    @staticmethod
    def cfop_permite_base_reduzida(cfop: str, segmento: Optional[str] = None) -> bool:
        """Verifica se CFOP permite base de cálculo reduzida"""
        # Remessas, bonificações, amostras: podem ter base reduzida
        if cfop in (RegrasPorSegmento.CFOPS_REMESSA | RegrasPorSegmento.CFOPS_BONIFICACAO):
            return True
        
        # Transferências: podem ter base reduzida
        if cfop in (RegrasPorSegmento.CFOPS_TRANSFERENCIA_SAIDA | RegrasPorSegmento.CFOPS_TRANSFERENCIA_ENTRADA):
            return True
        
        return False
    
    @staticmethod
    def cfop_permite_icms_zero(cfop: str, cst: str, segmento: Optional[str] = None) -> bool:
        """Verifica se CFOP permite ICMS próprio zero"""
        # ST: ICMS próprio pode ser zero
        if cst in RegrasPorSegmento.CSTS_ST:
            return True
        
        # Isenção/não tributado
        if cst in (RegrasPorSegmento.CSTS_ISENTO | RegrasPorSegmento.CSTS_ISENTO_SIMPLES):
            return True
        
        # Diferimento
        if cst in RegrasPorSegmento.CSTS_DIFERIDO:
            return True
        
        # Remessas e bonificações
        if cfop in (RegrasPorSegmento.CFOPS_REMESSA | RegrasPorSegmento.CFOPS_BONIFICACAO):
            return True
        
        return False
    
    @staticmethod
    def get_cfops_esperados_por_segmento(segmento: str, tipo_operacao: str = 'vendas') -> Set[str]:
        """
        Retorna CFOPs esperados para um segmento e tipo de operação
        
        Args:
            segmento: COMERCIO, BEBIDAS, INDUSTRIA, ECOMMERCE
            tipo_operacao: vendas, compras, devolucoes, etc.
        """
        mapa_segmento = {
            'COMERCIO': RegrasPorSegmento.CFOPS_COMERCIO,
            'BEBIDAS': RegrasPorSegmento.CFOPS_BEBIDAS,
            'INDUSTRIA': RegrasPorSegmento.CFOPS_INDUSTRIA,
            'ECOMMERCE': RegrasPorSegmento.CFOPS_ECOMMERCE,
        }
        
        cfops_segmento = mapa_segmento.get(segmento, {})
        return cfops_segmento.get(tipo_operacao, set())
    
    @staticmethod
    def is_operacao_especial(cfop: str) -> Tuple[bool, str]:
        """
        Verifica se é operação especial que pode ter valores divergentes
        
        Returns:
            Tupla (is_especial, tipo)
        """
        if cfop in RegrasPorSegmento.CFOPS_DEVOLUCAO_COMPRA | RegrasPorSegmento.CFOPS_DEVOLUCAO_VENDA:
            return (True, "devolucao")
        
        if cfop in RegrasPorSegmento.CFOPS_REMESSA | RegrasPorSegmento.CFOPS_RETORNO:
            return (True, "remessa")
        
        if cfop in RegrasPorSegmento.CFOPS_BONIFICACAO:
            return (True, "bonificacao")
        
        if cfop in RegrasPorSegmento.CFOPS_TRANSFERENCIA_SAIDA | RegrasPorSegmento.CFOPS_TRANSFERENCIA_ENTRADA:
            return (True, "transferencia")
        
        return (False, "")

