#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Rastreabilidade
Implementa log completo de todas as correções aplicadas.
"""
from __future__ import annotations
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

# Armazenamento em memória (em produção, usar banco de dados)
_logs_correcoes: List['LogCorrecao'] = []


@dataclass
class LogCorrecao:
    """Log de uma correção aplicada"""
    timestamp: datetime
    usuario: str
    registro: str  # C100, C170, C190
    campo: str
    valor_antigo: Any
    valor_novo: Any
    chave: Optional[str] = None  # Chave NF-e (se aplicável)
    justificativa: Optional[str] = None
    cfop: Optional[str] = None  # CFOP (se aplicável)
    cst: Optional[str] = None  # CST (se aplicável)
    num_item: Optional[str] = None  # NUM_ITEM (se aplicável para C170)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte log para dicionário"""
        dados = asdict(self)
        # Converter datetime para string ISO
        dados["timestamp"] = self.timestamp.isoformat()
        return dados


def registrar_correcao(
    correcao: Dict[str, Any],
    usuario: str,
    justificativa: Optional[str] = None
) -> LogCorrecao:
    """
    Registra uma correção aplicada com timestamp
    
    Args:
        correcao: Dicionário com informações da correção
        usuario: Usuário que aplicou a correção
        justificativa: Justificativa para a correção
    
    Returns:
        LogCorrecao criado
    """
    timestamp = datetime.now()
    
    log = LogCorrecao(
        timestamp=timestamp,
        usuario=usuario,
        registro=correcao.get("registro", ""),
        campo=correcao.get("campo", ""),
        valor_antigo=correcao.get("valor_antigo"),
        valor_novo=correcao.get("valor_novo"),
        chave=correcao.get("chave"),
        justificativa=justificativa or correcao.get("justificativa"),
        cfop=correcao.get("cfop"),
        cst=correcao.get("cst"),
        num_item=correcao.get("num_item")
    )
    
    # Adicionar ao histórico
    _logs_correcoes.append(log)
    
    logger.info(f"[{timestamp.isoformat()}] Correção registrada: {usuario} corrigiu {log.registro}.{log.campo} ({log.chave or 'N/A'})")
    
    return log


def obter_historico_correcoes(
    filtro: Optional[Dict[str, Any]] = None
) -> List[LogCorrecao]:
    """
    Obtém histórico completo de alterações
    
    Args:
        filtro: Dicionário com filtros opcionais (usuario, chave, registro, etc.)
    
    Returns:
        Lista de LogCorrecao
    """
    if not filtro:
        return _logs_correcoes.copy()
    
    resultado = []
    for log in _logs_correcoes:
        match = True
        
        if "usuario" in filtro and log.usuario != filtro["usuario"]:
            match = False
        if "chave" in filtro and log.chave != filtro["chave"]:
            match = False
        if "registro" in filtro and log.registro != filtro["registro"]:
            match = False
        if "campo" in filtro and log.campo != filtro["campo"]:
            match = False
        
        if match:
            resultado.append(log)
    
    return resultado


def obter_correcoes_por_usuario(usuario: str) -> List[LogCorrecao]:
    """
    Obtém correções aplicadas por um usuário específico
    
    Args:
        usuario: Nome do usuário
    
    Returns:
        Lista de LogCorrecao
    """
    return obter_historico_correcoes(filtro={"usuario": usuario})


def obter_correcoes_por_chave(chave: str) -> List[LogCorrecao]:
    """
    Obtém correções aplicadas para uma chave NF-e específica
    
    Args:
        chave: Chave NF-e
    
    Returns:
        Lista de LogCorrecao
    """
    return obter_historico_correcoes(filtro={"chave": chave})


def exportar_log_auditoria(
    formato: str = "json"
) -> str:
    """
    Exporta log completo para auditoria
    
    Args:
        formato: Formato de exportação ("json" ou "csv")
    
    Returns:
        String com log exportado
    """
    if formato == "json":
        logs_dict = [log.to_dict() for log in _logs_correcoes]
        return json.dumps(logs_dict, indent=2, ensure_ascii=False)
    elif formato == "csv":
        # Cabeçalho CSV
        header = "timestamp,usuario,registro,campo,valor_antigo,valor_novo,chave,justificativa,cfop,cst,num_item\n"
        linhas = [header]
        
        for log in _logs_correcoes:
            linha = f"{log.timestamp.isoformat()},{log.usuario},{log.registro},{log.campo},{log.valor_antigo},{log.valor_novo},{log.chave or ''},{log.justificativa or ''},{log.cfop or ''},{log.cst or ''},{log.num_item or ''}\n"
            linhas.append(linha)
        
        return "".join(linhas)
    else:
        raise ValueError(f"Formato não suportado: {formato}")


def limpar_logs():
    """Limpa todos os logs (útil para testes)"""
    global _logs_correcoes
    _logs_correcoes = []


