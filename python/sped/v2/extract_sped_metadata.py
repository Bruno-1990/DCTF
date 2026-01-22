#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai metadados do arquivo SPED para preencher automaticamente o perfil fiscal.
Usa análise ROBUSTA baseada na v1.0:
- CFOP + CST nos C170/C190
- Observações 0450/0460
- Ajustes E111/E200/E210
- Chaves NF-e (UF)
"""

import sys
import json
import re
from pathlib import Path
from typing import Dict, Optional, Any, Set
from datetime import datetime
from collections import Counter

def split_sped_line(line: str, min_fields: int = 0) -> list:
    """
    Split de linha SPED preservando campos vazios (lógica da v1.0).
    || representa campo vazio, e é CRÍTICO preservar isso.
    """
    line = line.rstrip("\n\r")
    if line and not line.endswith("|"):
        line = line + "|"
    fields = line.split("|")
    if min_fields > 0 and len(fields) < min_fields:
        fields.extend([""] * (min_fields - len(fields)))
    return fields

def extract_sped_metadata(sped_content: str) -> Dict[str, Any]:
    """
    Extrai metadados do SPED com análise ROBUSTA (lógica v1.0):
    - CNPJ, Razão Social, Competência, Regime (registro 0000)
    - CFOPs, CSTs (C170, C190)
    - Observações 0450/0460 (palavras-chave ST/DIFAL)
    - Ajustes E111 (ST/DIFAL)
    - Blocos E200/E210 (apuração por UF)
    - Chaves NF-e C100 (UF interestadual)
    """
    metadata = {
        'cnpj': None,
        'razao_social': None,
        'competencia': None,
        'uf': None,  # NOVO: UF do estabelecimento
        'regime_tributario': None,
        'ind_perfil': None,  # NOVO: IND_PERFIL (A/B/C)
        'ind_ativ': None,  # NOVO: IND_ATIV (0/1/2)
        'opera_st': False,
        'opera_difal': False,
        'opera_fcp': False,
        'opera_interestadual': False,
        'segmento': None,
        'fonte_segmento': None,  # NOVO: 'IND_ATIV' ou 'CFOP'
        'stats': {
            'total_registros': 0,
            'total_c100': 0,
            'total_c170': 0,
            'cfops': [],
            'ncms_top_10': [],
        }
    }
    
    lines = sped_content.split('\n')
    metadata['stats']['total_registros'] = len(lines)
    
    cfops_set: Set[str] = set()
    ncms_set: Set[str] = set()
    csts_set: Set[str] = set()
    c100_count = 0
    c170_count = 0
    ufs_nfe: Set[str] = set()  # UFs das NF-e
    
    # Flags operacionais (detectadas por múltiplas evidências)
    has_st = False
    has_difal = False
    has_fcp = False
    has_interestadual = False
    has_regime_especial = False
    
    # ========== REGISTRO 0000 ==========
    for line in lines:
        if not line.strip():
            continue
            
        if line.startswith('|0000|'):
            fs = split_sped_line(line, min_fields=16)  # Aumentado para 16 para incluir IND_ATIV
            
            # DT_INI (posição 4 após split) - formato DDMMAAAA
            dt_ini = None
            if len(fs) > 4:
                competencia_str = fs[4].strip()
                if competencia_str and len(competencia_str) == 8:
                    try:
                        mes = competencia_str[2:4]
                        ano = competencia_str[4:8]
                        metadata['competencia'] = f"{ano}-{mes}"
                        dt_ini = competencia_str
                    except:
                        pass
            
            # DT_FIN (posição 5 após split) - validar se está no mesmo mês
            if len(fs) > 5:
                dt_fin = fs[5].strip()
                if dt_fin and len(dt_fin) == 8 and dt_ini:
                    # Validar se DT_FIN está no mesmo mês de DT_INI
                    mes_ini = dt_ini[2:4]
                    mes_fin = dt_fin[2:4]
                    if mes_ini != mes_fin:
                        # Aviso: competência pode estar incorreta
                        metadata['aviso_competencia'] = f"DT_INI ({dt_ini}) e DT_FIN ({dt_fin}) em meses diferentes"
            
            # Razão Social (posição 6 após split)
            if len(fs) > 6:
                razao_social = fs[6].strip()
                if razao_social:
                    metadata['razao_social'] = razao_social
            
            # CNPJ (posição 7 após split - campo CNPJ/CPF)
            if len(fs) > 7:
                cnpj = re.sub(r'\D', '', fs[7].strip())
                if cnpj and len(cnpj) == 14:
                    metadata['cnpj'] = cnpj
            
            # UF (posição 8 após split) - NOVO conforme Precheck
            if len(fs) > 8:
                uf = fs[8].strip()
                if uf and len(uf) == 2:
                    metadata['uf'] = uf
            
            # IND_PERFIL (posição 14 após split) - A/B/C
            # NOVO: Armazenar valor original além de converter para regime
            if len(fs) > 14:
                ind_perfil = fs[14].strip()
                if ind_perfil:
                    metadata['ind_perfil'] = ind_perfil.upper()  # A, B ou C
                    # Converter para regime tributário (compatibilidade)
                    # Nota: IND_PERFIL não é exatamente regime, mas vamos manter compatibilidade
                    if ind_perfil in ['1', '2']:
                        metadata['regime_tributario'] = 'SIMPLES_NACIONAL'
                    elif ind_perfil == '3':
                        metadata['regime_tributario'] = 'LUCRO_PRESUMIDO'
            
            # IND_ATIV (posição 15 após split) - NOVO conforme Precheck
            # 0=Industrial, 1=Outros (comércio/serviços), 2=Outros
            if len(fs) > 15:
                ind_ativ = fs[15].strip()
                if ind_ativ:
                    metadata['ind_ativ'] = ind_ativ
            
            break  # Parar após encontrar 0000
    
    # ========== ANÁLISE ROBUSTA: C100, C170, C190, 0450, 0460, E111, E200, E210 ==========
    for line in lines:
        if not line.strip():
            continue
        
        # === C100: Chaves NF-e (detectar UF para interestadual) ===
        if line.startswith('|C100|'):
            c100_count += 1
            fs = split_sped_line(line, min_fields=10)
            
            # CHV_NFE na posição 9 (após split)
            if len(fs) > 9:
                chave_nfe = fs[9].strip()
                if chave_nfe and len(chave_nfe) >= 2:
                    uf_codigo = chave_nfe[:2]
                    ufs_nfe.add(uf_codigo)
        
        # === C170: Itens (CFOP, NCM, CST) ===
        elif line.startswith('|C170|'):
            c170_count += 1
            fs = split_sped_line(line, min_fields=10)
            
            # CFOP na posição 4 (após split)
            if len(fs) > 4:
                cfop = fs[4].strip()
                if cfop and len(cfop) == 4 and cfop.isdigit():
                    cfops_set.add(cfop)
                    # CFOP 6xxx = interestadual
                    if cfop.startswith('6'):
                        has_interestadual = True
            
            # NCM na posição 5 (após split)
            if len(fs) > 5:
                ncm = fs[5].strip()
                if ncm and len(ncm) >= 4:
                    ncms_set.add(ncm)
            
            # CST/CSOSN na posição 6 (após split)
            if len(fs) > 6:
                cst = fs[6].strip()
                if cst:
                    cst_normalizado = cst.zfill(3) if len(cst) <= 3 else cst[:3]
                    csts_set.add(cst_normalizado)
                    # CST 060 = ST
                    if cst_normalizado == '060' or cst == '60':
                        has_st = True
        
        # === C190: Totais por CST/CFOP ===
        elif line.startswith('|C190|'):
            fs = split_sped_line(line, min_fields=13)
            
            # CST na posição 2, CFOP na posição 3 (após split)
            if len(fs) > 2:
                cst = fs[2].strip()
                if cst:
                    cst_normalizado = cst.zfill(3) if len(cst) <= 3 else cst[:3]
                    csts_set.add(cst_normalizado)
                    if cst_normalizado == '060' or cst == '60':
                        has_st = True
            
            if len(fs) > 3:
                cfop = fs[3].strip()
                if cfop and len(cfop) == 4 and cfop.isdigit():
                    cfops_set.add(cfop)
                    if cfop.startswith('6'):
                        has_interestadual = True
        
        # === 0450/0460: Observações (palavras-chave ST/DIFAL/FCP/Regime Especial) ===
        elif line.startswith('|0450|') or line.startswith('|0460|'):
            line_upper = line.upper()
            # ST
            if any(kw in line_upper for kw in [
                'SUBSTITUIÇÃO TRIBUTÁRIA', 'SUBSTITUICAO TRIBUTARIA',
                'ICMS ST', 'ICMS RETIDO', 'IMPOSTO RETIDO', 'SUB. TRIBUTÁRIA'
            ]):
                has_st = True
            # DIFAL
            if any(kw in line_upper for kw in [
                'DIFERENCIAL DE ALÍQUOTA', 'DIFERENCIAL DE ALIQUOTA',
                'DIFAL', 'DIF. DE ALIQUOTA', 'DIFERENCIAL ALÍQUOTA'
            ]):
                has_difal = True
            # FCP
            if any(kw in line_upper for kw in ['FCP', 'FECP', 'FUNDO.*COMBAT', 'FUNDO.*POBREZA']):
                has_fcp = True
            # Regime Especial
            if any(kw in line_upper for kw in [
                'BASE.*REDUZIDA', 'BASE.*CÁLCULO.*REDUZIDA', 'REDUÇÃO.*BASE',
                'REGIME ESPECIAL', 'TARE', 'ART.*534', 'BENEFÍCIO', 'BENEFICIO'
            ]):
                has_regime_especial = True
        
        # === E111: Ajustes (ST/DIFAL/Regime Especial) ===
        elif line.startswith('|E111|'):
            line_upper = line.upper()
            # ST
            if any(kw in line_upper for kw in [
                'RESSARCIMENTO ST', 'SUBSTITUIÇÃO TRIBUTÁRIA', 'SUBSTITUICAO TRIBUTARIA',
                'ESTORNO.*ST', 'CRÉDITO.*ST', 'CREDITO.*ST'
            ]):
                has_st = True
            # DIFAL
            if any(kw in line_upper for kw in [
                'DIFERENCIAL', 'DIFAL', 'DIF.*ALÍQUOTA', 'DIF.*ALIQUOTA'
            ]):
                has_difal = True
            # Regime Especial
            if any(kw in line_upper for kw in [
                'BASE REDUZIDA', 'CRÉDITO.*BASE.*REDUZIDA', 'ESTORNO.*ART',
                'BENEFÍCIO', 'BENEFICIO', 'REDUÇÃO', 'REDUCAO'
            ]):
                has_regime_especial = True
        
        # === E200/E210: Apuração por UF (interestadual) ===
        elif line.startswith('|E200|'):
            has_interestadual = True
        elif line.startswith('|E210|'):
            has_interestadual = True
    
    # Verificar UFs múltiplas nas chaves NF-e (interestadual)
    if len(ufs_nfe) > 1:
        has_interestadual = True
    
    # Preencher estatísticas
    metadata['stats']['total_c100'] = c100_count
    metadata['stats']['total_c170'] = c170_count
    metadata['stats']['cfops'] = sorted(list(cfops_set))[:10]
    metadata['stats']['ncms_top_10'] = sorted(list(ncms_set))[:10]
    
    # Flags operacionais
    metadata['opera_st'] = has_st
    metadata['opera_difal'] = has_difal
    metadata['opera_fcp'] = has_fcp
    metadata['opera_interestadual'] = has_interestadual
    
    # ========== INFERIR REGIME TRIBUTÁRIO SE NÃO FOI DETECTADO ==========
    # Se o campo IND_PERFIL (posição 14) estava vazio, inferir pelo comportamento fiscal
    if not metadata['regime_tributario']:
        # Empresas do Simples Nacional NÃO podem ter ST próprio nem DIFAL (exceto raras exceções)
        # Se tem ST ou DIFAL, muito provavelmente é Lucro Presumido ou Real
        if has_st or has_difal:
            metadata['regime_tributario'] = 'LUCRO_PRESUMIDO'  # Default mais comum
        # Se não tem nada específico, deixar como null para o usuário preencher
        # (não assumir Simples Nacional sem evidência)
    
    # ========== INFERIR SEGMENTO (prioridade: IND_ATIV > CFOPs) ==========
    # NOVO conforme Precheck: Mapear IND_ATIV primeiro
    if metadata.get('ind_ativ') is not None:
        ind_ativ = metadata['ind_ativ']
        # Mapeamento conforme Precheck: 0=Industrial, 1=Outros (comércio/serviços), 2=Outros
        if ind_ativ == '0':
            metadata['segmento'] = 'INDUSTRIA'
            metadata['fonte_segmento'] = 'IND_ATIV'
        elif ind_ativ in ['1', '2']:
            metadata['segmento'] = 'COMERCIO'  # Outros = comércio/serviços
            metadata['fonte_segmento'] = 'IND_ATIV'
    
    # Se IND_ATIV não foi encontrado ou não mapeou, usar inferência por CFOPs
    if not metadata.get('segmento') and cfops_set:
        # Contar ocorrências de CFOPs por categoria
        cfops_industria = {'1101', '1102', '1201', '1202', '1401', '1402', 
                          '1901', '2101', '2102', '2201', '2202', '2401', '2402',
                          '2901', '5901', '5902', '6901', '6902'}
        cfops_bebidas_st = {'5405', '6403'}  # CFOPs específicos de bebidas com ST
        cfops_ecommerce = {'6101', '6102', '6103', '6104', '6105', '6106', '6107', '6108',
                          '6401', '6402', '6403', '6404'}  # CFOPs interestaduais (e-commerce)
        cfops_comercio = {'5101', '5102', '5103', '5104', '5105', '5106', '5109', '5110',
                         '5401', '5402', '5403', '5405'}  # CFOPs de comércio interno
        
        # Verificar NCMs de bebidas (CESTs críticos)
        ncms_bebidas = {'22021000', '22029900', '22030000'}  # NCMs típicos de bebidas
        has_ncm_bebidas = bool(ncms_set & set(ncms_bebidas))
        
        # Contar CFOPs por categoria
        count_industria = len(cfops_set & cfops_industria)
        count_bebidas_st = len(cfops_set & cfops_bebidas_st)
        count_ecommerce = len(cfops_set & cfops_ecommerce)
        count_comercio = len(cfops_set & cfops_comercio)
        
        # Prioridade 1: Indústria (CFOPs de industrialização são muito específicos)
        if count_industria > 0:
            metadata['segmento'] = 'INDUSTRIA'
            metadata['fonte_segmento'] = 'CFOP'
        # Prioridade 2: Bebidas (CFOPs específicos de ST + NCMs de bebidas)
        elif (count_bebidas_st > 0 and has_st) or has_ncm_bebidas:
            metadata['segmento'] = 'BEBIDAS'
            metadata['fonte_segmento'] = 'CFOP'
        # Prioridade 3: E-commerce (predominância de CFOPs interestaduais + DIFAL)
        elif count_ecommerce > count_comercio and (has_difal or has_interestadual):
            metadata['segmento'] = 'ECOMMERCE'
            metadata['fonte_segmento'] = 'CFOP'
        # Prioridade 4: Comércio (CFOPs de venda predominantes)
        elif count_comercio > 0 or len([c for c in cfops_set if c.startswith('5') or c.startswith('6')]) > len(cfops_set) * 0.5:
            metadata['segmento'] = 'COMERCIO'
            metadata['fonte_segmento'] = 'CFOP'
        else:
            # Default: Comércio (maioria dos casos)
            metadata['segmento'] = 'COMERCIO'
            metadata['fonte_segmento'] = 'DEFAULT'
    
    # Se tem regime especial detectado, adicionar ao metadata (para UI)
    if has_regime_especial:
        metadata['regime_especial'] = True
    
    return metadata


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Arquivo SPED não fornecido'}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    
    sped_file = sys.argv[1]
    try:
        # Tentar diferentes encodings (lógica v1.0)
        content = None
        encodings = ['latin1', 'windows-1252', 'cp1252', 'utf-8']
        
        for encoding in encodings:
            try:
                with open(sped_file, 'r', encoding=encoding, errors='ignore') as f:
                    content = f.read()
                break
            except (UnicodeDecodeError, LookupError):
                continue
        
        if content is None:
            raise ValueError('Não foi possível decodificar o arquivo SPED')
        
        metadata = extract_sped_metadata(content)
        
        # Debug logs (stderr não interfere com JSON stdout)
        sys.stderr.write(f"\n{'='*80}\n")
        sys.stderr.write(f"[DEBUG] ✅ Arquivo processado. Linhas: {len(content.split(chr(10)))}\n")
        sys.stderr.write(f"[DEBUG] 🏢 Razão Social: {metadata.get('razao_social')}\n")
        sys.stderr.write(f"[DEBUG] 📋 CNPJ: {metadata.get('cnpj')}\n")
        sys.stderr.write(f"[DEBUG] 📅 Competência: {metadata.get('competencia')}\n")
        sys.stderr.write(f"[DEBUG] 💰 Regime: {metadata.get('regime_tributario')} {'(inferido por ST/DIFAL)' if not metadata.get('regime_tributario') and (metadata.get('opera_st') or metadata.get('opera_difal')) else '(do SPED)' if metadata.get('regime_tributario') else '(não detectado)'}\n")
        sys.stderr.write(f"[DEBUG] 🏭 Segmento: {metadata.get('segmento')}\n")
        sys.stderr.write(f"[DEBUG] 📊 Total C100: {metadata.get('stats', {}).get('total_c100', 0)}\n")
        sys.stderr.write(f"[DEBUG] 📊 Total C170: {metadata.get('stats', {}).get('total_c170', 0)}\n")
        sys.stderr.write(f"[DEBUG] 🔢 CFOPs: {len(metadata.get('stats', {}).get('cfops', []))} encontrados\n")
        sys.stderr.write(f"[DEBUG] ✅ ST: {metadata.get('opera_st')}\n")
        sys.stderr.write(f"[DEBUG] ✅ DIFAL: {metadata.get('opera_difal')}\n")
        sys.stderr.write(f"[DEBUG] ✅ FCP: {metadata.get('opera_fcp')}\n")
        sys.stderr.write(f"[DEBUG] ✅ Interestadual: {metadata.get('opera_interestadual')}\n")
        sys.stderr.write(f"{'='*80}\n\n")
        sys.stderr.flush()
        
        print(json.dumps(metadata, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(f"[ERROR] ❌ {str(e)}\n")
        sys.stderr.flush()
        print(json.dumps({'error': str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
