#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Benefícios Fiscais - Tratamento de E111 e Créditos Presumidos
Objetivo: Não exigir do XML explicação que está na apuração (E111)
"""

from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Tuple
from decimal import Decimal
import re


@dataclass
class BeneficioFiscal:
    """Representa um benefício fiscal identificado no E111"""
    codigo: str
    descricao: str
    valor: Decimal
    tipo: str  # 'COMPETE', 'INVEST', 'CREDITO_PRESUMIDO', 'OUTROS'
    ind_aj: str  # '0'=Débito, '1'=Crédito
    legitima_divergencia: bool = True  # Se True, divergência é legítima


class IdentificadorBeneficio:
    """Identifica tipos de benefícios fiscais a partir de código e descrição do E111"""
    
    # Padrões conhecidos de benefícios ES
    PADROES_COMPETE = [
        r'COMPETE',
        r'COMPET',
        r'ES_COMPETE',
        r'ES010\d+',  # Código padrão ES COMPETE
    ]
    
    PADROES_INVEST = [
        r'INVEST',
        r'ES_INVEST',
        r'INVESTE',
        r'ES020\d+',  # Código padrão ES INVEST
    ]
    
    PADROES_CREDITO_PRESUMIDO = [
        r'PRESUMIDO',
        r'CREDITO\s+PRESUMIDO',
        r'CRED\.?\s+PRESUMIDO',
        r'CR[EÉ]D\.?\s+PRES',
    ]
    
    PADROES_DIFAL = [
        r'DIFAL',
        r'DIFERENCIAL',
        r'PARTILHA',
        r'UF\s+DEST',
    ]
    
    PADROES_REDUCAO_BASE = [
        r'REDU[ÇC][ÃA]O\s+BASE',
        r'RED\.?\s+BC',
        r'REDUCAO\s+BC',
    ]
    
    @classmethod
    def identificar_tipo(cls, codigo: str, descricao: str) -> str:
        """
        Identifica o tipo de benefício fiscal
        
        Args:
            codigo: Código do ajuste (ex: 'ES010001')
            descricao: Descrição do ajuste
        
        Returns:
            Tipo identificado
        """
        texto = f"{codigo} {descricao}".upper()
        
        # Verificar COMPETE
        for padrao in cls.PADROES_COMPETE:
            if re.search(padrao, texto, re.IGNORECASE):
                return 'COMPETE'
        
        # Verificar INVEST
        for padrao in cls.PADROES_INVEST:
            if re.search(padrao, texto, re.IGNORECASE):
                return 'INVEST'
        
        # Verificar Crédito Presumido
        for padrao in cls.PADROES_CREDITO_PRESUMIDO:
            if re.search(padrao, texto, re.IGNORECASE):
                return 'CREDITO_PRESUMIDO'
        
        # Verificar DIFAL
        for padrao in cls.PADROES_DIFAL:
            if re.search(padrao, texto, re.IGNORECASE):
                return 'DIFAL'
        
        # Verificar Redução de Base
        for padrao in cls.PADROES_REDUCAO_BASE:
            if re.search(padrao, texto, re.IGNORECASE):
                return 'REDUCAO_BASE'
        
        return 'OUTROS'
    
    @classmethod
    def processar_ajustes_e111(cls, ajustes_e111: List[Dict[str, Any]]) -> List[BeneficioFiscal]:
        """
        Processa lista de ajustes E111 e identifica benefícios
        
        Args:
            ajustes_e111: Lista de dicionários com dados do E111
        
        Returns:
            Lista de BeneficioFiscal identificados
        """
        beneficios = []
        
        for ajuste in ajustes_e111:
            codigo = ajuste.get('cod_ajuste', ajuste.get('cod_aj_apur', ajuste.get('COD_AJ_APUR', '')))
            descricao = ajuste.get('descricao', ajuste.get('descr', ajuste.get('DESCR', '')))
            valor = Decimal(str(ajuste.get('valor', ajuste.get('vl_aj', ajuste.get('VL_AJ', 0)))))
            ind_aj = ajuste.get('ind_aj', ajuste.get('IND_AJ', '0'))
            
            # Identificar tipo
            tipo = cls.identificar_tipo(codigo, descricao)
            
            # Determinar se legitima divergência
            legitima = tipo in ('COMPETE', 'INVEST', 'CREDITO_PRESUMIDO', 'DIFAL', 'REDUCAO_BASE')
            
            beneficio = BeneficioFiscal(
                codigo=codigo,
                descricao=descricao,
                valor=valor,
                tipo=tipo,
                ind_aj=ind_aj,
                legitima_divergencia=legitima
            )
            
            beneficios.append(beneficio)
        
        return beneficios


class ValidadorBeneficio:
    """Valida se uma divergência é explicada por um benefício fiscal"""
    
    @staticmethod
    def divergencia_explicada_por_beneficio(
        divergencia_valor: Decimal,
        beneficios: List[BeneficioFiscal],
        tolerancia: Decimal = Decimal('0.01')
    ) -> Tuple[bool, Optional[BeneficioFiscal], str]:
        """
        Verifica se divergência é explicada por algum benefício
        
        Args:
            divergencia_valor: Valor da divergência (pode ser positivo ou negativo)
            beneficios: Lista de benefícios identificados
            tolerancia: Tolerância para comparação
        
        Returns:
            (explicada, beneficio, explicacao)
        """
        if not beneficios:
            return (False, None, "Nenhum benefício E111 encontrado")
        
        divergencia_abs = abs(divergencia_valor)
        
        for beneficio in beneficios:
            if not beneficio.legitima_divergencia:
                continue
            
            beneficio_abs = abs(beneficio.valor)
            diferenca = abs(divergencia_abs - beneficio_abs)
            
            if diferenca <= tolerancia:
                explicacao = (
                    f"Divergência de {divergencia_valor:.2f} explicada por benefício {beneficio.tipo} "
                    f"(E111 cod={beneficio.codigo}, valor={beneficio.valor:.2f})"
                )
                return (True, beneficio, explicacao)
        
        # Verificar se soma de benefícios explica
        soma_beneficios = sum(b.valor for b in beneficios if b.legitima_divergencia)
        diferenca_soma = abs(divergencia_abs - abs(soma_beneficios))
        
        if diferenca_soma <= tolerancia:
            codigos = ', '.join(b.codigo for b in beneficios if b.legitima_divergencia)
            explicacao = (
                f"Divergência de {divergencia_valor:.2f} explicada por soma de benefícios E111 "
                f"(códigos={codigos}, total={soma_beneficios:.2f})"
            )
            return (True, None, explicacao)
        
        return (False, None, "Divergência não explicada por benefícios E111")
    
    @staticmethod
    def beneficio_implica_revisar(beneficio_tipo: str) -> bool:
        """
        Determina se tipo de benefício implica classificação REVISAR
        
        Args:
            beneficio_tipo: Tipo do benefício
        
        Returns:
            True se deve ser REVISAR, False caso contrário
        """
        # DIFAL sempre REVISAR (complexidade fiscal)
        if beneficio_tipo == 'DIFAL':
            return True
        
        # COMPETE e INVEST geralmente são legítimos, mas REVISAR por segurança
        if beneficio_tipo in ('COMPETE', 'INVEST'):
            return True
        
        # Crédito presumido é legítimo, mas REVISAR por segurança
        if beneficio_tipo == 'CREDITO_PRESUMIDO':
            return True
        
        # Redução de base é legítima
        if beneficio_tipo == 'REDUCAO_BASE':
            return False  # LEGÍTIMO
        
        # Outros: REVISAR por padrão
        return True


class IntegradorBeneficioMatriz:
    """Integra identificação de benefícios com Matriz de Legitimação"""
    
    @staticmethod
    def enriquecer_contexto_com_beneficios(
        contexto: Dict[str, Any],
        doc_efd: Any
    ) -> Dict[str, Any]:
        """
        Enriquece contexto fiscal com informações de benefícios E111
        
        Args:
            contexto: Dicionário de contexto fiscal
            doc_efd: DocumentoFiscal do SPED
        
        Returns:
            Contexto enriquecido
        """
        if not doc_efd or not hasattr(doc_efd, 'ajustes'):
            return contexto
        
        # Identificar benefícios
        beneficios = IdentificadorBeneficio.processar_ajustes_e111(doc_efd.ajustes)
        
        if not beneficios:
            return contexto
        
        # Adicionar ao contexto
        contexto['beneficios_fiscais'] = beneficios
        contexto['tem_compete'] = any(b.tipo == 'COMPETE' for b in beneficios)
        contexto['tem_invest'] = any(b.tipo == 'INVEST' for b in beneficios)
        contexto['tem_credito_presumido'] = any(b.tipo == 'CREDITO_PRESUMIDO' for b in beneficios)
        contexto['tem_difal_ajuste'] = any(b.tipo == 'DIFAL' for b in beneficios)
        
        # Contar tipos
        contexto['qtd_beneficios'] = len(beneficios)
        contexto['valor_total_beneficios'] = sum(b.valor for b in beneficios)
        
        return contexto
    
    @staticmethod
    def ajustar_classificacao_por_beneficio(
        classificacao_atual: str,
        score_atual: int,
        contexto: Dict[str, Any],
        divergencia_valor: Decimal
    ) -> Tuple[str, int, str]:
        """
        Ajusta classificação considerando benefícios fiscais
        
        Args:
            classificacao_atual: Classificação inicial
            score_atual: Score inicial
            contexto: Contexto com benefícios
            divergencia_valor: Valor da divergência
        
        Returns:
            (classificacao_ajustada, score_ajustado, explicacao_adicional)
        """
        beneficios = contexto.get('beneficios_fiscais', [])
        
        if not beneficios:
            return (classificacao_atual, score_atual, "")
        
        # Verificar se divergência é explicada
        explicada, beneficio, explicacao = ValidadorBeneficio.divergencia_explicada_por_beneficio(
            divergencia_valor,
            beneficios
        )
        
        if explicada:
            # Divergência explicada por benefício → LEGÍTIMO
            nova_classificacao = 'LEGÍTIMO'
            novo_score = 10
            explicacao_adicional = f"✅ {explicacao}"
            return (nova_classificacao, novo_score, explicacao_adicional)
        
        # Divergência não explicada, mas há benefícios
        # Determinar se deve ser REVISAR
        deve_revisar = False
        tipos_encontrados = []
        
        for beneficio in beneficios:
            if ValidadorBeneficio.beneficio_implica_revisar(beneficio.tipo):
                deve_revisar = True
                tipos_encontrados.append(beneficio.tipo)
        
        if deve_revisar:
            # Presença de benefícios complexos → REVISAR (não ERRO)
            if classificacao_atual == 'ERRO':
                nova_classificacao = 'REVISAR'
                novo_score = max(50, score_atual)  # Mínimo 50 (médio)
                tipos_str = ', '.join(set(tipos_encontrados))
                explicacao_adicional = (
                    f"⚠️ Presença de benefícios complexos ({tipos_str}) "
                    f"requer revisão humana antes de classificar como ERRO"
                )
                return (nova_classificacao, novo_score, explicacao_adicional)
        
        # Manter classificação original
        return (classificacao_atual, score_atual, "")


# Exemplo de uso
def exemplo_uso():
    """Exemplo de como usar o módulo"""
    
    # Simular ajustes E111
    ajustes_e111 = [
        {
            'cod_aj_apur': 'ES010001',
            'descr': 'COMPETE ES - Crédito Presumido 5%',
            'vl_aj': 50.00,
            'ind_aj': '1'  # Crédito
        },
        {
            'cod_aj_apur': 'ES_DIFAL_001',
            'descr': 'DIFAL - Partilha UF Destino',
            'vl_aj': 30.00,
            'ind_aj': '0'  # Débito
        }
    ]
    
    # Identificar benefícios
    beneficios = IdentificadorBeneficio.processar_ajustes_e111(ajustes_e111)
    
    print("Benefícios identificados:")
    for b in beneficios:
        print(f"  - {b.tipo}: {b.descricao} (R$ {b.valor})")
    
    # Verificar se divergência é explicada
    divergencia = Decimal('50.00')
    explicada, beneficio, explicacao = ValidadorBeneficio.divergencia_explicada_por_beneficio(
        divergencia,
        beneficios
    )
    
    print(f"\nDivergência de R$ {divergencia}:")
    print(f"  Explicada: {explicada}")
    if explicada:
        print(f"  {explicacao}")


if __name__ == '__main__':
    exemplo_uso()

