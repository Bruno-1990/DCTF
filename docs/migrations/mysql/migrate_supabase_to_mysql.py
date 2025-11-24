"""
Script para migrar dados do Supabase para MySQL DCTF_WEB
Execute: python docs/migrations/mysql/migrate_supabase_to_mysql.py
"""
import mysql.connector
from supabase import create_client
import os
import json
import sys
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

# Adicionar o diretório raiz ao path para importar config_migration
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

# Importar configurações centralizadas
try:
    from docs.migrations.mysql.config_migration import (
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY,
        MYSQL_CONFIG,
        validate_config,
        print_config
    )
except ImportError:
    # Fallback para configurações diretas se o módulo não for encontrado
    from dotenv import load_dotenv
    load_dotenv()
    
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
    SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    
    MYSQL_CONFIG = {
        'host': os.getenv('MYSQL_HOST', 'localhost'),
        'port': int(os.getenv('MYSQL_PORT', '3306')),
        'user': os.getenv('MYSQL_USER', 'root'),
        'password': os.getenv('MYSQL_PASSWORD', ''),
        'database': os.getenv('MYSQL_DATABASE', 'DCTF_WEB'),
        'charset': 'utf8mb4',
        'collation': 'utf8mb4_unicode_ci',
        'autocommit': False
    }
    
    def validate_config():
        errors = []
        if not SUPABASE_URL:
            errors.append("❌ SUPABASE_URL não configurado")
        if not SUPABASE_ANON_KEY and not SUPABASE_SERVICE_ROLE_KEY:
            errors.append("❌ SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurado")
        if not MYSQL_CONFIG['host']:
            errors.append("❌ MYSQL_HOST não configurado")
        return errors
    
    def print_config():
        print("=" * 60)
        print("📊 CONFIGURAÇÕES DE MIGRAÇÃO")
        print("=" * 60)
        print(f"Supabase URL: {SUPABASE_URL[:50] if SUPABASE_URL else '❌ Não configurado'}")
        print(f"MySQL Host: {MYSQL_CONFIG['host']}")
        print(f"MySQL Database: {MYSQL_CONFIG['database']}")
        print("=" * 60)

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

def parse_json_field(value: Any) -> Optional[str]:
    """Converte campo JSON/array para string JSON do MySQL"""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)

def parse_timestamp(value: Any) -> Optional[datetime]:
    """Converte timestamp do Supabase para datetime do MySQL"""
    if value is None or value == '':
        return None
    if isinstance(value, str):
        # Remove timezone se presente e espaços
        value = value.strip().replace('+00:00', '').replace('Z', '')
        if not value:  # Se ficou vazio após remover timezone
            return None
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except:
            try:
                return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%f')
            except:
                return datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
    return value

# ============================================================================
# MIGRAÇÃO DE CLIENTES
# ============================================================================

def migrate_clientes(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela clientes do Supabase para MySQL"""
    print("🔄 Migrando clientes do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Buscar clientes do Supabase
        response = supabase.table('clientes').select('*').execute()
        clientes = response.data
        
        if not clientes:
            print("⚠️  Nenhum cliente encontrado no Supabase")
            return 0
        
        migrated = 0
        errors = 0
        
        for cliente in clientes:
            try:
                mysql_cursor.execute("""
                    INSERT INTO clientes 
                    (id, razao_social, cnpj_limpo, email, telefone, endereco, 
                     cod_emp, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        razao_social = VALUES(razao_social),
                        email = VALUES(email),
                        telefone = VALUES(telefone),
                        endereco = VALUES(endereco),
                        cod_emp = COALESCE(VALUES(cod_emp), cod_emp),
                        updated_at = VALUES(updated_at)
                """, (
                    cliente['id'],
                    cliente['razao_social'],
                    cliente['cnpj_limpo'],
                    cliente.get('email'),
                    cliente.get('telefone'),
                    cliente.get('endereco'),
                    cliente.get('cod_emp'),
                    parse_timestamp(cliente.get('created_at')),
                    parse_timestamp(cliente.get('updated_at'))
                ))
                migrated += 1
            except Exception as e:
                errors += 1
                print(f"❌ Erro ao migrar cliente {cliente.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migrados {migrated} clientes do Supabase")
        if errors > 0:
            print(f"⚠️  {errors} erros durante a migração de clientes")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar clientes: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE DCTF DECLARAÇÕES
# ============================================================================

def migrate_dctf_declaracoes(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela dctf_declaracoes do Supabase para MySQL"""
    print("🔄 Migrando declarações DCTF do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Buscar declarações do Supabase (com paginação se necessário)
        response = supabase.table('dctf_declaracoes').select('*').execute()
        declaracoes = response.data
        
        if not declaracoes:
            print("⚠️  Nenhuma declaração encontrada no Supabase")
            return 0
        
        migrated = 0
        errors = 0
        
        for decl in declaracoes:
            try:
                # Mapear campos do Supabase para MySQL (espelho exato)
                mysql_cursor.execute("""
                    INSERT INTO dctf_declaracoes 
                    (id, cliente_id, cnpj, periodo_apuracao, data_transmissao, 
                     hora_transmissao, situacao, tipo_ni, categoria, origem, 
                     tipo, debito_apurado, saldo_a_pagar, metadados, 
                     created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        cnpj = VALUES(cnpj),
                        periodo_apuracao = VALUES(periodo_apuracao),
                        data_transmissao = VALUES(data_transmissao),
                        hora_transmissao = VALUES(hora_transmissao),
                        situacao = VALUES(situacao),
                        tipo_ni = VALUES(tipo_ni),
                        categoria = VALUES(categoria),
                        origem = VALUES(origem),
                        tipo = VALUES(tipo),
                        debito_apurado = VALUES(debito_apurado),
                        saldo_a_pagar = VALUES(saldo_a_pagar),
                        metadados = VALUES(metadados),
                        updated_at = VALUES(updated_at)
                """, (
                    decl['id'],
                    decl.get('cliente_id'),
                    decl.get('cnpj'),
                    decl.get('periodo_apuracao'),
                    parse_timestamp(decl.get('data_transmissao')),
                    decl.get('hora_transmissao'),
                    decl.get('situacao'),
                    decl.get('tipo_ni'),
                    decl.get('categoria'),
                    decl.get('origem'),
                    decl.get('tipo'),  # Campo do Supabase
                    decl.get('debito_apurado'),
                    decl.get('saldo_a_pagar'),
                    parse_json_field(decl.get('metadados')),  # Campo do Supabase (JSON)
                    parse_timestamp(decl.get('created_at')),
                    parse_timestamp(decl.get('updated_at'))
                ))
                migrated += 1
            except Exception as e:
                errors += 1
                print(f"❌ Erro ao migrar declaração {decl.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migradas {migrated} declarações DCTF do Supabase")
        if errors > 0:
            print(f"⚠️  {errors} erros durante a migração de declarações")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar declarações DCTF: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE DCTF DADOS
# ============================================================================

def migrate_dctf_dados(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela dctf_dados do Supabase para MySQL"""
    print("🔄 Migrando dados DCTF do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        response = supabase.table('dctf_dados').select('*').execute()
        dados = response.data
        
        if not dados:
            print("⚠️  Nenhum dado DCTF encontrado no Supabase")
            return 0
        
        migrated = 0
        errors = 0
        
        for dado in dados:
            try:
                mysql_cursor.execute("""
                    INSERT INTO dctf_dados 
                    (id, declaracao_id, linha, codigo, descricao, valor, 
                     data_ocorrencia, observacoes, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        codigo = VALUES(codigo),
                        descricao = VALUES(descricao),
                        valor = VALUES(valor),
                        data_ocorrencia = VALUES(data_ocorrencia)
                """, (
                    dado['id'],
                    dado['declaracao_id'],
                    dado['linha'],
                    dado.get('codigo'),
                    dado.get('descricao'),
                    dado.get('valor'),
                    parse_timestamp(dado.get('data_ocorrencia')),
                    dado.get('observacoes'),
                    parse_timestamp(dado.get('created_at'))
                ))
                migrated += 1
            except Exception as e:
                errors += 1
                if migrated % 100 == 0:
                    print(f"  Processados {migrated} registros...")
        
        mysql_conn.commit()
        print(f"✅ Migrados {migrated} registros de dados DCTF do Supabase")
        if errors > 0:
            print(f"⚠️  {errors} erros durante a migração de dados")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar dados DCTF: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE ANÁLISES
# ============================================================================

def migrate_analises(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela analises do Supabase para MySQL"""
    print("🔄 Migrando análises do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        response = supabase.table('analises').select('*').execute()
        analises = response.data
        
        if not analises:
            print("⚠️  Nenhuma análise encontrada no Supabase")
            return 0
        
        migrated = 0
        
        for analise in analises:
            try:
                mysql_cursor.execute("""
                    INSERT INTO analises 
                    (id, declaracao_id, tipo_analise, severidade, descricao,
                     recomendacoes, status, dados_analise, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        updated_at = VALUES(updated_at)
                """, (
                    analise['id'],
                    analise['declaracao_id'],
                    analise['tipo_analise'],
                    analise['severidade'],
                    analise['descricao'],
                    parse_json_field(analise.get('recomendacoes')),
                    analise.get('status', 'pendente'),
                    parse_json_field(analise.get('dados_analise')),
                    parse_timestamp(analise.get('created_at')),
                    parse_timestamp(analise.get('updated_at'))
                ))
                migrated += 1
            except Exception as e:
                print(f"❌ Erro ao migrar análise {analise.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migradas {migrated} análises do Supabase")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar análises: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE FLAGS
# ============================================================================

def migrate_flags(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela flags do Supabase para MySQL"""
    print("🔄 Migrando flags do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        response = supabase.table('flags').select('*').execute()
        flags = response.data
        
        if not flags:
            print("⚠️  Nenhuma flag encontrada no Supabase")
            return 0
        
        migrated = 0
        
        for flag in flags:
            try:
                mysql_cursor.execute("""
                    INSERT INTO flags 
                    (id, declaracao_id, linha_dctf, codigo_flag, descricao,
                     severidade, resolvido, resolucao, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        resolvido = VALUES(resolvido),
                        resolucao = VALUES(resolucao),
                        updated_at = VALUES(updated_at)
                """, (
                    flag['id'],
                    flag['declaracao_id'],
                    flag.get('linha_dctf'),
                    flag['codigo_flag'],
                    flag['descricao'],
                    flag['severidade'],
                    flag.get('resolvido', False),
                    flag.get('resolucao'),
                    parse_timestamp(flag.get('created_at')),
                    parse_timestamp(flag.get('updated_at'))
                ))
                migrated += 1
            except Exception as e:
                print(f"❌ Erro ao migrar flag {flag.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migradas {migrated} flags do Supabase")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar flags: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE RELATÓRIOS
# ============================================================================

def migrate_relatorios(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela relatorios do Supabase para MySQL"""
    print("🔄 Migrando relatórios do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        response = supabase.table('relatorios').select('*').execute()
        relatorios = response.data
        
        if not relatorios:
            print("⚠️  Nenhum relatório encontrado no Supabase")
            return 0
        
        migrated = 0
        
        for relatorio in relatorios:
            try:
                mysql_cursor.execute("""
                    INSERT INTO relatorios 
                    (id, declaracao_id, tipo_relatorio, titulo, conteudo,
                     arquivo_pdf, parametros, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        conteudo = VALUES(conteudo),
                        arquivo_pdf = VALUES(arquivo_pdf)
                """, (
                    relatorio['id'],
                    relatorio['declaracao_id'],
                    relatorio['tipo_relatorio'],
                    relatorio['titulo'],
                    relatorio.get('conteudo'),
                    relatorio.get('arquivo_pdf'),
                    parse_json_field(relatorio.get('parametros')),
                    parse_timestamp(relatorio.get('created_at'))
                ))
                migrated += 1
            except Exception as e:
                print(f"❌ Erro ao migrar relatório {relatorio.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migrados {migrated} relatórios do Supabase")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar relatórios: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE UPLOAD HISTORY
# ============================================================================

def migrate_upload_history(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabela upload_history do Supabase para MySQL"""
    print("🔄 Migrando histórico de uploads do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        response = supabase.table('upload_history').select('*').execute()
        uploads = response.data
        
        if not uploads:
            print("⚠️  Nenhum histórico de upload encontrado no Supabase")
            return 0
        
        migrated = 0
        
        for upload in uploads:
            try:
                mysql_cursor.execute("""
                    INSERT INTO upload_history 
                    (id, cliente_id, cliente_nome, periodo, filename,
                     total_linhas, processadas, status, mensagem, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        mensagem = VALUES(mensagem)
                """, (
                    upload['id'],
                    upload['cliente_id'],
                    upload.get('cliente_nome'),
                    upload['periodo'],
                    upload['filename'],
                    upload.get('total_linhas', 0),
                    upload.get('processadas', 0),
                    upload['status'],
                    upload.get('mensagem'),
                    parse_timestamp(upload.get('timestamp'))
                ))
                migrated += 1
            except Exception as e:
                print(f"❌ Erro ao migrar upload {upload.get('id')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migrados {migrated} registros de upload history do Supabase")
        return migrated
        
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar upload history: {e}")
        return 0
    finally:
        mysql_cursor.close()

# ============================================================================
# MIGRAÇÃO DE CÓDIGOS DCTF
# ============================================================================

def migrate_dctf_codes(supabase, mysql_conn: mysql.connector.MySQLConnection):
    """Migra tabelas de códigos DCTF do Supabase para MySQL"""
    print("🔄 Migrando códigos DCTF do Supabase...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Migrar dctf_codes
    try:
        response = supabase.table('dctf_codes').select('*').execute()
        codes = response.data
        
        migrated = 0
        for code in codes:
            try:
                mysql_cursor.execute("""
                    INSERT INTO dctf_codes 
                    (id, codigo, descricao, tipo, ativo, periodo_inicio,
                     periodo_fim, observacoes, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        descricao = VALUES(descricao),
                        ativo = VALUES(ativo),
                        updated_at = VALUES(updated_at)
                """, (
                    code['id'],
                    code['codigo'],
                    code['descricao'],
                    code['tipo'],
                    code.get('ativo', True),
                    code.get('periodo_inicio'),
                    code.get('periodo_fim'),
                    code.get('observacoes'),
                    parse_timestamp(code.get('created_at')),
                    parse_timestamp(code.get('updated_at'))
                ))
                migrated += 1
            except Exception as e:
                print(f"❌ Erro ao migrar código {code.get('codigo')}: {e}")
        
        mysql_conn.commit()
        print(f"✅ Migrados {migrated} códigos DCTF")
    except Exception as e:
        mysql_conn.rollback()
        print(f"❌ Erro ao migrar códigos DCTF: {e}")
    
    mysql_cursor.close()

# ============================================================================
# FUNÇÃO PRINCIPAL
# ============================================================================

def main():
    """Função principal de migração"""
    print("=" * 60)
    print("🚀 MIGRAÇÃO SUPABASE → MYSQL DCTF_WEB")
    print("=" * 60)
    print()
    
    # Mostrar configurações
    print_config()
    
    # Validar configurações
    errors = validate_config()
    if errors:
        print("❌ Erros de configuração encontrados:")
        for error in errors:
            print(f"   {error}")
        print("\n💡 Solução:")
        print("   1. Crie um arquivo .env na raiz do projeto DCTF_MPC")
        print("   2. Adicione as seguintes variáveis:")
        print("      SUPABASE_URL=https://seu-projeto.supabase.co")
        print("      SUPABASE_ANON_KEY=sua-chave-anon")
        print("      MYSQL_HOST=localhost")
        print("      MYSQL_USER=root")
        print("      MYSQL_PASSWORD=sua-senha")
        print("      MYSQL_DATABASE=DCTF_WEB")
        print("\n   Ou ajuste diretamente no arquivo: docs/migrations/mysql/config_migration.py")
        return
    
    print()
    
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
        print("✅ Conectado ao MySQL DCTF_WEB\n")
    except Exception as e:
        print(f"❌ Erro ao conectar ao MySQL: {e}")
        print("   Verifique as configurações de conexão no script")
        return
    
    # Executar migrações em ordem (respeitando foreign keys)
    try:
        print("🔄 Iniciando migração de dados...\n")
        
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

