"""
Script rápido para testar a consulta do relatório de faturamento
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection

# Query original do usuário
sql = """select RETORNO from SP_BI_RELATORIOS('TfrRelatorioConfiguravelFaturamento',1926,'TTypeSistema=tsSuprema;edCODPLACONSCONF=2;edCODQPLACONSCONF=4;edMesInicial=01/2025;edMesFinal=12/2025;ckSomaMatrizFilial=-1;ckSocio=0;ckContador=0;edCODCONT=0;rgAssinaturas=2;ckPRIMPRIMEZERADO=0;ckNãoImprimirMedia=-1;edTamFonte=11;ckCentralizaTxt=-1;CkTamFonte=-1;ckTotModConfig=0;ckCorPersonalizada=0;ckImpTitDescQuadro=0;cbTipoRegimaApu=0;cbModelo=2;',1)"""

try:
    print("Executando consulta...")
    print(f"SQL: {sql[:100]}...\n")
    
    conn = SCIConnection()
    resultados = conn.execute_query(sql)
    
    print(f"✓ Sucesso! {len(resultados)} registro(s) retornado(s)\n")
    
    for i, row in enumerate(resultados, 1):
        retorno = row[0]
        print(f"Registro {i}:")
        
        if retorno is None:
            print("  NULL")
        elif isinstance(retorno, bytes):
            print(f"  Tipo: BLOB ({len(retorno)} bytes)")
            try:
                texto = retorno.decode('utf-8', errors='ignore')
                print(f"  Conteúdo: {texto[:500]}...")
            except:
                print("  (não foi possível decodificar)")
        else:
            print(f"  {retorno}")
            
except Exception as e:
    print(f"✗ Erro: {e}")
    import traceback
    traceback.print_exc()








