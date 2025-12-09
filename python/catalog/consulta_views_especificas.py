"""
Consulta views específicas para obter colaboradores e centros de custo
Filtra por código empresa 186 e retorna: Código CC, Descrição CC, Nome Colaborador
"""

import sys
from pathlib import Path

# Adicionar o diretório core ao path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.connection import SCIConnection
import json

# Views a consultar
VIEWS_ALVO = [
    'VW_VRH_SISQUAL_COL_CENTROCUSTO',
    'VW_VRH_BASE_TCUSTOM_GPS_PGTO',
    'VW_VRH_BASE_TCUSTOM_GPS',
    'VW_TOMADORES_REF_ATU',
    'VWSCI_EMPMENSAL_ABA_PLA',
    'VWSCI_DADOS_DARFIMP_RELATORIO',
    'VWSCI_EMPMENSAL_ABA_ADIC',
    'VW_VRHF_EMP_TPROVISAOFERIAS_CC',
    'VWGR_FIN_ESCRITORIO',
    'VW_VRHF_EMP_TPROVISAO13_CC',
    'VW_VRHF_EMP_TPREPFN_ATU',
    'VFIN_BASE_TGRUPOECOPLANOCC',
    'VEF_BASE_TPLANOCCAUTOMATICO',
    'VEF_BASE_TPLANOACOESCCAUTO',
    'VWGR_VSUC_PLANOCONTAS',
    'VW_PLANOS_TFOR_IBGE_REF_MAX_MIN'
]

def consultar_view(conn, view_name, cod_empresa):
    """Consulta uma view específica e retorna resultados formatados"""
    cursor = conn.connect().cursor()
    
    try:
        # Mapeamento de campos por view
        campos_por_view = {
            'VW_VRH_SISQUAL_COL_CENTROCUSTO': {
                'cod_col': 'CODEMPREGADO',
                'cod_cc': 'CODCENTROCUSTO',
                'cod_emp': 'CODEMPRESASALARIO',
                'data': 'DATAINICIO'
            },
            'VW_VRH_BASE_TCUSTOM_GPS_PGTO': {
                'cod_col': None,  # Não tem código colaborador
                'cod_cc': 'BDCODCENTRO',
                'cod_emp': None,  # Não tem código empresa direto
                'data': None
            },
            'VW_VRH_BASE_TCUSTOM_GPS': {
                'cod_col': None,
                'cod_cc': 'BDCODCENTRO',
                'cod_emp': None,
                'data': None
            },
            'VW_TOMADORES_REF_ATU': {
                'cod_col': None,
                'cod_cc': 'BDCODCENTRO',
                'cod_emp': None,
                'data': None
            },
            'VW_VRHF_EMP_TPREPFN_ATU': {
                'cod_col': 'BDCODCOL',
                'cod_cc': 'BDCODCENTRO',
                'desc_cc': 'BDNOMCC',  # Tem descrição!
                'cod_emp': 'BDCODEMP',
                'data': 'BDDATAENTRADA'
            },
            'VW_VRHF_EMP_TPROVISAOFERIAS_CC': {
                'cod_col': 'BDCODCOL',
                'cod_cc': 'BDCODCENTRO',
                'cod_emp': 'BDCODEMP',
                'plano_cc': 'BDPLANOCC',  # Plano de contas
                'data': None
            },
            'VW_VRHF_EMP_TPROVISAO13_CC': {
                'cod_col': 'BDCODCOL',
                'cod_cc': 'BDCODCENTRO',
                'cod_emp': 'BDCODEMP',
                'plano_cc': 'BDPLANOCC',  # Plano de contas
                'data': None
            },
            'VWSCI_EMPMENSAL_ABA_PLA': {
                'cod_col': None,
                'cod_cc': None,  # Não tem centro de custo direto
                'cod_emp': 'BDCODEMP',
                'plano_cc': 'BDCODPLANOONLINE',  # Plano online (pode ser diferente de BDPLANOCC)
                'data': None
            },
            'VWSCI_DADOS_DARFIMP_RELATORIO': {
                'cod_col': 'BDCODCOL',
                'cod_cc': 'BDCODCENTRO',
                'cod_tpcc': 'BDCODTPCC',  # Tipo de conta do centro de custo
                'cod_emp': 'BDCODEMP',
                'desc_cc': 'BDNOMCTA',  # Tem descrição via JOIN com CENTROS_TPCC
                'data': None
            },
            'VWSCI_EMPMENSAL_ABA_ADIC': {
                'cod_col': None,
                'cod_cc': None,  # Não tem centro de custo
                'cod_emp': 'BDCODEMP',
                'data': None
            },
            'VWGR_FIN_ESCRITORIO': {
                'cod_col': None,
                'cod_cc': None,  # Não tem centro de custo direto
                'cod_emp': None,
                'data': None
            },
            'VFIN_BASE_TGRUPOECOPLANOCC': {
                'cod_col': None,
                'cod_cc': 'BDCODCENTRODEST',  # Centro de custo destino
                'cod_cc_org': 'BDCODCENTROORG',  # Centro de custo origem (alternativo)
                'cod_tpcc': 'BDCODTPCCDEST',  # Tipo conta centro destino
                'cod_tpcc_org': 'BDCODTPCCORG',  # Tipo conta centro origem (alternativo)
                'cod_emp': None,
                'data': None
            },
            'VEF_BASE_TPLANOCCAUTOMATICO': {
                'cod_col': None,
                'cod_cc': 'BDCODCENTRO',
                'desc_cc': 'BDDESCRICAO',  # Tem descrição!
                'cod_emp': None,
                'data': None
            },
            'VEF_BASE_TPLANOACOESCCAUTO': {
                'cod_col': None,
                'cod_cc': 'BDCODCENTRO',
                'cod_tpcc': 'BDCODTPCC',
                'cod_emp': None,
                'data': None
            },
            'VWGR_VSUC_PLANOCONTAS': {
                'cod_col': None,
                'cod_cc': None,  # Não tem centro de custo direto
                'cod_emp': 'BDCODEMP',
                'plano_cc': 'BDCODPLAPADRAO',
                'desc_cc': 'BDNOMCTA',  # Descrição da conta (pode ser relacionada)
                'data': None
            },
            'VW_PLANOS_TFOR_IBGE_REF_MAX_MIN': {
                'cod_col': None,
                'cod_cc': None,  # Não tem centro de custo
                'cod_emp': None,
                'data': None
            }
        }
        
        campos = campos_por_view.get(view_name, {})
        
        # Algumas views podem não ter centro de custo (como VWSCI_EMPMENSAL_ABA_PLA, VWSCI_EMPMENSAL_ABA_ADIC, VWGR_FIN_ESCRITORIO, VWGR_VSUC_PLANOCONTAS, VW_PLANOS_TFOR_IBGE_REF_MAX_MIN)
        # Nesses casos, vamos retornar sucesso mas sem dados de centro de custo
        views_sem_cc = ['VWSCI_EMPMENSAL_ABA_PLA', 'VWSCI_EMPMENSAL_ABA_ADIC', 'VWGR_FIN_ESCRITORIO', 'VWGR_VSUC_PLANOCONTAS', 'VW_PLANOS_TFOR_IBGE_REF_MAX_MIN']
        if not campos.get('cod_cc') and view_name not in views_sem_cc:
            return {
                'view': view_name,
                'sucesso': False,
                'erro': 'View não mapeada ou sem campo de centro de custo'
            }
        
        # Construir SELECT baseado nos campos disponíveis
        select_fields = []
        if campos.get('cod_cc'):
            select_fields.append(f"{campos['cod_cc']} AS CODIGO_CC")
        if campos.get('desc_cc'):
            select_fields.append(f"{campos['desc_cc']} AS DESCRICAO_CC")
        if campos.get('cod_col'):
            select_fields.append(f"{campos['cod_col']} AS CODIGO_COLABORADOR")
        if campos.get('cod_emp'):
            select_fields.append(f"{campos['cod_emp']} AS CODIGO_EMPRESA")
        if campos.get('plano_cc'):
            select_fields.append(f"{campos['plano_cc']} AS PLANO_CC")
        if campos.get('cod_tpcc'):
            select_fields.append(f"{campos['cod_tpcc']} AS COD_TPCC")
        if campos.get('cod_tpcc_org'):
            select_fields.append(f"{campos['cod_tpcc_org']} AS COD_TPCC_ORG")
        if campos.get('cod_cc_org'):
            select_fields.append(f"{campos['cod_cc_org']} AS COD_CC_ORG")
        if campos.get('desc_cc'):
            select_fields.append(f"{campos['desc_cc']} AS DESCRICAO_CC")
        if campos.get('data'):
            select_fields.append(f"{campos['data']} AS DATA")
        
        if not select_fields:
            return {
                'view': view_name,
                'sucesso': False,
                'erro': 'Nenhum campo disponível para seleção'
            }
        
        # Construir WHERE
        where_clauses = []
        if campos.get('cod_emp'):
            where_clauses.append(f"{campos['cod_emp']} = {cod_empresa}")
        elif view_name in ['VW_VRH_BASE_TCUSTOM_GPS_PGTO', 'VW_VRH_BASE_TCUSTOM_GPS', 'VW_TOMADORES_REF_ATU']:
            # Essas views não têm código empresa direto, então não podemos filtrar por empresa
            # Mas vamos buscar mesmo assim para ver o que tem
            pass
        
        sql = f"""
        SELECT FIRST 10 {', '.join(select_fields)}
        FROM {view_name}
        """
        
        if where_clauses:
            sql += f" WHERE {' AND '.join(where_clauses)}"
        
        sql += " ORDER BY " + (campos.get('cod_col') or campos.get('cod_cc') or '1')
        
        cursor.execute(sql)
        colunas = [desc[0] for desc in cursor.description] if cursor.description else []
        resultados = cursor.fetchall()
        
        return {
            'view': view_name,
            'sucesso': True,
            'colunas': colunas,
            'resultados': [[str(cell) if cell is not None else '' for cell in row] for row in resultados],
            'total': len(resultados)
        }
        
    except Exception as e:
        return {
            'view': view_name,
            'sucesso': False,
            'erro': str(e)
        }
    finally:
        cursor.close()

def buscar_nome_colaborador(conn, cod_empresa, cod_colaborador):
    """Busca o nome do colaborador usando VWRH_COLCON_CALCULO"""
    if not cod_colaborador:
        return None
    
    try:
        cursor = conn.connect().cursor()
        sql = f"""
        SELECT FIRST 1 BDNOMCOL
        FROM VWRH_COLCON_CALCULO
        WHERE BDCODEMP = {cod_empresa}
        AND BDCODCOL = {cod_colaborador}
        """
        cursor.execute(sql)
        resultado = cursor.fetchone()
        cursor.close()
        return resultado[0] if resultado and resultado[0] else None
    except:
        return None

def buscar_descricao_centro_custo(conn, cod_empresa, cod_cc, cod_plano_cc=None, cod_tpcc=None):
    """
    Busca a descrição do centro de custo usando o plano de contas quando disponível
    O plano de contas 1186 pode ser BDCODPLAPADRAO ou BDPLANOCC
    Tenta múltiplas estratégias:
    1. CENTROS_TPCC.BDNOMCTA usando BDCODCENTRO + BDCODTPCC (se disponível) - descrição da conta contábil
    2. Buscar em CENTROS_TPCC relacionado com plano de contas via TEMPRESAS_REF
    3. TCENTROS.BDAPELIDO (apelido do centro de custo)
    4. VW_VRHF_EMP_TPREPFN_ATU.BDNOMCC (vem de CENTROS_TPCC)
    """
    if not cod_cc:
        return None
    
    try:
        cursor = conn.connect().cursor()
        
        # Estratégia 1: Se tiver cod_tpcc, buscar diretamente em CENTROS_TPCC
        # CENTROS_TPCC.BDNOMCTA é a descrição da conta contábil do centro de custo
        if cod_tpcc:
            try:
                cod_tpcc_int = int(str(cod_tpcc).strip())
                sql = f"""
                SELECT FIRST 1 BDNOMCTA
                FROM CENTROS_TPCC
                WHERE BDCODCENTRO = {cod_cc}
                AND BDCODTPCC = {cod_tpcc_int}
                AND BDNOMCTA IS NOT NULL
                AND TRIM(BDNOMCTA) <> ''
                """
                cursor.execute(sql)
                resultado = cursor.fetchone()
                
                if resultado and resultado[0]:
                    descricao = str(resultado[0]).strip()
                    if descricao:
                        cursor.close()
                        return descricao
            except (ValueError, TypeError):
                pass
        
        # Estratégia 2: Se tiver plano de contas, tentar buscar relacionando com TEMPRESAS_REF
        # para encontrar CENTROS_TPCC relacionado ao plano de contas da empresa
        # O plano de contas 1186 pode ser BDCODPLAPADRAO
        if cod_plano_cc:
            try:
                plano_int = int(str(cod_plano_cc).strip())
                # Primeiro, verificar se a empresa tem esse plano de contas
                # Buscar CENTROS_TPCC relacionado ao centro de custo e ao plano de contas da empresa
                sql = f"""
                SELECT FIRST 1 TPCC.BDNOMCTA
                FROM CENTROS_TPCC TPCC
                INNER JOIN TEMPRESAS_REF TREF ON (TREF.BDCODCENTROS = TPCC.BDCODCENTRO)
                WHERE TPCC.BDCODCENTRO = {cod_cc}
                AND TREF.BDCODEMP = {cod_empresa}
                AND (TREF.BDCODPLAPADRAO = {plano_int} OR TREF.BDCODPLANOONLINE = {plano_int})
                AND TPCC.BDNOMCTA IS NOT NULL
                AND TRIM(TPCC.BDNOMCTA) <> ''
                ORDER BY TPCC.BDCODTPCC
                """
                cursor.execute(sql)
                resultado = cursor.fetchone()
                
                if resultado and resultado[0]:
                    descricao = str(resultado[0]).strip()
                    if descricao:
                        cursor.close()
                        return descricao
                
                # Se não encontrou com JOIN, buscar apenas em CENTROS_TPCC para o centro de custo
                # relacionado à empresa (via BDCODCENTROS em TEMPRESAS_REF)
                sql = f"""
                SELECT FIRST 1 TPCC.BDNOMCTA
                FROM CENTROS_TPCC TPCC
                WHERE TPCC.BDCODCENTRO = {cod_cc}
                AND EXISTS (
                    SELECT 1 FROM TEMPRESAS_REF TREF 
                    WHERE TREF.BDCODEMP = {cod_empresa}
                    AND TREF.BDCODCENTROS = TPCC.BDCODCENTRO
                    AND (TREF.BDCODPLAPADRAO = {plano_int} OR TREF.BDCODPLANOONLINE = {plano_int})
                )
                AND TPCC.BDNOMCTA IS NOT NULL
                AND TRIM(TPCC.BDNOMCTA) <> ''
                ORDER BY TPCC.BDCODTPCC
                """
                cursor.execute(sql)
                resultado = cursor.fetchone()
                
                if resultado and resultado[0]:
                    descricao = str(resultado[0]).strip()
                    if descricao:
                        cursor.close()
                        return descricao
            except (ValueError, TypeError) as e:
                pass
        
        # Estratégia 3: Buscar em CENTROS_TPCC sem filtro de BDCODTPCC (pegar qualquer descrição)
        # Primeiro tentar com filtro de empresa, depois sem filtro
        sql = f"""
        SELECT FIRST 1 TPCC.BDNOMCTA
        FROM CENTROS_TPCC TPCC
        WHERE TPCC.BDCODCENTRO = {cod_cc}
        AND EXISTS (
            SELECT 1 FROM TEMPRESAS_REF TREF 
            WHERE TREF.BDCODEMP = {cod_empresa}
            AND TREF.BDCODCENTROS = TPCC.BDCODCENTRO
        )
        AND TPCC.BDNOMCTA IS NOT NULL
        AND TRIM(TPCC.BDNOMCTA) <> ''
        ORDER BY TPCC.BDCODTPCC
        """
        cursor.execute(sql)
        resultado = cursor.fetchone()
        
        if resultado and resultado[0]:
            descricao = str(resultado[0]).strip()
            if descricao:
                cursor.close()
                return descricao
        
        # Se não encontrou com filtro de empresa, buscar sem filtro
        sql = f"""
        SELECT FIRST 1 BDNOMCTA
        FROM CENTROS_TPCC
        WHERE BDCODCENTRO = {cod_cc}
        AND BDNOMCTA IS NOT NULL
        AND TRIM(BDNOMCTA) <> ''
        ORDER BY BDCODTPCC
        """
        cursor.execute(sql)
        resultado = cursor.fetchone()
        
        if resultado and resultado[0]:
            descricao = str(resultado[0]).strip()
            if descricao:
                cursor.close()
                return descricao
        
        # Estratégia 4: Tentar em VW_VRHF_EMP_TPREPFN_ATU (tem BDNOMCC que vem de CENTROS_TPCC)
        sql = f"""
        SELECT FIRST 1 BDNOMCC
        FROM VW_VRHF_EMP_TPREPFN_ATU
        WHERE BDCODCENTRO = {cod_cc}
        AND BDCODEMP = {cod_empresa}
        AND BDNOMCC IS NOT NULL
        AND TRIM(BDNOMCC) <> ''
        """
        cursor.execute(sql)
        resultado = cursor.fetchone()
        
        if resultado and resultado[0]:
            descricao = str(resultado[0]).strip()
            if descricao:
                cursor.close()
                return descricao
        
        # Estratégia 5: Se não encontrou descrição em CENTROS_TPCC, usar BDAPELIDO de TCENTROS
        # como último recurso (pode ser razão social, mas é melhor que N/A)
        sql = f"""
        SELECT FIRST 1 BDAPELIDO
        FROM TCENTROS
        WHERE BDCODCENTRO = {cod_cc}
        AND BDAPELIDO IS NOT NULL
        AND TRIM(BDAPELIDO) <> ''
        """
        cursor.execute(sql)
        resultado = cursor.fetchone()
        
        if resultado and resultado[0]:
            descricao = str(resultado[0]).strip()
            if descricao:
                cursor.close()
                return descricao
        
        cursor.close()
        return None
    except Exception as e:
        # Em caso de erro, retornar None silenciosamente
        try:
            cursor.close()
        except:
            pass
        return None

def consultar_todas_views(cod_empresa=186, cnpj=None, plano_contas=1186):
    """Consulta todas as views e consolida resultados"""
    conn = SCIConnection()
    
    print(f"\n{'='*80}")
    print(f"CONSULTA DE COLABORADORES E CENTROS DE CUSTO")
    print(f"{'='*80}")
    print(f"Código Empresa: {cod_empresa}")
    if cnpj:
        print(f"CNPJ: {cnpj}")
    if plano_contas:
        print(f"Plano de Contas: {plano_contas}")
    print(f"Views a consultar: {len(VIEWS_ALVO)}")
    print(f"{'='*80}\n")
    
    todos_resultados = []
    resultados_consolidados = {}
    
    for view in VIEWS_ALVO:
        print(f"Consultando {view}...")
        resultado = consultar_view(conn, view, cod_empresa)
        
        if not resultado.get('sucesso'):
            print(f"  [AVISO] {resultado.get('erro', 'Erro desconhecido')}\n")
            continue
        
        total = resultado.get('total', 0)
        print(f"  [OK] {total} registro(s) encontrado(s)")
        
        colunas = resultado.get('colunas', [])
        resultados_raw = resultado.get('resultados', [])
        
        # Processar resultados
        for row in resultados_raw:
            # Criar dicionário com os dados
            dados = dict(zip(colunas, row))
            
            cod_cc = dados.get('CODIGO_CC') or dados.get('CODCENTROCUSTO') or dados.get('BDCODCENTRO') or dados.get('BDCODCENTRODEST') or dados.get('BDCODCENTROORG')
            desc_cc = dados.get('DESCRICAO_CC') or dados.get('BDNOMCC') or dados.get('BDNOMCTA') or dados.get('BDDESCRICAO')
            cod_col = dados.get('CODIGO_COLABORADOR') or dados.get('CODEMPREGADO') or dados.get('BDCODCOL')
            plano_cc = dados.get('PLANO_CC') or dados.get('BDPLANOCC') or dados.get('BDCODPLANOONLINE') or dados.get('BDCODPLAPADRAO')
            cod_tpcc = dados.get('COD_TPCC') or dados.get('BDCODTPCC') or dados.get('BDCODTPCCDEST') or dados.get('BDCODTPCCORG')
            
            # Converter string vazia para None
            cod_cc = cod_cc if cod_cc and str(cod_cc).strip() else None
            desc_cc = desc_cc if desc_cc and str(desc_cc).strip() else None
            cod_col = cod_col if cod_col and str(cod_col).strip() else None
            plano_cc = plano_cc if plano_cc and str(plano_cc).strip() else None
            cod_tpcc = cod_tpcc if cod_tpcc and str(cod_tpcc).strip() else None
            
            # Converter cod_cc para inteiro se possível (algumas views retornam como VARCHAR)
            try:
                if cod_cc:
                    cod_cc = int(str(cod_cc).strip())
            except (ValueError, TypeError):
                cod_cc = None
            
            # Se não tem descrição, buscar usando código do centro de custo e plano de contas
            # Se tiver cod_tpcc, usar para buscar descrição mais precisa em CENTROS_TPCC
            # Se não tiver plano_cc nas views, usar o plano_contas padrão (1186)
            if cod_cc and not desc_cc:
                plano_usar = plano_cc or plano_contas
                desc_cc = buscar_descricao_centro_custo(conn, cod_empresa, cod_cc, plano_usar, cod_tpcc)
            
            # Se não tem nome colaborador, buscar
            nome_col = None
            if cod_col:
                nome_col = buscar_nome_colaborador(conn, cod_empresa, cod_col)
            
            # Criar chave única para evitar duplicatas
            chave = f"{cod_col}_{cod_cc}" if cod_col and cod_cc else f"cc_{cod_cc}"
            
            if chave not in resultados_consolidados:
                resultados_consolidados[chave] = {
                    'codigo_centro_custo': cod_cc,
                    'descricao_centro_custo': desc_cc or 'N/A',
                    'codigo_colaborador': cod_col,
                    'nome_colaborador': nome_col or 'N/A',
                    'view_origem': view
                }
        
        todos_resultados.append(resultado)
        print()
    
    # Converter para lista ordenada
    lista_final = list(resultados_consolidados.values())
    
    # Ordenar por código centro de custo e depois por nome colaborador
    lista_final.sort(key=lambda x: (
        int(x['codigo_centro_custo']) if x['codigo_centro_custo'] and str(x['codigo_centro_custo']).isdigit() else 999999,
        x['nome_colaborador']
    ))
    
    return {
        'success': True,
        'codigo_empresa': cod_empresa,
        'cnpj': cnpj,
        'total_registros': len(lista_final),
        'resultados': lista_final,
        'detalhes_views': todos_resultados
    }

def main():
    """Executa a consulta"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Consulta colaboradores e centros de custo em views específicas')
    parser.add_argument('--cod-empresa', type=int, default=186, help='Código da empresa')
    parser.add_argument('--cnpj', type=str, default='09471676000138', help='CNPJ da empresa (para referência)')
    parser.add_argument('--plano-contas', type=int, default=1186, help='Plano de contas (padrão: 1186)')
    parser.add_argument('--json', action='store_true', help='Retornar resultado em JSON')
    
    args = parser.parse_args()
    
    resultado = consultar_todas_views(
        cod_empresa=args.cod_empresa,
        cnpj=args.cnpj,
        plano_contas=args.plano_contas
    )
    
    if args.json:
        print(json.dumps(resultado, indent=2, ensure_ascii=False))
    else:
        if not resultado.get('success'):
            print(f"\n❌ ERRO: {resultado.get('error', 'Erro desconhecido')}\n")
            return
        
        total = resultado.get('total_registros', 0)
        resultados = resultado.get('resultados', [])
        
        print(f"\n{'='*80}")
        print(f"RESULTADOS CONSOLIDADOS")
        print(f"{'='*80}")
        print(f"Total de registros únicos: {total}")
        print(f"{'='*80}\n")
        
        if total == 0:
            print("⚠️  Nenhum registro encontrado.\n")
            return
        
        # Exibir resultados em formato de tabela
        print(f"{'Cód. CC':<10} {'Descrição Centro de Custo':<40} {'Cód. Colab.':<12} {'Nome Colaborador':<40} {'View Origem':<30}")
        print("-" * 140)
        
        # Limitar a 10 registros para conferência
        resultados_exibir = resultados[:10]
        for r in resultados_exibir:
            cod_cc = str(r['codigo_centro_custo']) if r['codigo_centro_custo'] else 'N/A'
            desc_cc = (r['descricao_centro_custo'][:38] + '..') if r['descricao_centro_custo'] and len(r['descricao_centro_custo']) > 40 else (r['descricao_centro_custo'] or 'N/A')
            cod_col = str(r['codigo_colaborador']) if r['codigo_colaborador'] else 'N/A'
            nome_col = (r['nome_colaborador'][:38] + '..') if r['nome_colaborador'] and len(r['nome_colaborador']) > 40 else (r['nome_colaborador'] or 'N/A')
            view_orig = r['view_origem'][:28] + '..' if len(r['view_origem']) > 30 else r['view_origem']
            
            print(f"{cod_cc:<10} {desc_cc:<40} {cod_col:<12} {nome_col:<40} {view_orig:<30}")
        
        print(f"\n{'='*80}")
        if total > 10:
            print(f"Total: {total} registro(s) único(s) (exibindo apenas os 10 primeiros)\n")
        else:
            print(f"Total: {total} registro(s) único(s)\n")

if __name__ == "__main__":
    main()

