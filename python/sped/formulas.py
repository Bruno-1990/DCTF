# -*- coding: utf-8 -*-
"""
formulas.py — Validação de fórmulas de cálculo EFD conforme legislação vigente
Valida cálculos de ICMS, ST, DIFAL, IPI, etc. conforme Guia Prático EFD ICMS/IPI
"""

from __future__ import annotations
from typing import Dict, Any, Optional, Tuple, List
from common import TOL, parse_decimal


def validate_icms_base_calculation(xml_item: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida base de cálculo do ICMS:
    vBC = vProd + vFrete + vSeg + vOutro - vDesc
    
    Retorna: (ok, mensagem_erro, divergência)
    """
    vProd = parse_decimal(xml_item.get("vProd")) or 0.0
    vFrete = parse_decimal(xml_item.get("vFrete")) or 0.0
    vSeg = parse_decimal(xml_item.get("vSeg")) or 0.0
    vOutro = parse_decimal(xml_item.get("vOutro")) or 0.0
    vDesc = parse_decimal(xml_item.get("vDesc")) or 0.0
    
    vBC_calculado = vProd + vFrete + vSeg + vOutro - vDesc
    vBC_informado = parse_decimal(xml_item.get("ICMS", {}).get("vBC")) or 0.0
    
    # Se não há ICMS, não precisa validar base
    if vBC_informado == 0 and vBC_calculado == 0:
        return True, None, None
    
    diff = abs(vBC_calculado - vBC_informado)
    if diff > TOL:
        return False, f"Base ICMS divergente: calculado={vBC_calculado:.2f}, informado={vBC_informado:.2f}", diff
    return True, None, None


def validate_icms_value_calculation(xml_item: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida valor do ICMS:
    vICMS = vBC × (pICMS / 100)
    """
    icms = xml_item.get("ICMS", {})
    vBC = parse_decimal(icms.get("vBC")) or 0.0
    pICMS = parse_decimal(icms.get("pICMS")) or 0.0
    vICMS_informado = parse_decimal(icms.get("vICMS")) or 0.0
    
    if vBC == 0 or pICMS == 0:
        # Sem ICMS ou sem base - verificar se está coerente
        if vICMS_informado > TOL:
            return False, f"ICMS informado ({vICMS_informado:.2f}) sem base ou alíquota", vICMS_informado
        return True, None, None
    
    vICMS_calculado = vBC * (pICMS / 100)
    diff = abs(vICMS_calculado - vICMS_informado)
    
    if diff > TOL:
        return False, f"ICMS divergente: calculado={vICMS_calculado:.2f}, informado={vICMS_informado:.2f}", diff
    return True, None, None


def validate_icms_reduction_base(xml_item: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida redução de base de cálculo (CST 020 ou 070):
    vBCRed = vBC × (1 - pRedBC / 100)
    vICMS = vBCRed × (pICMS / 100)
    """
    icms = xml_item.get("ICMS", {})
    cst = str(icms.get("CST") or icms.get("CSOSN") or "").strip()
    
    # CST 020 = redução de base, 070 = redução + ST
    if cst not in ("020", "070"):
        return True, None, None
    
    pRedBC = parse_decimal(icms.get("pRedBC")) or 0.0
    if pRedBC == 0:
        return False, f"CST {cst} exige pRedBC > 0", None
    
    if pRedBC < 0 or pRedBC >= 100:
        return False, f"pRedBC inválido: {pRedBC:.2f}% (deve estar entre 0 e 100)", pRedBC
    
    vBC = parse_decimal(icms.get("vBC")) or 0.0
    if vBC == 0:
        return True, None, None  # Sem base, não há o que validar
    
    vBCRed_calculado = vBC * (1 - pRedBC / 100)
    vBCRed_informado = parse_decimal(icms.get("vBCRed")) or vBC
    
    # Se não informou vBCRed, usar vBC como base (aceitar se estiver próximo)
    if abs(vBCRed_calculado - vBCRed_informado) > TOL and abs(vBCRed_calculado - vBC) > TOL:
        return False, f"Base reduzida divergente: calculado={vBCRed_calculado:.2f}, informado={vBCRed_informado:.2f}", abs(vBCRed_calculado - vBCRed_informado)
    
    # Validar ICMS sobre base reduzida
    pICMS = parse_decimal(icms.get("pICMS")) or 0.0
    base_para_calculo = vBCRed_calculado if abs(vBCRed_calculado - vBCRed_informado) <= TOL else vBCRed_informado
    vICMS_calculado = base_para_calculo * (pICMS / 100)
    vICMS_informado = parse_decimal(icms.get("vICMS")) or 0.0
    
    diff = abs(vICMS_calculado - vICMS_informado)
    if diff > TOL:
        return False, f"ICMS com redução divergente: calculado={vICMS_calculado:.2f}, informado={vICMS_informado:.2f}", diff
    
    return True, None, None


def validate_st_calculation(xml_item: Dict[str, Any], mva_table: Optional[Dict] = None) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida cálculo de Substituição Tributária (ST):
    vBCST = (vProd + vIPI + vFrete + vSeg + vOutro - vDesc) × (1 + pMVAST / 100)
    vICMSST = (vBCST × pICMSST / 100) - vICMS
    """
    icms = xml_item.get("ICMS", {})
    cst = str(icms.get("CST") or icms.get("CSOSN") or "").strip()
    
    # CST 060 = ST retida anteriormente, 070 = redução + ST
    # CSOSN 201/202/203 = ST
    if cst not in ("060", "070", "201", "202", "203"):
        return True, None, None  # Sem ST
    
    vProd = parse_decimal(xml_item.get("vProd")) or 0.0
    vIPI = parse_decimal(xml_item.get("vIPI")) or 0.0
    vFrete = parse_decimal(xml_item.get("vFrete")) or 0.0
    vSeg = parse_decimal(xml_item.get("vSeg")) or 0.0
    vOutro = parse_decimal(xml_item.get("vOutro")) or 0.0
    vDesc = parse_decimal(xml_item.get("vDesc")) or 0.0
    
    # Base ST com MVA (se aplicável)
    pMVAST = parse_decimal(icms.get("pMVAST")) or 0.0
    base_sem_mva = vProd + vIPI + vFrete + vSeg + vOutro - vDesc
    
    if pMVAST > 0:
        vBCST_calculado = base_sem_mva * (1 + pMVAST / 100)
    else:
        vBCST_calculado = base_sem_mva
    
    vBCST_informado = parse_decimal(icms.get("vBCST")) or 0.0
    
    if vBCST_informado == 0 and vBCST_calculado > TOL:
        return False, f"Base ST não informada mas calculada={vBCST_calculado:.2f}", vBCST_calculado
    
    if vBCST_informado > 0:
        diff_bc = abs(vBCST_calculado - vBCST_informado)
        if diff_bc > TOL:
            return False, f"Base ST divergente: calculado={vBCST_calculado:.2f}, informado={vBCST_informado:.2f}", diff_bc
    
    # Validar ICMS ST
    pICMSST = parse_decimal(icms.get("pICMSST")) or 0.0
    vICMS = parse_decimal(icms.get("vICMS")) or 0.0
    
    if pICMSST == 0:
        return True, None, None  # Sem alíquota ST, não há o que validar
    
    vICMSST_calculado = (vBCST_informado * (pICMSST / 100)) - vICMS
    vICMSST_informado = parse_decimal(icms.get("vICMSST")) or 0.0
    
    diff_st = abs(vICMSST_calculado - vICMSST_informado)
    if diff_st > TOL:
        return False, f"ICMS ST divergente: calculado={vICMSST_calculado:.2f}, informado={vICMSST_informado:.2f}", diff_st
    
    return True, None, None


def validate_difal_calculation(xml_item: Dict[str, Any], uf_dest: Optional[str] = None, uf_orig: Optional[str] = None) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida cálculo de DIFAL (Diferencial de Alíquota):
    vBCFCP = vProd + vFrete + vSeg + vOutro - vDesc
    pDIFAL = pICMSInternoDest - pICMSInter
    vDIFAL = vBCFCP × (pDIFAL / 100) × (pPartilha / 100)
    
    Nota: Validação estrutural - verifica se campos existem quando deveriam.
    Cálculo completo requer tabela de alíquotas por UF.
    """
    # Verificar se é operação interestadual B2C
    idDest = str(xml_item.get("idDest") or "").strip()
    indFinal = str(xml_item.get("indFinal") or "").strip()
    
    if idDest != "2" or indFinal != "1":
        return True, None, None  # Não é B2C interestadual
    
    # Se é B2C interestadual, deve ter campos de DIFAL/FCP
    icms = xml_item.get("ICMS", {})
    vFCP = parse_decimal(icms.get("vFCP")) or 0.0
    vICMSUFDest = parse_decimal(icms.get("vICMSUFDest")) or 0.0
    vICMSUFRemet = parse_decimal(icms.get("vICMSUFRemet")) or 0.0
    
    # Validação estrutural: se há valores, devem estar coerentes
    if vFCP > 0 or vICMSUFDest > 0:
        vProd = parse_decimal(xml_item.get("vProd")) or 0.0
        vFrete = parse_decimal(xml_item.get("vFrete")) or 0.0
        vSeg = parse_decimal(xml_item.get("vSeg")) or 0.0
        vOutro = parse_decimal(xml_item.get("vOutro")) or 0.0
        vDesc = parse_decimal(xml_item.get("vDesc")) or 0.0
        
        vBCFCP = vProd + vFrete + vSeg + vOutro - vDesc
        
        if vBCFCP == 0:
            return False, "Base DIFAL/FCP zerada mas há valores informados", None
        
        # Validação básica: valores não podem ser negativos
        if vFCP < 0 or vICMSUFDest < 0 or vICMSUFRemet < 0:
            return False, "Valores DIFAL/FCP não podem ser negativos", None
    
    return True, None, None


def validate_ipi_calculation(xml_item: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Valida cálculo de IPI:
    vBCIPI = vProd + vFrete + vSeg + vOutro - vDesc
    vIPI = vBCIPI × (pIPI / 100)
    """
    ipi = xml_item.get("IPI", {})
    if not ipi:
        return True, None, None  # Sem IPI
    
    vProd = parse_decimal(xml_item.get("vProd")) or 0.0
    vFrete = parse_decimal(xml_item.get("vFrete")) or 0.0
    vSeg = parse_decimal(xml_item.get("vSeg")) or 0.0
    vOutro = parse_decimal(xml_item.get("vOutro")) or 0.0
    vDesc = parse_decimal(xml_item.get("vDesc")) or 0.0
    
    vBCIPI_calculado = vProd + vFrete + vSeg + vOutro - vDesc
    vBCIPI_informado = parse_decimal(ipi.get("vBCIPI")) or vBCIPI_calculado
    
    diff_bc = abs(vBCIPI_calculado - vBCIPI_informado)
    if diff_bc > TOL:
        return False, f"Base IPI divergente: calculado={vBCIPI_calculado:.2f}, informado={vBCIPI_informado:.2f}", diff_bc
    
    pIPI = parse_decimal(ipi.get("pIPI")) or 0.0
    if pIPI == 0:
        # Sem alíquota, verificar se IPI está zerado
        vIPI_informado = parse_decimal(xml_item.get("vIPI")) or 0.0
        if vIPI_informado > TOL:
            return False, f"IPI informado ({vIPI_informado:.2f}) sem alíquota", vIPI_informado
        return True, None, None
    
    vIPI_calculado = vBCIPI_calculado * (pIPI / 100)
    vIPI_informado = parse_decimal(xml_item.get("vIPI")) or 0.0
    
    diff = abs(vIPI_calculado - vIPI_informado)
    if diff > TOL:
        return False, f"IPI divergente: calculado={vIPI_calculado:.2f}, informado={vIPI_informado:.2f}", diff
    
    return True, None, None


def validate_desoneration(xml_item: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Valida desoneração (CST 040/041/050):
    Deve ter vICMSDeson > 0 OU motDesICMS preenchido
    """
    icms = xml_item.get("ICMS", {})
    cst = str(icms.get("CST") or icms.get("CSOSN") or "").strip()
    
    if cst not in ("040", "041", "050"):
        return True, None
    
    vICMSDeson = parse_decimal(icms.get("vICMSDeson")) or 0.0
    motDesICMS = icms.get("motDesICMS")
    
    if vICMSDeson == 0 and not motDesICMS:
        return False, f"CST {cst} exige vICMSDeson > 0 ou motDesICMS preenchido"
    
    # Se há desoneração, ICMS deve ser zero
    vICMS = parse_decimal(icms.get("vICMS")) or 0.0
    if vICMS > TOL:
        return False, f"CST {cst} com desoneração mas vICMS={vICMS:.2f} (deveria ser zero)"
    
    return True, None


def validate_all_formulas_for_item(xml_item: Dict[str, Any], uf_dest: Optional[str] = None, uf_orig: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Valida todas as fórmulas para um item XML.
    Retorna lista de erros encontrados.
    """
    issues = []
    
    # Validar base ICMS
    ok, msg, diff = validate_icms_base_calculation(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Fórmula Base ICMS",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar valor ICMS
    ok, msg, diff = validate_icms_value_calculation(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Fórmula ICMS",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar redução de base
    ok, msg, diff = validate_icms_reduction_base(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Fórmula Redução Base",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar ST
    ok, msg, diff = validate_st_calculation(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Fórmula ST",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar DIFAL
    ok, msg, diff = validate_difal_calculation(xml_item, uf_dest, uf_orig)
    if not ok:
        issues.append({
            "Tipo": "Fórmula DIFAL",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar IPI
    ok, msg, diff = validate_ipi_calculation(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Fórmula IPI",
            "Erro": msg,
            "Divergência": diff
        })
    
    # Validar desoneração
    ok, msg = validate_desoneration(xml_item)
    if not ok:
        issues.append({
            "Tipo": "Desoneração",
            "Erro": msg,
            "Divergência": None
        })
    
    return issues

