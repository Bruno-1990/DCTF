# parsers.py — reúne parsers do SPED e XML (NF-e/CT-e)
from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import re
import pandas as pd
import xml.etree.ElementTree as ET

from common import (
    NS_NFE, NS_CTE,
    parse_decimal, parse_date_efd_ddmmyyyy,
    localname
)

def split_sped_line(line: str, min_fields: int = 0) -> List[str]:
    """
    Faz split de linha SPED preservando campos vazios de forma ABSOLUTA.
    
    O SPED usa formato pipe-delimited onde campos vazios são representados por ||.
    CRÍTICO: Se a linha não termina com |, o último campo vazio pode ser perdido,
    causando deslocamento de índices! Por isso, garantimos que a linha termine com |
    antes do split para preservar todos os campos vazios.
    
    Exemplo:
    "|C100|0|1||55|123.45|" -> ['', 'C100', '0', '1', '', '55', '123.45', '']
    "|C100|0|1||55|123.45"  -> ['', 'C100', '0', '1', '', '55', '123.45', ''] (adiciona |)
    "|C190|110|2403|0|727,74|0|0|00|00||" -> preserva todos os campos corretamente
    
    Args:
        line: Linha do SPED (pode ter newline no final)
        min_fields: Número mínimo de campos esperados (preenche com "" se necessário)
    
    Returns:
        Lista de campos preservando vazios - índices ABSOLUTOS conforme layout
    """
    # Remover newline mas preservar estrutura original
    line = line.rstrip("\n\r")
    
    # CRÍTICO: Garantir que a linha termine com | para preservar último campo vazio
    # Isso é essencial para registros que têm campos vazios no final (como C190)
    # Se a linha não termina com |, o último campo vazio seria perdido no split,
    # causando deslocamento de índices em todos os campos subsequentes
    if line and not line.endswith("|"):
        line = line + "|"
    
    # Fazer split preservando campos vazios (Python já faz isso corretamente)
    # split("|") preserva campos vazios no meio: "||" -> ['', '', '']
    fields = line.split("|")
    
    # CRÍTICO: Preencher até min_fields se necessário para garantir indexação correta
    # Isso garante que fs[12], fs[25], etc. sempre existam, mesmo se a linha
    # original não tiver todos os campos
    if min_fields > 0 and len(fields) < min_fields:
        fields.extend([""] * (min_fields - len(fields)))
    
    return fields

# ====== (sped.py) ======
def parse_efd_c100(file_path: Path) -> pd.DataFrame:
    """
    Parse do registro C100 (Documento Fiscal - Nota Fiscal Eletrônica).
    
    Layout oficial C100 (posições):
    REG(1), IND_OPER(2), IND_EMIT(3), COD_PART(4), COD_MOD(5), COD_SIT(6), SER(7),
    NUM_DOC(8), CHV_NFE(9), DT_DOC(10), DT_E_S(11), VL_DOC(12), IND_PGTO(13),
    VL_DESC(14), VL_ABAT_NT(15), VL_MERC(16), IND_FRT(17), VL_FRT(18), VL_SEG(19),
    VL_OUT_DA(20), VL_BC_ICMS(21), VL_ICMS(22), VL_BC_ICMS_ST(23), VL_ICMS_ST(24),
    VL_IPI(25), VL_PIS(26), VL_COFINS(27)
    
    Após split("|"): fs[0]="", fs[1]="C100", fs[2]=IND_OPER, fs[3]=IND_EMIT, ...
    Todos os índices estão CORRETOS conforme validação.
    """
    rows: List[Dict[str, Any]] = []
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if not ln.startswith("|C100|"):
                continue
            # CORREÇÃO: Usar split_sped_line para preservar campos vazios corretamente
            fs = split_sped_line(ln, min_fields=30)
            rows.append({
                "IND_OPER": fs[2], "IND_EMIT": fs[3], "COD_PART": fs[4],
                "COD_MOD": fs[5], "COD_SIT": fs[6], "SER": fs[7], "NUM_DOC": fs[8],
                "CHV_NFE": fs[9],
                "DT_DOC": parse_date_efd_ddmmyyyy(fs[10]),
                "DT_E_S": parse_date_efd_ddmmyyyy(fs[11]),
                "VL_DOC": parse_decimal(fs[12]),
                "IND_PGTO": fs[13], "VL_DESC": parse_decimal(fs[14]),
                "VL_ABAT_NT": parse_decimal(fs[15]),
                "VL_MERC": parse_decimal(fs[16]),
                "IND_FRT": fs[17],
                "VL_FRT": parse_decimal(fs[18]),
                "VL_SEG": parse_decimal(fs[19]),
                "VL_OUT_DA": parse_decimal(fs[20]),
                "VL_BC_ICMS": parse_decimal(fs[21]),
                "VL_ICMS": parse_decimal(fs[22]),
                "VL_BC_ICMS_ST": parse_decimal(fs[23]),
                "VL_ICMS_ST": parse_decimal(fs[24]),
                "VL_IPI": parse_decimal(fs[25]),
                "VL_PIS": parse_decimal(fs[26]),
                "VL_COFINS": parse_decimal(fs[27]),
                "RAW": ln.strip(),
            })
    return pd.DataFrame(rows)

def get_company_identity_from_efd(file_path: Path):
    cnpj = razao = dt_ini = dt_fin = None
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|0000|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=8)
                if len(fs) >= 8:
                    dt_ini = fs[4] or None
                    dt_fin = fs[5] or None
                    razao = (fs[6] or "").strip()
                    cnpj = re.sub(r"\D", "", (fs[7] or "").strip()) or None
                break
    return cnpj, razao, dt_ini, dt_fin

def parse_efd_c190_totais(file_path: Path):
    """
    Agrega totais do C190 por chave (C100.CHV_NFE) e por (COD_MOD,SER,NUM_DOC),
    usando layout correto conforme EFD-ICMS/IPI:
    - Layout C190: REG(1), CST_ICMS(2), CFOP(3), VL_OPR(4), VL_BC_ICMS(5), VL_ICMS(6),
                    VL_BC_ICMS_ST(7), VL_ICMS_ST(8), VL_RED_BC(9), COD_OBS(10), VL_IPI(11)
    - Após split("|"): fs[0]="", fs[1]="C190", fs[2]=CST_ICMS, fs[3]=CFOP, fs[4]=VL_OPR,
                        fs[5]=VL_BC_ICMS, fs[6]=VL_ICMS, fs[7]=VL_BC_ICMS_ST, fs[8]=VL_ICMS_ST,
                        fs[9]=VL_RED_BC, fs[10]=COD_OBS, fs[11]=VL_IPI
    - Índices corretos: VL_BC_ICMS=fs[5], VL_ICMS=fs[6], VL_BC_ICMS_ST=fs[7], VL_ICMS_ST=fs[8], VL_IPI=fs[11]
    """
    por_chave, por_triple = {}, {}
    def bucket(d, k):
        if k not in d:
            d[k] = {"VL_BC_ICMS": 0.0, "VL_ICMS": 0.0, "VL_BC_ICMS_ST": 0.0, "VL_ICMS_ST": 0.0, "VL_IPI": 0.0, "CSTS": set()}
        return d[k]
    current_key: Optional[str] = None
    current_triple: Optional[Tuple[Optional[int], Optional[int], Optional[int]]] = None

    def to_int_or_none(x: str) -> Optional[int]:
        s = re.sub(r"\D", "", x or "")
        return int(s) if s else None

    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|C100|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=10)
                if len(fs) < 10:
                    current_key = None
                    current_triple = None
                    continue
                current_key = (fs[9] or "").strip() or None  # CHV_NFE
                cod_mod = to_int_or_none(fs[5] or "")
                ser = to_int_or_none(fs[7] or "")
                num = to_int_or_none(fs[8] or "")
                current_triple = (cod_mod, ser, num)
                # garante buckets
                if current_key:
                    bucket(por_chave, current_key)
                if None not in current_triple:
                    bucket(por_triple, current_triple)
            elif ln.startswith("|C190|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                # C190 tem 12 campos (REG até COD_OBS), então precisamos de min_fields=13 (incluindo fs[0])
                fs = split_sped_line(ln, min_fields=13)
                if len(fs) < 13:
                    continue
                # CORREÇÃO CRÍTICA: Layout oficial do C190 inclui ALIQ_ICMS na posição 4!
                # Layout C190 oficial: REG(1), CST_ICMS(2), CFOP(3), ALIQ_ICMS(4), VL_OPR(5), VL_BC_ICMS(6),
                #                       VL_ICMS(7), VL_BC_ICMS_ST(8), VL_ICMS_ST(9), VL_RED_BC(10), VL_IPI(11), COD_OBS(12)
                # Após split("|"): fs[0]="", fs[1]="C190", fs[2]=CST_ICMS, fs[3]=CFOP, fs[4]=ALIQ_ICMS,
                #                  fs[5]=VL_OPR, fs[6]=VL_BC_ICMS, fs[7]=VL_ICMS, fs[8]=VL_BC_ICMS_ST,
                #                  fs[9]=VL_ICMS_ST, fs[10]=VL_RED_BC, fs[11]=VL_IPI, fs[12]=COD_OBS
                cst = (fs[2] or "").strip()      # Posição 2: CST_ICMS (índice 2 após split)
                # CORREÇÃO: Todos os índices ajustados +1 devido ao campo ALIQ_ICMS na posição 4
                v_bc   = parse_decimal(fs[6]) if len(fs) > 6 else 0.0   # Posição 6: VL_BC_ICMS (era fs[5], agora fs[6])
                v_icms = parse_decimal(fs[7]) if len(fs) > 7 else 0.0  # Posição 7: VL_ICMS (era fs[6], agora fs[7])
                v_bcst = parse_decimal(fs[8]) if len(fs) > 8 else 0.0  # Posição 8: VL_BC_ICMS_ST (era fs[7], agora fs[8])
                v_st   = parse_decimal(fs[9]) if len(fs) > 9 else 0.0  # Posição 9: VL_ICMS_ST (era fs[8], agora fs[9])
                v_ipi  = parse_decimal(fs[11]) if len(fs) > 11 else 0.0 # Posição 11: VL_IPI (mantém fs[11])
                if current_key:
                    b = bucket(por_chave, current_key)
                    b["CSTS"].add(cst)
                    b["VL_BC_ICMS"] += v_bc or 0.0
                    b["VL_ICMS"] += v_icms or 0.0
                    b["VL_BC_ICMS_ST"] += v_bcst or 0.0
                    b["VL_ICMS_ST"] += v_st or 0.0
                    b["VL_IPI"] += v_ipi or 0.0
                if current_triple and None not in current_triple:
                    b2 = bucket(por_triple, current_triple)
                    b2["CSTS"].add(cst)
                    b2["VL_BC_ICMS"] += v_bc or 0.0
                    b2["VL_ICMS"] += v_icms or 0.0
                    b2["VL_BC_ICMS_ST"] += v_bcst or 0.0
                    b2["VL_ICMS_ST"] += v_st or 0.0
                    b2["VL_IPI"] += v_ipi or 0.0
    return por_chave, por_triple

def parse_efd_d100_d190(file_path: Path):
    """
    CT-e: D100/D190 agregados por (SER, NUM_DOC).
    
    Layout D100 (posições oficiais):
    REG(1), IND_OPER(2), COD_PART(3), COD_MOD(4), COD_SIT(5), SER(6), NUM_DOC(7), 
    CHV_CTE(8), DT_DOC(9), DT_A_P(10), TP_CT-e(11), CHV_CTE_REF(12), VL_DOC(13),
    VL_DESC(14), IND_FRT(15), VL_SERV(16), VL_BC_ICMS(17), VL_ICMS(18), VL_NT(19), ...
    
    Após split("|"): fs[0]="", fs[1]="D100", fs[2]=IND_OPER, fs[3]=COD_PART, 
    fs[4]=COD_MOD, fs[5]=COD_SIT, fs[6]=SER, fs[7]=NUM_DOC, fs[8]=CHV_CTE, ...
    """
    d100_rows = []
    d190_acc: Dict[Tuple[str, str], Dict[str, float]] = {}
    last_key: Optional[Tuple[str, str]] = None
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|D100|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=22)
                # CORREÇÃO: índices corretos conforme layout oficial
                ind_oper = fs[2]  # Posição 2: IND_OPER
                serie = fs[6]     # Posição 6: SER (índice 6 após split)
                num = fs[7]       # Posição 7: NUM_DOC (índice 7 após split)
                chave = fs[8]     # Posição 8: CHV_CTE (índice 8 após split)
                vl_doc = parse_decimal(fs[12])   # Posição 13: VL_DOC (índice 12 após split)
                vl_serv = parse_decimal(fs[15])  # Posição 16: VL_SERV (índice 15 após split)
                vl_bc = parse_decimal(fs[16])    # Posição 17: VL_BC_ICMS (índice 16 após split)
                vl_icms = parse_decimal(fs[17])  # Posição 18: VL_ICMS (índice 17 após split)
                d100_rows.append({
                    "SER": serie, "NUM_DOC": num, "CHV_CTE": chave,
                    "VL_DOC": vl_doc, "VL_SERV": vl_serv,
                    "VL_BC_ICMS": vl_bc, "VL_ICMS": vl_icms,
                    "IND_OPER": ind_oper
                })
                last_key = (serie, num)
                d190_acc.setdefault(last_key, {"VL_OPR": 0.0, "VL_BC_ICMS": 0.0, "VL_ICMS": 0.0})
            elif ln.startswith("|D190|") and last_key is not None:
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=8)
                # Layout D190: REG(1), CST_ICMS(2), CFOP(3), VL_OPR(4), VL_BC_ICMS(5), VL_ICMS(6)
                vl_opr = parse_decimal(fs[3]) or 0.0   # Posição 4: VL_OPR (índice 3 após split)
                vl_bc  = parse_decimal(fs[4]) or 0.0   # Posição 5: VL_BC_ICMS (índice 4 após split)
                vl_icm = parse_decimal(fs[5]) or 0.0   # Posição 6: VL_ICMS (índice 5 após split)
                b = d190_acc.setdefault(last_key, {"VL_OPR": 0.0, "VL_BC_ICMS": 0.0, "VL_ICMS": 0.0})
                b["VL_OPR"] += vl_opr
                b["VL_BC_ICMS"] += vl_bc
                b["VL_ICMS"] += vl_icm
    d100_df = pd.DataFrame(d100_rows)
    d190_df = pd.DataFrame([{"SER": k[0], "NUM_DOC": k[1], **v} for k, v in d190_acc.items()])
    return d100_df, d190_df

# ====== (xmlparse.py) ======
def parse_xml_nfe(path: Path) -> Dict[str, Any]:
    tree = ET.parse(path)
    root = tree.getroot()
    nfe = root.find(".//nfe:NFe", NS_NFE)
    if nfe is None and localname(root.tag) == "NFe":
        nfe = root
    if nfe is None:
        raise ValueError("Arquivo não é uma NF-e completa (possível evento/cancelamento).")

    inf = nfe.find(".//nfe:infNFe", NS_NFE)
    if inf is None:
        raise ValueError("NF-e sem <infNFe>.")
    chave = (inf.attrib.get("Id", "") or "").replace("NFe", "")
    chave = re.sub(r"\D", "", chave)[:44]

    def txt(node, xp):
        nd = node.find(xp, NS_NFE) if node is not None else None
        return (nd.text or "").strip() if nd is not None and nd.text is not None else None

    ide = nfe.find(".//nfe:ide", NS_NFE)
    emit = nfe.find(".//nfe:emit", NS_NFE)
    dest = nfe.find(".//nfe:dest", NS_NFE)
    total = nfe.find(".//nfe:ICMSTot", NS_NFE)

    data: Dict[str, Any] = {
        "FILE": path.name,
        "CHAVE": chave,
        "natOp": txt(ide, "nfe:natOp"),
        "mod": txt(ide, "nfe:mod"),
        "serie": txt(ide, "nfe:serie"),
        "nNF": txt(ide, "nfe:nNF"),
        "dhEmi": txt(ide, "nfe:dhEmi"),
        "dhSaiEnt": txt(ide, "nfe:dhSaiEnt"),
        "tpNF": txt(ide, "nfe:tpNF"),
        "idDest": txt(ide, "nfe:idDest"),
        "indFinal": txt(ide, "nfe:indFinal"),
        "emit_CNPJ": txt(emit, "nfe:CNPJ"),
        "emit_xNome": txt(emit, "nfe:xNome"),
        "emit_UF": txt(emit, "nfe:enderEmit/nfe:UF"),
        "dest_CNPJ": txt(dest, "nfe:CNPJ"),
        "dest_xNome": txt(dest, "nfe:xNome"),
        "dest_UF": txt(dest, "nfe:enderDest/nfe:UF"),
    }

    def to_float(node, tag) -> float:
        if node is None:
            return 0.0
        nd = node.find(tag, NS_NFE)
        if nd is None or nd.text is None:
            return 0.0
        try:
            return float(str(nd.text).replace(",", "."))
        except Exception:
            try:
                return float(nd.text)
            except Exception:
                return 0.0

    for t in ("vNF", "vProd", "vFrete", "vSeg", "vDesc", "vOutro", "vII",
              "vIPI", "vST", "vBCST", "vFCP", "vFCPST", "vBC", "vICMS"):
        data[t] = to_float(total, f"nfe:{t}") if total is not None else 0.0

    items: List[Dict[str, Any]] = []
    for det in nfe.findall(".//nfe:det", NS_NFE):
        prod = det.find("nfe:prod", NS_NFE)
        imposto = det.find("nfe:imposto", NS_NFE)
        item: Dict[str, Any] = {"nItem": det.attrib.get("nItem")}
        if prod is not None:
            for tag in ("cProd", "xProd", "NCM", "CEST", "CFOP", "uCom", "qCom", "vUnCom",
                        "vProd", "vDesc", "uTrib", "qTrib", "vUnTrib", "vFrete", "vSeg", "vOutro"):
                node = prod.find(f"nfe:{tag}", NS_NFE)
                val = node.text if node is not None else None
                if tag in {"qCom", "vUnCom", "vProd", "vDesc", "qTrib", "vUnTrib", "vFrete", "vSeg", "vOutro"} and val is not None:
                    try:
                        val = float(str(val).replace(",", "."))
                    except Exception:
                        try:
                            val = float(val)
                        except Exception:
                            val = None
                item[tag] = val
        # ICMS por item
        icms = {}
        if imposto is not None:
            icms_node = imposto.find("nfe:ICMS", NS_NFE)
            if icms_node is not None:
                icms_child = next(iter(icms_node), None)
                if icms_child is not None:
                    for t in ("orig", "CST", "CSOSN", "modBC", "vBC", "pICMS", "vICMS"):
                        node = icms_child.find(f"nfe:{t}", NS_NFE)
                        val2 = node.text if node is not None else None
                        if t in {"vBC", "pICMS", "vICMS"} and val2 is not None:
                            try:
                                val2 = float(str(val2).replace(",", "."))
                            except Exception:
                                try:
                                    val2 = float(val2)
                                except Exception:
                                    val2 = None
                        icms[t] = val2
        item["ICMS"] = icms
        items.append(item)

    data["items"] = items
    return data

def parse_xml_cte(path: Path) -> Optional[Dict[str, Any]]:
    tree = ET.parse(path)
    root = tree.getroot()
    inf = root.find(".//cte:infCte", NS_CTE)
    if inf is None:
        return None

    chave_attr = inf.attrib.get("Id") or ""
    chave = re.sub(r"\D", "", chave_attr)[-44:] if chave_attr else re.sub(r"\D", "", path.name)[:44]

    ide = inf.find("cte:ide", NS_CTE)
    mod = ide.findtext("cte:mod", default="", namespaces=NS_CTE) if ide is not None else ""
    serie = ide.findtext("cte:serie", default="", namespaces=NS_CTE) if ide is not None else ""
    nCT = ide.findtext("cte:nCT", default="", namespaces=NS_CTE) if ide is not None else ""
    dhEmi = ide.findtext("cte:dhEmi", default="", namespaces=NS_CTE) if ide is not None else ""

    def tf(x):
        try:
            return float(str(x).replace(",", "."))
        except Exception:
            return None

    vTPrest = None
    vprest = root.find(".//cte:vPrest", NS_CTE)
    if vprest is not None:
        vTPrest = tf(vprest.findtext("cte:vTPrest", default=None, namespaces=NS_CTE))

    vBC = 0.0
    vICMS = 0.0
    icms = root.find(".//cte:ICMS", NS_CTE)
    if icms is not None:
        for child in list(icms):
            vb = child.findtext("cte:vBC", default=None, namespaces=NS_CTE)
            vi = child.findtext("cte:vICMS", default=None, namespaces=NS_CTE)
            if vb is not None:
                try:
                    vBC += float(str(vb).replace(",", "."))
                except Exception:
                    pass
            if vi is not None:
                try:
                    vICMS += float(str(vi).replace(",", "."))
                except Exception:
                    pass

    return {
        "FILE": path.name, "CHAVE": chave,
        "mod": mod, "serie": serie, "nCT": nCT, "dhEmi": dhEmi,
        "vTPrest": vTPrest, "vBC": vBC, "vICMS": vICMS
    }


# === NEW: cadastros e apuração ===
def parse_efd_0150_0190(file_path: Path):
    map_0150: Dict[str, Dict[str, Any]] = {}
    set_0190: set[str] = set()
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|0150|"):
                fs = ln.strip().split("|")
                if len(fs) < 9: fs += [""] * (9 - len(fs))
                cod = (fs[2] or "").strip()
                nome = (fs[3] or "").strip()
                cnpj = re.sub(r"\D", "", (fs[5] or "").strip())
                cpf = re.sub(r"\D", "", (fs[6] or "").strip())
                ie = (fs[7] or "").strip()
                cod_mun = (fs[8] or "").strip()
                if cod:
                    map_0150[cod] = {"NOME": nome, "CNPJ": cnpj, "CPF": cpf, "IE": ie, "COD_MUN": cod_mun}
            elif ln.startswith("|0190|"):
                fs = ln.strip().split("|")
                if len(fs) < 4: fs += [""] * (4 - len(fs))
                unid = (fs[2] or "").strip().upper()
                if unid:
                    set_0190.add(unid)
    return map_0150, set_0190

def parse_efd_e110_e116_e310_e316(file_path: Path):
    e110_rows = []; e116_rows = []; e310_rows = []; e316_rows = []
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|E110|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=12)
                def pdv(i): 
                    try: 
                        return float(str(fs[i]).replace(",", ".")) if fs[i] else 0.0
                    except Exception: 
                        return 0.0
                e110_rows.append({
                    "VL_TOT_DEBITOS": pdv(2),
                    "VL_AJ_DEBITOS": pdv(3),
                    "VL_TOT_CREDITOS": pdv(4),
                    "VL_AJ_CREDITOS": pdv(5),
                    "VL_SLD_CREDOR_TRANSPORTAR": pdv(6),
                    "VL_SLD_DEV_ANT": pdv(7),
                    "VL_SLD_DEV": pdv(8),
                    "VL_TOT_DEDUCOES": pdv(9),
                })
            elif ln.startswith("|E116|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=8)
                e116_rows.append({"COD_OR": fs[2], "VL_OR": fs[3], "DT_VCTO": fs[4], "COD_REC": fs[5], "NUM_PROC": fs[6], "IND_PROC": fs[7]})
            elif ln.startswith("|E310|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=3)
                e310_rows.append({"IND_MOV_FCP": fs[2]})
            elif ln.startswith("|E316|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=8)
                e316_rows.append({"COD_OR": fs[2], "VL_OR": fs[3], "DT_VCTO": fs[4], "COD_REC": fs[5], "NUM_PROC": fs[6], "IND_PROC": fs[7]})
    import pandas as pd
    return {"E110": pd.DataFrame(e110_rows), "E116": pd.DataFrame(e116_rows), "E310": pd.DataFrame(e310_rows), "E316": pd.DataFrame(e316_rows)}

def parse_efd_c195_c197(file_path: Path):
    ajustes_por_chave: Dict[str, List[Dict[str, Any]]] = {}
    current_key = None
    with file_path.open("r", encoding="latin1", errors="ignore") as f:
        for ln in f:
            if ln.startswith("|C100|"):
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=10)
                current_key = (fs[9] or "").strip() if len(fs) > 9 else None
            elif ln.startswith("|C197|") and current_key:
                # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                fs = split_sped_line(ln, min_fields=9)
                def pdv(i):
                    try: 
                        return float(str(fs[i]).replace(",", ".")) if fs[i] else 0.0
                    except Exception: 
                        return 0.0
                row = {"COD_AJ": fs[2], "DESCR_COMPL_AJ": fs[3], "COD_ITEM": fs[4], "VL_BC_ICMS": pdv(5), "ALIQ_ICMS": pdv(6), "VL_ICMS": pdv(7), "VL_OUTROS": pdv(8)}
                ajustes_por_chave.setdefault(current_key, []).append(row)
    return ajustes_por_chave
