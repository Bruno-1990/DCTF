#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Normalização Avançada
Implementa normalização completa de dados.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional, Union
import re
import logging

logger = logging.getLogger(__name__)


def normalizar_cnpj_cpf(valor: str) -> str:
    """
    Normaliza CNPJ/CPF (remove formatação)
    
    Args:
        valor: CNPJ/CPF formatado ou não
    
    Returns:
        CNPJ/CPF apenas com dígitos
    """
    if not valor:
        return ""
    
    # Remover formatação (pontos, barras, hífens)
    valor_limpo = re.sub(r'[.\-/]', '', str(valor).strip())
    
    return valor_limpo


def validar_digitos_cnpj_cpf(valor: str) -> bool:
    """
    Valida dígitos verificadores de CNPJ/CPF
    
    Args:
        valor: CNPJ/CPF (apenas dígitos)
    
    Returns:
        True se válido
    """
    if not valor:
        return False
    
    valor_limpo = normalizar_cnpj_cpf(valor)
    
    # CNPJ tem 14 dígitos, CPF tem 11
    if len(valor_limpo) == 14:
        # Validar CNPJ
        return _validar_digitos_cnpj(valor_limpo)
    elif len(valor_limpo) == 11:
        # Validar CPF
        return _validar_digitos_cpf(valor_limpo)
    
    return False


def _validar_digitos_cnpj(cnpj: str) -> bool:
    """Valida dígitos verificadores de CNPJ"""
    if len(cnpj) != 14:
        return False
    
    # Verificar se todos os dígitos são iguais (CNPJ inválido)
    if len(set(cnpj)) == 1:
        return False
    
    # Calcular primeiro dígito verificador
    multiplicadores1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(int(cnpj[i]) * multiplicadores1[i] for i in range(12))
    resto = soma % 11
    digito1 = 0 if resto < 2 else 11 - resto
    
    if int(cnpj[12]) != digito1:
        return False
    
    # Calcular segundo dígito verificador
    multiplicadores2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(int(cnpj[i]) * multiplicadores2[i] for i in range(13))
    resto = soma % 11
    digito2 = 0 if resto < 2 else 11 - resto
    
    return int(cnpj[13]) == digito2


def _validar_digitos_cpf(cpf: str) -> bool:
    """Valida dígitos verificadores de CPF"""
    if len(cpf) != 11:
        return False
    
    # Verificar se todos os dígitos são iguais (CPF inválido)
    if len(set(cpf)) == 1:
        return False
    
    # Calcular primeiro dígito verificador
    soma = sum(int(cpf[i]) * (10 - i) for i in range(9))
    resto = soma % 11
    digito1 = 0 if resto < 2 else 11 - resto
    
    if int(cpf[9]) != digito1:
        return False
    
    # Calcular segundo dígito verificador
    soma = sum(int(cpf[i]) * (11 - i) for i in range(10))
    resto = soma % 11
    digito2 = 0 if resto < 2 else 11 - resto
    
    return int(cpf[10]) == digito2


def normalizar_data(valor: str, formato_saida: str = "DDMMYYYY") -> str:
    """
    Normaliza datas (padroniza formato)
    
    Args:
        valor: Data em qualquer formato
        formato_saida: Formato desejado (DDMMYYYY, YYYYMMDD, etc)
    
    Returns:
        Data no formato especificado
    """
    if not valor:
        return ""
    
    valor_limpo = str(valor).strip()
    
    # Remover separadores
    valor_limpo = re.sub(r'[/\-\.]', '', valor_limpo)
    
    # Se já está no formato DDMMYYYY (8 dígitos), retornar
    if len(valor_limpo) == 8:
        # Verificar se está em formato DDMMYYYY ou YYYYMMDD
        if formato_saida == "DDMMYYYY":
            # Assumir que está em DDMMYYYY se começa com 0-3
            if valor_limpo[0] in "0123":
                return valor_limpo
            # Caso contrário, converter de YYYYMMDD para DDMMYYYY
            else:
                return valor_limpo[6:8] + valor_limpo[4:6] + valor_limpo[0:4]
        elif formato_saida == "YYYYMMDD":
            # Assumir que está em YYYYMMDD se começa com 1-2
            if valor_limpo[0] in "12":
                return valor_limpo
            # Caso contrário, converter de DDMMYYYY para YYYYMMDD
            else:
                return valor_limpo[4:8] + valor_limpo[2:4] + valor_limpo[0:2]
    
    return valor_limpo


def normalizar_decimal(valor: Union[str, float, int], casas: int = 2) -> float:
    """
    Normaliza decimais (padroniza casas decimais)
    
    Args:
        valor: Valor decimal (string com vírgula/ponto ou número)
        casas: Número de casas decimais desejadas
    
    Returns:
        Valor decimal normalizado
    """
    if valor is None:
        return 0.0
    
    if isinstance(valor, (int, float)):
        return round(float(valor), casas)
    
    valor_str = str(valor).strip()
    
    # Substituir vírgula por ponto
    valor_str = valor_str.replace(',', '.')
    
    # Remover espaços e caracteres não numéricos (exceto ponto e sinal negativo)
    valor_str = re.sub(r'[^\d.\-]', '', valor_str)
    
    try:
        valor_float = float(valor_str)
        return round(valor_float, casas)
    except ValueError:
        return 0.0


def normalizar_campo_chave(valor: str, maiusculas: bool = True) -> str:
    """
    Normaliza campos-chave (remove espaços, normaliza maiúsculas/minúsculas)
    
    Args:
        valor: Campo a normalizar
        maiusculas: Se True, converte para maiúsculas
    
    Returns:
        Campo normalizado
    """
    if not valor:
        return ""
    
    valor_limpo = str(valor).strip()
    
    # Remover espaços múltiplos
    valor_limpo = re.sub(r'\s+', '', valor_limpo)
    
    # Converter para maiúsculas se solicitado
    if maiusculas:
        valor_limpo = valor_limpo.upper()
    
    return valor_limpo


def aplicar_normalizacao(dados: Dict[str, Any]) -> Dict[str, Any]:
    """
    Aplica normalização antes de comparações
    
    Args:
        dados: Dicionário com dados a normalizar
    
    Returns:
        Dicionário com dados normalizados
    """
    dados_normalizados = {}
    
    for chave, valor in dados.items():
        chave_upper = chave.upper()
        
        # Normalizar CNPJ/CPF
        if "CNPJ" in chave_upper or "CPF" in chave_upper:
            dados_normalizados[chave] = normalizar_cnpj_cpf(str(valor))
        
        # Normalizar datas
        elif "DATA" in chave_upper or "DT_" in chave_upper:
            dados_normalizados[chave] = normalizar_data(str(valor))
        
        # Normalizar valores decimais
        elif "VL_" in chave_upper or "VALOR" in chave_upper or "QTD" in chave_upper:
            dados_normalizados[chave] = normalizar_decimal(valor)
        
        # Normalizar campos-chave
        elif "COD_" in chave_upper or "CFOP" in chave_upper or "CST" in chave_upper:
            dados_normalizados[chave] = normalizar_campo_chave(str(valor))
        
        # Manter outros campos como estão
        else:
            dados_normalizados[chave] = valor
    
    return dados_normalizados


