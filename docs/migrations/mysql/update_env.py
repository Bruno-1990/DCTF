"""
Script auxiliar para atualizar o arquivo .env com a senha do MySQL
Execute: python docs/migrations/mysql/update_env.py
"""
import os
from pathlib import Path

# Caminho do arquivo .env na raiz do projeto
env_path = Path(__file__).parent.parent.parent.parent / '.env'

# Senha do MySQL fornecida
MYSQL_PASSWORD = 'Ukl4%Jio6)'

def update_env_file():
    """Atualiza ou cria o arquivo .env com a senha do MySQL"""
    
    # Ler conteúdo existente se o arquivo existir
    env_content = {}
    if env_path.exists():
        print(f"📄 Arquivo .env encontrado: {env_path}")
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_content[key.strip()] = value.strip()
    else:
        print(f"📄 Criando novo arquivo .env: {env_path}")
    
    # Atualizar senha do MySQL
    env_content['MYSQL_PASSWORD'] = MYSQL_PASSWORD
    
    # Garantir que outras configurações essenciais existam
    if 'MYSQL_HOST' not in env_content:
        env_content['MYSQL_HOST'] = 'localhost'
    if 'MYSQL_PORT' not in env_content:
        env_content['MYSQL_PORT'] = '3306'
    if 'MYSQL_USER' not in env_content:
        env_content['MYSQL_USER'] = 'root'
    if 'MYSQL_DATABASE' not in env_content:
        env_content['MYSQL_DATABASE'] = 'DCTF_WEB'
    
    # Escrever arquivo .env
    with open(env_path, 'w', encoding='utf-8') as f:
        f.write("# ============================================================================\n")
        f.write("# CONFIGURAÇÕES DO PROJETO DCTF_MPC\n")
        f.write("# ============================================================================\n\n")
        
        f.write("# ============================================================================\n")
        f.write("# SUPABASE (Banco de dados atual - origem da migração)\n")
        f.write("# ============================================================================\n")
        f.write(f"SUPABASE_URL={env_content.get('SUPABASE_URL', '')}\n")
        f.write(f"SUPABASE_ANON_KEY={env_content.get('SUPABASE_ANON_KEY', '')}\n")
        f.write(f"SUPABASE_SERVICE_ROLE_KEY={env_content.get('SUPABASE_SERVICE_ROLE_KEY', '')}\n\n")
        
        f.write("# ============================================================================\n")
        f.write("# MYSQL DCTF_WEB (Banco de dados novo - destino da migração)\n")
        f.write("# ============================================================================\n")
        f.write(f"MYSQL_HOST={env_content['MYSQL_HOST']}\n")
        f.write(f"MYSQL_PORT={env_content['MYSQL_PORT']}\n")
        f.write(f"MYSQL_USER={env_content['MYSQL_USER']}\n")
        f.write(f"MYSQL_PASSWORD={env_content['MYSQL_PASSWORD']}\n")
        f.write(f"MYSQL_DATABASE={env_content['MYSQL_DATABASE']}\n\n")
        
        f.write("# ============================================================================\n")
        f.write("# OUTRAS CONFIGURAÇÕES\n")
        f.write("# ============================================================================\n")
        if 'PORT' in env_content:
            f.write(f"PORT={env_content['PORT']}\n")
        if 'NODE_ENV' in env_content:
            f.write(f"NODE_ENV={env_content['NODE_ENV']}\n")
        if 'VITE_API_URL' in env_content:
            f.write(f"VITE_API_URL={env_content['VITE_API_URL']}\n")
    
    print("✅ Arquivo .env atualizado com sucesso!")
    print(f"\n📝 Configurações MySQL:")
    print(f"   Host: {env_content['MYSQL_HOST']}")
    print(f"   Port: {env_content['MYSQL_PORT']}")
    print(f"   User: {env_content['MYSQL_USER']}")
    print(f"   Password: {'✅ Configurada' if env_content['MYSQL_PASSWORD'] else '❌ Não configurada'}")
    print(f"   Database: {env_content['MYSQL_DATABASE']}")
    print("\n⚠️  Lembre-se de adicionar as credenciais do Supabase:")
    print("   - SUPABASE_URL")
    print("   - SUPABASE_ANON_KEY")
    print("   - SUPABASE_SERVICE_ROLE_KEY (opcional, mas recomendado)")

if __name__ == "__main__":
    update_env_file()































