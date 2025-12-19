"""
Script completo: Criar schema MySQL e migrar dados do Supabase
Execute: python docs/migrations/mysql/create_and_migrate.py
"""
import mysql.connector
from pathlib import Path
import sys

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from docs.migrations.mysql.config_migration import MYSQL_CONFIG, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
from docs.migrations.mysql.migrate_supabase_to_mysql import (
    migrate_clientes, migrate_dctf_declaracoes, migrate_dctf_dados,
    migrate_analises, migrate_flags, migrate_relatorios, migrate_upload_history,
    migrate_dctf_codes
)
from supabase import create_client

def execute_sql_file(mysql_conn: mysql.connector.MySQLConnection, sql_file_path: Path):
    """Executa um arquivo SQL no MySQL"""
    print(f"📄 Lendo arquivo SQL: {sql_file_path}")
    
    with open(sql_file_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # Dividir em comandos individuais (remover comentários e separar por ;)
    commands = []
    current_command = []
    for line in sql_content.split('\n'):
        line = line.strip()
        # Ignorar linhas vazias e comentários
        if not line or line.startswith('--'):
            continue
        # Ignorar seções de comentário
        if line.startswith('/*') or line.startswith('*/'):
            continue
        
        current_command.append(line)
        if line.endswith(';'):
            command = ' '.join(current_command)
            if command.strip() and not command.strip().startswith('--'):
                commands.append(command)
            current_command = []
    
    mysql_cursor = mysql_conn.cursor()
    
    executed = 0
    for command in commands:
        if command.strip():
            try:
                mysql_cursor.execute(command)
                executed += 1
            except mysql.connector.Error as e:
                # Ignorar erros de "already exists" para tabelas
                if 'already exists' not in str(e).lower():
                    print(f"⚠️  Erro ao executar comando: {e}")
    
    mysql_conn.commit()
    mysql_cursor.close()
    print(f"✅ Executados {executed} comandos SQL")
    return executed

def create_schema(mysql_conn: mysql.connector.MySQLConnection):
    """Cria o schema MySQL executando o arquivo SQL"""
    print("\n" + "=" * 60)
    print("📦 CRIANDO SCHEMA MYSQL DCTF_WEB")
    print("=" * 60)
    
    sql_file = Path(__file__).parent / '001_create_schema_dctf_web.sql'
    
    if not sql_file.exists():
        print(f"❌ Arquivo SQL não encontrado: {sql_file}")
        return False
    
    try:
        execute_sql_file(mysql_conn, sql_file)
        print("✅ Schema criado com sucesso!")
        return True
    except Exception as e:
        print(f"❌ Erro ao criar schema: {e}")
        return False

def main():
    """Função principal: cria schema e migra dados"""
    print("=" * 60)
    print("🚀 CRIAÇÃO DE SCHEMA + MIGRAÇÃO SUPABASE → MYSQL DCTF_WEB")
    print("=" * 60)
    
    # Conectar ao MySQL
    try:
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        print("✅ Conectado ao MySQL DCTF_WEB")
    except Exception as e:
        print(f"❌ Erro ao conectar ao MySQL: {e}")
        print(f"   Verifique as configurações no arquivo .env ou config_migration.py")
        return
    
    # Criar schema
    if not create_schema(mysql_conn):
        print("\n❌ Erro ao criar schema. Abortando migração.")
        mysql_conn.close()
        return
    
    # Conectar ao Supabase
    try:
        supabase_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
        supabase = create_client(SUPABASE_URL, supabase_key)
        print("\n✅ Conectado ao Supabase")
    except Exception as e:
        print(f"❌ Erro ao conectar ao Supabase: {e}")
        mysql_conn.close()
        return
    
    # Migrar dados
    print("\n" + "=" * 60)
    print("🔄 MIGRANDO DADOS DO SUPABASE")
    print("=" * 60)
    print()
    
    try:
        migrate_clientes(supabase, mysql_conn)
        migrate_dctf_declaracoes(supabase, mysql_conn)
        migrate_dctf_dados(supabase, mysql_conn)
        migrate_analises(supabase, mysql_conn)
        migrate_flags(supabase, mysql_conn)
        migrate_relatorios(supabase, mysql_conn)
        migrate_upload_history(supabase, mysql_conn)
        migrate_dctf_codes(supabase, mysql_conn)
        
        print("\n" + "=" * 60)
        print("✅ Migração concluída com sucesso!")
        print("=" * 60)
        print("\nPróximos passos:")
        print("1. Verifique os dados: SELECT COUNT(*) FROM clientes;")
        print("2. Verifique declarações: SELECT COUNT(*) FROM dctf_declaracoes;")
        print("3. Execute a migração do Export (host_dados) se necessário")
        
    except Exception as e:
        print(f"\n❌ Erro durante a migração: {e}")
        import traceback
        traceback.print_exc()
    finally:
        mysql_conn.close()
        print("\n✅ Conexão MySQL fechada")

if __name__ == "__main__":
    main()










































