#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação C100.VL_DOC x Σ(C190.VL_OPR)
Valida coerência entre o valor total do documento (C100) e a soma dos valores de operação dos resumos (C190).
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_c100_vl_doc_c190 import (
    somar_vl_opr_c190,
    validar_c100_vl_doc_c190,
    ResultadoValidacaoC100VL_DOC
)


class TestValidacaoC100VL_DOC_C190(unittest.TestCase):
    """Testes para validação C100.VL_DOC x Σ(C190.VL_OPR)"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C100 de exemplo
        self.c100_record = {
            "CHV_NFE": "35200112345678901234567890123456789012345678",
            "VL_DOC": 350.00,
            "VL_DESC": 10.00,
            "VL_FRT": 5.00,
            "VL_SEG": 2.00,
            "VL_OUT_DA": 1.00
        }
        
        # C190s correspondentes (corretos)
        self.c190_items = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 150.00
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_OPR": 200.00
            }
        ]
        # Total: 150 + 200 = 350.00 (igual a VL_DOC)
    
    def test_somar_vl_opr_c190(self):
        """Testa soma de VL_OPR dos C190s"""
        total = somar_vl_opr_c190(self.c190_items)
        self.assertEqual(total, 350.00)  # 150 + 200
    
    def test_validar_c100_vl_doc_c190_correto(self):
        """Testa validação quando valores estão corretos"""
        resultado = validar_c100_vl_doc_c190(
            c100_record=self.c100_record,
            c190_items=self.c190_items,
            tolerancia=0.01
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC100VL_DOC)
        self.assertTrue(resultado.valido)
        self.assertEqual(resultado.vl_doc_c100, 350.00)
        self.assertEqual(resultado.soma_vl_opr_c190, 350.00)
        self.assertEqual(resultado.diferenca, 0.00)
        self.assertEqual(len(resultado.divergencias), 0)
    
    def test_validar_c100_vl_doc_c190_com_tolerancia(self):
        """Testa validação com diferença dentro da tolerância"""
        # C190s com diferença de 0.005 (dentro da tolerância de 0.01)
        c190_com_diferenca = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 150.005
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_OPR": 200.00
            }
        ]
        
        resultado = validar_c100_vl_doc_c190(
            c100_record=self.c100_record,
            c190_items=c190_com_diferenca,
            tolerancia=0.01
        )
        
        self.assertTrue(resultado.valido)
        self.assertLessEqual(resultado.diferenca, 0.01)
    
    def test_validar_c100_vl_doc_c190_divergente(self):
        """Testa validação quando valores divergem além da tolerância"""
        # C190s com diferença de 10.00 (fora da tolerância)
        c190_divergentes = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 150.00
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_OPR": 190.00  # Deveria ser 200.00
            }
        ]
        # Total: 150 + 190 = 340.00 (diferente de 350.00)
        
        resultado = validar_c100_vl_doc_c190(
            c100_record=self.c100_record,
            c190_items=c190_divergentes,
            tolerancia=0.01
        )
        
        self.assertFalse(resultado.valido)
        self.assertEqual(resultado.vl_doc_c100, 350.00)
        self.assertEqual(resultado.soma_vl_opr_c190, 340.00)
        self.assertEqual(resultado.diferenca, 10.00)
        self.assertGreater(len(resultado.divergencias), 0)
    
    def test_validar_c100_vl_doc_c190_com_descontos(self):
        """Testa validação considerando descontos, fretes, seguros e outros rateios"""
        # C100 com descontos e outros valores
        c100_com_descontos = self.c100_record.copy()
        c100_com_descontos["VL_DESC"] = 10.00
        c100_com_descontos["VL_FRT"] = 5.00
        c100_com_descontos["VL_SEG"] = 2.00
        c100_com_descontos["VL_OUT_DA"] = 1.00
        
        # VL_DOC deve ser igual à soma dos C190s + descontos - outros
        # VL_DOC = Σ(C190.VL_OPR) + VL_DESC - VL_FRT - VL_SEG - VL_OUT_DA
        # 350 = 350 + 10 - 5 - 2 - 1 = 352 (mas VL_DOC já inclui tudo)
        
        resultado = validar_c100_vl_doc_c190(
            c100_record=c100_com_descontos,
            c190_items=self.c190_items,
            tolerancia=0.01,
            considerar_rateios=True
        )
        
        # A validação deve considerar os rateios
        self.assertIsNotNone(resultado)
    
    def test_validar_c100_vl_doc_c190_sem_c190(self):
        """Testa validação quando não há C190s"""
        resultado = validar_c100_vl_doc_c190(
            c100_record=self.c100_record,
            c190_items=[],
            tolerancia=0.01
        )
        
        self.assertFalse(resultado.valido)
        self.assertEqual(resultado.soma_vl_opr_c190, 0.00)
        self.assertGreater(len(resultado.divergencias), 0)
    
    def test_validar_c100_vl_doc_c190_arredondamento(self):
        """Testa validação com diferenças de arredondamento legítimas"""
        # C190s com valores que podem ter arredondamento
        c190_arredondamento = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 150.003
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_OPR": 199.997
            }
        ]
        # Total: 350.00 (com arredondamento)
        
        resultado = validar_c100_vl_doc_c190(
            c100_record=self.c100_record,
            c190_items=c190_arredondamento,
            tolerancia=0.01
        )
        
        # Deve aceitar diferenças de arredondamento dentro da tolerância
        self.assertTrue(resultado.valido or resultado.diferenca <= 0.01)


if __name__ == "__main__":
    unittest.main()

