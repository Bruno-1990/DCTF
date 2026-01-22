"""
Script para analisar divergências geradas pelo sistema
"""
import json
import sys
from pathlib import Path
from collections import Counter

def analisar_divergencias(resultado_path: str):
    """Analisa as divergências de um resultado.json"""
    
    with open(resultado_path, 'r', encoding='utf-8') as f:
        resultado = json.load(f)
    
    divergencias = resultado.get('divergencias', [])
    
    print(f"\n{'='*80}")
    print(f"ANÁLISE DE DIVERGÊNCIAS - {len(divergencias)} total")
    print(f"{'='*80}\n")
    
    # Por classificação
    print("1. POR CLASSIFICAÇÃO:")
    class_count = Counter()
    for div in divergencias:
        class_count[div.get('contexto', {}).get('classificacao', 'SEM_CLASSIFICACAO')] += 1
    
    for classificacao, count in class_count.most_common():
        pct = (count / len(divergencias) * 100) if divergencias else 0
        print(f"   {classificacao}: {count} ({pct:.1f}%)")
    
    # Por tipo
    print("\n2. POR TIPO DE DIVERGÊNCIA:")
    tipo_count = Counter()
    for div in divergencias:
        tipo_count[div.get('tipo_divergencia', 'DESCONHECIDO')] += 1
    
    for tipo, count in tipo_count.most_common():
        pct = (count / len(divergencias) * 100) if divergencias else 0
        print(f"   {tipo}: {count} ({pct:.1f}%)")
    
    # Por CFOP (se disponível)
    print("\n3. POR CFOP:")
    cfop_count = Counter()
    for div in divergencias:
        cfop = div.get('contexto_fiscal', {}).get('cfop')
        if cfop:
            cfop_count[cfop] += 1
    
    for cfop, count in sorted(cfop_count.items(), key=lambda x: x[1], reverse=True)[:10]:
        pct = (count / len(divergencias) * 100) if divergencias else 0
        print(f"   {cfop}: {count} ({pct:.1f}%)")
    
    # Por CST (se disponível)
    print("\n4. POR CST:")
    cst_count = Counter()
    for div in divergencias:
        cst = div.get('contexto_fiscal', {}).get('cst') or div.get('contexto_fiscal', {}).get('csosn')
        if cst:
            cst_count[cst] += 1
    
    for cst, count in sorted(cst_count.items(), key=lambda x: x[1], reverse=True)[:10]:
        pct = (count / len(divergencias) * 100) if divergencias else 0
        print(f"   {cst}: {count} ({pct:.1f}%)")
    
    # Exemplos de ERROS
    print("\n5. EXEMPLOS DE ERROS:")
    erros = [d for d in divergencias if d.get('contexto', {}).get('classificacao') == 'ERRO']
    for i, div in enumerate(erros[:5], 1):
        print(f"\n   Erro #{i}:")
        print(f"   - Tipo: {div.get('tipo_divergencia')}")
        print(f"   - Descrição: {div.get('descricao')}")
        print(f"   - XML: {div.get('valor_xml')}, EFD: {div.get('valor_efd')}")
        print(f"   - CFOP: {div.get('contexto_fiscal', {}).get('cfop')}")
        print(f"   - CST: {div.get('contexto_fiscal', {}).get('cst') or div.get('contexto_fiscal', {}).get('csosn')}")
        print(f"   - Score: {div.get('contexto', {}).get('score_confianca')}")
        print(f"   - Explicação: {div.get('contexto', {}).get('explicacao')}")
    
    # Exemplos de REVISAR
    print("\n6. EXEMPLOS DE REVISAR:")
    revisar = [d for d in divergencias if d.get('contexto', {}).get('classificacao') == 'REVISAR']
    for i, div in enumerate(revisar[:5], 1):
        print(f"\n   Revisar #{i}:")
        print(f"   - Tipo: {div.get('tipo_divergencia')}")
        print(f"   - Descrição: {div.get('descricao')}")
        print(f"   - CFOP: {div.get('contexto_fiscal', {}).get('cfop')}")
        print(f"   - Score: {div.get('contexto', {}).get('score_confianca')}")
        print(f"   - Explicação: {div.get('contexto', {}).get('explicacao')}")
    
    print(f"\n{'='*80}\n")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python debug_divergencias.py <caminho_para_resultado.json>")
        sys.exit(1)
    
    analisar_divergencias(sys.argv[1])

