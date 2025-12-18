"""Script para corrigir o tamanho do campo tipo"""
import mysql.connector
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from docs.migrations.mysql.config_migration import MYSQL_CONFIG

conn = mysql.connector.connect(**MYSQL_CONFIG)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE dctf_declaracoes MODIFY COLUMN tipo VARCHAR(50) NULL")
    conn.commit()
    print("✅ Campo 'tipo' alterado para VARCHAR(50)")
except Exception as e:
    print(f"❌ Erro: {e}")

cursor.close()
conn.close()








































