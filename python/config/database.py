import os
from dotenv import load_dotenv
from pathlib import Path

# Garantir que o .env seja carregado do diretório raiz do projeto DCTF_MPC
# O script Python será executado a partir do diretório python/, mas o .env está na raiz do DCTF_MPC
project_root = Path(__file__).parent.parent.parent  # Sobe de config/ -> python/ -> raiz do DCTF_MPC
env_path = project_root / '.env'

# Carregar .env do diretório raiz do projeto DCTF_MPC
if env_path.exists():
    load_dotenv(env_path)
else:
    # Fallback: tentar carregar do diretório atual ou variáveis de ambiente
    load_dotenv()

class DatabaseConfig:
    """Configuração do banco de dados SCI"""
    
    HOST = os.getenv('SCI_FB_HOST', '192.168.0.2')
    DATABASE = os.getenv('SCI_FB_DATABASE', r'S:\SCI\banco\VSCI.SDB')
    USER = os.getenv('SCI_FB_USER', 'INTEGRACOES')
    PASSWORD = os.getenv('SCI_FB_PASSWORD', '8t0Ry!W,')
    
    # Caminho da DLL (relativo ao projeto BANCO SCI original)
    # Se a DLL não estiver no projeto DCTF_MPC, tentar usar o caminho padrão do sistema
    DLL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '..', 'BANCO SCI', 'Dll')
    DLL_PATH = os.path.join(DLL_DIR, 'fbclient.dll')
    
    # Se não encontrar no caminho padrão, tentar usar variável de ambiente
    if not os.path.exists(DLL_PATH):
        dll_path_env = os.getenv('SCI_FB_DLL_PATH')
        if dll_path_env and os.path.exists(dll_path_env):
            DLL_PATH = dll_path_env




