"""
Script para verificar status do RAG
"""
import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.legal_rag import LegalDocumentRAG

def main():
    try:
        rag = LegalDocumentRAG()
        stats = rag.get_collection_stats()
        print(f"✅ RAG Status:")
        print(f"   Total chunks: {stats['total_chunks']}")
        print(f"   Collection: {stats['collection_name']}")
        print(f"   Embedding model: {stats['embedding_model']}")
        print(f"   Cache size: {stats['cache_size']}")
        
        if stats['total_chunks'] == 0:
            print("\n⚠️  Nenhum documento indexado! Execute ingest_docs.py primeiro.")
            return False
        else:
            print(f"\n✅ Base de conhecimento pronta com {stats['total_chunks']} chunks")
            return True
    except Exception as e:
        print(f"❌ Erro ao verificar RAG: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    main()

