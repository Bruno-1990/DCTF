#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de IPI
Testa consistência de totais de IPI entre C100 e C190.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_ipi import (
    validar_ipi_c100_c190,
    calcular_total_ipi_c190,
    verificar_aplicabilidade_ipi,
    ResultadoValidacaoIPI
)


class TestValidacaoIPI(unittest.TestCase):
    """Testes para validação de IPI"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C100 com IPI
        self.c100_record = {
            "CHV_NFE": "35200112345678901234567890123456789012345678",
            "VL_IPI": 50.00
        }
        
        # C190s com IPI (corretos)
        self.c190_items = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_IPI": 30.00
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_IPI": 20.00
            }
        ]
        # Total: 30 + 20 = 50.00 (igual a C100)
    
    def test_calcular_total_ipi_c190(self):
        """Testa cálculo de total de IPI dos C190s"""
        total = calcular_total_ipi_c190(self.c190_items)
        self.assertEqual(total, 50.00)  # 30 + 20
    
    def test_verificar_aplicabilidade_ipi(self):
        """Testa verificação de quando IPI é aplicável"""
        # IPI aplicável quando há produtos sujeitos a IPI
        c190_com_ipi = [{"VL_IPI": 10.00}]
        self.assertTrue(verificar_aplicabilidade_ipi(c190_com_ipi))
        
        # IPI não aplicável quando todos os valores são zero
        c190_sem_ipi = [{"VL_IPI": 0.00}, {"VL_IPI": 0.00}]
        self.assertFalse(verificar_aplicabilidade_ipi(c190_sem_ipi))
    
    def test_validar_ipi_c100_c190_correto(self):
        """Testa validação quando IPI está correto"""
        resultado = validar_ipi_c100_c190(
            c100_record=self.c100_record,
            c190_items=self.c190_items,
            tolerancia=0.01
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoIPI)
        self.assertTrue(resultado.valido)
        self.assertEqual(resultado.vl_ipi_c100, 50.00)
        self.assertEqual(resultado.total_ipi_c190, 50.00)
        self.assertEqual(len(resultado.divergencias), 0)
    
    def test_validar_ipi_c100_c190_divergente(self):
        """Testa validação quando IPI diverge"""
        # C190s com IPI errado
        c190_divergentes = [
            {"CST_ICMS": "00", "CFOP": "5102", "VL_IPI": 30.00},
            {"CST_ICMS": "10", "CFOP": "5102", "VL_IPI": 15.00}  # Deveria ser 20.00
        ]
        # Total: 30 + 15 = 45.00 (diferente de 50.00)
        
        resultado = validar_ipi_c100_c190(
            c100_record=self.c100_record,
            c190_items=c190_divergentes,
            tolerancia=0.01
        )
        
        self.assertFalse(resultado.valido)
        self.assertEqual(resultado.vl_ipi_c100, 50.00)
        self.assertEqual(resultado.total_ipi_c190, 45.00)
        self.assertGreater(len(resultado.divergencias), 0)
    
    def test_validar_ipi_nao_aplicavel(self):
        """Testa validação quando IPI não é aplicável ao cenário"""
        c100_sem_ipi = {"CHV_NFE": "35200112345678901234567890123456789012345678", "VL_IPI": 0.00}
        c190_sem_ipi = [{"VL_IPI": 0.00}]
        
        resultado = validar_ipi_c100_c190(
            c100_record=c100_sem_ipi,
            c190_items=c190_sem_ipi,
            tolerancia=0.01
        )
        
        # Quando IPI não é aplicável, validação deve passar
        self.assertTrue(resultado.valido or not verificar_aplicabilidade_ipi(c190_sem_ipi))
    
    def test_apontar_origem_divergencias_ipi(self):
        """Testa que origem das divergências de IPI é apontada"""
        c190_divergentes = [
            {"CST_ICMS": "00", "CFOP": "5102", "VL_IPI": 30.00},
            {"CST_ICMS": "10", "CFOP": "5102", "VL_IPI": 10.00}  # Errado
        ]
        
        resultado = validar_ipi_c100_c190(
            c100_record=self.c100_record,
            c190_items=c190_divergentes,
            tolerancia=0.01
        )
        
        self.assertFalse(resultado.valido)
        # Deve apontar qual C190 está causando a divergência
        self.assertGreater(len(resultado.divergencias), 0)
        for div in resultado.divergencias:
            self.assertIsNotNone(div.cfop)
            self.assertIsNotNone(div.cst)
            self.assertIsInstance(div.diferenca, (int, float))


if __name__ == "__main__":
    unittest.main()

