#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug helper to verify if C170 records are being found by CFOP/CST (and optionally chave).

Usage (examples):
  python debug_find_c170.py --sped "C:\\path\\to\\sped.txt" --cfop 1411 --cst 560 --chave 3225...
  python debug_find_c170.py --sped "/tmp/sped.txt" --cfop 1407 --cst 060
"""
import argparse
from pathlib import Path

from sped_editor import SpedEditor
from common import normalize_cst_for_compare


def main():
    parser = argparse.ArgumentParser(description="Debug C170 lookup by CFOP/CST/chave")
    parser.add_argument("--sped", required=True, help="Path to SPED file")
    parser.add_argument("--cfop", required=True, help="CFOP to search (e.g., 1411)")
    parser.add_argument("--cst", required=True, help="CST to search (e.g., 560)")
    parser.add_argument("--chave", required=False, help="NF-e key to scope search to the C100 block")
    args = parser.parse_args()

    sped_path = Path(args.sped)
    if not sped_path.exists():
        raise FileNotFoundError(f"SPED file not found: {sped_path}")

    editor = SpedEditor(sped_path)
    cfop_clean = "".join(str(args.cfop).strip().split())
    cst_norm = normalize_cst_for_compare(args.cst)

    print(f"[INFO] SPED carregado: {len(editor.lines)} linhas")
    print(f"[INFO] Buscando C170 com CFOP={cfop_clean} e CST={cst_norm}")
    if args.chave:
        print(f"[INFO] Escopo pela chave (C100): {args.chave}")

    # 1) Se chave fornecida, buscar C100 e C170 no bloco
    indices_c170_block = []
    if args.chave:
        indices_c100 = editor.find_line_by_record("C100", chave=args.chave)
        print(f"[DEBUG] C100 encontrados com a chave: {len(indices_c100)}")
        if indices_c100:
            c100_idx = indices_c100[0]
            for idx in range(c100_idx + 1, len(editor.lines)):
                line = editor.lines[idx]
                if line.startswith("C100|") or line.startswith("9999|"):
                    break
                if line.startswith("C170|"):
                    parts = line.rstrip("\n").split("|")
                    if len(parts) > 11:
                        linha_cfop = "".join(parts[11].strip().split())
                        linha_cst = parts[10].strip() if len(parts) > 10 else ""
                        linha_cst_norm = normalize_cst_for_compare(linha_cst)
                        if linha_cfop == cfop_clean and linha_cst_norm == cst_norm:
                            indices_c170_block.append(idx)
            print(f"[DEBUG] C170 no bloco do C100: {len(indices_c170_block)}")
            for i in indices_c170_block[:3]:
                print(f"  [C170 bloco] linha {i+1}: {editor.lines[i].strip()}")

    # 2) Busca global por CFOP/CST
    indices_c170_global = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_norm)
    print(f"[DEBUG] C170 global por CFOP/CST: {len(indices_c170_global)}")
    for i in indices_c170_global[:3]:
        print(f"  [C170 global] linha {i+1}: {editor.lines[i].strip()}")

    # 3) Busca global por CFOP + CST original
    indices_c170_cst_raw = editor.find_line_by_record("C170", cfop=cfop_clean, cst=args.cst)
    print(f"[DEBUG] C170 global por CFOP + CST original: {len(indices_c170_cst_raw)}")
    for i in indices_c170_cst_raw[:3]:
        print(f"  [C170 global CST raw] linha {i+1}: {editor.lines[i].strip()}")

    if not indices_c170_block and not indices_c170_global and not indices_c170_cst_raw:
        print("[WARN] Nenhum C170 encontrado para os filtros fornecidos.")


if __name__ == "__main__":
    main()




