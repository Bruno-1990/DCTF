#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Apuração - E116 (Valores a Recolher)
Testa validação de valores a recolher.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_e116 import (
    validar_valores_recolher_suportados,
    validar_coerencia_e116_e110,
    detectar_valores_sem_suporte,
    ResultadoValidacaoE116
)


class TestValidacaoE116(unittest.TestCase):
    """Testes para validação de E116"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # E110 com saldo a recolher
        self.e110_recolher = {
            "VL_SLD_APURADO": 320.00,
            "VL_ICMS_RECOLHER": 320.00
        }
        
        # E116 coerente com E110
        self.e116_coerente = {
            "COD_OR": "001",
            "VL_RECOLHER": 320.00
        }
        
        # E116 incoerente (valor maior que suportado)
        self.e116_incoerente = {
            "COD_OR": "001",
            "VL_RECOLHER": 500.00  # Maior que 320.00 do E110
        }
    
    def test_validar_valores_recolher_suportados(self):
        """Testa validação quando valores a recolher são suportados pelo fechamento E110"""
        resultado = validar_valores_recolher_suportados(
            e110_record=self.e110_recolher,
            e116_records=[self.e116_coerente]
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoE116)
        self.assertTrue(resultado.valido)
        self.assertEqual(len(resultado.divergencias), 0)
    
    def test_validar_valores_recolher_nao_suportados(self):
        """Testa validação quando valores a recolher não são suportados"""
        resultado = validar_valores_recolher_suportados(
            e110_record=self.e110_recolher,
            e116_records=[self.e116_incoerente]
        )
        
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.divergencias), 0)
    
    def test_validar_coerencia_e116_e110(self):
        """Testa validação de coerência entre E116 e E110"""
        resultado = validar_coerencia_e116_e110(
            e110_record=self.e110_recolher,
            e116_records=[self.e116_coerente]
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoE116)
        self.assertTrue(resultado.valido)
    
    def test_detectar_valores_sem_suporte(self):
        """Testa detecção de valores a recolher sem suporte no fechamento"""
        resultado = detectar_valores_sem_suporte(
            e110_record=self.e110_recolher,
            e116_records=[self.e116_incoerente]
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoE116)
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.valores_sem_suporte), 0)


if __name__ == "__main__":
    unittest.main()


