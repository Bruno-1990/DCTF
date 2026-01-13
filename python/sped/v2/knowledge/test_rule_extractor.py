"""
Script de teste para o extrator de regras estruturadas
"""

import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.document_parser import parse_document
from sped.v2.knowledge.chunking import chunk_document
from sped.v2.knowledge.rule_extractor import extract_rules_from_document


def test_rule_extractor(file_path: str):
    """Testa o extrator de regras com um arquivo"""
    print(f"\n{'='*60}")
    print(f"📄 Testando extrator de regras: {file_path}")
    print(f"{'='*60}\n")
    
    try:
        # Parsear documento
        print("1️⃣  Parseando documento...")
        parsed = parse_document(file_path)
        print(f"   ✅ Documento parseado: {len(parsed.sections)} seções")
        
        # Chunking
        print("\n2️⃣  Aplicando chunking...")
        chunks = chunk_document(parsed, chunk_size=1000, chunk_overlap=200)
        print(f"   ✅ {len(chunks)} chunks criados")
        
        # Extrair regras
        print("\n3️⃣  Extraindo regras estruturadas...")
        rules = extract_rules_from_document(parsed, chunks)
        print(f"   ✅ {len(rules)} regras extraídas")
        
        if not rules:
            print("\n⚠️  Nenhuma regra encontrada. Verifique se o documento contém padrões de regras.")
            return
        
        # Estatísticas por tipo
        print(f"\n📊 Estatísticas por tipo de regra:")
        by_type = {}
        for rule in rules:
            rule_type = rule.rule_type
            by_type[rule_type] = by_type.get(rule_type, 0) + 1
        
        for rule_type, count in sorted(by_type.items()):
            print(f"   {rule_type}: {count}")
        
        # Estatísticas por categoria SPED
        print(f"\n📊 Estatísticas por categoria SPED:")
        by_category = {}
        for rule in rules:
            category = rule.rule_category or "GERAL"
            by_category[category] = by_category.get(category, 0) + 1
        
        for category, count in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
            print(f"   {category}: {count}")
        
        # Regras com referências legais
        rules_with_refs = sum(1 for r in rules if r.legal_reference)
        rules_with_articles = sum(1 for r in rules if r.article_reference)
        print(f"\n📊 Qualidade das regras:")
        print(f"   Com referência legal: {rules_with_refs}/{len(rules)}")
        print(f"   Com artigo: {rules_with_articles}/{len(rules)}")
        print(f"   Com condição: {sum(1 for r in rules if r.rule_condition)}/{len(rules)}")
        
        # Exibir exemplos
        print(f"\n📑 Exemplos de regras extraídas (primeiras 5):")
        for i, rule in enumerate(rules[:5], 1):
            print(f"\n   {'─'*50}")
            print(f"   Regra {i}:")
            print(f"      Tipo: {rule.rule_type}")
            print(f"      Categoria: {rule.rule_category or 'N/A'}")
            print(f"      Descrição: {rule.rule_description[:200]}...")
            if rule.rule_condition:
                print(f"      Condição: {rule.rule_condition[:100]}...")
            if rule.legal_reference:
                print(f"      Referência: {rule.legal_reference}")
            if rule.article_reference:
                print(f"      Artigo: {rule.article_reference}")
            if rule.section_reference:
                print(f"      Seção: {rule.section_reference}")
        
        # Regras por categoria (detalhado)
        print(f"\n📋 Regras por categoria (detalhado):")
        for category in sorted(set(r.category for r in rules if r.category)):
            category_rules = [r for r in rules if r.category == category]
            print(f"\n   {category} ({len(category_rules)} regras):")
            for rule in category_rules[:3]:
                print(f"      - {rule.rule_type}: {rule.rule_description[:100]}...")
        
        return rules
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python test_rule_extractor.py <caminho_do_arquivo>")
        print("\nExemplo:")
        print("  python test_rule_extractor.py \"C:/Users/bruno/Desktop/SPED 2.0/DOCS/Guia Prático EFD - Versão 3.2.1.pdf\"")
        sys.exit(1)
    
    file_path = sys.argv[1]
    test_rule_extractor(file_path)

