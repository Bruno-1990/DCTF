#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Sistema de Rastreabilidade
Testa log completo de todas as correções aplicadas.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys
import json
from datetime import datetime

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from rastreabilidade import (
    registrar_correcao,
    obter_historico_correcoes,
    obter_correcoes_por_usuario,
    obter_correcoes_por_chave,
    exportar_log_auditoria,
    LogCorrecao
)


class TestRastreabilidade(unittest.TestCase):
    """Testes para sistema de rastreabilidade"""
    
    def setUp(self):
        """Configurar dados de teste"""
        self.usuario = "usuario_teste"
        self.chave_nfe = "35200112345678901234567890123456789012345678"
        
        self.correcao_exemplo = {
            "registro": "C170",
            "campo": "VL_ITEM",
            "valor_antigo": 150.00,
            "valor_novo": 100.00,
            "chave": self.chave_nfe,
            "justificativa": "Correção baseada em XML"
        }
    
    def test_registrar_correcao(self):
        """Testa registro de correção com timestamp"""
        log = registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=self.usuario,
            justificativa="Teste de correção"
        )
        
        self.assertIsInstance(log, LogCorrecao)
        self.assertIsNotNone(log.timestamp)
        self.assertEqual(log.usuario, self.usuario)
        self.assertEqual(log.registro, "C170")
        self.assertEqual(log.campo, "VL_ITEM")
        self.assertIsNotNone(log.justificativa)
    
    def test_registrar_correcao_timestamp_automatico(self):
        """Testa que timestamp é gerado automaticamente"""
        log1 = registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=self.usuario
        )
        
        # Pequeno delay
        import time
        time.sleep(0.01)
        
        log2 = registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=self.usuario
        )
        
        # Timestamps devem ser diferentes
        self.assertNotEqual(log1.timestamp, log2.timestamp)
        self.assertLess(log1.timestamp, log2.timestamp)
    
    def test_obter_historico_correcoes(self):
        """Testa obtenção de histórico completo de correções"""
        # Registrar múltiplas correções
        log1 = registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=self.usuario
        )
        
        correcao2 = self.correcao_exemplo.copy()
        correcao2["campo"] = "QTD"
        log2 = registrar_correcao(
            correcao=correcao2,
            usuario=self.usuario
        )
        
        historico = obter_historico_correcoes()
        
        self.assertIsInstance(historico, list)
        self.assertGreaterEqual(len(historico), 2)
        # Verificar que as correções estão no histórico
        chaves_historico = [h.chave for h in historico if hasattr(h, 'chave')]
        self.assertIn(self.chave_nfe, chaves_historico)
    
    def test_obter_correcoes_por_usuario(self):
        """Testa obtenção de correções por usuário"""
        usuario1 = "usuario1"
        usuario2 = "usuario2"
        
        registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=usuario1
        )
        
        correcao2 = self.correcao_exemplo.copy()
        registrar_correcao(
            correcao=correcao2,
            usuario=usuario2
        )
        
        correcoes_usuario1 = obter_correcoes_por_usuario(usuario1)
        correcoes_usuario2 = obter_correcoes_por_usuario(usuario2)
        
        self.assertGreater(len(correcoes_usuario1), 0)
        self.assertGreater(len(correcoes_usuario2), 0)
        # Todas as correções devem ser do usuário correto
        for log in correcoes_usuario1:
            self.assertEqual(log.usuario, usuario1)
    
    def test_obter_correcoes_por_chave(self):
        """Testa obtenção de correções por chave NF-e"""
        chave1 = "35200112345678901234567890123456789012345678"
        chave2 = "35200198765432109876543210987654321098765432"
        
        correcao1 = self.correcao_exemplo.copy()
        correcao1["chave"] = chave1
        registrar_correcao(correcao=correcao1, usuario=self.usuario)
        
        correcao2 = self.correcao_exemplo.copy()
        correcao2["chave"] = chave2
        registrar_correcao(correcao=correcao2, usuario=self.usuario)
        
        correcoes_chave1 = obter_correcoes_por_chave(chave1)
        correcoes_chave2 = obter_correcoes_por_chave(chave2)
        
        self.assertGreater(len(correcoes_chave1), 0)
        self.assertGreater(len(correcoes_chave2), 0)
        # Todas as correções devem ser da chave correta
        for log in correcoes_chave1:
            self.assertEqual(log.chave, chave1)
    
    def test_exportar_log_auditoria(self):
        """Testa exportação de log para auditoria"""
        registrar_correcao(
            correcao=self.correcao_exemplo,
            usuario=self.usuario,
            justificativa="Teste de auditoria"
        )
        
        log_exportado = exportar_log_auditoria()
        
        self.assertIsNotNone(log_exportado)
        # Verificar que é um formato exportável (JSON ou similar)
        if isinstance(log_exportado, str):
            # Tentar parsear como JSON
            dados = json.loads(log_exportado)
            self.assertIsInstance(dados, (list, dict))
        elif isinstance(log_exportado, list):
            self.assertGreater(len(log_exportado), 0)
    
    def test_historico_completo_alteracoes(self):
        """Testa que histórico completo de alterações é mantido"""
        # Registrar múltiplas correções na mesma chave
        correcao1 = self.correcao_exemplo.copy()
        log1 = registrar_correcao(correcao=correcao1, usuario=self.usuario)
        
        correcao2 = self.correcao_exemplo.copy()
        correcao2["campo"] = "CFOP"
        log2 = registrar_correcao(correcao=correcao2, usuario=self.usuario)
        
        # Obter histórico da chave
        historico = obter_correcoes_por_chave(self.chave_nfe)
        
        # Deve ter pelo menos 2 correções
        self.assertGreaterEqual(len(historico), 2)
        # Verificar que ambas estão no histórico
        campos_corrigidos = [h.campo for h in historico if hasattr(h, 'campo')]
        self.assertIn("VL_ITEM", campos_corrigidos)
        self.assertIn("CFOP", campos_corrigidos)


if __name__ == "__main__":
    unittest.main()


