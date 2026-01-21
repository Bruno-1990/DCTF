"""
Documento Fiscal - Modelo Canônico
Representa um documento fiscal normalizado (NF-e, CT-e, etc.)
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from decimal import Decimal
from datetime import datetime
from .item_fiscal import ItemFiscal


@dataclass
class DocumentoFiscal:
    """Documento fiscal normalizado"""
    # Identificação
    chave_acesso: Optional[str] = None  # Chave NF-e (44 dígitos)
    numero: Optional[str] = None
    serie: Optional[str] = None
    modelo: Optional[str] = None  # 55 (NF-e), 57 (CT-e), etc.
    tipo_operacao: Optional[str] = None  # 0=Entrada, 1=Saída
    
    # Emitente/Destinatário
    cnpj_emitente: Optional[str] = None
    nome_emitente: Optional[str] = None
    uf_emitente: Optional[str] = None
    ie_emitente: Optional[str] = None
    
    cnpj_destinatario: Optional[str] = None
    nome_destinatario: Optional[str] = None
    uf_destinatario: Optional[str] = None
    ie_destinatario: Optional[str] = None
    
    # Datas
    data_emissao: Optional[datetime] = None
    data_saida_entrada: Optional[datetime] = None
    
    # Valores Totais
    valor_produtos: Decimal = Decimal('0.00')
    valor_frete: Decimal = Decimal('0.00')
    valor_seguro: Decimal = Decimal('0.00')
    valor_desconto: Decimal = Decimal('0.00')
    valor_outros: Decimal = Decimal('0.00')
    valor_ii: Decimal = Decimal('0.00')
    valor_ipi: Decimal = Decimal('0.00')
    valor_icms: Decimal = Decimal('0.00')
    valor_icms_st: Decimal = Decimal('0.00')
    valor_difal: Decimal = Decimal('0.00')
    valor_fcp: Decimal = Decimal('0.00')
    valor_total: Decimal = Decimal('0.00')
    
    # Itens
    itens: List[ItemFiscal] = field(default_factory=list)
    
    # Status e Situação
    situacao: Optional[str] = None  # Normal, Cancelada, Denegada, Inutilizada
    cod_sit: Optional[str] = None  # Código de situação do SPED
    
    # Ajustes e Referências
    ajustes: List[Dict[str, Any]] = field(default_factory=list)  # Ajustes C197/E111
    referencia_sped: Optional[str] = None  # Referência ao registro C100
    referencia_xml: Optional[str] = None  # Caminho do arquivo XML original
    
    # Metadados
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def calcular_valor_total(self) -> Decimal:
        """Calcula o valor total do documento considerando todos os componentes"""
        return (
            self.valor_produtos
            + self.valor_frete
            + self.valor_seguro
            + self.valor_outros
            + self.valor_ii
            + self.valor_ipi
            + self.valor_icms_st
            - self.valor_desconto
        )
    
    def get_valor_tributos(self) -> Decimal:
        """Retorna o valor total de tributos do documento"""
        return (
            self.valor_icms
            + self.valor_icms_st
            + self.valor_ipi
            + self.valor_difal
            + self.valor_fcp
        )
    
    def get_total_itens(self) -> Decimal:
        """Retorna a soma dos valores totais dos itens"""
        return sum(item.calcular_valor_total() for item in self.itens)
    
    def is_cancelado(self) -> bool:
        """Verifica se o documento está cancelado"""
        return self.situacao and 'cancel' in self.situacao.lower()
    
    def is_denegado(self) -> bool:
        """Verifica se o documento está denegado"""
        return self.situacao and 'deneg' in self.situacao.lower()
    
    def is_inutilizado(self) -> bool:
        """Verifica se o documento está inutilizado"""
        return self.situacao and 'inutil' in self.situacao.lower()
    
    def is_valido(self) -> bool:
        """Verifica se o documento é válido (não cancelado/denegado/inutilizado)"""
        return not (self.is_cancelado() or self.is_denegado() or self.is_inutilizado())
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte o documento para dicionário"""
        return {
            'chave_acesso': self.chave_acesso,
            'numero': self.numero,
            'serie': self.serie,
            'modelo': self.modelo,
            'tipo_operacao': self.tipo_operacao,
            'cnpj_emitente': self.cnpj_emitente,
            'nome_emitente': self.nome_emitente,
            'cnpj_destinatario': self.cnpj_destinatario,
            'nome_destinatario': self.nome_destinatario,
            'data_emissao': self.data_emissao.isoformat() if self.data_emissao else None,
            'data_saida_entrada': self.data_saida_entrada.isoformat() if self.data_saida_entrada else None,
            'valor_produtos': float(self.valor_produtos),
            'valor_total': float(self.valor_total),
            'situacao': self.situacao,
            'itens': [item.to_dict() for item in self.itens],
            'metadata': self.metadata,
        }








