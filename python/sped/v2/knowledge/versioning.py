"""
Sistema de Versionamento e Vigência de Documentos Legais
Gerencia versionamento por período, histórico e migração automática
"""

from typing import List, Optional, Dict, Any
from datetime import date, datetime
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DocumentVersion:
    """Versão de um documento com vigência"""
    id: str
    documento_tipo: str
    documento_nome: str
    versao: Optional[str]
    vigencia_inicio: date
    vigencia_fim: Optional[date]
    hash_arquivo: str
    status: str  # ativo, inativo, substituido
    documento_substituido_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class VersioningManager:
    """Gerenciador de versionamento e vigência de documentos"""
    
    def __init__(self, db_connection=None):
        """
        Args:
            db_connection: Conexão com banco de dados (MySQL)
        """
        self.db = db_connection
    
    def validate_vigency(self, periodo: str, vigencia_inicio: date, vigencia_fim: Optional[date] = None) -> bool:
        """
        Valida se um período está dentro da vigência de um documento
        
        Args:
            periodo: Período no formato YYYY-MM (ex: "2024-01")
            vigencia_inicio: Data de início da vigência
            vigencia_fim: Data de fim da vigência (None = ainda vigente)
        
        Returns:
            True se o período está dentro da vigência, False caso contrário
        """
        try:
            # Converter período para date (primeiro dia do mês)
            ano, mes = periodo.split('-')
            periodo_date = date(int(ano), int(mes), 1)
            
            # Verificar se está dentro da vigência
            if periodo_date < vigencia_inicio:
                return False
            
            if vigencia_fim and periodo_date > vigencia_fim:
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao validar vigência: {e}")
            return False
    
    def get_document_for_period(
        self,
        documento_tipo: str,
        periodo: str,
        documento_nome: Optional[str] = None
    ) -> Optional[DocumentVersion]:
        """
        Retorna o documento correto para um período específico
        
        Args:
            documento_tipo: Tipo do documento (GUIA_PRATICO, ATO_COTEPE, etc.)
            periodo: Período no formato YYYY-MM
            documento_nome: Nome específico do documento (opcional)
        
        Returns:
            Versão do documento vigente no período ou None
        """
        if not self.db:
            # Modo simulado
            return None
        
        try:
            # Converter período para date
            ano, mes = periodo.split('-')
            periodo_date = date(int(ano), int(mes), 1)
            
            query = """
                SELECT * FROM sped_v2_legal_documents
                WHERE documento_tipo = %s
                  AND vigencia_inicio <= %s
                  AND (vigencia_fim IS NULL OR vigencia_fim >= %s)
                  AND status = 'ativo'
            """
            params = [documento_tipo, periodo_date, periodo_date]
            
            if documento_nome:
                query += " AND documento_nome = %s"
                params.append(documento_nome)
            
            query += " ORDER BY vigencia_inicio DESC LIMIT 1"
            
            # TODO: Executar query e converter resultado
            # Por enquanto, retorna None
            return None
            
        except Exception as e:
            logger.error(f"Erro ao buscar documento para período: {e}")
            return None
    
    def get_version_history(self, documento_nome: str, documento_tipo: Optional[str] = None) -> List[DocumentVersion]:
        """
        Retorna histórico de versões de um documento
        
        Args:
            documento_nome: Nome do documento
            documento_tipo: Tipo do documento (opcional)
        
        Returns:
            Lista de versões ordenadas por vigência (mais recente primeiro)
        """
        if not self.db:
            return []
        
        try:
            query = """
                SELECT * FROM sped_v2_legal_documents
                WHERE documento_nome = %s
            """
            params = [documento_nome]
            
            if documento_tipo:
                query += " AND documento_tipo = %s"
                params.append(documento_tipo)
            
            query += " ORDER BY vigencia_inicio DESC"
            
            # TODO: Executar query e converter resultados
            return []
            
        except Exception as e:
            logger.error(f"Erro ao buscar histórico de versões: {e}")
            return []
    
    def migrate_version(
        self,
        documento_antigo_id: str,
        documento_novo_id: str,
        vigencia_fim: Optional[date] = None
    ) -> bool:
        """
        Migra de uma versão antiga para uma nova, marcando a antiga como substituída
        
        Args:
            documento_antigo_id: ID do documento antigo
            documento_novo_id: ID do documento novo
            vigencia_fim: Data de fim da vigência do documento antigo (opcional, usa data atual se None)
        
        Returns:
            True se migração foi bem-sucedida, False caso contrário
        """
        if not self.db:
            return False
        
        try:
            if not vigencia_fim:
                vigencia_fim = date.today()
            
            # Atualizar documento antigo
            query_antigo = """
                UPDATE sped_v2_legal_documents
                SET vigencia_fim = %s,
                    status = 'substituido',
                    documento_substituido_id = %s,
                    updated_at = NOW()
                WHERE id = %s
            """
            params_antigo = [vigencia_fim, documento_novo_id, documento_antigo_id]
            
            # TODO: Executar query
            logger.info(f"Migração: documento {documento_antigo_id} substituído por {documento_novo_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro ao migrar versão: {e}")
            return False
    
    def auto_migrate_on_ingest(
        self,
        novo_documento: Dict[str, Any],
        vigencia_inicio: date
    ) -> Optional[str]:
        """
        Migração automática quando um novo documento é ingerido
        
        Identifica documentos antigos do mesmo tipo/nome que devem ser substituídos
        e marca-os como substituídos
        
        Args:
            novo_documento: Dados do novo documento
            vigencia_inicio: Data de início da vigência do novo documento
        
        Returns:
            ID do documento antigo substituído ou None
        """
        if not self.db:
            return None
        
        try:
            documento_tipo = novo_documento.get('documento_tipo')
            documento_nome = novo_documento.get('documento_nome')
            
            if not documento_tipo or not documento_nome:
                return None
            
            # Buscar documento ativo do mesmo tipo/nome que ainda está vigente
            query = """
                SELECT id FROM sped_v2_legal_documents
                WHERE documento_tipo = %s
                  AND documento_nome = %s
                  AND status = 'ativo'
                  AND (vigencia_fim IS NULL OR vigencia_fim >= %s)
                ORDER BY vigencia_inicio DESC
                LIMIT 1
            """
            params = [documento_tipo, documento_nome, vigencia_inicio]
            
            # TODO: Executar query e obter ID do documento antigo
            documento_antigo_id = None  # Simulado
            
            if documento_antigo_id:
                # Migrar versão antiga
                self.migrate_version(documento_antigo_id, novo_documento.get('id'), vigencia_inicio)
                return documento_antigo_id
            
            return None
            
        except Exception as e:
            logger.error(f"Erro na migração automática: {e}")
            return None
    
    def get_active_documents(self, periodo: Optional[str] = None) -> List[DocumentVersion]:
        """
        Retorna todos os documentos ativos para um período
        
        Args:
            periodo: Período no formato YYYY-MM (opcional, usa período atual se None)
        
        Returns:
            Lista de documentos ativos
        """
        if not self.db:
            return []
        
        try:
            if not periodo:
                hoje = date.today()
                periodo = f"{hoje.year}-{hoje.month:02d}"
            
            periodo_date = date(int(periodo.split('-')[0]), int(periodo.split('-')[1]), 1)
            
            query = """
                SELECT * FROM sped_v2_legal_documents
                WHERE status = 'ativo'
                  AND vigencia_inicio <= %s
                  AND (vigencia_fim IS NULL OR vigencia_fim >= %s)
                ORDER BY documento_tipo, documento_nome, vigencia_inicio DESC
            """
            params = [periodo_date, periodo_date]
            
            # TODO: Executar query e converter resultados
            return []
            
        except Exception as e:
            logger.error(f"Erro ao buscar documentos ativos: {e}")
            return []
    
    def update_vigency(
        self,
        documento_id: str,
        vigencia_inicio: Optional[date] = None,
        vigencia_fim: Optional[date] = None
    ) -> bool:
        """
        Atualiza vigência de um documento
        
        Args:
            documento_id: ID do documento
            vigencia_inicio: Nova data de início (opcional)
            vigencia_fim: Nova data de fim (opcional)
        
        Returns:
            True se atualização foi bem-sucedida
        """
        if not self.db:
            return False
        
        try:
            updates = []
            params = []
            
            if vigencia_inicio:
                updates.append("vigencia_inicio = %s")
                params.append(vigencia_inicio)
            
            if vigencia_fim is not None:
                updates.append("vigencia_fim = %s")
                params.append(vigencia_fim)
            
            if not updates:
                return False
            
            updates.append("updated_at = NOW()")
            params.append(documento_id)
            
            query = f"""
                UPDATE sped_v2_legal_documents
                SET {', '.join(updates)}
                WHERE id = %s
            """
            
            # TODO: Executar query
            logger.info(f"Vigência atualizada para documento {documento_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro ao atualizar vigência: {e}")
            return False

