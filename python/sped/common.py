# common.py — config + utils consolidados

from __future__ import annotations
import logging
import re
from datetime import datetime, date
from typing import Any, Optional
import pandas as pd

# ===== (config.py) =====
# Tolerância de comparação (±0,02)
TOL: float = 0.02

# C100 aceitos (emitidas normais e complementares, etc.)
COD_SIT_ACEITOS = {"00", "01", "0", ""}

# Namespaces XML
NS_NFE = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
NS_CTE = {"cte": "http://www.portalfiscal.inf.br/cte"}

# CST/CSOSN que NÃO geram crédito em entradas (regra para não acusar delta de ICMS/BC)
NO_CREDIT_CSTS = {
    "20", "40", "41", "50", "60", "70",
    "101", "102", "103", "300", "400",
}

logger = logging.getLogger("sped_xml_conf")

def configure_logging(verbosity: int = 0) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(format="[%(levelname)s] %(message)s", level=level)

# ===== (utils.py) =====
def localname(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag

def parse_decimal(s: Optional[str]) -> Optional[float]:
    if s in (None, ""):
        return None
    st = str(s).strip()
    
    # CORREÇÃO: Detectar e tratar strings com múltiplas vírgulas (erro de parsing)
    # Se houver múltiplas vírgulas, pode ser que múltiplos valores foram concatenados
    # Nesse caso, tentar extrair apenas o último valor (que geralmente é o decimal completo)
    if "," in st and st.count(",") > 1:
        # Tentar extrair o último segmento (última vírgula até o fim)
        # Exemplo: "36647,39155,675,4510285,8" -> "4510285,8"
        parts = st.split(",")
        if len(parts) > 1:
            # Pegar os dois últimos segmentos (número antes da vírgula + decimal)
            last_two = ",".join(parts[-2:])
            # Remover pontos de milhar e converter vírgula para ponto
            last_two_clean = last_two.replace(".", "").replace(",", ".")
            try:
                return float(last_two_clean)
            except Exception:
                # Se falhar, tentar apenas o último segmento
                try:
                    return float(parts[-1].replace(".", ""))
                except Exception:
                    pass
        # Se não conseguir, tentar remover todas as vírgulas exceto a última
        # e tratar como número brasileiro
        last_comma_idx = st.rfind(",")
        if last_comma_idx > 0:
            before_comma = st[:last_comma_idx].replace(",", "").replace(".", "")
            after_comma = st[last_comma_idx + 1:]
            try:
                return float(before_comma + "." + after_comma)
            except Exception:
                pass
    
    # aceita 1 vírgula como separador decimal pt-BR
    if "," in st and st.count(",") == 1:
        st = st.replace(".", "").replace(",", ".")
    try:
        return float(st)
    except Exception:
        try:
            return float(re.sub(r"[^\d\.-]", "", st))
        except Exception:
            return None

def parse_date_efd_ddmmyyyy(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    s = s.strip()
    # 20250131 ou 31/01/2025
    for fmt in ("%d%m%Y", "%d/%m/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None

def almost_equal(a: Optional[float], b: Optional[float], tol: float) -> bool:
    try:
        return abs(float(a or 0.0) - float(b or 0.0)) <= tol
    except Exception:
        return False

def norm_int_like(v: Any) -> Optional[int]:
    if v in (None, "", "None"):
        return None
    s = re.sub(r"\D", "", str(v))
    if not s:
        return None
    try:
        return int(s)
    except Exception:
        return None

def cfop_first_digit(cfop: Any) -> Optional[str]:
    try:
        s = str(int(cfop))
    except Exception:
        return None
    if not s:
        return None
    # 1/2/3 = entrada, 5/6/7 = saída
    if s[0] in ("1", "2", "3"):
        return "Entrada"
    if s[0] in ("5", "6", "7"):
        return "Saída"
    return None

def sanitize_excel_value(v: Any) -> Any:
    try:
        if isinstance(v, str) and v and v[0] in ("=", "+", "-", "@"):
            return "'" + v
    except Exception:
        pass
    return v

def sanitize_df_for_excel(df: pd.DataFrame) -> pd.DataFrame:
    if df is None:
        return df
    df2 = df.copy()
    for col in df2.select_dtypes(include=["object"]).columns:
        df2[col] = df2[col].map(sanitize_excel_value)
    df2.columns = [
        (c if not (isinstance(c, str) and c and c[0] in ("=", "+", "-", "@")) else "'" + c)
        for c in df2.columns
    ]
    return df2

# ============= Normalização de Unidades (para conferência 0190) =============
import unicodedata

UNIT_SYNONYMS = {
    # UNIDADE
    "UN": "UND", "UN.": "UND", "UND": "UND", "UNID": "UND", "UNIDADE": "UND",
    "UN1": "UND", "UNI": "UND",
    "PC": "UND", "PÇ": "UND", "PÇA": "UND", "PCA": "UND", "PECA": "UND", "PCS": "UND", "PEC": "UND",
    # PAR
    "PAR": "PR", "PR": "PR", "PARES": "PR",
    # DÚZIA
    "DUZIA": "DZ", "DÚZIA": "DZ", "DZ": "DZ", "DZ.": "DZ",
    # METRO
    "M": "MT", "MT": "MT", "METRO": "MT",
    "M2": "M2", "M²": "M2", "METRO2": "M2", "METRO QUADRADO": "M2",
    "M3": "M3", "M³": "M3", "METRO3": "M3", "METRO CUBICO": "M3", "METRO CÚBICO": "M3",
    # VOLUME
    "L": "LT", "LT": "LT", "LITRO": "LT", "LTS": "LT",
    "ML": "ML", "MILILITRO": "ML",
    # PESO
    "KG": "KG", "KILO": "KG", "KILOGRAMA": "KG", "QUILO": "KG",
    "G": "G", "GR": "G", "GRAMAS": "G",
    "TON": "T", "TONELADA": "T",
    # EMBALAGENS
    "PT": "PT", "PCT": "PT", "PACOTE": "PT",
    "CX": "CX", "CXS": "CX", "CAIXA": "CX",
    "CT": "CT", "CARTELA": "CT",
    # ROLO / BOBINA
    "RL": "RL", "ROLO": "RL",
    "BOB": "BOB", "BOBINA": "BOB",
    # OUTROS
    "CJ": "CJ", "CONJUNTO": "CJ",
    "FD": "FD", "FARDO": "FD",
    "SC": "SC", "SACO": "SC",
    "GL": "GL", "GAL": "GL", "GALAO": "GL", "GALÃO": "GL",
    "BD": "BD", "BALDE": "BD",
}

def normalize_unit(u: str) -> str:
    # Normaliza unidade para comparação com o 0190.
    if u is None:
        return ""
    s = str(u).strip().upper()
    if not s:
        return ""
    # remove acentos
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    # remove pontuação comum
    s = s.replace(".", "").replace("/", "").replace("-", "").strip()
    # normaliza padrões como UN1, UN_1, UN-1 -> UN
    import re as _re
    if _re.fullmatch(r"UN[\s_]*\d+", s):
        s = "UN"
    return UNIT_SYNONYMS.get(s, s)

def normalize_cst_for_compare(cst: str) -> str:
    """
    Normaliza CST/CSOSN para comparação estável conforme EFD.
    - Remove caracteres não numéricos
    - Garante 3 dígitos (preenche com zeros à esquerda)
    - Exemplos: "00" -> "000", "60" -> "060", "101" -> "101"
    """
    if not cst:
        return ""
    s = re.sub(r"\D", "", str(cst).strip())
    if not s:
        return ""
    if len(s) == 2:
        s = "0" + s
    return s.zfill(3)

def converter_cfop_xml_para_sped(cfop_xml: str, ind_oper: str) -> str:
    """
    Converte CFOP do XML (perspectiva do emitente) para CFOP do SPED (perspectiva da empresa).
    
    Regra de conversão:
    - Se IND_OPER=0 (entrada): converter 5→1, 6→2, 7→3
    - Se IND_OPER=1 (saída): converter 1→5, 2→6, 3→7
    
    Exemplos:
    - XML 6910 (saída interestadual do fornecedor) → SPED 2910 (entrada interestadual para você)
    - XML 5910 → SPED 1910
    - XML 5411 → SPED 1411
    
    Args:
        cfop_xml: CFOP do XML (4 dígitos)
        ind_oper: IND_OPER do C100 ("0" para entrada, "1" para saída)
    
    Returns:
        CFOP convertido para perspectiva do SPED
    """
    if not cfop_xml or len(cfop_xml) < 4:
        return cfop_xml
    
    primeiro_digito = cfop_xml[0]
    resto = cfop_xml[1:]
    
    if ind_oper == "0":  # Entrada
        # Converter perspectiva do emitente (saída) para perspectiva da empresa (entrada)
        if primeiro_digito == "5":
            return "1" + resto
        elif primeiro_digito == "6":
            return "2" + resto
        elif primeiro_digito == "7":
            return "3" + resto
        # Se já está em 1, 2 ou 3, manter (já está na perspectiva correta)
        return cfop_xml
    elif ind_oper == "1":  # Saída
        # Converter perspectiva do emitente (entrada) para perspectiva da empresa (saída)
        if primeiro_digito == "1":
            return "5" + resto
        elif primeiro_digito == "2":
            return "6" + resto
        elif primeiro_digito == "3":
            return "7" + resto
        # Se já está em 5, 6 ou 7, manter (já está na perspectiva correta)
        return cfop_xml
    
    # Se IND_OPER não for 0 ou 1, retornar sem conversão
    return cfop_xml
