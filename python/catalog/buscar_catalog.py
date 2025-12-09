"""
Script para buscar no catálogo via linha de comando
Usado pelo backend Node.js
"""

import sys
import json
import os
from pathlib import Path

# Adicionar o diretório atual ao path para importar o retriever
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from catalog_retriever import CatalogRetriever

def main():
    """Busca no catálogo e retorna JSON"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Query é obrigatória"}))
        sys.exit(1)
    
    query = sys.argv[1]
    domain = None
    object_type = None
    top_k = 10
    
    # Parse argumentos
    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--domain" and i + 1 < len(sys.argv):
            domain = sys.argv[i + 1]
            i += 2
        elif arg == "--type" and i + 1 < len(sys.argv):
            object_type = sys.argv[i + 1]
            i += 2
        elif arg == "--top" and i + 1 < len(sys.argv):
            top_k = int(sys.argv[i + 1])
            i += 2
        else:
            i += 1
    
    try:
        # Usar o caminho padrão do catálogo (mesmo diretório)
        catalog_path = BASE_DIR / "catalog.json"
        retriever = CatalogRetriever(str(catalog_path))
        resultados = retriever.find_relevant_objects(
            query=query,
            domain=domain,
            object_type=object_type,
            top_k=top_k
        )
        
        # Serializar resultados (remover objetos complexos se necessário)
        output = []
        for r in resultados:
            output.append({
                "object": r["object"],
                "type": r["type"],
                "layer": r.get("layer"),
                "score": r["score"],
                "metadata": {
                    "name": r["metadata"]["name"],
                    "type": r["metadata"]["type"],
                    "domain_tags": r["metadata"].get("domain_tags", []),
                    "total_colunas": r["metadata"].get("total_colunas", 0),
                    "colunas": r["metadata"].get("colunas", [])[:20]  # Limitar colunas
                }
            })
        
        print(json.dumps({"objetos": output}, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

