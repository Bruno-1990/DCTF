"""
Parsers para converter XML e EFD para Modelo Canônico
"""

from __future__ import annotations
from pathlib import Path
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime
import xml.etree.ElementTree as ET
import re

from .documento_fiscal import DocumentoFiscal
from .item_fiscal import ItemFiscal
from .tributos import TributoICMS, TributoICMSST, TributoIPI, TributoDIFAL, TributoFCP

# Namespaces XML
NFE_NAMESPACES = {
    'nfe': 'http://www.portalfiscal.inf.br/nfe'
}


def parse_decimal(value: Any) -> Decimal:
    """Converte valor para Decimal"""
    if value is None or value == '':
        return Decimal('0.00')
    try:
        if isinstance(value, Decimal):
            return value
        if isinstance(value, (int, float)):
            return Decimal(str(value)).quantize(Decimal('0.01'))
        # String: remover formatação e converter
        value_str = str(value).strip().replace(',', '.').replace(' ', '')
        # Remover caracteres não numéricos exceto ponto e sinal
        value_str = re.sub(r'[^\d.\-+]', '', value_str)
        if not value_str or value_str == '-':
            return Decimal('0.00')
        return Decimal(value_str).quantize(Decimal('0.01'))
    except (ValueError, TypeError):
        return Decimal('0.00')


def parse_date_efd(date_str: Optional[str]) -> Optional[datetime]:
    """Converte data do formato EFD (DDMMYYYY) para datetime"""
    if not date_str or len(date_str) < 8:
        return None
    try:
        return datetime.strptime(date_str[:8], '%d%m%Y')
    except (ValueError, TypeError):
        return None


def parse_date_xml(date_str: Optional[str]) -> Optional[datetime]:
    """Converte data do formato XML (YYYY-MM-DDTHH:MM:SS) para datetime"""
    if not date_str:
        return None
    try:
        # Remover timezone se presente
        date_str = date_str.split('T')[0] if 'T' in date_str else date_str
        return datetime.strptime(date_str[:10], '%Y-%m-%d')
    except (ValueError, TypeError):
        return None


def extrair_texto_xml(elemento: Optional[ET.Element], caminho: str, namespaces: Dict = None) -> str:
    """Extrai texto de um elemento XML"""
    if elemento is None:
        return ""
    try:
        found = elemento.find(caminho, namespaces or {})
        if found is not None and found.text:
            return found.text.strip()
    except Exception:
        pass
    return ""


def extrair_decimal_xml(elemento: Optional[ET.Element], caminho: str, namespaces: Dict = None) -> Decimal:
    """Extrai valor decimal de um elemento XML"""
    texto = extrair_texto_xml(elemento, caminho, namespaces)
    return parse_decimal(texto)


def parse_xml_to_canonical(xml_path: Path) -> Optional[DocumentoFiscal]:
    """
    Converte XML de NF-e para modelo canônico
    
    Args:
        xml_path: Caminho do arquivo XML
        
    Returns:
        DocumentoFiscal normalizado ou None se erro
    """
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        # Encontrar elemento NFe
        nfe_elem = root.find('.//nfe:NFe', NFE_NAMESPACES)
        if nfe_elem is None:
            # Tentar sem namespace
            nfe_elem = root.find('.//NFe')
        if nfe_elem is None:
            return None
        
        inf_nfe = nfe_elem.find('.//nfe:infNFe', NFE_NAMESPACES) or nfe_elem.find('.//infNFe')
        if inf_nfe is None:
            return None
        
        # Identificação
        ide = inf_nfe.find('.//nfe:ide', NFE_NAMESPACES) or inf_nfe.find('.//ide')
        emit = inf_nfe.find('.//nfe:emit', NFE_NAMESPACES) or inf_nfe.find('.//emit')
        dest = inf_nfe.find('.//nfe:dest', NFE_NAMESPACES) or inf_nfe.find('.//dest')
        total = inf_nfe.find('.//nfe:total', NFE_NAMESPACES) or inf_nfe.find('.//total')
        
        # Chave de acesso
        chave_acesso = inf_nfe.get('Id', '').replace('NFe', '')
        
        # Criar documento
        doc = DocumentoFiscal(
            chave_acesso=chave_acesso if len(chave_acesso) == 44 else None,
            numero=extrair_texto_xml(ide, './/nfe:nNF', NFE_NAMESPACES) or extrair_texto_xml(ide, './/nNF'),
            serie=extrair_texto_xml(ide, './/nfe:serie', NFE_NAMESPACES) or extrair_texto_xml(ide, './/serie'),
            modelo=extrair_texto_xml(ide, './/nfe:mod', NFE_NAMESPACES) or extrair_texto_xml(ide, './/mod'),
            tipo_operacao=extrair_texto_xml(ide, './/nfe:tpNF', NFE_NAMESPACES) or extrair_texto_xml(ide, './/tpNF'),
            cnpj_emitente=extrair_texto_xml(emit, './/nfe:CNPJ', NFE_NAMESPACES) or extrair_texto_xml(emit, './/CNPJ'),
            nome_emitente=extrair_texto_xml(emit, './/nfe:xNome', NFE_NAMESPACES) or extrair_texto_xml(emit, './/xNome'),
            uf_emitente=extrair_texto_xml(emit, './/nfe:UF', NFE_NAMESPACES) or extrair_texto_xml(emit, './/UF'),
            ie_emitente=extrair_texto_xml(emit, './/nfe:IE', NFE_NAMESPACES) or extrair_texto_xml(emit, './/IE'),
            cnpj_destinatario=extrair_texto_xml(dest, './/nfe:CNPJ', NFE_NAMESPACES) or extrair_texto_xml(dest, './/CNPJ'),
            nome_destinatario=extrair_texto_xml(dest, './/nfe:xNome', NFE_NAMESPACES) or extrair_texto_xml(dest, './/xNome'),
            uf_destinatario=extrair_texto_xml(dest, './/nfe:UF', NFE_NAMESPACES) or extrair_texto_xml(dest, './/UF'),
            ie_destinatario=extrair_texto_xml(dest, './/nfe:IE', NFE_NAMESPACES) or extrair_texto_xml(dest, './/IE'),
            data_emissao=parse_date_xml(extrair_texto_xml(ide, './/nfe:dhEmi', NFE_NAMESPACES) or extrair_texto_xml(ide, './/dhEmi')),
            data_saida_entrada=parse_date_xml(extrair_texto_xml(ide, './/nfe:dhSaiEnt', NFE_NAMESPACES) or extrair_texto_xml(ide, './/dhSaiEnt')),
            referencia_xml=str(xml_path),
            metadata={'xml_path': str(xml_path)}
        )
        
        # Totais
        if total is not None:
            icms_tot = total.find('.//nfe:ICMSTot', NFE_NAMESPACES) or total.find('.//ICMSTot')
            if icms_tot is not None:
                doc.valor_produtos = extrair_decimal_xml(icms_tot, './/nfe:vProd', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vProd')
                doc.valor_frete = extrair_decimal_xml(icms_tot, './/nfe:vFrete', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vFrete')
                doc.valor_seguro = extrair_decimal_xml(icms_tot, './/nfe:vSeg', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vSeg')
                doc.valor_desconto = extrair_decimal_xml(icms_tot, './/nfe:vDesc', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vDesc')
                doc.valor_outros = extrair_decimal_xml(icms_tot, './/nfe:vOutro', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vOutro')
                doc.valor_ii = extrair_decimal_xml(icms_tot, './/nfe:vII', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vII')
                doc.valor_ipi = extrair_decimal_xml(icms_tot, './/nfe:vIPI', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vIPI')
                doc.valor_icms = extrair_decimal_xml(icms_tot, './/nfe:vICMS', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vICMS')
                doc.valor_icms_st = extrair_decimal_xml(icms_tot, './/nfe:vST', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vST')
                doc.valor_total = extrair_decimal_xml(icms_tot, './/nfe:vNF', NFE_NAMESPACES) or extrair_decimal_xml(icms_tot, './/vNF')
        
        # Itens
        det_elements = inf_nfe.findall('.//nfe:det', NFE_NAMESPACES) or inf_nfe.findall('.//det')
        for det in det_elements:
            item = _parse_item_xml(det, NFE_NAMESPACES)
            if item:
                doc.itens.append(item)
        
        return doc
        
    except Exception as e:
        print(f"Erro ao parsear XML {xml_path}: {e}")
        return None


def _parse_item_xml(det: ET.Element, namespaces: Dict) -> Optional[ItemFiscal]:
    """Parse de um item XML para ItemFiscal"""
    try:
        prod = det.find('.//nfe:prod', namespaces) or det.find('.//prod')
        imposto = det.find('.//nfe:imposto', namespaces) or det.find('.//imposto')
        
        if prod is None:
            return None
        
        # Dados básicos do produto
        item = ItemFiscal(
            numero_item=int(extrair_texto_xml(det, './/nfe:nItem', namespaces) or extrair_texto_xml(det, './/nItem') or '0'),
            codigo_item=extrair_texto_xml(prod, './/nfe:cProd', namespaces) or extrair_texto_xml(prod, './/cProd'),
            descricao=extrair_texto_xml(prod, './/nfe:xProd', namespaces) or extrair_texto_xml(prod, './/xProd'),
            ncm=extrair_texto_xml(prod, './/nfe:NCM', namespaces) or extrair_texto_xml(prod, './/NCM'),
            cest=extrair_texto_xml(prod, './/nfe:CEST', namespaces) or extrair_texto_xml(prod, './/CEST'),
            cfop=extrair_texto_xml(prod, './/nfe:CFOP', namespaces) or extrair_texto_xml(prod, './/CFOP'),
            unidade=extrair_texto_xml(prod, './/nfe:uCom', namespaces) or extrair_texto_xml(prod, './/uCom'),
            quantidade=extrair_decimal_xml(prod, './/nfe:qCom', namespaces) or extrair_decimal_xml(prod, './/qCom'),
            valor_unitario=extrair_decimal_xml(prod, './/nfe:vUnCom', namespaces) or extrair_decimal_xml(prod, './/vUnCom'),
            valor_total=extrair_decimal_xml(prod, './/nfe:vProd', namespaces) or extrair_decimal_xml(prod, './/vProd'),
            valor_desconto=extrair_decimal_xml(prod, './/nfe:vDesc', namespaces) or extrair_decimal_xml(prod, './/vDesc'),
            valor_frete=extrair_decimal_xml(prod, './/nfe:vFrete', namespaces) or extrair_decimal_xml(prod, './/vFrete'),
            valor_seguro=extrair_decimal_xml(prod, './/nfe:vSeg', namespaces) or extrair_decimal_xml(prod, './/vSeg'),
            valor_outros=extrair_decimal_xml(prod, './/nfe:vOutro', namespaces) or extrair_decimal_xml(prod, './/vOutro'),
            informacoes_adicionais=extrair_texto_xml(prod, './/nfe:xPed', namespaces) or extrair_texto_xml(prod, './/xPed'),
        )
        
        # ICMS
        if imposto is not None:
            icms_elem = imposto.find('.//nfe:ICMS', namespaces) or imposto.find('.//ICMS')
            if icms_elem is not None:
                icms_grupo = icms_elem[0] if len(icms_elem) > 0 else None
                if icms_grupo is not None:
                    item.icms = TributoICMS(
                        base_calculo=extrair_decimal_xml(icms_grupo, './/nfe:vBC', namespaces) or extrair_decimal_xml(icms_grupo, './/vBC'),
                        aliquota=extrair_decimal_xml(icms_grupo, './/nfe:pICMS', namespaces) or extrair_decimal_xml(icms_grupo, './/pICMS'),
                        valor=extrair_decimal_xml(icms_grupo, './/nfe:vICMS', namespaces) or extrair_decimal_xml(icms_grupo, './/vICMS'),
                        cst=extrair_texto_xml(icms_grupo, './/nfe:CST', namespaces) or extrair_texto_xml(icms_grupo, './/CST') or extrair_texto_xml(icms_grupo, './/nfe:CSOSN', namespaces) or extrair_texto_xml(icms_grupo, './/CSOSN'),
                        cfop=item.cfop,
                        origem=extrair_texto_xml(icms_grupo, './/nfe:orig', namespaces) or extrair_texto_xml(icms_grupo, './/orig'),
                    )
                    
                    # ICMS ST
                    if 'ST' in icms_grupo.tag or 'st' in icms_grupo.tag.lower():
                        item.icms_st = TributoICMSST(
                            base_calculo_st=extrair_decimal_xml(icms_grupo, './/nfe:vBCST', namespaces) or extrair_decimal_xml(icms_grupo, './/vBCST'),
                            aliquota_st=extrair_decimal_xml(icms_grupo, './/nfe:pST', namespaces) or extrair_decimal_xml(icms_grupo, './/pST'),
                            valor_st=extrair_decimal_xml(icms_grupo, './/nfe:vICMSST', namespaces) or extrair_decimal_xml(icms_grupo, './/vICMSST'),
                            mva=extrair_decimal_xml(icms_grupo, './/nfe:pMVAST', namespaces) or extrair_decimal_xml(icms_grupo, './/pMVAST'),
                            base_calculo_icms_proprio=item.icms.base_calculo if item.icms else None,
                            valor_icms_proprio=item.icms.valor if item.icms else None,
                            cst=item.icms.cst if item.icms else None,
                            cfop=item.cfop,
                        )
            
            # IPI
            ipi_elem = imposto.find('.//nfe:IPI', namespaces) or imposto.find('.//IPI')
            if ipi_elem is not None:
                ipi_grupo = ipi_elem.find('.//nfe:IPITrib', namespaces) or ipi_elem.find('.//IPITrib') or ipi_elem.find('.//nfe:IPINT', namespaces) or ipi_elem.find('.//IPINT')
                if ipi_grupo is not None:
                    item.ipi = TributoIPI(
                        base_calculo=extrair_decimal_xml(ipi_grupo, './/nfe:vBC', namespaces) or extrair_decimal_xml(ipi_grupo, './/vBC'),
                        aliquota=extrair_decimal_xml(ipi_grupo, './/nfe:pIPI', namespaces) or extrair_decimal_xml(ipi_grupo, './/pIPI'),
                        valor=extrair_decimal_xml(ipi_grupo, './/nfe:vIPI', namespaces) or extrair_decimal_xml(ipi_grupo, './/vIPI'),
                        cst=extrair_texto_xml(ipi_grupo, './/nfe:CST', namespaces) or extrair_texto_xml(ipi_grupo, './/CST'),
                    )
        
        return item
        
    except Exception as e:
        print(f"Erro ao parsear item XML: {e}")
        return None


def split_sped_line(line: str, min_fields: int = 0) -> List[str]:
    """Faz split de linha SPED preservando campos vazios"""
    line = line.rstrip("\n\r")
    if line and not line.endswith("|"):
        line = line + "|"
    fields = line.split("|")
    if min_fields > 0 and len(fields) < min_fields:
        fields.extend([""] * (min_fields - len(fields)))
    return fields


def parse_efd_c100_to_canonical(efd_path: Path) -> List[DocumentoFiscal]:
    """
    Converte registros C100 do EFD para modelo canônico
    
    Args:
        efd_path: Caminho do arquivo EFD
        
    Returns:
        Lista de DocumentoFiscal normalizados
    """
    documentos: List[DocumentoFiscal] = []
    
    try:
        with efd_path.open("r", encoding="latin1", errors="ignore") as f:
            for line in f:
                if not line.startswith("|C100|"):
                    continue
                
                fs = split_sped_line(line, min_fields=30)
                
                # Criar documento
                doc = DocumentoFiscal(
                    chave_acesso=fs[9] if len(fs) > 9 else None,
                    numero=fs[8] if len(fs) > 8 else None,
                    serie=fs[7] if len(fs) > 7 else None,
                    modelo=fs[5] if len(fs) > 5 else None,
                    tipo_operacao=fs[2] if len(fs) > 2 else None,  # IND_OPER: 0=Entrada, 1=Saída
                    cod_sit=fs[6] if len(fs) > 6 else None,
                    data_emissao=parse_date_efd(fs[10] if len(fs) > 10 else None),
                    data_saida_entrada=parse_date_efd(fs[11] if len(fs) > 11 else None),
                    valor_produtos=parse_decimal(fs[16] if len(fs) > 16 else None),  # VL_MERC
                    valor_frete=parse_decimal(fs[18] if len(fs) > 18 else None),  # VL_FRT
                    valor_seguro=parse_decimal(fs[19] if len(fs) > 19 else None),  # VL_SEG
                    valor_desconto=parse_decimal(fs[14] if len(fs) > 14 else None),  # VL_DESC
                    valor_outros=parse_decimal(fs[20] if len(fs) > 20 else None),  # VL_OUT_DA
                    valor_ipi=parse_decimal(fs[25] if len(fs) > 25 else None),  # VL_IPI
                    valor_icms=parse_decimal(fs[22] if len(fs) > 22 else None),  # VL_ICMS
                    valor_icms_st=parse_decimal(fs[24] if len(fs) > 24 else None),  # VL_ICMS_ST
                    valor_total=parse_decimal(fs[12] if len(fs) > 12 else None),  # VL_DOC
                    referencia_sped=f"C100:{fs[9] if len(fs) > 9 else ''}",
                    metadata={'raw_line': line.strip(), 'cod_part': fs[4] if len(fs) > 4 else None}
                )
                
                # Determinar situação
                cod_sit = fs[6] if len(fs) > 6 else ''
                if cod_sit == '00':
                    doc.situacao = 'Normal'
                elif cod_sit == '02':
                    doc.situacao = 'Cancelada'
                elif cod_sit == '03':
                    doc.situacao = 'Denegada'
                elif cod_sit == '04':
                    doc.situacao = 'Inutilizada'
                else:
                    doc.situacao = 'Desconhecida'
                
                documentos.append(doc)
                
    except Exception as e:
        print(f"Erro ao parsear EFD C100 {efd_path}: {e}")
    
    return documentos


def parse_efd_c170_to_canonical(efd_path: Path, documento_ref: Optional[DocumentoFiscal] = None) -> List[ItemFiscal]:
    """
    Converte registros C170 do EFD para modelo canônico
    
    Args:
        efd_path: Caminho do arquivo EFD
        documento_ref: DocumentoFiscal de referência (para associar itens)
        
    Returns:
        Lista de ItemFiscal normalizados
    """
    itens: List[ItemFiscal] = []
    current_chave: Optional[str] = None
    
    try:
        with efd_path.open("r", encoding="latin1", errors="ignore") as f:
            for line in f:
                # Atualizar referência quando encontrar C100
                if line.startswith("|C100|"):
                    fs = split_sped_line(line, min_fields=10)
                    current_chave = fs[9] if len(fs) > 9 else None
                    continue
                
                if not line.startswith("|C170|"):
                    continue
                
                fs = split_sped_line(line, min_fields=30)
                
                # Criar item
                item = ItemFiscal(
                    numero_item=int(parse_decimal(fs[2] if len(fs) > 2 else None)),  # NUM_ITEM
                    codigo_item=fs[3] if len(fs) > 3 else None,  # COD_ITEM
                    descricao=fs[4] if len(fs) > 4 else None,  # DESCR_COMPL
                    unidade=fs[5] if len(fs) > 5 else None,  # QTD
                    quantidade=parse_decimal(fs[6] if len(fs) > 6 else None),  # QTD
                    valor_unitario=parse_decimal(fs[7] if len(fs) > 7 else None),  # VL_UNIT
                    valor_total=parse_decimal(fs[8] if len(fs) > 8 else None),  # VL_ITEM
                    valor_desconto=parse_decimal(fs[9] if len(fs) > 9 else None),  # VL_DESC
                    cfop=fs[10] if len(fs) > 10 else None,  # CFOP
                    referencia_sped=f"C170:{current_chave}:{fs[2] if len(fs) > 2 else ''}",
                    metadata={'raw_line': line.strip()}
                )
                
                # ICMS
                if len(fs) > 13:
                    item.icms = TributoICMS(
                        base_calculo=parse_decimal(fs[13] if len(fs) > 13 else None),  # VL_BC_ICMS
                        aliquota=parse_decimal(fs[14] if len(fs) > 14 else None),  # ALIQ_ICMS
                        valor=parse_decimal(fs[15] if len(fs) > 15 else None),  # VL_ICMS
                        cst=fs[12] if len(fs) > 12 else None,  # CST_ICMS
                        cfop=item.cfop,
                    )
                
                # ICMS ST
                if len(fs) > 18:
                    item.icms_st = TributoICMSST(
                        base_calculo_st=parse_decimal(fs[16] if len(fs) > 16 else None),  # VL_BC_ICMS_ST
                        aliquota_st=parse_decimal(fs[17] if len(fs) > 17 else None),  # ALIQ_ICMS_ST
                        valor_st=parse_decimal(fs[18] if len(fs) > 18 else None),  # VL_ICMS_ST
                        base_calculo_icms_proprio=item.icms.base_calculo if item.icms else None,
                        valor_icms_proprio=item.icms.valor if item.icms else None,
                        cst=item.icms.cst if item.icms else None,
                        cfop=item.cfop,
                    )
                
                # IPI
                if len(fs) > 22:
                    item.ipi = TributoIPI(
                        base_calculo=parse_decimal(fs[19] if len(fs) > 19 else None),  # VL_BC_IPI
                        aliquota=parse_decimal(fs[20] if len(fs) > 20 else None),  # ALIQ_IPI
                        valor=parse_decimal(fs[21] if len(fs) > 21 else None),  # VL_IPI
                        cst=fs[22] if len(fs) > 22 else None,  # CST_IPI
                    )
                
                itens.append(item)
                
    except Exception as e:
        print(f"Erro ao parsear EFD C170 {efd_path}: {e}")
    
    return itens


