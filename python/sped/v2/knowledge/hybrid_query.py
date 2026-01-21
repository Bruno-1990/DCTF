"""
Sistema de consulta híbrida RAG + Banco de Dados
Combina busca semântica (RAG) com regras estruturadas do banco
Prioriza regras estruturadas e complementa com contexto RAG
"""

import sys
import json
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sped.v2.knowledge.legal_rag import LegalDocumentRAG, QueryResult

try:
    import mysql.connector
    from mysql.connector import Error
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    print("⚠️  mysql-connector-python não disponível. Instale com: pip install mysql-connector-python")


@dataclass
class StructuredRule:
    """Regra estruturada do banco de dados"""
    id: str
    rule_type: str
    rule_category: str
    rule_description: str
    rule_condition: Optional[str]
    legal_reference: Optional[str]
    article_reference: Optional[str]
    section_reference: Optional[str]
    vigencia_inicio: str
    vigencia_fim: Optional[str]
    document_id: Optional[str]
    metadata: Optional[Dict[str, Any]]


@dataclass
class HybridQueryResult:
    """Resultado da consulta híbrida"""
    query: str
    structured_rules: List[StructuredRule]
    rag_results: List[QueryResult]
    confidence_score: float
    confidence_factors: Dict[str, float]
    combined_context: str
    legal_references: List[Dict[str, str]]
    is_valid_period: bool
    period_validation_message: Optional[str]


class HybridQueryService:
    """Serviço de consulta híbrida RAG + Banco"""
    
    def __init__(
        self,
        vector_store_path: str = "./data/chroma_db",
        embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        db_config: Optional[Dict[str, Any]] = None
    ):
        """
        Args:
            vector_store_path: Caminho para o ChromaDB
            embedding_model: Modelo de embedding
            db_config: Configuração do banco de dados MySQL
        """
        self.rag = LegalDocumentRAG(
            vector_store_path=vector_store_path,
            embedding_model=embedding_model
        )
        self.db_config = db_config or self._load_db_config()
    
    def _load_db_config(self) -> Dict[str, Any]:
        """Carrega configuração do banco de dados"""
        # Tentar carregar de variáveis de ambiente ou arquivo de config
        import os
        return {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', 3306)),
            'user': os.getenv('DB_USER', 'root'),
            'password': os.getenv('DB_PASSWORD', ''),
            'database': os.getenv('DB_NAME', 'dctf_mpc')
        }
    
    def _get_db_connection(self):
        """Obtém conexão com o banco de dados"""
        if not MYSQL_AVAILABLE:
            raise ImportError("mysql-connector-python não está instalado")
        
        try:
            conn = mysql.connector.connect(**self.db_config)
            return conn
        except Error as e:
            raise ConnectionError(f"Erro ao conectar ao banco: {e}")
    
    def query_structured_rules(
        self,
        query: str,
        categoria: Optional[str] = None,
        tipo: Optional[str] = None,
        periodo: Optional[str] = None,
        document_id: Optional[str] = None,
        limit: int = 10
    ) -> List[StructuredRule]:
        """
        Consulta regras estruturadas do banco de dados
        
        Args:
            query: Texto para busca (busca em rule_description)
            categoria: Filtro por categoria
            tipo: Filtro por tipo de regra
            periodo: Período no formato MM/YYYY
            document_id: Filtro por documento
            limit: Limite de resultados
        """
        if not MYSQL_AVAILABLE:
            return []
        
        conn = None
        try:
            conn = self._get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
            sql = """
                SELECT 
                    id,
                    rule_type,
                    rule_category,
                    rule_description,
                    rule_condition,
                    legal_reference,
                    article_reference,
                    section_reference,
                    vigencia_inicio,
                    vigencia_fim,
                    document_id,
                    metadata
                FROM sped_v2_legal_rules
                WHERE 1=1
            """
            
            params = []
            
            # Busca textual em rule_description
            if query:
                sql += " AND rule_description LIKE %s"
                params.append(f"%{query}%")
            
            # Filtros
            if categoria:
                sql += " AND rule_category = %s"
                params.append(categoria)
            
            if tipo:
                sql += " AND rule_type = %s"
                params.append(tipo)
            
            # Filtro por período (vigência)
            if periodo:
                import re
                periodo_match = re.match(r'^(\d{2})/(\d{4})$', periodo)
                if periodo_match:
                    month, year = periodo_match.groups()
                    periodo_date = datetime(int(year), int(month), 1).date()
                    periodo_date_str = periodo_date.isoformat()
                    
                    sql += " AND vigencia_inicio <= %s AND (vigencia_fim IS NULL OR vigencia_fim >= %s)"
                    params.extend([periodo_date_str, periodo_date_str])
                else:
                    # Tentar parse manual como fallback
                    try:
                        month, year = periodo.split('/')
                        periodo_date = datetime(int(year), int(month), 1).date()
                        periodo_date_str = periodo_date.isoformat()
                        
                        sql += " AND vigencia_inicio <= %s AND (vigencia_fim IS NULL OR vigencia_fim >= %s)"
                        params.extend([periodo_date_str, periodo_date_str])
                    except:
                        pass
            
            if document_id:
                sql += " AND document_id = %s"
                params.append(document_id)
            
            sql += " ORDER BY rule_category ASC, rule_type ASC, vigencia_inicio DESC LIMIT %s"
            params.append(limit)
            
            cursor.execute(sql, params)
            results = cursor.fetchall()
            
            rules = []
            for row in results:
                metadata = None
                if row.get('metadata'):
                    try:
                        metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else row['metadata']
                    except:
                        metadata = row['metadata']
                
                rules.append(StructuredRule(
                    id=str(row['id']),
                    rule_type=row['rule_type'],
                    rule_category=row['rule_category'],
                    rule_description=row['rule_description'],
                    rule_condition=row.get('rule_condition'),
                    legal_reference=row.get('legal_reference'),
                    article_reference=row.get('article_reference'),
                    section_reference=row.get('section_reference'),
                    vigencia_inicio=row['vigencia_inicio'].isoformat() if hasattr(row['vigencia_inicio'], 'isoformat') else str(row['vigencia_inicio']),
                    vigencia_fim=row['vigencia_fim'].isoformat() if row['vigencia_fim'] and hasattr(row['vigencia_fim'], 'isoformat') else (str(row['vigencia_fim']) if row['vigencia_fim'] else None),
                    document_id=row.get('document_id'),
                    metadata=metadata
                ))
            
            return rules
            
        except Exception as e:
            print(f"⚠️  Erro ao consultar regras estruturadas: {e}")
            return []
        finally:
            if conn and conn.is_connected():
                conn.close()
    
    def validate_period(
        self,
        vigencia_inicio: str,
        vigencia_fim: Optional[str],
        periodo: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Valida se um período está dentro da vigência
        
        Args:
            vigencia_inicio: Data de início da vigência (ISO format)
            vigencia_fim: Data de fim da vigência (ISO format ou None)
            periodo: Período a validar (MM/YYYY)
        
        Returns:
            (is_valid, message)
        """
        if not periodo:
            return True, None
        
        try:
            # Parsear período
            month, year = periodo.split('/')
            periodo_date = datetime(int(year), int(month), 1).date()
            
            # Parsear vigência
            if isinstance(vigencia_inicio, str):
                vigencia_inicio_date = datetime.fromisoformat(vigencia_inicio.split('T')[0]).date()
            else:
                vigencia_inicio_date = vigencia_inicio
            
            vigencia_fim_date = None
            if vigencia_fim:
                if isinstance(vigencia_fim, str):
                    vigencia_fim_date = datetime.fromisoformat(vigencia_fim.split('T')[0]).date()
                else:
                    vigencia_fim_date = vigencia_fim
            
            # Validar
            if periodo_date < vigencia_inicio_date:
                return False, f"Período {periodo} está antes da vigência (início: {vigencia_inicio_date})"
            
            if vigencia_fim_date and periodo_date > vigencia_fim_date:
                return False, f"Período {periodo} está após a vigência (fim: {vigencia_fim_date})"
            
            return True, None
            
        except Exception as e:
            return False, f"Erro ao validar período: {e}"
    
    def calculate_confidence_score(
        self,
        structured_rules_count: int,
        rag_results: List[QueryResult],
        has_structured_match: bool = True
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calcula score de confiança baseado em match RAG + existência de regra estruturada
        
        Args:
            structured_rules_count: Número de regras estruturadas encontradas
            rag_results: Resultados do RAG
            has_structured_match: Se há match em regras estruturadas
        
        Returns:
            (score, factors)
        """
        # Pesos
        WEIGHT_STRUCTURED = 0.7  # Regras estruturadas têm mais peso
        WEIGHT_RAG = 0.3  # RAG complementa
        
        factors = {}
        
        # Fator de regras estruturadas
        if has_structured_match and structured_rules_count > 0:
            # Score baseado na quantidade (normalizado)
            structured_score = min(structured_rules_count / 5.0, 1.0)  # Máximo em 5 regras
            factors['structured_rules'] = structured_score
        else:
            factors['structured_rules'] = 0.0
        
        # Fator RAG
        if rag_results:
            # Score médio dos resultados RAG
            avg_rag_score = sum(r.score for r in rag_results) / len(rag_results)
            factors['rag_match'] = avg_rag_score
        else:
            factors['rag_match'] = 0.0
        
        # Score combinado
        confidence = (
            factors['structured_rules'] * WEIGHT_STRUCTURED +
            factors['rag_match'] * WEIGHT_RAG
        )
        
        return min(confidence, 1.0), factors
    
    def query_hybrid(
        self,
        query: str,
        categoria: Optional[str] = None,
        tipo: Optional[str] = None,
        periodo: Optional[str] = None,
        document_id: Optional[str] = None,
        n_rag_results: int = 5,
        n_structured_rules: int = 10,
        min_rag_score: float = 0.3
    ) -> HybridQueryResult:
        """
        Consulta híbrida: RAG + Banco de dados
        
        Args:
            query: Query de busca
            categoria: Filtro por categoria
            tipo: Filtro por tipo
            periodo: Período (MM/YYYY)
            document_id: Filtro por documento
            n_rag_results: Número de resultados RAG
            n_structured_rules: Número de regras estruturadas
            min_rag_score: Score mínimo para RAG
        
        Returns:
            HybridQueryResult
        """
        # 1. Consultar regras estruturadas (prioridade)
        structured_rules = self.query_structured_rules(
            query=query,
            categoria=categoria,
            tipo=tipo,
            periodo=periodo,
            document_id=document_id,
            limit=n_structured_rules
        )
        
        # 2. Consultar RAG (complemento)
        rag_results = []
        try:
            rag_results = self.rag.query_legal_context(
                query=query,
                n_results=n_rag_results,
                filter_metadata={"document_id": document_id} if document_id else None,
                min_score=min_rag_score
            )
        except Exception as e:
            print(f"⚠️  Erro na consulta RAG: {e}")
        
        # 3. Validar vigência do período (se fornecido)
        is_valid_period = True
        period_validation_message = None
        
        if periodo and structured_rules:
            # Validar primeira regra como exemplo
            first_rule = structured_rules[0]
            is_valid, message = self.validate_period(
                first_rule.vigencia_inicio,
                first_rule.vigencia_fim,
                periodo
            )
            is_valid_period = is_valid
            period_validation_message = message
        
        # 4. Calcular score de confiança
        confidence_score, confidence_factors = self.calculate_confidence_score(
            structured_rules_count=len(structured_rules),
            rag_results=rag_results,
            has_structured_match=len(structured_rules) > 0
        )
        
        # 5. Combinar contexto
        combined_context_parts = []
        
        # Adicionar regras estruturadas (prioridade)
        if structured_rules:
            combined_context_parts.append("=== REGRAS ESTRUTURADAS ===")
            for rule in structured_rules[:3]:  # Top 3
                combined_context_parts.append(f"Categoria: {rule.rule_category}")
                combined_context_parts.append(f"Tipo: {rule.rule_type}")
                combined_context_parts.append(f"Descrição: {rule.rule_description}")
                if rule.legal_reference:
                    combined_context_parts.append(f"Referência: {rule.legal_reference}")
        
        # Adicionar contexto RAG (complemento)
        if rag_results:
            combined_context_parts.append("\n=== CONTEXTO SEMÂNTICO (RAG) ===")
            for result in rag_results[:3]:  # Top 3
                combined_context_parts.append(f"Score: {result.score:.3f}")
                combined_context_parts.append(f"Texto: {result.chunk_text[:200]}...")
                if result.section_title:
                    combined_context_parts.append(f"Seção: {result.section_title}")
        
        combined_context = "\n".join(combined_context_parts)
        
        # 6. Extrair referências legais
        legal_references = []
        
        # Das regras estruturadas
        for rule in structured_rules:
            if rule.legal_reference or rule.article_reference or rule.section_reference:
                legal_references.append({
                    "documento": rule.legal_reference or "N/A",
                    "versao": rule.metadata.get('versao') if rule.metadata else None,
                    "artigo": rule.article_reference,
                    "secao": rule.section_reference,
                    "vigencia_inicio": rule.vigencia_inicio,
                    "vigencia_fim": rule.vigencia_fim
                })
        
        # Dos resultados RAG
        for result in rag_results:
            if result.metadata and result.metadata.get('legal_reference'):
                legal_references.append({
                    "documento": result.metadata.get('legal_reference'),
                    "versao": result.metadata.get('versao'),
                    "artigo": result.article_number,
                    "secao": result.section_title,
                    "vigencia_inicio": result.metadata.get('vigencia_inicio'),
                    "vigencia_fim": result.metadata.get('vigencia_fim')
                })
        
        # Remover duplicatas
        seen = set()
        unique_references = []
        for ref in legal_references:
            key = (ref.get('documento'), ref.get('artigo'), ref.get('secao'))
            if key not in seen:
                seen.add(key)
                unique_references.append(ref)
        
        return HybridQueryResult(
            query=query,
            structured_rules=structured_rules,
            rag_results=rag_results,
            confidence_score=confidence_score,
            confidence_factors=confidence_factors,
            combined_context=combined_context,
            legal_references=unique_references,
            is_valid_period=is_valid_period,
            period_validation_message=period_validation_message
        )


def main():
    """CLI para teste da consulta híbrida"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Query é obrigatória"
        }))
        sys.exit(1)
    
    query = sys.argv[1]
    categoria = sys.argv[2] if len(sys.argv) > 2 else None
    tipo = sys.argv[3] if len(sys.argv) > 3 else None
    periodo = sys.argv[4] if len(sys.argv) > 4 else None
    
    try:
        service = HybridQueryService()
        result = service.query_hybrid(
            query=query,
            categoria=categoria,
            tipo=tipo,
            periodo=periodo
        )
        
        output = {
            "success": True,
            "data": {
                "query": result.query,
                "structured_rules_count": len(result.structured_rules),
                "rag_results_count": len(result.rag_results),
                "confidence_score": result.confidence_score,
                "confidence_factors": result.confidence_factors,
                "is_valid_period": result.is_valid_period,
                "period_validation_message": result.period_validation_message,
                "legal_references": result.legal_references,
                "structured_rules": [
                    {
                        "id": r.id,
                        "rule_type": r.rule_type,
                        "rule_category": r.rule_category,
                        "rule_description": r.rule_description,
                        "legal_reference": r.legal_reference
                    }
                    for r in result.structured_rules[:5]
                ],
                "rag_results": [
                    {
                        "chunk_id": r.chunk_id,
                        "score": r.score,
                        "chunk_text": r.chunk_text[:200]
                    }
                    for r in result.rag_results[:5]
                ],
                "combined_context": result.combined_context[:1000]  # Limitar tamanho
            }
        }
        
        print(json.dumps(output, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()

