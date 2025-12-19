#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Sistema de Tolerância Configurável
Testa sistema de tolerâncias configuráveis para evitar falsos positivos.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from tolerancia import (
    configurar_tolerancia_item,
    configurar_tolerancia_documento,
    configurar_tolerancia_periodo,
    verificar_diferenca_dentro_tolerancia,
    registrar_diferenca_tolerancia,
    ResultadoTolerancia
)


class TestTolerancia(unittest.TestCase):
    """Testes para sistema de tolerância"""
    
    def setUp(self):
        """Configurar dados de teste"""
        self.config_tolerancia = {
            "por_item": 0.01,  # R$ 0,01 por item
            "por_documento": 0.10,  # R$ 0,10 por documento
            "por_periodo": 1.00  # R$ 1,00 por período
        }
    
    def test_configurar_tolerancia_item(self):
        """Testa configuração de tolerância por item"""
        tolerancia = configurar_tolerancia_item(0.01)
        self.assertEqual(tolerancia, 0.01)
    
    def test_configurar_tolerancia_documento(self):
        """Testa configuração de tolerância por documento"""
        tolerancia = configurar_tolerancia_documento(0.10)
        self.assertEqual(tolerancia, 0.10)
    
    def test_configurar_tolerancia_periodo(self):
        """Testa configuração de tolerância por período"""
        tolerancia = configurar_tolerancia_periodo(1.00)
        self.assertEqual(tolerancia, 1.00)
    
    def test_verificar_diferenca_dentro_tolerancia_item(self):
        """Testa verificação de diferença dentro da tolerância por item"""
        diferenca = 0.005  # R$ 0,005 (dentro da tolerância de R$ 0,01)
        resultado = verificar_diferenca_dentro_tolerancia(
            diferenca=diferenca,
            tipo="item",
            config=self.config_tolerancia
        )
        
        self.assertTrue(resultado.dentro_tolerancia)
        self.assertEqual(resultado.tolerancia_aplicada, 0.01)
    
    def test_verificar_diferenca_fora_tolerancia_item(self):
        """Testa verificação de diferença fora da tolerância por item"""
        diferenca = 0.02  # R$ 0,02 (fora da tolerância de R$ 0,01)
        resultado = verificar_diferenca_dentro_tolerancia(
            diferenca=diferenca,
            tipo="item",
            config=self.config_tolerancia
        )
        
        self.assertFalse(resultado.dentro_tolerancia)
        self.assertEqual(resultado.tolerancia_aplicada, 0.01)
    
    def test_registrar_diferenca_tolerancia(self):
        """Testa registro de diferenças dentro da tolerância com justificativa"""
        diferenca = 0.005
        justificativa = "Rateio de valores"
        
        resultado = registrar_diferenca_tolerancia(
            diferenca=diferenca,
            tipo="item",
            justificativa=justificativa,
            config=self.config_tolerancia
        )
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("registrado", resultado)
        self.assertEqual(resultado["justificativa"], justificativa)


if __name__ == "__main__":
    unittest.main()


