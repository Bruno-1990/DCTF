"""
Validador de Contexto Fiscal usando RAG
Consulta base de conhecimento ANTES de criar divergências
"""

from typing import Optional, Dict, Any, Tuple, List
from decimal import Decimal
import logging

from ..canonical.documento_fiscal import DocumentoFiscal

logger = logging.getLogger(__name__)


class ContextValidator:
    """
    Valida contexto fiscal consultando RAG antes de criar divergências.
    Implementa o princípio do roteiro: verificar contexto ANTES de apontar erro.
    """
    
    def __init__(self, use_rag: bool = True):
        """
        Args:
            use_rag: Se True, tenta usar RAG. Se False, usa apenas regras hardcoded.
        """
        self.use_rag = use_rag
        self.rag_service = None
        
        if use_rag:
            try:
                from ..knowledge.hybrid_query import HybridQueryService
                self.rag_service = HybridQueryService()
                logger.info("ContextValidator: RAG service inicializado")
            except Exception as e:
                logger.warning(f"ContextValidator: Não foi possível inicializar RAG: {e}")
                logger.warning("ContextValidator: Usando apenas regras hardcoded")
                self.use_rag = False
    
    def is_divergencia_legitima(
        self,
        tipo_divergencia: str,
        doc_xml: Optional[DocumentoFiscal],
        doc_efd: Optional[DocumentoFiscal],
        diferenca: Decimal,
        contexto_fiscal: Dict[str, Any]
    ) -> Tuple[bool, str, float]:
        """
        Consulta RAG e regras para verificar se divergência é legítima.
        
        Args:
            tipo_divergencia: Tipo da divergência ('valor', 'tributo', 'quantidade', etc.)
            doc_xml: Documento XML normalizado
            doc_efd: Documento EFD normalizado
            diferenca: Diferença absoluta encontrada
            contexto_fiscal: Contexto fiscal extraído (CFOP, CST, ST, etc.)
        
        Returns:
            (is_legitima, explicacao, confidence_score)
            - is_legitima: True se a divergência é legítima (não deve ser apontada)
            - explicacao: Explicação do porquê é legítima
            - confidence_score: Score de confiança (0-1)
        """
        # Primeiro, verificar regras hardcoded (mais rápidas)
        is_legitima_hardcoded, explicacao_hardcoded = self._check_hardcoded_rules(
            tipo_divergencia, contexto_fiscal, diferenca
        )
        
        if is_legitima_hardcoded:
            return (True, explicacao_hardcoded, 0.9)  # Alta confiança em regras hardcoded
        
        # Se não for legítima por regras hardcoded, consultar RAG (se disponível)
        if self.use_rag and self.rag_service:
            try:
                is_legitima_rag, explicacao_rag, confidence = self._check_rag_context(
                    tipo_divergencia, contexto_fiscal, diferenca
                )
                
                if is_legitima_rag and confidence > 0.5:
                    return (True, explicacao_rag, confidence)
            except Exception as e:
                logger.warning(f"ContextValidator: Erro ao consultar RAG: {e}")
                # Continuar sem RAG se houver erro
        
        # Se chegou aqui, não é legítima
        return (False, "", 0.0)
    
    def _check_hardcoded_rules(
        self,
        tipo_divergencia: str,
        contexto: Dict[str, Any],
        diferenca: Decimal
    ) -> Tuple[bool, str]:
        """
        Verifica regras hardcoded baseadas no roteiro.
        Essas regras são baseadas em conhecimento fiscal consolidado.
        """
        from .legitimacao_matrix import MatrizLegitimacao
        from .regras_segmento import RegrasPorSegmento
        
        matriz = MatrizLegitimacao()
        
        cfop = contexto.get('cfop')
        cst = contexto.get('cst') or contexto.get('csosn')
        tem_st = contexto.get('tem_st', False)
        tem_difal = contexto.get('tem_difal', False)
        finalidade_nfe = contexto.get('finalidade_nfe')
        is_devolucao = finalidade_nfe == '4'
        segmento = contexto.get('segmento')
        regime = contexto.get('regime')
        
        # Regra 0: Tolerância por segmento
        # MAS: não aplicar para casos que devem ir para REVISAR (complementar, devolução, DIFAL)
        tolerancia_segmento = RegrasPorSegmento.get_tolerancia_por_segmento(segmento)
        
        # Casos especiais SEMPRE devem ser classificados (não ignorados por tolerância)
        casos_especiais = (
            finalidade_nfe in ('2', '3', '4') or  # Complementar, ajuste, devolução
            tem_difal or
            (cfop and cfop in matriz.CFOPS_DEVOLUCAO)
        )
        
        if not casos_especiais and diferenca <= tolerancia_segmento:
            return (True, f"Diferença ({diferenca:.2f}) dentro da tolerância do segmento {segmento or 'padrão'} ({tolerancia_segmento})")
        
        # Regra 0.5: Validar coerência CFOP × CST
        if cfop and cst:
            is_valid, msg = RegrasPorSegmento.validar_cfop_cst(cfop, cst, segmento, regime)
            if not is_valid:
                # Incoerência CFOP×CST: não é legítima, é ERRO GRAVE
                # Forçar passagem para Matriz para classificar como ERRO
                return (False, "")
        
        # Se só tem CFOP ou CST (mas não ambos), não é erro aqui
        # Deixa a Matriz decidir
        
        # Regra 0.6: Operações especiais (remessa, bonificação, transferência)
        if cfop:
            is_especial, tipo_especial = RegrasPorSegmento.is_operacao_especial(cfop)
            if is_especial:
                # Operações especiais podem ter valores divergentes
                return (True, f"Operação especial ({tipo_especial}): CFOP {cfop}")
        
        # Regra 1: CFOP de devolução
        if cfop and cfop in matriz.CFOPS_DEVOLUCAO:
            # Devoluções podem ter valores diferentes por ajustes
            # Se diferença for pequena (< R$ 1,00), pode ser arredondamento
            if diferenca <= Decimal('1.00'):
                return (True, f"CFOP {cfop} de devolução com diferença pequena (arredondamento)")
            else:
                # Diferença maior: pode ser legítima se houver ajuste
                tem_ajuste = contexto.get('tem_ajuste_c197', False) or contexto.get('tem_ajuste_e111', False)
                if tem_ajuste:
                    return (True, f"CFOP {cfop} de devolução com ajuste C197/E111 que explica a diferença")
        
        # Regra 2: CFOP de remessa/bonificação
        if cfop and cfop in matriz.CFOPS_REMESSA:
            # Remessas podem ter base reduzida ou ICMS diferido
            return (True, f"CFOP {cfop} de remessa/bonificação: pode ter base reduzida ou ICMS diferido")
        
        # Regra 3: Operação ST - não comparar BC própria
        if tem_st and tipo_divergencia in ('tributo', 'valor'):
            # Em operações ST, ICMS próprio pode ser zero
            # Não comparar valor_total_itens se for ST
            if 'ICMS' in tipo_divergencia and 'ST' not in tipo_divergencia:
                return (True, "Operação ST: ICMS próprio pode ser zero, validar bloco ST")
        
        # Regra 3.5: ICMS zero permitido por CFOP/CST
        if cfop and cst and tipo_divergencia in ('tributo', 'valor'):
            if RegrasPorSegmento.cfop_permite_icms_zero(cfop, cst, segmento):
                if diferenca <= Decimal('0.10'):  # Pequena diferença
                    return (True, f"CFOP {cfop} com CST {cst} permite ICMS zero")
        
        # Regra 4: Nota complementar/ajuste
        # NÃO é legítima automaticamente - deve ir para classificação (REVISAR)
        if finalidade_nfe in ('2', '3'):  # Complementar ou ajuste
            return (False, "")  # Deixa a Matriz classificar como REVISAR
        
        # Regra 5: DIFAL/FCP - SEMPRE deve ser classificado (não ignorado)
        # DIFAL é complexo e deve sempre ir para REVISAR
        if tem_difal:
            return (False, "")  # Deixa a Matriz classificar como REVISAR
        
        # Regra 6: Diferença muito pequena (arredondamento)
        if diferenca <= Decimal('0.10'):
            return (True, f"Diferença muito pequena ({diferenca}): provável arredondamento")
        
        return (False, "")
    
    def _check_rag_context(
        self,
        tipo_divergencia: str,
        contexto: Dict[str, Any],
        diferenca: Decimal
    ) -> Tuple[bool, str, float]:
        """
        Consulta RAG para verificar se há contexto legal que explica a divergência.
        """
        if not self.rag_service:
            return (False, "", 0.0)
        
        # Construir query para RAG
        query = self._build_rag_query(tipo_divergencia, contexto, diferenca)
        
        try:
            # Consultar RAG
            result = self.rag_service.query(
                query=query,
                n_rag_results=5,
                min_rag_score=0.3
            )
            
            if result.rag_results:
                # Verificar se há contexto que explica a divergência
                for rag_result in result.rag_results:
                    if self._contexto_explica_divergencia(rag_result, contexto):
                        explicacao = f"Contexto legal encontrado: {rag_result.chunk_text[:200]}..."
                        return (True, explicacao, rag_result.score)
            
            return (False, "", 0.0)
        except Exception as e:
            logger.warning(f"Erro ao consultar RAG: {e}")
            return (False, "", 0.0)
    
    def _build_rag_query(
        self,
        tipo_divergencia: str,
        contexto: Dict[str, Any],
        diferenca: Decimal
    ) -> str:
        """
        Constrói query para RAG baseado no contexto fiscal.
        """
        parts = [f"divergência {tipo_divergencia}"]
        
        if contexto.get('cfop'):
            parts.append(f"CFOP {contexto['cfop']}")
        
        if contexto.get('tem_st'):
            parts.append("substituição tributária ST")
        
        if contexto.get('tem_difal'):
            parts.append("DIFAL partilha interestadual")
        
        if contexto.get('finalidade_nfe') in ('2', '3', '4'):
            finalidade_nome = self._get_finalidade_nome(contexto['finalidade_nfe'])
            parts.append(f"nota {finalidade_nome}")
        
        if contexto.get('cst'):
            parts.append(f"CST {contexto['cst']}")
        
        # Adicionar contexto sobre diferença
        if diferenca > Decimal('100.00'):
            parts.append("diferença significativa")
        elif diferenca > Decimal('10.00'):
            parts.append("diferença moderada")
        else:
            parts.append("diferença pequena arredondamento")
        
        return " ".join(parts)
    
    def _contexto_explica_divergencia(
        self,
        rag_result,
        contexto: Dict[str, Any]
    ) -> bool:
        """
        Verifica se o contexto RAG explica a divergência baseado no contexto fiscal.
        """
        chunk_text_lower = rag_result.chunk_text.lower()
        
        # Verificar se menciona CFOP específico
        if contexto.get('cfop'):
            if contexto['cfop'] in chunk_text_lower:
                return True
        
        # Verificar se menciona ST
        if contexto.get('tem_st'):
            if any(termo in chunk_text_lower for termo in ['st', 'substituição tributária', 'icms st']):
                return True
        
        # Verificar se menciona devolução
        if contexto.get('finalidade_nfe') == '4':
            if any(termo in chunk_text_lower for termo in ['devolução', 'devolver', 'retorno']):
                return True
        
        # Verificar se menciona ajuste
        if contexto.get('tem_ajuste_c197') or contexto.get('tem_ajuste_e111'):
            if any(termo in chunk_text_lower for termo in ['ajuste', 'c197', 'e111']):
                return True
        
        return False
    
    def _get_finalidade_nome(self, finalidade: Optional[str]) -> str:
        """Retorna nome da finalidade"""
        map_finalidade = {
            '1': 'normal',
            '2': 'complementar',
            '3': 'ajuste',
            '4': 'devolução'
        }
        return map_finalidade.get(finalidade or '', 'normal')
    
    def should_skip_validation(
        self,
        tipo_validacao: str,
        contexto_fiscal: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """
        Determina se uma validação específica deve ser pulada baseado no contexto.
        Retorna (should_skip, reason)
        """
        cfop = contexto_fiscal.get('cfop')
        tem_st = contexto_fiscal.get('tem_st', False)
        finalidade_nfe = contexto_fiscal.get('finalidade_nfe')
        
        from .legitimacao_matrix import MatrizLegitimacao
        matriz = MatrizLegitimacao()
        
        # Pular validação de valor_total_itens para devoluções
        if tipo_validacao == 'valor_total_itens':
            if cfop and cfop in matriz.CFOPS_DEVOLUCAO:
                return (True, f"CFOP {cfop} de devolução: valores podem diferir por ajustes")
            
            if cfop and cfop in matriz.CFOPS_REMESSA:
                return (True, f"CFOP {cfop} de remessa: pode ter base reduzida")
            
            if finalidade_nfe in ('2', '3', '4'):
                return (True, f"Nota {self._get_finalidade_nome(finalidade_nfe)}: comparar com original")
        
        # Pular validação de ICMS próprio para operações ST
        if tipo_validacao == 'icms_proprio' and tem_st:
            return (True, "Operação ST: ICMS próprio pode ser zero, validar bloco ST")
        
        return (False, "")

