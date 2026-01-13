"""
Script de teste para o sistema de chunking
"""

import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.document_parser import parse_document
from sped.v2.knowledge.chunking import chunk_document, IntelligentChunker


def test_chunking(file_path: str):
    """Testa o chunking com um arquivo"""
    print(f"\n{'='*60}")
    print(f"📄 Testando chunking: {file_path}")
    print(f"{'='*60}\n")
    
    try:
        # Parsear documento
        print("1️⃣  Parseando documento...")
        parsed = parse_document(file_path)
        print(f"   ✅ Documento parseado: {len(parsed.sections)} seções, {len(parsed.full_text)} caracteres")
        
        # Chunking
        print("\n2️⃣  Aplicando chunking inteligente...")
        chunks = chunk_document(
            parsed,
            chunk_size=1000,
            chunk_overlap=200,
            preserve_sections=True
        )
        
        print(f"\n✅ Chunking concluído!")
        print(f"\n📊 Estatísticas:")
        print(f"   Total de chunks: {len(chunks)}")
        if chunks:
            avg_size = sum(len(c.chunk_text) for c in chunks) / len(chunks)
            min_size = min(len(c.chunk_text) for c in chunks)
            max_size = max(len(c.chunk_text) for c in chunks)
            print(f"   Tamanho médio: {avg_size:.0f} caracteres")
            print(f"   Tamanho mínimo: {min_size} caracteres")
            print(f"   Tamanho máximo: {max_size} caracteres")
            
            # Estatísticas de prioridade
            priority_counts = {}
            for chunk in chunks:
                priority_counts[chunk.priority] = priority_counts.get(chunk.priority, 0) + 1
            print(f"\n   Prioridades:")
            for priority, count in sorted(priority_counts.items()):
                print(f"      Nível {priority}: {count} chunks")
            
            # Chunks com referências
            chunks_with_refs = sum(1 for c in chunks if c.references)
            print(f"   Chunks com referências: {chunks_with_refs}")
            
            # Chunks por seção
            chunks_by_section = {}
            for chunk in chunks:
                section = chunk.section_title or "Sem seção"
                chunks_by_section[section] = chunks_by_section.get(section, 0) + 1
            print(f"\n   Chunks por seção (top 5):")
            for section, count in sorted(chunks_by_section.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"      {section[:50]}: {count} chunks")
        
        print(f"\n📑 Exemplo de chunks (primeiros 3):")
        for i, chunk in enumerate(chunks[:3], 1):
            print(f"\n   {'─'*50}")
            print(f"   Chunk {chunk.chunk_index} (Prioridade: {chunk.priority}):")
            print(f"   Seção: {chunk.section_title or 'N/A'}")
            print(f"   Artigo: {chunk.article_number or 'N/A'}")
            print(f"   Página: {chunk.page_number or 'N/A'}")
            print(f"   Tamanho: {len(chunk.chunk_text)} caracteres")
            print(f"   Referências: {', '.join(chunk.references) if chunk.references else 'Nenhuma'}")
            print(f"   Preview:")
            preview = chunk.chunk_text[:300].replace('\n', ' ')
            print(f"      {preview}...")
        
        return chunks
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python test_chunking.py <caminho_do_arquivo>")
        print("\nExemplo:")
        print("  python test_chunking.py \"C:/Users/bruno/Desktop/SPED 2.0/DOCS/Guia Prático EFD - Versão 3.2.1.pdf\"")
        sys.exit(1)
    
    file_path = sys.argv[1]
    test_chunking(file_path)

