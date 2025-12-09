"""
Retriever para buscar objetos no catálogo unificado
Adaptado para o projeto DCTF_MPC
"""

import json
import sys
import os
from typing import List, Dict, Optional
from pathlib import Path

# Caminho base do projeto
BASE_DIR = Path(__file__).parent
CATALOG_PATH = BASE_DIR / "catalog.json"

class CatalogRetriever:
    """
    Busca objetos no catálogo unificado com priorização inteligente
    VIEWs são priorizadas sobre TABLEs
    """
    
    def __init__(self, catalog_path: str = None):
        """
        Inicializa o retriever carregando o catálogo
        
        Args:
            catalog_path: Caminho para o arquivo catalog.json (opcional, usa padrão se None)
        """
        self.catalog_path = catalog_path or str(CATALOG_PATH)
        self.catalog = self._load_catalog()
    
    def _load_catalog(self) -> Dict:
        """Carrega o catálogo do arquivo JSON"""
        try:
            with open(self.catalog_path, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
                return catalog
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Catálogo não encontrado: {self.catalog_path}\n"
                "Certifique-se de que o arquivo catalog.json está no diretório correto."
            )
        except json.JSONDecodeError as e:
            raise ValueError(f"Erro ao ler catálogo: {e}")
    
    def find_relevant_objects(
        self, 
        query: str,
        domain: Optional[str] = None,
        object_type: Optional[str] = None,
        top_k: int = 15,
        prefer_views: bool = True,
        min_score: float = 0.1
    ) -> List[Dict]:
        """
        Encontra objetos relevantes para uma consulta, priorizando VIEWs
        
        Args:
            query: Pergunta/consulta do usuário
            domain: Domínio para filtrar (rh, fiscal, estoque, etc)
            object_type: Tipo de objeto ("VIEW" ou "TABLE")
            top_k: Quantidade máxima de resultados
            prefer_views: Se True, prioriza VIEWs mesmo com score menor
            min_score: Score mínimo para incluir resultado
        
        Returns:
            Lista ordenada por relevância (VIEWs primeiro)
        """
        query_upper = query.upper()
        query_words = [w.strip() for w in query_upper.split() if len(w.strip()) > 2]
        
        if not query_words:
            return []
        
        # Filtrar por domínio primeiro (otimização)
        objects_to_search = self._filter_by_domain_and_type(domain, object_type)
        
        results = []
        
        for obj_name, obj_data in objects_to_search.items():
            score = 0.0
            
            # 1. Busca no nome (peso alto)
            name_upper = obj_name.upper()
            for word in query_words:
                if word in name_upper:
                    # Match exato no início tem mais peso
                    if name_upper.startswith(word):
                        score += 0.4
                    else:
                        score += 0.3
            
            # 2. Busca na descrição (se existir)
            description = obj_data.get("description", "").upper()
            if description:
                for word in query_words:
                    if word in description:
                        score += 0.2
            
            # 3. Busca em domain_tags
            for tag in obj_data.get("domain_tags", []):
                tag_upper = tag.upper()
                for word in query_words:
                    if word in tag_upper:
                        score += 0.2
            
            # 4. Busca em colunas principais
            colunas = obj_data.get("colunas", [])[:10]
            for col in colunas:
                col_name = col.get("nome", "").upper()
                for word in query_words:
                    if word in col_name:
                        score += 0.1
                
                # Busca em tags das colunas
                for tag in col.get("tags", []):
                    tag_upper = tag.upper()
                    for word in query_words:
                        if word in tag_upper:
                            score += 0.05
            
            if score >= min_score:
                # Multiplicar por importance_score
                final_score = score * obj_data.get("importance_score", 0.5)
                
                # BOOST para VIEWs se prefer_views=True
                if prefer_views and obj_data["type"] == "VIEW":
                    final_score *= 1.5  # Boost de 50% para VIEWs
                
                results.append({
                    "object": obj_name,
                    "type": obj_data["type"],
                    "layer": obj_data.get("layer"),
                    "score": final_score,
                    "metadata": obj_data
                })
        
        # Ordenar: primeiro por score, depois VIEW antes de TABLE
        results.sort(key=lambda x: (
            -x["score"],  # Score decrescente
            0 if x["type"] == "VIEW" else 1  # VIEW primeiro
        ))
        
        return results[:top_k]
    
    def _filter_by_domain_and_type(
        self, 
        domain: Optional[str], 
        object_type: Optional[str]
    ) -> Dict:
        """Filtra objetos por domínio e tipo (otimização)"""
        all_objects = self.catalog.get("objects", {})
        
        if not domain and not object_type:
            return all_objects
        
        filtered = {}
        
        # Filtrar por domínio
        if domain:
            domain_objects = set(
                self.catalog.get("indices_globais", {})
                .get("por_dominio", {})
                .get(domain.lower(), [])
            )
            for obj_name in domain_objects:
                if obj_name in all_objects:
                    filtered[obj_name] = all_objects[obj_name]
        else:
            filtered = all_objects.copy()
        
        # Filtrar por tipo
        if object_type:
            filtered = {
                name: obj 
                for name, obj in filtered.items() 
                if obj.get("type") == object_type
            }
        
        return filtered
    
    def get_object(self, object_name: str) -> Optional[Dict]:
        """Obtém um objeto específico do catálogo"""
        return self.catalog.get("objects", {}).get(object_name)
    
    def search_by_domain(self, domain: str) -> List[str]:
        """Busca objetos por domínio"""
        return self.catalog.get("indices_globais", {}).get("por_dominio", {}).get(domain, [])

