#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Apuração - E110 (Fechamento)
Testa coerência do fechamento da apuração.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_e110 import (
    validar_coerencia_fechamento,
    validar_saldo_anterior_transportar,
    validar_extra_apuracao,
    detectar_inconsistencias_fechamento,
    ResultadoValidacaoE110
)


class TestValidacaoE110(unittest.TestCase):
    """Testes para validação de E110"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # E110 coerente
        # Fórmula: VL_SLD_APURADO = (VL_TOT_DEBITOS + VL_AJ_DEBITOS) - (VL_TOT_CREDITOS + VL_AJ_CREDITOS) + VL_SLD_CREDOR_ANT - VL_TOT_DED
        # (1000 + 50) - (800 + 30) + 100 - 0 = 1050 - 830 + 100 = 320
        self.e110_coerente = {
            "VL_TOT_DEBITOS": 1000.00,
            "VL_AJ_DEBITOS": 50.00,
            "VL_TOT_CREDITOS": 800.00,
            "VL_AJ_CREDITOS": 30.00,
            "VL_SLD_CREDOR_ANT": 100.00,
            "VL_SLD_APURADO": 320.00,  # (1000 + 50) - (800 + 30) + 100 - 0 = 320
            "VL_TOT_DED": 0.00,
            "VL_ICMS_RECOLHER": 320.00
        }
        
        # E110 incoerente (saldo não bate)
        self.e110_incoerente = {
            "VL_TOT_DEBITOS": 1000.00,
            "VL_AJ_DEBITOS": 50.00,
            "VL_TOT_CREDITOS": 800.00,
            "VL_AJ_CREDITOS": 30.00,
            "VL_SLD_CREDOR_ANT": 100.00,
            "VL_SLD_APURADO": 200.00,  # Deveria ser 280
            "VL_TOT_DED": 0.00,
            "VL_ICMS_RECOLHER": 200.00
        }
    
    def test_validar_coerencia_fechamento(self):
        """Testa validação de coerência de débitos, créditos, estornos, ajustes"""
        resultado = validar_coerencia_fechamento(self.e110_coerente)
        
        self.assertIsInstance(resultado, ResultadoValidacaoE110)
        self.assertTrue(resultado.valido)
        self.assertEqual(len(resultado.inconsistencias), 0)
    
    def test_validar_coerencia_fechamento_incoerente(self):
        """Testa validação quando fechamento é incoerente"""
        resultado = validar_coerencia_fechamento(self.e110_incoerente)
        
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.inconsistencias), 0)
    
    def test_validar_saldo_anterior_transportar(self):
        """Testa validação de saldo anterior e saldo a transportar"""
        resultado = validar_saldo_anterior_transportar(self.e110_coerente)
        
        self.assertIsInstance(resultado, dict)
        # Deve validar que saldo anterior está correto
    
    def test_validar_extra_apuracao(self):
        """Testa validação de extra-apuração quando aplicável"""
        e110_extra = {
            **self.e110_coerente,
            "VL_EXT_APUR": 50.00  # Extra-apuração
        }
        
        resultado = validar_extra_apuracao(e110_extra)
        
        self.assertIsInstance(resultado, dict)
        # Deve validar extra-apuração
    
    def test_detectar_inconsistencias_fechamento(self):
        """Testa detecção de inconsistências no fechamento"""
        resultado = detectar_inconsistencias_fechamento(self.e110_incoerente)
        
        self.assertIsInstance(resultado, ResultadoValidacaoE110)
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.inconsistencias), 0)


if __name__ == "__main__":
    unittest.main()

