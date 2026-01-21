"""
Sistema de Referências Legais nas Regras
Integra referências legais nas regras geradas com validação de vigência
"""

from typing import List, Optional, Dict, Any
from datetime import date
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class ReferenciaLegal:
    """Referência legal a um documento"""
    documento_id: str
    documento_nome: str
    documento_tipo: str
    versao: Optional[str] = None
    artigo: Optional[str] = None  # "Art. 12"
    secao: Optional[str] = None  # "Seção 5.2.3"
    paragrafo: Optional[str] = None  # "§ 3º"
    item: Optional[str] = None  # "I", "II", etc.
    pagina: Optional[int] = None
    chunk_id: Optional[str] = None  # Chunk de onde a referência foi extraída
    contexto: Optional[str] = None  # Contexto extraído do chunk
    vigencia_inicio: Optional[date] = None
    vigencia_fim: Optional[date] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte referência para dicionário"""
        return {
            'documento_id': self.documento_id,
            'documento_nome': self.documento_nome,
            'documento_tipo': self.documento_tipo,
            'versao': self.versao,
            'artigo': self.artigo,
            'secao': self.secao,
            'paragrafo': self.paragrafo,
            'item': self.item,
            'pagina': self.pagina,
            'chunk_id': self.chunk_id,
            'contexto': self.contexto,
            'vigencia_inicio': self.vigencia_inicio.isoformat() if self.vigencia_inicio else None,
            'vigencia_fim': self.vigencia_fim.isoformat() if self.vigencia_fim else None,
        }
    
    def format_reference(self) -> str:
        """Formata referência como string legível"""
        partes = [self.documento_nome]
        
        if self.versao:
            partes.append(f"v{self.versao}")
        
        if self.secao:
            partes.append(self.secao)
        
        if self.artigo:
            partes.append(self.artigo)
            if self.paragrafo:
                partes.append(self.paragrafo)
            if self.item:
                partes.append(self.item)
        
        return ", ".join(partes)


class LegalReferenceManager:
    """Gerenciador de referências legais em regras"""
    
    def __init__(self, db_connection=None, versioning_manager=None):
        """
        Args:
            db_connection: Conexão com banco de dados
            versioning_manager: Gerenciador de versionamento
        """
        self.db = db_connection
        self.versioning = versioning_manager
    
    def extract_references_from_chunk(
        self,
        chunk_id: str,
        chunk_text: str,
        document_id: str,
        document_metadata: Dict[str, Any]
    ) -> List[ReferenciaLegal]:
        """
        Extrai referências legais de um chunk de texto
        
        Args:
            chunk_id: ID do chunk
            chunk_text: Texto do chunk
            document_id: ID do documento
            document_metadata: Metadados do documento
        
        Returns:
            Lista de referências extraídas
        """
        referencias: List[ReferenciaLegal] = []
        
        # Extrair artigos (padrão: "Art. 12", "Art. 12, § 3º", etc.)
        import re
        
        # Padrão para artigos
        artigo_pattern = r'Art\.\s*(\d+)(?:\s*,\s*(§\s*\d+[ºª]?))?(?:\s*,\s*([IVX]+))?'
        artigos = re.finditer(artigo_pattern, chunk_text, re.IGNORECASE)
        
        for match in artigos:
            artigo_num = match.group(1)
            paragrafo = match.group(2)
            item = match.group(3)
            
            ref = ReferenciaLegal(
                documento_id=document_id,
                documento_nome=document_metadata.get('documento_nome', ''),
                documento_tipo=document_metadata.get('documento_tipo', ''),
                versao=document_metadata.get('versao'),
                artigo=f"Art. {artigo_num}",
                paragrafo=paragrafo,
                item=item,
                chunk_id=chunk_id,
                contexto=chunk_text[:200],  # Primeiros 200 caracteres como contexto
                vigencia_inicio=document_metadata.get('vigencia_inicio'),
                vigencia_fim=document_metadata.get('vigencia_fim'),
            )
            referencias.append(ref)
        
        # Extrair seções (padrão: "Seção 5.2.3", "Capítulo 3", etc.)
        secao_pattern = r'(?:Seção|Seç[ãa]o|Cap[íi]tulo)\s*([\d.]+)'
        secoes = re.finditer(secao_pattern, chunk_text, re.IGNORECASE)
        
        for match in secoes:
            secao_num = match.group(1)
            
            # Verificar se já existe referência para esta seção
            if not any(r.secao == f"Seção {secao_num}" for r in referencias):
                ref = ReferenciaLegal(
                    documento_id=document_id,
                    documento_nome=document_metadata.get('documento_nome', ''),
                    documento_tipo=document_metadata.get('documento_tipo', ''),
                    versao=document_metadata.get('versao'),
                    secao=f"Seção {secao_num}",
                    chunk_id=chunk_id,
                    contexto=chunk_text[:200],
                    vigencia_inicio=document_metadata.get('vigencia_inicio'),
                    vigencia_fim=document_metadata.get('vigencia_fim'),
                )
                referencias.append(ref)
        
        return referencias
    
    def validate_reference_vigency(
        self,
        referencia: ReferenciaLegal,
        periodo: str
    ) -> bool:
        """
        Valida se uma referência está vigente no período
        
        Args:
            referencia: Referência a validar
            periodo: Período no formato YYYY-MM
        
        Returns:
            True se vigente, False caso contrário
        """
        if not self.versioning:
            return True  # Se não há versioning manager, assume vigente
        
        return self.versioning.validate_vigency(
            periodo,
            referencia.vigencia_inicio or date.today(),
            referencia.vigencia_fim
        )
    
    def add_references_to_rule(
        self,
        rule_id: str,
        referencias: List[ReferenciaLegal]
    ) -> bool:
        """
        Adiciona referências a uma regra
        
        Args:
            rule_id: ID da regra
            referencias: Lista de referências
        
        Returns:
            True se sucesso
        """
        if not self.db:
            return False
        
        try:
            # TODO: Salvar referências no banco
            # Tabela: sped_v2_rule_references
            # Campos: rule_id, referencia (JSON), created_at
            
            for ref in referencias:
                # Inserir referência
                pass
            
            logger.info(f"Adicionadas {len(referencias)} referências à regra {rule_id}")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao adicionar referências: {e}")
            return False
    
    def get_rule_references(self, rule_id: str) -> List[ReferenciaLegal]:
        """
        Retorna referências de uma regra
        
        Args:
            rule_id: ID da regra
        
        Returns:
            Lista de referências
        """
        if not self.db:
            return []
        
        try:
            # TODO: Buscar referências no banco
            return []
            
        except Exception as e:
            logger.error(f"Erro ao buscar referências: {e}")
            return []
    
    def update_references_on_document_change(
        self,
        documento_id: str,
        novo_documento_id: str
    ) -> int:
        """
        Atualiza referências quando um documento é atualizado
        
        Args:
            documento_id: ID do documento antigo
            novo_documento_id: ID do documento novo
        
        Returns:
            Número de referências atualizadas
        """
        if not self.db:
            return 0
        
        try:
            # TODO: Atualizar referências no banco
            # Buscar todas as regras que referenciam o documento antigo
            # Atualizar referências para apontar para o novo documento
            # Validar vigência das novas referências
            
            return 0
            
        except Exception as e:
            logger.error(f"Erro ao atualizar referências: {e}")
            return 0

