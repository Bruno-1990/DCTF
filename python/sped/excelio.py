
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Iterable, Tuple, List

import pandas as pd

# Sanitização já existente no projeto
try:
    from common import sanitize_df_for_excel  # type: ignore
except Exception:
    def sanitize_df_for_excel(df: pd.DataFrame) -> pd.DataFrame:  # fallback mínimo
        return df

_DEFAULT_ORDER: List[Tuple[str, str]] = [
    ("notas_entrada",   "Notas de Entrada"),
    ("notas_saida",     "Notas de Saída"),
    ("itens_entrada",   "Itens (Entradas)"),
    ("itens_saidas",    "Itens (Saídas)"),
    ("divergencias",    "Divergências"),
    ("avisos",          "Avisos"),
    ("erros",           "Erros"),
    ("checklist",       "Checklist"),
]

def _ensure_openpyxl() -> None:
    try:
        import openpyxl  # noqa: F401
    except Exception as e:
        raise SystemExit(
            "openpyxl não está instalado ou falhou ao importar. "
            "Verifique requirements.txt e a instalação do ambiente."
        ) from e

def _safe_sheet_name(title: str) -> str:
    # Máximo 31 chars, remove caracteres inválidos
    invalid = set(r'[]:*?/\\')
    cleaned = ''.join(ch for ch in str(title) if ch not in invalid)
    cleaned = ' '.join(cleaned.split())
    if not cleaned:
        cleaned = 'Planilha'
    return cleaned[:31]

def _iter_sheets_in_order(sheets: Dict[str, pd.DataFrame]) -> Iterable[Tuple[str, str, pd.DataFrame]]:
    """
    Retorna (key, title, df) na melhor ordem possível:
      1) se houver '__order__' em sheets (lista de chaves ou (chave, título));
      2) ordem padrão (_DEFAULT_ORDER);
      3) demais chaves por ordem alfabética.
    """
    seen = set()

    # 1) Ordem personalizada
    order = sheets.get('__order__')
    if isinstance(order, (list, tuple)):
        for item in order:
            if isinstance(item, (list, tuple)) and len(item) >= 1:
                key = str(item[0])
                title = str(item[1]) if len(item) > 1 else key.replace('_', ' ').title()
            else:
                key = str(item)
                title = key.replace('_', ' ').title()
            if key in sheets and key != '__order__':
                seen.add(key)
                yield key, title, sheets[key]

    # 2) Ordem padrão
    for key, title in _DEFAULT_ORDER:
        if key in sheets and key not in seen:
            seen.add(key)
            yield key, title, sheets[key]

    # 3) Demais
    for key in sorted(k for k in sheets.keys() if k not in seen and k != '__order__'):
        yield key, key.replace('_', ' ').title(), sheets[key]

def write_workbook(sheets: Dict[str, pd.DataFrame], out_path: Path) -> Path:
    """
    Grava o dicionário de DataFrames em um arquivo XLSX usando openpyxl.
    - Usa ordem padrão/definida para as abas;
    - Cria pasta de saída se necessário;
    - Converte DataFrames com sanitize_df_for_excel;
    - Se um DF for vazio, escreve uma célula com "Sem dados...";
    - Tenta aplicar formatação pelo módulo format.py, se existir.
    """
    _ensure_openpyxl()

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_str = str(out_path)

    logging.info("Iniciando gravação do XLSX em: %s", out_str)

    with pd.ExcelWriter(out_str, engine="openpyxl") as writer:
        for raw_key, title, df in _iter_sheets_in_order(sheets):
            try:
                if df is None:
                    df2 = pd.DataFrame({"Info": [f"Sem dados para '{title}'"]})
                else:
                    df2 = pd.DataFrame(df) if not isinstance(df, pd.DataFrame) else df.copy()
                    df2 = sanitize_df_for_excel(df2)
                    if df2.empty:
                        df2 = pd.DataFrame({"Info": [f"Sem dados para '{title}'"]})

                sheet_name = _safe_sheet_name(title)
                logging.info("Gravando aba: %s (origem: %s) — linhas=%s, colunas=%s",
                             sheet_name, raw_key, len(df2.index), len(df2.columns))
                df2.to_excel(writer, sheet_name=sheet_name, index=False)
            except PermissionError as e:
                raise RuntimeError(
                    f"Permissão negada ao escrever a aba '{raw_key}'. "
                    f"Feche o arquivo '{out_str}' se estiver aberto."
                ) from e
            except Exception as e:
                raise RuntimeError(
                    f"Falha ao escrever a aba '{raw_key}': {e}"
                ) from e

        # Formatação opcional
        try:
            from format import format_workbook  # type: ignore
            wb = writer.book  # openpyxl Workbook
            format_workbook(wb)
            logging.info("Formatação aplicada (format.py).")
        except Exception as e:
            logging.warning("Não foi possível aplicar formatação (format.py): %s", e)

    logging.info("XLSX gerado com sucesso: %s", out_str)
    return out_path
