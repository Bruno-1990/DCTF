"""
Gerador de Evidências - Extrai e formata evidências XML e SPED para exibição
Gera evidências lado a lado para facilitar comparação e análise
"""

from typing import List, Dict, Any, Optional
from decimal import Decimal
from dataclasses import dataclass, field
from pathlib import Path
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class EvidenciaXML:
    """Evidência extraída do XML"""
    chave_nfe: str
    tipo: str  # 'icms', 'icms_st', 'fcp', 'ipi', 'total', 'item'
    campo: str  # Nome do campo
    valor: Decimal
    descricao: str
    tag_xml: Optional[str] = None  # Caminho da tag no XML
    contexto: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte evidência para dicionário"""
        return {
            'chave_nfe': self.chave_nfe,
            'tipo': self.tipo,
            'campo': self.campo,
            'valor': float(self.valor),
            'descricao': self.descricao,
            'tag_xml': self.tag_xml,
            'contexto': self.contexto,
        }


@dataclass
class EvidenciaSPED:
    """Evidência extraída do SPED"""
    chave_nfe: Optional[str]
    registro: str  # 'C100', 'C170', 'C190', 'E110', 'E111'
    tipo: str  # 'icms', 'icms_st', 'fcp', 'ipi', 'total', 'item'
    campo: str  # Nome do campo
    valor: Decimal
    descricao: str
    linha_sped: Optional[str] = None  # Linha completa do SPED
    contexto: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte evidência para dicionário"""
        return {
            'chave_nfe': self.chave_nfe,
            'registro': self.registro,
            'tipo': self.tipo,
            'campo': self.campo,
            'valor': float(self.valor),
            'descricao': self.descricao,
            'linha_sped': self.linha_sped,
            'contexto': self.contexto,
        }


@dataclass
class EvidenciaComparacao:
    """Evidência comparativa XML vs SPED"""
    campo: str
    valor_xml: Optional[Decimal]
    valor_sped: Optional[Decimal]
    diferenca: Optional[Decimal]
    percentual_diferenca: Optional[Decimal]
    evidencia_xml: Optional[EvidenciaXML] = None
    evidencia_sped: Optional[EvidenciaSPED] = None
    regra_aplicada: Optional[str] = None
    explicacao: Optional[str] = None
    classificacao: Optional[str] = None  # 'ERRO', 'REVISAR', 'LEGÍTIMO'
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte comparação para dicionário"""
        return {
            'campo': self.campo,
            'valor_xml': float(self.valor_xml) if self.valor_xml else None,
            'valor_sped': float(self.valor_sped) if self.valor_sped else None,
            'diferenca': float(self.diferenca) if self.diferenca else None,
            'percentual_diferenca': float(self.percentual_diferenca) if self.percentual_diferenca else None,
            'evidencia_xml': self.evidencia_xml.to_dict() if self.evidencia_xml else None,
            'evidencia_sped': self.evidencia_sped.to_dict() if self.evidencia_sped else None,
            'regra_aplicada': self.regra_aplicada,
            'explicacao': self.explicacao,
            'classificacao': self.classificacao,
        }


@dataclass
class EvidenciasDocumento:
    """Evidências completas de um documento"""
    chave_nfe: str
    evidencias_xml: List[EvidenciaXML] = field(default_factory=list)
    evidencias_sped: List[EvidenciaSPED] = field(default_factory=list)
    comparacoes: List[EvidenciaComparacao] = field(default_factory=list)
    resumo: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte evidências para dicionário"""
        return {
            'chave_nfe': self.chave_nfe,
            'evidencias_xml': [e.to_dict() for e in self.evidencias_xml],
            'evidencias_sped': [e.to_dict() for e in self.evidencias_sped],
            'comparacoes': [c.to_dict() for c in self.comparacoes],
            'resumo': self.resumo,
        }


class EvidenceGenerator:
    """Gerador de evidências XML e SPED"""
    
    def __init__(self):
        """Inicializa o gerador de evidências"""
        pass
    
    def extrair_evidencias_xml(self, xml_path: Path) -> List[EvidenciaXML]:
        """
        Extrai evidências relevantes de um arquivo XML
        
        Args:
            xml_path: Caminho do arquivo XML
        
        Returns:
            Lista de evidências XML extraídas
        """
        evidencias: List[EvidenciaXML] = []
        
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            
            # Namespace
            ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
            
            # Extrair chave NF-e
            inf_nfe = root.find('.//nfe:infNFe', ns) or root.find('.//infNFe')
            if inf_nfe is None:
                return evidencias
            
            chave_nfe = inf_nfe.get('Id', '').replace('NFe', '')
            
            # Extrair valores totais
            total = inf_nfe.find('.//nfe:total', ns) or inf_nfe.find('.//total')
            if total:
                icmstot = total.find('.//nfe:ICMSTot', ns) or total.find('.//ICMSTot')
                if icmstot:
                    # Valor total dos produtos
                    v_prod = self._extrair_valor_xml(icmstot, 'vProd', ns)
                    if v_prod:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='total',
                            campo='vProd',
                            valor=v_prod,
                            descricao='Valor total dos produtos',
                            tag_xml='total/ICMSTot/vProd',
                            contexto={'origem': 'total'}
                        ))
                    
                    # ICMS próprio
                    v_icms = self._extrair_valor_xml(icmstot, 'vICMS', ns)
                    if v_icms:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='icms',
                            campo='vICMS',
                            valor=v_icms,
                            descricao='Valor do ICMS',
                            tag_xml='total/ICMSTot/vICMS',
                            contexto={'origem': 'total'}
                        ))
                    
                    # ICMS ST
                    v_icms_st = self._extrair_valor_xml(icmstot, 'vST', ns)
                    if v_icms_st:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='icms_st',
                            campo='vST',
                            valor=v_icms_st,
                            descricao='Valor do ICMS ST',
                            tag_xml='total/ICMSTot/vST',
                            contexto={'origem': 'total'}
                        ))
                    
                    # FCP
                    v_fcp = self._extrair_valor_xml(icmstot, 'vFCP', ns)
                    if v_fcp:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='fcp',
                            campo='vFCP',
                            valor=v_fcp,
                            descricao='Valor do FCP',
                            tag_xml='total/ICMSTot/vFCP',
                            contexto={'origem': 'total'}
                        ))
                    
                    # IPI
                    v_ipi = self._extrair_valor_xml(icmstot, 'vIPI', ns)
                    if v_ipi:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='ipi',
                            campo='vIPI',
                            valor=v_ipi,
                            descricao='Valor do IPI',
                            tag_xml='total/ICMSTot/vIPI',
                            contexto={'origem': 'total'}
                        ))
                
                # Valor total da NF
                v_nf = self._extrair_valor_xml(total, 'vNF', ns)
                if v_nf:
                    evidencias.append(EvidenciaXML(
                        chave_nfe=chave_nfe,
                        tipo='total',
                        campo='vNF',
                        valor=v_nf,
                        descricao='Valor total da NF',
                        tag_xml='total/vNF',
                        contexto={'origem': 'total'}
                    ))
            
            # Extrair evidências dos itens
            det = inf_nfe.findall('.//nfe:det', ns) or inf_nfe.findall('.//det')
            for idx, item in enumerate(det):
                item_num = item.get('nItem', str(idx + 1))
                
                # ICMS do item
                icms = item.find('.//nfe:ICMS', ns) or item.find('.//ICMS')
                if icms:
                    icms_item = icms[0] if len(icms) > 0 else None
                    if icms_item:
                        cst = icms_item.find('.//nfe:CST', ns) or icms_item.find('.//CST')
                        v_bc_icms = self._extrair_valor_xml(icms_item, 'vBC', ns)
                        v_icms = self._extrair_valor_xml(icms_item, 'vICMS', ns)
                        
                        if v_icms:
                            evidencias.append(EvidenciaXML(
                                chave_nfe=chave_nfe,
                                tipo='icms',
                                campo=f'vICMS_item_{item_num}',
                                valor=v_icms,
                                descricao=f'Valor do ICMS do item {item_num}',
                                tag_xml=f'det[@nItem="{item_num}"]/ICMS/vICMS',
                                contexto={'item': item_num, 'cst': cst.text if cst is not None else None}
                            ))
                
                # ICMS ST do item
                icms_st = item.find('.//nfe:ICMSST', ns) or item.find('.//ICMSST')
                if icms_st:
                    v_bc_st = self._extrair_valor_xml(icms_st, 'vBCST', ns)
                    v_icms_st = self._extrair_valor_xml(icms_st, 'vICMSST', ns)
                    
                    if v_icms_st:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='icms_st',
                            campo=f'vICMSST_item_{item_num}',
                            valor=v_icms_st,
                            descricao=f'Valor do ICMS ST do item {item_num}',
                            tag_xml=f'det[@nItem="{item_num}"]/ICMSST/vICMSST',
                            contexto={'item': item_num}
                        ))
                
                # Valor do item
                prod = item.find('.//nfe:prod', ns) or item.find('.//prod')
                if prod:
                    v_prod = self._extrair_valor_xml(prod, 'vProd', ns)
                    if v_prod:
                        evidencias.append(EvidenciaXML(
                            chave_nfe=chave_nfe,
                            tipo='item',
                            campo=f'vProd_item_{item_num}',
                            valor=v_prod,
                            descricao=f'Valor do produto do item {item_num}',
                            tag_xml=f'det[@nItem="{item_num}"]/prod/vProd',
                            contexto={'item': item_num}
                        ))
        
        except Exception as e:
            logger.error(f"Erro ao extrair evidências XML de {xml_path}: {e}")
        
        return evidencias
    
    def _extrair_valor_xml(self, element: ET.Element, tag: str, ns: Dict[str, str]) -> Optional[Decimal]:
        """Extrai valor numérico de uma tag XML"""
        try:
            sub = element.find(f'.//nfe:{tag}', ns) or element.find(f'.//{tag}')
            if sub is not None and sub.text:
                return Decimal(sub.text.replace(',', '.'))
        except:
            pass
        return None
    
    def extrair_evidencias_sped(
        self,
        efd_path: Path,
        chave_nfe: Optional[str] = None
    ) -> List[EvidenciaSPED]:
        """
        Extrai evidências relevantes do SPED
        
        Args:
            efd_path: Caminho do arquivo SPED
            chave_nfe: Chave NF-e para filtrar (opcional)
        
        Returns:
            Lista de evidências SPED extraídas
        """
        evidencias: List[EvidenciaSPED] = []
        
        try:
            from parsers import split_sped_line
            
            with efd_path.open("r", encoding="latin1", errors="ignore") as f:
                current_chave = None
                
                for linha in f:
                    if linha.startswith("|C100|"):
                        campos = split_sped_line(linha)
                        if len(campos) >= 10:
                            current_chave = campos[9].strip() if len(campos) > 9 else None
                            
                            # Filtrar por chave se especificado
                            if chave_nfe and current_chave != chave_nfe:
                                continue
                            
                            # Extrair valores do C100
                            vl_merc = self._parse_valor_sped(campos[16] if len(campos) > 16 else "")
                            vl_icms = self._parse_valor_sped(campos[20] if len(campos) > 20 else "")
                            vl_icms_st = self._parse_valor_sped(campos[22] if len(campos) > 22 else "")
                            vl_ipi = self._parse_valor_sped(campos[25] if len(campos) > 25 else "")
                            
                            if vl_merc:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C100',
                                    tipo='total',
                                    campo='VL_MERC',
                                    valor=vl_merc,
                                    descricao='Valor total da mercadoria (C100)',
                                    linha_sped=linha.strip(),
                                    contexto={'serie': campos[7] if len(campos) > 7 else None, 'num_doc': campos[8] if len(campos) > 8 else None}
                                ))
                            
                            if vl_icms:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C100',
                                    tipo='icms',
                                    campo='VL_ICMS',
                                    valor=vl_icms,
                                    descricao='Valor do ICMS (C100)',
                                    linha_sped=linha.strip(),
                                ))
                            
                            if vl_icms_st:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C100',
                                    tipo='icms_st',
                                    campo='VL_ICMS_ST',
                                    valor=vl_icms_st,
                                    descricao='Valor do ICMS ST (C100)',
                                    linha_sped=linha.strip(),
                                ))
                            
                            if vl_ipi:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C100',
                                    tipo='ipi',
                                    campo='VL_IPI',
                                    valor=vl_ipi,
                                    descricao='Valor do IPI (C100)',
                                    linha_sped=linha.strip(),
                                ))
                    
                    elif linha.startswith("|C170|") and current_chave:
                        # Filtrar por chave se especificado
                        if chave_nfe and current_chave != chave_nfe:
                            continue
                        
                        campos = split_sped_line(linha)
                        if len(campos) >= 9:
                            vl_item = self._parse_valor_sped(campos[7] if len(campos) > 7 else "")
                            vl_icms = self._parse_valor_sped(campos[13] if len(campos) > 13 else "")
                            
                            if vl_item:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C170',
                                    tipo='item',
                                    campo='VL_ITEM',
                                    valor=vl_item,
                                    descricao=f'Valor do item (C170)',
                                    linha_sped=linha.strip(),
                                    contexto={'num_item': campos[2] if len(campos) > 2 else None}
                                ))
                            
                            if vl_icms:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C170',
                                    tipo='icms',
                                    campo='VL_ICMS',
                                    valor=vl_icms,
                                    descricao=f'Valor do ICMS do item (C170)',
                                    linha_sped=linha.strip(),
                                ))
                    
                    elif linha.startswith("|C190|") and current_chave:
                        # Filtrar por chave se especificado
                        if chave_nfe and current_chave != chave_nfe:
                            continue
                        
                        campos = split_sped_line(linha)
                        if len(campos) >= 12:
                            vl_opr = self._parse_valor_sped(campos[5] if len(campos) > 5 else "")
                            vl_icms = self._parse_valor_sped(campos[7] if len(campos) > 7 else "")
                            vl_icms_st = self._parse_valor_sped(campos[9] if len(campos) > 9 else "")
                            vl_ipi = self._parse_valor_sped(campos[11] if len(campos) > 11 else "")
                            
                            if vl_opr:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C190',
                                    tipo='total',
                                    campo='VL_OPR',
                                    valor=vl_opr,
                                    descricao='Valor da operação (C190)',
                                    linha_sped=linha.strip(),
                                    contexto={'cfop': campos[3] if len(campos) > 3 else None, 'cst': campos[2] if len(campos) > 2 else None}
                                ))
                            
                            if vl_icms:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C190',
                                    tipo='icms',
                                    campo='VL_ICMS',
                                    valor=vl_icms,
                                    descricao='Valor do ICMS (C190)',
                                    linha_sped=linha.strip(),
                                ))
                            
                            if vl_icms_st:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C190',
                                    tipo='icms_st',
                                    campo='VL_ICMS_ST',
                                    valor=vl_icms_st,
                                    descricao='Valor do ICMS ST (C190)',
                                    linha_sped=linha.strip(),
                                ))
                            
                            if vl_ipi:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=current_chave,
                                    registro='C190',
                                    tipo='ipi',
                                    campo='VL_IPI',
                                    valor=vl_ipi,
                                    descricao='Valor do IPI (C190)',
                                    linha_sped=linha.strip(),
                                ))
                    
                    elif linha.startswith("|E110|"):
                        campos = split_sped_line(linha)
                        if len(campos) >= 12:
                            vl_icms_recolher = self._parse_valor_sped(campos[11] if len(campos) > 11 else "")
                            
                            if vl_icms_recolher:
                                evidencias.append(EvidenciaSPED(
                                    chave_nfe=None,  # E110 não tem chave específica
                                    registro='E110',
                                    tipo='total',
                                    campo='VL_ICMS_RECOLHER',
                                    valor=vl_icms_recolher,
                                    descricao='ICMS a recolher (E110)',
                                    linha_sped=linha.strip(),
                                ))
        
        except Exception as e:
            logger.error(f"Erro ao extrair evidências SPED de {efd_path}: {e}")
        
        return evidencias
    
    def _parse_valor_sped(self, valor_str: str) -> Optional[Decimal]:
        """Parse valor do SPED (formato brasileiro)"""
        try:
            if not valor_str or valor_str.strip() == "":
                return None
            # Formato SPED: "1234,56" (vírgula como separador decimal)
            valor_limpo = valor_str.replace(".", "").replace(",", ".")
            return Decimal(valor_limpo)
        except:
            return None
    
    def gerar_comparacoes(
        self,
        evidencias_xml: List[EvidenciaXML],
        evidencias_sped: List[EvidenciaSPED],
        regra_aplicada: Optional[str] = None,
        explicacao: Optional[str] = None,
        classificacao: Optional[str] = None
    ) -> List[EvidenciaComparacao]:
        """
        Gera comparações entre evidências XML e SPED
        
        Args:
            evidencias_xml: Lista de evidências XML
            evidencias_sped: Lista de evidências SPED
            regra_aplicada: Nome da regra aplicada
            explicacao: Explicação da regra
            classificacao: Classificação da divergência
        
        Returns:
            Lista de comparações
        """
        comparacoes: List[EvidenciaComparacao] = []
        
        # Criar índice de evidências SPED por tipo e campo
        sped_index: Dict[Tuple[str, str], EvidenciaSPED] = {}
        for ev_sped in evidencias_sped:
            key = (ev_sped.tipo, ev_sped.campo)
            sped_index[key] = ev_sped
        
        # Comparar cada evidência XML com SPED correspondente
        for ev_xml in evidencias_xml:
            key = (ev_xml.tipo, ev_xml.campo)
            ev_sped = sped_index.get(key)
            
            diferenca = None
            percentual_diferenca = None
            
            if ev_sped:
                diferenca = abs(ev_xml.valor - ev_sped.valor)
                if ev_xml.valor > 0:
                    percentual_diferenca = (diferenca / ev_xml.valor) * 100
            
            comparacoes.append(EvidenciaComparacao(
                campo=ev_xml.campo,
                valor_xml=ev_xml.valor,
                valor_sped=ev_sped.valor if ev_sped else None,
                diferenca=diferenca,
                percentual_diferenca=percentual_diferenca,
                evidencia_xml=ev_xml,
                evidencia_sped=ev_sped,
                regra_aplicada=regra_aplicada,
                explicacao=explicacao,
                classificacao=classificacao
            ))
        
        return comparacoes
    
    def gerar_evidencias_documento(
        self,
        xml_path: Path,
        efd_path: Path,
        chave_nfe: str,
        regra_aplicada: Optional[str] = None,
        explicacao: Optional[str] = None,
        classificacao: Optional[str] = None
    ) -> EvidenciasDocumento:
        """
        Gera evidências completas de um documento
        
        Args:
            xml_path: Caminho do arquivo XML
            efd_path: Caminho do arquivo SPED
            chave_nfe: Chave NF-e
            regra_aplicada: Nome da regra aplicada
            explicacao: Explicação da regra
            classificacao: Classificação da divergência
        
        Returns:
            Evidências completas do documento
        """
        # Extrair evidências
        evidencias_xml = self.extrair_evidencias_xml(xml_path)
        evidencias_sped = self.extrair_evidencias_sped(efd_path, chave_nfe)
        
        # Gerar comparações
        comparacoes = self.gerar_comparacoes(
            evidencias_xml,
            evidencias_sped,
            regra_aplicada,
            explicacao,
            classificacao
        )
        
        # Gerar resumo
        resumo = {
            'total_evidencias_xml': len(evidencias_xml),
            'total_evidencias_sped': len(evidencias_sped),
            'total_comparacoes': len(comparacoes),
            'total_com_diferenca': sum(1 for c in comparacoes if c.diferenca and c.diferenca > 0),
        }
        
        return EvidenciasDocumento(
            chave_nfe=chave_nfe,
            evidencias_xml=evidencias_xml,
            evidencias_sped=evidencias_sped,
            comparacoes=comparacoes,
            resumo=resumo
        )

