"""
Script para investigar se há requisições travadas na procedure SP_BI_FAT no banco SCI (Firebird).
Usa a mesma conexão do projeto (SCIConnection).
Execute na raiz do projeto: python python/scripts/investigar_sp_bi_fat.py
Ou de dentro de python/: python scripts/investigar_sp_bi_fat.py
"""

import sys
import json
from pathlib import Path

# Garantir que o path inclui python/ e python/core
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection


def main():
    conn = SCIConnection()

    # 1) Sua consulta original: statements que contêm SP_BI_FAT
    sql_base = """
    SELECT
        MON$STAT_ID,
        MON$ATTACHMENT_ID,
        MON$TRANSACTION_ID,
        MON$TIMESTAMP,
        MON$SQL_TEXT
    FROM MON$STATEMENTS
    WHERE MON$SQL_TEXT LIKE '%SP_BI_FAT%'
    """

    # 2) Versão estendida: inclui MON$STATE (0=idle, 1=active).
    # Exclui a própria consulta de monitoramento (MON$STATEMENTS) para ver só chamadas reais a SP_BI_FAT.
    sql_estendida = """
    SELECT
        S.MON$STAT_ID,
        S.MON$ATTACHMENT_ID,
        S.MON$TRANSACTION_ID,
        S.MON$STATE,
        S.MON$TIMESTAMP,
        S.MON$SQL_TEXT
    FROM MON$STATEMENTS S
    WHERE S.MON$SQL_TEXT LIKE '%SP_BI_FAT%'
      AND S.MON$SQL_TEXT NOT LIKE '%MON$STATEMENTS%'
    """

    print("=" * 70)
    print("Investigação: requisições SP_BI_FAT no banco SCI (Firebird)")
    print("MON$STATE: 0 = idle, 1 = active (executando)")
    print("=" * 70)

    try:
        con = conn.connect()
        cursor = con.cursor()

        # Tamanho da fila: total e em execução (STATE=1)
        sql_fila = """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN S.MON$STATE = 1 THEN 1 ELSE 0 END) AS ativas
        FROM MON$STATEMENTS S
        WHERE S.MON$SQL_TEXT LIKE '%SP_BI_FAT%'
          AND S.MON$SQL_TEXT NOT LIKE '%MON$STATEMENTS%'
        """
        cursor.execute(sql_fila)
        row_fila = cursor.fetchone()
        total_fila = row_fila[0] if row_fila else 0
        ativas_fila = row_fila[1] if row_fila and row_fila[1] is not None else 0
        print(f"\nTamanho da fila SP_BI_FAT: total = {total_fila}  |  em execução (active) = {ativas_fila}\n")

        # Executar consulta estendida (mais útil para ver se travou)
        cursor.execute(sql_estendida)
        colunas = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchall()

        if not rows:
            print("\nNenhuma chamada de aplicação a SP_BI_FAT no momento.")
            print("(Nenhum worker travado em SP_BI_FAT.)")
        else:
            print(f"\nEncontradas {len(rows)} execuções de SP_BI_FAT (possível travamento):\n")
            for i, row in enumerate(rows, 1):
                d = dict(zip(colunas, row))
                state = d.get("MON$STATE")
                state_txt = "ACTIVE (executando/travado?)" if state == 1 else "IDLE"
                print(f"  [{i}] STAT_ID={d.get('MON$STAT_ID')} ATTACHMENT_ID={d.get('MON$ATTACHMENT_ID')} "
                      f"TRANSACTION_ID={d.get('MON$TRANSACTION_ID')} STATE={state} ({state_txt}) "
                      f"TIMESTAMP={d.get('MON$TIMESTAMP')}")
                sql_text = d.get("MON$SQL_TEXT")
                if sql_text is not None:
                    sql_str = sql_text.read() if hasattr(sql_text, "read") else str(sql_text)
                else:
                    sql_str = ""
                print(f"      SQL: {(sql_str[:300] + '...') if len(sql_str) > 300 else sql_str}")
                print()

        cursor.close()
        con.close()

    except Exception as e:
        print(f"Erro ao conectar ou executar: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
