"""
Script para buscar código SCI (BDCODEMP) por CNPJ
"""

import sys
import json
from pathlib import Path

# Adicionar caminho ao sys.path para imports
sys.path.insert(0, str(Path(__file__).parent))

from core.connection import SCIConnection

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'CNPJ é obrigatório'
        }))
        sys.exit(1)
    
    cnpj = sys.argv[1].strip()
    
    # Remover formatação do CNPJ
    import re
    cnpj_limpo = re.sub(r'\D', '', cnpj)
    
    if len(cnpj_limpo) != 14:
        print(json.dumps({
            'success': False,
            'error': 'CNPJ inválido. Deve ter 14 dígitos.'
        }))
        sys.exit(1)
    
    try:
        sci = SCIConnection()
        conn = sci.connect()
        cursor = conn.cursor()
        
        # Query direta na view VWGR_SCI_EMPRESAS que já contém BDCODEMP e BDCNPJEMP
        # Remove formatação do CNPJ para fazer o match
        sql = """
        SELECT FIRST 1 BDCODEMP, BDCNPJEMP 
        FROM VWGR_SCI_EMPRESAS
        WHERE REPLACE(REPLACE(REPLACE(BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        ORDER BY BDCODEMP
        """
        
        cursor.execute(sql, (cnpj_limpo,))
        row = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if row:
            bdcodemp = row[0]
            bdcnpjemp = row[1]
            
            print(json.dumps({
                'success': True,
                'codigo_sci': str(bdcodemp) if bdcodemp else None,
                'cnpj': bdcnpjemp
            }))
        else:
            print(json.dumps({
                'success': False,
                'error': f'Empresa não encontrada no SCI. CNPJ buscado: {cnpj_limpo}',
                'codigo_sci': None
            }))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()

