"""
Parsers adicionais para cruzamentos robustos conforme legislação EFD-ICMS/IPI
Implementa parse completo de C176, C195/C197 melhorado, e número de linha do SPED
"""
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import logging

from parsers import split_sped_line, parse_decimal


def parse_efd_c176_por_chave(file_path: Path) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    """
    Parseia C176 por chave NF-e e item.
    C176: Ressarcimento de ICMS e FCP em operações com ST.
    
    Layout oficial C176 (posições):
    REG(1), COD_MOD_ULT_E(2), NUM_DOC_ULT_E(3), SER_ULT_E(4), DT_ULT_E(5),
    COD_PART_ULT_E(6), QUANT_ULT_E(7), VL_UNIT_ULT_E(8), VL_UNIT_BC_ST(9),
    CHAVE_NFE_ULT_E(10), NUM_ITEM_ULT_E(11), VL_UNIT_BC_ICMS_ULT_E(12),
    ALIQ_ICMS_ULT_E(13), VL_UNIT_LIMITE_BC_ICMS_ULT_E(14), VL_UNIT_ICMS_ULT_E(15),
    ALIQ_ST_ULT_E(16), VL_UNIT_RES(17), COD_RESP_RET(18), COD_MOT_RES(19),
    CHAVE_NFE_RET(20), COD_PART_NFE_RET(21), SER_NFE_RET(22), NUM_NFE_RET(23),
    ITEM_NFE_RET(24), COD_DA(25), NUM_DA(26), VL_UNIT_RES_FCP_ST(27)
    
    Retorna: {chave_nf: {num_item: {...dados C176...}}}
    """
    c176_por_chave: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    current_key: Optional[str] = None
    current_num_item: Optional[str] = None
    
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith("|C100|"):
                    fs = split_sped_line(ln, min_fields=10)
                    if len(fs) >= 10:
                        current_key = (fs[9] or "").strip() or None
                        current_num_item = None
                
                elif ln.startswith("|C170|") and current_key:
                    # Atualizar num_item atual quando encontrar C170
                    fs = split_sped_line(ln, min_fields=21)
                    if len(fs) >= 3:
                        current_num_item = (fs[2] or "").strip()
                
                elif ln.startswith("|C176|") and current_key and current_num_item:
                    fs = split_sped_line(ln, min_fields=28)
                    if len(fs) < 28:
                        continue
                    
                    if current_key not in c176_por_chave:
                        c176_por_chave[current_key] = {}
                    
                    if current_num_item not in c176_por_chave[current_key]:
                        c176_por_chave[current_key][current_num_item] = []
                    
                    c176_por_chave[current_key][current_num_item].append({
                        "COD_MOD_ULT_E": (fs[2] or "").strip(),
                        "NUM_DOC_ULT_E": (fs[3] or "").strip(),
                        "SER_ULT_E": (fs[4] or "").strip(),
                        "DT_ULT_E": (fs[5] or "").strip(),
                        "COD_PART_ULT_E": (fs[6] or "").strip(),
                        "QUANT_ULT_E": parse_decimal(fs[7] or "0") or 0.0,
                        "VL_UNIT_ULT_E": parse_decimal(fs[8] or "0") or 0.0,
                        "VL_UNIT_BC_ST": parse_decimal(fs[9] or "0") or 0.0,
                        "CHAVE_NFE_ULT_E": (fs[10] or "").strip() if len(fs) > 10 else "",
                        "NUM_ITEM_ULT_E": (fs[11] or "").strip() if len(fs) > 11 else "",
                        "VL_UNIT_BC_ICMS_ULT_E": parse_decimal(fs[12] or "0") or 0.0 if len(fs) > 12 else 0.0,
                        "ALIQ_ICMS_ULT_E": parse_decimal(fs[13] or "0") or 0.0 if len(fs) > 13 else 0.0,
                        "VL_UNIT_LIMITE_BC_ICMS_ULT_E": parse_decimal(fs[14] or "0") or 0.0 if len(fs) > 14 else 0.0,
                        "VL_UNIT_ICMS_ULT_E": parse_decimal(fs[15] or "0") or 0.0 if len(fs) > 15 else 0.0,
                        "ALIQ_ST_ULT_E": parse_decimal(fs[16] or "0") or 0.0 if len(fs) > 16 else 0.0,
                        "VL_UNIT_RES": parse_decimal(fs[17] or "0") or 0.0 if len(fs) > 17 else 0.0,
                        "COD_RESP_RET": (fs[18] or "").strip() if len(fs) > 18 else "",
                        "COD_MOT_RES": (fs[19] or "").strip() if len(fs) > 19 else "",
                        "CHAVE_NFE_RET": (fs[20] or "").strip() if len(fs) > 20 else "",
                        "COD_PART_NFE_RET": (fs[21] or "").strip() if len(fs) > 21 else "",
                        "SER_NFE_RET": (fs[22] or "").strip() if len(fs) > 22 else "",
                        "NUM_NFE_RET": (fs[23] or "").strip() if len(fs) > 23 else "",
                        "ITEM_NFE_RET": (fs[24] or "").strip() if len(fs) > 24 else "",
                        "COD_DA": (fs[25] or "").strip() if len(fs) > 25 else "",
                        "NUM_DA": (fs[26] or "").strip() if len(fs) > 26 else "",
                        "VL_UNIT_RES_FCP_ST": parse_decimal(fs[27] or "0") or 0.0 if len(fs) > 27 else 0.0,
                    })
    except Exception as e:
        logging.warning(f"Erro ao parsear C176: {e}")
    
    return c176_por_chave


def parse_efd_c170_com_linha(file_path: Path) -> Dict[str, List[Dict[str, Any]]]:
    """
    Parseia C170 incluindo número da linha no arquivo SPED.
    Útil para instruções precisas: "Corrigir linha 1234 do SPED"
    
    Retorna: {chave_nf: [{"NUM_ITEM": ..., "LINHA_SPED": ..., ...}]}
    """
    c170_por_chave: Dict[str, List[Dict[str, Any]]] = {}
    current_key: Optional[str] = None
    linha_num = 0
    
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                linha_num += 1
                
                if ln.startswith("|C100|"):
                    fs = split_sped_line(ln, min_fields=10)
                    if len(fs) >= 10:
                        current_key = (fs[9] or "").strip() or None
                
                elif ln.startswith("|C170|") and current_key:
                    fs = split_sped_line(ln, min_fields=21)
                    if len(fs) < 21:
                        continue
                    
                    if current_key not in c170_por_chave:
                        c170_por_chave[current_key] = []
                    
                    c170_por_chave[current_key].append({
                        "NUM_ITEM": (fs[2] or "").strip(),
                        "COD_ITEM": (fs[3] or "").strip(),
                        "DESCR_COMPL": (fs[4] or "").strip(),
                        "QTD": parse_decimal(fs[5] or "0") or 0.0,
                        "UNID": (fs[6] or "").strip(),
                        "VL_ITEM": parse_decimal(fs[7] or "0") or 0.0,
                        "VL_DESC": parse_decimal(fs[8] or "0") or 0.0,
                        "VL_ACMO": parse_decimal(fs[9] or "0") or 0.0,
                        "CST": (fs[10] or "").strip(),
                        "CFOP": (fs[11] or "").strip(),
                        "VL_BC_ICMS": parse_decimal(fs[12] or "0") or 0.0,
                        "ALIQ_ICMS": parse_decimal(fs[13] or "0") or 0.0,
                        "VL_ICMS": parse_decimal(fs[14] or "0") or 0.0,
                        "VL_BC_ICMS_ST": parse_decimal(fs[15] or "0") or 0.0,
                        "ALIQ_ST": parse_decimal(fs[16] or "0") or 0.0,
                        "VL_ICMS_ST": parse_decimal(fs[17] or "0") or 0.0,
                        "VL_IPI": parse_decimal(fs[18] or "0") or 0.0,
                        "VL_BC_IPI": parse_decimal(fs[19] or "0") or 0.0,
                        "ALIQ_IPI": parse_decimal(fs[20] or "0") or 0.0,
                        "LINHA_SPED": linha_num,  # NOVO: número da linha no arquivo
                    })
    except Exception as e:
        logging.warning(f"Erro ao parsear C170 com linha: {e}")
    
    return c170_por_chave


def parse_efd_c100_c190_c170_com_linha(file_path: Path) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
    """
    Parseia C100, C190 e C170 incluindo número de linha.
    Retorna: (c100_map, c190_map, c170_map) todos com LINHA_SPED
    """
    c100_map: Dict[str, Dict[str, Any]] = {}
    c190_map: Dict[str, Dict[str, Any]] = {}
    c170_map: Dict[str, List[Dict[str, Any]]] = {}
    
    current_key: Optional[str] = None
    linha_num = 0
    
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                linha_num += 1
                
                if ln.startswith("|C100|"):
                    fs = split_sped_line(ln, min_fields=30)
                    if len(fs) >= 10:
                        current_key = (fs[9] or "").strip() or None
                        if current_key:
                            c100_map[current_key] = {
                                "IND_OPER": fs[2],
                                "IND_EMIT": fs[3],
                                "COD_PART": fs[4],
                                "COD_MOD": fs[5],
                                "COD_SIT": fs[6],
                                "SER": fs[7],
                                "NUM_DOC": fs[8],
                                "CHV_NFE": current_key,
                                "DT_DOC": fs[10] if len(fs) > 10 else "",
                                "VL_BC_ICMS": parse_decimal(fs[21] or "0") or 0.0 if len(fs) > 21 else 0.0,
                                "VL_ICMS": parse_decimal(fs[22] or "0") or 0.0 if len(fs) > 22 else 0.0,
                                "VL_BC_ICMS_ST": parse_decimal(fs[23] or "0") or 0.0 if len(fs) > 23 else 0.0,
                                "VL_ICMS_ST": parse_decimal(fs[24] or "0") or 0.0 if len(fs) > 24 else 0.0,
                                "VL_IPI": parse_decimal(fs[25] or "0") or 0.0 if len(fs) > 25 else 0.0,
                                "LINHA_SPED": linha_num,
                            }
                
                elif ln.startswith("|C190|") and current_key:
                    fs = split_sped_line(ln, min_fields=13)
                    if len(fs) >= 13:
                        cfop = (fs[3] or "").strip()
                        cst = (fs[4] or "").strip()
                        chave_c190 = f"{current_key}_{cfop}_{cst}"
                        
                        c190_map[chave_c190] = {
                            "CHAVE": current_key,
                            "CFOP": cfop,
                            "CST": cst,
                            "VL_OPR": parse_decimal(fs[5] or "0") or 0.0,
                            "VL_BC_ICMS": parse_decimal(fs[6] or "0") or 0.0,
                            "VL_ICMS": parse_decimal(fs[7] or "0") or 0.0,
                            "VL_BC_ICMS_ST": parse_decimal(fs[8] or "0") or 0.0,
                            "VL_ICMS_ST": parse_decimal(fs[9] or "0") or 0.0,
                            "VL_IPI": parse_decimal(fs[10] or "0") or 0.0,
                            "LINHA_SPED": linha_num,
                        }
                
                elif ln.startswith("|C170|") and current_key:
                    fs = split_sped_line(ln, min_fields=21)
                    if len(fs) < 21:
                        continue
                    
                    if current_key not in c170_map:
                        c170_map[current_key] = []
                    
                    c170_map[current_key].append({
                        "NUM_ITEM": (fs[2] or "").strip(),
                        "COD_ITEM": (fs[3] or "").strip(),
                        "DESCR_COMPL": (fs[4] or "").strip(),
                        "QTD": parse_decimal(fs[5] or "0") or 0.0,
                        "UNID": (fs[6] or "").strip(),
                        "VL_ITEM": parse_decimal(fs[7] or "0") or 0.0,
                        "VL_DESC": parse_decimal(fs[8] or "0") or 0.0,
                        "VL_ACMO": parse_decimal(fs[9] or "0") or 0.0,
                        "CST": (fs[10] or "").strip(),
                        "CFOP": (fs[11] or "").strip(),
                        "VL_BC_ICMS": parse_decimal(fs[12] or "0") or 0.0,
                        "ALIQ_ICMS": parse_decimal(fs[13] or "0") or 0.0,
                        "VL_ICMS": parse_decimal(fs[14] or "0") or 0.0,
                        "VL_BC_ICMS_ST": parse_decimal(fs[15] or "0") or 0.0,
                        "ALIQ_ST": parse_decimal(fs[16] or "0") or 0.0,
                        "VL_ICMS_ST": parse_decimal(fs[17] or "0") or 0.0,
                        "VL_IPI": parse_decimal(fs[18] or "0") or 0.0,
                        "VL_BC_IPI": parse_decimal(fs[19] or "0") or 0.0,
                        "ALIQ_IPI": parse_decimal(fs[20] or "0") or 0.0,
                        "LINHA_SPED": linha_num,
                    })
    except Exception as e:
        logging.warning(f"Erro ao parsear C100/C190/C170 com linha: {e}")
    
    return c100_map, c190_map, c170_map


def validar_sequencia_registros(chave: str, efd_txt: Path) -> Dict[str, Any]:
    """
    Valida se registros estão na ordem correta conforme legislação:
    - C100 deve vir antes de C170
    - C170 deve vir antes de C190
    - C176 deve vir após C170 correspondente
    
    Retorna: {
        "sequencia_valida": bool,
        "erros_sequencia": List[str],
        "ordem_registros": List[Tuple[str, int]]  # (tipo_registro, linha)
    }
    """
    resultado = {
        "sequencia_valida": True,
        "erros_sequencia": [],
        "ordem_registros": []
    }
    
    try:
        ordem: List[Tuple[str, int, Optional[str]]] = []  # (tipo, linha, chave/item)
        linha_num = 0
        current_key: Optional[str] = None
        current_item: Optional[str] = None
        
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                linha_num += 1
                
                if ln.startswith("|C100|"):
                    fs = split_sped_line(ln, min_fields=10)
                    if len(fs) >= 10:
                        current_key = (fs[9] or "").strip() or None
                        if current_key == chave:
                            ordem.append(("C100", linha_num, None))
                
                elif ln.startswith("|C170|") and current_key == chave:
                    fs = split_sped_line(ln, min_fields=21)
                    if len(fs) >= 3:
                        current_item = (fs[2] or "").strip()
                        ordem.append(("C170", linha_num, current_item))
                
                elif ln.startswith("|C176|") and current_key == chave:
                    ordem.append(("C176", linha_num, current_item))
                
                elif ln.startswith("|C190|") and current_key == chave:
                    ordem.append(("C190", linha_num, None))
        
        # Validar sequência
        ultimo_tipo = None
        for tipo, linha, item in ordem:
            if tipo == "C100":
                if ultimo_tipo and ultimo_tipo not in ["C100", "C990"]:
                    resultado["sequencia_valida"] = False
                    resultado["erros_sequencia"].append(
                        f"C100 encontrado na linha {linha} mas havia {ultimo_tipo} antes"
                    )
            elif tipo == "C170":
                if ultimo_tipo not in ["C100", "C170", "C176"]:
                    resultado["sequencia_valida"] = False
                    resultado["erros_sequencia"].append(
                        f"C170 encontrado na linha {linha} mas {ultimo_tipo} não é válido antes"
                    )
            elif tipo == "C176":
                if ultimo_tipo != "C170":
                    resultado["sequencia_valida"] = False
                    resultado["erros_sequencia"].append(
                        f"C176 encontrado na linha {linha} mas não há C170 imediatamente antes"
                    )
            elif tipo == "C190":
                if ultimo_tipo not in ["C100", "C170", "C176", "C190"]:
                    resultado["sequencia_valida"] = False
                    resultado["erros_sequencia"].append(
                        f"C190 encontrado na linha {linha} mas {ultimo_tipo} não é válido antes"
                    )
            
            ultimo_tipo = tipo
        
        resultado["ordem_registros"] = [(tipo, linha) for tipo, linha, _ in ordem]
        
    except Exception as e:
        logging.warning(f"Erro ao validar sequência de registros: {e}")
        resultado["sequencia_valida"] = False
        resultado["erros_sequencia"].append(f"Erro na validação: {str(e)}")
    
    return resultado

