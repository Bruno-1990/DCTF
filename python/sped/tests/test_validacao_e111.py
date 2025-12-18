#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Apuração - E111 (Ajustes)
Testa validação de ajustes da apuração.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_e111 import (
    validar_codigo_motivo_ajuste,
    validar_rastreabilidade_ajuste,
    classificar_impacto_risco_ajuste,
    detectar_ajustes_sem_justificativa,
    ResultadoValidacaoE111
)


class TestValidacaoE111(unittest.TestCase):
    """Testes para validação de E111"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # E111 válido com código e motivo
        self.e111_valido = {
            "COD_AJ_APUR": "001",
            "DESCR_COMPL_AJ": "Ajuste de crédito de ICMS",
            "VL_AJ_APUR": 100.00,
            "ORIGEM": "C170"  # Rastreabilidade
        }
        
        # E111 sem código
        self.e111_sem_codigo = {
            "DESCR_COMPL_AJ": "Ajuste sem código",
            "VL_AJ_APUR": 50.00
        }
        
        # E111 sem rastreabilidade (descrição não menciona origem)
        self.e111_sem_rastreabilidade = {
            "COD_AJ_APUR": "002",
            "DESCR_COMPL_AJ": "Ajuste genérico",
            "VL_AJ_APUR": 75.00
        }
    
    def test_validar_codigo_motivo_ajuste(self):
        """Testa validação quando ajuste tem código/motivo"""
        resultado = validar_codigo_motivo_ajuste(self.e111_valido)
        
        self.assertIsInstance(resultado, dict)
        self.assertTrue(resultado["valido"])
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_validar_codigo_motivo_ajuste_sem_codigo(self):
        """Testa validação quando ajuste não tem código"""
        resultado = validar_codigo_motivo_ajuste(self.e111_sem_codigo)
        
        self.assertFalse(resultado["valido"])
        self.assertGreater(len(resultado["divergencias"]), 0)
    
    def test_validar_rastreabilidade_ajuste(self):
        """Testa validação de rastreabilidade (origem/evidência)"""
        resultado = validar_rastreabilidade_ajuste(self.e111_valido)
        
        self.assertIsInstance(resultado, dict)
        self.assertTrue(resultado["valido"])
    
    def test_validar_rastreabilidade_ajuste_sem_origem(self):
        """Testa validação quando ajuste não tem rastreabilidade"""
        resultado = validar_rastreabilidade_ajuste(self.e111_sem_rastreabilidade)
        
        self.assertFalse(resultado["valido"])
        self.assertGreater(len(resultado["divergencias"]), 0)
    
    def test_classificar_impacto_risco_ajuste(self):
        """Testa classificação de impacto e risco dos ajustes"""
        resultado = classificar_impacto_risco_ajuste(self.e111_valido)
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("impacto", resultado)
        self.assertIn("risco", resultado)
    
    def test_detectar_ajustes_sem_justificativa(self):
        """Testa detecção de ajustes sem justificativa"""
        e111_sem_justificativa = {
            # Sem COD_AJ_APUR e sem DESCR_COMPL_AJ
            "VL_AJ_APUR": 200.00
        }
        
        resultado = detectar_ajustes_sem_justificativa([e111_sem_justificativa])
        
        self.assertIsInstance(resultado, ResultadoValidacaoE111)
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.ajustes_sem_justificativa), 0)


if __name__ == "__main__":
    unittest.main()

