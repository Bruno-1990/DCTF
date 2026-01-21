"""
Sistema de Cache e Otimização do RAG
Cache de embeddings, consultas e indexação incremental
"""

import hashlib
import json
import time
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Entrada de cache"""
    key: str
    value: Any
    created_at: datetime
    expires_at: Optional[datetime] = None
    hits: int = 0
    last_accessed: datetime = field(default_factory=datetime.now)
    
    def is_expired(self) -> bool:
        """Verifica se entrada expirou"""
        if not self.expires_at:
            return False
        return datetime.now() > self.expires_at
    
    def hit(self):
        """Registra acesso à entrada"""
        self.hits += 1
        self.last_accessed = datetime.now()


class CacheManager:
    """Gerenciador de cache para embeddings e consultas RAG"""
    
    def __init__(
        self,
        embedding_ttl: Optional[int] = None,  # TTL em segundos (None = sem expiração)
        query_ttl: int = 3600,  # TTL padrão para consultas: 1 hora
        max_size: int = 10000  # Tamanho máximo do cache
    ):
        """
        Args:
            embedding_ttl: TTL para embeddings (None = sem expiração)
            query_ttl: TTL para consultas em segundos
            max_size: Tamanho máximo do cache
        """
        self.embedding_cache: Dict[str, CacheEntry] = {}
        self.query_cache: Dict[str, CacheEntry] = {}
        self.embedding_ttl = embedding_ttl
        self.query_ttl = query_ttl
        self.max_size = max_size
        
        # Métricas
        self.metrics = {
            'embedding_hits': 0,
            'embedding_misses': 0,
            'query_hits': 0,
            'query_misses': 0,
            'cache_evictions': 0,
        }
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Gera chave de cache baseada em argumentos"""
        key_data = {
            'prefix': prefix,
            'args': args,
            'kwargs': sorted(kwargs.items()),
        }
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()
    
    def get_embedding(self, chunk_id: str, text: str) -> Optional[List[float]]:
        """
        Busca embedding no cache
        
        Args:
            chunk_id: ID do chunk
            text: Texto do chunk
        
        Returns:
            Embedding ou None se não encontrado
        """
        key = self._generate_key('embedding', chunk_id, text)
        
        if key in self.embedding_cache:
            entry = self.embedding_cache[key]
            
            if entry.is_expired():
                del self.embedding_cache[key]
                self.metrics['embedding_misses'] += 1
                return None
            
            entry.hit()
            self.metrics['embedding_hits'] += 1
            return entry.value
        
        self.metrics['embedding_misses'] += 1
        return None
    
    def set_embedding(self, chunk_id: str, text: str, embedding: List[float]) -> bool:
        """
        Armazena embedding no cache
        
        Args:
            chunk_id: ID do chunk
            text: Texto do chunk
            embedding: Embedding a armazenar
        
        Returns:
            True se armazenado com sucesso
        """
        key = self._generate_key('embedding', chunk_id, text)
        
        # Verificar tamanho do cache
        if len(self.embedding_cache) >= self.max_size:
            self._evict_oldest('embedding')
        
        expires_at = None
        if self.embedding_ttl:
            expires_at = datetime.now() + timedelta(seconds=self.embedding_ttl)
        
        entry = CacheEntry(
            key=key,
            value=embedding,
            created_at=datetime.now(),
            expires_at=expires_at,
        )
        
        self.embedding_cache[key] = entry
        return True
    
    def get_query(self, query: str, filters: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Busca resultado de consulta no cache
        
        Args:
            query: Texto da consulta
            filters: Filtros aplicados
        
        Returns:
            Resultados ou None se não encontrado
        """
        key = self._generate_key('query', query, filters or {})
        
        if key in self.query_cache:
            entry = self.query_cache[key]
            
            if entry.is_expired():
                del self.query_cache[key]
                self.metrics['query_misses'] += 1
                return None
            
            entry.hit()
            self.metrics['query_hits'] += 1
            return entry.value
        
        self.metrics['query_misses'] += 1
        return None
    
    def set_query(
        self,
        query: str,
        filters: Optional[Dict[str, Any]],
        results: List[Dict[str, Any]],
        ttl: Optional[int] = None
    ) -> bool:
        """
        Armazena resultado de consulta no cache
        
        Args:
            query: Texto da consulta
            filters: Filtros aplicados
            results: Resultados a armazenar
            ttl: TTL personalizado (opcional)
        
        Returns:
            True se armazenado com sucesso
        """
        key = self._generate_key('query', query, filters or {})
        
        # Verificar tamanho do cache
        if len(self.query_cache) >= self.max_size:
            self._evict_oldest('query')
        
        ttl_to_use = ttl or self.query_ttl
        expires_at = datetime.now() + timedelta(seconds=ttl_to_use)
        
        entry = CacheEntry(
            key=key,
            value=results,
            created_at=datetime.now(),
            expires_at=expires_at,
        )
        
        self.query_cache[key] = entry
        return True
    
    def _evict_oldest(self, cache_type: str):
        """Remove entrada mais antiga do cache"""
        cache = self.embedding_cache if cache_type == 'embedding' else self.query_cache
        
        if not cache:
            return
        
        # Encontrar entrada mais antiga (menos acessada)
        oldest_key = min(cache.keys(), key=lambda k: cache[k].last_accessed)
        del cache[oldest_key]
        self.metrics['cache_evictions'] += 1
    
    def clear_expired(self):
        """Remove entradas expiradas do cache"""
        # Limpar embeddings expirados
        expired_keys = [
            k for k, v in self.embedding_cache.items() if v.is_expired()
        ]
        for key in expired_keys:
            del self.embedding_cache[key]
        
        # Limpar consultas expiradas
        expired_keys = [
            k for k, v in self.query_cache.items() if v.is_expired()
        ]
        for key in expired_keys:
            del self.query_cache[key]
        
        logger.info(f"Removidas {len(expired_keys)} entradas expiradas do cache")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Retorna métricas do cache"""
        total_embedding = self.metrics['embedding_hits'] + self.metrics['embedding_misses']
        total_query = self.metrics['query_hits'] + self.metrics['query_misses']
        
        embedding_hit_rate = (
            self.metrics['embedding_hits'] / total_embedding
            if total_embedding > 0
            else 0
        )
        
        query_hit_rate = (
            self.metrics['query_hits'] / total_query
            if total_query > 0
            else 0
        )
        
        return {
            **self.metrics,
            'embedding_hit_rate': embedding_hit_rate,
            'query_hit_rate': query_hit_rate,
            'embedding_cache_size': len(self.embedding_cache),
            'query_cache_size': len(self.query_cache),
        }
    
    def clear_all(self):
        """Limpa todo o cache"""
        self.embedding_cache.clear()
        self.query_cache.clear()
        logger.info("Cache limpo completamente")
    
    def incremental_index_update(
        self,
        document_id: str,
        new_chunks: List[Dict[str, Any]]
    ) -> int:
        """
        Atualiza indexação incrementalmente (apenas chunks novos)
        
        Args:
            document_id: ID do documento
            new_chunks: Lista de novos chunks a indexar
        
        Returns:
            Número de chunks indexados
        """
        # TODO: Implementar indexação incremental
        # 1. Verificar quais chunks já estão indexados
        # 2. Indexar apenas chunks novos
        # 3. Atualizar metadados do documento
        
        return len(new_chunks)
    
    def batch_process_embeddings(
        self,
        chunks: List[Tuple[str, str]],  # Lista de (chunk_id, text)
        batch_size: int = 32
    ) -> Dict[str, List[float]]:
        """
        Processa embeddings em lote
        
        Args:
            chunks: Lista de (chunk_id, text)
            batch_size: Tamanho do lote
        
        Returns:
            Dicionário de chunk_id -> embedding
        """
        embeddings = {}
        
        # Processar em lotes
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            
            # Verificar cache primeiro
            batch_to_process = []
            for chunk_id, text in batch:
                cached = self.get_embedding(chunk_id, text)
                if cached:
                    embeddings[chunk_id] = cached
                else:
                    batch_to_process.append((chunk_id, text))
            
            # Processar apenas chunks não em cache
            if batch_to_process:
                # TODO: Chamar modelo de embedding em lote
                # Por enquanto, simulado
                for chunk_id, text in batch_to_process:
                    # Simular embedding (em produção, chamar modelo)
                    embedding = [0.0] * 384  # Dimensão exemplo
                    embeddings[chunk_id] = embedding
                    self.set_embedding(chunk_id, text, embedding)
        
        return embeddings

