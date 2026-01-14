"""
Script de teste para o sistema RAG
"""

import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.document_parser import parse_document
from sped.v2.knowledge.chunking import chunk_document
from sped.v2.knowledge.legal_rag import LegalDocumentRAG


def test_rag(file_path: str):
    """Testa o sistema RAG com um arquivo"""
    print(f"\n{'='*60}")
    print(f"📄 Testando sistema RAG: {file_path}")
    print(f"{'='*60}\n")
    
    try:
        # Parsear e chunking
        print("1️⃣  Parseando documento...")
        parsed = parse_document(file_path)
        print(f"   ✅ Documento parseado: {len(parsed.sections)} seções")
        
        print("\n2️⃣  Aplicando chunking...")
        chunks = chunk_document(parsed, chunk_size=1000, chunk_overlap=200)
        print(f"   ✅ {len(chunks)} chunks criados")
        
        # Inicializar RAG
        print("\n3️⃣  Inicializando sistema RAG...")
        rag = LegalDocumentRAG(
            vector_store_path="./data/chroma_db_test",
            embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        print("   ✅ Sistema RAG inicializado")
        
        # Indexar
        print("\n4️⃣  Indexando chunks no vector store...")
        document_id = f"doc_{parsed.metadata.hash_arquivo[:8]}"
        indexed_count = rag.index_documents(
            chunks=chunks,
            document_id=document_id,
            document_metadata={
                "documento_tipo": parsed.metadata.documento_tipo,
                "documento_nome": parsed.metadata.documento_nome,
                "versao": parsed.metadata.versao or "",
                "vigencia_inicio": str(parsed.metadata.vigencia_inicio) if parsed.metadata.vigencia_inicio else ""
            }
        )
        print(f"   ✅ {indexed_count} chunks indexados")
        
        # Testar buscas
        print("\n5️⃣  Testando buscas semânticas...")
        
        test_queries = [
            "validação de totalização C170 para C190",
            "regras de ICMS ST",
            "obrigatoriedade de registros C100",
            "tolerâncias de valores",
        ]
        
        for query in test_queries:
            print(f"\n   🔍 Query: '{query}'")
            results = rag.query_legal_context(query, n_results=3, min_score=0.3)
            
            if results:
                print(f"      ✅ {len(results)} resultados encontrados:")
                for i, result in enumerate(results[:2], 1):
                    print(f"         {i}. Score: {result.score:.3f} | {result.section_title or 'N/A'}")
                    print(f"            {result.chunk_text[:150]}...")
            else:
                print(f"      ⚠️  Nenhum resultado encontrado")
        
        # Testar geração de regra com contexto
        print("\n6️⃣  Testando geração de regra com contexto...")
        rule_result = rag.generate_rule_with_context(
            rule_description="Validar totalização de itens C170 para C190",
            periodo="01/2025",
            n_context_chunks=3
        )
        
        print(f"   ✅ Regra gerada:")
        print(f"      Descrição: {rule_result['rule_description']}")
        print(f"      Período: {rule_result['periodo']}")
        print(f"      Chunks de contexto: {rule_result['context_chunks']}")
        print(f"      Confiança: {rule_result['confidence']:.3f}")
        print(f"      Referências: {len(rule_result['references'])}")
        
        # Estatísticas
        print(f"\n📊 Estatísticas do sistema RAG:")
        stats = rag.get_collection_stats()
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        return rag
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python test_rag.py <caminho_do_arquivo>")
        print("\nExemplo:")
        print("  python test_rag.py \"C:/Users/bruno/Desktop/SPED 2.0/DOCS/Guia Prático EFD - Versão 3.2.1.pdf\"")
        sys.exit(1)
    
    file_path = sys.argv[1]
    test_rag(file_path)


