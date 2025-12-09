"""
Consulta colaboradores com centro de custo para empresa específica
Retorna: Código Colaborador, Nome Colaborador, Código Centro de Custo, Descrição Centro de Custo
"""

import sys
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection
import json
from datetime import datetime

def consultar_colaboradores_centro_custo(cnpj_empresa: str = None, cod_empresa: int = None, data_inicio: str = None, data_fim: str = None):
    """
    Consulta colaboradores com seus centros de custo para uma empresa específica
    
    Args:
        cnpj_empresa: CNPJ da empresa (ex: '09471676000138') - opcional se cod_empresa for fornecido
        cod_empresa: Código da empresa diretamente - opcional se cnpj_empresa for fornecido
        data_inicio: Data início no formato 'YYYY-MM-DD' (opcional)
        data_fim: Data fim no formato 'YYYY-MM-DD' (opcional)
    """
    conn = SCIConnection()
    
    try:
        cursor = conn.connect().cursor()
        
        # Se código da empresa foi fornecido diretamente, usar
        if cod_empresa:
            cod_empresa_valor = cod_empresa
            cnpj_confirmado = None
            # Tentar buscar CNPJ
            sql_cnpj = f"SELECT FIRST 1 BDCNPJEMP FROM TEMPRESAS WHERE BDCODEMP = {cod_empresa_valor}"
            cursor.execute(sql_cnpj)
            cnpj_result = cursor.fetchone()
            if cnpj_result:
                cnpj_confirmado = cnpj_result[0]
        else:
            # Buscar código da empresa pelo CNPJ
            if not cnpj_empresa:
                return {
                    'success': False,
                    'error': 'É necessário fornecer cnpj_empresa ou cod_empresa'
                }
            
            # Tentar com e sem formatação
            cnpj_limpo = cnpj_empresa.replace('.', '').replace('/', '').replace('-', '')
            cnpj_formatado = f"{cnpj_limpo[:2]}.{cnpj_limpo[2:5]}.{cnpj_limpo[5:8]}/{cnpj_limpo[8:12]}-{cnpj_limpo[12:]}"
            
            sql_empresa = f"""
            SELECT FIRST 1 BDCODEMP, BDCNPJEMP
            FROM TEMPRESAS
            WHERE BDCNPJEMP = '{cnpj_empresa}' 
               OR BDCNPJEMP = '{cnpj_limpo}'
               OR BDCNPJEMP = '{cnpj_formatado}'
            """
            
            cursor.execute(sql_empresa)
            empresa = cursor.fetchone()
            
            if not empresa:
                # Tentar buscar todas as empresas para debug
                sql_debug = "SELECT FIRST 5 BDCODEMP, BDCNPJEMP FROM TEMPRESAS"
                cursor.execute(sql_debug)
                empresas_debug = cursor.fetchall()
                print(f"\n⚠️  Empresa não encontrada. Primeiras empresas no banco:")
                for emp in empresas_debug:
                    print(f"  Código: {emp[0]}, CNPJ: {emp[1]}")
                
                return {
                    'success': False,
                    'error': f'Empresa com CNPJ {cnpj_empresa} não encontrada. Verifique o CNPJ no banco.'
                }
            
            cod_empresa_valor = empresa[0]
            cnpj_confirmado = empresa[1] if len(empresa) > 1 else None
        
        nome_empresa = None  # Será buscado depois se necessário
        
        print(f"\n{'='*80}")
        print(f"EMPRESA ENCONTRADA:")
        print(f"  Código: {cod_empresa_valor}")
        if nome_empresa:
            print(f"  Nome: {nome_empresa}")
        if cnpj_confirmado:
            print(f"  CNPJ: {cnpj_confirmado}")
        print(f"{'='*80}\n")
        
        # Construir filtro de data se fornecido
        filtro_data = ""
        if data_inicio and data_fim:
            filtro_data = f"AND CC.BDDATAENTRADA >= '{data_inicio}' AND CC.BDDATAENTRADA <= '{data_fim}'"
        elif data_inicio:
            filtro_data = f"AND CC.BDDATAENTRADA >= '{data_inicio}'"
        elif data_fim:
            filtro_data = f"AND CC.BDDATAENTRADA <= '{data_fim}'"
        
        # Consulta principal usando VW_VRHF_EMP_TPREPFN_ATU (tem BDNOMCC - nome do centro de custo)
        sql = f"""
        SELECT DISTINCT
            CC.BDCODCOL AS CODIGO_COLABORADOR,
            COL.BDNOMCOL AS NOME_COLABORADOR,
            CC.BDCODCENTRO AS CODIGO_CENTRO_CUSTO,
            CC.BDNOMCC AS DESCRICAO_CENTRO_CUSTO,
            CC.BDCODEMP AS CODIGO_EMPRESA,
            CC.BDDATAENTRADA AS DATA_ENTRADA,
            CC.BDHORAENTRADA AS HORA_ENTRADA
        FROM VW_VRHF_EMP_TPREPFN_ATU CC
        LEFT JOIN VWRH_COLCON_CALCULO COL 
            ON CC.BDCODEMP = COL.BDCODEMP 
            AND CC.BDCODCOL = COL.BDCODCOL
        WHERE CC.BDCODEMP = {cod_empresa_valor}
        {filtro_data}
        ORDER BY CC.BDCODCOL, CC.BDDATAENTRADA DESC
        """
        
        print("Executando consulta...")
        print(f"SQL: {sql[:200]}...\n")
        
        cursor.execute(sql)
        colunas = [desc[0] for desc in cursor.description] if cursor.description else []
        resultados = cursor.fetchall()
        
        # Se não encontrou resultados na primeira view, tentar VW_VRH_SISQUAL_COL_CENTROCUSTO
        if not resultados:
            print("Nenhum resultado em VW_VRHF_EMP_TPREPFN_ATU. Tentando VW_VRH_SISQUAL_COL_CENTROCUSTO...\n")
            
            filtro_data2 = ""
            if data_inicio and data_fim:
                filtro_data2 = f"AND CC2.DATAINICIO >= '{data_inicio}' AND CC2.DATAINICIO <= '{data_fim}'"
            elif data_inicio:
                filtro_data2 = f"AND CC2.DATAINICIO >= '{data_inicio}'"
            elif data_fim:
                filtro_data2 = f"AND CC2.DATAINICIO <= '{data_fim}'"
            
            sql2 = f"""
            SELECT DISTINCT
                CC2.CODEMPREGADO AS CODIGO_COLABORADOR,
                COL.BDNOMCOL AS NOME_COLABORADOR,
                CC2.CODCENTROCUSTO AS CODIGO_CENTRO_CUSTO,
                CAST(NULL AS VARCHAR(100)) AS DESCRICAO_CENTRO_CUSTO,
                CC2.CODEMPRESASALARIO AS CODIGO_EMPRESA,
                CC2.DATAINICIO AS DATA_ENTRADA,
                CAST(NULL AS TIME) AS HORA_ENTRADA
            FROM VW_VRH_SISQUAL_COL_CENTROCUSTO CC2
            LEFT JOIN VWRH_COLCON_CALCULO COL 
                ON CAST(CC2.CODEMPRESASALARIO AS INTEGER) = COL.BDCODEMP 
                AND CC2.CODEMPREGADO = COL.BDCODCOL
            WHERE CC2.CODEMPRESASALARIO = '{cod_empresa_valor}'
            {filtro_data2}
            ORDER BY CC2.CODEMPREGADO, CC2.DATAINICIO DESC
            """
            
            cursor.execute(sql2)
            colunas = [desc[0] for desc in cursor.description] if cursor.description else []
            resultados = cursor.fetchall()
            
            # Se encontrou resultados, tentar buscar descrição do centro de custo
            if resultados:
                print("Resultados encontrados! Buscando descrições dos centros de custo...\n")
                resultados_completo = []
                
                for row in resultados:
                    cod_col = row[0]
                    nome_col = row[1]
                    cod_cc = row[2]
                    desc_cc = row[3]
                    cod_emp = row[4]
                    data_ent = row[5]
                    hora_ent = row[6]
                    
                    # Buscar descrição do centro de custo
                    if cod_cc:
                        sql_desc = f"""
                        SELECT FIRST 1 BDNOMCC
                        FROM VW_VRHF_EMP_TPREPFN_ATU
                        WHERE BDCODCENTRO = {cod_cc}
                        AND BDCODEMP = {cod_emp}
                        """
                        cursor.execute(sql_desc)
                        desc_result = cursor.fetchone()
                        if desc_result and desc_result[0]:
                            desc_cc = desc_result[0]
                    
                    resultados_completo.append((
                        cod_col, nome_col, cod_cc, desc_cc, cod_emp, data_ent, hora_ent
                    ))
                
                resultados = resultados_completo
        
        cursor.close()
        
        # Formatar resultados
        resultados_formatados = []
        for row in resultados:
            resultados_formatados.append({
                'codigo_colaborador': row[0],
                'nome_colaborador': row[1] if row[1] else 'N/A',
                'codigo_centro_custo': row[2],
                'descricao_centro_custo': row[3] if row[3] else 'N/A',
                'codigo_empresa': row[4],
                'data_entrada': str(row[5]) if row[5] else None,
                'hora_entrada': str(row[6]) if row[6] else None
            })
        
        return {
            'success': True,
            'empresa': {
                'codigo': cod_empresa_valor,
                'nome': nome_empresa,
                'cnpj': cnpj_confirmado
            },
            'total_registros': len(resultados_formatados),
            'resultados': resultados_formatados
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """Executa a consulta para o ano de 2023"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Consulta colaboradores com centro de custo')
    parser.add_argument('--cnpj', type=str, help='CNPJ da empresa')
    parser.add_argument('--cod-empresa', type=int, help='Código da empresa diretamente')
    parser.add_argument('--data-inicio', type=str, default='2023-01-01', help='Data início (YYYY-MM-DD)')
    parser.add_argument('--data-fim', type=str, default='2023-12-31', help='Data fim (YYYY-MM-DD)')
    parser.add_argument('--json', action='store_true', help='Retornar resultado em JSON')
    
    args = parser.parse_args()
    
    # Se não forneceu nem CNPJ nem código, usar CNPJ padrão
    cnpj = args.cnpj if args.cnpj else '09471676000138'
    cod_emp = args.cod_empresa if args.cod_empresa else None
    
    resultado = consultar_colaboradores_centro_custo(
        cnpj_empresa=cnpj if not cod_emp else None,
        cod_empresa=cod_emp,
        data_inicio=args.data_inicio,
        data_fim=args.data_fim
    )
    
    if args.json:
        print(json.dumps(resultado, indent=2, ensure_ascii=False))
    else:
        if not resultado.get('success'):
            print(f"\n❌ ERRO: {resultado.get('error')}\n")
            return
        
        empresa = resultado.get('empresa', {})
        total = resultado.get('total_registros', 0)
        resultados = resultado.get('resultados', [])
        
        print(f"\n{'='*80}")
        print(f"RESULTADOS DA CONSULTA")
        print(f"{'='*80}")
        print(f"Empresa: {empresa.get('nome')} (CNPJ: {empresa.get('cnpj')})")
        print(f"Período: {args.data_inicio} a {args.data_fim}")
        print(f"Total de registros: {total}")
        print(f"{'='*80}\n")
        
        if total == 0:
            print("⚠️  Nenhum registro encontrado para o período especificado.\n")
            return
        
        # Exibir resultados em formato de tabela
        print(f"{'Cód. Colab.':<12} {'Nome Colaborador':<40} {'Cód. CC':<10} {'Descrição Centro de Custo':<30} {'Data Entrada':<12}")
        print("-" * 120)
        
        for r in resultados:
            cod_col = str(r['codigo_colaborador']) if r['codigo_colaborador'] else 'N/A'
            nome_col = (r['nome_colaborador'][:38] + '..') if r['nome_colaborador'] and len(r['nome_colaborador']) > 40 else (r['nome_colaborador'] or 'N/A')
            cod_cc = str(r['codigo_centro_custo']) if r['codigo_centro_custo'] else 'N/A'
            desc_cc = (r['descricao_centro_custo'][:28] + '..') if r['descricao_centro_custo'] and len(r['descricao_centro_custo']) > 30 else (r['descricao_centro_custo'] or 'N/A')
            data_ent = r['data_entrada'][:10] if r['data_entrada'] else 'N/A'
            
            print(f"{cod_col:<12} {nome_col:<40} {cod_cc:<10} {desc_cc:<30} {data_ent:<12}")
        
        print(f"\n{'='*80}")
        print(f"Total: {total} registro(s)\n")

if __name__ == "__main__":
    main()

