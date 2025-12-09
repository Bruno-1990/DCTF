# -*- coding: utf-8 -*-
"""
validators.py — Camada de validações EFD x XML
Refatorado para ampliar cobertura (conforme Guia Prático EFD ICMS/IPI e layout do Ato COTEPE)
sem quebrar compatibilidade com chamadas existentes.

Principais melhorias:
- Mantém: check_cfop_cst, check_cest_required, load_rules/default_rules.
- Novo: checagens estruturais C100↔C170↔C190; presença de cadastros 0150/0190/0200; 
        apurações (E110/E111/E112, E310/E311, E500/E510/E520);
        consistência de chaves NF-e; CFOP x destino (derived);
        indício de DIFAL/FCP (XML) vs ausência de E310/E311 (EFD);
        comparações de totais com tolerância common.TOL.
- Seguro: se pandas/yaml ausentes ou arquivos ausentes, retorna DFs vazios.

Obs.: Regras “derived” (apoio) sinalizam incoerências de parametrização e não 
contradizem o PVA; regras “efd” seguem a estrutura/consistência exigidas pelo Guia.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import re
import sys

def load_rules_for_sector(sector: Optional[str] = None, sectors: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Carrega rules/base.yml + rules/<setor>.yml (merge).
    sector: nome do arquivo em rules/ (sem .yml), ex: "autopecas" (compatibilidade)
    sectors: lista de setores para fazer merge de múltiplas regras
    """
    import yaml
    from pathlib import Path

    base_path = Path("rules/base.yml")
    rules = {}
    if base_path.exists():
        rules.update(yaml.safe_load(base_path.read_text(encoding="utf-8")) or {})

    # Determinar lista de setores
    setores_list = []
    if sectors and len(sectors) > 0:
        setores_list = [s.strip() for s in sectors if s and s.strip()]
    elif sector:
        setores_list = [sector.strip()] if sector.strip() else []

    # Carregar e fazer merge de cada setor
    for setor in setores_list:
        if not setor:
            continue
        sec_path = Path(f"rules/{setor}.yml")
        if sec_path.exists():
            sec_rules = yaml.safe_load(sec_path.read_text(encoding="utf-8")) or {}
            # Merge profundo para estruturas aninhadas
            rules = _deep_merge(rules, sec_rules)
        else:
            print(f"Aviso: Arquivo de regras não encontrado: {sec_path}", file=sys.stderr)

    return rules or default_rules()


def _deep_merge(base: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
    """
    Faz merge profundo de dois dicionários, combinando estruturas aninhadas.
    - Para dicionários: merge recursivo (combina chaves)
    - Para listas: concatena e remove duplicatas quando possível
    - Para outras estruturas: sobrescreve (update tem prioridade)
    
    Especial para regras YAML:
    - cfop_expected: merge de dicionários (combina CFOPs de diferentes setores)
    - ncm_st: merge de dicionários (combina NCMs de diferentes setores)
    - rules: merge de listas (combina regras de diferentes setores)
    """
    result = base.copy()
    
    for key, value in update.items():
        if key in result:
            if isinstance(result[key], dict) and isinstance(value, dict):
                # Merge recursivo para dicionários
                result[key] = _deep_merge(result[key], value)
            elif isinstance(result[key], list) and isinstance(value, list):
                # Concatenar listas
                combined = result[key] + value
                # Tentar remover duplicatas baseado em IDs ou conteúdo
                if combined:
                    try:
                        # Se são dicionários com 'id', usar id como chave
                        if all(isinstance(item, dict) and 'id' in item for item in combined):
                            seen = {}
                            for item in combined:
                                item_id = item.get('id')
                                if item_id not in seen:
                                    seen[item_id] = item
                            result[key] = list(seen.values())
                        else:
                            # Tentar remover duplicatas simples
                            result[key] = list(dict.fromkeys(combined)) if all(
                                isinstance(item, (str, int, float)) for item in combined
                            ) else combined
                    except (TypeError, AttributeError):
                        result[key] = combined
                else:
                    result[key] = []
            else:
                # Para valores não-dict e não-list, update sobrescreve base
                result[key] = value
        else:
            result[key] = value
    
    return result


try:
    import pandas as pd
except Exception:  # fallback leve
    pd = None  # type: ignore

try:
    import yaml  # type: ignore
except Exception:
    yaml = None  # type: ignore

# ===== deps locais (projeto) =====
try:
    from common import TOL
except Exception:
    TOL = 0.02  # tolerância padrão

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _load_yaml(path: Path) -> Dict[str, Any]:
    if yaml is None or not path or not path.exists():
        return {}
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def load_rules(path: Optional[Path]) -> Dict[str, Any]:
    if path is None:
        return {}
    return _load_yaml(path)


def default_rules() -> Dict[str, Any]:
    # fallback mínimo (mantido do validador original)
    return {
        "version": 1,
        "features": {"validate": {"cfop_cst_coherence": True, "cest_required": True}},
        "cfop_expected": {
            "5915": {"expected_cst": ["050"], "notes": ["ICMS suspenso (conserto)"]},
            "5916": {"expected_cst": ["050"], "notes": ["ICMS suspenso (industrialização)"]},
        },
        "ncm_st": {"40169300": {"requires_cest": True}},
    }


def _df(rows: List[Dict[str, Any]], columns: Optional[List[str]] = None):
    """Cria DataFrame de forma segura (sem pandas → retorna lista)."""
    if pd is None:
        return rows
    import pandas as _pd
    if not rows:
        return _pd.DataFrame(columns=columns or [])
    if columns:
        return _pd.DataFrame(rows, columns=columns)
    return _pd.DataFrame(rows)


def _has_any_line(file_path: Path, prefix: str) -> bool:
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith(prefix):
                    return True
    except Exception:
        pass
    return False


def _parse_rows(file_path: Path, prefix: str) -> List[List[str]]:
    """
    Parse linhas do SPED preservando campos vazios.
    Usa split_sped_line do parsers para garantir indexação correta.
    """
    from parsers import split_sped_line
    rows: List[List[str]] = []
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith(prefix):
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fields = split_sped_line(ln)
                    rows.append(fields)
    except Exception:
        return []
    return rows





# --- helpers CFOP×CST com condições (seguros) -------------------------------
def _to_float(x):
    try:
        s = str(x).strip()
        if "," in s and s.count(",") == 1:
            s = s.replace(".", "").replace(",", ".")
        return float(s)
    except Exception:
        try:
            return float(x)
        except Exception:
            return 0.0

def _icms_get(icms: dict, key: str):
    """Busca recursiva por campos ICMS em nós como ICMS00/ICMS20/ICMS40/ICMS60/ICMS70/etc."""
    if not isinstance(icms, dict):
        return None
    if key in icms:
        return icms.get(key)
    for v in icms.values():
        if isinstance(v, dict):
            found = _icms_get(v, key)
            if found is not None:
                return found
    return None

def _has_st(icms: dict) -> bool:
    for k in ("vBCST","vICMSST","vBCSTRet","vICMSSTRet"):
        if _to_float(_icms_get(icms, k)) > 0:
            return True
    return False

def _has_desoneracao(icms: dict) -> bool:
    return _to_float(_icms_get(icms, "vICMSDeson")) > 0 or bool(_icms_get(icms, "motDesICMS"))

def _has_reduction(icms: dict) -> bool:
    return _to_float(_icms_get(icms, "pRedBC")) > 0 or _to_float(_icms_get(icms, "pRedBCST")) > 0

def _safe_condition_eval(expr: str, icms: dict, raw_cst: str, cst3: str, is_csosn: bool) -> bool:
    """
    Avaliador seguro para condições do rules.yml (AST restrita).
    Nomes/funções permitidos: pRedBC, pRedBCST, vBC, vICMS, vBCST, vICMSST, vICMSDeson, motDesICMS,
    isCSOSN, isCST, hasST(), hasReduction(), hasDesoneracao().
    """
    import ast
    if not expr or not isinstance(expr, str):
        return True

    env = {
        "pRedBC": _to_float(_icms_get(icms, "pRedBC")),
        "pRedBCST": _to_float(_icms_get(icms, "pRedBCST")),
        "vBC": _to_float(_icms_get(icms, "vBC")),
        "vICMS": _to_float(_icms_get(icms, "vICMS")),
        "vBCST": _to_float(_icms_get(icms, "vBCST")),
        "vICMSST": _to_float(_icms_get(icms, "vICMSST")),
        "vICMSDeson": _to_float(_icms_get(icms, "vICMSDeson")),
        "motDesICMS": 1.0 if _icms_get(icms, "motDesICMS") else 0.0,
        "isCSOSN": bool(is_csosn),
        "isCST": not bool(is_csosn),
        "hasST": lambda: _has_st(icms),
        "hasReduction": lambda: _has_reduction(icms),
        "hasDesoneracao": lambda: _has_desoneracao(icms),
    }

    allowed = (
        ast.Expression, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare,
        ast.Name, ast.Load, ast.Call, ast.Constant, ast.Num, ast.Str,
        ast.And, ast.Or, ast.Not, ast.Gt, ast.GtE, ast.Lt, ast.LtE, ast.Eq, ast.NotEq,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.USub, ast.UAdd,
        ast.Tuple, ast.List
    )

    def _check(node):
        if not isinstance(node, allowed):
            raise ValueError(type(node).__name__)
        for ch in ast.iter_child_nodes(node):
            _check(ch)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in env or not callable(env[node.func.id]):
                raise ValueError("Call not allowed")
            if node.args or node.keywords:
                raise ValueError("No-args only")
        if isinstance(node, ast.Name) and node.id not in env:
            raise ValueError("Unknown name")

    try:
        tree = ast.parse(expr, mode="eval")
        _check(tree)
        return bool(eval(compile(tree, "<cond>", "eval"), {"__builtins__": {}}, env))
    except Exception:
        return False

def _normalize_expected_list(exp_list, normalize_cst_for_compare):
    """
    Aceita strings ("020") ou dicts {"code": "...", "condition": "...", "notes": "...", "severity": "..."}.
    Retorna lista de dicts padronizados (dedup).
    """
    out = []
    for item in (exp_list or []):
        if item is None:
            continue
        if isinstance(item, str):
            out.append({"code": normalize_cst_for_compare(item), "condition": None, "notes": None, "severity": None})
        elif isinstance(item, dict):
            code = normalize_cst_for_compare(item.get("code") or item.get("cst") or item.get("csosn") or "")
            cond = item.get("condition") or item.get("when") or None
            notes = item.get("notes") or item.get("note") or None
            sev = item.get("severity") or None
            if code:
                out.append({"code": code, "condition": cond, "notes": notes, "severity": sev})
    uniq = {}
    for d in out:
        key = (d["code"], d["condition"], d.get("notes"))
        if key not in uniq:
            uniq[key] = d
    return list(uniq.values())
# ---------------------------------------------------------------------------

# --- helpers de contexto por CST/CSOSN (EFD) -------------------------------
def _to_float(x):
    try:
        s = str(x).strip()
        if "," in s and s.count(",") == 1:
            s = s.replace(".", "").replace(",", ".")
        return float(s)
    except Exception:
        return 0.0

def _has_st(icms: dict) -> bool:
    # Presença de valores de ST (qualquer cenário de retenção/cobrança)
    for k in ("vBCST", "vICMSST", "vBCSTRet", "vICMSSTRet"):
        if _to_float(icms.get(k)) > 0:
            return True
    return False

def _has_desoneracao(icms: dict) -> bool:
    # ICMS 40/41/50 via desoneração/suspensão
    return _to_float(icms.get("vICMSDeson")) > 0 or bool(icms.get("motDesICMS"))

def _cst_context_ok(cst3: str, icms: dict) -> bool:
    """
    Regras de contexto por CST/CSOSN conforme EFD:
    - 000: tributado integral -> não exige campos especiais.
    - 020: redução de base -> exige pRedBC > 0.
    - 040/041: isenção/não-tributada -> requer desoneração (vICMSDeson>0 ou motDesICMS).
    - 050: suspensão -> idem desoneração.
    - 060: ST retida anteriormente -> exige presença de valores ST (retidos/cobrados).
    - 070: redução + ST -> exige pRedBC>0 E presença de ST.
    - 090: outros -> aceita (residual).
    - CSOSN 101/102/103/300/400/900: aceita (validação do regime fora deste escopo).
    - CSOSN 201/202/203: aceita, esperando ST presente (regra branda).
    """
    if cst3 == "000":
        return True
    if cst3 == "020":
        return _to_float(icms.get("pRedBC")) > 0
    if cst3 in {"040", "041", "050"}:
        return _has_desoneracao(icms)
    if cst3 == "060":
        return _has_st(icms)
    if cst3 == "070":
        return _to_float(icms.get("pRedBC")) > 0 and _has_st(icms)
    if cst3 == "090":
        return True

    # CSOSN (Simples)
    if cst3 in {"101","102","103","300","400","900"}:
        return True
    if cst3 in {"201","202","203"}:
        # brando: passa, mas ideal haver ST
        return True

    return False

# ---------------------------------------------------------------------------
# 1) Regras originais preservadas
# ---------------------------------------------------------------------------

def normalize_cst(cst: str) -> str:
    """
    Normaliza CST/CSOSN para comparação estável conforme EFD:
    - CST (00..90): aceita 1-3 dígitos; se vier com 3 e começar por '0', reduz para 2 dígitos (ex.: '000'→'00', '060'→'60').
    - CSOSN (101,102,103,201,202,203,300,400,500,900): mantém 3 dígitos.
    - Remove não numéricos antes de avaliar.
    """
    s = "" if cst is None else str(cst).strip()
    if not s:
        return ""
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    csosn_valid = {"101","102","103","201","202","203","300","400","500","900"}
    if digits in csosn_valid:
        return digits  # CSOSN (3 dígitos)
    if len(digits) == 3 and digits.startswith("0"):
        return digits[-2:]  # '000'->'00', '060'->'60'
    if len(digits) <= 2:
        return digits.zfill(2)  # '0'->'00'
    return digits


def check_cfop_cst(xml_notes: List[Dict[str, Any]], rules: Dict[str, Any]):
    """
    Valida CFOP × CST/CSOSN com condições do rules.yml.
    - expected_cst aceita ["000","060"] ou [{"code":"020","condition":"hasReduction()"}]
    - Coluna "Situação": "OK" (atendeu regra), "NOK" (divergente), "OK" (contexto EFD quando coerente tecnicamente)
    """
    if not xml_notes:
        return _df([])

    try:
        from common import normalize_cst_for_compare, NO_CREDIT_CSTS
    except Exception:
        NO_CREDIT_CSTS = {"20","40","41","50","60","70","101","102","103","300","400"}
        def normalize_cst_for_compare(cst):
            s = re.sub(r"\D", "", str(cst or "").strip())
            if not s: return ""
            if len(s) == 2: s = "0"+s
            return s.zfill(3)

    cfop_expected = (rules.get("cfop_expected") or {}) if isinstance(rules, dict) else {}
    rows: List[Dict[str, Any]] = []

    for nota in (xml_notes or []):
        ch = nota.get("CHAVE")
        for det in (nota.get("items") or []):
            cfop = str(det.get("CFOP") or "").strip()
            if not cfop or cfop not in cfop_expected:
                continue

            icms = det.get("ICMS") or {}
            raw = icms.get("CST") if icms.get("CST") not in (None,"") else icms.get("CSOSN")
            cst3 = normalize_cst_for_compare(raw)
            is_csosn = bool(icms.get("CSOSN")) and not icms.get("CST")

            exp_norm = _normalize_expected_list(cfop_expected.get(cfop, {}).get("expected_cst"), normalize_cst_for_compare)
            exp_codes = [e["code"] for e in exp_norm]
            exp_display = " | ".join(sorted(set(exp_codes))) if exp_codes else "(não definido)"

            matched = False
            cond_fail = None
            for e in exp_norm:
                if cst3 != e["code"]:
                    continue
                cond_ok = True
                if e.get("condition"):
                    cond_ok = _safe_condition_eval(e.get("condition"), icms, raw_cst=raw, cst3=cst3, is_csosn=is_csosn)
                if cond_ok:
                    matched = True
                    break
                else:
                    cond_fail = e

            if matched:
                rows.append({
                    "CHAVE": ch, "CFOP": cfop, "CST/CSOSN (XML item)": raw,
                    "Esperado (rules.yml)": exp_display,
                    "Situação": "OK",
                    "Observação": "Conforme regra/condição do rules.yml",
                    "Severidade": "OK",
                    "Sugestão": ""
                })
                continue

            if cond_fail:
                cond_txt = cond_fail.get("condition") or ""
                reason = cond_fail.get("notes") or "Condição de regra não atendida"
                rows.append({
                    "CHAVE": ch, "CFOP": cfop, "CST/CSOSN (XML item)": raw,
                    "Esperado (rules.yml)": exp_display,
                    "Situação": "NOK",
                    "Observação": f"CST/CSOSN com condição não atendida: {reason}" + (f" (cond: {cond_txt})" if cond_txt else ""),
                    "Severidade": "ALTA",
                    "Sugestão": "Revisar parametrização ou regra; atender a condição prevista no rules.yml"
                })
                continue

            # Contexto EFD técnico (reduz falsos positivos sem afrouxar regras)
            contexto_ok = False
            try:
                if cst3 == "020" and _has_reduction(icms):
                    contexto_ok = True
                elif cst3 in {"060","070"} and _has_st(icms):
                    contexto_ok = True
                elif cst3 in {"040","041","050"} and (_has_desoneracao(icms) or (_to_float(_icms_get(icms, "vBC"))==0 and _to_float(_icms_get(icms, "vICMS"))==0)):
                    contexto_ok = True
                elif cst3 in {"000","090"}:
                    contexto_ok = True
                elif cst3 in {"101","102","103","201","202","203","300","400","900"} and is_csosn:
                    contexto_ok = True
            except Exception:
                contexto_ok = False

            if contexto_ok:
                rows.append({
                    "CHAVE": ch, "CFOP": cfop, "CST/CSOSN (XML item)": raw,
                    "Esperado (rules.yml)": exp_display,
                    "Situação": "OK",
                    "Observação": "CST/CSOSN compatível com o contexto EFD, mas não previsto na regra",
                    "Severidade": "BAIXA",
                    "Sugestão": "Ajustar regra (rules.yml) para contemplar este cenário"
                })
                continue

            rows.append({
                "CHAVE": ch, "CFOP": cfop, "CST/CSOSN (XML item)": raw,
                "Esperado (rules.yml)": exp_display,
                "Situação": "NOK",
                "Observação": "CST/CSOSN não compatível com a regra e com o contexto EFD",
                "Severidade": "ALTA",
                "Sugestão": "Ajustar CST/CSOSN conforme natureza/CFOP ou revisar parametrização/regra"
            })

    return _df(rows, columns=[
        "CHAVE","CFOP","CST/CSOSN (XML item)","Esperado (rules.yml)","Situação","Observação","Severidade","Sugestão"
    ])



def check_cest_required(xml_notes: List[Dict[str, Any]], rules: Dict[str, Any]):
    """Valida se NCM que exige CEST está sem CEST informado no item."""
    if not xml_notes:
        return _df([])
    ncm_st = (rules.get("ncm_st") or {}) if isinstance(rules, dict) else {}
    rows: List[Dict[str, Any]] = []
    for n in xml_notes:
        ch = n.get("CHAVE")
        for det in n.get("items", []) or []:
            ncm = str(det.get("NCM") or "").strip()
            if not ncm or ncm not in ncm_st:
                continue
            if bool(ncm_st[ncm].get("requires_cest")):
                cest = str(det.get("CEST") or "").strip()
                if not cest:
                    rows.append({
                        "CHAVE": ch, "NCM": ncm, "CEST": cest or None,
                        "Regra": "NCM requer CEST (rules.yml)",
                        "Severidade": "MÉDIA",
                        "Sugestão": "Incluir CEST no item ou revisar parametrização"
                    })
    return _df(rows, columns=["CHAVE","NCM","CEST","Regra","Severidade","Sugestão"])

# ---------------------------------------------------------------------------
# 2) Regras estruturais EFD (C100↔C170↔C190) e Cadastros (0150/0190/0200)
# ---------------------------------------------------------------------------

def check_c100_must_have_children(efd_txt: Path):
    """C100 válido deve possuir C170 e C190 subsequentes (exceto cancel/deneg/inut)."""
    rows: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    has_c170 = has_c190 = False
    try:
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith("|C100|"):
                    if current is not None:
                        if current.get("COD_SIT") not in {"02","03","04"}:  # cancel/deneg/inut
                            if not has_c170:
                                rows.append({**current, "FALTA": "C170"})
                            if not has_c190:
                                rows.append({**current, "FALTA": "C190"})
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    from parsers import split_sped_line
                    fs = split_sped_line(ln, min_fields=10)
                    current = {
                        "COD_MOD": fs[5], "COD_SIT": fs[6], "SER": fs[7],
                        "NUM_DOC": fs[8], "CHV_NFE": fs[9]
                    }
                    has_c170 = has_c190 = False
                elif ln.startswith("|C170|"):
                    has_c170 = True
                elif ln.startswith("|C190|"):
                    has_c190 = True
    except Exception:
        pass
    # último
    if current is not None and current.get("COD_SIT") not in {"02","03","04"}:
        if not has_c170:
            rows.append({**current, "FALTA": "C170"})
        if not has_c190:
            rows.append({**current, "FALTA": "C190"})
    return _df(rows, columns=["COD_MOD","COD_SIT","SER","NUM_DOC","CHV_NFE","FALTA"])


def check_participant_0150_presence(efd_txt: Path):
    """Todo COD_PART usado em C100 deve existir em 0150."""
    miss: List[Dict[str, Any]] = []
    try:
        known = { (fs[2] or "").strip() for fs in _parse_rows(efd_txt, "|0150|") if len(fs) > 2 }
        for fs in _parse_rows(efd_txt, "|C100|"):
            cod_part = (fs[4] if len(fs) > 4 else "").strip()
            if cod_part and cod_part not in known:
                miss.append({"SER": fs[7] if len(fs)>7 else "", "NUM_DOC": fs[8] if len(fs)>8 else "",
                             "COD_PART": cod_part, "MSG": "COD_PART ausente do 0150"})
    except Exception:
        pass
    return _df(miss, columns=["SER","NUM_DOC","COD_PART","MSG"])


def check_items_require_0200_0190(efd_txt: Path):
    """Todo item (C170) deve ter COD_ITEM no 0200 e UNID existente no 0190."""
    rows: List[Dict[str, Any]] = []
    try:
        have_0200 = { (fs[2] or "").strip() for fs in _parse_rows(efd_txt, "|0200|") if len(fs) > 2 }
        have_0190 = { (fs[2] or "").strip().upper() for fs in _parse_rows(efd_txt, "|0190|") if len(fs) > 2 }
        current = {"SER": "", "NUM_DOC": ""}
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            from parsers import split_sped_line
            for ln in f:
                if ln.startswith("|C100|"):
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fs = split_sped_line(ln, min_fields=10)
                    current = {"SER": fs[7] if len(fs)>7 else "", "NUM_DOC": fs[8] if len(fs)>8 else ""}
                elif ln.startswith("|C170|"):
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fs = split_sped_line(ln, min_fields=8)
                    cod_item = (fs[3] or "").strip()
                    unid = (fs[6] or "").strip().upper()
                    if cod_item and cod_item not in have_0200:
                        rows.append({**current, "COD_ITEM": cod_item, "UNID": unid, "FALTA": "0200"})
                    if unid and unid not in have_0190:
                        rows.append({**current, "COD_ITEM": cod_item, "UNID": unid, "FALTA": "0190"})
    except Exception:
        pass
    return _df(rows, columns=["SER","NUM_DOC","COD_ITEM","UNID","FALTA"])


def _sum_c170_by_c100(efd_txt: Path) -> Dict[Tuple[str,str], float]:
    """Soma VL_ITEM dos C170 por (SER,NUM_DOC)."""
    acc: Dict[Tuple[str,str], float] = {}
    current_key: Optional[Tuple[str,str]] = None
    try:
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            from parsers import split_sped_line
            for ln in f:
                if ln.startswith("|C100|"):
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fs = split_sped_line(ln, min_fields=10)
                    ser, num = (fs[7] if len(fs)>7 else ""), (fs[8] if len(fs)>8 else "")
                    current_key = (ser, num)
                    acc.setdefault(current_key, 0.0)
                elif ln.startswith("|C170|") and current_key is not None:
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fs = split_sped_line(ln, min_fields=9)
                    try:
                        # CORREÇÃO CRÍTICA: Layout C170 - VL_ITEM está na posição 7 (índice 7 após split)
                        # Layout oficial: REG(1), NUM_ITEM(2), COD_ITEM(3), DESCR_COMPL(4), QTD(5), UNID(6), VL_ITEM(7), VL_DESC(8)
                        # Após split("|"): fs[0]="", fs[1]="C170", fs[2]=NUM_ITEM, fs[3]=COD_ITEM, fs[4]=DESCR_COMPL, 
                        #                  fs[5]=QTD, fs[6]=UNID, fs[7]=VL_ITEM, fs[8]=VL_DESC
                        # ANTES: estava usando fs[6] (UNID) - ERRADO!
                        # AGORA: usando fs[7] (VL_ITEM) - CORRETO!
                        vl_item = float(str((fs[7] or "0")).replace(".", "").replace(",", ".")) if len(fs) > 7 and fs[7] else 0.0
                    except Exception:
                        vl_item = 0.0
                    acc[current_key] = acc.get(current_key, 0.0) + (vl_item or 0.0)
    except Exception:
        pass
    return acc


def check_sum_c170_equals_c100_vl_merc(efd_txt: Path):
    """Σ(VL_ITEM C170) == VL_MERC de C100 (tolerância TOL)."""
    rows: List[Dict[str, Any]] = []
    try:
        c100 = _parse_rows(efd_txt, "|C100|")
        c170_sum = _sum_c170_by_c100(efd_txt)
        for fs in c100:
            while len(fs) < 17: fs.append("")
            ser, num = fs[7], fs[8]
            try:
                vl_merc = float(str((fs[16] or "0")).replace(".", "").replace(",", ".")) if fs[16] else 0.0
            except Exception:
                vl_merc = 0.0
            key = (ser, num)
            vl_it = c170_sum.get(key, 0.0)
            if abs((vl_it or 0.0) - (vl_merc or 0.0)) > TOL:
                rows.append({"SER": ser, "NUM_DOC": num, "VL_MERC (C100)": vl_merc, "Σ VL_ITEM (C170)": vl_it,
                             "DIF": (vl_it or 0.0) - (vl_merc or 0.0)})
    except Exception:
        pass
    return _df(rows, columns=["SER","NUM_DOC","VL_MERC (C100)","Σ VL_ITEM (C170)","DIF"])


def check_c190_ipi_equals_c100_vl_ipi(efd_txt: Path):
    """Σ(VL_IPI dos C190 do doc) == VL_IPI do C100 (tolerância TOL)."""
    rows: List[Dict[str, Any]] = []
    try:
        # agrega C190 por (COD_MOD,SER,NUM_DOC)
        por_chave, por_triple = _parse_c190_totais(efd_txt)
        for fs in _parse_rows(efd_txt, "|C100|"):
            while len(fs) < 26: fs.append("")
            cod_mod = _only_int(fs[5]); ser = _only_int(fs[7]); num = _only_int(fs[8])
            try:
                vl_ipi_c100 = float(str((fs[25] or "0")).replace(".", "").replace(",", ".")) if fs[25] else 0.0
            except Exception:
                vl_ipi_c100 = 0.0
            agg = por_triple.get((cod_mod, ser, num), {})
            vl_ipi_c190 = float(agg.get("VL_IPI", 0.0) or 0.0)
            if abs(vl_ipi_c190 - vl_ipi_c100) > TOL:
                rows.append({"SER": fs[7], "NUM_DOC": fs[8], "VL_IPI (C100)": vl_ipi_c100,
                             "Σ VL_IPI (C190)": vl_ipi_c190, "DIF": vl_ipi_c190 - vl_ipi_c100})
    except Exception:
        pass
    return _df(rows, columns=["SER","NUM_DOC","VL_IPI (C100)","Σ VL_IPI (C190)","DIF"])

# --- helpers C190 (repete lógica de parsers para não criar dependência forte) ---

def _only_int(x: str) -> Optional[int]:
    s = re.sub(r"\D", "", x or "");
    return int(s) if s else None


def _parse_c190_totais(file_path: Path):
    por_triple: Dict[Tuple[Optional[int],Optional[int],Optional[int]], Dict[str, Any]] = {}
    current_triple: Optional[Tuple[Optional[int], Optional[int], Optional[int]]] = None
    def bucket(d, k):
        if k not in d:
            d[k] = {"VL_BC_ICMS": 0.0, "VL_ICMS": 0.0, "VL_BC_ICMS_ST": 0.0, "VL_ICMS_ST": 0.0, "VL_IPI": 0.0}
        return d[k]
    try:
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            from parsers import split_sped_line
            for ln in f:
                if ln.startswith("|C100|"):
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    fs = split_sped_line(ln, min_fields=10)
                    cod_mod = _only_int(fs[5] if len(fs)>5 else "")
                    ser = _only_int(fs[7] if len(fs)>7 else "")
                    num = _only_int(fs[8] if len(fs)>8 else "")
                    current_triple = (cod_mod, ser, num)
                    bucket(por_triple, current_triple)
                elif ln.startswith("|C190|") and current_triple is not None:
                    # CORREÇÃO: Usar split_sped_line para preservar campos vazios
                    # C190 tem 12 campos (REG até COD_OBS), então precisamos de min_fields=13 (incluindo fs[0])
                    fs = split_sped_line(ln, min_fields=13)
                    def pf(i):
                        try:
                            return float(str(fs[i]).replace(".", "").replace(",", ".")) if fs[i] else 0.0
                        except Exception:
                            return 0.0
                    b = bucket(por_triple, current_triple)
                    # CORREÇÃO CRÍTICA: Layout oficial do C190 inclui ALIQ_ICMS na posição 4!
                    # Layout C190 oficial: REG(1), CST_ICMS(2), CFOP(3), ALIQ_ICMS(4), VL_OPR(5), VL_BC_ICMS(6),
                    #                       VL_ICMS(7), VL_BC_ICMS_ST(8), VL_ICMS_ST(9), VL_RED_BC(10), VL_IPI(11), COD_OBS(12)
                    # Após split("|"): fs[0]="", fs[1]="C190", fs[2]=CST_ICMS, fs[3]=CFOP, fs[4]=ALIQ_ICMS,
                    #                  fs[5]=VL_OPR, fs[6]=VL_BC_ICMS, fs[7]=VL_ICMS, fs[8]=VL_BC_ICMS_ST,
                    #                  fs[9]=VL_ICMS_ST, fs[10]=VL_RED_BC, fs[11]=VL_IPI, fs[12]=COD_OBS
                    # CORREÇÃO: Todos os índices ajustados +1 devido ao campo ALIQ_ICMS na posição 4
                    b["VL_BC_ICMS"] += pf(6); b["VL_ICMS"] += pf(7)
                    b["VL_BC_ICMS_ST"] += pf(8); b["VL_ICMS_ST"] += pf(9)
                    b["VL_IPI"] += pf(11)
    except Exception:
        pass
    return {}, por_triple

# ---------------------------------------------------------------------------
# 3) Apurações: E110/E111/E112, E310/E311, E500/E510/E520
# ---------------------------------------------------------------------------

def check_e110_requires_details(efd_txt: Path):
    """Se houver ajustes no E110, exigir detalhamento em E111/E112."""
    rows: List[Dict[str, Any]] = []
    try:
        has_e111 = _has_any_line(efd_txt, "|E111|")
        has_e112 = _has_any_line(efd_txt, "|E112|")
        for fs in _parse_rows(efd_txt, "|E110|"):
            while len(fs) < 10: fs.append("")
            def pf(i):
                try:
                    return float(str(fs[i]).replace(".", "").replace(",", ".")) if fs[i] else 0.0
                except Exception:
                    return 0.0
            aj_deb = pf(3); aj_cred = pf(5); ded = pf(9)
            if (aj_deb or aj_cred or ded) and not (has_e111 or has_e112):
                rows.append({"MSG": "E110 com ajustes/deduções sem E111/E112 detalhando"})
    except Exception:
        pass
    return _df(rows, columns=["MSG"])


def check_e310_difal_presence_when_xml_suggests(efd_txt: Path, xml_notes: List[Dict[str, Any]]):
    """Se XML indicar operações B2C interestaduais (idDest=2 & indFinal=1), exigir E310/E311 na EFD."""
    # indício a partir do XML
    xml_indicia = [n for n in (xml_notes or []) if n.get("idDest") == "2" and n.get("indFinal") == "1"]
    if not xml_indicia:
        return _df([])
    has_e310 = _has_any_line(efd_txt, "|E310|")
    if not has_e310:
        chaves = ";".join([n.get("CHAVE","?") for n in xml_indicia[:20]]) + ("..." if len(xml_indicia)>20 else "")
        return _df([{"ALERTA": "Possível DIFAL/FCP sem E310/E311 na EFD", "AMOSTRA_CHAVES": chaves}],
                   columns=["ALERTA","AMOSTRA_CHAVES"])
    return _df([])


def check_ipi_blocks_presence(efd_txt: Path):
    """Se houver IPI em C100/C190, exigir E500/E510/E520 presentes."""
    try:
        ipi_c100 = 0.0
        for fs in _parse_rows(efd_txt, "|C100|"):
            if len(fs) > 25:
                try:
                    ipi_c100 += float(str(fs[25]).replace(".", "").replace(",", ".")) if fs[25] else 0.0
                except Exception:
                    pass
        por_chave, por_triple = _parse_c190_totais(efd_txt)
        ipi_c190 = sum((v.get("VL_IPI", 0.0) or 0.0) for v in por_triple.values())
        if (ipi_c100 > 0.0 or ipi_c190 > 0.0) and not (_has_any_line(efd_txt, "|E500|") and _has_any_line(efd_txt, "|E510|") and _has_any_line(efd_txt, "|E520|")):
            return _df([{"ALERTA": "Há IPI escriturado, porém faltam E500/E510/E520"}], columns=["ALERTA"])
    except Exception:
        pass
    return _df([])

# ---------------------------------------------------------------------------
# 4) Regras de apoio (derived): Chave NF-e, CFOP x destino
# ---------------------------------------------------------------------------

def check_nfe_keys_exist_for_c100_mod55(efd_txt: Path, xml_notes: List[Dict[str, Any]]):
    """Para C100 mod 55, exigir CHV_NFE válida (44 dígitos) e existência no conjunto de XMLs carregados."""
    keys_xml = { re.sub(r"\D", "", (n.get("CHAVE") or ""))[-44:] for n in (xml_notes or []) }
    rows: List[Dict[str, Any]] = []
    for fs in _parse_rows(efd_txt, "|C100|"):
        while len(fs) < 10: fs.append("")
        cod_mod = re.sub(r"\D", "", fs[5] or "")
        if cod_mod != "55":
            continue
        ch = re.sub(r"\D", "", (fs[9] or ""))
        ok_len = len(ch) == 44
        ok_in_xml = ch in keys_xml if ch else False
        if not ok_len or not ok_in_xml:
            rows.append({"SER": fs[7], "NUM_DOC": fs[8], "CHV_NFE": fs[9],
                         "PROBLEMA": "Chave inválida/ausente no XML" if not ok_len else "Chave não encontrada nos XMLs"})
    return _df(rows, columns=["SER","NUM_DOC","CHV_NFE","PROBLEMA"])


def check_cfop_vs_destination_derived(xml_notes: List[Dict[str, Any]]):
    """Regra de apoio: idDest=1 (interno) não deve combinar com CFOP 6xxx; idDest=2 não deve combinar com 5xxx."""
    rows: List[Dict[str, Any]] = []
    for n in (xml_notes or []):
        id_dest = str(n.get("idDest") or "").strip()
        ch = n.get("CHAVE")
        for det in n.get("items", []) or []:
            cfop = str(det.get("CFOP") or "").strip()
            if not cfop:
                continue
            if id_dest == "1" and cfop.startswith("6"):
                rows.append({"CHAVE": ch, "idDest": id_dest, "CFOP": cfop, "ALERTA": "CFOP 6xxx com idDest=1 (interno)"})
            if id_dest == "2" and cfop.startswith("5"):
                rows.append({"CHAVE": ch, "idDest": id_dest, "CFOP": cfop, "ALERTA": "CFOP 5xxx com idDest=2 (interestadual)"})
    return _df(rows, columns=["CHAVE","idDest","CFOP","ALERTA"])

# ---------------------------------------------------------------------------
# 5) Orquestrador (opcional): tudo em um lugar
# ---------------------------------------------------------------------------

def validate_all_formulas(xml_notes: List[Dict[str, Any]]) -> Any:
    """
    Valida todas as fórmulas de cálculo conforme EFD vigente.
    Retorna DataFrame com divergências encontradas.
    """
    try:
        from formulas import validate_all_formulas_for_item
    except ImportError:
        # Se não conseguir importar, retornar vazio
        return _df([])
    
    issues = []
    
    for nf in (xml_notes or []):
        chave = nf.get("CHAVE", "?")
        uf_dest = nf.get("dest_UF")
        uf_orig = nf.get("emit_UF")
        
        for item in nf.get("items", []):
            item_issues = validate_all_formulas_for_item(item, uf_dest, uf_orig)
            for issue in item_issues:
                issues.append({
                    "CHAVE": chave,
                    "CFOP": item.get("CFOP"),
                    "xProd": item.get("xProd", "")[:50],  # Limitar tamanho
                    **issue
                })
    
    return _df(issues, columns=["CHAVE", "CFOP", "xProd", "Tipo", "Erro", "Divergência"])


def run_all_validations(efd_txt: Path, xml_notes: List[Dict[str, Any]], rules: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Executa todas as validações e retorna um dicionário {nome_aba: DataFrame|list}.
    Use no seu pipeline para alimentar a planilha final.
    """
    rules = rules or {}
    out: Dict[str, Any] = {}

    # Estruturais/Cadastros
    out["C100 precisa C170/C190"] = check_c100_must_have_children(efd_txt)
    out["0150 participantes"] = check_participant_0150_presence(efd_txt)
    out["0200/0190 itens/unidades"] = check_items_require_0200_0190(efd_txt)

    # Somatórios
    out["Σ C170 = C100.VL_MERC"] = check_sum_c170_equals_c100_vl_merc(efd_txt)
    out["Σ C190.IPI = C100.VL_IPI"] = check_c190_ipi_equals_c100_vl_ipi(efd_txt)

    # Apurações
    out["E110 ajustes detalhados"] = check_e110_requires_details(efd_txt)
    out["DIFAL/FCP (E310) presença"] = check_e310_difal_presence_when_xml_suggests(efd_txt, xml_notes)
    out["IPI exige E5xx"] = check_ipi_blocks_presence(efd_txt)

    # Derived / Apoio
    out["NF-e mod55 (chave)"] = check_nfe_keys_exist_for_c100_mod55(efd_txt, xml_notes)
    out["CFOP x idDest (apoio)"] = check_cfop_vs_destination_derived(xml_notes)

    # Regras já existentes
    out["CFOP x CST (rules.yml)"] = check_cfop_cst(xml_notes, rules)
    out["NCM com CEST"] = check_cest_required(xml_notes, rules)
    
    # Validações de fórmulas (conforme legislação EFD vigente)
    out["Fórmulas de cálculo"] = validate_all_formulas(xml_notes)

    # Limpeza: substituir vazios por mensagem "Sem pendências"
    if pd is not None:
        for k, df in list(out.items()):
            try:
                if hasattr(df, "empty") and df.empty:
                    out[k] = pd.DataFrame({"OK": ["Sem pendências detectadas"]})
            except Exception:
                pass
    return out
