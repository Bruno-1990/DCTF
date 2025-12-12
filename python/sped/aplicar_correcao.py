#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para aplicar correção automática em arquivo SPED
Chamado pelo backend Node.js para corrigir divergências identificadas
"""
import sys
import json
from pathlib import Path

# Adicionar diretório atual ao path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from sped_editor import aplicar_correcao_c170_c190
except ImportError as e:
    print(json.dumps({"error": f"Erro ao importar módulos: {e}"}))
    sys.exit(1)

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes. Esperado: sped_path output_path correcao_json_path"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    correcao_json_path = Path(sys.argv[3])
    
    try:
        # Ler e parsear JSON da correção (pode ser arquivo ou string JSON)
        if correcao_json_path.exists():
            # É um arquivo
            correcao = json.loads(correcao_json_path.read_text(encoding='utf-8'))
        else:
            # Tentar como string JSON direta (compatibilidade)
            correcao = json.loads(str(correcao_json_path))
        
        # Log para debug
        print(json.dumps({
            "debug": "Iniciando aplicação de correção",
            "sped_path": str(sped_path),
            "output_path": str(output_path),
            "correcao": {
                "registro": correcao.get("registro_corrigir"),
                "campo": correcao.get("campo"),
                "valor_correto": correcao.get("valor_correto"),
                "cfop": correcao.get("cfop"),
                "cst": correcao.get("cst")
            }
        }), flush=True)
        
        # Aplicar correção passando o output_path diretamente
        sucesso, arquivo_corrigido, resumo = aplicar_correcao_c170_c190(sped_path, correcao, output_path)
        
        if sucesso:
            
            # Salvar resumo das alterações
            resumo_path = output_path.parent / 'resumo_correcao.json'
            resumo_path.write_text(
                json.dumps(resumo, indent=2, ensure_ascii=False),
                encoding='utf-8'
            )
            
            print(json.dumps({
                "success": True,
                "arquivo_corrigido": str(arquivo_corrigido),
                "resumo": resumo
            }), flush=True)
        else:
            error_msg = json.dumps({
                "success": False,
                "error": resumo.get("erro", "Erro desconhecido"),
                "resumo": resumo
            })
            print(error_msg, flush=True)
            sys.exit(1)
        
    except Exception as e:
        import traceback
        error_msg = f"Erro ao aplicar correção: {str(e)}\n{traceback.format_exc()}"
        print(json.dumps({"error": error_msg}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

