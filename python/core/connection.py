import os
import logging
import re
import sys

# Workaround para Python 3.13 - resetlocale foi removido
if sys.version_info >= (3, 13):
    import locale
    if not hasattr(locale, 'resetlocale'):
        locale.resetlocale = lambda category=None: None

import fdb
from config.database import DatabaseConfig

class SCIConnection:
    """Classe para conexão e operações no banco SCI - APENAS LEITURA"""
    
    # Comandos SQL perigosos que NÃO são permitidos
    FORBIDDEN_KEYWORDS = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
        'TRUNCATE', 'EXECUTE', 'EXEC', 'GRANT', 'REVOKE',
        'COMMIT', 'ROLLBACK', 'SAVEPOINT'
    ]
    
    def __init__(self):
        self.config = DatabaseConfig()
        self._load_dll()
    
    def _load_dll(self):
        """Carrega a DLL do Firebird"""
        if os.path.exists(self.config.DLL_PATH):
            try:
                fdb.fbcore.load_api(self.config.DLL_PATH)
                logging.info(f"fbclient carregado de {self.config.DLL_PATH}")
            except Exception as e:
                logging.warning(f"Falha ao carregar fbclient.dll: {e}")
    
    def _validate_query(self, sql: str) -> bool:
        """
        Valida se a query é apenas SELECT (leitura)
        
        Args:
            sql: Query SQL a validar
        
        Returns:
            True se for apenas SELECT, False caso contrário
        
        Raises:
            ValueError: Se a query contém comandos perigosos
        """
        sql_upper = sql.upper().strip()
        
        # Remove comentários para análise
        sql_clean = re.sub(r'--.*?$', '', sql_upper, flags=re.MULTILINE)
        sql_clean = re.sub(r'/\*.*?\*/', '', sql_clean, flags=re.DOTALL)
        
        # Verifica se começa com SELECT ou é uma query de metadados
        if not (sql_clean.startswith('SELECT') or 
                sql_clean.startswith('WITH') or
                'RDB$' in sql_clean):  # Metadados do Firebird
            raise ValueError(
                "Apenas consultas SELECT são permitidas. "
                "Operações de INSERT, UPDATE, DELETE são bloqueadas por segurança."
            )
        
        # Verifica palavras-chave perigosas
        for keyword in self.FORBIDDEN_KEYWORDS:
            # Usa word boundary para evitar falsos positivos
            pattern = r'\b' + keyword + r'\b'
            if re.search(pattern, sql_clean):
                raise ValueError(
                    f"Comando '{keyword}' não é permitido. "
                    "Este sistema permite apenas consultas de leitura (SELECT)."
                )
        
        return True
    
    def connect(self):
        """Estabelece conexão com o banco"""
        try:
            logging.info(f"Conectando Firebird host={self.config.HOST} database={self.config.DATABASE}")
            return fdb.connect(
                host=self.config.HOST,
                database=self.config.DATABASE,
                user=self.config.USER,
                password=self.config.PASSWORD
            )
        except Exception as e:
            logging.error(f"Erro ao conectar: {e}")
            raise
    
    def execute_query(self, sql, limit=None):
        """
        Executa uma query SQL - APENAS SELECT
        
        Args:
            sql: Query SQL a ser executada (deve ser SELECT)
            limit: Limite de registros (opcional, para otimização)
        
        Returns:
            Lista de tuplas com os resultados
        
        Raises:
            ValueError: Se a query não for SELECT ou contiver comandos perigosos
        """
        # VALIDAÇÃO DE SEGURANÇA - Bloqueia qualquer operação que não seja SELECT
        self._validate_query(sql)
        
        if limit:
            # Adiciona FIRST N se não existir
            if 'FIRST' not in sql.upper() and 'ROWS' not in sql.upper():
                sql = f"SELECT FIRST {limit} * FROM ({sql})"
        
        con = None
        try:
            con = self.connect()
            cursor = con.cursor()
            cursor.execute(sql)
            result = cursor.fetchall()
            cursor.close()
            logging.info(f"Query executada com sucesso (apenas leitura)")
            return result
        except ValueError as e:
            # Re-lança erros de validação
            raise
        except Exception as e:
            logging.error(f"Erro ao executar query: {e}")
            raise
        finally:
            if con:
                con.close()
    
    def execute_scalar(self, sql):
        """Executa query que retorna um único valor - APENAS SELECT"""
        result = self.execute_query(sql, limit=1)
        return result[0][0] if result else None




