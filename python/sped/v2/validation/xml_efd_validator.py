"""
XML × EFD Validator - Confronto Conceitual
Compara documentos XML e EFD de forma conceitual, não campo a campo.
Considera contexto fiscal (CFOP, CST, finalidade) para detectar divergências.
"""

from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
from dataclasses import dataclass, field
import logging

from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.item_fiscal import ItemFiscal

logger = logging.getLogger(__name__)

# Tolerância para comparações de valores (2%)
TOLERANCIA_VALOR = Decimal('0.02')


@dataclass
class Divergencia:
    """Representa uma divergência encontrada entre XML e EFD"""
    tipo: str  # 'valor', 'quantidade', 'tributo', 'item_ausente', 'operacao_ausente', 'contexto'
    nivel: str  # 'documento' ou 'item'
    severidade: str  # 'alta', 'media', 'baixa'
    descricao: str
    valor_xml: Optional[Decimal] = None
    valor_efd: Optional[Decimal] = None
    diferenca: Optional[Decimal] = None
    percentual_diferenca: Optional[Decimal] = None
    contexto: Dict[str, Any] = field(default_factory=dict)
    item_xml: Optional[ItemFiscal] = None
    item_efd: Optional[ItemFiscal] = None
    documento_xml: Optional[DocumentoFiscal] = None
    documento_efd: Optional[DocumentoFiscal] = None


@dataclass
class ResultadoValidacao:
    """Resultado da validação conceitual XML × EFD"""
    documentos_validados: int = 0
    divergencias: List[Divergencia] = field(default_factory=list)
    documentos_sem_match: List[DocumentoFiscal] = field(default_factory=list)
    operacoes_efd_sem_xml: List[DocumentoFiscal] = field(default_factory=list)
    score_concordancia: Decimal = Decimal('0.00')  # 0-100
    resumo: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'documentos_validados': self.documentos_validados,
            'total_divergencias': len(self.divergencias),
            'divergencias_por_tipo': self._contar_divergencias_por_tipo(),
            'divergencias_por_severidade': self._contar_divergencias_por_severidade(),
            'score_concordancia': float(self.score_concordancia),
            'documentos_sem_match': len(self.documentos_sem_match),
            'operacoes_efd_sem_xml': len(self.operacoes_efd_sem_xml),
            'resumo': self.resumo,
        }
    
    def _contar_divergencias_por_tipo(self) -> Dict[str, int]:
        """Conta divergências por tipo"""
        contador: Dict[str, int] = {}
        for div in self.divergencias:
            contador[div.tipo] = contador.get(div.tipo, 0) + 1
        return contador
    
    def _contar_divergencias_por_severidade(self) -> Dict[str, int]:
        """Conta divergências por severidade"""
        contador: Dict[str, int] = {}
        for div in self.divergencias:
            contador[div.severidade] = contador.get(div.severidade, 0) + 1
        return contador


class XmlEfdValidator:
    """Validador conceitual XML × EFD"""
    
    def __init__(self, tolerancia: Decimal = TOLERANCIA_VALOR):
        """
        Inicializa o validador
        
        Args:
            tolerancia: Tolerância para comparações de valores (padrão: 2%)
        """
        self.tolerancia = tolerancia
    
    def validar(
        self,
        documentos_xml: List[DocumentoFiscal],
        documentos_efd: List[DocumentoFiscal],
        matches: Optional[Dict[str, str]] = None
    ) -> ResultadoValidacao:
        """
        Valida documentos XML contra EFD de forma conceitual
        
        Args:
            documentos_xml: Lista de documentos XML normalizados
            documentos_efd: Lista de documentos EFD normalizados
            matches: Dicionário {chave_xml: chave_efd} para matching de documentos
        
        Returns:
            ResultadoValidacao com divergências encontradas
        """
        resultado = ResultadoValidacao()
        
        # Criar índice de documentos EFD por chave
        efd_index: Dict[str, DocumentoFiscal] = {}
        for doc_efd in documentos_efd:
            if doc_efd.chave_acesso:
                efd_index[doc_efd.chave_acesso] = doc_efd
        
        # Processar cada documento XML
        documentos_processados = 0
        for doc_xml in documentos_xml:
            if not doc_xml.is_valido():
                continue  # Pular documentos cancelados/denegados
            
            # Encontrar documento EFD correspondente
            doc_efd = None
            if matches and doc_xml.chave_acesso in matches:
                chave_efd = matches[doc_xml.chave_acesso]
                doc_efd = efd_index.get(chave_efd)
            elif doc_xml.chave_acesso:
                doc_efd = efd_index.get(doc_xml.chave_acesso)
            
            if doc_efd:
                # Validar documento encontrado
                divergencias_doc = self._validar_documento(doc_xml, doc_efd)
                resultado.divergencias.extend(divergencias_doc)
                documentos_processados += 1
            else:
                # Documento XML sem correspondência no EFD
                resultado.documentos_sem_match.append(doc_xml)
                resultado.divergencias.append(Divergencia(
                    tipo='operacao_ausente',
                    nivel='documento',
                    severidade='alta',
                    descricao=f'Documento XML {doc_xml.chave_acesso} não encontrado no EFD',
                    documento_xml=doc_xml
                ))
        
        # Identificar operações EFD sem XML correspondente
        xml_chaves = {doc.chave_acesso for doc in documentos_xml if doc.chave_acesso}
        for doc_efd in documentos_efd:
            if doc_efd.chave_acesso and doc_efd.chave_acesso not in xml_chaves:
                resultado.operacoes_efd_sem_xml.append(doc_efd)
                resultado.divergencias.append(Divergencia(
                    tipo='operacao_ausente',
                    nivel='documento',
                    severidade='media',
                    descricao=f'Operação EFD {doc_efd.chave_acesso} sem XML correspondente',
                    documento_efd=doc_efd
                ))
        
        resultado.documentos_validados = documentos_processados
        
        # Calcular score de concordância
        resultado.score_concordancia = self._calcular_score_concordancia(resultado)
        
        # Gerar resumo
        resultado.resumo = self._gerar_resumo(resultado)
        
        return resultado
    
    def _validar_documento(
        self,
        doc_xml: DocumentoFiscal,
        doc_efd: DocumentoFiscal
    ) -> List[Divergencia]:
        """
        Valida um documento XML contra seu correspondente EFD
        
        Args:
            doc_xml: Documento XML normalizado
            doc_efd: Documento EFD normalizado
        
        Returns:
            Lista de divergências encontradas
        """
        divergencias: List[Divergencia] = []
        
        # 1. Validação conceitual de valores totais
        divergencias.extend(self._validar_valores_totais(doc_xml, doc_efd))
        
        # 2. Validação de contexto fiscal (CFOP, CST, finalidade)
        divergencias.extend(self._validar_contexto_fiscal(doc_xml, doc_efd))
        
        # 3. Validação de tipos de tributos
        divergencias.extend(self._validar_tributos(doc_xml, doc_efd))
        
        # 4. Validação conceitual de itens
        divergencias.extend(self._validar_itens(doc_xml, doc_efd))
        
        return divergencias
    
    def _validar_valores_totais(
        self,
        doc_xml: DocumentoFiscal,
        doc_efd: DocumentoFiscal
    ) -> List[Divergencia]:
        """Valida valores totais de forma conceitual"""
        divergencias: List[Divergencia] = []
        
        # Valor total (conceitual: soma de produtos + tributos - descontos)
        valor_total_xml = doc_xml.calcular_valor_total()
        valor_total_efd = doc_efd.calcular_valor_total()
        
        if not self._valores_concordam(valor_total_xml, valor_total_efd):
            diferenca = abs(valor_total_xml - valor_total_efd)
            percentual = (diferenca / valor_total_xml * 100) if valor_total_xml > 0 else Decimal('0')
            
            divergencias.append(Divergencia(
                tipo='valor',
                nivel='documento',
                severidade='alta' if percentual > 5 or diferenca > Decimal('10.00') else 'media',
                descricao=f'Divergência no valor total do documento: XML={valor_total_xml}, EFD={valor_total_efd}',
                valor_xml=valor_total_xml,
                valor_efd=valor_total_efd,
                diferenca=diferenca,
                percentual_diferenca=percentual,
                documento_xml=doc_xml,
                documento_efd=doc_efd,
                contexto={'campo': 'valor_total'}
            ))
        
        # Valor de produtos
        if not self._valores_concordam(doc_xml.valor_produtos, doc_efd.valor_produtos):
            diferenca = abs(doc_xml.valor_produtos - doc_efd.valor_produtos)
            percentual = (diferenca / doc_xml.valor_produtos * 100) if doc_xml.valor_produtos > 0 else Decimal('0')
            
            divergencias.append(Divergencia(
                tipo='valor',
                nivel='documento',
                severidade='alta' if diferenca > Decimal('10.00') else 'media' if percentual > 3 else 'baixa',
                descricao=f'Divergência no valor de produtos: XML={doc_xml.valor_produtos}, EFD={doc_efd.valor_produtos}',
                valor_xml=doc_xml.valor_produtos,
                valor_efd=doc_efd.valor_produtos,
                diferenca=diferenca,
                percentual_diferenca=percentual,
                documento_xml=doc_xml,
                documento_efd=doc_efd,
                contexto={'campo': 'valor_produtos'}
            ))
        
        # Valor de descontos
        if not self._valores_concordam(doc_xml.valor_desconto, doc_efd.valor_desconto):
            diferenca = abs(doc_xml.valor_desconto - doc_efd.valor_desconto)
            if diferenca > Decimal('0.10'):  # Só reportar se diferença > R$ 0,10
                divergencias.append(Divergencia(
                    tipo='valor',
                    nivel='documento',
                    severidade='media' if diferenca > Decimal('1.00') else 'baixa',
                    descricao=f'Divergência no valor de descontos: XML={doc_xml.valor_desconto}, EFD={doc_efd.valor_desconto}',
                    valor_xml=doc_xml.valor_desconto,
                    valor_efd=doc_efd.valor_desconto,
                    diferenca=diferenca,
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'campo': 'valor_desconto'}
                ))
        
        return divergencias
    
    def _validar_contexto_fiscal(
        self,
        doc_xml: DocumentoFiscal,
        doc_efd: DocumentoFiscal
    ) -> List[Divergencia]:
        """Valida contexto fiscal (CFOP, CST, finalidade)"""
        divergencias: List[Divergencia] = []
        
        # Verificar se há itens com CFOPs diferentes
        cfops_xml = {item.cfop for item in doc_xml.itens if item.cfop}
        cfops_efd = {item.cfop for item in doc_efd.itens if item.cfop}
        
        if cfops_xml != cfops_efd:
            cfops_apenas_xml = cfops_xml - cfops_efd
            cfops_apenas_efd = cfops_efd - cfops_xml
            
            if cfops_apenas_xml:
                divergencias.append(Divergencia(
                    tipo='contexto',
                    nivel='documento',
                    severidade='media',
                    descricao=f'CFOPs no XML não encontrados no EFD: {", ".join(cfops_apenas_xml)}',
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'cfops_xml': list(cfops_apenas_xml), 'cfops_efd': list(cfops_efd)}
                ))
            
            if cfops_apenas_efd:
                divergencias.append(Divergencia(
                    tipo='contexto',
                    nivel='documento',
                    severidade='media',
                    descricao=f'CFOPs no EFD não encontrados no XML: {", ".join(cfops_apenas_efd)}',
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'cfops_xml': list(cfops_xml), 'cfops_efd': list(cfops_apenas_efd)}
                ))
        
        return divergencias
    
    def _validar_tributos(
        self,
        doc_xml: DocumentoFiscal,
        doc_efd: DocumentoFiscal
    ) -> List[Divergencia]:
        """Valida tipos de tributos de forma conceitual - comparação de valores"""
        divergencias: List[Divergencia] = []
        
        # Comparar ICMS próprio (valor, não apenas presença)
        if not self._valores_concordam(doc_xml.valor_icms, doc_efd.valor_icms):
            diferenca = abs(doc_xml.valor_icms - doc_efd.valor_icms)
            if diferenca > Decimal('0.01'):  # Só reportar se diferença > R$ 0,01
                percentual = (diferenca / doc_xml.valor_icms * 100) if doc_xml.valor_icms > 0 else Decimal('0')
                divergencias.append(Divergencia(
                    tipo='tributo',
                    nivel='documento',
                    severidade='alta' if diferenca > Decimal('1.00') else 'media',
                    descricao=f'Divergência no valor de ICMS próprio: XML={doc_xml.valor_icms}, EFD={doc_efd.valor_icms}',
                    valor_xml=doc_xml.valor_icms,
                    valor_efd=doc_efd.valor_icms,
                    diferenca=diferenca,
                    percentual_diferenca=percentual,
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'tributo': 'ICMS', 'campo': 'valor_icms'}
                ))
        
        # Comparar ICMS ST (valor, não apenas presença)
        if not self._valores_concordam(doc_xml.valor_icms_st, doc_efd.valor_icms_st):
            diferenca = abs(doc_xml.valor_icms_st - doc_efd.valor_icms_st)
            if diferenca > Decimal('0.01'):  # Só reportar se diferença > R$ 0,01
                percentual = (diferenca / doc_xml.valor_icms_st * 100) if doc_xml.valor_icms_st > 0 else Decimal('0')
                divergencias.append(Divergencia(
                    tipo='tributo',
                    nivel='documento',
                    severidade='alta' if diferenca > Decimal('1.00') else 'media',
                    descricao=f'Divergência no valor de ICMS ST: XML={doc_xml.valor_icms_st}, EFD={doc_efd.valor_icms_st}',
                    valor_xml=doc_xml.valor_icms_st,
                    valor_efd=doc_efd.valor_icms_st,
                    diferenca=diferenca,
                    percentual_diferenca=percentual,
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'tributo': 'ICMS_ST', 'campo': 'valor_icms_st'}
                ))
        
        # Comparar DIFAL/FCP (valor, não apenas presença)
        valor_difal_fcp_xml = doc_xml.valor_difal + doc_xml.valor_fcp
        valor_difal_fcp_efd = doc_efd.valor_difal + doc_efd.valor_fcp
        
        if not self._valores_concordam(valor_difal_fcp_xml, valor_difal_fcp_efd):
            diferenca = abs(valor_difal_fcp_xml - valor_difal_fcp_efd)
            if diferenca > Decimal('0.01'):  # Só reportar se diferença > R$ 0,01
                percentual = (diferenca / valor_difal_fcp_xml * 100) if valor_difal_fcp_xml > 0 else Decimal('0')
                divergencias.append(Divergencia(
                    tipo='tributo',
                    nivel='documento',
                    severidade='alta' if diferenca > Decimal('1.00') else 'media',
                    descricao=f'Divergência no valor de DIFAL/FCP: XML={valor_difal_fcp_xml}, EFD={valor_difal_fcp_efd}',
                    valor_xml=valor_difal_fcp_xml,
                    valor_efd=valor_difal_fcp_efd,
                    diferenca=diferenca,
                    percentual_diferenca=percentual,
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'tributo': 'DIFAL_FCP', 'campo': 'valor_difal_fcp'}
                ))
        
        # Comparar IPI
        if not self._valores_concordam(doc_xml.valor_ipi, doc_efd.valor_ipi):
            diferenca = abs(doc_xml.valor_ipi - doc_efd.valor_ipi)
            if diferenca > Decimal('0.01'):
                percentual = (diferenca / doc_xml.valor_ipi * 100) if doc_xml.valor_ipi > 0 else Decimal('0')
                divergencias.append(Divergencia(
                    tipo='tributo',
                    nivel='documento',
                    severidade='alta' if diferenca > Decimal('1.00') else 'media',
                    descricao=f'Divergência no valor de IPI: XML={doc_xml.valor_ipi}, EFD={doc_efd.valor_ipi}',
                    valor_xml=doc_xml.valor_ipi,
                    valor_efd=doc_efd.valor_ipi,
                    diferenca=diferenca,
                    percentual_diferenca=percentual,
                    documento_xml=doc_xml,
                    documento_efd=doc_efd,
                    contexto={'tributo': 'IPI', 'campo': 'valor_ipi'}
                ))
        
        return divergencias
    
    def _validar_itens(
        self,
        doc_xml: DocumentoFiscal,
        doc_efd: DocumentoFiscal
    ) -> List[Divergencia]:
        """Valida itens de forma conceitual - comparação item por item"""
        divergencias: List[Divergencia] = []
        
        # Comparar quantidade de itens
        qtd_itens_xml = len(doc_xml.itens)
        qtd_itens_efd = len(doc_efd.itens)
        
        if qtd_itens_xml != qtd_itens_efd:
            divergencias.append(Divergencia(
                tipo='quantidade',
                nivel='documento',
                severidade='alta',
                descricao=f'Divergência na quantidade de itens: XML tem {qtd_itens_xml}, EFD tem {qtd_itens_efd}',
                documento_xml=doc_xml,
                documento_efd=doc_efd,
                contexto={'qtd_itens_xml': qtd_itens_xml, 'qtd_itens_efd': qtd_itens_efd}
            ))
        
        # Comparar valor total dos itens
        valor_total_itens_xml = doc_xml.get_total_itens()
        valor_total_itens_efd = doc_efd.get_total_itens()
        
        if not self._valores_concordam(valor_total_itens_xml, valor_total_itens_efd):
            diferenca = abs(valor_total_itens_xml - valor_total_itens_efd)
            percentual = (diferenca / valor_total_itens_xml * 100) if valor_total_itens_xml > 0 else Decimal('0')
            
            divergencias.append(Divergencia(
                tipo='valor',
                nivel='documento',
                severidade='alta' if percentual > 5 else 'media' if percentual > 1 else 'baixa',
                descricao=f'Divergência no valor total dos itens: XML={valor_total_itens_xml}, EFD={valor_total_itens_efd}',
                valor_xml=valor_total_itens_xml,
                valor_efd=valor_total_itens_efd,
                diferenca=diferenca,
                percentual_diferenca=percentual,
                documento_xml=doc_xml,
                documento_efd=doc_efd,
                contexto={'campo': 'valor_total_itens'}
            ))
        
        # Comparar item por item (se tiverem mesma quantidade)
        if qtd_itens_xml == qtd_itens_efd and qtd_itens_xml > 0:
            # Criar índice de itens EFD por número
            itens_efd_por_numero = {item.numero_item: item for item in doc_efd.itens if item.numero_item}
            
            for item_xml in doc_xml.itens:
                if not item_xml.numero_item:
                    continue
                
                item_efd = itens_efd_por_numero.get(item_xml.numero_item)
                if not item_efd:
                    # Item XML sem correspondência no EFD
                    divergencias.append(Divergencia(
                        tipo='item_ausente',
                        nivel='item',
                        severidade='alta',
                        descricao=f'Item {item_xml.numero_item} do XML não encontrado no EFD',
                        item_xml=item_xml,
                        documento_xml=doc_xml,
                        documento_efd=doc_efd,
                        contexto={'numero_item': item_xml.numero_item}
                    ))
                    continue
                
                # Comparar valores do item
                if not self._valores_concordam(item_xml.valor_total, item_efd.valor_total):
                    diferenca = abs(item_xml.valor_total - item_efd.valor_total)
                    percentual = (diferenca / item_xml.valor_total * 100) if item_xml.valor_total > 0 else Decimal('0')
                    
                    divergencias.append(Divergencia(
                        tipo='valor',
                        nivel='item',
                        severidade='alta' if diferenca > Decimal('10.00') else 'media',
                        descricao=f'Divergência no valor do item {item_xml.numero_item}: XML={item_xml.valor_total}, EFD={item_efd.valor_total}',
                        valor_xml=item_xml.valor_total,
                        valor_efd=item_efd.valor_total,
                        diferenca=diferenca,
                        percentual_diferenca=percentual,
                        item_xml=item_xml,
                        item_efd=item_efd,
                        documento_xml=doc_xml,
                        documento_efd=doc_efd,
                        contexto={'campo': 'valor_item', 'numero_item': item_xml.numero_item}
                    ))
                
                # Comparar CFOP do item
                if item_xml.cfop and item_efd.cfop and item_xml.cfop != item_efd.cfop:
                    divergencias.append(Divergencia(
                        tipo='contexto',
                        nivel='item',
                        severidade='alta',
                        descricao=f'Divergência no CFOP do item {item_xml.numero_item}: XML={item_xml.cfop}, EFD={item_efd.cfop}',
                        item_xml=item_xml,
                        item_efd=item_efd,
                        documento_xml=doc_xml,
                        documento_efd=doc_efd,
                        contexto={'campo': 'cfop', 'numero_item': item_xml.numero_item, 'cfop_xml': item_xml.cfop, 'cfop_efd': item_efd.cfop}
                    ))
                
                # Comparar ICMS do item
                if item_xml.icms and item_efd.icms:
                    if not self._valores_concordam(item_xml.icms.valor, item_efd.icms.valor):
                        diferenca = abs(item_xml.icms.valor - item_efd.icms.valor)
                        divergencias.append(Divergencia(
                            tipo='tributo',
                            nivel='item',
                            severidade='alta' if diferenca > Decimal('1.00') else 'media',
                            descricao=f'Divergência no ICMS do item {item_xml.numero_item}: XML={item_xml.icms.valor}, EFD={item_efd.icms.valor}',
                            valor_xml=item_xml.icms.valor,
                            valor_efd=item_efd.icms.valor,
                            diferenca=diferenca,
                            item_xml=item_xml,
                            item_efd=item_efd,
                            documento_xml=doc_xml,
                            documento_efd=doc_efd,
                            contexto={'campo': 'icms', 'numero_item': item_xml.numero_item, 'tributo': 'ICMS'}
                        ))
                
                # Comparar ICMS ST do item
                if item_xml.icms_st and item_efd.icms_st:
                    if not self._valores_concordam(item_xml.icms_st.valor_st, item_efd.icms_st.valor_st):
                        diferenca = abs(item_xml.icms_st.valor_st - item_efd.icms_st.valor_st)
                        divergencias.append(Divergencia(
                            tipo='tributo',
                            nivel='item',
                            severidade='alta' if diferenca > Decimal('1.00') else 'media',
                            descricao=f'Divergência no ICMS ST do item {item_xml.numero_item}: XML={item_xml.icms_st.valor_st}, EFD={item_efd.icms_st.valor_st}',
                            valor_xml=item_xml.icms_st.valor_st,
                            valor_efd=item_efd.icms_st.valor_st,
                            diferenca=diferenca,
                            item_xml=item_xml,
                            item_efd=item_efd,
                            documento_xml=doc_xml,
                            documento_efd=doc_efd,
                            contexto={'campo': 'icms_st', 'numero_item': item_xml.numero_item, 'tributo': 'ICMS_ST'}
                        ))
        
        return divergencias
    
    def _valores_concordam(self, valor1: Decimal, valor2: Decimal) -> bool:
        """
        Verifica se dois valores concordam dentro da tolerância
        
        Args:
            valor1: Primeiro valor
            valor2: Segundo valor
        
        Returns:
            True se os valores concordam, False caso contrário
        """
        if valor1 == Decimal('0') and valor2 == Decimal('0'):
            return True
        
        if valor1 == Decimal('0') or valor2 == Decimal('0'):
            return False
        
        diferenca_percentual = abs((valor1 - valor2) / valor1)
        return diferenca_percentual <= self.tolerancia
    
    def _calcular_score_concordancia(self, resultado: ResultadoValidacao) -> Decimal:
        """
        Calcula score de concordância (0-100)
        
        Args:
            resultado: Resultado da validação
        
        Returns:
            Score de concordância
        """
        if resultado.documentos_validados == 0:
            return Decimal('0.00')
        
        # Penalizar por divergências
        penalizacao = Decimal('0.00')
        for div in resultado.divergencias:
            if div.severidade == 'alta':
                penalizacao += Decimal('5.00')
            elif div.severidade == 'media':
                penalizacao += Decimal('2.00')
            else:
                penalizacao += Decimal('1.00')
        
        # Penalizar por documentos sem match
        penalizacao += len(resultado.documentos_sem_match) * Decimal('10.00')
        
        # Score base
        score_base = Decimal('100.00')
        score_final = max(Decimal('0.00'), score_base - penalizacao)
        
        return score_final
    
    def _gerar_resumo(self, resultado: ResultadoValidacao) -> Dict[str, Any]:
        """Gera resumo da validação"""
        return {
            'total_documentos_xml': len(resultado.documentos_sem_match) + resultado.documentos_validados,
            'total_documentos_efd': len(resultado.operacoes_efd_sem_xml) + resultado.documentos_validados,
            'documentos_validados': resultado.documentos_validados,
            'documentos_sem_match': len(resultado.documentos_sem_match),
            'operacoes_efd_sem_xml': len(resultado.operacoes_efd_sem_xml),
            'total_divergencias': len(resultado.divergencias),
            'divergencias_por_tipo': resultado._contar_divergencias_por_tipo(),
            'divergencias_por_severidade': resultado._contar_divergencias_por_severidade(),
            'score_concordancia': float(resultado.score_concordancia),
        }

