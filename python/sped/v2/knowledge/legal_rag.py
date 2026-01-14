"""
Sistema RAG (Retrieval-Augmented Generation) para Documentos Legais
Vector store, embeddings e busca semântica
"""

import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import pickle

try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("⚠️  chromadb não disponível. Instale com: pip install chromadb")

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("⚠️  sentence-transformers não disponível. Instale com: pip install sentence-transformers")

from .chunking import Chunk
from .document_parser import ParsedDocument


@dataclass
class QueryResult:
    """Resultado de uma busca semântica"""
    chunk_id: str
    chunk_text: str
    score: float  # Similarity score (0-1)
    metadata: Dict[str, Any]
    document_id: Optional[str] = None
    section_title: Optional[str] = None
    article_number: Optional[str] = None


class EmbeddingModel:
    """Wrapper para modelos de embedding (local ou API)"""
    
    def __init__(self, model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        """
        Args:
            model_name: Nome do modelo local ou 'openai'/'claude' para APIs
        """
        self.model_name = model_name
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Carrega o modelo de embedding"""
        if self.model_name in ['openai', 'claude']:
            # API-based embeddings (será implementado se necessário)
            self.model = None
            print(f"⚠️  Embeddings via API ({self.model_name}) não implementados ainda. Use modelo local.")
        elif SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                print(f"📥 Carregando modelo de embedding: {self.model_name}")
                self.model = SentenceTransformer(self.model_name)
                print(f"✅ Modelo carregado com sucesso")
            except Exception as e:
                print(f"❌ Erro ao carregar modelo: {e}")
                raise
        else:
            raise ImportError("sentence-transformers não está instalado")
    
    def encode(self, texts: List[str]) -> List[List[float]]:
        """Gera embeddings para uma lista de textos"""
        if not self.model:
            raise ValueError("Modelo não carregado")
        
        if isinstance(texts, str):
            texts = [texts]
        
        embeddings = self.model.encode(texts, show_progress_bar=len(texts) > 10)
        return embeddings.tolist() if hasattr(embeddings, 'tolist') else embeddings
    
    def encode_single(self, text: str) -> List[float]:
        """Gera embedding para um único texto"""
        return self.encode([text])[0]


class LegalDocumentRAG:
    """Sistema RAG para consulta de documentos legais"""
    
    def __init__(
        self,
        vector_store_path: str = "./data/chroma_db",
        embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        collection_name: str = "legal_documents"
    ):
        """
        Args:
            vector_store_path: Caminho para armazenar o ChromaDB
            embedding_model: Nome do modelo de embedding
            collection_name: Nome da coleção no ChromaDB
        """
        if not CHROMADB_AVAILABLE:
            raise ImportError("chromadb não está instalado. Instale com: pip install chromadb")
        
        self.vector_store_path = Path(vector_store_path)
        self.vector_store_path.mkdir(parents=True, exist_ok=True)
        
        self.embedding_model = EmbeddingModel(embedding_model)
        self.collection_name = collection_name
        
        # Inicializar ChromaDB
        self.client = chromadb.PersistentClient(
            path=str(self.vector_store_path),
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Obter ou criar coleção
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Documentos legais SPED v2.0"}
        )
        
        # Cache de embeddings (para evitar regenerar)
        self.embedding_cache: Dict[str, List[float]] = {}
        self.cache_file = self.vector_store_path / "embedding_cache.pkl"
        self._load_cache()
    
    def _load_cache(self):
        """Carrega cache de embeddings do disco"""
        if self.cache_file.exists():
            try:
                with open(self.cache_file, 'rb') as f:
                    self.embedding_cache = pickle.load(f)
                print(f"✅ Cache de embeddings carregado: {len(self.embedding_cache)} entradas")
            except Exception as e:
                print(f"⚠️  Erro ao carregar cache: {e}")
                self.embedding_cache = {}
    
    def _save_cache(self):
        """Salva cache de embeddings no disco"""
        try:
            with open(self.cache_file, 'wb') as f:
                pickle.dump(self.embedding_cache, f)
        except Exception as e:
            print(f"⚠️  Erro ao salvar cache: {e}")
    
    def _get_cache_key(self, text: str) -> str:
        """Gera chave de cache para um texto"""
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def _get_embedding(self, text: str, use_cache: bool = True) -> List[float]:
        """Obtém embedding de um texto (com cache)"""
        if use_cache:
            cache_key = self._get_cache_key(text)
            if cache_key in self.embedding_cache:
                return self.embedding_cache[cache_key]
        
        # Gerar embedding
        embedding = self.embedding_model.encode_single(text)
        
        # Salvar no cache
        if use_cache:
            cache_key = self._get_cache_key(text)
            self.embedding_cache[cache_key] = embedding
            self._save_cache()
        
        return embedding
    
    def index_documents(
        self,
        chunks: List[Chunk],
        document_id: str,
        document_metadata: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Indexa chunks de documentos no vector store
        
        Args:
            chunks: Lista de chunks para indexar
            document_id: ID do documento (UUID)
            document_metadata: Metadados adicionais do documento
            
        Returns:
            Número de chunks indexados
        """
        if not chunks:
            return 0
        
        print(f"📚 Indexando {len(chunks)} chunks do documento {document_id}...")
        
        # Preparar dados para indexação
        ids = []
        texts = []
        embeddings = []
        metadatas = []
        
        for chunk in chunks:
            chunk_id = f"{document_id}_{chunk.chunk_index}"
            ids.append(chunk_id)
            texts.append(chunk.chunk_text)
            
            # Gerar embedding
            embedding = self._get_embedding(chunk.chunk_text)
            embeddings.append(embedding)
            
            # Preparar metadados
            metadata = {
                "document_id": document_id,
                "chunk_index": str(chunk.chunk_index),
                "section_title": chunk.section_title or "",
                "article_number": chunk.article_number or "",
                "page_number": str(chunk.page_number) if chunk.page_number else "",
                "priority": str(chunk.priority),
                "context": chunk.context or "",
            }
            
            # Adicionar metadados do chunk
            if chunk.metadata:
                metadata.update({f"meta_{k}": str(v) for k, v in chunk.metadata.items()})
            
            # Adicionar metadados do documento
            if document_metadata:
                metadata.update({f"doc_{k}": str(v) for k, v in document_metadata.items()})
            
            metadatas.append(metadata)
        
        # Adicionar ao ChromaDB
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
        
        print(f"✅ {len(chunks)} chunks indexados com sucesso")
        return len(chunks)
    
    def query_legal_context(
        self,
        query: str,
        n_results: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: float = 0.3
    ) -> List[QueryResult]:
        """
        Busca contexto legal relevante usando busca semântica
        
        Args:
            query: Query de busca (texto)
            n_results: Número de resultados a retornar
            filter_metadata: Filtros de metadados (ex: {"document_id": "..."})
            min_score: Score mínimo de similaridade (0-1)
            
        Returns:
            Lista de QueryResult ordenados por relevância
        """
        # Gerar embedding da query
        query_embedding = self._get_embedding(query, use_cache=False)
        
        # Preparar filtros
        where = {}
        if filter_metadata:
            where = {f"doc_{k}" if not k.startswith(("doc_", "meta_")) else k: str(v) 
                    for k, v in filter_metadata.items()}
        
        # Buscar no ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where if where else None
        )
        
        # Processar resultados
        query_results: List[QueryResult] = []
        
        if results['ids'] and len(results['ids'][0]) > 0:
            for i, chunk_id in enumerate(results['ids'][0]):
                score = 1.0 - results['distances'][0][i] if 'distances' in results else 0.0
                
                # Filtrar por score mínimo
                if score < min_score:
                    continue
                
                chunk_text = results['documents'][0][i]
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                
                query_result = QueryResult(
                    chunk_id=chunk_id,
                    chunk_text=chunk_text,
                    score=score,
                    metadata=metadata,
                    document_id=metadata.get('document_id'),
                    section_title=metadata.get('section_title') or None,
                    article_number=metadata.get('article_number') or None
                )
                
                query_results.append(query_result)
        
        return query_results
    
    def generate_rule_with_context(
        self,
        rule_description: str,
        periodo: str,
        n_context_chunks: int = 3
    ) -> Dict[str, Any]:
        """
        Gera regra consultando documentos legais primeiro
        
        Args:
            rule_description: Descrição da regra a ser gerada
            periodo: Período de vigência (MM/YYYY)
            n_context_chunks: Número de chunks de contexto a buscar
            
        Returns:
            Dict com regra gerada e referências legais
        """
        # Buscar contexto relevante
        query = f"{rule_description} período {periodo}"
        context_results = self.query_legal_context(
            query=query,
            n_results=n_context_chunks,
            filter_metadata={"periodo": periodo} if periodo else None
        )
        
        # Preparar contexto para geração
        context_texts = []
        references = []
        
        for result in context_results:
            context_texts.append(f"[{result.section_title or 'Documento'}] {result.chunk_text}")
            
            if result.document_id:
                ref = {
                    "document_id": result.document_id,
                    "section": result.section_title,
                    "article": result.article_number,
                    "score": result.score
                }
                references.append(ref)
        
        context = "\n\n".join(context_texts)
        
        return {
            "rule_description": rule_description,
            "periodo": periodo,
            "context": context,
            "references": references,
            "context_chunks": len(context_results),
            "confidence": sum(r.score for r in context_results) / len(context_results) if context_results else 0.0
        }
    
    def delete_document(self, document_id: str) -> int:
        """Remove todos os chunks de um documento do vector store"""
        # Buscar IDs dos chunks do documento
        results = self.collection.get(
            where={"document_id": document_id}
        )
        
        if results['ids']:
            # Deletar chunks
            self.collection.delete(ids=results['ids'])
            deleted_count = len(results['ids'])
            print(f"✅ {deleted_count} chunks do documento {document_id} removidos")
            return deleted_count
        
        return 0
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Retorna estatísticas da coleção"""
        count = self.collection.count()
        
        return {
            "collection_name": self.collection_name,
            "total_chunks": count,
            "embedding_model": self.embedding_model.model_name,
            "cache_size": len(self.embedding_cache),
            "vector_store_path": str(self.vector_store_path)
        }


if __name__ == "__main__":
    # Teste básico
    import sys
    from .document_parser import parse_document
    from .chunking import chunk_document
    
    if len(sys.argv) < 2:
        print("Uso: python legal_rag.py <caminho_do_arquivo>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    print(f"📄 Testando sistema RAG com: {file_path}")
    
    try:
        # Parsear e chunking
        print("\n1️⃣  Parseando documento...")
        parsed = parse_document(file_path)
        
        print("\n2️⃣  Aplicando chunking...")
        chunks = chunk_document(parsed, chunk_size=1000, chunk_overlap=200)
        
        # Inicializar RAG
        print("\n3️⃣  Inicializando sistema RAG...")
        rag = LegalDocumentRAG(
            vector_store_path="./data/chroma_db_test",
            embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        
        # Indexar
        print("\n4️⃣  Indexando chunks...")
        document_id = "test_doc_001"
        rag.index_documents(
            chunks=chunks,
            document_id=document_id,
            document_metadata={
                "documento_tipo": parsed.metadata.documento_tipo,
                "documento_nome": parsed.metadata.documento_nome,
                "versao": parsed.metadata.versao or ""
            }
        )
        
        # Testar busca
        print("\n5️⃣  Testando busca semântica...")
        query = "validação de totalização C170 para C190"
        results = rag.query_legal_context(query, n_results=3)
        
        print(f"\n✅ Busca concluída! {len(results)} resultados encontrados:")
        for i, result in enumerate(results, 1):
            print(f"\n   Resultado {i} (Score: {result.score:.3f}):")
            print(f"   Seção: {result.section_title or 'N/A'}")
            print(f"   Artigo: {result.article_number or 'N/A'}")
            print(f"   Preview: {result.chunk_text[:200]}...")
        
        # Estatísticas
        print(f"\n📊 Estatísticas:")
        stats = rag.get_collection_stats()
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


