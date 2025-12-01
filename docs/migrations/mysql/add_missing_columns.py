"""Script para adicionar colunas faltantes no MySQL para espelhar o Supabase"""
import mysql.connector
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from docs.migrations.mysql.config_migration import MYSQL_CONFIG

conn = mysql.connector.connect(**MYSQL_CONFIG)
cursor = conn.cursor()

try:
    # Adicionar coluna metadados
    try:
        cursor.execute("ALTER TABLE dctf_declaracoes ADD COLUMN metadados TEXT NULL COMMENT 'Metadados da declaração'")
        conn.commit()
        print("✅ Coluna 'metadados' adicionada")
    except mysql.connector.Error as e:
        if 'Duplicate column name' in str(e):
            print("⚠️  Coluna 'metadados' já existe")
        else:
            print(f"❌ Erro ao adicionar 'metadados': {e}")
    
    # Adicionar coluna tipo
    try:
        cursor.execute("ALTER TABLE dctf_declaracoes ADD COLUMN tipo VARCHAR(20) NULL COMMENT 'Tipo da declaração'")
        conn.commit()
        print("✅ Coluna 'tipo' adicionada")
    except mysql.connector.Error as e:
        if 'Duplicate column name' in str(e):
            print("⚠️  Coluna 'tipo' já existe")
        else:
            print(f"❌ Erro ao adicionar 'tipo': {e}")
    
    # Criar índice para tipo
    try:
        cursor.execute("CREATE INDEX idx_dctf_tipo ON dctf_declaracoes(tipo)")
        conn.commit()
        print("✅ Índice 'idx_dctf_tipo' criado")
    except mysql.connector.Error as e:
        if 'Duplicate key name' in str(e):
            print("⚠️  Índice 'idx_dctf_tipo' já existe")
        else:
            print(f"❌ Erro ao criar índice: {e}")
    
    print("\n✅ Processo concluído!")
    
except Exception as e:
    print(f"❌ Erro geral: {e}")
finally:
    cursor.close()
    conn.close()




















