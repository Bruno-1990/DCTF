from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import logging

from common import TOL, COD_SIT_ACEITOS, normalize_unit
from common import norm_int_like, cfop_first_digit
from parsers import (
    parse_efd_c100,
    parse_efd_c190_totais,
    get_company_identity_from_efd,
    parse_efd_d100_d190,
    parse_xml_nfe,
    parse_xml_cte,
    parse_efd_0150_0190,
    parse_efd_e110_e116_e310_e316,
    parse_efd_c195_c197,
)

logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")


def recompute_vnf_from_totals(n: Dict[str, Any]) -> float:
    return round(
        (n.get("vProd", 0) or 0)
        + (n.get("vFrete", 0) or 0)
        + (n.get("vSeg", 0) or 0)
        + (n.get("vOutro", 0) or 0)
        - (n.get("vDesc", 0) or 0)
        + (n.get("vII", 0) or 0)
        + (n.get("vIPI", 0) or 0)
        + (n.get("vST", 0) or 0)
        + (n.get("vFCPST", 0) or 0),
        2,
    )


@dataclass
class ContextoEmpresa:
    cnpj: Optional[str]
    razao: Optional[str]
    dt_ini: Optional[str]
    dt_fin: Optional[str]


@dataclass
class Materiais:
    efd_c100: pd.DataFrame
    c190_by_key: Dict[str, Dict[str, Any]]
    c190_by_triple: Dict[Tuple[int, int, int], Dict[str, Any]]
    cte_d100: pd.DataFrame
    cte_d190: pd.DataFrame
    xml_nf: List[Dict[str, Any]]
    xml_cte: List[Dict[str, Any]]
    xml_errors: List[Tuple[str, str]]
    empresa: ContextoEmpresa
    map_0150: Dict[str, Dict[str, Any]]
    set_0190: set
    apur_e: Dict[str, pd.DataFrame]
    ajustes_c197: Dict[str, List[Dict[str, Any]]]


def build_dataframes(efd_path, xml_folder) -> Materiais:
    from pathlib import Path
    efd_path = Path(efd_path)
    xml_folder = Path(xml_folder)
    if not efd_path.is_file():
        raise FileNotFoundError(f"EFD não encontrado: {efd_path}")
    if not xml_folder.is_dir():
        raise NotADirectoryError(f"Pasta inválida: {xml_folder}")

    efd = parse_efd_c100(efd_path)
    cnpj_emp, razao_emp, dt_ini, dt_fin = get_company_identity_from_efd(efd_path)
    c190_by_key, c190_by_triple = parse_efd_c190_totais(efd_path)
    try:
        d100_df, d190_df = parse_efd_d100_d190(efd_path)
    except Exception:
        d100_df, d190_df = pd.DataFrame(), pd.DataFrame()

    xml_paths = sorted([p for p in xml_folder.glob("*.xml") if p.is_file()])
    xml_notes, cte_notes, xml_parse_errors = [], [], []
    map_0150, set_0190 = parse_efd_0150_0190(efd_path)
    apur_e = parse_efd_e110_e116_e310_e316(efd_path)
    ajustes_c197 = parse_efd_c195_c197(efd_path)

    for pth in xml_paths:
        try:
            xml_notes.append(parse_xml_nfe(pth))
        except Exception as ex1:
            try:
                cte = parse_xml_cte(pth)
                if cte:
                    cte_notes.append(cte)
                else:
                    raise ValueError("Não é CT-e")
            except Exception as ex2:
                xml_parse_errors.append((pth.name, f"NF-e: {ex1}; CT-e: {ex2}"))

    return Materiais(
        efd, c190_by_key, c190_by_triple,
        d100_df, d190_df, xml_notes, cte_notes,
        xml_parse_errors, ContextoEmpresa(cnpj_emp, razao_emp, dt_ini, dt_fin),
        map_0150, set_0190, apur_e, ajustes_c197,
    )


def make_reports(data: Materiais, rules: Optional[Dict[str, Any]] = None) -> Dict[str, pd.DataFrame]:
    out: Dict[str, pd.DataFrame] = {}
    efd = data.efd_c100
    c190_by_key = data.c190_by_key
    c190_by_triple = data.c190_by_triple
    xml_notes = data.xml_nf
    cte_notes = data.xml_cte
    d100_df = data.cte_d100
    d190_df = data.cte_d190
    xml_parse_errors = data.xml_errors
    emp = data.empresa
    tol = TOL if "TOL" in globals() else 0.02

    def _fmt_periodo(ini: Optional[str], fim: Optional[str]) -> str:
        import re
        def _fmt(d):
            if not d:
                return 'N/D'
            s = str(d)
            digits = re.sub(r'\D', '', s)
            if len(digits) == 8:
                # Heurística: se começa com DD/MM válido, assume DDMMYYYY; caso contrário, YYYYMMDD
                dd = int(digits[:2]); mm = int(digits[2:4])
                if 1 <= dd <= 31 and 1 <= mm <= 12:
                    return f"{digits[:2]}/{digits[2:4]}/{digits[4:8]}"
                return f"{digits[6:8]}/{digits[4:6]}/{digits[:4]}"
            return s
        return f"{_fmt(ini)} até {_fmt(fim)}"

    checklist: List[Tuple[str, Any]] = [
        ("Empresa (Razão Social)", emp.razao or "N/D"),
        ("Empresa (CNPJ)", emp.cnpj or "N/D"),
        ("Período (EFD)", _fmt_periodo(emp.dt_ini, emp.dt_fin)),
        ("EFD_C100 lido", f"{efd.shape[0]} linhas"),
    ]

    # Filtra lançamentos válidos
    efd_valid = efd[efd["COD_SIT"].astype(str).isin(COD_SIT_ACEITOS)].copy()

    # Índices e mapas
    efd_map = efd_valid.set_index("CHV_NFE").to_dict("index")
    def triple_key(row: pd.Series):
        return (norm_int_like(row.get("COD_MOD")), norm_int_like(row.get("SER")), norm_int_like(row.get("NUM_DOC")))
    efd_map_by_triple: Dict[Tuple[int, int, int], Dict[str, Any]] = {}
    for _, r in efd_valid.iterrows():
        k = triple_key(r)
        if None not in k and k not in efd_map_by_triple:
            efd_map_by_triple[k] = r.to_dict()

    issues: List[Dict[str, Any]] = []

    # === Cadastros 0150/0190 e Apuração ===
    map_0150 = data.map_0150
    set_0190 = data.set_0190
    set_0190_norm = {normalize_unit(u) for u in set_0190}
    apur_e = data.apur_e
    ajustes_c197 = data.ajustes_c197

    part_rows = []
    for n in xml_notes:
        ch = n["CHAVE"]
        e_row = efd_map.get(ch) or {}
        ind_oper = str(e_row.get("IND_OPER") or "").strip()
        cod_part = str(e_row.get("COD_PART") or "").strip()
        part = map_0150.get(cod_part) if cod_part else None
        emit = (n.get("emit_CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
        dest = (n.get("dest_CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
        esperado = dest if ind_oper == "1" else emit if ind_oper == "0" else None
        conf = "OK" if (part and esperado and part.get("CNPJ") == esperado) else "DIVERGENTE"
        part_rows.append({
            "CHAVE": ch, "IND_OPER": ind_oper, "COD_PART": cod_part,
            "0150_CNPJ": part.get("CNPJ") if part else None, "0150_NOME": part.get("NOME") if part else None,
            "XML_emit_CNPJ": emit, "XML_dest_CNPJ": dest, "CNPJ_esperado (por IND_OPER)": esperado, "Conferência": conf
        })
    df_part = pd.DataFrame(part_rows)
    if not df_part.empty:
        out["Cadastro (0150) x XML"] = df_part
    # === Unidades (0190) faltantes — com normalização e Ação sugerida
    u_rows = []
    conv_sug = {"DZ": ("UND", 12), "PR": ("UND", 2)}
    for n in xml_notes:
        for det in n.get("items", []):
            ucom_orig = str(det.get("uCom") or "").upper()
            utrib_orig = str(det.get("uTrib") or "").upper()
            for tag, uv_orig in (("uCom", ucom_orig), ("uTrib", utrib_orig)):
                if not uv_orig:
                    continue
                uv_norm = normalize_unit(uv_orig)
                existe = "SIM" if uv_norm in set_0190_norm else "NÃO"
                if existe == "NÃO":
                    acao = ""
                    if uv_norm in conv_sug and ("UND" in set_0190_norm):
                        dest, fator = conv_sug[uv_norm]
                        acao = f"Criar 0220 {uv_norm}→{dest} ×{fator}"
                    else:
                        acao = f"Cadastrar {uv_norm} no 0190"
                    u_rows.append({
                        "CHAVE": n["CHAVE"],
                        "Item": det.get("nItem"),
                        "Campo": tag,
                        "Unidade no XML": uv_orig,
                        "Unidade (normalizada)": uv_norm,
                        "Existe em 0190?": existe,
                        "Ação sugerida": acao,
                    })
    if u_rows:
        out["Unidades (0190) faltantes"] = pd.DataFrame(
            u_rows,
            columns=["CHAVE","Item","Campo","Unidade no XML","Unidade (normalizada)","Existe em 0190?","Ação sugerida"],
        )
    fcp_rows = []
    for n in xml_notes:
        if (n.get("vFCP") or 0.0) or (n.get("vFCPST") or 0.0):
            fcp_rows.append({"CHAVE": n["CHAVE"], "vFCP(XML)": n.get("vFCP"), "vFCPST(XML)": n.get("vFCPST")})
    if fcp_rows:
        out["FCP (indícios)"] = pd.DataFrame(fcp_rows)

    if isinstance(apur_e.get("E110"), pd.DataFrame) and not apur_e["E110"].empty:
        out["Apuração (E110)"] = apur_e["E110"]
    if isinstance(apur_e.get("E116"), pd.DataFrame) and not apur_e["E116"].empty:
        out["Recolhimentos (E116)"] = apur_e["E116"]
    if isinstance(apur_e.get("E316"), pd.DataFrame) and not apur_e["E316"].empty:
        out["Recolhimentos DIFAL/FCP (E316)"] = apur_e["E316"]

    if ajustes_c197:
        rows_c197 = []
        for ch, lst in ajustes_c197.items():
            for a in lst:
                rows_c197.append({"CHAVE": ch, **a})
        if rows_c197:
            out["Ajustes (C197)"] = pd.DataFrame(rows_c197)


    # XML inválidos (evento, cancelamento, etc.)
    for fname, msg in xml_parse_errors:
        issues.append({
            "Categoria": "Arquivo não é NF-e (evento/cancelamento)",
            "Chave NF-e": fname, "Onde": "Arquivo XML", "Campo": "Estrutura",
            "No XML": msg, "No SPED": "—", "Regra": "Usar XML completo (nfeProc/NFe)",
            "Severidade": "Média", "Sugestão": "Substituir por XML da NF-e",
            "Descrição": f"O arquivo '{fname}' não contém uma NF-e completa."
        })

    # vNF recalculado
    recalc_mismatch = 0
    for n in xml_notes:
        try:
            if abs(recompute_vnf_from_totals(n) - float(n.get("vNF") or 0.0)) > 0.02:
                recalc_mismatch += 1
        except Exception:
            recalc_mismatch += 1
    checklist.append((f"vNF recalculado difere do vNF do XML (±{0.02:.2f})", recalc_mismatch))

    # Duplicidades no C100
    dup_counts = efd_valid["CHV_NFE"].value_counts()
    for chave, cnt in dup_counts[dup_counts > 1].items():
        issues.append({
            "Categoria": "Duplicidade no SPED (mesma chave)",
            "Chave NF-e": chave, "Onde": "SPED C100", "Campo": "CHV_NFE",
            "No XML": "-", "No SPED": f"{cnt} lançamentos",
            "Regra": "A chave deve aparecer uma única vez",
            "Severidade": "Alta", "Sugestão": "Manter apenas 1 lançamento",
            "Descrição": "Há mais de um lançamento no C100 para a mesma chave."
        })

    # Linhas: Notas e Itens
    rows_notes: List[Dict[str, Any]] = []
    rows_items: List[Dict[str, Any]] = []

    for n in xml_notes:
        ch = n["CHAVE"]
        e_row = efd_map.get(ch)
        c190_tot = c190_by_key.get(ch)
        if not e_row and not c190_tot:
            # fallback por triple
            k = (norm_int_like(n.get("mod")), norm_int_like(n.get("serie")), norm_int_like(n.get("nNF")))
            if None not in k:
                e_row = efd_map_by_triple.get(k)
                c190_tot = c190_tot or c190_by_triple.get(k)

        sped_vnf = e_row.get("VL_DOC") if e_row else None
        sped_vfrt = e_row.get("VL_FRT") if e_row else None
        sped_vdesc = e_row.get("VL_DESC") if e_row else None
        sped_vbc = (c190_tot or {}).get("VL_BC_ICMS")
        sped_vicms = (c190_tot or {}).get("VL_ICMS")
        sped_vbcst = (c190_tot or {}).get("VL_BC_ICMS_ST")
        sped_vst = (c190_tot or {}).get("VL_ICMS_ST")
        sped_vipi = (c190_tot or {}).get("VL_IPI")

        xml_mod_n = norm_int_like(n.get("mod"))
        spd_mod_n = norm_int_like(e_row.get("COD_MOD") if e_row else None)
        xml_ser_n = norm_int_like(n.get("serie"))
        spd_ser_n = norm_int_like(e_row.get("SER") if e_row else None)
        xml_num_n = norm_int_like(n.get("nNF"))
        spd_num_n = norm_int_like(e_row.get("NUM_DOC") if e_row else None)

        rows_notes.append({
            "CHAVE": ch,
            "Emitente - Razão Social": n.get("emit_xNome"),
            "Emitente - CNPJ": n.get("emit_CNPJ"),
            "Destinatário - Razão Social": n.get("dest_xNome"),
            "Destinatário - CNPJ": n.get("dest_CNPJ"),
            "NATUREZA (XML)": n.get("natOp"),
            "tpNF (XML)": n.get("tpNF"),
            "IND_OPER (SPED)": e_row.get("IND_OPER") if e_row else None,
            "XML_mod": n.get("mod"), "SPED_COD_MOD": e_row.get("COD_MOD") if e_row else None,
            "XML_SER": n.get("serie"), "SPED_SER": e_row.get("SER") if e_row else None,
            "XML_nNF": n.get("nNF"), "SPED_NUM_DOC": e_row.get("NUM_DOC") if e_row else None,
            "XML_vNF": n.get("vNF"), "SPED_VL_DOC": sped_vnf,
            "Delta vNF": None if (sped_vnf is None or n.get("vNF") is None) else round(float(n["vNF"]) - float(sped_vnf), 2),
            "XML_vFrete": n.get("vFrete"), "SPED_VL_FRT": sped_vfrt,
            "Delta Frete": None if (sped_vfrt is None or n.get("vFrete") is None) else round(float(n["vFrete"]) - float(sped_vfrt), 2),
            "XML_vDesc": n.get("vDesc"), "SPED_VL_DESC": sped_vdesc,
            "Delta Desconto": None if (sped_vdesc is None or n.get("vDesc") is None) else round(float(n["vDesc"]) - float(sped_vdesc), 2),
            # Totais oficiais via C190:
            "XML_vBC": n.get("vBC"), "SPED_vBC (C190)": sped_vbc,
            "Delta Base ICMS": None if (sped_vbc is None or n.get("vBC") is None) else round(float(n["vBC"]) - float(sped_vbc), 2),
            "XML_vICMS": n.get("vICMS"), "SPED_vICMS (C190)": sped_vicms,
            "Delta ICMS": None if (sped_vicms is None or n.get("vICMS") is None) else round(float(n["vICMS"]) - float(sped_vicms), 2),
            "XML_vBCST": n.get("vBCST"), "SPED_vBCST (C190)": sped_vbcst,
            "Delta Base ST": None if (sped_vbcst is None or n.get("vBCST") is None) else round(float(n["vBCST"]) - float(sped_vbcst), 2),
            "XML_vST": n.get("vST"), "SPED_vST (C190)": sped_vst,
            "Delta ST": None if (sped_vst is None or n.get("vST") is None) else round(float(n["vST"]) - float(sped_vst), 2),
            "XML_vIPI": n.get("vIPI"), "SPED_vIPI (C190)": sped_vipi,
            "Delta IPI": None if (sped_vipi is None or n.get("vIPI") is None) else round(float(n["vIPI"]) - float(sped_vipi), 2),
            "SPED_COD_SIT": e_row.get("COD_SIT") if e_row else None,
            "mod (norm)": xml_mod_n, "COD_MOD (norm)": spd_mod_n,
            "serie (norm)": xml_ser_n, "SER (norm)": spd_ser_n,
            "nNF (norm)": xml_num_n, "NUM_DOC (norm)": spd_num_n,
        })

        for det in n.get("items", []):
            rows_items.append({
                "CHAVE": ch,
                "Emitente - Razão Social": n.get("emit_xNome"),
                "Destinatário - Razão Social": n.get("dest_xNome"),
                "Natureza (XML)": n.get("natOp"),
                "CFOP": det.get("CFOP"),
                "Direção CFOP": cfop_first_digit(det.get("CFOP")),
                "xProd": det.get("xProd"),
                "qCom": det.get("qCom"),
                "vProd": det.get("vProd"),
                "ICMS CST/CSOSN": det.get("ICMS", {}).get("CST") or det.get("ICMS", {}).get("CSOSN"),
                "ICMS vBC": det.get("ICMS", {}).get("vBC"),
                "ICMS pICMS": det.get("ICMS", {}).get("pICMS"),
                "ICMS vICMS": det.get("ICMS", {}).get("vICMS"),
            })

    notes_df = pd.DataFrame(rows_notes)
    items_df = pd.DataFrame(rows_items)

    # Função auxiliar para inferir direção (deve estar antes do uso)
    def infer_direcao_nf(row: pd.Series, empresa: ContextoEmpresa) -> Optional[str]:
        ind = str(row.get("IND_OPER (SPED)") or "").strip()
        if ind in ("0", "1"):
            return "Entrada" if ind == "0" else "Saída"
        tp = str(row.get("tpNF (XML)") or "").strip()
        if tp in ("0", "1"):
            return "Entrada" if tp == "0" else "Saída"
        try:
            cnpj_emp = (empresa.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
            emit_cnpj = str(row.get("Emitente - CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
            dest_cnpj = str(row.get("Destinatário - CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
            if cnpj_emp and cnpj_emp == emit_cnpj:
                return "Saída"
            if cnpj_emp and cnpj_emp == dest_cnpj:
                return "Entrada"
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
        return None




    # ======= BLOCO INSERIDO: separação por direção (Notas/Itens) =======
    dir_col = "Direção (inferida)"
    try:
        if not notes_df.empty:
    # Função auxiliar para inferir direção (deve estar antes do uso)
            notes_df[dir_col] = notes_df.apply(lambda r: infer_direcao_nf(r, emp), axis=1)
        else:
            notes_df[dir_col] = pd.Series(dtype="object")
    except Exception:
        notes_df[dir_col] = pd.Series(dtype="object")

    notes_entradas = notes_df[notes_df[dir_col] == "Entrada"].copy()
    notes_saidas   = notes_df[notes_df[dir_col] == "Saída"].copy()

    try:
        if not items_df.empty and "Direção CFOP" in items_df.columns:
            itens_entradas = items_df[items_df["Direção CFOP"] == "Entrada"].copy()
            itens_saidas   = items_df[items_df["Direção CFOP"] == "Saída"].copy()
        else:
            itens_entradas = pd.DataFrame()
            itens_saidas   = pd.DataFrame()
    except Exception:
        itens_entradas = pd.DataFrame()
        itens_saidas   = pd.DataFrame()
    # ======= FIM BLOCO INSERIDO =======
    
    # Ajustes de direção (Entrada/Saída)
    if not xml_notes:
        out["Checklist"] = pd.DataFrame([("Sem XMLs processados", "")], columns=["Item", "Valor"])
        return out

    # CT-e
    cte_xml_df = pd.DataFrame(cte_notes)
    cte_xml_ent = pd.DataFrame()
    cte_xml_sai = pd.DataFrame()
    cte_d100_ent = pd.DataFrame()
    cte_d100_sai = pd.DataFrame()
    cte_div_df = pd.DataFrame()
    # Normalização de chaves (remove zeros à esquerda e não dígitos)
    def _to_int_clean(s):
        return pd.to_numeric(
            pd.Series(s, dtype="object").astype(str).str.replace(r"[^0-9]", "", regex=True).str.lstrip("0").replace({"": "0"}),
            errors="coerce"
        ).fillna(0).astype(int)

    if not cte_xml_df.empty:
        try:
            cte_xml_df["serie"] = _to_int_clean(cte_xml_df.get("serie"))
            cte_xml_df["nCT"] = _to_int_clean(cte_xml_df.get("nCT"))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
    if not d100_df.empty:
        try:
            d100_df["SER"] = _to_int_clean(d100_df.get("SER"))
            d100_df["NUM_DOC"] = _to_int_clean(d100_df.get("NUM_DOC"))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
    if not d190_df.empty:
        try:
            d190_df["SER"] = _to_int_clean(d190_df.get("SER"))
            d190_df["NUM_DOC"] = _to_int_clean(d190_df.get("NUM_DOC"))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)


    if not d100_df.empty and "IND_OPER" in d100_df.columns:
        cte_d100_ent = d100_df[d100_df["IND_OPER"].astype(str).str.strip() == "0"].copy()
        cte_d100_sai = d100_df[d100_df["IND_OPER"].astype(str).str.strip() == "1"].copy()

    if not cte_xml_df.empty:
        def dd(a, b):
            try:
                return round(float(a or 0.0) - float(b or 0.0), 2)
            except Exception:
                return None
        # join por (SER, NUM_DOC) quando houver
        if not d100_df.empty:
            d100_join = d100_df[["SER", "NUM_DOC", "VL_SERV", "VL_BC_ICMS", "VL_ICMS"]].copy()
            cte_join = cte_xml_df.merge(d100_join, how="left", left_on=["serie", "nCT"], right_on=["SER", "NUM_DOC"])
            rows = []
            for _, r in cte_join.iterrows():
                rows.extend([
                    {"Categoria": "Diferença de valores (CT-e)", "Chave": r.get("CHAVE"), "Campo": "vTPrest",
                     "No XML": r.get("vTPrest"), "No SPED": r.get("VL_SERV"), "Delta": dd(r.get("vTPrest"), r.get("VL_SERV"))},
                    {"Categoria": "Diferença de valores (CT-e)", "Chave": r.get("CHAVE"), "Campo": "Base ICMS",
                     "No XML": r.get("vBC"), "No SPED": r.get("VL_BC_ICMS"), "Delta": dd(r.get("vBC"), r.get("VL_BC_ICMS"))},
                    {"Categoria": "Diferença de valores (CT-e)", "Chave": r.get("CHAVE"), "Campo": "ICMS",
                     "No XML": r.get("vICMS"), "No SPED": r.get("VL_ICMS"), "Delta": dd(r.get("vICMS"), r.get("VL_ICMS"))},
                ])
            cte_div_df = pd.DataFrame(rows)

    # NF-es que não estão no SPED
    xml_keys = {n["CHAVE"] for n in xml_notes}
    efd_keys_valid = {k for k in efd_valid["CHV_NFE"] if isinstance(k, str) and k}
    for ch in (xml_keys - efd_keys_valid):
        issues.append({
            "Categoria": "NF-e não encontrada no SPED",
            "Chave NF-e": ch, "Onde": "SPED C100", "Campo": "CHV_NFE",
            "No XML": "Existe", "No SPED": "Não existe",
            "Regra": "Lançar nota no C100",
            "Severidade": "Alta", "Sugestão": "Escriturar a NF-e",
            "Descrição": "A chave existe nos XMLs informados mas não foi localizada no C100."
        })

    # Diferenças de cabeçalho (triple key)
    for n in xml_notes:
        ch = n["CHAVE"]
        e_row = efd_map.get(ch)
        if not e_row:
            k = (norm_int_like(n.get("mod")), norm_int_like(n.get("serie")), norm_int_like(n.get("nNF")))
            if None not in k:
                e_row = efd_map_by_triple.get(k)
        if not e_row:
            continue
        # compara mod/serie/numero
        diffs = []
        if norm_int_like(e_row.get("COD_MOD")) != norm_int_like(n.get("mod")):
            diffs.append("modelo")
        if norm_int_like(e_row.get("SER")) != norm_int_like(n.get("serie")):
            diffs.append("série")
        if norm_int_like(e_row.get("NUM_DOC")) != norm_int_like(n.get("nNF")):
            diffs.append("número")
        if diffs:
            issues.append({
                "Categoria": "Diferença nos dados básicos (cabeçalho)",
                "Chave NF-e": ch, "Onde": "XML × SPED", "Campo": " ; ".join(diffs),
                "No XML": f"mod/ser/num={n.get('mod')}/{n.get('serie')}/{n.get('nNF')}",
                "No SPED": f"mod/ser/num={e_row.get('COD_MOD')}/{e_row.get('SER')}/{e_row.get('NUM_DOC')}",
                "Regra": "Cabeçalho deve bater",
                "Severidade": "Média",
                "Sugestão": "Ajustar cabeçalho na escrituração",
                "Descrição": "Há divergência entre os dados básicos da NF-e e o C100.",
            })

    # “Itens (XML)” já está pronto (rows_items)

    # Detalhamento vNF recalculado
    det_vnf_rows = []
    
    for n in xml_notes:
        try:
            vcalc = recompute_vnf_from_totals(n)
            if abs(vcalc - float(n.get("vNF") or 0.0)) > 0.02:
                det_vnf_rows.append({
                    "CHAVE": n["CHAVE"],
                    "XML_vNF": n.get("vNF"), 
                    "vNF_recalculado": vcalc,
                    "Delta": round(vcalc - float(n.get("vNF") or 0.0), 2)
                })
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)

    det_vnf_df = pd.DataFrame(det_vnf_rows)

    # Papel esperado x IND_OPER
    det_role_rows = []
    for n in xml_notes:
        ch = n["CHAVE"]
        e_row = efd_map.get(ch) or efd_map_by_triple.get((
            norm_int_like(n.get("mod")), norm_int_like(n.get("serie")), norm_int_like(n.get("nNF"))
        ))
        ind_oper = (e_row.get("IND_OPER") if e_row else None)
        emit = (n.get("emit_CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
        dest = (n.get("dest_CNPJ") or "").replace(".", "").replace("/", "").replace("-", "")
        papel_esperado, ok = None, True
        if emp.cnpj:
            ecnpj = emp.cnpj.replace(".", "").replace("/", "").replace("-", "")
            if ecnpj and ecnpj == emit:
                papel_esperado, ok = "Saída (empresa é emitente) → IND_OPER=1", (ind_oper in ("1", ""))
            elif ecnpj and ecnpj == dest:
                papel_esperado, ok = "Entrada (empresa é destinatária) → IND_OPER=0", (ind_oper in ("0", ""))
        if papel_esperado and not ok:
            det_role_rows.append({
                "CHAVE": ch, "nNF": n.get("nNF"), "Série": n.get("serie"),
                "dhEmi": n.get("dhEmi"), "emit_CNPJ": emit, "dest_CNPJ": dest,
                "IND_OPER (SPED)": ind_oper, "Papel esperado": papel_esperado
            })
    det_role_df = pd.DataFrame(det_role_rows)

    # Saídas (aba “Notas (+Natureza)”, Entradas, Saídas, Itens)
    if not notes_df.empty:
        out["Notas (+Natureza)"] = notes_df
    if not notes_entradas.empty:
        out["Notas Entradas"] = notes_entradas
    if not notes_saidas.empty:
        out["Notas Saídas"] = notes_saidas
    if not items_df.empty:
        out["Itens (XML)"] = items_df

        out["Itens (Entradas)"] = itens_entradas
        out["Itens (Saídas)"] = itens_saidas
    # CT-e
    # desativado: if not cte_xml_df.empty:
        # out["CTe (XML)"] = cte_xml_df
    # desativado: if not d100_df.empty:
        # out["CTe D100 (SPED)"] = d100_df
    # desativado: if not d190_df.empty:

    # === CT-e (XML x D100 x D190) — única aba unificada (Série+Número) ===
    try:
        # bases com as colunas relevantes
        df_xml = cte_xml_df.copy() if not cte_xml_df.empty else pd.DataFrame(columns=["serie","nCT","FILE","CHAVE","mod","dhEmi","vTPrest","vBC","vICMS"])
        df_d100 = d100_df.copy() if not d100_df.empty else pd.DataFrame(columns=["SER","NUM_DOC","CHV_CTE","VL_DOC","VL_SERV","VL_BC_ICMS","VL_ICMS","IND_OPER"])
        df_d190 = d190_df.copy() if not d190_df.empty else pd.DataFrame(columns=["SER","NUM_DOC","VL_BC_ICMS","VL_ICMS"])

        # strings auxiliares sem zeros à esquerda
        def _norm(s):
            series = pd.Series(s, dtype="object")
            # Usar infer_objects para evitar warning de downcasting
            filled = series.fillna("").infer_objects(copy=False)
            return filled.astype(str).str.replace(r"[^0-9]", "", regex=True).str.lstrip("0").replace({"": "0"})

        if not df_xml.empty:
            df_xml["SER_str"] = _norm(df_xml["serie"])
            df_xml["NUM_str"] = _norm(df_xml["nCT"])
        if not df_d100.empty:
            df_d100["SER_str"] = _norm(df_d100["SER"])
            df_d100["NUM_str"] = _norm(df_d100["NUM_DOC"])
            df_d100 = df_d100.rename(columns={
                "VL_DOC":"D100_VL_DOC","VL_SERV":"D100_VL_SERV","VL_BC_ICMS":"D100_VL_BC_ICMS","VL_ICMS":"D100_VL_ICMS",
                "IND_OPER":"D100_IND_OPER","CHV_CTE":"D100_CHV_CTE"
            })
        if not df_d190.empty:
            df_d190["SER_str"] = _norm(df_d190["SER"])
            df_d190["NUM_str"] = _norm(df_d190["NUM_DOC"])
            if "VL_BC_ICMS" not in df_d190.columns:
                for c in df_d190.columns:
                    if c.upper().endswith("BC_ICMS"):
                        df_d190["VL_BC_ICMS"] = df_d190[c]; break
            if "VL_ICMS" not in df_d190.columns:
                for c in df_d190.columns:
                    if c.upper().endswith("ICMS") and "BC" not in c.upper():
                        df_d190["VL_ICMS"] = df_d190[c]; break
            df_d190 = df_d190.rename(columns={"VL_BC_ICMS":"D190_VL_BC_ICMS","VL_ICMS":"D190_VL_ICMS"})

        # base de chaves (outer) para garantir unificação
        keys = pd.DataFrame(columns=["SER_str","NUM_str"])
        for df in (df_xml, df_d100, df_d190):
            if not df.empty:
                keys = pd.concat([keys, df[["SER_str","NUM_str"]]], ignore_index=True)
        keys = keys.drop_duplicates()

        if not keys.empty:
            comp = keys.copy()
            if not df_xml.empty:
                comp = comp.merge(df_xml[["SER_str","NUM_str","FILE","CHAVE","mod","serie","nCT","dhEmi","vTPrest","vBC","vICMS"]], how="left", on=["SER_str","NUM_str"])
            if not df_d100.empty:
                comp = comp.merge(df_d100[["SER_str","NUM_str","D100_CHV_CTE","D100_VL_DOC","D100_VL_SERV","D100_VL_BC_ICMS","D100_VL_ICMS","D100_IND_OPER"]], how="left", on=["SER_str","NUM_str"])
            if not df_d190.empty:
                comp = comp.merge(df_d190[["SER_str","NUM_str","D190_VL_BC_ICMS","D190_VL_ICMS"]], how="left", on=["SER_str","NUM_str"])

            # deltas (quando possível)
            def _fnum(x):
                try:
                    return float(str(x).replace(",", "."))
                except Exception:
                    return None
            if "vTPrest" in comp and "D100_VL_SERV" in comp:
                comp["Delta_vTPrest_vs_D100"] = (comp["vTPrest"].apply(_fnum) - comp["D100_VL_SERV"].apply(_fnum)).round(2)
            if "vBC" in comp and "D100_VL_BC_ICMS" in comp:
                comp["Delta_vBC_vs_D100"] = (comp["vBC"].apply(_fnum) - comp["D100_VL_BC_ICMS"].apply(_fnum)).round(2)
            if "vICMS" in comp and "D100_VL_ICMS" in comp:
                comp["Delta_vICMS_vs_D100"] = (comp["vICMS"].apply(_fnum) - comp["D100_VL_ICMS"].apply(_fnum)).round(2)
            if "vBC" in comp and "D190_VL_BC_ICMS" in comp:
                comp["Delta_vBC_vs_D190"] = (comp["vBC"].apply(_fnum) - comp["D190_VL_BC_ICMS"].apply(_fnum)).round(2)
            if "vICMS" in comp and "D190_VL_ICMS" in comp:
                comp["Delta_vICMS_vs_D190"] = (comp["vICMS"].apply(_fnum) - comp["D190_VL_ICMS"].apply(_fnum)).round(2)

            cols = [c for c in [
                "SER_str","NUM_str","FILE","CHAVE","mod","serie","nCT","dhEmi","vTPrest","vBC","vICMS",
                "D100_CHV_CTE","D100_VL_DOC","D100_VL_SERV","D100_VL_BC_ICMS","D100_VL_ICMS","D100_IND_OPER",
                "D190_VL_BC_ICMS","D190_VL_ICMS",
                "Delta_vTPrest_vs_D100","Delta_vBC_vs_D100","Delta_vICMS_vs_D100","Delta_vBC_vs_D190","Delta_vICMS_vs_D190"
            ] if c in comp.columns]
            out["CT-e (XML x D100 x D190)"] = comp[cols].copy()
    except Exception as e:
        logging.warning("Aviso (validators): %s", e)
        # out["CTe D190 (SPED)"] = d190_df
    if not cte_xml_ent.empty:
        out["CTe (Entradas)"] = cte_xml_ent
    if not cte_xml_sai.empty:
        out["CTe (Saídas)"] = cte_xml_sai
    if not cte_div_df.empty:
        out["Divergencias (CT-e)"] = cte_div_df

    # Issues em abas dedicadas
    issues_df = pd.DataFrame(issues)
    if not issues_df.empty:
        cols = ["Categoria", "Chave NF-e", "Onde", "Campo", "No XML", "No SPED", "Regra", "Severidade", "Sugestão", "Descrição"]
        out["Divergencias (todas)"] = issues_df[cols].copy()
        mapping = {
            "Arquivo não é NF-e (evento/cancelamento)": "Eventos inválidos",
            "NF-e não encontrada no SPED": "Notas não escrituradas",
            "Diferença nos dados básicos (cabeçalho)": "Diferenças de cabeçalho",
            "Diferença de valores": "Diferenças de valores",
        }
        for cat, nm in mapping.items():
            dfc = issues_df[issues_df["Categoria"] == cat]
            if not dfc.empty:
                out[nm] = dfc[cols].copy()


    
    # ==== Regras opcionais (rules.yml via validators.py) ====
    try:
        from pathlib import Path as _P
        import validators  # tenta importar
    except Exception:
        validators = None

    if validators is not None:
        try:
            rules = rules or validators.load_rules(_P("rules.yml")) or validators.default_rules()

            # 1) CFOP × CST
            try:
                df_cfop_cst = validators.check_cfop_cst(xml_notes, rules)
                out["Regras: CFOP × CST (rules.yml)"] = df_cfop_cst
                out["CST × XML × YML"] = df_cfop_cst
            except Exception as e:
                logging.warning("Aviso (validators): %s", e)

            # 2) NCM exige CEST
            try:
                df_cest = validators.check_cest_required(xml_notes, rules)
                if hasattr(df_cest, "empty") and not df_cest.empty:
                    out["Regras: NCM exige CEST (rules.yml)"] = df_cest
            except Exception as e:
                logging.warning("Aviso (validators): %s", e)
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)


    # ==== Enriquecimento da Checklist (RESUMO + KPIs) ====
    try:
        # RESUMO
        checklist.insert(0, ("== RESUMO ==", ""))
        xml_total = (len(notes_df) if "notes_df" in locals() and isinstance(notes_df, pd.DataFrame) else 0)
        encontrados = 0
        if xml_total:
            cols_sped = [c for c in ["SPED_VL_DOC","SPED_SER","SPED_NUM_DOC","SPED_vBC (C190)","SPED_vICMS (C190)"] if c in notes_df.columns]
            if cols_sped:
                any_sped = notes_df[cols_sped].notna().any(axis=1)
                encontrados = int(any_sped.sum())
        nao_encontrados = max(0, xml_total - encontrados)
        checklist.insert(1, ("XML processados", xml_total))
        checklist.insert(2, ("Encontrados no SPED", encontrados))
        checklist.insert(3, ("Não encontrados", nao_encontrados))

        # Divergências totais (issues + CT-e)
        issues_df = pd.DataFrame(issues) if "issues" in locals() else pd.DataFrame()
        div_total = int(issues_df.shape[0]) if not issues_df.empty else 0
        checklist.insert(4, ("Divergências (total)", div_total))

        # Marcador de seção
        checklist.append(("== CHECKLIST ==", ""))

        # XMLs inválidos / Evento
        inv_count = 0
        if not issues_df.empty and "Categoria" in issues_df.columns:
            inv_count = int((issues_df["Categoria"] == "Arquivo não é NF-e (evento/cancelamento)").sum())
        checklist.append(("XMLs inválidos/Evento (ignorados)", inv_count))

        # NF-es sem C100 (não escrituradas)
        nao_escr = 0
        if not issues_df.empty and "Categoria" in issues_df.columns:
            nao_escr = int((issues_df["Categoria"] == "NF-e não encontrada no SPED").sum())
        checklist.append(("NF-es sem C100 (não escrituradas)", nao_escr))

        # C100 sem XML correspondente
        c100_sem_xml = 0
        try:
            if "efd_valid" in locals():
                sped_keys = set([k for k in efd_valid["CHV_NFE"] if isinstance(k, str) and k])
                xml_keys = set(notes_df["CHAVE"].dropna().astype(str)) if xml_total else set()
                c100_sem_xml = int(sum(1 for k in sped_keys if k not in xml_keys))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
            checklist.append(("C100 sem XML correspondente", c100_sem_xml))

        # C100 duplicados (por chave)
        dup_por_chave = 0
        try:
            if "efd_valid" in locals():
                vc = efd_valid["CHV_NFE"].value_counts()
                dup_por_chave = int((vc > 1).sum())
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
            checklist.append(("C100 duplicados (por chave)", dup_por_chave))

        # Matches
        checklist.append(("Matches XML<>SPED (C100)", encontrados))

        # Diferenças de cabeçalho
        diff_cab = 0
        if not issues_df.empty and "Categoria" in issues_df.columns:
            diff_cab = int((issues_df["Categoria"] == "Diferença nos dados básicos (cabeçalho)").sum())
        checklist.append(("Diferenças de cabeçalho (Modelo/Série/Número)", diff_cab))

        # Diferenças de valores (via deltas do comparativo)
        diff_val = 0
        if xml_total:
            delta_cols = [c for c in ["Delta vNF","Delta Frete","Delta Desconto","Delta Base ICMS","Delta ICMS","Delta Base ST","Delta ST","Delta IPI"] if c in notes_df.columns]
            if delta_cols:
                # Usar apply para evitar warning de applymap (deprecated)
                # Aplicar função a cada célula do DataFrame
                def check_delta(x):
                    try:
                        if x is None or (isinstance(x, float) and (x != x)):  # NaN check
                            return False
                        return abs(float(x)) > tol
                    except (ValueError, TypeError):
                        return False
                
                # Usar apply em cada coluna e depois any
                mask = notes_df[delta_cols].apply(lambda col: col.apply(check_delta), axis=0).any(axis=1)
                diff_val = int(mask.sum())
        checklist.append(("Diferenças de valores (Total/Frete/Desconto/BC ICMS/ICMS/BC ST/ST/IPI via C190)", diff_val))
        
        # Divergências C170 x C190
        try:
            from validators import check_c170_equals_c190, check_divergencias_legitimas_c170_c190
            divergencias_c170_c190 = check_c170_equals_c190(efd_path)
            
            # Verificar se houve erro na verificação (campo CAMPO == "ERRO")
            tem_erro = False
            if not divergencias_c170_c190.empty and "CAMPO" in divergencias_c170_c190.columns:
                tem_erro = (divergencias_c170_c190["CAMPO"] == "ERRO").any()
                if tem_erro:
                    # Extrair mensagem de erro se disponível
                    erro_row = divergencias_c170_c190[divergencias_c170_c190["CAMPO"] == "ERRO"].iloc[0]
                    mensagem_erro = erro_row.get("MENSAGEM_ERRO", "Erro desconhecido") if "MENSAGEM_ERRO" in divergencias_c170_c190.columns else "Erro ao processar C170 x C190"
                    logging.error(f"Erro na verificação C170 x C190: {mensagem_erro}")
                    checklist.append(("Divergências C170 x C190", f"Erro: {mensagem_erro[:50]}"))
            
            # Processar normalmente se não houver erro
            if not tem_erro:
                if not divergencias_c170_c190.empty:
                    divergencias_legitimas = check_divergencias_legitimas_c170_c190(efd_path, divergencias_c170_c190)
                    # Contar divergências não legítimas (que requerem atenção)
                    if "E_LEGITIMA" in divergencias_legitimas.columns:
                        div_nao_legitimas = divergencias_legitimas[divergencias_legitimas["E_LEGITIMA"] == False]
                        checklist.append(("Divergências C170 x C190 (requerem atenção)", len(div_nao_legitimas)))
                    else:
                        checklist.append(("Divergências C170 x C190 (requerem atenção)", len(divergencias_c170_c190)))
                    # Adicionar ao relatório
                    out["C170 x C190 (Divergências)"] = divergencias_legitimas
                else:
                    checklist.append(("Divergências C170 x C190", 0))
        except Exception as e:
            error_msg = str(e)
            logging.error(f"Erro ao verificar C170 x C190: {error_msg}")
            import traceback
            traceback.print_exc()
            # Mensagem mais descritiva no checklist
            checklist.append(("Divergências C170 x C190", f"Erro: {error_msg[:50]}"))

        # Classificação de Divergências de Valores (Erro Humano vs Desconto Legítimo)
        try:
            from validators import check_divergencias_valores_legitimas
            if xml_total and not notes_df.empty:
                logging.info("Iniciando classificação de divergências de valores...")
                divergencias_valores_classificadas = check_divergencias_valores_legitimas(notes_df, efd_path)
                logging.info(f"Classificação concluída. Encontradas {len(divergencias_valores_classificadas)} divergências classificadas.")
                if not divergencias_valores_classificadas.empty:
                    # Contar por tipo de divergência
                    if "TIPO_DIVERGENCIA" in divergencias_valores_classificadas.columns:
                        erro_humano = divergencias_valores_classificadas[
                            divergencias_valores_classificadas["TIPO_DIVERGENCIA"] == "ERRO_HUMANO"
                        ]
                        desconto_legitimo = divergencias_valores_classificadas[
                            divergencias_valores_classificadas["TIPO_DIVERGENCIA"].isin([
                                "DESCONTO_CONSISTENTE", "LEGITIMA_OPERACAO", "CONSISTENTE_COM_DESCONTO"
                            ])
                        ]
                        checklist.append(("Divergências de valores - Erro Humano", len(erro_humano)))
                        checklist.append(("Divergências de valores - Descontos Legítimos", len(desconto_legitimo)))
                    # Adicionar ao relatório
                    out["Divergências de Valores (Classificadas)"] = divergencias_valores_classificadas
        except Exception as e:
            logging.warning(f"Erro ao classificar divergências de valores: {e}")
            import traceback
            traceback.print_exc()

        # vNF casadas + somatórios
        diff_vnf_casadas = 0
        som_xml = som_sped = 0.0
        if xml_total and {"XML_vNF","SPED_VL_DOC"}.issubset(notes_df.columns):
            nd = notes_df[notes_df[["XML_vNF","SPED_VL_DOC"]].notna().all(axis=1)].copy()
            if "Delta vNF" in nd.columns:
                diff_vnf_casadas = int((nd["Delta vNF"].abs() > tol).sum())
            som_xml = float(pd.to_numeric(nd["XML_vNF"], errors="coerce").fillna(0).sum())
            som_sped = float(pd.to_numeric(nd["SPED_VL_DOC"], errors="coerce").fillna(0).sum())
        checklist.append((f"Diferenças de vNF nas casadas (±{(TOL if 'TOL' in globals() else 0.02):.2f})", diff_vnf_casadas))
        checklist.append(("Soma vNF(XML) – Soma VL_DOC(SPED)", round(som_xml - som_sped, 2)))

        # Períodos auxiliares
        try:
            if xml_total and "dhEmi" in notes_df.columns:
                xs = notes_df["dhEmi"].dropna().astype(str).tolist()
                if xs:
                    checklist.append(("Período XML (dhEmi) [min..max]", f"{min(xs)} .. {max(xs)}"))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)
        try:
            if "efd_valid" in locals() and not efd_valid.empty and "DT_DOC" in efd_valid.columns:
                dt = efd_valid["DT_DOC"].dropna()
                min_sped = str(dt.min()) if not dt.empty else "N/D"
                max_sped = str(dt.max()) if not dt.empty else "N/D"
                checklist.append(("Período SPED (DT_DOC) [min..max]", f"{min_sped} .. {max_sped}"))
        except Exception as e:
            logging.warning("Aviso (validators): %s", e)

        # CT-e — divergências no comparativo unificado
        try:
            ct_div = 0
            if "CT-e (XML x D100 x D190)" in out:
                df_ct = out["CT-e (XML x D100 x D190)"]
                delta_cols_ct = [c for c in ["Delta_vTPrest_vs_D100","Delta_vBC_vs_D100","Delta_vICMS_vs_D100","Delta_vBC_vs_D190","Delta_vICMS_vs_D190"] if c in df_ct.columns]
                if delta_cols_ct:
                    ct_div = int(df_ct[delta_cols_ct].applymap(lambda x: abs(float(x)) > 0 if x is not None and x == x else False).any(axis=1).sum())
            checklist.append(("Divergências CT-e (total)", ct_div))
        except Exception:
            checklist.append(("Divergências CT-e (total)", "N/D"))
    except Exception as e:
        logging.warning("Aviso (validators): %s", e)
    # =====================================

    # Checklist final
    out["Checklist"] = pd.DataFrame(checklist, columns=["Item", "Valor"])

    if not det_vnf_df.empty:
        out["Det_vNF_recalculado"] = det_vnf_df
    if not det_role_df.empty:
        out["Det_tpNF_vs_IND_OPER"] = det_role_df

    # Checklist como última aba
    if 'Checklist' in out:
        ck = out.pop('Checklist')
        out['Checklist'] = ck

    
    # ======= BLOCO INSERIDO: ordem visual das abas =======
    try:
        out.setdefault("__order__", [
            ("Cadastro (0150) x XML", "Cadastro (0150) x XML"),
            ("Apuração (E110)", "Apuração (E110)"),
            ("Ajustes (C197)", "Ajustes (C197)"),
            ("Notas (+Natureza)", "Notas (+Natureza)"),
            ("notas_entradas", "Notas Entradas"),
            ("notas_saidas", "Notas Saídas"),
            ("itens_entradas", "Itens (Entradas)"),
            ("itens_saidas", "Itens (Saídas)"),
            ("CT-e (XML x D100 x D190)", "CT-e (XML x D100 x D190)"),
            ("Divergencias (todas)", "Divergencias (todas)"),
            ("Eventos inválidos", "Eventos inválidos"),
            ("Det_tpNF_vs_IND_OPER", "Det_tpNF_vs_IND_OPER"),
            ("Checklist", "Checklist"),
        ])
    except Exception:
        pass
    # ======= FIM BLOCO INSERIDO =======
    return out
    