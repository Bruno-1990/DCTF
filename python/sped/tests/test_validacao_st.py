#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Substituição Tributária (ST)
Testa tratamento correto de ICMS ST.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_st import (
    distinguir_icms_proprio_st,
    validar_st_contribuinte_substituido,
    identificar_st_sem_credito,
    validar_calculos_st,
    ResultadoValidacaoST
)


class TestValidacaoST(unittest.TestCase):
    """Testes para validação de ST"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C170 com ICMS próprio e ST
        self.c170_item = {
            "VL_BC_ICMS": 100.00,
            "VL_ICMS": 18.00,  # ICMS próprio
            "VL_BC_ICMS_ST": 120.00,
            "VL_ICMS_ST": 3.60  # ICMS ST
        }
    
    def test_distinguir_icms_proprio_st(self):
        """Testa distinção entre ICMS próprio e ICMS ST"""
        resultado = distinguir_icms_proprio_st(self.c170_item)
        
        self.assertEqual(resultado.icms_proprio, 18.00)
        self.assertEqual(resultado.icms_st, 3.60)
        self.assertEqual(resultado.base_icms_proprio, 100.00)
        self.assertEqual(resultado.base_icms_st, 120.00)
    
    def test_validar_st_contribuinte_substituido(self):
        """Testa validação para contribuinte apenas substituído"""
        # Contribuinte substituído não deve ter bloco/fechamentos de substituto
        c100_substituido = {
            "COD_SIT": "00",  # Documento autorizado
            "IND_EMIT": "0"  # Emissão própria
        }
        
        resultado = validar_st_contribuinte_substituido(
            c100_record=c100_substituido,
            c170_items=[self.c170_item],
            tem_bloco_substituto=False
        )
        
        # Se não tem bloco de substituto e é apenas substituído, deve passar
        self.assertTrue(resultado.valido or not resultado.exige_bloco_substituto)
    
    def test_identificar_st_sem_credito(self):
        """Testa identificação quando ST não gera crédito para adquirente"""
        # ST em operação interestadual para consumidor final não gera crédito
        c170_st_sem_credito = {
            "VL_BC_ICMS_ST": 120.00,
            "VL_ICMS_ST": 3.60,
            "CFOP": "6108",  # Venda interestadual para consumidor final
            "UF_DEST": "SP"
        }
        
        resultado = identificar_st_sem_credito(c170_st_sem_credito)
        self.assertTrue(resultado.st_sem_credito)
        self.assertIsNotNone(resultado.motivo)
    
    def test_validar_calculos_st(self):
        """Testa validação de cálculos de ST"""
        # ST = (Base ST - Base ICMS) * Alíquota ST
        c170_st = {
            "VL_BC_ICMS": 100.00,
            "VL_ICMS": 18.00,
            "VL_BC_ICMS_ST": 120.00,
            "VL_ICMS_ST": 3.60,
            "ALIQ_ICMS": 18.0,
            "ALIQ_ICMS_ST": 18.0
        }
        
        resultado = validar_calculos_st(c170_st, tolerancia=0.01)
        
        # ST = (120 - 100) * 18% = 3.60
        self.assertTrue(resultado.valido)
        self.assertAlmostEqual(resultado.st_calculado, 3.60, places=2)
    
    def test_validar_calculos_st_incorreto(self):
        """Testa validação quando cálculo de ST está incorreto"""
        c170_st_incorreto = {
            "VL_BC_ICMS": 100.00,
            "VL_ICMS": 18.00,
            "VL_BC_ICMS_ST": 120.00,
            "VL_ICMS_ST": 5.00,  # Deveria ser 3.60
            "ALIQ_ICMS": 18.0,
            "ALIQ_ICMS_ST": 18.0
        }
        
        resultado = validar_calculos_st(c170_st_incorreto, tolerancia=0.01)
        
        self.assertFalse(resultado.valido)
        self.assertGreater(resultado.diferenca, 0)


if __name__ == "__main__":
    unittest.main()

