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
        registro_corrigir = correcao.get("registro_corrigir", "")
        campo = correcao.get("campo", "")
        valor_correto = correcao.get("valor_correto")
        cfop = correcao.get("cfop", "")
        cst = correcao.get("cst", "")
        chave = correcao.get("chave", "")
        
        print(json.dumps({
            "debug": "Iniciando aplicação de correção",
            "sped_path": str(sped_path),
            "output_path": str(output_path),
            "correcao": {
                "registro": registro_corrigir,
                "campo": campo,
                "valor_correto": valor_correto,
                "cfop": cfop,
                "cst": cst,
                "chave": chave[:20] + "..." if chave else ""
            }
        }), flush=True)
        
        # VALIDAÇÃO PRÉVIA: Verificar se arquivo SPED contém C100 quando necessário
        if registro_corrigir == "C190" and (not cfop or not cst) and chave:
            try:
                if not sped_path.exists():
                    print(json.dumps({
                        "success": False,
                        "error": f"Arquivo SPED não encontrado: {sped_path}",
                        "resumo": {
                            "erro": f"Arquivo SPED não encontrado: {sped_path}",
                            "detalhes": "O arquivo SPED especificado não existe.",
                            "sugestao": "Verifique se o caminho do arquivo está correto."
                        }
                    }), flush=True)
                    sys.exit(1)
                
                # Ler arquivo inteiro para verificar se tem C100 (não apenas primeiras linhas)
                # CORREÇÃO: C100 pode estar em qualquer parte do arquivo, não apenas no início
                with sped_path.open('r', encoding='latin1', errors='ignore') as f:
                    # Ler arquivo inteiro para busca completa
                    conteudo_completo = f.read()
                    tem_c100 = '|C100|' in conteudo_completo
                    
                    if not tem_c100:
                        # Contar registros encontrados (usar primeiras linhas para diagnóstico)
                        import re
                        registros_encontrados = {}
                        # Verificar primeiras 500 linhas para diagnóstico
                        primeiras_linhas = '\n'.join(conteudo_completo.split('\n')[:500])
                        for linha in primeiras_linhas.split('\n'):
                            match = re.match(r'^\|(\d{4})\|', linha)
                            if match:
                                reg = match.group(1)
                                registros_encontrados[reg] = registros_encontrados.get(reg, 0) + 1
                        
                        # Se não encontrou nas primeiras 500, verificar arquivo inteiro
                        if not registros_encontrados:
                            for linha in conteudo_completo.split('\n')[:1000]:
                                match = re.match(r'^\|(\d{4})\|', linha)
                                if match:
                                    reg = match.group(1)
                                    registros_encontrados[reg] = registros_encontrados.get(reg, 0) + 1
                        
                        print(json.dumps({
                            "success": False,
                            "error": "Nenhum registro C100 encontrado no arquivo SPED",
                            "resumo": {
                                "erro": "Nenhum registro C100 encontrado no arquivo SPED",
                                "detalhes": f"O arquivo SPED não contém registros C100. Registros encontrados: {list(registros_encontrados.keys())[:10]}",
                                "sugestao": "Verifique se o arquivo SPED está completo e contém o Bloco C (Documentos Fiscais)."
                            }
                        }), flush=True)
                        sys.exit(1)
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": f"Erro ao verificar arquivo SPED: {e}",
                    "resumo": {
                        "erro": f"Erro ao verificar arquivo SPED: {e}",
                        "detalhes": str(e),
                        "sugestao": "Verifique se o arquivo SPED está acessível e não está corrompido."
                    }
                }), flush=True)
                sys.exit(1)
        
        # Aplicar correção passando o output_path diretamente
        sys.stderr.write(f"[aplicar_correcao.py] ANTES DE CHAMAR aplicar_correcao_c170_c190\n")
        sys.stderr.write(f"[aplicar_correcao.py] sped_path={sped_path}\n")
        sys.stderr.write(f"[aplicar_correcao.py] correcao={correcao}\n")
        sys.stderr.flush()
        
        sucesso, arquivo_corrigido, resumo = aplicar_correcao_c170_c190(sped_path, correcao, output_path)
        
        sys.stderr.write(f"[aplicar_correcao.py] DEPOIS DE CHAMAR - sucesso={sucesso}\n")
        sys.stderr.flush()
        
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

