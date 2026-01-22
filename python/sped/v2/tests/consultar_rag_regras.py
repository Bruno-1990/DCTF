#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Consulta RAG para validar regras fiscais críticas
Garante que não implementamos regras erradas no Golden Dataset
"""

import sys
from pathlib import Path

# Adicionar caminho ao sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.hybrid_query import HybridQueryService

def consultar_regras_criticas():
    """Consulta RAG sobre regras fiscais críticas"""
    
    print("="*80)
    print("CONSULTANDO RAG SOBRE REGRAS FISCAIS CRÍTICAS")
    print("="*80)
    
    try:
        # Inicializar serviço RAG
        print("\n[1/7] Inicializando RAG...")
        rag_service = HybridQueryService()
        print("✅ RAG inicializado")
        
        queries = [
            {
                'titulo': 'CST 20 - Redução de Base',
                'query': 'Quando CST é 20 (redução de base de cálculo), como deve ser a comparação entre XML e SPED? É erro se a base de cálculo do XML for diferente do SPED quando há VL_RED_BC no C190?'
            },
            {
                'titulo': 'CST 60 - Substituição Tributária',
                'query': 'Quando CST é 60 (substituição tributária), é esperado que VL_BC_ICMS e VL_ICMS sejam zero? Deve-se comparar apenas VL_BC_ICMS_ST e VL_ICMS_ST neste caso?'
            },
            {
                'titulo': 'Ajustes E111 - Benefícios Fiscais',
                'query': 'Quando existe ajuste no E111 (como COMPETE ES, INVEST ES, ou crédito presumido), isso explica divergências entre XML e SPED? Deve-se classificar como LEGÍTIMO ou REVISAR?'
            },
            {
                'titulo': 'Notas Complementares (finNFe=2)',
                'query': 'Como deve ser tratada uma nota fiscal complementar (finNFe=2)? Deve ser somada à nota original para comparação com o SPED? Divergências devem ser classificadas como ERRO ou REVISAR?'
            },
            {
                'titulo': 'CFOPs de Devolução',
                'query': 'Quais são os CFOPs de devolução mais comuns e como devem ser tratados? É esperado que valores sejam diferentes entre XML e SPED quando há ajustes de crédito/débito?'
            },
            {
                'titulo': 'Tolerâncias de Arredondamento',
                'query': 'Quais são as tolerâncias aceitáveis para diferenças de arredondamento em ICMS? Existe diferença de tolerância entre segmentos (comércio vs indústria)?'
            },
            {
                'titulo': 'Validação C190 - VL_OPR',
                'query': 'Como deve ser calculado VL_OPR no C190? Deve ser a soma dos VL_ITEM do C170 ou o VL_DOC do C100? Quando uma divergência nesta totalização indica erro real?'
            },
        ]
        
        resultados = []
        
        for i, q in enumerate(queries, start=2):
            print(f"\n[{i}/7] Consultando: {q['titulo']}")
            print(f"Query: {q['query'][:100]}...")
            
            try:
                # Consultar RAG
                resposta = rag_service.query(
                    query=q['query'],
                    top_k=3,
                    contexto_adicional={}
                )
                
                print(f"✅ Resposta obtida ({len(resposta.get('answer', ''))} caracteres)")
                
                # Extrair trechos relevantes
                trechos = resposta.get('referencias', [])
                print(f"   Referências: {len(trechos)} documentos")
                
                resultados.append({
                    'titulo': q['titulo'],
                    'query': q['query'],
                    'resposta': resposta.get('answer', ''),
                    'referencias': trechos,
                    'confianca': resposta.get('confianca', 0)
                })
                
            except Exception as e:
                print(f"⚠️ Erro ao consultar RAG: {e}")
                resultados.append({
                    'titulo': q['titulo'],
                    'query': q['query'],
                    'resposta': f"ERRO: {str(e)}",
                    'referencias': [],
                    'confianca': 0
                })
        
        # Salvar resultados
        print("\n" + "="*80)
        print("SALVANDO RESULTADOS")
        print("="*80)
        
        output_path = Path(__file__).parent / 'rag_regras_validadas.json'
        
        import json
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(resultados, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Resultados salvos em: {output_path}")
        
        # Imprimir resumo
        print("\n" + "="*80)
        print("RESUMO DAS CONSULTAS")
        print("="*80)
        
        for r in resultados:
            print(f"\n📌 {r['titulo']}")
            print(f"   Confiança: {r['confianca']}")
            print(f"   Resposta: {r['resposta'][:200]}...")
            print(f"   Referências: {len(r['referencias'])}")
        
        print("\n" + "="*80)
        print("✅ CONSULTA AO RAG CONCLUÍDA!")
        print("="*80)
        
        return resultados
        
    except Exception as e:
        print(f"\n❌ ERRO GERAL: {e}")
        import traceback
        traceback.print_exc()
        return []


if __name__ == '__main__':
    resultados = consultar_regras_criticas()
    sys.exit(0 if resultados else 1)

