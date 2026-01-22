"""
Endpoint para consultas ao RAG (Retrieval-Augmented Generation)
Permite que o backend consulte a base de conhecimento legal
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List

# Forçar UTF-8 no Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


def consultar_rag(query: str, top_k: int = 5) -> Dict[str, Any]:
    """
    Consulta o RAG com uma pergunta sobre legislação fiscal
    
    Args:
        query: Pergunta sobre legislação
        top_k: Número de documentos relevantes a retornar
    
    Returns:
        Dict com resposta, confiança e referências
    """
    try:
        # Importar RAG (lazy import para não travar inicialização)
        from sped.v2.knowledge.legal_rag import LegalDocumentRAG
        
        print(f"[RAG Query] Inicializando RAG para consulta...")
        rag = LegalDocumentRAG()
        
        print(f"[RAG Query] Consultando: {query[:100]}...")
        resultados = rag.query_legal_context(query, n_results=top_k)
        
        if not resultados:
            return {
                "success": False,
                "answer": "Não foram encontrados documentos relevantes na base de conhecimento.",
                "confianca": 0,
                "referencias": [],
                "documentos": []
            }
        
        # Extrair resposta do primeiro resultado
        primeiro = resultados[0]
        resposta = primeiro.chunk_text
        
        # Calcular confiança média baseada nos scores
        scores = [r.score for r in resultados]
        confianca_media = int((sum(scores) / len(scores)) * 100) if scores else 0
        
        # Extrair referências únicas
        referencias = []
        for r in resultados:
            fonte = r.metadata.get('source', r.metadata.get('doc_source', 'Desconhecido'))
            if fonte not in referencias:
                referencias.append(fonte)
        
        return {
            "success": True,
            "answer": resposta,
            "confianca": confianca_media,
            "referencias": referencias,
            "documentos": [
                {
                    "content": r.chunk_text,
                    "score": r.score,
                    "metadata": r.metadata
                }
                for r in resultados
            ]
        }
        
    except ImportError as e:
        print(f"[RAG Query] ERRO: RAG não disponível - {e}")
        return {
            "success": False,
            "error": "RAG não está configurado. Instale as dependências necessárias.",
            "answer": "Sistema RAG indisponível. Usando regras hardcoded. Para instalar: pip install chromadb sentence-transformers",
            "confianca": 0,
            "referencias": []
        }
    
    except AttributeError as e:
        print(f"[RAG Query] ERRO: Método não encontrado - {e}")
        return {
            "success": False,
            "error": f"Erro de atributo: {str(e)}",
            "answer": "Erro ao consultar RAG. Verifique se o sistema foi inicializado corretamente.",
            "confianca": 0,
            "referencias": []
        }
    
    except Exception as e:
        print(f"[RAG Query] ERRO: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "answer": f"Erro ao consultar RAG: {str(e)}",
            "confianca": 0,
            "referencias": []
        }


def main():
    """Função principal para uso via CLI"""
    if len(sys.argv) < 2:
        print("Uso: python rag_query_endpoint.py '<query>' [top_k]")
        sys.exit(1)
    
    query = sys.argv[1]
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    
    resultado = consultar_rag(query, top_k)
    
    # Retornar JSON
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

