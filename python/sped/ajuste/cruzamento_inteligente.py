"""
Motor de Cruzamento Inteligente XML x SPED
Baseado em regras fiscais (CFOP x CST) + valores
"""
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from pathlib import Path
import logging
import sys

# Ajustar imports para funcionar tanto como módulo quanto como script
try:
    # Tentar import relativo primeiro (quando usado como módulo)
    from ..reconcile import Materiais
    from ..rules.cfop_cst_matrix import MatrizRegrasFiscais, RegraFiscal, Severidade
except (ImportError, ValueError):
    # Se import relativo falhar, tentar absoluto (quando usado como script)
    parent_dir = Path(__file__).parent.parent.resolve()
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    # Importar diretamente
    from reconcile import Materiais
    from rules.cfop_cst_matrix import MatrizRegrasFiscais, RegraFiscal, Severidade

logger = logging.getLogger(__name__)


@dataclass
class DivergenciaAjustavel:
    """Divergência que pode ser ajustada automaticamente"""
    chave_nf: str
    cfop: str
    cst: str
    campo: str  # 'VL_BC_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'VL_ICMS_ST', 'VL_IPI', 'VL_FRT', 'VL_DESC', 'VL_DOC'
    valor_xml: float
    valor_sped: float
    valor_ajuste: float  # Diferença que deve ser aplicada
    regra: Optional[str]  # Descrição da regra
    severidade: str  # 'alta', 'media', 'baixa'
    pode_ajustar: bool
    motivo: str
    
    def to_dict(self):
        """Converte para dicionário"""
        return {
            'chave_nf': self.chave_nf,
            'cfop': self.cfop,
            'cst': self.cst,
            'campo': self.campo,
            'valor_xml': self.valor_xml,
            'valor_sped': self.valor_sped,
            'valor_ajuste': self.valor_ajuste,
            'regra': self.regra,
            'severidade': self.severidade,
            'pode_ajustar': self.pode_ajustar,
            'motivo': self.motivo
        }


class MotorCruzamentoInteligente:
    """
    Motor que realiza cruzamento inteligente XML x SPED
    baseado em regras fiscais (CFOP x CST) + valores
    """
    
    def __init__(self, materiais: Materiais):
        self.materiais = materiais
        self.matriz_regras = MatrizRegrasFiscais()
        self.divergencias: List[DivergenciaAjustavel] = []
        self.tolerancia = 0.02  # Tolerância para diferenças (R$ 0,02)
    
    def analisar_divergencias(self) -> List[Dict]:
        """
        Analisa divergências entre XML e SPED usando matriz de regras
        Retorna lista de divergências ajustáveis
        """
        self.divergencias = []
        
        # Para cada nota XML
        for nota_xml in self.materiais.xml_nf:
            chave = nota_xml.get("chave")
            if not chave:
                continue
            
            # Buscar C100 correspondente
            c100_rows = self.materiais.efd_c100[
                self.materiais.efd_c100["CHV_NFE"] == chave
            ]
            
            if c100_rows.empty:
                continue
            
            c100_row = c100_rows.iloc[0]
            
            # Buscar totais C190 para esta chave
            c190_totais = self.materiais.c190_by_key.get(chave, {})
            
            # Analisar valores totais da nota (C100)
            self._verificar_valores_totais(
                chave, nota_xml, c100_row, c190_totais
            )
            
            # Agrupar itens por CFOP/CST para comparar com C190
            itens_por_cfop_cst: Dict[Tuple[str, str], List[Dict]] = {}
            for item in nota_xml.get("items", []):
                cfop = str(item.get("CFOP", "")).strip()
                icms = item.get("ICMS", {})
                cst = icms.get("CST") or icms.get("CSOSN", "")
                
                if not cfop or not cst:
                    continue
                
                key = (cfop, cst)
                if key not in itens_por_cfop_cst:
                    itens_por_cfop_cst[key] = []
                itens_por_cfop_cst[key].append(item)
            
            # Verificar divergências agrupadas por CFOP/CST
            for (cfop, cst), itens in itens_por_cfop_cst.items():
                # Obter regra fiscal
                regra = self.matriz_regras.obter_regra(cfop, cst)
                if not regra:
                    continue
                
                # Somar valores dos itens deste CFOP/CST
                vbc_total = sum(float(item.get("ICMS", {}).get("vBC", 0) or 0) for item in itens)
                vicms_total = sum(float(item.get("ICMS", {}).get("vICMS", 0) or 0) for item in itens)
                vbcst_total = sum(float(item.get("ICMS", {}).get("vBCST", 0) or 0) for item in itens)
                vst_total = sum(float(item.get("ICMS", {}).get("vST", 0) or 0) for item in itens)
                vipi_total = sum(float(item.get("IPI", {}).get("vIPI", 0) or 0) for item in itens)
                
                # Buscar totais C190 para este CFOP/CST (pode estar em c190_by_triple)
                # Por enquanto, usar totais gerais da chave (será melhorado)
                self._verificar_campo(
                    chave, cfop, cst, regra,
                    "VL_BC_ICMS", vbc_total, 
                    float(c190_totais.get("VL_BC_ICMS", 0) or 0),
                    regra.gera_bc_icms
                )
                self._verificar_campo(
                    chave, cfop, cst, regra,
                    "VL_ICMS", vicms_total,
                    float(c190_totais.get("VL_ICMS", 0) or 0),
                    regra.gera_icms
                )
                self._verificar_campo(
                    chave, cfop, cst, regra,
                    "VL_BC_ICMS_ST", vbcst_total,
                    float(c190_totais.get("VL_BC_ICMS_ST", 0) or 0),
                    regra.gera_bc_st
                )
                self._verificar_campo(
                    chave, cfop, cst, regra,
                    "VL_ICMS_ST", vst_total,
                    float(c190_totais.get("VL_ICMS_ST", 0) or 0),
                    regra.gera_icms_st
                )
                if vipi_total > 0 or float(c190_totais.get("VL_IPI", 0) or 0) > 0:
                    self._verificar_campo(
                        chave, cfop, cst, regra,
                        "VL_IPI", vipi_total,
                        float(c190_totais.get("VL_IPI", 0) or 0),
                        True
                    )
        
        # Converter para dicionários para serialização
        return [d.to_dict() for d in self.divergencias]
    
    def _verificar_valores_totais(self, chave: str, nota_xml: Dict, 
                                  c100_row, c190_totais: Dict):
        """Verifica divergências nos valores totais da nota (C100)"""
        
        # VL_DOC (Valor total da NF)
        vnf_xml = float(nota_xml.get("vNF", 0) or 0)
        vnf_sped = float(c100_row.get("VL_DOC", 0) or 0)
        if abs(vnf_xml - vnf_sped) > self.tolerancia:
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop="", cst="",
                campo="VL_DOC",
                valor_xml=vnf_xml, valor_sped=vnf_sped,
                valor_ajuste=vnf_xml - vnf_sped,
                regra="Valor total da NF deve ser igual entre XML e SPED",
                severidade="alta" if abs(vnf_xml - vnf_sped) > 10 else "media",
                pode_ajustar=True,
                motivo=f"Diferença no valor total da NF: XML R$ {vnf_xml:.2f} vs SPED R$ {vnf_sped:.2f}"
            ))
        
        # VL_FRT (Frete)
        vfrete_xml = float(nota_xml.get("vFrete", 0) or 0)
        vfrete_sped = float(c100_row.get("VL_FRT", 0) or 0)
        if abs(vfrete_xml - vfrete_sped) > self.tolerancia:
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop="", cst="",
                campo="VL_FRT",
                valor_xml=vfrete_xml, valor_sped=vfrete_sped,
                valor_ajuste=vfrete_xml - vfrete_sped,
                regra="Valor do frete deve ser igual entre XML e SPED",
                severidade="media",
                pode_ajustar=True,
                motivo=f"Diferença no frete: XML R$ {vfrete_xml:.2f} vs SPED R$ {vfrete_sped:.2f}"
            ))
        
        # VL_DESC (Desconto)
        vdesc_xml = float(nota_xml.get("vDesc", 0) or 0)
        vdesc_sped = float(c100_row.get("VL_DESC", 0) or 0)
        if abs(vdesc_xml - vdesc_sped) > self.tolerancia:
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop="", cst="",
                campo="VL_DESC",
                valor_xml=vdesc_xml, valor_sped=vdesc_sped,
                valor_ajuste=vdesc_xml - vdesc_sped,
                regra="Valor do desconto deve ser igual entre XML e SPED",
                severidade="media",
                pode_ajustar=True,
                motivo=f"Diferença no desconto: XML R$ {vdesc_xml:.2f} vs SPED R$ {vdesc_sped:.2f}"
            ))
    
    
    def _verificar_campo(self, chave: str, cfop: str, cst: str,
                        regra: RegraFiscal, campo: str,
                        valor_xml: float, valor_sped: float,
                        deve_ter_valor: bool):
        """
        Verifica se há divergência em um campo específico
        """
        # Caso 1: XML tem valor, SPED zerado (deveria ter)
        if deve_ter_valor and valor_xml > self.tolerancia and abs(valor_sped) < self.tolerancia:
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop=cfop, cst=cst,
                campo=campo,
                valor_xml=valor_xml, valor_sped=valor_sped,
                valor_ajuste=valor_xml,
                regra=regra.observacoes,
                severidade="alta",
                pode_ajustar=True,
                motivo=f"XML tributado ({campo}) sem correspondente no SPED. CFOP {cfop} / CST {cst}"
            ))
        
        # Caso 2: Ambos têm valor, mas diferentes
        elif deve_ter_valor and abs(valor_xml - valor_sped) > self.tolerancia:
            diff = abs(valor_xml - valor_sped)
            severidade = "alta" if diff > 10 else ("media" if diff > 1 else "baixa")
            
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop=cfop, cst=cst,
                campo=campo,
                valor_xml=valor_xml, valor_sped=valor_sped,
                valor_ajuste=valor_xml - valor_sped,
                regra=regra.observacoes,
                severidade=severidade,
                pode_ajustar=True,
                motivo=f"Diferença entre XML (R$ {valor_xml:.2f}) e SPED (R$ {valor_sped:.2f}) para {campo}"
            ))
        
        # Caso 3: SPED tem valor, XML não tem (possível ajuste manual)
        elif not deve_ter_valor and valor_sped > self.tolerancia:
            self.divergencias.append(DivergenciaAjustavel(
                chave_nf=chave, cfop=cfop, cst=cst,
                campo=campo,
                valor_xml=valor_xml, valor_sped=valor_sped,
                valor_ajuste=-valor_sped,  # Zerar no SPED
                regra=regra.observacoes,
                severidade="media",
                pode_ajustar=False,  # Não ajustar automaticamente (pode ser ajuste manual)
                motivo=f"SPED tem {campo} (R$ {valor_sped:.2f}) mas regra indica que não deveria ter. Verificar se é ajuste manual."
            ))

