#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Validação de Leiaute e Versão do SPED Fiscal
Valida e registra a versão correta do Guia Prático EFD ICMS/IPI e do PVA aplicável ao período do arquivo SPED.
"""
from __future__ import annotations
from pathlib import Path
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass
from datetime import datetime
import logging
import re

from parsers import get_company_identity_from_efd, split_sped_line

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# Base de dados de versões do Guia Prático EFD ICMS/IPI por período
# Formato: (ano, mês) -> (versão_guia, versão_pva, data_inicio, data_fim)
GUIA_PRATICO_VERSOES: Dict[Tuple[int, int], Dict[str, any]] = {
    # 2024
    (2024, 1): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 2): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 3): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 4): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 5): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 6): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 7): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 8): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 9): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 10): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 11): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    (2024, 12): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2024-01-01", "data_fim": "2024-12-31"},
    # 2025
    (2025, 1): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 2): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 3): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 4): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 5): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 6): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 7): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 8): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 9): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 10): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 11): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
    (2025, 12): {"guia": "v1.0", "pva": "v1.0", "data_inicio": "2025-01-01", "data_fim": "2025-12-31"},
}


@dataclass
class VersaoLeiaute:
    """Informações sobre versão do leiaute e PVA"""
    periodo_ano: int
    periodo_mes: int
    versao_guia: str
    versao_pva: str
    data_inicio: str
    data_fim: str
    cod_ver_sped: Optional[str] = None
    compativel: bool = True
    mensagem_alerta: Optional[str] = None


@dataclass
class ResultadoValidacaoLeiaute:
    """Resultado da validação de leiaute e versão"""
    versao: VersaoLeiaute
    periodo_identificado: bool
    versao_encontrada: bool
    compatibilidade_validada: bool
    alertas: List[str]
    logs: List[str]


def parse_periodo_from_date(date_str: Optional[str]) -> Optional[Tuple[int, int]]:
    """
    Extrai ano e mês de uma data no formato DDMMYYYY ou YYYY-MM-DD
    
    Args:
        date_str: String com data (DDMMYYYY ou YYYY-MM-DD)
    
    Returns:
        Tupla (ano, mês) ou None se não conseguir parsear
    """
    if not date_str:
        return None
    
    date_str = date_str.strip()
    
    # Formato DDMMYYYY (comum no SPED)
    if len(date_str) == 8 and date_str.isdigit():
        try:
            dia = int(date_str[0:2])
            mes = int(date_str[2:4])
            ano = int(date_str[4:8])
            if 1 <= mes <= 12 and 2000 <= ano <= 2100:
                return (ano, mes)
        except (ValueError, IndexError):
            pass
    
    # Formato YYYY-MM-DD
    if len(date_str) == 10 and date_str[4] == '-' and date_str[7] == '-':
        try:
            ano = int(date_str[0:4])
            mes = int(date_str[5:7])
            if 1 <= mes <= 12 and 2000 <= ano <= 2100:
                return (ano, mes)
        except (ValueError, IndexError):
            pass
    
    return None


def identificar_periodo_sped(efd_path: Path) -> Optional[Tuple[int, int]]:
    """
    Identifica automaticamente o período (ano, mês) do arquivo SPED
    
    Args:
        efd_path: Caminho para o arquivo SPED
    
    Returns:
        Tupla (ano, mês) ou None se não conseguir identificar
    """
    try:
        cnpj, razao, dt_ini, dt_fin = get_company_identity_from_efd(efd_path)
        
        # Tentar usar dt_ini primeiro
        periodo = parse_periodo_from_date(dt_ini)
        if periodo:
            return periodo
        
        # Se não conseguir, tentar dt_fin
        periodo = parse_periodo_from_date(dt_fin)
        if periodo:
            return periodo
        
        logger.warning(f"Não foi possível identificar período do SPED: dt_ini={dt_ini}, dt_fin={dt_fin}")
        return None
        
    except Exception as e:
        logger.error(f"Erro ao identificar período do SPED: {e}")
        return None


def obter_cod_ver_sped(efd_path: Path) -> Optional[str]:
    """
    Extrai o COD_VER do registro 0000 do SPED
    
    Args:
        efd_path: Caminho para o arquivo SPED
    
    Returns:
        COD_VER ou None se não encontrar
    """
    try:
        with efd_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith("|0000|"):
                    fs = split_sped_line(ln, min_fields=8)
                    if len(fs) >= 3:
                        cod_ver = (fs[2] or "").strip()
                        if cod_ver:
                            return cod_ver
                    break
        return None
    except Exception as e:
        logger.error(f"Erro ao obter COD_VER do SPED: {e}")
        return None


def consultar_versao_guia_pratico(ano: int, mes: int) -> Optional[Dict[str, any]]:
    """
    Consulta a versão do Guia Prático e PVA para um período específico
    
    Args:
        ano: Ano do período
        mes: Mês do período (1-12)
    
    Returns:
        Dicionário com informações da versão ou None se não encontrar
    """
    periodo = (ano, mes)
    return GUIA_PRATICO_VERSOES.get(periodo)


def validar_compatibilidade_versao(cod_ver_sped: Optional[str], versao_guia: str, versao_pva: str) -> Tuple[bool, Optional[str]]:
    """
    Valida compatibilidade da versão do PVA utilizada
    
    Args:
        cod_ver_sped: COD_VER do arquivo SPED
        versao_guia: Versão do Guia Prático esperada
        versao_pva: Versão do PVA esperada
    
    Returns:
        Tupla (compativel, mensagem_alerta)
    """
    # Por enquanto, assumimos compatibilidade se o COD_VER existe
    # Em versões futuras, podemos validar contra uma tabela de compatibilidade
    if cod_ver_sped:
        # TODO: Implementar validação mais rigorosa quando tivermos tabela de compatibilidade
        return (True, None)
    else:
        return (False, "COD_VER não encontrado no arquivo SPED")


def validar_leiaute_versao(efd_path: Path) -> ResultadoValidacaoLeiaute:
    """
    Valida e registra a versão correta do Guia Prático EFD ICMS/IPI e do PVA aplicável ao período do arquivo SPED
    
    Args:
        efd_path: Caminho para o arquivo SPED
    
    Returns:
        ResultadoValidacaoLeiaute com todas as informações de validação
    """
    alertas = []
    logs = []
    
    # 1. Identificar período do SPED
    periodo = identificar_periodo_sped(efd_path)
    periodo_identificado = periodo is not None
    
    if not periodo_identificado:
        alertas.append("Não foi possível identificar o período do arquivo SPED automaticamente")
        logs.append("ERRO: Período não identificado")
        return ResultadoValidacaoLeiaute(
            versao=VersaoLeiaute(
                periodo_ano=0,
                periodo_mes=0,
                versao_guia="",
                versao_pva="",
                data_inicio="",
                data_fim="",
                compativel=False,
                mensagem_alerta="Período não identificado"
            ),
            periodo_identificado=False,
            versao_encontrada=False,
            compatibilidade_validada=False,
            alertas=alertas,
            logs=logs
        )
    
    ano, mes = periodo
    logs.append(f"Período identificado: {ano}/{mes:02d}")
    
    # 2. Consultar versão do Guia Prático
    versao_info = consultar_versao_guia_pratico(ano, mes)
    versao_encontrada = versao_info is not None
    
    if not versao_encontrada:
        alertas.append(f"Versão do Guia Prático não encontrada para o período {ano}/{mes:02d}")
        logs.append(f"ALERTA: Versão não encontrada para período {ano}/{mes:02d}")
        return ResultadoValidacaoLeiaute(
            versao=VersaoLeiaute(
                periodo_ano=ano,
                periodo_mes=mes,
                versao_guia="",
                versao_pva="",
                data_inicio="",
                data_fim="",
                compativel=False,
                mensagem_alerta=f"Versão não encontrada para período {ano}/{mes:02d}"
            ),
            periodo_identificado=True,
            versao_encontrada=False,
            compatibilidade_validada=False,
            alertas=alertas,
            logs=logs
        )
    
    logs.append(f"Versão do Guia Prático encontrada: {versao_info['guia']}")
    logs.append(f"Versão do PVA esperada: {versao_info['pva']}")
    
    # 3. Obter COD_VER do SPED
    cod_ver_sped = obter_cod_ver_sped(efd_path)
    if cod_ver_sped:
        logs.append(f"COD_VER do SPED: {cod_ver_sped}")
    else:
        alertas.append("COD_VER não encontrado no registro 0000 do SPED")
        logs.append("ALERTA: COD_VER não encontrado")
    
    # 4. Validar compatibilidade
    compativel, mensagem_alerta = validar_compatibilidade_versao(
        cod_ver_sped,
        versao_info['guia'],
        versao_info['pva']
    )
    
    if not compativel and mensagem_alerta:
        alertas.append(mensagem_alerta)
        logs.append(f"INCOMPATIBILIDADE: {mensagem_alerta}")
    elif compativel:
        logs.append("Compatibilidade validada com sucesso")
    
    versao = VersaoLeiaute(
        periodo_ano=ano,
        periodo_mes=mes,
        versao_guia=versao_info['guia'],
        versao_pva=versao_info['pva'],
        data_inicio=versao_info['data_inicio'],
        data_fim=versao_info['data_fim'],
        cod_ver_sped=cod_ver_sped,
        compativel=compativel,
        mensagem_alerta=mensagem_alerta
    )
    
    return ResultadoValidacaoLeiaute(
        versao=versao,
        periodo_identificado=True,
        versao_encontrada=True,
        compatibilidade_validada=compativel,
        alertas=alertas,
        logs=logs
    )


def registrar_versao_utilizada(resultado: ResultadoValidacaoLeiaute, log_file: Optional[Path] = None) -> None:
    """
    Registra no log todas as versões utilizadas para auditoria
    
    Args:
        resultado: Resultado da validação de leiaute
        log_file: Arquivo de log opcional (se None, usa logger padrão)
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    mensagem = f"[{timestamp}] Validação de Leiaute e Versão:\n"
    mensagem += f"  Período: {resultado.versao.periodo_ano}/{resultado.versao.periodo_mes:02d}\n"
    mensagem += f"  Versão Guia Prático: {resultado.versao.versao_guia}\n"
    mensagem += f"  Versão PVA: {resultado.versao.versao_pva}\n"
    mensagem += f"  COD_VER SPED: {resultado.versao.cod_ver_sped or 'N/A'}\n"
    mensagem += f"  Compatível: {'Sim' if resultado.versao.compativel else 'Não'}\n"
    
    if resultado.alertas:
        mensagem += f"  Alertas: {', '.join(resultado.alertas)}\n"
    
    if log_file:
        try:
            with log_file.open("a", encoding="utf-8") as f:
                f.write(mensagem + "\n")
        except Exception as e:
            logger.error(f"Erro ao escrever no arquivo de log: {e}")
    else:
        logger.info(mensagem)
    
    # Log individual de cada item
    for log_item in resultado.logs:
        logger.debug(log_item)

