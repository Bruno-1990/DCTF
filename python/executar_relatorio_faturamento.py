"""
Script para executar o relatório de faturamento via stored procedure
SP_BI_RELATORIOS com parâmetros específicos
"""

import sys
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection
import json

def executar_relatorio_faturamento():
    """Executa o relatório de faturamento configurável"""
    
    # SQL da stored procedure
    sql = """
    SELECT RETORNO 
    FROM SP_BI_RELATORIOS(
        'TfrRelatorioConfiguravelFaturamento',
        1926,
        'TTypeSistema=tsSuprema;edCODPLACONSCONF=2;edCODQPLACONSCONF=4;edMesInicial=01/2025;edMesFinal=12/2025;ckSomaMatrizFilial=-1;ckSocio=0;ckContador=0;edCODCONT=0;rgAssinaturas=2;ckPRIMPRIMEZERADO=0;ckNãoImprimirMedia=-1;edTamFonte=11;ckCentralizaTxt=-1;CkTamFonte=-1;ckTotModConfig=0;ckCorPersonalizada=0;ckImpTitDescQuadro=0;cbTipoRegimaApu=0;cbModelo=2;',
        1
    )
    """
    
    try:
        print("=" * 80)
        print("EXECUTANDO RELATÓRIO DE FATURAMENTO")
        print("=" * 80)
        print(f"\nStored Procedure: SP_BI_RELATORIOS")
        print(f"Relatório: TfrRelatorioConfiguravelFaturamento")
        print(f"Parâmetros:")
        print(f"  - Código: 1926")
        print(f"  - Período: 01/2025 a 12/2025")
        print(f"  - Configurações: [ver SQL abaixo]")
        print(f"\nSQL:\n{sql}\n")
        print("Conectando ao banco SCI...")
        
        # Criar conexão e executar
        conn = SCIConnection()
        resultados = conn.execute_query(sql)
        
        print(f"\n✓ Consulta executada com sucesso!")
        print(f"✓ Total de registros retornados: {len(resultados)}\n")
        
        if resultados:
            print("-" * 80)
            print("RESULTADO:")
            print("-" * 80)
            
            # A stored procedure retorna RETORNO (provavelmente um BLOB ou texto)
            for i, row in enumerate(resultados, 1):
                retorno = row[0]
                
                # Tentar determinar o tipo do retorno
                if retorno is None:
                    print(f"Registro {i}: NULL")
                elif isinstance(retorno, bytes):
                    # Se for bytes, pode ser um BLOB
                    print(f"Registro {i}: BLOB ({len(retorno)} bytes)")
                    # Tentar decodificar como texto
                    try:
                        texto = retorno.decode('utf-8', errors='ignore')
                        if len(texto) > 0:
                            print(f"  Conteúdo (primeiros 500 chars): {texto[:500]}")
                    except:
                        pass
                elif isinstance(retorno, str):
                    print(f"Registro {i}: {retorno}")
                else:
                    print(f"Registro {i}: {retorno} (tipo: {type(retorno).__name__})")
            
            print("-" * 80)
            
            # Se houver apenas um resultado e for texto/string, exibir completo
            if len(resultados) == 1:
                retorno = resultados[0][0]
                if isinstance(retorno, str) and len(retorno) > 0:
                    print("\n" + "=" * 80)
                    print("CONTEÚDO COMPLETO DO RETORNO:")
                    print("=" * 80)
                    print(retorno)
        else:
            print("Nenhum resultado retornado pela stored procedure.")
        
        print("\n" + "=" * 80)
        
    except ValueError as e:
        print(f"\n✗ Erro de validação: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Erro ao executar consulta: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def executar_com_parametros_customizados(codigo=None, mes_inicial=None, mes_final=None):
    """Executa o relatório com parâmetros customizados"""
    
    # Valores padrão
    codigo = codigo or 1926
    mes_inicial = mes_inicial or '01/2025'
    mes_final = mes_final or '12/2025'
    
    # Construir string de parâmetros
    parametros = f'TTypeSistema=tsSuprema;edCODPLACONSCONF=2;edCODQPLACONSCONF=4;edMesInicial={mes_inicial};edMesFinal={mes_final};ckSomaMatrizFilial=-1;ckSocio=0;ckContador=0;edCODCONT=0;rgAssinaturas=2;ckPRIMPRIMEZERADO=0;ckNãoImprimirMedia=-1;edTamFonte=11;ckCentralizaTxt=-1;CkTamFonte=-1;ckTotModConfig=0;ckCorPersonalizada=0;ckImpTitDescQuadro=0;cbTipoRegimaApu=0;cbModelo=2;'
    
    sql = f"""
    SELECT RETORNO 
    FROM SP_BI_RELATORIOS(
        'TfrRelatorioConfiguravelFaturamento',
        {codigo},
        '{parametros}',
        1
    )
    """
    
    try:
        print("=" * 80)
        print("EXECUTANDO RELATÓRIO COM PARÂMETROS CUSTOMIZADOS")
        print("=" * 80)
        print(f"\nCódigo: {codigo}")
        print(f"Período: {mes_inicial} a {mes_final}")
        print(f"\nSQL:\n{sql}\n")
        
        conn = SCIConnection()
        resultados = conn.execute_query(sql)
        
        print(f"\n✓ Total de registros: {len(resultados)}")
        
        if resultados:
            for i, row in enumerate(resultados, 1):
                retorno = row[0]
                if isinstance(retorno, str):
                    print(f"\nRetorno {i}:\n{retorno}")
                elif isinstance(retorno, bytes):
                    print(f"\nRetorno {i}: BLOB ({len(retorno)} bytes)")
                    try:
                        print(retorno.decode('utf-8', errors='ignore')[:1000])
                    except:
                        pass
                else:
                    print(f"\nRetorno {i}: {retorno}")
        
    except Exception as e:
        print(f"\n✗ Erro: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Verificar argumentos
    if len(sys.argv) > 1:
        # Modo customizado
        codigo = int(sys.argv[1]) if len(sys.argv) > 1 else 1926
        mes_inicial = sys.argv[2] if len(sys.argv) > 2 else '01/2025'
        mes_final = sys.argv[3] if len(sys.argv) > 3 else '12/2025'
        
        executar_com_parametros_customizados(codigo, mes_inicial, mes_final)
    else:
        # Modo padrão (query original)
        executar_relatorio_faturamento()

