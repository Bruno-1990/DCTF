"""
Script para gerar regra consultando documentos legais via RAG + Banco
Usado pelo backend Node.js para gerar regras estruturadas
Sistema híbrido: prioriza regras estruturadas do banco, complementa com contexto RAG
"""

import sys
import json
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.hybrid_query import HybridQueryService

def main():
    """Gera regra consultando documentos via sistema híbrido (RAG + Banco) e retorna em JSON"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "rule_description é obrigatória"
        }))
        sys.exit(1)
    
    rule_description = sys.argv[1]
    
    # Parâmetros opcionais
    periodo = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    n_context_chunks = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 5
    categoria = sys.argv[4] if len(sys.argv) > 4 else None
    tipo = sys.argv[5] if len(sys.argv) > 5 else None
    
    try:
        # Inicializar serviço de consulta híbrida
        hybrid_service = HybridQueryService(
            vector_store_path="./data/chroma_db",
            embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        
        # Executar consulta híbrida
        hybrid_result = hybrid_service.query_hybrid(
            query=rule_description,
            categoria=categoria,
            tipo=tipo,
            periodo=periodo,
            n_rag_results=n_context_chunks,
            n_structured_rules=10,
            min_rag_score=0.3
        )
        
        # Validar período se fornecido
        if periodo and not hybrid_result.is_valid_period:
            print(json.dumps({
                "success": False,
                "error": hybrid_result.period_validation_message or "Período fora de vigência",
                "data": None
            }))
            sys.exit(1)
        
        # Priorizar regras estruturadas, complementar com RAG
        rule_type = "VALIDACAO"  # Padrão
        rule_category = None
        rule_condition = None
        
        # Extrair informações das regras estruturadas (prioridade)
        if hybrid_result.structured_rules:
            first_rule = hybrid_result.structured_rules[0]
            rule_type = first_rule.rule_type
            rule_category = first_rule.rule_category
            rule_condition = first_rule.rule_condition
            
            # Usar descrição da regra estruturada se disponível
            if first_rule.rule_description:
                enhanced_description = first_rule.rule_description
            else:
                enhanced_description = rule_description
        else:
            # Se não há regras estruturadas, usar RAG
            enhanced_description = rule_description
            if hybrid_result.rag_results:
                top_chunk = hybrid_result.rag_results[0]
                if top_chunk.chunk_text:
                    enhanced_description = f"{rule_description}. {top_chunk.chunk_text[:200]}"
                
                # Tentar identificar categoria dos chunks RAG
                for result in hybrid_result.rag_results:
                    if result.metadata and result.metadata.get('category'):
                        rule_category = result.metadata['category']
                        break
        
        # Construir referências legais estruturadas
        legal_references = []
        if hybrid_result.legal_references:
            for ref in hybrid_result.legal_references:
                legal_references.append({
                    "documento": ref.get("documento", "N/A"),
                    "versao": ref.get("versao"),
                    "artigo": ref.get("artigo"),
                    "secao": ref.get("secao"),
                    "vigencia_inicio": ref.get("vigencia_inicio"),
                    "vigencia_fim": ref.get("vigencia_fim")
                })
        
        # Construir string de referência legal para compatibilidade
        legal_reference_str = ", ".join([
            f"{ref['documento']}" + 
            (f" Art. {ref['artigo']}" if ref.get('artigo') else "") +
            (f" § {ref['secao']}" if ref.get('secao') else "")
            for ref in legal_references[:3]
        ]) if legal_references else "Documentos legais consultados"
        
        # Output com dados híbridos
        output = {
            "success": True,
            "data": {
                "rule_type": rule_type,
                "rule_category": rule_category,
                "rule_description": enhanced_description,
                "rule_condition": rule_condition,
                "legal_reference": legal_reference_str,
                "legal_references": legal_references,  # Estrutura completa
                "confidence": round(hybrid_result.confidence_score, 2),
                "confidence_factors": {
                    k: round(v, 3) for k, v in hybrid_result.confidence_factors.items()
                },
                "is_valid_period": hybrid_result.is_valid_period,
                "period_validation_message": hybrid_result.period_validation_message,
                "structured_rules_count": len(hybrid_result.structured_rules),
                "rag_results_count": len(hybrid_result.rag_results),
                "combined_context": hybrid_result.combined_context[:1000],  # Limitar tamanho
                "structured_rules": [
                    {
                        "id": r.id,
                        "rule_type": r.rule_type,
                        "rule_category": r.rule_category,
                        "rule_description": r.rule_description,
                        "legal_reference": r.legal_reference,
                        "article_reference": r.article_reference,
                        "section_reference": r.section_reference
                    }
                    for r in hybrid_result.structured_rules[:5]
                ],
                "rag_context_chunks": [
                    {
                        "chunk_id": r.chunk_id,
                        "chunk_text": r.chunk_text[:300],
                        "score": round(r.score, 3),
                        "document_id": r.document_id,
                        "section_title": r.section_title,
                        "article_number": r.article_number
                    }
                    for r in hybrid_result.rag_results[:5]
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





