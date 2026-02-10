"""
Teste: consulta faturamento no banco SCI via classe SCIConnection.

Uso:
  python testar_faturamento_sci.py [CNPJ] [ANO]
  python testar_faturamento_sci.py --só-codigo [CNPJ]   # só busca código SCI (rápido)

Exemplo:
  python testar_faturamento_sci.py 30064795000324 2025
  python testar_faturamento_sci.py --só-codigo 30064795000324

Requer: acesso à rede do SCI, .env na raiz do projeto (SCI_FB_*).
A consulta SP_BI_FAT pode demorar 1–3 min para ano inteiro.
"""

import sys
import re
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection


def obter_codigo_sci(conn, cnpj_limpo: str) -> int | None:
    """Busca BDCODEMP (código SCI) na view VWGR_SCI_EMPRESAS pelo CNPJ."""
    sql = """
    SELECT FIRST 1 BDCODEMP
    FROM VWGR_SCI_EMPRESAS
    WHERE REPLACE(REPLACE(REPLACE(BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
    ORDER BY BDCODEMP
    """
    # SCIConnection.execute_query não aceita parâmetros; precisamos usar connect() e cursor
    con = conn.connect()
    try:
        cur = con.cursor()
        cur.execute(sql, (cnpj_limpo,))
        row = cur.fetchone()
        cur.close()
        return int(row[0]) if row and row[0] is not None else None
    finally:
        con.close()


def consultar_faturamento_2025(cnpj: str, ano: int = 2025):
    """Consulta faturamento consolidado (SP_BI_FAT) para o CNPJ no ano informado."""
    cnpj_limpo = re.sub(r"\D", "", cnpj)
    if len(cnpj_limpo) != 14:
        print(f"Erro: CNPJ deve ter 14 dígitos. Recebido: {cnpj!r} -> {cnpj_limpo!r} ({len(cnpj_limpo)} dígitos)")
        return

    print("=" * 60)
    print("TESTE: Faturamento SCI via SCIConnection")
    print("=" * 60)
    print(f"CNPJ: {cnpj_limpo}")
    print(f"Ano:  {ano}")
    print()

    conn = SCIConnection()

    # 1) Obter código SCI (BDCODEMP)
    print("1. Buscando código SCI (BDCODEMP) na VWGR_SCI_EMPRESAS...")
    try:
        codigo_sci = obter_codigo_sci(conn, cnpj_limpo)
    except Exception as e:
        print(f"   Erro ao buscar código SCI: {e}")
        return
    if not codigo_sci:
        print("   Empresa não encontrada no SCI para este CNPJ.")
        return
    print(f"   Código SCI (BDCODEMP): {codigo_sci}")
    print()

    # 2) Consultar SP_BI_FAT - consolidado (Firebird espera YYYY-MM-DD)
    data_ini = f"{ano}-01-01"
    data_fim = f"{ano}-12-31"
    param_somar = 0  # não somar matriz/filial

    sql = f"""
    SELECT
        x.ORDEM,
        x.MES_ANO,
        x.FATURAMENTO
    FROM (
        SELECT 1 AS ORDEM, t.BDREF AS ORDEM_DATA,
            CASE MOD(CAST(t.BDREF AS INTEGER), 100)
                WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março'
                WHEN 4 THEN 'Abril' WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho'
                WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Setembro'
                WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' WHEN 12 THEN 'Dezembro'
                ELSE 'Mês Inválido'
            END || '/' || CAST(CAST(t.BDREF AS INTEGER) / 100 AS VARCHAR(4)) AS MES_ANO,
            SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO
        FROM SP_BI_FAT({codigo_sci}, 2, 2, '{data_ini}', '{data_fim}', {param_somar}) t
        GROUP BY t.BDREF
        UNION ALL
        SELECT 2 AS ORDEM, 999999 AS ORDEM_DATA, 'Total do Período' AS MES_ANO,
            SUM(CASE WHEN t.BDORDEM = 7 THEN t.BDVALOR ELSE 0 END) AS FATURAMENTO
        FROM SP_BI_FAT({codigo_sci}, 2, 2, '{data_ini}', '{data_fim}', {param_somar}) t
    ) x
    ORDER BY x.ORDEM, x.ORDEM_DATA
    """

    print("2. Executando SP_BI_FAT (faturamento consolidado)...")
    print(f"   Período: {data_ini} a {data_fim}")
    print()
    try:
        resultados = conn.execute_query(sql)
    except Exception as e:
        print(f"   Erro ao executar consulta: {e}")
        return

    print(f"   Registros retornados: {len(resultados)}")
    print()
    if resultados:
        print("-" * 60)
        print("RESULTADO (ORDEM | MES_ANO | FATURAMENTO)")
        print("-" * 60)
        for row in resultados:
            ordem, mes_ano, fat = row[0], row[1], row[2]
            print(f"  {ordem} | {mes_ano} | {fat}")
        print("-" * 60)
        total_row = next((r for r in resultados if r[1] == "Total do Período"), None)
        if total_row:
            print(f"Total do período: {total_row[2]}")
    print("=" * 60)
    print("Teste concluído.")


if __name__ == "__main__":
    cnpj = "30064795000324"
    ano = 2025
    so_codigo = False
    args = [a for a in sys.argv[1:] if a != "--só-codigo" and not a.startswith("-")]
    if "--só-codigo" in sys.argv or "-s" in sys.argv:
        so_codigo = True
    if len(args) >= 1:
        cnpj = args[0].strip()
    if len(args) >= 2:
        try:
            ano = int(args[1])
        except ValueError:
            ano = 2025

    if so_codigo:
        cnpj_limpo = re.sub(r"\D", "", cnpj)
        if len(cnpj_limpo) != 14:
            print(f"CNPJ inválido: {cnpj}")
            sys.exit(1)
        print("Buscando apenas código SCI (BDCODEMP)...")
        conn = SCIConnection()
        try:
            cod = obter_codigo_sci(conn, cnpj_limpo)
            print(f"CNPJ {cnpj_limpo} -> Código SCI: {cod}")
        except Exception as e:
            print(f"Erro: {e}")
            sys.exit(1)
    else:
        consultar_faturamento_2025(cnpj, ano)
