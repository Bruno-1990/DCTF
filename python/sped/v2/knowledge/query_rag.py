"""
Script para consulta RAG via linha de comando
Usado pelo backend Node.js para buscar documentos legais
"""

import sys
import json
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.legal_rag import LegalDocumentRAG

def main():
    """Consulta RAG e retorna resultados em JSON"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Query é obrigatória"
        }))
        sys.exit(1)
    
    query = sys.argv[1]
    
    # Parâmetros opcionais
    n_results = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 5
    document_id = sys.argv[3] if len(sys.argv) > 3 else None
    min_score = float(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].replace('.', '').isdigit() else 0.3
    
    try:
        # Inicializar RAG
        rag = LegalDocumentRAG(
            vector_store_path="./data/chroma_db",
            embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        
        # Preparar filtros
        filter_metadata = {}
        if document_id:
            filter_metadata["document_id"] = document_id
        
        # Buscar
        results = rag.query_legal_context(
            query=query,
            n_results=n_results,
            filter_metadata=filter_metadata if filter_metadata else None,
            min_score=min_score
        )
        
        # Converter para JSON
        output = {
            "success": True,
            "data": [
                {
                    "chunk_id": r.chunk_id,
                    "chunk_text": r.chunk_text,
                    "score": r.score,
                    "metadata": r.metadata,
                    "document_id": r.document_id,
                    "section_title": r.section_title,
                    "article_number": r.article_number
                }
                for r in results
            ],
            "count": len(results)
        }
        
        print(json.dumps(output, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()

