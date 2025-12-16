#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para aplicar TODAS as correções de uma vez
Otimizado para ler o arquivo SPED apenas uma vez
"""
import sys
import json
from pathlib import Path
import logging

# Adicionar diretório atual ao path
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

try:
    from sped_editor import SpedEditor, aplicar_correcao_c170_c190
except ImportError as e:
    print(json.dumps({"error": f"Erro ao importar módulos: {e}"}))
    sys.exit(1)

def aplicar_todas_correcoes(sped_path: Path, correcoes: list, output_path: Path) -> dict:
    """
    Aplica todas as correções de uma vez, otimizado para performance.
    
    Args:
        sped_path: Caminho do arquivo SPED original
        correcoes: Lista de dicionários com informações das correções
        output_path: Caminho do arquivo SPED corrigido final
    
    Returns:
        Dicionário com resumo das alterações
    """
    try:
        # Carregar arquivo SPED UMA VEZ
        logger.info(f"Carregando arquivo SPED: {sped_path}")
        editor = SpedEditor(sped_path)
        logger.info(f"Arquivo SPED carregado: {len(editor.lines)} linhas")
        
        resultados = []
        sucessos = 0
        falhas = 0
        
        # Aplicar cada correção sequencialmente, mas salvando apenas no final
        # Usar aplicar_correcao_c170_c190 que já tem toda a lógica necessária
        arquivo_atual = sped_path
        
        for i, correcao in enumerate(correcoes):
            try:
                if (i + 1) % 10 == 0:
                    logger.info(f"Progresso: {i + 1}/{len(correcoes)} correções processadas...")
                
                # Para cada correção, usar aplicar_correcao_c170_c190
                # Mas otimizar: usar arquivo temporário apenas se não for a última
                if i == len(correcoes) - 1:
                    # Última correção: salvar direto no output final
                    temp_path = output_path
                else:
                    # Correções intermediárias: usar arquivo temporário
                    temp_path = output_path.parent / f"temp_correcao_{i}.txt"
                
                # Aplicar correção
                sucesso_temp, arquivo_temp, resumo_temp = aplicar_correcao_c170_c190(
                    arquivo_atual, correcao, temp_path
                )
                
                if sucesso_temp:
                    # Verificar se o arquivo foi realmente criado
                    arquivo_criado = Path(arquivo_temp) if arquivo_temp else temp_path
                    if not arquivo_criado.exists():
                        logger.error(f"Arquivo não foi criado após correção {i + 1}: {arquivo_criado}")
                        falhas += 1
                        resultados.append({
                            "correcao": correcao,
                            "sucesso": False,
                            "erro": f"Arquivo não foi criado: {arquivo_criado}"
                        })
                        continue
                    
                    sucessos += 1
                    resultados.append({
                        "correcao": correcao,
                        "sucesso": True
                    })
                    # Atualizar arquivo atual para próxima iteração
                    arquivo_atual = arquivo_criado
                    logger.debug(f"Correção {i + 1} aplicada. Arquivo atual: {arquivo_atual}")
                else:
                    falhas += 1
                    resultados.append({
                        "correcao": correcao,
                        "sucesso": False,
                        "erro": resumo_temp.get("erro", "Erro desconhecido")
                    })
                    # Continuar com o mesmo arquivo mesmo se falhou
                    
            except Exception as e:
                import traceback
                falhas += 1
                error_msg = str(e)
                traceback_str = traceback.format_exc()
                logger.error(f"Erro ao aplicar correção {i + 1}: {error_msg}")
                logger.debug(f"Traceback: {traceback_str}")
                resultados.append({
                    "correcao": correcao,
                    "sucesso": False,
                    "erro": error_msg,
                    "traceback": traceback_str[:500] if len(traceback_str) > 500 else traceback_str
                })
        
        # O arquivo final já foi salvo na última iteração (quando i == len(correcoes) - 1)
        # Limpar arquivos temporários
        for i in range(len(correcoes) - 1):
            temp_path = output_path.parent / f"temp_correcao_{i}.txt"
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except:
                    pass
        
        # Garantir que o diretório existe
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Verificar se o arquivo final existe
        arquivo_final = Path(output_path)
        arquivo_atual_path = Path(arquivo_atual) if arquivo_atual else None
        
        if not arquivo_final.exists():
            logger.warning(f"Arquivo final não encontrado: {arquivo_final}")
            # Verificar se arquivo_atual existe e é diferente do output_path
            if arquivo_atual_path and arquivo_atual_path.exists() and arquivo_atual_path != arquivo_final:
                logger.warning(f"Arquivo atual existe mas não é o output final. Copiando {arquivo_atual_path} para {arquivo_final}")
                import shutil
                shutil.copy2(arquivo_atual_path, arquivo_final)
            elif arquivo_atual_path and arquivo_atual_path.exists():
                # Mesmo arquivo, apenas renomear se necessário
                logger.info(f"Arquivo atual é o mesmo que o final: {arquivo_atual_path}")
            else:
                logger.error(f"Arquivo atual não existe: {arquivo_atual_path}")
                return {
                    "success": False,
                    "error": f"Arquivo final não foi criado após aplicar correções. Último arquivo: {arquivo_atual}"
                }
        
        # Verificar tamanho do arquivo
        if arquivo_final.exists():
            file_size = arquivo_final.stat().st_size
            logger.info(f"Arquivo corrigido salvo: {arquivo_final} ({file_size} bytes)")
            print(json.dumps({"arquivo_criado": str(arquivo_final), "tamanho_bytes": file_size}), flush=True)
        else:
            logger.error(f"Arquivo final ainda não existe após tentativas: {arquivo_final}")
            return {
                "success": False,
                "error": f"Arquivo final não foi criado: {arquivo_final}"
            }
        
        return {
            "success": sucessos > 0,
            "sucessos": sucessos,
            "falhas": falhas,
            "total": len(correcoes),
            "resultados": resultados
        }
        
    except Exception as e:
        import traceback
        error_msg = f"Erro ao aplicar correções: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes. Esperado: sped_path output_path correcoes_json_path"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    correcoes_json_path = Path(sys.argv[3])
    
    try:
        # Ler lista de correções
        if correcoes_json_path.exists():
            correcoes = json.loads(correcoes_json_path.read_text(encoding='utf-8'))
        else:
            correcoes = json.loads(str(correcoes_json_path))
        
        if not isinstance(correcoes, list):
            print(json.dumps({"error": "correcoes deve ser uma lista"}))
            sys.exit(1)
        
        logger.info(f"Aplicando {len(correcoes)} correções de uma vez...")
        print(json.dumps({"status": "iniciando", "total": len(correcoes)}), flush=True)
        
        # Aplicar todas as correções
        resultado = aplicar_todas_correcoes(sped_path, correcoes, output_path)
        
        # Garantir que o resultado seja válido JSON
        resultado_json = json.dumps(resultado, indent=2, ensure_ascii=False)
        print(resultado_json, flush=True)
        
        if not resultado.get("success"):
            sys.exit(1)
        
    except Exception as e:
        import traceback
        error_msg = f"Erro ao aplicar correções: {str(e)}\n{traceback.format_exc()}"
        print(json.dumps({"error": error_msg}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

