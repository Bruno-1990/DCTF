"""
Script para comparar o schema do Supabase com o schema MySQL
e identificar diferenças que precisam ser corrigidas
"""
import mysql.connector
from supabase import create_client
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from docs.migrations.mysql.config_migration import (
    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MYSQL_CONFIG
)

def get_supabase_schema(supabase):
    """Obtém o schema completo do Supabase consultando as tabelas"""
    print("📊 Obtendo schema do Supabase...")
    
    # Lista de tabelas conhecidas do Supabase
    tables = [
        'clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 
        'flags', 'relatorios', 'upload_history', 'dctf_codes',
        'dctf_receita_codes', 'dctf_aliquotas'
    ]
    
    schema = {}
    
    for table_name in tables:
        try:
            # Tentar buscar uma linha para verificar se a tabela existe e obter estrutura
            response = supabase.table(table_name).select('*').limit(1).execute()
            
            if response.data:
                # Obter todas as colunas da primeira linha
                first_row = response.data[0]
                columns = {}
                for col_name, col_value in first_row.items():
                    # Determinar tipo baseado no valor
                    if col_value is None:
                        col_type = 'NULL'
                    elif isinstance(col_value, bool):
                        col_type = 'BOOLEAN'
                    elif isinstance(col_value, int):
                        col_type = 'INTEGER'
                    elif isinstance(col_value, float):
                        col_type = 'DECIMAL'
                    elif isinstance(col_value, str):
                        if len(col_value) <= 14 and col_value.isdigit():
                            col_type = 'VARCHAR(14)'
                        elif len(col_value) <= 20:
                            col_type = 'VARCHAR(20)'
                        elif len(col_value) <= 50:
                            col_type = 'VARCHAR(50)'
                        elif len(col_value) <= 255:
                            col_type = 'VARCHAR(255)'
                        elif len(col_value) <= 500:
                            col_type = 'VARCHAR(500)'
                        else:
                            col_type = 'TEXT'
                    else:
                        col_type = 'TEXT'
                    
                    columns[col_name] = {
                        'type': col_type,
                        'nullable': col_value is None
                    }
                
                schema[table_name] = {
                    'columns': columns,
                    'exists': True
                }
                print(f"  ✅ {table_name}: {len(columns)} colunas")
            else:
                schema[table_name] = {'exists': False, 'columns': {}}
                print(f"  ⚠️  {table_name}: Tabela vazia ou não encontrada")
        except Exception as e:
            schema[table_name] = {'exists': False, 'error': str(e)}
            print(f"  ❌ {table_name}: Erro - {e}")
    
    return schema

def get_mysql_schema(mysql_conn):
    """Obtém o schema completo do MySQL"""
    print("\n📊 Obtendo schema do MySQL...")
    
    cursor = mysql_conn.cursor()
    schema = {}
    
    # Listar todas as tabelas
    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    
    for table_name in tables:
        # Obter estrutura da tabela
        cursor.execute(f"DESCRIBE {table_name}")
        columns_info = cursor.fetchall()
        
        columns = {}
        for col_info in columns_info:
            col_name = col_info[0]
            col_type = col_info[1]
            col_null = col_info[2]  # YES ou NO
            col_key = col_info[3]   # PRI, UNI, MUL, etc
            col_default = col_info[4]
            col_extra = col_info[5]  # auto_increment, etc
            
            columns[col_name] = {
                'type': col_type,
                'nullable': col_null == 'YES',
                'key': col_key,
                'default': col_default,
                'extra': col_extra
            }
        
        schema[table_name] = {
            'columns': columns,
            'exists': True
        }
        print(f"  ✅ {table_name}: {len(columns)} colunas")
    
    cursor.close()
    return schema

def compare_schemas(supabase_schema, mysql_schema):
    """Compara os dois schemas e identifica diferenças"""
    print("\n" + "=" * 60)
    print("🔍 COMPARANDO SCHEMAS")
    print("=" * 60)
    
    differences = []
    
    # Verificar tabelas que existem no Supabase mas não no MySQL
    for table_name in supabase_schema:
        if supabase_schema[table_name].get('exists'):
            if table_name not in mysql_schema:
                differences.append({
                    'type': 'missing_table',
                    'table': table_name,
                    'message': f"Tabela '{table_name}' existe no Supabase mas não no MySQL"
                })
    
    # Verificar tabelas que existem no MySQL mas não no Supabase
    for table_name in mysql_schema:
        if mysql_schema[table_name].get('exists'):
            if table_name not in supabase_schema or not supabase_schema[table_name].get('exists'):
                differences.append({
                    'type': 'extra_table',
                    'table': table_name,
                    'message': f"Tabela '{table_name}' existe no MySQL mas não no Supabase"
                })
    
    # Comparar colunas de tabelas comuns
    for table_name in supabase_schema:
        if not supabase_schema[table_name].get('exists'):
            continue
        
        if table_name not in mysql_schema:
            continue
        
        supabase_cols = supabase_schema[table_name]['columns']
        mysql_cols = mysql_schema[table_name]['columns']
        
        # Verificar colunas faltando no MySQL
        for col_name in supabase_cols:
            if col_name not in mysql_cols:
                differences.append({
                    'type': 'missing_column',
                    'table': table_name,
                    'column': col_name,
                    'supabase_type': supabase_cols[col_name]['type'],
                    'message': f"Coluna '{col_name}' existe no Supabase ({supabase_cols[col_name]['type']}) mas não no MySQL"
                })
        
        # Verificar colunas extras no MySQL (pode ser OK, mas vamos reportar)
        for col_name in mysql_cols:
            if col_name not in supabase_cols:
                differences.append({
                    'type': 'extra_column',
                    'table': table_name,
                    'column': col_name,
                    'mysql_type': mysql_cols[col_name]['type'],
                    'message': f"Coluna '{col_name}' existe no MySQL ({mysql_cols[col_name]['type']}) mas não no Supabase"
                })
    
    return differences

def print_differences(differences):
    """Imprime as diferenças encontradas"""
    if not differences:
        print("\n✅ Nenhuma diferença encontrada! Os schemas estão idênticos.")
        return
    
    print(f"\n⚠️  Encontradas {len(differences)} diferenças:\n")
    
    missing_tables = [d for d in differences if d['type'] == 'missing_table']
    missing_columns = [d for d in differences if d['type'] == 'missing_column']
    extra_tables = [d for d in differences if d['type'] == 'extra_table']
    extra_columns = [d for d in differences if d['type'] == 'extra_column']
    
    if missing_tables:
        print("❌ TABELAS FALTANDO NO MYSQL:")
        for diff in missing_tables:
            print(f"   - {diff['table']}")
        print()
    
    if missing_columns:
        print("❌ COLUNAS FALTANDO NO MYSQL:")
        for diff in missing_columns:
            print(f"   - {diff['table']}.{diff['column']} ({diff['supabase_type']})")
        print()
    
    if extra_tables:
        print("ℹ️  TABELAS EXTRAS NO MYSQL (podem ser OK):")
        for diff in extra_tables:
            print(f"   - {diff['table']}")
        print()
    
    if extra_columns:
        print("ℹ️  COLUNAS EXTRAS NO MYSQL (podem ser OK):")
        for diff in extra_columns:
            print(f"   - {diff['table']}.{diff['column']} ({diff['mysql_type']})")
        print()

def main():
    """Função principal"""
    print("=" * 60)
    print("🔍 COMPARAÇÃO DE SCHEMAS: SUPABASE vs MYSQL")
    print("=" * 60)
    
    # Conectar ao Supabase
    try:
        supabase_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
        supabase = create_client(SUPABASE_URL, supabase_key)
        print("✅ Conectado ao Supabase")
    except Exception as e:
        print(f"❌ Erro ao conectar ao Supabase: {e}")
        return
    
    # Conectar ao MySQL
    try:
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        print("✅ Conectado ao MySQL")
    except Exception as e:
        print(f"❌ Erro ao conectar ao MySQL: {e}")
        return
    
    # Obter schemas
    supabase_schema = get_supabase_schema(supabase)
    mysql_schema = get_mysql_schema(mysql_conn)
    
    # Comparar
    differences = compare_schemas(supabase_schema, mysql_schema)
    
    # Imprimir diferenças
    print_differences(differences)
    
    # Salvar relatório
    if differences:
        report_file = Path(__file__).parent / 'schema_differences_report.txt'
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write("RELATÓRIO DE DIFERENÇAS ENTRE SUPABASE E MYSQL\n")
            f.write("=" * 60 + "\n\n")
            for diff in differences:
                f.write(f"{diff['message']}\n")
        print(f"📄 Relatório salvo em: {report_file}")
    
    mysql_conn.close()
    print("\n✅ Comparação concluída!")

if __name__ == "__main__":
    main()











































