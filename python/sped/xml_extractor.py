"""
Módulo para extração de dados de XMLs de NF-e/CT-e

Este módulo extrai informações dos XMLs para corrigir o SPED,
evitando depender de dados potencialmente incorretos no próprio SPED.
"""

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

# Namespaces comuns em NF-e
NFE_NAMESPACES = {
    'nfe': 'http://www.portalfiscal.inf.br/nfe'
}


class ItemNFe:
    """Representa um item de NF-e extraído do XML"""
    
    def __init__(self):
        self.numero_item: str = ""
        self.cfop: str = ""
        self.cst_icms: str = ""
        self.cst_ipi: str = ""
        self.codigo_produto: str = ""
        self.descricao: str = ""
        self.ncm: str = ""
        self.unidade: str = ""
        self.quantidade: Decimal = Decimal('0')
        self.valor_unitario: Decimal = Decimal('0')
        self.valor_total: Decimal = Decimal('0')
        self.valor_desconto: Decimal = Decimal('0')
        self.valor_frete: Decimal = Decimal('0')
        self.valor_seguro: Decimal = Decimal('0')
        self.valor_outras_despesas: Decimal = Decimal('0')
        # ICMS
        self.bc_icms: Decimal = Decimal('0')
        self.aliq_icms: Decimal = Decimal('0')
        self.valor_icms: Decimal = Decimal('0')
        # ICMS ST
        self.bc_icms_st: Decimal = Decimal('0')
        self.aliq_icms_st: Decimal = Decimal('0')
        self.valor_icms_st: Decimal = Decimal('0')
        # IPI
        self.bc_ipi: Decimal = Decimal('0')
        self.aliq_ipi: Decimal = Decimal('0')
        self.valor_ipi: Decimal = Decimal('0')
        
    def to_dict(self) -> Dict:
        """Converte para dicionário"""
        return {
            'numero_item': self.numero_item,
            'cfop': self.cfop,
            'cst_icms': self.cst_icms,
            'cst_ipi': self.cst_ipi,
            'codigo_produto': self.codigo_produto,
            'descricao': self.descricao,
            'ncm': self.ncm,
            'unidade': self.unidade,
            'quantidade': float(self.quantidade),
            'valor_unitario': float(self.valor_unitario),
            'valor_total': float(self.valor_total),
            'valor_desconto': float(self.valor_desconto),
            'bc_icms': float(self.bc_icms),
            'aliq_icms': float(self.aliq_icms),
            'valor_icms': float(self.valor_icms),
            'bc_icms_st': float(self.bc_icms_st),
            'aliq_icms_st': float(self.aliq_icms_st),
            'valor_icms_st': float(self.valor_icms_st),
            'bc_ipi': float(self.bc_ipi),
            'aliq_ipi': float(self.aliq_ipi),
            'valor_ipi': float(self.valor_ipi),
        }


class DadosNFe:
    """Representa dados completos de uma NF-e extraídos do XML"""
    
    def __init__(self):
        self.chave_nfe: str = ""
        self.numero_nf: str = ""
        self.serie: str = ""
        self.data_emissao: str = ""
        self.cnpj_emitente: str = ""
        self.cnpj_destinatario: str = ""
        # Totais da nota
        self.valor_total_produtos: Decimal = Decimal('0')
        self.valor_total_nf: Decimal = Decimal('0')
        self.valor_frete: Decimal = Decimal('0')
        self.valor_seguro: Decimal = Decimal('0')
        self.valor_desconto: Decimal = Decimal('0')
        self.valor_outras_despesas: Decimal = Decimal('0')
        self.valor_ipi: Decimal = Decimal('0')
        self.bc_icms: Decimal = Decimal('0')
        self.valor_icms: Decimal = Decimal('0')
        self.bc_icms_st: Decimal = Decimal('0')
        self.valor_icms_st: Decimal = Decimal('0')
        # Itens
        self.itens: List[ItemNFe] = []
        
    def to_dict(self) -> Dict:
        """Converte para dicionário"""
        return {
            'chave_nfe': self.chave_nfe,
            'numero_nf': self.numero_nf,
            'serie': self.serie,
            'data_emissao': self.data_emissao,
            'cnpj_emitente': self.cnpj_emitente,
            'cnpj_destinatario': self.cnpj_destinatario,
            'valor_total_produtos': float(self.valor_total_produtos),
            'valor_total_nf': float(self.valor_total_nf),
            'valor_frete': float(self.valor_frete),
            'valor_desconto': float(self.valor_desconto),
            'bc_icms': float(self.bc_icms),
            'valor_icms': float(self.valor_icms),
            'bc_icms_st': float(self.bc_icms_st),
            'valor_icms_st': float(self.valor_icms_st),
            'valor_ipi': float(self.valor_ipi),
            'itens': [item.to_dict() for item in self.itens],
        }


def extrair_texto(elemento, caminho: str, namespaces: Dict = None) -> str:
    """Extrai texto de um elemento XML de forma segura"""
    if elemento is None:
        return ""
    try:
        found = elemento.find(caminho, namespaces or {})
        if found is not None and found.text:
            return found.text.strip()
    except Exception as e:
        logger.debug(f"Erro ao extrair {caminho}: {e}")
    return ""


def extrair_decimal(elemento, caminho: str, namespaces: Dict = None) -> Decimal:
    """Extrai valor decimal de um elemento XML de forma segura"""
    texto = extrair_texto(elemento, caminho, namespaces)
    if not texto:
        return Decimal('0')
    try:
        # Substituir vírgula por ponto se necessário
        texto = texto.replace(',', '.')
        return Decimal(texto)
    except Exception as e:
        logger.debug(f"Erro ao converter '{texto}' para Decimal: {e}")
        return Decimal('0')


def extrair_item_nfe(det_element, namespaces: Dict) -> ItemNFe:
    """Extrai dados de um item (tag <det>) do XML da NF-e"""
    item = ItemNFe()
    
    try:
        # Número do item
        item.numero_item = det_element.get('nItem', '')
        
        # Produto
        prod = det_element.find('nfe:prod', namespaces)
        if prod is not None:
            item.codigo_produto = extrair_texto(prod, 'nfe:cProd', namespaces)
            item.descricao = extrair_texto(prod, 'nfe:xProd', namespaces)
            item.ncm = extrair_texto(prod, 'nfe:NCM', namespaces)
            item.cfop = extrair_texto(prod, 'nfe:CFOP', namespaces)
            item.unidade = extrair_texto(prod, 'nfe:uCom', namespaces)
            item.quantidade = extrair_decimal(prod, 'nfe:qCom', namespaces)
            item.valor_unitario = extrair_decimal(prod, 'nfe:vUnCom', namespaces)
            item.valor_total = extrair_decimal(prod, 'nfe:vProd', namespaces)
            item.valor_frete = extrair_decimal(prod, 'nfe:vFrete', namespaces)
            item.valor_seguro = extrair_decimal(prod, 'nfe:vSeg', namespaces)
            item.valor_desconto = extrair_decimal(prod, 'nfe:vDesc', namespaces)
            item.valor_outras_despesas = extrair_decimal(prod, 'nfe:vOutro', namespaces)
        
        # Impostos
        imposto = det_element.find('nfe:imposto', namespaces)
        if imposto is not None:
            # ICMS - pode estar em vários nós (ICMS00, ICMS10, ICMS20, etc.)
            icms = imposto.find('nfe:ICMS', namespaces)
            if icms is not None:
                # Procurar qualquer filho de ICMS (ICMS00, ICMS10, etc.)
                for icms_tipo in icms:
                    # CST ou CSOSN
                    cst = extrair_texto(icms_tipo, 'nfe:CST', namespaces)
                    if not cst:
                        cst = extrair_texto(icms_tipo, 'nfe:CSOSN', namespaces)
                    item.cst_icms = cst
                    
                    # Valores ICMS
                    item.bc_icms = extrair_decimal(icms_tipo, 'nfe:vBC', namespaces)
                    item.aliq_icms = extrair_decimal(icms_tipo, 'nfe:pICMS', namespaces)
                    item.valor_icms = extrair_decimal(icms_tipo, 'nfe:vICMS', namespaces)
                    
                    # Valores ICMS ST
                    item.bc_icms_st = extrair_decimal(icms_tipo, 'nfe:vBCST', namespaces)
                    item.aliq_icms_st = extrair_decimal(icms_tipo, 'nfe:pICMSST', namespaces)
                    item.valor_icms_st = extrair_decimal(icms_tipo, 'nfe:vICMSST', namespaces)
                    break  # Só processa o primeiro encontrado
            
            # IPI
            ipi = imposto.find('nfe:IPI', namespaces)
            if ipi is not None:
                ipi_trib = ipi.find('nfe:IPITrib', namespaces)
                if ipi_trib is not None:
                    item.cst_ipi = extrair_texto(ipi_trib, 'nfe:CST', namespaces)
                    item.bc_ipi = extrair_decimal(ipi_trib, 'nfe:vBC', namespaces)
                    item.aliq_ipi = extrair_decimal(ipi_trib, 'nfe:pIPI', namespaces)
                    item.valor_ipi = extrair_decimal(ipi_trib, 'nfe:vIPI', namespaces)
    
    except Exception as e:
        logger.error(f"Erro ao extrair item {item.numero_item}: {e}")
    
    return item


def extrair_dados_xml_nfe(xml_path: Path) -> Optional[DadosNFe]:
    """
    Extrai dados completos de um XML de NF-e
    
    Args:
        xml_path: Caminho para o arquivo XML
        
    Returns:
        DadosNFe com todos os dados extraídos ou None em caso de erro
    """
    try:
        # Parse do XML
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        # Detectar namespace
        namespaces = NFE_NAMESPACES
        if root.tag.startswith('{'):
            # Extrair namespace do root
            ns = root.tag[1:root.tag.index('}')]
            namespaces = {'nfe': ns}
        
        dados = DadosNFe()
        
        # Buscar NFe
        nfe = root.find('.//nfe:NFe', namespaces)
        if nfe is None:
            nfe = root.find('.//NFe')  # Tentar sem namespace
        
        if nfe is None:
            logger.error(f"Tag NFe não encontrada em {xml_path}")
            return None
        
        # Buscar infNFe
        inf_nfe = nfe.find('.//nfe:infNFe', namespaces)
        if inf_nfe is None:
            inf_nfe = nfe.find('.//infNFe')
        
        if inf_nfe is None:
            logger.error(f"Tag infNFe não encontrada em {xml_path}")
            return None
        
        # Chave da NF-e
        dados.chave_nfe = inf_nfe.get('Id', '').replace('NFe', '')
        
        # Identificação
        ide = inf_nfe.find('nfe:ide', namespaces)
        if ide is not None:
            dados.numero_nf = extrair_texto(ide, 'nfe:nNF', namespaces)
            dados.serie = extrair_texto(ide, 'nfe:serie', namespaces)
            dados.data_emissao = extrair_texto(ide, 'nfe:dhEmi', namespaces)
        
        # Emitente
        emit = inf_nfe.find('nfe:emit', namespaces)
        if emit is not None:
            dados.cnpj_emitente = extrair_texto(emit, 'nfe:CNPJ', namespaces)
        
        # Destinatário
        dest = inf_nfe.find('nfe:dest', namespaces)
        if dest is not None:
            dados.cnpj_destinatario = extrair_texto(dest, 'nfe:CNPJ', namespaces)
        
        # Totais
        total = inf_nfe.find('nfe:total', namespaces)
        if total is not None:
            icms_tot = total.find('nfe:ICMSTot', namespaces)
            if icms_tot is not None:
                dados.bc_icms = extrair_decimal(icms_tot, 'nfe:vBC', namespaces)
                dados.valor_icms = extrair_decimal(icms_tot, 'nfe:vICMS', namespaces)
                dados.bc_icms_st = extrair_decimal(icms_tot, 'nfe:vBCST', namespaces)
                dados.valor_icms_st = extrair_decimal(icms_tot, 'nfe:vST', namespaces)
                dados.valor_total_produtos = extrair_decimal(icms_tot, 'nfe:vProd', namespaces)
                dados.valor_total_nf = extrair_decimal(icms_tot, 'nfe:vNF', namespaces)
                dados.valor_frete = extrair_decimal(icms_tot, 'nfe:vFrete', namespaces)
                dados.valor_seguro = extrair_decimal(icms_tot, 'nfe:vSeg', namespaces)
                dados.valor_desconto = extrair_decimal(icms_tot, 'nfe:vDesc', namespaces)
                dados.valor_ipi = extrair_decimal(icms_tot, 'nfe:vIPI', namespaces)
                dados.valor_outras_despesas = extrair_decimal(icms_tot, 'nfe:vOutro', namespaces)
        
        # Itens
        for det in inf_nfe.findall('nfe:det', namespaces):
            item = extrair_item_nfe(det, namespaces)
            if item.cfop:  # Só adiciona se tiver CFOP
                dados.itens.append(item)
        
        logger.info(f"XML extraído com sucesso: {dados.chave_nfe} - {len(dados.itens)} itens")
        return dados
    
    except Exception as e:
        logger.error(f"Erro ao extrair dados do XML {xml_path}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def consolidar_itens_por_cfop_cst(itens: List[ItemNFe]) -> Dict[Tuple[str, str], Dict]:
    """
    Consolida itens por CFOP e CST (para gerar C190)
    
    Args:
        itens: Lista de itens da NF-e
        
    Returns:
        Dicionário com chave (cfop, cst) e valores consolidados
    """
    consolidado = {}
    
    for item in itens:
        chave = (item.cfop, item.cst_icms)
        
        if chave not in consolidado:
            consolidado[chave] = {
                'cfop': item.cfop,
                'cst': item.cst_icms,
                'valor_operacao': Decimal('0'),
                'bc_icms': Decimal('0'),
                'valor_icms': Decimal('0'),
                'bc_icms_st': Decimal('0'),
                'valor_icms_st': Decimal('0'),
                'valor_ipi': Decimal('0'),
                'quantidade_itens': 0,
            }
        
        # Somar valores
        consolidado[chave]['valor_operacao'] += item.valor_total
        consolidado[chave]['bc_icms'] += item.bc_icms
        consolidado[chave]['valor_icms'] += item.valor_icms
        consolidado[chave]['bc_icms_st'] += item.bc_icms_st
        consolidado[chave]['valor_icms_st'] += item.valor_icms_st
        consolidado[chave]['valor_ipi'] += item.valor_ipi
        consolidado[chave]['quantidade_itens'] += 1
    
    return consolidado




