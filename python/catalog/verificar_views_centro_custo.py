"""
Script para verificar views e campos relacionados a centro de custo e colaborador
"""

import json
from pathlib import Path

# Caminho do catálogo
catalog_path = Path(__file__).parent / 'catalog.json'

# Views a verificar
views_alvo = [
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

# Campos relacionados a centro de custo
campos_centro_custo = [
    'CODCENTROCUSTO', 'CODCENTRO', 'CODCC', 'CENTROCUSTO', 'CENTRO_CUSTO',
    'BDCODCENTRO', 'BDCODCC', 'BDCODCENTROCUSTO', 'BDCENTROCUSTO',
    'DESCCENTROCUSTO', 'DESCCENTRO', 'DESC_CC', 'DESCRICAO_CC',
    'BDDESCCENTRO', 'BDDESCCENTROCUSTO', 'BDDESC_CC'
]

# Campos relacionados a colaborador
campos_colaborador = [
    'CODCOL', 'CODEMPREGADO', 'CODCOLABORADOR', 'COD_COL',
    'BDCODCOL', 'BDCODEMPREGADO', 'BDCODCOLABORADOR',
    'NOMCOL', 'NOMECOL', 'NOME_COL', 'NOMECOLABORADOR',
    'BDNOMCOL', 'BDNOMECOL', 'BDNOMECOLABORADOR', 'BDNOME_COL'
]

def verificar_view(catalog, view_name):
    """Verifica uma view e retorna informações sobre campos de centro de custo e colaborador"""
    objetos = catalog.get('objects', {})
    
    if view_name not in objetos:
        return {
            'encontrada': False,
            'campos_cc': [],
            'campos_col': [],
            'todas_colunas': []
        }
    
    obj = objetos[view_name]
    colunas = obj.get('colunas', [])
    
    # Buscar campos de centro de custo
    campos_cc_encontrados = []
    campos_col_encontrados = []
    
    for col in colunas:
        nome_col = col.get('nome', '').upper()
        
        # Verificar se é campo de centro de custo
        for campo_cc in campos_centro_custo:
            if campo_cc.upper() in nome_col or nome_col in campo_cc.upper():
                if col not in campos_cc_encontrados:
                    campos_cc_encontrados.append(col)
                break
        
        # Verificar se é campo de colaborador
        for campo_col in campos_colaborador:
            if campo_col.upper() in nome_col or nome_col in campo_col.upper():
                if col not in campos_col_encontrados:
                    campos_col_encontrados.append(col)
                break
    
    return {
        'encontrada': True,
        'campos_cc': campos_cc_encontrados,
        'campos_col': campos_col_encontrados,
        'todas_colunas': [c.get('nome') for c in colunas]
    }

def main():
    # Carregar catálogo
    with open(catalog_path, 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    
    print("=" * 80)
    print("VERIFICAÇÃO DE VIEWS - CENTRO DE CUSTO E COLABORADOR")
    print("=" * 80)
    print()
    
    resultados = {}
    
    for view in views_alvo:
        resultado = verificar_view(catalog, view)
        resultados[view] = resultado
        
        print(f"View: {view}")
        print(f"  Encontrada: {'SIM' if resultado['encontrada'] else 'NÃO'}")
        
        if resultado['encontrada']:
            print(f"  Campos de Centro de Custo encontrados: {len(resultado['campos_cc'])}")
            for campo in resultado['campos_cc']:
                print(f"    - {campo.get('nome')} ({campo.get('tipo', 'N/A')})")
            
            print(f"  Campos de Colaborador encontrados: {len(resultado['campos_col'])}")
            for campo in resultado['campos_col']:
                print(f"    - {campo.get('nome')} ({campo.get('tipo', 'N/A')})")
        
        print()
    
    # Resumo
    print("=" * 80)
    print("RESUMO")
    print("=" * 80)
    views_com_cc = [v for v, r in resultados.items() if r['encontrada'] and len(r['campos_cc']) > 0]
    views_com_col = [v for v, r in resultados.items() if r['encontrada'] and len(r['campos_col']) > 0]
    views_completa = [v for v, r in resultados.items() if r['encontrada'] and len(r['campos_cc']) > 0 and len(r['campos_col']) > 0]
    
    print(f"Views com campos de Centro de Custo: {len(views_com_cc)}")
    for v in views_com_cc:
        print(f"  - {v}")
    
    print(f"\nViews com campos de Colaborador: {len(views_com_col)}")
    for v in views_com_col:
        print(f"  - {v}")
    
    print(f"\nViews com AMBOS (Centro de Custo + Colaborador): {len(views_completa)}")
    for v in views_completa:
        print(f"  - {v}")
    
    # Salvar resultado em JSON
    output_path = Path(__file__).parent / 'views_centro_custo_analise.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False)
    
    print(f"\nResultado detalhado salvo em: {output_path}")

if __name__ == "__main__":
    main()

