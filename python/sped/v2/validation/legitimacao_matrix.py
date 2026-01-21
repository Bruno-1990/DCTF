"""
Matriz de Legitimação - Classificador de Divergências
Implementa regras do roteiro para classificar divergências como ERRO/REVISAR/LEGÍTIMO
"""

from typing import Dict, Any, Optional, List, Tuple
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum

from ..canonical.documento_fiscal import DocumentoFiscal
from ..canonical.item_fiscal import ItemFiscal
from .regras_segmento import RegrasPorSegmento


class ClassificacaoDivergencia(Enum):
    """Classificação da divergência"""
    ERRO = "ERRO"
    REVISAR = "REVISAR"
    LEGITIMO = "LEGÍTIMO"


@dataclass
class ContextoFiscal:
    """Contexto fiscal para análise de legitimação"""
    cfop: Optional[str] = None
    cst: Optional[str] = None
    csosn: Optional[str] = None
    tem_st: bool = False
    tem_difal: bool = False
    tem_fcp: bool = False
    finalidade_nfe: Optional[str] = None  # 1=normal, 2=complementar, 3=ajuste, 4=devolução
    tp_nf: Optional[str] = None  # 0=entrada, 1=saída
    cod_sit: Optional[str] = None  # Código de situação do SPED
    tem_ajuste_c197: bool = False
    tem_ajuste_e111: bool = False
    segmento: Optional[str] = None  # COMERCIO, BEBIDAS, INDUSTRIA, ECOMMERCE
    regime: Optional[str] = None  # SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL
    opera_st: bool = False
    opera_difal: bool = False


class MatrizLegitimacao:
    """Matriz de legitimação para classificar divergências"""
    
    # CFOPs de devolução
    CFOPS_DEVOLUCAO = {
        '1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208', '1209', '1210',
        '2201', '2202', '2203', '2204', '2205', '2206', '2207', '2208', '2209', '2210',
        '1410', '1411', '1414', '1415', '2501', '2502', '2503', '2504', '2505', '2506',
        '3503', '3504', '3505', '3506', '3507', '3508', '3509', '3510', '3511', '3512',
        '5503', '5504', '5505', '5506', '5507', '5508', '5509', '5510', '5511', '5512',
        '5910', '5911', '5912', '5913', '5914', '5915', '5916', '5917', '5918', '5919',
        '5920', '5921', '5922', '5923', '5924', '5925', '5926', '5927', '5928', '5929',
        '5930', '5931', '5932', '5933', '5934', '5935', '5936', '5937', '5938', '5939',
    }
    
    # CFOPs de remessa/bonificação/amostra
    CFOPS_REMESSA = {
        '1101', '1102', '1410', '1411', '1414', '1415', '1923', '1924', '2923', '2924',
        '3949', '4949', '5949', '6949', '7949',
    }
    
    # CSTs de ST (Substituição Tributária)
    CSTS_ST = {'60', '500', '900'}  # CST 60 e CSOSN 500/900
    
    def __init__(self):
        """Inicializa a matriz de legitimação"""
        pass
    
    def extrair_contexto_fiscal(
        self,
        doc_xml: Optional[DocumentoFiscal],
        doc_efd: Optional[DocumentoFiscal],
        perfil_fiscal: Optional[Dict[str, Any]] = None
    ) -> ContextoFiscal:
        """
        Extrai contexto fiscal de documentos XML e EFD
        
        Args:
            doc_xml: Documento XML normalizado
            doc_efd: Documento EFD normalizado
            perfil_fiscal: Perfil fiscal do cliente (segmento, regime, flags)
        
        Returns:
            ContextoFiscal com informações extraídas
        """
        contexto = ContextoFiscal()
        
        # Extrair de XML (prioridade)
        if doc_xml:
            # CFOPs dos itens
            cfops = {item.cfop for item in doc_xml.itens if item.cfop}
            if cfops:
                contexto.cfop = list(cfops)[0]  # Usar primeiro CFOP encontrado
            
            # CST/CSOSN dos itens
            csts = set()
            for item in doc_xml.itens:
                if item.icms:
                    csts.add(item.icms.cst or item.icms.csosn or '')
                if item.icms_st:
                    contexto.tem_st = True
                    csts.add(item.icms_st.cst or '')
            if csts:
                contexto.cst = list(csts)[0]
            
            # DIFAL/FCP
            contexto.tem_difal = doc_xml.valor_difal > 0
            contexto.tem_fcp = doc_xml.valor_fcp > 0
            
            # Finalidade e tipo NF (do metadata se disponível)
            contexto.finalidade_nfe = doc_xml.metadata.get('finalidade')
            contexto.tp_nf = doc_xml.metadata.get('tpNF')
        
        # Extrair de EFD (complementar)
        if doc_efd:
            # CFOPs dos itens EFD
            cfops_efd = {item.cfop for item in doc_efd.itens if item.cfop}
            if cfops_efd and not contexto.cfop:
                contexto.cfop = list(cfops_efd)[0]
            
            # ST do EFD
            if doc_efd.valor_icms_st > 0:
                contexto.tem_st = True
            
            # DIFAL/FCP do EFD
            if doc_efd.valor_difal > 0:
                contexto.tem_difal = True
            if doc_efd.valor_fcp > 0:
                contexto.tem_fcp = True
            
            # Código de situação
            contexto.cod_sit = doc_efd.metadata.get('cod_sit')
        
        # Perfil fiscal do cliente
        if perfil_fiscal:
            contexto.segmento = perfil_fiscal.get('segmento')
            contexto.regime = perfil_fiscal.get('regime')
            contexto.opera_st = perfil_fiscal.get('operaST', False)
            contexto.opera_difal = perfil_fiscal.get('operaInterestadualDIFAL', False)
        
        return contexto
    
    def classificar_divergencia(
        self,
        tipo_divergencia: str,
        contexto: ContextoFiscal,
        diferenca: Decimal,
        percentual_diferenca: Decimal,
        tem_ajuste: bool = False
    ) -> Tuple[ClassificacaoDivergencia, int, str]:
        """
        Classifica uma divergência baseado no contexto fiscal
        
        Args:
            tipo_divergencia: Tipo da divergência ('valor', 'tributo', 'quantidade', etc.)
            contexto: Contexto fiscal extraído
            diferenca: Diferença absoluta
            percentual_diferenca: Diferença percentual
            tem_ajuste: Se existe ajuste C197/E111 relacionado
        
        Returns:
            Tupla (classificacao, score_confianca, explicacao)
        """
        score = 0
        explicacao_parts = []
        
        # Base: match por chave (assumindo que chegou aqui, há match)
        score += 40  # Match forte
        
        # Penalizar por ajustes explicativos
        if tem_ajuste:
            score -= 30
            explicacao_parts.append("Existe ajuste C197/E111 que pode explicar")
        
        # Análise por tipo de divergência
        if tipo_divergencia == 'tributo':
            # Divergência de tributo
            if contexto.tem_st:
                # Operação ST: não comparar BC própria
                if 'ICMS' in tipo_divergencia and not 'ST' in tipo_divergencia:
                    score -= 20
                    explicacao_parts.append("Operação ST: ICMS próprio pode ser zero")
                    return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
            
            # DIFAL/FCP
            if contexto.tem_difal or contexto.tem_fcp:
                score += 10
                explicacao_parts.append("Operação com DIFAL/FCP")
        
        # Análise por CFOP
        if contexto.cfop:
            cfop = str(contexto.cfop)
            cst = str(contexto.cst or contexto.csosn or '')
            
            # Validar coerência CFOP × CST × Segmento × Regime
            is_valid_cfop_cst, msg_cfop_cst = RegrasPorSegmento.validar_cfop_cst(
                cfop, cst, contexto.segmento, contexto.regime
            )
            if not is_valid_cfop_cst:
                score += 20  # Incoerência CFOP×CST é forte indicador de erro
                explicacao_parts.append(msg_cfop_cst)
            
            # Verificar se é operação especial
            is_especial, tipo_especial = RegrasPorSegmento.is_operacao_especial(cfop)
            if is_especial:
                score -= 20
                explicacao_parts.append(f"Operação especial ({tipo_especial}): {cfop}")
                
                # Operações especiais com ajuste são legítimas
                if tem_ajuste:
                    return (ClassificacaoDivergencia.LEGITIMO, max(0, score), "; ".join(explicacao_parts))
                else:
                    return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
            
            # Devolução
            if cfop in self.CFOPS_DEVOLUCAO:
                score -= 20
                explicacao_parts.append(f"CFOP {cfop} de devolução")
                if tem_ajuste:
                    return (ClassificacaoDivergencia.LEGITIMO, max(0, score), "; ".join(explicacao_parts))
                else:
                    return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
            
            # Remessa/Bonificação
            if cfop in self.CFOPS_REMESSA:
                score -= 15
                explicacao_parts.append(f"CFOP {cfop} de remessa/bonificação")
                return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
        
        # Nota complementar/ajuste
        if contexto.finalidade_nfe in ('2', '3', '4'):  # Complementar, ajuste, devolução
            score -= 20
            explicacao_parts.append(f"Nota {self._get_finalidade_nome(contexto.finalidade_nfe)}")
            return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
        
        # Ajustar tolerância por segmento
        tolerancia_segmento = RegrasPorSegmento.get_tolerancia_por_segmento(contexto.segmento)
        if abs(diferenca) <= tolerancia_segmento:
            score -= 30
            explicacao_parts.append(f"Diferença dentro da tolerância do segmento ({tolerancia_segmento})")
            return (ClassificacaoDivergencia.LEGITIMO, max(0, score), "; ".join(explicacao_parts))
        
        # Impacto na apuração (E110)
        if abs(diferenca) > Decimal('100.00'):  # Diferença significativa
            score += 25
            explicacao_parts.append("Alto impacto na apuração")
        elif abs(diferenca) > Decimal('10.00'):
            score += 15
            explicacao_parts.append("Médio impacto na apuração")
        else:
            score += 5
            explicacao_parts.append("Baixo impacto na apuração")
        
        # Percentual de diferença
        if percentual_diferenca > Decimal('10'):
            score += 10
            explicacao_parts.append(f"Diferença percentual alta: {percentual_diferenca:.2f}%")
        elif percentual_diferenca > Decimal('5'):
            score += 5
            explicacao_parts.append(f"Diferença percentual moderada: {percentual_diferenca:.2f}%")
        
        # Regime especial
        if contexto.regime and 'ESPECIAL' in str(contexto.regime).upper():
            score -= 15
            explicacao_parts.append("Regime especial: requer revisão manual")
            return (ClassificacaoDivergencia.REVISAR, max(0, score), "; ".join(explicacao_parts))
        
        # Classificação final baseada no score
        if score >= 80:
            return (ClassificacaoDivergencia.ERRO, min(100, score), "; ".join(explicacao_parts))
        elif score >= 50:
            return (ClassificacaoDivergencia.REVISAR, score, "; ".join(explicacao_parts))
        else:
            return (ClassificacaoDivergencia.LEGITIMO, max(0, score), "; ".join(explicacao_parts))
    
    def _get_finalidade_nome(self, finalidade: Optional[str]) -> str:
        """Retorna nome da finalidade"""
        map_finalidade = {
            '1': 'normal',
            '2': 'complementar',
            '3': 'ajuste',
            '4': 'devolução'
        }
        return map_finalidade.get(finalidade or '', 'normal')
    
    def detectar_st_por_heuristica(
        self,
        doc_xml: Optional[DocumentoFiscal],
        doc_efd: Optional[DocumentoFiscal]
    ) -> bool:
        """
        Detecta ST por heurísticas (CST 60, CFOPs típicos, tags ST no XML)
        
        Args:
            doc_xml: Documento XML
            doc_efd: Documento EFD
        
        Returns:
            True se detectado ST
        """
        # Verificar CST 60 nos itens
        if doc_xml:
            for item in doc_xml.itens:
                if item.icms_st and item.icms_st.valor_st > 0:
                    return True
                if item.icms and item.icms.cst == '60':
                    return True
        
        if doc_efd:
            if doc_efd.valor_icms_st > 0:
                return True
            for item in doc_efd.itens:
                if item.icms_st and item.icms_st.valor_st > 0:
                    return True
        
        return False
    
    def detectar_difal_por_heuristica(
        self,
        doc_xml: Optional[DocumentoFiscal],
        doc_efd: Optional[DocumentoFiscal]
    ) -> bool:
        """
        Detecta DIFAL/FCP por heurísticas (UF destino diferente, campos específicos)
        
        Args:
            doc_xml: Documento XML
            doc_efd: Documento EFD
        
        Returns:
            True se detectado DIFAL/FCP
        """
        if doc_xml:
            if doc_xml.valor_difal > 0 or doc_xml.valor_fcp > 0:
                return True
            # Verificar UF destino diferente de emitente
            if (doc_xml.uf_emitente and doc_xml.uf_destinatario and 
                doc_xml.uf_emitente != doc_xml.uf_destinatario):
                return True
        
        if doc_efd:
            if doc_efd.valor_difal > 0 or doc_efd.valor_fcp > 0:
                return True
        
        return False


