"""
Matriz de Regras CFOP x CST baseada na EFD-ICMS/IPI
Implementa lógica fiscal para determinar se campos devem ser gerados no SPED
"""
from dataclasses import dataclass
from typing import Dict, List, Optional, Set
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class TipoOperacao(Enum):
    ENTRADA = "entrada"
    SAIDA = "saida"
    INDUSTRIALIZACAO = "industrializacao"
    DEVOLUCAO = "devolucao"
    REMESSA = "remessa"
    RETORNO = "retorno"


class Severidade(Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAIXA = "baixa"


@dataclass
class RegraFiscal:
    """Regra fiscal para combinação CFOP x CST"""
    cfop: str
    cst: str  # ou CSOSN
    tipo_operacao: TipoOperacao
    gera_bc_icms: bool
    gera_icms: bool
    gera_bc_st: bool
    gera_icms_st: bool
    gera_credito: bool
    observacoes: str
    severidade_padrao: Severidade
    condicoes_especiais: Optional[Dict] = None  # Para regras com condições


class MatrizRegrasFiscais:
    """
    Matriz dinâmica de regras CFOP x CST baseada na EFD-ICMS/IPI
    Baseada no Guia Prático e legislação vigente
    """
    
    def __init__(self):
        self.regras: Dict[str, Dict[str, RegraFiscal]] = {}
        self._carregar_regras_base()
    
    def _carregar_regras_base(self):
        """
        Carrega regras base conforme EFD-ICMS/IPI
        Baseado no Guia Prático da EFD-ICMS/IPI
        """
        # CST 00, 10, 20, 51 -> Operações normalmente tributadas
        csts_tributadas = ["00", "10", "20", "51"]
        cfops_saida = ["5101", "5102", "5103", "5104", "5105", "5106", "5107", "5108", "5109", "5110",
                       "6101", "6102", "6103", "6104", "6105", "6106", "6107", "6108", "6109", "6110"]
        
        for cst in csts_tributadas:
            for cfop in cfops_saida:
                self._adicionar_regra(
                    cfop, cst, TipoOperacao.SAIDA,
                    gera_bc_icms=True, gera_icms=True,
                    gera_bc_st=False, gera_icms_st=False,
                    observacoes="Operação tributada normalmente"
                )
        
        # CFOPs de entrada
        cfops_entrada = ["1101", "1102", "1103", "1104", "1105", "1106", "1107", "1108", "1109", "1110",
                         "2101", "2102", "2103", "2104", "2105", "2106", "2107", "2108", "2109", "2110"]
        
        for cst in csts_tributadas:
            for cfop in cfops_entrada:
                self._adicionar_regra(
                    cfop, cst, TipoOperacao.ENTRADA,
                    gera_bc_icms=True, gera_icms=True,
                    gera_bc_st=False, gera_icms_st=False,
                    gera_credito=True,
                    observacoes="Operação tributada com direito a crédito"
                )
        
        # CST 30, 70 -> Operações com ST
        csts_st = ["30", "70"]
        for cst in csts_st:
            for cfop in cfops_saida:
                self._adicionar_regra(
                    cfop, cst, TipoOperacao.SAIDA,
                    gera_bc_icms=True, gera_icms=True,
                    gera_bc_st=True, gera_icms_st=True,
                    observacoes="Operação com substituição tributária"
                )
        
        # CST 40, 41, 50 -> Isentas/Não tributadas
        csts_isentas = ["40", "41", "50"]
        for cst in csts_isentas:
            for cfop in cfops_saida + cfops_entrada:
                self._adicionar_regra(
                    cfop, cst, TipoOperacao.SAIDA if cfop.startswith(("5", "6")) else TipoOperacao.ENTRADA,
                    gera_bc_icms=False, gera_icms=False,
                    gera_bc_st=False, gera_icms_st=False,
                    observacoes="Operação isenta ou não tributada"
                )
        
        # CST 60 -> ICMS retido anteriormente
        for cfop in cfops_saida + cfops_entrada:
            self._adicionar_regra(
                cfop, "60", TipoOperacao.SAIDA if cfop.startswith(("5", "6")) else TipoOperacao.ENTRADA,
                gera_bc_icms=False, gera_icms=False,
                gera_bc_st=False, gera_icms_st=False,
                observacoes="ICMS retido anteriormente"
            )
        
        # CST 90 -> Outras operações (depende do contexto)
        for cfop in cfops_saida + cfops_entrada:
            self._adicionar_regra(
                cfop, "90", TipoOperacao.SAIDA if cfop.startswith(("5", "6")) else TipoOperacao.ENTRADA,
                gera_bc_icms=True, gera_icms=True,  # Pode ter, depende do contexto
                gera_bc_st=True, gera_icms_st=True,  # Pode ter ST
                observacoes="Outras operações - verificar contexto"
            )
        
        # CSOSN (Simples Nacional)
        csosn_saida = ["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]
        for csosn in csosn_saida:
            for cfop in cfops_saida:
                # CSOSN 101, 102, 103 -> Isentas
                if csosn in ["101", "102", "103"]:
                    self._adicionar_regra(
                        cfop, csosn, TipoOperacao.SAIDA,
                        gera_bc_icms=False, gera_icms=False,
                        gera_bc_st=False, gera_icms_st=False,
                        observacoes="Simples Nacional - Isenta"
                    )
                # CSOSN 201, 202, 203 -> Com ST
                elif csosn in ["201", "202", "203"]:
                    self._adicionar_regra(
                        cfop, csosn, TipoOperacao.SAIDA,
                        gera_bc_icms=True, gera_icms=True,
                        gera_bc_st=True, gera_icms_st=True,
                        observacoes="Simples Nacional - Com ST"
                    )
                # CSOSN 300, 400, 500, 900 -> Outras
                else:
                    self._adicionar_regra(
                        cfop, csosn, TipoOperacao.SAIDA,
                        gera_bc_icms=True, gera_icms=True,
                        gera_bc_st=False, gera_icms_st=False,
                        observacoes="Simples Nacional - Outras operações"
                    )
    
    def _adicionar_regra(self, cfop: str, cst: str, tipo: TipoOperacao,
                        gera_bc_icms: bool, gera_icms: bool,
                        gera_bc_st: bool, gera_icms_st: bool,
                        gera_credito: bool = False,
                        observacoes: str = ""):
        """Adiciona uma regra à matriz"""
        if cfop not in self.regras:
            self.regras[cfop] = {}
        
        # Determinar severidade padrão
        if gera_icms and not gera_icms:
            severidade = Severidade.ALTA
        elif gera_icms_st:
            severidade = Severidade.ALTA
        else:
            severidade = Severidade.MEDIA
        
        self.regras[cfop][cst] = RegraFiscal(
            cfop=cfop, cst=cst, tipo_operacao=tipo,
            gera_bc_icms=gera_bc_icms, gera_icms=gera_icms,
            gera_bc_st=gera_bc_st, gera_icms_st=gera_icms_st,
            gera_credito=gera_credito,
            observacoes=observacoes,
            severidade_padrao=severidade
        )
    
    def obter_regra(self, cfop: str, cst: str) -> Optional[RegraFiscal]:
        """Obtém regra para combinação CFOP x CST"""
        # Normalizar CFOP (remover zeros à esquerda se necessário)
        cfop_norm = str(cfop).strip().zfill(4)
        cst_norm = str(cst).strip()
        
        # Tentar buscar exata
        regra = self.regras.get(cfop_norm, {}).get(cst_norm)
        if regra:
            return regra
        
        # Tentar buscar por prefixo CFOP (ex: 5101, 5102 -> 510x)
        if len(cfop_norm) >= 3:
            prefixo = cfop_norm[:3]
            for cfop_key in self.regras.keys():
                if cfop_key.startswith(prefixo):
                    regra = self.regras[cfop_key].get(cst_norm)
                    if regra:
                        return regra
        
        return None
    
    def deve_gerar_icms(self, cfop: str, cst: str) -> bool:
        """Verifica se deve gerar ICMS para CFOP x CST"""
        regra = self.obter_regra(cfop, cst)
        return regra.gera_icms if regra else False
    
    def deve_gerar_st(self, cfop: str, cst: str) -> bool:
        """Verifica se deve gerar ST para CFOP x CST"""
        regra = self.obter_regra(cfop, cst)
        return regra.gera_icms_st if regra else False












