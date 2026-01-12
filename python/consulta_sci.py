"""
Script simples para fazer consultas no banco SCI
Uso: python consulta_sci.py "SELECT * FROM BDCOL WHERE BDCODCOL = 123"
"""

import sys
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection
import json

def main():
    """Executa uma consulta SQL no banco SCI"""
    
    # Verificar se foi passado SQL como argumento
    if len(sys.argv) < 2:
        print("Uso: python consulta_sci.py \"SELECT * FROM BDCOL WHERE ...\"")
        print("\nExemplos:")
        print('  python consulta_sci.py "SELECT FIRST 10 * FROM BDCOL"')
        print('  python consulta_sci.py "SELECT BDCODCOL, BDNOMECOL FROM BDCOL WHERE BDCODCOL = 123"')
        sys.exit(1)
    
    # SQL passado como argumento
    sql = sys.argv[1]
    
    # Limite opcional (segundo argumento)
    limit = None
    if len(sys.argv) >= 3:
        try:
            limit = int(sys.argv[2])
        except ValueError:
            print(f"Aviso: '{sys.argv[2]}' não é um número válido. Ignorando limite.")
    
    try:
        print("=" * 60)
        print("CONSULTA NO BANCO SCI")
        print("=" * 60)
        print(f"\nSQL:\n{sql}\n")
        
        if limit:
            print(f"Limite: {limit} registros\n")
        
        # Criar conexão e executar
        conn = SCIConnection()
        print("Conectando ao banco...")
        
        resultados = conn.execute_query(sql, limit=limit)
        
        print(f"\n✓ Consulta executada com sucesso!")
        print(f"✓ Total de registros retornados: {len(resultados)}\n")
        
        if resultados:
            # Tentar obter nomes das colunas (se disponível)
            # Para isso, precisamos executar novamente com cursor.description
            con = conn.connect()
            cursor = con.cursor()
            cursor.execute(sql)
            colunas = [desc[0] for desc in cursor.description] if cursor.description else []
            cursor.close()
            con.close()
            
            # Exibir resultados
            if colunas:
                print("Colunas:", ", ".join(colunas))
                print("\n" + "-" * 60)
                print("RESULTADOS:")
                print("-" * 60)
                
                # Cabeçalho
                print(" | ".join([f"{col[:15]:<15}" for col in colunas]))
                print("-" * 60)
                
                # Dados
                for row in resultados[:50]:  # Limitar exibição a 50 registros
                    valores = []
                    for val in row:
                        if val is None:
                            valores.append("NULL")
                        else:
                            str_val = str(val)[:15]
                            valores.append(f"{str_val:<15}")
                    print(" | ".join(valores))
                
                if len(resultados) > 50:
                    print(f"\n... e mais {len(resultados) - 50} registros")
            else:
                # Sem nomes de colunas, exibir como lista
                print("RESULTADOS:")
                print("-" * 60)
                for i, row in enumerate(resultados[:50], 1):
                    print(f"Registro {i}: {row}")
                
                if len(resultados) > 50:
                    print(f"\n... e mais {len(resultados) - 50} registros")
        else:
            print("Nenhum resultado encontrado.")
        
        print("\n" + "=" * 60)
        
    except ValueError as e:
        print(f"\n✗ Erro de validação: {e}")
        print("\nLembre-se: Apenas consultas SELECT são permitidas!")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Erro ao executar consulta: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

