#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai flags operacionais dos XMLs (ST, DIFAL, FCP, Interestadual)
Conforme Precheck: detectar ocorrência operacional dos XMLs
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List
from decimal import Decimal
import xml.etree.ElementTree as ET
from collections import defaultdict

# Namespaces comuns em XMLs NF-e
NAMESPACES = {
    'nfe': 'http://www.portalfiscal.inf.br/nfe',
    '': 'http://www.portalfiscal.inf.br/nfe'
}


def detectar_flags_xml(xml_path: Path) -> Dict[str, Any]:
    """
    Detecta flags operacionais de um XML NF-e
    
    Args:
        xml_path: Caminho do arquivo XML
        
    Returns:
        Dicionário com flags detectadas
    """
    flags = {
        'opera_st': False,
        'opera_difal': False,
        'opera_fcp': False,
        'opera_interestadual': False,
        'uf_emitente': None,
        'uf_destinatario': None,
        'crt': None,
        'evidencias': {
            'st': [],
            'difal': [],
            'fcp': [],
            'interestadual': []
        }
    }
    
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        # Tentar diferentes namespaces
        nfe_ns = None
        for ns in NAMESPACES.values():
            try:
                root.find(f'.//{{{ns}}}emit')
                nfe_ns = ns
                break
            except:
                continue
        
        if not nfe_ns:
            # Tentar sem namespace
            nfe_ns = ''
        
        # Extrair UF do emitente
        emit = root.find(f'.//{{{nfe_ns}}}emit')
        if emit is not None:
            ender_emit = emit.find(f'{{{nfe_ns}}}enderEmit')
            if ender_emit is not None:
                uf_emit = ender_emit.find(f'{{{nfe_ns}}}UF')
                if uf_emit is not None:
                    flags['uf_emitente'] = uf_emit.text
        
        # Extrair CRT (Código de Regime Tributário)
        if emit is not None:
            crt = emit.find(f'{{{nfe_ns}}}CRT')
            if crt is not None:
                flags['crt'] = crt.text
        
        # Extrair UF do destinatário
        dest = root.find(f'.//{{{nfe_ns}}}dest')
        if dest is not None:
            ender_dest = dest.find(f'{{{nfe_ns}}}enderDest')
            if ender_dest is not None:
                uf_dest = ender_dest.find(f'{{{nfe_ns}}}UF')
                if uf_dest is not None:
                    flags['uf_destinatario'] = uf_dest.text
            
            # idDest (1=Operação interna, 2=Operação interestadual, 3=Operação com exterior)
            ide = root.find(f'.//{{{nfe_ns}}}ide')
            if ide is not None:
                id_dest = ide.find(f'{{{nfe_ns}}}idDest')
                if id_dest is not None:
                    id_dest_val = id_dest.text
                    if id_dest_val in ['2', '3']:
                        flags['opera_interestadual'] = True
                        flags['evidencias']['interestadual'].append(f"idDest={id_dest_val}")
        
        # Verificar interestadual por UF
        if flags['uf_emitente'] and flags['uf_destinatario']:
            if flags['uf_emitente'] != flags['uf_destinatario']:
                flags['opera_interestadual'] = True
                flags['evidencias']['interestadual'].append(
                    f"UF emitente ({flags['uf_emitente']}) != UF destinatário ({flags['uf_destinatario']})"
                )
        
        # Varrer itens para detectar ST, DIFAL, FCP
        det = root.find(f'.//{{{nfe_ns}}}det')
        if det is not None:
            for item in root.findall(f'.//{{{nfe_ns}}}det'):
                # ICMS
                imposto = item.find(f'{{{nfe_ns}}}imposto')
                if imposto is not None:
                    icms = imposto.find(f'{{{nfe_ns}}}ICMS')
                    if icms is not None:
                        # Procurar por qualquer tag ICMS* (ICMS00, ICMS10, ICMS60, ICMSST, etc.)
                        for icms_tag in icms:
                            tag_name = icms_tag.tag.replace(f'{{{nfe_ns}}}', '').replace('{http://www.portalfiscal.inf.br/nfe}', '')
                            
                            # ST: ICMSST, ICMS60, ou valores vBCST/vICMSST > 0
                            if 'ICMSST' in tag_name or 'ICMS60' in tag_name:
                                flags['opera_st'] = True
                                flags['evidencias']['st'].append(f"Tag {tag_name} encontrada")
                            
                            # Verificar valores ST
                            v_bcst = icms_tag.find(f'{{{nfe_ns}}}vBCST')
                            v_icmsst = icms_tag.find(f'{{{nfe_ns}}}vICMSST')
                            if v_bcst is not None and v_icmsst is not None:
                                try:
                                    v_bcst_val = Decimal(v_bcst.text or '0')
                                    v_icmsst_val = Decimal(v_icmsst.text or '0')
                                    if v_bcst_val > 0 or v_icmsst_val > 0:
                                        flags['opera_st'] = True
                                        flags['evidencias']['st'].append(
                                            f"vBCST={v_bcst_val}, vICMSST={v_icmsst_val}"
                                        )
                                except:
                                    pass
                            
                            # DIFAL: ICMSUFDest
                            if 'ICMSUFDest' in tag_name:
                                flags['opera_difal'] = True
                                flags['evidencias']['difal'].append("ICMSUFDest encontrado")
                            
                            # FCP: vFCP, vFCPST, vFCPUFDest
                            v_fcp = icms_tag.find(f'{{{nfe_ns}}}vFCP')
                            v_fcpst = icms_tag.find(f'{{{nfe_ns}}}vFCPST')
                            v_fcpufdest = icms_tag.find(f'{{{nfe_ns}}}vFCPUFDest')
                            
                            for fcp_tag, fcp_val in [
                                ('vFCP', v_fcp),
                                ('vFCPST', v_fcpst),
                                ('vFCPUFDest', v_fcpufdest)
                            ]:
                                if fcp_val is not None:
                                    try:
                                        fcp_decimal = Decimal(fcp_val.text or '0')
                                        if fcp_decimal > 0:
                                            flags['opera_fcp'] = True
                                            flags['evidencias']['fcp'].append(f"{fcp_tag}={fcp_decimal}")
                                    except:
                                        pass
                
                # Verificar totais (ICMSTot)
                total = root.find(f'.//{{{nfe_ns}}}total')
                if total is not None:
                    icms_tot = total.find(f'{{{nfe_ns}}}ICMSTot')
                    if icms_tot is not None:
                        # ST nos totais
                        v_bcst_tot = icms_tot.find(f'{{{nfe_ns}}}vBCST')
                        v_icmsst_tot = icms_tot.find(f'{{{nfe_ns}}}vICMSST')
                        if v_bcst_tot is not None or v_icmsst_tot is not None:
                            try:
                                if v_bcst_tot is not None:
                                    v_bcst_val = Decimal(v_bcst_tot.text or '0')
                                    if v_bcst_val > 0:
                                        flags['opera_st'] = True
                                        flags['evidencias']['st'].append(f"Total vBCST={v_bcst_val}")
                                if v_icmsst_tot is not None:
                                    v_icmsst_val = Decimal(v_icmsst_tot.text or '0')
                                    if v_icmsst_val > 0:
                                        flags['opera_st'] = True
                                        flags['evidencias']['st'].append(f"Total vICMSST={v_icmsst_val}")
                            except:
                                pass
                        
                        # DIFAL nos totais
                        v_icmsufdest_tot = icms_tot.find(f'{{{nfe_ns}}}vICMSUFDest')
                        if v_icmsufdest_tot is not None:
                            try:
                                v_difal_val = Decimal(v_icmsufdest_tot.text or '0')
                                if v_difal_val > 0:
                                    flags['opera_difal'] = True
                                    flags['evidencias']['difal'].append(f"Total vICMSUFDest={v_difal_val}")
                            except:
                                pass
                        
                        # FCP nos totais
                        v_fcp_tot = icms_tot.find(f'{{{nfe_ns}}}vFCPUFDest')
                        if v_fcp_tot is not None:
                            try:
                                v_fcp_val = Decimal(v_fcp_tot.text or '0')
                                if v_fcp_val > 0:
                                    flags['opera_fcp'] = True
                                    flags['evidencias']['fcp'].append(f"Total vFCPUFDest={v_fcp_val}")
                            except:
                                pass
    
    except Exception as e:
        # Em caso de erro, retornar flags como False
        return flags
    
    return flags


def detectar_flags_xmls(xml_dir: Path) -> Dict[str, Any]:
    """
    Detecta flags operacionais de todos os XMLs em um diretório
    
    Args:
        xml_dir: Diretório com arquivos XML
        
    Returns:
        Dicionário agregado com flags detectadas
    """
    xml_dir = Path(xml_dir)
    if not xml_dir.exists() or not xml_dir.is_dir():
        return {
            'opera_st': False,
            'opera_difal': False,
            'opera_fcp': False,
            'opera_interestadual': False,
            'total_xmls': 0,
            'xmls_com_st': 0,
            'xmls_com_difal': 0,
            'xmls_com_fcp': 0,
            'xmls_interestaduais': 0,
        }
    
    # Buscar todos os XMLs
    xml_files = list(xml_dir.glob('*.xml')) + list(xml_dir.glob('*.XML'))
    
    flags_agregadas = {
        'opera_st': False,
        'opera_difal': False,
        'opera_fcp': False,
        'opera_interestadual': False,
        'total_xmls': len(xml_files),
        'xmls_com_st': 0,
        'xmls_com_difal': 0,
        'xmls_com_fcp': 0,
        'xmls_interestaduais': 0,
        'crt_detectado': None,  # CRT mais comum
        'ufs_emitentes': set(),
        'ufs_destinatarios': set(),
    }
    
    crt_counter = defaultdict(int)
    
    for xml_file in xml_files:
        flags = detectar_flags_xml(xml_file)
        
        if flags['opera_st']:
            flags_agregadas['xmls_com_st'] += 1
            flags_agregadas['opera_st'] = True
        
        if flags['opera_difal']:
            flags_agregadas['xmls_com_difal'] += 1
            flags_agregadas['opera_difal'] = True
        
        if flags['opera_fcp']:
            flags_agregadas['xmls_com_fcp'] += 1
            flags_agregadas['opera_fcp'] = True
        
        if flags['opera_interestadual']:
            flags_agregadas['xmls_interestaduais'] += 1
            flags_agregadas['opera_interestadual'] = True
        
        if flags['crt']:
            crt_counter[flags['crt']] += 1
        
        if flags['uf_emitente']:
            flags_agregadas['ufs_emitentes'].add(flags['uf_emitente'])
        
        if flags['uf_destinatario']:
            flags_agregadas['ufs_destinatarios'].add(flags['uf_destinatario'])
    
    # CRT mais comum
    if crt_counter:
        flags_agregadas['crt_detectado'] = max(crt_counter.items(), key=lambda x: x[1])[0]
    
    # Converter sets para listas para JSON
    flags_agregadas['ufs_emitentes'] = list(flags_agregadas['ufs_emitentes'])
    flags_agregadas['ufs_destinatarios'] = list(flags_agregadas['ufs_destinatarios'])
    
    return flags_agregadas


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Diretório XML não fornecido'}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    
    xml_dir = Path(sys.argv[1])
    try:
        flags = detectar_flags_xmls(xml_dir)
        print(json.dumps(flags, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

