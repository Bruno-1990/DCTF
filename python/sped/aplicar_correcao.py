#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para aplicar correção automática em arquivo SPED
Chamado pelo backend Node.js para corrigir divergências identificadas
"""
import sys
import json
from pathlib import Path
from typing import Optional

# Adicionar diretório atual ao path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from sped_editor import aplicar_correcao_c170_c190, aplicar_correcao_com_xml, aplicar_correcoes_multiplas_c170_c190
    from xml_extractor import extrair_dados_xml_nfe
    HAS_XML_SUPPORT = True
except ImportError as e:
    print(json.dumps({"warning": f"Suporte a XML limitado: {e}"}))
    try:
        from sped_editor import aplicar_correcao_c170_c190, aplicar_correcoes_multiplas_c170_c190
    except ImportError:
        from sped_editor import aplicar_correcao_c170_c190
        # Fallback: se não tem a função de lote, criar um wrapper
        def aplicar_correcoes_multiplas_c170_c190(sped_path, correcoes, output_path=None):
            # Aplicar correções sequencialmente (modo compatibilidade)
            for correcao in correcoes:
                sucesso, sped_path, resumo = aplicar_correcao_c170_c190(sped_path, correcao, output_path)
                if not sucesso:
                    return (sucesso, sped_path, resumo)
            return (True, sped_path, {"total_alteracoes": len(correcoes)})
    HAS_XML_SUPPORT = False

def buscar_xml_por_chave(diretorio_xmls: Path, chave_nfe: str) -> Optional[Path]:
    """Busca XML no diretório pelo nome do arquivo ou pela chave dentro do XML"""
    if not diretorio_xmls or not diretorio_xmls.exists():
        return None
    
    # Tentar encontrar por nome do arquivo (chave.xml)
    xml_direto = diretorio_xmls / f"{chave_nfe}.xml"
    if xml_direto.exists():
        return xml_direto
    
    # Buscar em todos os XMLs do diretório
    for xml_file in diretorio_xmls.glob("*.xml"):
        try:
            # Ler e verificar se a chave bate
            dados = extrair_dados_xml_nfe(xml_file)
            if dados and dados.chave_nfe == chave_nfe:
                return xml_file
        except:
            continue
    
    return None


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes. Esperado: sped_path output_path correcao_json_path [xmls_dir]"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    correcao_json_path = Path(sys.argv[3])
    xmls_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    
    try:
        # Ler e parsear JSON da correção (pode ser arquivo ou string JSON)
        if correcao_json_path.exists():
            # É um arquivo
            correcao_data = json.loads(correcao_json_path.read_text(encoding='utf-8'))
        else:
            # Tentar como string JSON direta (compatibilidade)
            correcao_data = json.loads(str(correcao_json_path))
        
        # NOVO: Suporte para múltiplas correções (array) ou correção única (objeto)
        # Se for um array, é um lote de correções para a mesma chave
        # Se for um objeto, é uma correção única (retrocompatibilidade)
        if isinstance(correcao_data, list):
            correcoes = correcao_data
            print(json.dumps({
                "info": f"Modo LOTE: {len(correcoes)} correções para aplicar na mesma chave"
            }), flush=True)
        else:
            correcoes = [correcao_data]
            print(json.dumps({
                "info": "Modo ÚNICA correção (retrocompatibilidade)"
            }), flush=True)
        
        # Validar que todas as correções são da mesma chave (se houver chave)
        chaves = [c.get("chave", "") for c in correcoes if c.get("chave")]
        if len(set(chaves)) > 1:
            print(json.dumps({
                "success": False,
                "error": "Múltiplas chaves diferentes no lote de correções",
                "resumo": {
                    "erro": "Todas as correções de um lote devem ser da mesma NF (mesma chave)",
                    "detalhes": f"Chaves encontradas: {set(chaves)}",
                    "sugestao": "Agrupe as correções por chave e envie lotes separados para cada chave."
                }
            }), flush=True)
            sys.exit(1)
        
        # Usar primeira correção para extrair dados comuns (chave, cfop, cst)
        correcao = correcoes[0]
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
        
        # DECISÃO: Usar função de lote ou única?
        if len(correcoes) > 1:
            # MODO LOTE: Múltiplas correções na mesma NF
            sys.stderr.write(f"[aplicar_correcao.py] MODO LOTE: {len(correcoes)} correções\n")
            sys.stderr.flush()
            
            sucesso, arquivo_corrigido, resumo = aplicar_correcoes_multiplas_c170_c190(
                sped_path=sped_path,
                correcoes=correcoes,
                output_path=output_path
            )
        else:
            # MODO ÚNICO: Uma correção apenas (retrocompatibilidade)
            sys.stderr.write(f"[aplicar_correcao.py] MODO ÚNICO: 1 correção\n")
            sys.stderr.flush()
            
            # ESTRATÉGIA NOVA: Tentar usar XML quando disponível
            xml_path = None
            if HAS_XML_SUPPORT and xmls_dir and chave:
                sys.stderr.write(f"[aplicar_correcao.py] Buscando XML para chave {chave[:20]}...\n")
                sys.stderr.flush()
                xml_path = buscar_xml_por_chave(xmls_dir, chave)
                if xml_path:
                    sys.stderr.write(f"[aplicar_correcao.py] OK XML encontrado: {xml_path}\n")
                    sys.stderr.flush()
                else:
                    sys.stderr.write(f"[aplicar_correcao.py] AVISO XML não encontrado no diretório {xmls_dir}\n")
                    sys.stderr.flush()
            
            # Se temos XML, usar a nova lógica baseada em XML
            if xml_path and HAS_XML_SUPPORT:
                sys.stderr.write(f"[aplicar_correcao.py] Usando NOVA LÓGICA BASEADA EM XML\n")
                sys.stderr.flush()
                
                sucesso, arquivo_corrigido, resumo = aplicar_correcao_com_xml(
                    sped_path=sped_path,
                    xml_path=xml_path,
                    chave_nfe=chave,
                    campo=campo,
                    valor_correto=valor_correto,
                    output_path=output_path
                )
            else:
                # Fallback para lógica antiga (tentar extrair do próprio SPED)
                sys.stderr.write(f"[aplicar_correcao.py] Usando lógica tradicional (sem XML)\n")
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

