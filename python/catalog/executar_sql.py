"""
Script para executar SQL no banco SCI
Usado pelo backend Node.js
"""

import sys
import json
import os
import base64
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection

def main():
    """Executa SQL no banco SCI e retorna resultados em JSON"""
    sql = None
    limit = None
    use_base64 = False
    
    # Parse argumentos
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--base64" and i + 1 < len(sys.argv):
            # SQL vem em base64
            sql_encoded = sys.argv[i + 1]
            try:
                sql = base64.b64decode(sql_encoded).decode('utf-8')
                use_base64 = True
            except Exception as e:
                print(json.dumps({"error": f"Erro ao decodificar SQL base64: {str(e)}"}))
                sys.exit(1)
            i += 2
        elif arg == "--limit" and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])
            i += 2
        elif sql is None:
            # SQL como argumento direto (compatibilidade com versão antiga)
            sql = arg
            i += 1
        else:
            i += 1
    
    if not sql:
        print(json.dumps({"error": "SQL é obrigatório"}))
        sys.exit(1)
    
    try:
        conn = SCIConnection()
        
        # Limpar SQL: remover comentários e normalizar
        import re
        sql_limpo = sql
        sql_limpo = re.sub(r'--.*?$', '', sql_limpo, flags=re.MULTILINE)  # Remove comentários de linha
        sql_limpo = re.sub(r'/\*.*?\*/', '', sql_limpo, flags=re.DOTALL)  # Remove comentários de bloco
        sql_limpo = re.sub(r';\s*$', '', sql_limpo, flags=re.MULTILINE)  # Remove ponto e vírgula no final de cada linha
        sql_limpo = re.sub(r';\s*', ' ', sql_limpo)  # Remove ponto e vírgula em qualquer lugar (Firebird não aceita)
        sql_limpo = re.sub(r'\s+', ' ', sql_limpo)  # Normaliza espaços
        sql_limpo = sql_limpo.strip()
        
        # Se após limpar ficou vazio, retornar erro
        if not sql_limpo:
            raise ValueError("SQL inválido após remover comentários")
        
        # VALIDAÇÃO DE SEGURANÇA - Garantir que é apenas SELECT
        # A validação também é feita no SCIConnection, mas fazemos aqui também para segurança extra
        sql_upper = sql_limpo.upper()
        
        # Verificar se começa com SELECT ou WITH
        if not (sql_upper.startswith('SELECT') or sql_upper.startswith('WITH')):
            raise ValueError(
                "Apenas consultas SELECT são permitidas. "
                "Operações de INSERT, UPDATE, DELETE são bloqueadas por segurança."
            )
        
        # Verificar comandos perigosos
        forbidden_keywords = [
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
            'TRUNCATE', 'EXECUTE', 'EXEC', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK'
        ]
        
        for keyword in forbidden_keywords:
            pattern = r'\b' + keyword + r'\b'
            if re.search(pattern, sql_upper):
                raise ValueError(
                    f"Comando '{keyword}' não é permitido. "
                    "Este sistema permite apenas consultas de leitura (SELECT)."
                )
        
        # Remover LIMIT do SQL se existir (Firebird usa FIRST)
        # E adicionar FIRST se limit foi especificado
        sql_final = sql_limpo
        
        # Sempre remover LIMIT (Firebird não suporta)
        sql_final = re.sub(r'\s+LIMIT\s+\d+', '', sql_final, flags=re.IGNORECASE)
        
        # Remover ORDER BY vazio (sem colunas após ORDER BY)
        # Padrão: ORDER BY seguido apenas de espaços e fim da string ou outra palavra-chave
        sql_final = re.sub(r'\s+ORDER\s+BY\s+(?=\s|$)', '', sql_final, flags=re.IGNORECASE)
        sql_final = re.sub(r'\s+ORDER\s+BY\s*$', '', sql_final, flags=re.IGNORECASE)
        
        sql_final = sql_final.strip()
        
        if limit:
            # Adicionar FIRST N se não existir
            if 'FIRST' not in sql_final.upper():
                # No Firebird, FIRST deve vir logo após SELECT
                # Envolver a query em um SELECT FIRST N * FROM (subquery)
                sql_final = f"SELECT FIRST {limit} * FROM ({sql_final})"
        
        # Garantir que não há ponto e vírgula no final
        sql_final = re.sub(r';\s*$', '', sql_final).strip()
        
        # Executar query (SCIConnection também valida internamente)
        # Usamos execute_query que já tem validação, mas precisamos dos nomes das colunas
        # então vamos usar connect() diretamente, mas já validamos acima
        con = conn.connect()
        cursor = con.cursor()
        
        # Validação adicional via SCIConnection (usa o SQL limpo)
        conn._validate_query(sql_final)
        
        cursor.execute(sql_final)
        
        # Obter nomes das colunas
        colunas = [desc[0] for desc in cursor.description] if cursor.description else []
        
        # Buscar resultados
        resultado = cursor.fetchall()
        cursor.close()
        con.close()
        
        # Converter para lista de arrays
        rows = []
        for row in resultado:
            # Converter cada valor para tipo serializável
            row_data = []
            for val in row:
                if val is None:
                    row_data.append(None)
                elif isinstance(val, (int, float, str, bool)):
                    row_data.append(val)
                else:
                    # Converter outros tipos para string
                    row_data.append(str(val))
            rows.append(row_data)
        
        print(json.dumps({
            "success": True,
            "columns": colunas,
            "rows": rows,
            "rowCount": len(rows)
        }, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()

