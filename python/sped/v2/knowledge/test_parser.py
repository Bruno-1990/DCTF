"""
Script de teste para o parser de documentos legais
"""

import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.document_parser import parse_document, PDFParser, DOCXParser


def test_parser(file_path: str):
    """Testa o parser com um arquivo"""
    print(f"\n{'='*60}")
    print(f"📄 Testando parser: {file_path}")
    print(f"{'='*60}\n")
    
    try:
        parsed = parse_document(file_path)
        
        print("✅ Documento parseado com sucesso!\n")
        print(f"📋 Metadados:")
        print(f"   Tipo: {parsed.metadata.documento_tipo}")
        print(f"   Nome: {parsed.metadata.documento_nome}")
        print(f"   Versão: {parsed.metadata.versao or 'N/A'}")
        print(f"   Vigência Início: {parsed.metadata.vigencia_inicio or 'N/A'}")
        print(f"   Vigência Fim: {parsed.metadata.vigencia_fim or 'N/A'}")
        print(f"   Autor: {parsed.metadata.autor or 'N/A'}")
        print(f"   Data Publicação: {parsed.metadata.data_publicacao or 'N/A'}")
        print(f"   Hash: {parsed.metadata.hash_arquivo[:32]}...")
        print(f"   Arquivo: {parsed.metadata.arquivo_path}")
        
        print(f"\n📊 Estatísticas:")
        print(f"   Tamanho do texto: {len(parsed.full_text):,} caracteres")
        print(f"   Número de páginas: {len(parsed.pages)}")
        print(f"   Número de seções: {len(parsed.sections)}")
        
        if parsed.sections:
            print(f"\n📑 Estrutura do documento (primeiras 10 seções):")
            for i, section in enumerate(parsed.sections[:10], 1):
                content_preview = section.content[:80].replace('\n', ' ') if section.content else ""
                print(f"   {i}. [{section.level}] {section.title[:60]}")
                if section.article_number:
                    print(f"      Artigo: {section.article_number}")
                if content_preview:
                    print(f"      Conteúdo: {content_preview}...")
        
        print(f"\n📄 Preview do texto (primeiros 500 caracteres):")
        print(f"   {parsed.full_text[:500]}...")
        
        return parsed
        
    except Exception as e:
        print(f"❌ Erro ao parsear documento: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python test_parser.py <caminho_do_arquivo>")
        print("\nExemplo:")
        print("  python test_parser.py \"C:/Users/bruno/Desktop/SPED 2.0/DOCS/Guia Prático EFD - Versão 3.2.1.pdf\"")
        sys.exit(1)
    
    file_path = sys.argv[1]
    test_parser(file_path)

