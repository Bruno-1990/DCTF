"""
Exemplo de como fazer consultas no banco SCI usando a classe SCIConnection
"""

import sys
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection
import json

def exemplo_consulta_simples():
    """Exemplo de consulta simples"""
    print("=" * 60)
    print("EXEMPLO 1: Consulta Simples")
    print("=" * 60)
    
    try:
        # Criar instância da conexão
        conn = SCIConnection()
        
        # Exemplo de consulta simples
        sql = """
        SELECT FIRST 10 
            BDCODCOL,
            BDNOMECOL,
            BDDATAADMCOL
        FROM BDCOL
        WHERE BDDATAADMCOL >= '2024-01-01'
        ORDER BY BDNOMECOL
        """
        
        print(f"\nSQL:\n{sql}\n")
        print("Executando consulta...")
        
        # Executar consulta
        resultados = conn.execute_query(sql)
        
        print(f"\nResultados encontrados: {len(resultados)}")
        print("\nDados:")
        for row in resultados:
            print(f"  Código: {row[0]}, Nome: {row[1]}, Data Admissão: {row[2]}")
            
    except Exception as e:
        print(f"Erro: {e}")


def exemplo_consulta_com_limit():
    """Exemplo de consulta com limite"""
    print("\n" + "=" * 60)
    print("EXEMPLO 2: Consulta com Limite")
    print("=" * 60)
    
    try:
        conn = SCIConnection()
        
        sql = """
        SELECT 
            BDCODEMP,
            BDNOMEEMP
        FROM BDEMP
        ORDER BY BDNOMEEMP
        """
        
        print(f"\nSQL:\n{sql}\n")
        print("Executando consulta com limite de 5 registros...")
        
        # Executar com limite
        resultados = conn.execute_query(sql, limit=5)
        
        print(f"\nResultados encontrados: {len(resultados)}")
        for row in resultados:
            print(f"  Empresa {row[0]}: {row[1]}")
            
    except Exception as e:
        print(f"Erro: {e}")


def exemplo_consulta_com_join():
    """Exemplo de consulta com JOIN"""
    print("\n" + "=" * 60)
    print("EXEMPLO 3: Consulta com JOIN")
    print("=" * 60)
    
    try:
        conn = SCIConnection()
        
        sql = """
        SELECT FIRST 10
            c.BDCODCOL,
            c.BDNOMECOL,
            cc.BDNOMECC
        FROM BDCOL c
        INNER JOIN BDCC cc ON c.BDCODCC = cc.BDCODCC
        WHERE c.BDDATAADMCOL >= '2024-01-01'
        ORDER BY c.BDNOMECOL
        """
        
        print(f"\nSQL:\n{sql}\n")
        print("Executando consulta...")
        
        resultados = conn.execute_query(sql)
        
        print(f"\nResultados encontrados: {len(resultados)}")
        for row in resultados:
            print(f"  Colaborador {row[0]}: {row[1]} - Centro de Custo: {row[2]}")
            
    except Exception as e:
        print(f"Erro: {e}")


def exemplo_consulta_scalar():
    """Exemplo de consulta que retorna um único valor"""
    print("\n" + "=" * 60)
    print("EXEMPLO 4: Consulta Scalar (valor único)")
    print("=" * 60)
    
    try:
        conn = SCIConnection()
        
        sql = """
        SELECT COUNT(*) 
        FROM BDCOL
        WHERE BDDATAADMCOL >= '2024-01-01'
        """
        
        print(f"\nSQL:\n{sql}\n")
        print("Executando consulta...")
        
        resultado = conn.execute_scalar(sql)
        
        print(f"\nTotal de colaboradores admitidos em 2024: {resultado}")
            
    except Exception as e:
        print(f"Erro: {e}")


def exemplo_consulta_personalizada():
    """Exemplo de consulta personalizada - você pode modificar aqui"""
    print("\n" + "=" * 60)
    print("EXEMPLO 5: Consulta Personalizada")
    print("=" * 60)
    
    try:
        conn = SCIConnection()
        
        # MODIFIQUE ESTA CONSULTA CONFORME SUA NECESSIDADE
        sql = """
        SELECT FIRST 20
            BDCODCOL,
            BDNOMECOL,
            BDDATAADMCOL,
            BDCODCC
        FROM BDCOL
        WHERE 1=1
            -- Adicione seus filtros aqui
            -- AND BDCODCC = 123
            -- AND BDDATAADMCOL >= '2024-01-01'
        ORDER BY BDNOMECOL
        """
        
        print(f"\nSQL:\n{sql}\n")
        print("Executando consulta personalizada...")
        
        resultados = conn.execute_query(sql)
        
        print(f"\nResultados encontrados: {len(resultados)}")
        print("\nDados:")
        for row in resultados:
            print(f"  Código: {row[0]}, Nome: {row[1]}, Data: {row[2]}, CC: {row[3]}")
            
    except Exception as e:
        print(f"Erro: {e}")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("EXEMPLOS DE CONSULTAS NO BANCO SCI")
    print("=" * 60)
    
    # Executar exemplos
    exemplo_consulta_simples()
    exemplo_consulta_com_limit()
    exemplo_consulta_com_join()
    exemplo_consulta_scalar()
    exemplo_consulta_personalizada()
    
    print("\n" + "=" * 60)
    print("FIM DOS EXEMPLOS")
    print("=" * 60)
    print("\nDica: Modifique a função 'exemplo_consulta_personalizada()'")
    print("      para criar suas próprias consultas!")

