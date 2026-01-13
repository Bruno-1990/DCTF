"""
Script para gerar regra consultando documentos legais via RAG
Usado pelo backend Node.js para gerar regras estruturadas
"""

import sys
import json
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.legal_rag import LegalDocumentRAG

def main():
    """Gera regra consultando documentos e retorna em JSON"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "rule_description é obrigatória"
        }))
        sys.exit(1)
    
    rule_description = sys.argv[1]
    
    # Parâmetros opcionais
    periodo = sys.argv[2] if len(sys.argv) > 2 else None
    n_context_chunks = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 5
    
    try:
        # Inicializar RAG
        rag = LegalDocumentRAG(
            vector_store_path="./data/chroma_db",
            embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        
        # Preparar query de busca
        query = rule_description
        
        # Buscar contexto relevante
        context_results = rag.query_legal_context(
            query=query,
            n_results=n_context_chunks,
            min_score=0.3
        )
        
        # Gerar regra usando o contexto (placeholder - pode ser melhorado com LLM)
        # Por enquanto, extraímos informações dos chunks relevantes
        rule_type = "VALIDACAO"  # Padrão, pode ser melhorado
        rule_category = None
        rule_condition = None
        
        # Tentar identificar categoria e tipo dos chunks
        for result in context_results:
            if result.metadata and result.metadata.get('category'):
                rule_category = result.metadata['category']
                break
        
        # Construir descrição da regra baseada no contexto
        enhanced_description = rule_description
        if context_results:
            # Adicionar contexto dos chunks mais relevantes
            top_chunk = context_results[0]
            if top_chunk.chunk_text:
                enhanced_description = f"{rule_description}. {top_chunk.chunk_text[:200]}"
        
        # Construir referência legal
        legal_references = []
        for result in context_results[:3]:  # Top 3 chunks
            if result.metadata and result.metadata.get('legal_reference'):
                legal_references.append(result.metadata['legal_reference'])
        
        legal_reference = ", ".join(legal_references) if legal_references else "Documentos legais consultados"
        
        # Calcular confiança baseada nos scores
        confidence = 0.0
        if context_results:
            avg_score = sum(r.score for r in context_results) / len(context_results)
            confidence = min(avg_score * 1.1, 1.0)  # Normalizar para 0-1
        
        # Output
        output = {
            "success": True,
            "data": {
                "rule_type": rule_type,
                "rule_category": rule_category,
                "rule_description": enhanced_description,
                "rule_condition": rule_condition,
                "legal_reference": legal_reference,
                "confidence": round(confidence, 2),
                "context_chunks": [
                    {
                        "chunk_id": r.chunk_id,
                        "chunk_text": r.chunk_text[:300],  # Limitar tamanho
                        "score": round(r.score, 3),
                        "document_id": r.document_id,
                        "section_title": r.section_title
                    }
                    for r in context_results[:5]  # Top 5 chunks
                ]
            }
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

