"""
Alertas de Qualidade de Integração
Conforme roteiro seção 9.6: Alertas de qualidade de integração

Detecta e alerta (não erro) sobre:
- Documentos sem chave no SPED
- Duplicidade de chave
- CFOP/CST inesperado para o cliente
"""

from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from decimal import Decimal
import logging

from ..canonical.documento_fiscal import DocumentoFiscal
from ..config.client_profile import ClientProfile

logger = logging.getLogger(__name__)


@dataclass
class AlertaQualidade:
    """Alerta de qualidade de integração"""
    tipo: str  # 'sem_chave', 'duplicidade', 'cfop_inesperado', 'cst_inesperado'
    severidade: str  # 'info', 'warning', 'critical'
    mensagem: str
    chave_nfe: Optional[str] = None
    documento_xml: Optional[DocumentoFiscal] = None
    documento_efd: Optional[DocumentoFiscal] = None
    detalhes: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte alerta para dicionário"""
        return {
            'tipo': self.tipo,
            'severidade': self.severidade,
            'mensagem': self.mensagem,
            'chave_nfe': self.chave_nfe,
            'detalhes': self.detalhes,
        }


class QualityAlerts:
    """Sistema de alertas de qualidade de integração"""
    
    def __init__(self, client_profile: Optional[ClientProfile] = None):
        """
        Inicializa o sistema de alertas
        
        Args:
            client_profile: Perfil do cliente (para validar CFOP/CST esperados)
        """
        self.client_profile = client_profile
        self.alertas: List[AlertaQualidade] = []
        self._chaves_processadas: Set[str] = set()
        self._chaves_duplicadas: Set[str] = set()
    
    def analisar_documentos(
        self,
        documentos_xml: List[DocumentoFiscal],
        documentos_efd: List[DocumentoFiscal],
        matches: List[Any]  # Lista de MatchResult
    ) -> List[AlertaQualidade]:
        """
        Analisa documentos e gera alertas de qualidade
        
        Args:
            documentos_xml: Lista de documentos XML normalizados
            documentos_efd: Lista de documentos EFD normalizados
            matches: Lista de resultados de matching
            
        Returns:
            Lista de alertas gerados
        """
        self.alertas = []
        self._chaves_processadas = set()
        self._chaves_duplicadas = set()
        
        # 1. Detectar documentos sem chave no SPED
        self._detectar_sem_chave_sped(documentos_xml, matches)
        
        # 2. Detectar duplicidade de chave
        self._detectar_duplicidade_chave(documentos_efd)
        
        # 3. Detectar CFOP/CST inesperado
        if self.client_profile:
            self._detectar_cfop_cst_inesperado(documentos_xml, documentos_efd)
        
        logger.info(f"Alertas de qualidade gerados: {len(self.alertas)}")
        return self.alertas
    
    def _detectar_sem_chave_sped(
        self,
        documentos_xml: List[DocumentoFiscal],
        matches: List[Any]
    ):
        """Detecta documentos XML que não têm chave correspondente no SPED"""
        # Criar conjunto de chaves que foram matchadas
        chaves_matchadas = set()
        for match in matches:
            if match.matched and match.xml_doc.chave_acesso:
                chaves_matchadas.add(match.xml_doc.chave_acesso)
        
        # Verificar XMLs sem match
        for xml_doc in documentos_xml:
            if not xml_doc.is_valido():
                continue  # Ignorar canceladas/denegadas
            
            chave = xml_doc.chave_acesso
            if chave and chave not in chaves_matchadas:
                # Verificar se existe no SPED mas não matchou (score baixo)
                tem_no_sped_baixo_score = any(
                    m.xml_doc.chave_acesso == chave and not m.matched
                    for m in matches
                )
                
                if not tem_no_sped_baixo_score:
                    # Documento XML não encontrado no SPED
                    self.alertas.append(AlertaQualidade(
                        tipo='sem_chave',
                        severidade='warning',
                        mensagem=f"Documento XML não encontrado no SPED: {chave}",
                        chave_nfe=chave,
                        documento_xml=xml_doc,
                        detalhes={
                            'numero': xml_doc.numero,
                            'serie': xml_doc.serie,
                            'data_emissao': str(xml_doc.data_emissao) if xml_doc.data_emissao else None,
                            'valor_total': float(xml_doc.valor_total) if xml_doc.valor_total else None,
                        }
                    ))
    
    def _detectar_duplicidade_chave(self, documentos_efd: List[DocumentoFiscal]):
        """Detecta chaves duplicadas no SPED"""
        chaves_vistas: Dict[str, List[DocumentoFiscal]] = {}
        
        for doc in documentos_efd:
            chave = doc.chave_acesso
            if not chave:
                continue
            
            if chave not in chaves_vistas:
                chaves_vistas[chave] = []
            chaves_vistas[chave].append(doc)
        
        # Identificar duplicatas
        for chave, docs in chaves_vistas.items():
            if len(docs) > 1:
                self._chaves_duplicadas.add(chave)
                
                self.alertas.append(AlertaQualidade(
                    tipo='duplicidade',
                    severidade='critical',
                    mensagem=f"Chave NF-e duplicada no SPED: {chave} (aparece {len(docs)} vezes)",
                    chave_nfe=chave,
                    detalhes={
                        'quantidade': len(docs),
                        'documentos': [
                            {
                                'numero': d.numero,
                                'serie': d.serie,
                                'data_emissao': str(d.data_emissao) if d.data_emissao else None,
                                'valor_total': float(d.valor_total) if d.valor_total else None,
                            }
                            for d in docs
                        ]
                    }
                ))
    
    def _detectar_cfop_cst_inesperado(
        self,
        documentos_xml: List[DocumentoFiscal],
        documentos_efd: List[DocumentoFiscal]
    ):
        """Detecta CFOP/CST inesperados para o perfil do cliente"""
        if not self.client_profile:
            return
        
        segmento = self.client_profile.segmento
        if not segmento:
            return
        
        # CFOPs esperados por segmento (exemplo - pode ser expandido)
        cfops_esperados = {
            'COMERCIO': {'5102', '5109', '6102', '6109', '1201', '1202', '2201', '2202'},
            'BEBIDAS': {'5102', '5109', '6102', '6109', '1201', '1202', '2201', '2202'},
            'INDUSTRIA': {'5101', '5102', '6101', '6102', '1201', '1202', '2201', '2202'},
            'ECOMMERCE': {'5102', '5109', '6102', '6109', '1201', '1202', '2201', '2202'},
        }
        
        cfops_validos = cfops_esperados.get(segmento, set())
        
        # Verificar documentos XML
        for xml_doc in documentos_xml:
            if not xml_doc.is_valido():
                continue
            
            for item in xml_doc.itens:
                if item.cfop and item.cfop not in cfops_validos:
                    # Verificar se é CFOP de devolução/remessa (sempre válido)
                    if not self._is_cfop_especial(item.cfop):
                        self.alertas.append(AlertaQualidade(
                            tipo='cfop_inesperado',
                            severidade='info',
                            mensagem=f"CFOP {item.cfop} não é típico para segmento {segmento}",
                            chave_nfe=xml_doc.chave_acesso,
                            documento_xml=xml_doc,
                            detalhes={
                                'cfop': item.cfop,
                                'segmento': segmento,
                                'ncm': item.ncm,
                                'descricao': item.descricao[:50] if item.descricao else None,
                            }
                        ))
        
        # Verificar documentos EFD
        for efd_doc in documentos_efd:
            for item in efd_doc.itens:
                if item.cfop and item.cfop not in cfops_validos:
                    if not self._is_cfop_especial(item.cfop):
                        self.alertas.append(AlertaQualidade(
                            tipo='cfop_inesperado',
                            severidade='info',
                            mensagem=f"CFOP {item.cfop} não é típico para segmento {segmento}",
                            chave_nfe=efd_doc.chave_acesso,
                            documento_efd=efd_doc,
                            detalhes={
                                'cfop': item.cfop,
                                'segmento': segmento,
                                'ncm': item.ncm,
                                'descricao': item.descricao[:50] if item.descricao else None,
                            }
                        ))
    
    def _is_cfop_especial(self, cfop: str) -> bool:
        """Verifica se CFOP é especial (devolução, remessa, etc.) - sempre válido"""
        cfops_especiais = {
            # Devoluções
            '1201', '1202', '1203', '1204',
            '2201', '2202', '2203', '2204',
            '5201', '5202', '5203', '5204',
            '6201', '6202', '6203', '6204',
            # Remessas
            '1411', '2411', '5411', '6411',
            # Outros especiais
            '1949', '2949', '3949', '4949',  # Outras operações
        }
        return cfop in cfops_especiais
    
    def get_alertas_por_tipo(self) -> Dict[str, List[AlertaQualidade]]:
        """Agrupa alertas por tipo"""
        resultado: Dict[str, List[AlertaQualidade]] = {}
        for alerta in self.alertas:
            if alerta.tipo not in resultado:
                resultado[alerta.tipo] = []
            resultado[alerta.tipo].append(alerta)
        return resultado
    
    def get_estatisticas(self) -> Dict[str, Any]:
        """Retorna estatísticas dos alertas"""
        por_tipo = self.get_alertas_por_tipo()
        por_severidade = {
            'info': len([a for a in self.alertas if a.severidade == 'info']),
            'warning': len([a for a in self.alertas if a.severidade == 'warning']),
            'critical': len([a for a in self.alertas if a.severidade == 'critical']),
        }
        
        return {
            'total': len(self.alertas),
            'por_tipo': {tipo: len(alertas) for tipo, alertas in por_tipo.items()},
            'por_severidade': por_severidade,
            'chaves_duplicadas': len(self._chaves_duplicadas),
        }

