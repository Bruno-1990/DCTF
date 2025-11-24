"""
Configurações para migração Supabase → MySQL DCTF_WEB
Este arquivo centraliza todas as configurações necessárias para a migração
"""
import os
from dotenv import load_dotenv
from pathlib import Path

# Carregar variáveis de ambiente do arquivo .env na raiz do projeto
env_path = Path(__file__).parent.parent.parent.parent / '.env'
load_dotenv(env_path)

# ============================================================================
# CONFIGURAÇÕES SUPABASE (ORIGEM)
# ============================================================================
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

# ============================================================================
# CONFIGURAÇÕES MYSQL DCTF_WEB (DESTINO)
# ============================================================================
# Ajuste estas configurações conforme sua conexão MySQL no Cursor
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

# ============================================================================
# FUNÇÕES DE VALIDAÇÃO
# ============================================================================

def validate_config():
    """Valida se as configurações necessárias estão definidas"""
    errors = []
    
    # Validar Supabase
    if not SUPABASE_URL:
        errors.append("❌ SUPABASE_URL não configurado")
    if not SUPABASE_ANON_KEY and not SUPABASE_SERVICE_ROLE_KEY:
        errors.append("❌ SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurado")
    
    # Validar MySQL
    if not MYSQL_CONFIG['host']:
        errors.append("❌ MYSQL_HOST não configurado")
    if not MYSQL_CONFIG['user']:
        errors.append("❌ MYSQL_USER não configurado")
    if not MYSQL_CONFIG['database']:
        errors.append("❌ MYSQL_DATABASE não configurado")
    
    return errors

def print_config():
    """Imprime as configurações atuais (sem senhas)"""
    print("=" * 60)
    print("📊 CONFIGURAÇÕES DE MIGRAÇÃO")
    print("=" * 60)
    print(f"\n🔵 Supabase (Origem):")
    print(f"   URL: {SUPABASE_URL[:50] + '...' if SUPABASE_URL and len(SUPABASE_URL) > 50 else SUPABASE_URL or '❌ Não configurado'}")
    print(f"   Anon Key: {'✅ Configurado' if SUPABASE_ANON_KEY else '❌ Não configurado'}")
    print(f"   Service Role Key: {'✅ Configurado' if SUPABASE_SERVICE_ROLE_KEY else '⚠️  Não configurado (opcional)'}")
    
    print(f"\n🟢 MySQL DCTF_WEB (Destino):")
    print(f"   Host: {MYSQL_CONFIG['host']}")
    print(f"   Port: {MYSQL_CONFIG['port']}")
    print(f"   User: {MYSQL_CONFIG['user']}")
    print(f"   Password: {'✅ Configurado' if MYSQL_CONFIG['password'] else '⚠️  Não configurado (pode ser necessário)'}")
    print(f"   Database: {MYSQL_CONFIG['database']}")
    print("=" * 60)
    print()

# ============================================================================
# EXPORTAR CONFIGURAÇÕES
# ============================================================================
__all__ = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MYSQL_CONFIG',
    'validate_config',
    'print_config'
]

