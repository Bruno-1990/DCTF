"""Script para verificar se os CNPJs foram migrados corretamente"""
import mysql.connector
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from docs.migrations.mysql.config_migration import MYSQL_CONFIG

conn = mysql.connector.connect(**MYSQL_CONFIG)
cursor = conn.cursor()

# Estatísticas
cursor.execute('SELECT COUNT(*) as total, COUNT(cnpj) as com_cnpj, COUNT(*) - COUNT(cnpj) as sem_cnpj FROM dctf_declaracoes')
result = cursor.fetchone()
print(f'Total de declarações: {result[0]}')
print(f'Com CNPJ: {result[1]}')
print(f'Sem CNPJ: {result[2]}')

# Exemplos
cursor.execute('SELECT id, cnpj, cliente_id FROM dctf_declaracoes WHERE cnpj IS NOT NULL LIMIT 5')
print('\nExemplos de declarações com CNPJ:')
for row in cursor.fetchall():
    print(f'  ID: {row[0][:8]}... | CNPJ: {row[1]} | Cliente: {row[2][:8] if row[2] else "NULL"}...')

cursor.close()
conn.close()

