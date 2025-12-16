#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para processar validação SPED via API
Chamado pelo backend Node.js para executar validações
"""
import sys
import json
from pathlib import Path

# Adicionar diretório atual ao path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from reconcile import build_dataframes, make_reports
    from validators import load_rules_for_sector, run_all_validations
    from excelio import write_workbook
except ImportError as e:
    print(json.dumps({"error": f"Erro ao importar módulos: {e}"}))
    sys.exit(1)

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes. Esperado: sped_path xml_dir output_path [setores]"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    xml_dir = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    setores_str = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else ""
    
    try:
        # Validar arquivos
        if not sped_path.exists():
            print(json.dumps({"error": f"Arquivo SPED não encontrado: {sped_path}"}))
            sys.exit(1)
        
        if not xml_dir.exists() or not xml_dir.is_dir():
            print(json.dumps({"error": f"Diretório XML não encontrado: {xml_dir}"}))
            sys.exit(1)
        
        # Carregar dados
        print(json.dumps({"progress": 30, "message": "Carregando dados do SPED e XMLs..."}), flush=True)
        materiais = build_dataframes(sped_path, xml_dir)
        
        # Carregar regras de múltiplos setores
        setores = []
        if setores_str:
            setores = [s.strip() for s in setores_str.split(',') if s.strip()]
        
        if setores:
            setores_str_display = ', '.join(setores)
            print(json.dumps({"progress": 50, "message": f"Carregando e combinando regras dos setores: {setores_str_display}..."}), flush=True)
        else:
            print(json.dumps({"progress": 50, "message": "Carregando regras base..."}), flush=True)
        
        rules = load_rules_for_sector(sectors=setores) if setores else load_rules_for_sector()
        
        # Executar validações
        print(json.dumps({"progress": 70, "message": "Executando validações..."}), flush=True)
        validacoes = run_all_validations(sped_path, materiais.xml_nf, rules)
        
        # Gerar relatórios
        print(json.dumps({"progress": 85, "message": "Gerando relatórios..."}), flush=True)
        reports = make_reports(materiais, rules, sped_path)
        
        # Converter DataFrames para dicionários, substituindo NaN por None
        import math
        
        def replace_nan(obj):
            """Substitui NaN, inf e -inf por None recursivamente, mas preserva strings vazias em colunas de solução"""
            if isinstance(obj, dict):
                result = {}
                for k, v in obj.items():
                    # Para colunas de solução, preservar strings vazias como ""
                    if k in ["SOLUCAO_AUTOMATICA", "REGISTRO_CORRIGIR", "CAMPO_CORRIGIR", "FORMULA_LEGAL", "REFERENCIA_LEGAL"]:
                        if v is None or (isinstance(v, float) and math.isnan(v)):
                            result[k] = ""
                        elif isinstance(v, str):
                            result[k] = v  # Preservar string mesmo se vazia
                        elif hasattr(v, 'item'):  # numpy/pandas types
                            try:
                                val = v.item()
                                if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                                    result[k] = ""
                                else:
                                    result[k] = str(val) if val is not None else ""
                            except (ValueError, OverflowError, AttributeError):
                                result[k] = ""
                        else:
                            result[k] = str(v) if v is not None else ""
                    else:
                        result[k] = replace_nan(v)
                return result
            elif isinstance(obj, list):
                return [replace_nan(item) for item in obj]
            elif isinstance(obj, str):
                return obj  # Preservar strings
            elif isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
                return obj
            elif hasattr(obj, 'item'):  # numpy/pandas types
                try:
                    val = obj.item()
                    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                        return None
                    return val
                except (ValueError, OverflowError, AttributeError):
                    return None
            return obj
        
        def df_to_dict(df):
            if hasattr(df, 'to_dict'):
                try:
                    # Verificar se DataFrame está vazio ANTES de converter
                    if df.empty:
                        import logging
                        logging.info(f"[df_to_dict] DataFrame vazio detectado - retornando lista vazia")
                        return []
                    
                    # Converter DataFrame para dict, substituindo NaN
                    # Primeiro, identificar colunas de solução e preservar strings vazias
                    colunas_solucao = ['SOLUCAO_AUTOMATICA', 'REGISTRO_CORRIGIR', 'CAMPO_CORRIGIR', 
                                      'FORMULA_LEGAL', 'REFERENCIA_LEGAL']
                    
                    # Preencher NaN com string vazia para colunas de solução, None para outras
                    df_filled = df.copy()
                    for col in colunas_solucao:
                        if col in df_filled.columns:
                            # Garantir que seja string válida, tratando todos os casos
                            df_filled[col] = (
                                df_filled[col]
                                .fillna("")
                                .astype(str)
                                .replace("nan", "")
                                .replace("None", "")
                                .replace("null", "")
                                .replace("NaN", "")
                                .replace("NONE", "")
                                .replace("NULL", "")
                            )
                    
                    # Garantir que colunas de solução existam mesmo se não estiverem no DataFrame original
                    for col in colunas_solucao:
                        if col not in df_filled.columns:
                            df_filled[col] = ""
                    
                    # Preencher outras colunas com None (usar value explícito)
                    df_filled = df_filled.fillna(value=None)
                    records = df_filled.to_dict('records')
                    
                    # Garantir que colunas de solução estejam presentes em todos os registros
                    for record in records:
                        for col in colunas_solucao:
                            if col not in record:
                                record[col] = ""
                    
                    # DEBUG: Verificar se colunas de solução estão presentes
                    if records and len(records) > 0:
                        primeira_linha = records[0]
                        colunas_solucao_debug = ['SOLUCAO_AUTOMATICA', 'REGISTRO_CORRIGIR', 'VALOR_CORRETO', 
                                          'FORMULA_LEGAL', 'REFERENCIA_LEGAL', 'DETALHES_ITENS', 'DETALHES']
                        colunas_presentes = [col for col in colunas_solucao_debug if col in primeira_linha]
                        colunas_ausentes = [col for col in colunas_solucao_debug if col not in primeira_linha]
                        import logging
                        logging.info(f"[df_to_dict] Total de registros: {len(records)}")
                        logging.info(f"[df_to_dict] Colunas de solução presentes: {colunas_presentes}")
                        logging.info(f"[df_to_dict] Colunas de solução ausentes: {colunas_ausentes}")
                        logging.info(f"[df_to_dict] Todas as colunas do DataFrame: {list(df.columns) if hasattr(df, 'columns') else 'N/A'}")
                        if 'SOLUCAO_AUTOMATICA' in primeira_linha:
                            valor_solucao = primeira_linha['SOLUCAO_AUTOMATICA']
                            logging.info(f"[df_to_dict] SOLUCAO_AUTOMATICA encontrada! Valor: {str(valor_solucao)[:100] if valor_solucao else 'None/Vazio'}")
                        else:
                            logging.warning(f"[df_to_dict] SOLUCAO_AUTOMATICA NÃO encontrada na primeira linha!")
                    
                    # Aplicar replace_nan recursivamente para garantir
                    return replace_nan(records)
                except Exception as e:
                    import logging
                    logging.error(f"Erro ao converter DataFrame: {e}")
                    # Fallback: tentar sem limpeza
                    try:
                        records = df.to_dict('records')
                        return replace_nan(records)
                    except Exception:
                        return []
            elif isinstance(df, list):
                return replace_nan(df)
            else:
                return []
        
        # Combinar resultados
        resultado = {
            "empresa": {
                "cnpj": materiais.empresa.cnpj,
                "razao": materiais.empresa.razao,
                "dt_ini": materiais.empresa.dt_ini,
                "dt_fin": materiais.empresa.dt_fin
            },
            "validacoes": {k: df_to_dict(v) for k, v in validacoes.items()},
            "reports": {k: df_to_dict(v) for k, v in reports.items()}
        }
        
        # Limpar NaN do resultado antes de serializar
        resultado_limpo = replace_nan(resultado)
        
        # Salvar resultado
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(resultado_limpo, default=str, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        
        print(json.dumps({
            "success": True,
            "progress": 100,
            "message": "Validação concluída",
            "output": str(output_path)
        }), flush=True)
        
    except Exception as e:
        import traceback
        error_msg = f"Erro no processamento: {str(e)}\n{traceback.format_exc()}"
        print(json.dumps({"error": error_msg}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

