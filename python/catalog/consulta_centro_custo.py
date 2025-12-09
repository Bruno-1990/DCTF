"""
Consulta personalizada para buscar centro de custo e colaborador em múltiplas views
"""

import sys
import json
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection

# Views a consultar
VIEWS_ALVO = [
    'VW_VRH_SISQUAL_COL_CENTROCUSTO',
    'VW_VRH_BASE_TCUSTOM_GPS_PGTO',
    'VW_VRH_BASE_TCUSTOM_GPS',
    'VW_TOMADORES_REF_ATU',
    'VW_VRHF_EMP_TPROVISAOFERIAS_CC',
    'VW_VRHF_EMP_TPROVISAO13_CC',
    'VW_VRHF_EMP_TPREPFN_ATU',
    'VW_VRHF_EMP_TPREPFN',
    'VW_TOMADORES_REF',
    'VW_VRHF_FGTSSEFIP'
]

# Mapeamento de campos por view
CAMPOS_POR_VIEW = {
    'VW_VRH_SISQUAL_COL_CENTROCUSTO': {
        'cod_cc': 'CODCENTROCUSTO',
        'desc_cc': None,  # Verificar se existe
        'cod_col': 'CODEMPREGADO',
        'nome_col': None  # Verificar se existe
    },
    'VW_VRH_BASE_TCUSTOM_GPS_PGTO': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': None,
        'nome_col': None
    },
    'VW_VRH_BASE_TCUSTOM_GPS': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': None,
        'nome_col': None
    },
    'VW_TOMADORES_REF_ATU': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': None,
        'nome_col': None
    },
    'VW_VRHF_EMP_TPROVISAOFERIAS_CC': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': 'BDCODCOL',
        'nome_col': None
    },
    'VW_VRHF_EMP_TPROVISAO13_CC': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': 'BDCODCOL',
        'nome_col': None
    },
    'VW_VRHF_EMP_TPREPFN_ATU': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': 'BDCODCOL',
        'nome_col': None
    },
    'VW_VRHF_EMP_TPREPFN': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': 'BDCODCOL',
        'nome_col': None
    },
    'VW_TOMADORES_REF': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': None,
        'nome_col': None
    },
    'VW_VRHF_FGTSSEFIP': {
        'cod_cc': 'BDCODCENTRO',
        'desc_cc': None,
        'cod_col': 'BDCODCOL',
        'nome_col': None
    }
}

def descobrir_campos(conn, view_name):
    """Descobre os campos disponíveis em uma view"""
    try:
        # Consultar metadados da view
        sql = f"""
        SELECT FIRST 1 * FROM {view_name}
        """
        cursor = conn.connect().cursor()
        cursor.execute(sql)
        
        # Obter nomes das colunas
        colunas = [desc[0] for desc in cursor.description] if cursor.description else []
        cursor.close()
        
        return colunas
    except Exception as e:
        return []

def buscar_campos_relevantes(colunas):
    """Identifica campos de centro de custo, descrição, colaborador e nome"""
    colunas_upper = [c.upper() for c in colunas]
    
    # Buscar código centro de custo
    cod_cc = None
    for campo in ['CODCENTROCUSTO', 'CODCENTRO', 'CODCC', 'BDCODCENTRO', 'BDCODCC', 'BDCODCENTROCUSTO']:
        if campo in colunas_upper:
            cod_cc = colunas[colunas_upper.index(campo)]
            break
    
    # Buscar descrição centro de custo
    desc_cc = None
    for campo in ['DESCCENTROCUSTO', 'DESCCENTRO', 'DESC_CC', 'DESCRICAO_CC', 'BDDESCCENTRO', 'BDDESCCENTROCUSTO', 'BDDESC_CC', 'BDNOMCENTRO', 'NOMCENTRO', 'BDNOMCC', 'NOMCC', 'NOMECENTRO', 'BDNOMECENTRO']:
        if campo in colunas_upper:
            desc_cc = colunas[colunas_upper.index(campo)]
            break
    
    # Buscar código colaborador
    cod_col = None
    for campo in ['CODCOL', 'CODEMPREGADO', 'CODCOLABORADOR', 'BDCODCOL', 'BDCODEMPREGADO', 'BDCODCOLABORADOR']:
        if campo in colunas_upper:
            cod_col = colunas[colunas_upper.index(campo)]
            break
    
    # Buscar nome colaborador
    nome_col = None
    for campo in ['NOMCOL', 'NOMECOL', 'NOME_COL', 'NOMECOLABORADOR', 'BDNOMCOL', 'BDNOMECOL', 'BDNOMECOLABORADOR', 'BDNOME_COL', 'NOME', 'BDNOME', 'NOMFUNC', 'BDNOMFUNC']:
        if campo in colunas_upper:
            nome_col = colunas[colunas_upper.index(campo)]
            break
    
    return {
        'cod_cc': cod_cc,
        'desc_cc': desc_cc,
        'cod_col': cod_col,
        'nome_col': nome_col,
        'todas_colunas': colunas
    }

def consultar_view(conn, view_name, filtros=None):
    """Consulta uma view específica com filtros opcionais"""
    campos_info = CAMPOS_POR_VIEW.get(view_name, {})
    
    # Descobrir campos reais
    colunas = descobrir_campos(conn, view_name)
    if not colunas:
        return None
    
    campos_relevantes = buscar_campos_relevantes(colunas)
    
    # Construir SELECT
    campos_select = []
    if campos_relevantes['cod_cc']:
        campos_select.append(campos_relevantes['cod_cc'])
    if campos_relevantes['desc_cc']:
        campos_select.append(campos_relevantes['desc_cc'])
    if campos_relevantes['cod_col']:
        campos_select.append(campos_relevantes['cod_col'])
    if campos_relevantes['nome_col']:
        campos_select.append(campos_relevantes['nome_col'])
    
    if not campos_select:
        return None
    
    # Construir WHERE
    where_clauses = []
    if filtros:
        if filtros.get('cod_cc') and campos_relevantes['cod_cc']:
            where_clauses.append(f"{campos_relevantes['cod_cc']} = {filtros['cod_cc']}")
        if filtros.get('cod_col') and campos_relevantes['cod_col']:
            where_clauses.append(f"{campos_relevantes['cod_col']} = {filtros['cod_col']}")
        if filtros.get('nome_col') and campos_relevantes['nome_col']:
            where_clauses.append(f"{campos_relevantes['nome_col']} LIKE '%{filtros['nome_col']}%'")
    
    sql = f"SELECT FIRST 100 {', '.join(campos_select)} FROM {view_name}"
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    
    try:
        cursor = conn.connect().cursor()
        cursor.execute(sql)
        colunas_result = [desc[0] for desc in cursor.description] if cursor.description else []
        resultados = cursor.fetchall()
        cursor.close()
        
        return {
            'view': view_name,
            'campos': campos_relevantes,
            'colunas': colunas_result,
            'resultados': [[str(cell) if cell is not None else '' for cell in row] for row in resultados],
            'total': len(resultados)
        }
    except Exception as e:
        return {
            'view': view_name,
            'erro': str(e),
            'campos': campos_relevantes
        }

def main():
    """Consulta personalizada em múltiplas views"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Consulta personalizada de centro de custo e colaborador')
    parser.add_argument('--cod-cc', type=str, help='Código do centro de custo')
    parser.add_argument('--cod-col', type=str, help='Código do colaborador')
    parser.add_argument('--nome-col', type=str, help='Nome do colaborador (busca parcial)')
    parser.add_argument('--view', type=str, help='View específica para consultar (opcional)')
    
    args = parser.parse_args()
    
    filtros = {}
    if args.cod_cc:
        filtros['cod_cc'] = args.cod_cc
    if args.cod_col:
        filtros['cod_col'] = args.cod_col
    if args.nome_col:
        filtros['nome_col'] = args.nome_col
    
    views_para_consultar = [args.view] if args.view else VIEWS_ALVO
    
    conn = SCIConnection()
    resultados = []
    
    for view in views_para_consultar:
        if view not in VIEWS_ALVO:
            continue
        
        resultado = consultar_view(conn, view, filtros)
        if resultado:
            resultados.append(resultado)
    
    # Retornar JSON
    print(json.dumps({
        'success': True,
        'resultados': resultados,
        'total_views': len(resultados)
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()

