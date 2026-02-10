"""
Verifica se a conexão com o banco SCI (Firebird) está funcionando.
Uso: python verificar_conexao_sci.py
Execução rápida (~2 segundos) - não chama SP_BI_FAT.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# Carregar config para exibir parâmetros
from config.database import DatabaseConfig

def main():
    print("=" * 60)
    print("VERIFICAÇÃO DE CONEXÃO COM O BANCO SCI (Firebird)")
    print("=" * 60)
    print(f"Host:     {DatabaseConfig.HOST}")
    print(f"Database: {DatabaseConfig.DATABASE}")
    print(f"User:     {DatabaseConfig.USER}")
    print(f"DLL:      {DatabaseConfig.DLL_PATH} (existe: {Path(DatabaseConfig.DLL_PATH).exists()})")
    print()

    from core.connection import SCIConnection

    # 1) Tentar conectar
    print("1. Conectando ao Firebird...")
    try:
        conn = SCIConnection()
        con = conn.connect()
        print("   OK - Conexão estabelecida.")
        con.close()
    except Exception as e:
        print(f"   FALHA: {e}")
        return 1

    # 2) Query trivial (metadados Firebird)
    print("2. Executando query trivial (RDB$DATABASE)...")
    try:
        result = conn.execute_query("SELECT 1 AS TESTE FROM RDB$DATABASE")
        print(f"   OK - Resposta: {result}")
    except Exception as e:
        print(f"   FALHA: {e}")
        return 1

    # 3) Leitura na view de empresas (confirma acesso ao schema SCI)
    print("3. Lendo 1 registro da VWGR_SCI_EMPRESAS...")
    try:
        result = conn.execute_query(
            "SELECT FIRST 1 BDCODEMP, BDCNPJEMP FROM VWGR_SCI_EMPRESAS"
        )
        if result:
            print(f"   OK - Exemplo: BDCODEMP={result[0][0]}, BDCNPJEMP={result[0][1]}")
        else:
            print("   OK - View acessível (sem registros ou vazia).")
    except Exception as e:
        print(f"   FALHA: {e}")
        return 1

    print()
    print("=" * 60)
    print("Conclusão: conexão com o SCI está funcionando.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
