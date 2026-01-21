"""
Audit Logger - Sistema de Log de Auditoria para Correções SPED v2
Registra valores antes/depois de cada correção aplicada
"""

from typing import List, Dict, Any, Optional
from decimal import Decimal
from dataclasses import dataclass, field
from datetime import datetime
import logging
import json
import uuid

logger = logging.getLogger(__name__)


@dataclass
class AuditLogEntry:
    """Entrada de log de auditoria"""
    lote_id: str
    correcao_id: str
    chave_nfe: Optional[str]
    registro_sped: Optional[str]
    campo: str
    valor_antes: Decimal
    valor_depois: Decimal
    diferenca: Decimal
    regra_aplicada: Optional[str]
    score_confianca: Optional[Decimal]
    classificacao: Optional[str]
    usuario_id: Optional[int]
    usuario_nome: Optional[str]
    timestamp: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
    arquivo_sped: Optional[str] = None
    arquivo_sped_corrigido: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte entrada para dicionário"""
        return {
            'lote_id': self.lote_id,
            'correcao_id': self.correcao_id,
            'chave_nfe': self.chave_nfe,
            'registro_sped': self.registro_sped,
            'campo': self.campo,
            'valor_antes': float(self.valor_antes),
            'valor_depois': float(self.valor_depois),
            'diferenca': float(self.diferenca),
            'regra_aplicada': self.regra_aplicada,
            'score_confianca': float(self.score_confianca) if self.score_confianca else None,
            'classificacao': self.classificacao,
            'usuario_id': self.usuario_id,
            'usuario_nome': self.usuario_nome,
            'timestamp': self.timestamp.isoformat(),
            'metadata': self.metadata,
            'arquivo_sped': self.arquivo_sped,
            'arquivo_sped_corrigido': self.arquivo_sped_corrigido,
        }


class AuditLogger:
    """Logger de auditoria para correções SPED"""
    
    def __init__(self, db_connection=None):
        """
        Inicializa o logger de auditoria
        
        Args:
            db_connection: Conexão com banco de dados MySQL (opcional)
        """
        self.db_connection = db_connection
        self.logs_memory: List[AuditLogEntry] = []
    
    def log_correcao(
        self,
        lote_id: str,
        correcao_id: str,
        chave_nfe: Optional[str],
        registro_sped: Optional[str],
        campo: str,
        valor_antes: Decimal,
        valor_depois: Decimal,
        regra_aplicada: Optional[str] = None,
        score_confianca: Optional[Decimal] = None,
        classificacao: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usuario_nome: Optional[str] = None,
        arquivo_sped: Optional[str] = None,
        arquivo_sped_corrigido: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AuditLogEntry:
        """
        Registra uma correção no log de auditoria
        
        Args:
            lote_id: ID do lote de correções
            correcao_id: ID da correção
            chave_nfe: Chave da NF-e
            registro_sped: Tipo de registro (C100, C170, C190)
            campo: Nome do campo alterado
            valor_antes: Valor antes da correção
            valor_depois: Valor depois da correção
            regra_aplicada: Regra aplicada
            score_confianca: Score de confiança
            classificacao: Classificação
            usuario_id: ID do usuário
            usuario_nome: Nome do usuário
            arquivo_sped: Caminho do arquivo SPED original
            arquivo_sped_corrigido: Caminho do arquivo SPED corrigido
            metadata: Metadados adicionais
        
        Returns:
            Entrada de log criada
        """
        diferenca = abs(valor_antes - valor_depois)
        
        entry = AuditLogEntry(
            lote_id=lote_id,
            correcao_id=correcao_id,
            chave_nfe=chave_nfe,
            registro_sped=registro_sped,
            campo=campo,
            valor_antes=valor_antes,
            valor_depois=valor_depois,
            diferenca=diferenca,
            regra_aplicada=regra_aplicada,
            score_confianca=score_confianca,
            classificacao=classificacao,
            usuario_id=usuario_id,
            usuario_nome=usuario_nome,
            timestamp=datetime.now(),
            metadata=metadata or {},
            arquivo_sped=arquivo_sped,
            arquivo_sped_corrigido=arquivo_sped_corrigido
        )
        
        # Armazenar em memória
        self.logs_memory.append(entry)
        
        # Salvar no banco se conexão disponível
        if self.db_connection:
            self._salvar_no_banco(entry)
        
        return entry
    
    def _salvar_no_banco(self, entry: AuditLogEntry):
        """
        Salva entrada no banco de dados
        
        Args:
            entry: Entrada de log
        """
        try:
            cursor = self.db_connection.cursor()
            
            query = """
                INSERT INTO sped_v2_audit_log (
                    lote_id, correcao_id, chave_nfe, registro_sped, campo,
                    valor_antes, valor_depois, diferenca, regra_aplicada,
                    score_confianca, classificacao, usuario_id, usuario_nome,
                    timestamp, metadata, arquivo_sped, arquivo_sped_corrigido
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
            """
            
            metadata_json = json.dumps(entry.metadata) if entry.metadata else None
            
            cursor.execute(query, (
                entry.lote_id,
                entry.correcao_id,
                entry.chave_nfe,
                entry.registro_sped,
                entry.campo,
                float(entry.valor_antes),
                float(entry.valor_depois),
                float(entry.diferenca),
                entry.regra_aplicada,
                float(entry.score_confianca) if entry.score_confianca else None,
                entry.classificacao,
                entry.usuario_id,
                entry.usuario_nome,
                entry.timestamp,
                metadata_json,
                entry.arquivo_sped,
                entry.arquivo_sped_corrigido
            ))
            
            self.db_connection.commit()
            cursor.close()
        
        except Exception as e:
            logger.error(f"Erro ao salvar log no banco: {e}")
            # Não falha silenciosamente - log em memória já foi criado
    
    def registrar_lote(
        self,
        lote_id: str,
        usuario_id: Optional[int],
        usuario_nome: Optional[str],
        arquivo_sped_original: str,
        total_correcoes: int,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Registra um novo lote de correções
        
        Args:
            lote_id: ID do lote
            usuario_id: ID do usuário
            usuario_nome: Nome do usuário
            arquivo_sped_original: Caminho do arquivo SPED original
            total_correcoes: Total de correções no lote
            metadata: Metadados adicionais
        """
        if not self.db_connection:
            return
        
        try:
            cursor = self.db_connection.cursor()
            
            query = """
                INSERT INTO sped_v2_corrections (
                    lote_id, usuario_id, usuario_nome, arquivo_sped_original,
                    total_correcoes, status, metadata
                ) VALUES (%s, %s, %s, %s, %s, 'pendente', %s)
            """
            
            metadata_json = json.dumps(metadata) if metadata else None
            
            cursor.execute(query, (
                lote_id,
                usuario_id,
                usuario_nome,
                arquivo_sped_original,
                total_correcoes,
                metadata_json
            ))
            
            self.db_connection.commit()
            cursor.close()
        
        except Exception as e:
            logger.error(f"Erro ao registrar lote no banco: {e}")
    
    def atualizar_lote(
        self,
        lote_id: str,
        arquivo_sped_corrigido: Optional[str] = None,
        correcoes_aplicadas: Optional[int] = None,
        correcoes_falhadas: Optional[int] = None,
        c190_recalculados: Optional[int] = None,
        impacto_total: Optional[Decimal] = None,
        status: Optional[str] = None
    ):
        """
        Atualiza status de um lote
        
        Args:
            lote_id: ID do lote
            arquivo_sped_corrigido: Caminho do arquivo corrigido
            correcoes_aplicadas: Número de correções aplicadas
            correcoes_falhadas: Número de correções falhadas
            c190_recalculados: Número de C190 recalculados
            impacto_total: Impacto total
            status: Novo status
        """
        if not self.db_connection:
            return
        
        try:
            cursor = self.db_connection.cursor()
            
            updates = []
            params = []
            
            if arquivo_sped_corrigido:
                updates.append("arquivo_sped_corrigido = %s")
                params.append(arquivo_sped_corrigido)
            
            if correcoes_aplicadas is not None:
                updates.append("correcoes_aplicadas = %s")
                params.append(correcoes_aplicadas)
            
            if correcoes_falhadas is not None:
                updates.append("correcoes_falhadas = %s")
                params.append(correcoes_falhadas)
            
            if c190_recalculados is not None:
                updates.append("c190_recalculados = %s")
                params.append(c190_recalculados)
            
            if impacto_total is not None:
                updates.append("impacto_total = %s")
                params.append(float(impacto_total))
            
            if status:
                updates.append("status = %s")
                params.append(status)
                
                if status == 'aplicado':
                    updates.append("data_aplicacao = NOW()")
            
            if updates:
                params.append(lote_id)
                query = f"UPDATE sped_v2_corrections SET {', '.join(updates)} WHERE lote_id = %s"
                cursor.execute(query, params)
                self.db_connection.commit()
            
            cursor.close()
        
        except Exception as e:
            logger.error(f"Erro ao atualizar lote no banco: {e}")
    
    def get_logs_por_lote(self, lote_id: str) -> List[AuditLogEntry]:
        """
        Obtém logs de um lote específico
        
        Args:
            lote_id: ID do lote
        
        Returns:
            Lista de entradas de log
        """
        if self.db_connection:
            return self._buscar_logs_banco(lote_id=lote_id)
        else:
            return [log for log in self.logs_memory if log.lote_id == lote_id]
    
    def _buscar_logs_banco(self, lote_id: Optional[str] = None, chave_nfe: Optional[str] = None) -> List[AuditLogEntry]:
        """
        Busca logs no banco de dados
        
        Args:
            lote_id: ID do lote (opcional)
            chave_nfe: Chave NF-e (opcional)
        
        Returns:
            Lista de entradas de log
        """
        try:
            cursor = self.db_connection.cursor(dictionary=True)
            
            query = "SELECT * FROM sped_v2_audit_log WHERE 1=1"
            params = []
            
            if lote_id:
                query += " AND lote_id = %s"
                params.append(lote_id)
            
            if chave_nfe:
                query += " AND chave_nfe = %s"
                params.append(chave_nfe)
            
            query += " ORDER BY timestamp DESC"
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            cursor.close()
            
            logs = []
            for row in rows:
                metadata = json.loads(row['metadata']) if row['metadata'] else {}
                
                log = AuditLogEntry(
                    lote_id=row['lote_id'],
                    correcao_id=row['correcao_id'],
                    chave_nfe=row['chave_nfe'],
                    registro_sped=row['registro_sped'],
                    campo=row['campo'],
                    valor_antes=Decimal(str(row['valor_antes'])),
                    valor_depois=Decimal(str(row['valor_depois'])),
                    diferenca=Decimal(str(row['diferenca'])),
                    regra_aplicada=row['regra_aplicada'],
                    score_confianca=Decimal(str(row['score_confianca'])) if row['score_confianca'] else None,
                    classificacao=row['classificacao'],
                    usuario_id=row['usuario_id'],
                    usuario_nome=row['usuario_nome'],
                    timestamp=row['timestamp'],
                    metadata=metadata,
                    arquivo_sped=row['arquivo_sped'],
                    arquivo_sped_corrigido=row['arquivo_sped_corrigido']
                )
                logs.append(log)
            
            return logs
        
        except Exception as e:
            logger.error(f"Erro ao buscar logs no banco: {e}")
            return []

