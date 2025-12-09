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
        reports = make_reports(materiais, rules)
        
        # Converter DataFrames para dicionários, substituindo NaN por None
        import math
        
        def replace_nan(obj):
            """Substitui NaN, inf e -inf por None recursivamente"""
            if isinstance(obj, dict):
                return {k: replace_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_nan(item) for item in obj]
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
                    # Converter DataFrame para dict, substituindo NaN
                    # Usar fillna para substituir NaN por None
                    df_filled = df.fillna(None)
                    records = df_filled.to_dict('records')
                    # Aplicar replace_nan recursivamente para garantir
                    return replace_nan(records)
                except Exception as e:
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

