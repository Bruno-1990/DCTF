"""
Classificador de CFOPs conforme legislação EFD-ICMS/IPI
Identifica CFOPs que podem causar diferenças legítimas entre C170 e C190
Baseado no Guia Prático da EFD-ICMS/IPI
"""

from typing import Set


class CFOPClassifier:
    """Classifica CFOPs conforme tipo de operação"""
    
    # CFOPs de Devolução de Venda (1xxx, 2xxx, 5xxx, 6xxx)
    DEVOLUCAO = {
        "1201", "1202", "1203", "1204", "1205", "1206", "1207", "1208", "1209", "1210",
        "1203", "1204", "1205", "1206", "1207", "1208", "1209", "1210",
        "2201", "2202", "2203", "2204", "2205", "2206", "2207", "2208", "2209", "2210",
        "5201", "5202", "5203", "5204", "5205", "5206", "5207", "5208", "5209", "5210",
        "6201", "6202", "6203", "6204", "6205", "6206", "6207", "6208", "6209", "6210"
    }
    
    # CFOPs de Remessa/Retorno (1xxx, 2xxx, 5xxx, 6xxx)
    REMESSA_RETORNO = {
        "1101", "1102", "1103", "1104", "1105", "1106", "1107", "1108", "1109", "1110",
        "1111", "1112", "1113", "1114", "1115", "1116", "1117", "1118", "1119", "1120",
        "2101", "2102", "2103", "2104", "2105", "2106", "2107", "2108", "2109", "2110",
        "2111", "2112", "2113", "2114", "2115", "2116", "2117", "2118", "2119", "2120",
        "5101", "5102", "5103", "5104", "5105", "5106", "5107", "5108", "5109", "5110",
        "5111", "5112", "5113", "5114", "5115", "5116", "5117", "5118", "5119", "5120",
        "6101", "6102", "6103", "6104", "6105", "6106", "6107", "6108", "6109", "6110",
        "6111", "6112", "6113", "6114", "6115", "6116", "6117", "6118", "6119", "6120"
    }
    
    # CFOPs de Brinde/Bonificação (1xxx, 2xxx, 5xxx, 6xxx)
    BRINDE_BONIFICACAO = {
        "1914", "1915", "1916", "1917", "1918", "1919", "1920",
        "2914", "2915", "2916", "2917", "2918", "2919", "2920",
        "5914", "5915", "5916", "5917", "5918", "5919", "5920",
        "6914", "6915", "6916", "6917", "6918", "6919", "6920"
    }
    
    # CFOPs de Industrialização (1xxx, 2xxx, 5xxx, 6xxx)
    INDUSTRIALIZACAO = {
        "1121", "1122", "1123", "1124", "1125", "1126", "1127", "1128", "1129", "1130",
        "2121", "2122", "2123", "2124", "2125", "2126", "2127", "2128", "2129", "2130",
        "5121", "5122", "5123", "5124", "5125", "5126", "5127", "5128", "5129", "5130",
        "6121", "6122", "6123", "6124", "6125", "6126", "6127", "6128", "6129", "6130"
    }
    
    # CFOPs de Ajuste/Complemento (1xxx, 2xxx, 5xxx, 6xxx)
    AJUSTE_COMPLEMENTO = {
        "1923", "1924", "1925", "1926", "1927", "1928", "1929", "1930",
        "2923", "2924", "2925", "2926", "2927", "2928", "2929", "2930",
        "5923", "5924", "5925", "5926", "5927", "5928", "5929", "5930",
        "6923", "6924", "6925", "6926", "6927", "6928", "6929", "6930"
    }
    
    @staticmethod
    def is_devolucao(cfop: str) -> bool:
        """Verifica se CFOP é de devolução"""
        return str(cfop).strip() in CFOPClassifier.DEVOLUCAO
    
    @staticmethod
    def is_remessa_retorno(cfop: str) -> bool:
        """Verifica se CFOP é de remessa/retorno"""
        return str(cfop).strip() in CFOPClassifier.REMESSA_RETORNO
    
    @staticmethod
    def is_brinde_bonificacao(cfop: str) -> bool:
        """Verifica se CFOP é de brinde/bonificação"""
        return str(cfop).strip() in CFOPClassifier.BRINDE_BONIFICACAO
    
    @staticmethod
    def is_industrializacao(cfop: str) -> bool:
        """Verifica se CFOP é de industrialização"""
        return str(cfop).strip() in CFOPClassifier.INDUSTRIALIZACAO
    
    @staticmethod
    def is_ajuste_complemento(cfop: str) -> bool:
        """Verifica se CFOP é de ajuste/complemento"""
        return str(cfop).strip() in CFOPClassifier.AJUSTE_COMPLEMENTO
    
    @staticmethod
    def is_cancelado(cod_sit: str) -> bool:
        """Verifica se documento está cancelado (COD_SIT = 2)"""
        return str(cod_sit).strip() == "2"
    
    @staticmethod
    def is_denegado(cod_sit: str) -> bool:
        """Verifica se documento está denegado (COD_SIT = 3)"""
        return str(cod_sit).strip() == "3"
    
    @staticmethod
    def is_inutilizado(cod_sit: str) -> bool:
        """Verifica se documento está inutilizado (COD_SIT = 5)"""
        return str(cod_sit).strip() == "5"
    
    @staticmethod
    def get_tipo_operacao(cfop: str, cod_sit: str) -> str:
        """
        Retorna tipo de operação baseado em CFOP e COD_SIT
        """
        if CFOPClassifier.is_cancelado(cod_sit):
            return "CANCELADO"
        if CFOPClassifier.is_denegado(cod_sit):
            return "DENEGADO"
        if CFOPClassifier.is_inutilizado(cod_sit):
            return "INUTILIZADO"
        if CFOPClassifier.is_devolucao(cfop):
            return "DEVOLUCAO"
        if CFOPClassifier.is_brinde_bonificacao(cfop):
            return "BRINDE_BONIFICACAO"
        if CFOPClassifier.is_remessa_retorno(cfop):
            return "REMESSA_RETORNO"
        if CFOPClassifier.is_industrializacao(cfop):
            return "INDUSTRIALIZACAO"
        if CFOPClassifier.is_ajuste_complemento(cfop):
            return "AJUSTE_COMPLEMENTO"
        return "NORMAL"
    
    @staticmethod
    def pode_ter_diferenca_legitima(cfop: str, cod_sit: str) -> bool:
        """
        Verifica se a combinação CFOP/COD_SIT pode ter diferenças legítimas
        entre C170 e C190 conforme legislação
        """
        tipo = CFOPClassifier.get_tipo_operacao(cfop, cod_sit)
        return tipo in [
            "CANCELADO", "DENEGADO", "INUTILIZADO",
            "DEVOLUCAO", "BRINDE_BONIFICACAO",
            "REMESSA_RETORNO", "INDUSTRIALIZACAO", "AJUSTE_COMPLEMENTO"
        ]




