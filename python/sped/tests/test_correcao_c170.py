#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Algoritmo de Correção C170
Testa correções automáticas nos registros C170 baseadas em dados do XML.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from correcao_c170 import (
    corrigir_vl_item_c170,
    corrigir_qtd_c170,
    corrigir_cfop_c170,
    corrigir_cst_c170,
    corrigir_ncm_c170,
    normalizar_cfop,
    aplicar_correcoes_c170,
    ResultadoCorrecaoC170
)


class TestCorrecaoC170(unittest.TestCase):
    """Testes para algoritmo de correção C170"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C170 com valores incorretos
        self.c170_incorreto = {
            "NUM_ITEM": "1",
            "COD_ITEM": "PROD001",
            "VL_ITEM": 150.00,  # Deveria ser 100.00
            "QTD": 15.0,  # Deveria ser 10.0
            "CFOP": " 5102 ",  # Com espaços
            "CST_ICMS": "10",  # Deveria ser "00"
            "NCM": "12345678"
        }
        
        # XML com valores corretos
        self.xml_item_correto = {
            "nItem": "1",
            "vProd": 100.00,
            "qCom": 10.0,
            "CFOP": "5102",
            "CST": "00",
            "NCM": "12345678"
        }
        
        # Score de confiança alto (permite correção)
        self.score_alto = 85.0
        
        # Score de confiança baixo (não permite correção)
        self.score_baixo = 30.0
    
    def test_normalizar_cfop(self):
        """Testa normalização de CFOP (remover espaços, zeros à esquerda)"""
        # CFOP com espaços
        self.assertEqual(normalizar_cfop(" 5102 "), "5102")
        
        # CFOP com zeros à esquerda
        self.assertEqual(normalizar_cfop("05102"), "5102")
        
        # CFOP já normalizado
        self.assertEqual(normalizar_cfop("5102"), "5102")
        
        # CFOP None ou vazio
        self.assertEqual(normalizar_cfop(None), "")
        self.assertEqual(normalizar_cfop(""), "")
    
    def test_corrigir_vl_item_c170(self):
        """Testa correção de VL_ITEM baseado em XML"""
        resultado = corrigir_vl_item_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=self.score_alto
        )
        
        self.assertIsInstance(resultado, ResultadoCorrecaoC170)
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "VL_ITEM")
        self.assertEqual(resultado.valor_antigo, 150.00)
        self.assertEqual(resultado.valor_novo, 100.00)
        self.assertIsNotNone(resultado.timestamp)
    
    def test_corrigir_vl_item_score_insuficiente(self):
        """Testa que correção não é aplicada com score insuficiente"""
        resultado = corrigir_vl_item_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=self.score_baixo
        )
        
        self.assertFalse(resultado.corrigido)
        self.assertIsNone(resultado.campo_corrigido)
    
    def test_corrigir_qtd_c170(self):
        """Testa correção de QTD baseado em XML"""
        resultado = corrigir_qtd_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=self.score_alto
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "QTD")
        self.assertEqual(resultado.valor_antigo, 15.0)
        self.assertEqual(resultado.valor_novo, 10.0)
    
    def test_corrigir_cfop_c170(self):
        """Testa correção de CFOP quando score ≥ 50%"""
        # C170 com CFOP diferente do XML
        c170_cfop_diferente = self.c170_incorreto.copy()
        c170_cfop_diferente["CFOP"] = "6102"  # CFOP diferente
        
        resultado = corrigir_cfop_c170(
            c170_item=c170_cfop_diferente,
            xml_item=self.xml_item_correto,
            score=60.0  # Score suficiente
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "CFOP")
        self.assertEqual(resultado.valor_antigo, "6102")
        self.assertEqual(resultado.valor_novo, "5102")  # Normalizado
    
    def test_corrigir_cfop_score_insuficiente(self):
        """Testa que CFOP não é corrigido com score < 50%"""
        resultado = corrigir_cfop_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=40.0  # Score insuficiente
        )
        
        self.assertFalse(resultado.corrigido)
    
    def test_corrigir_cst_c170(self):
        """Testa correção de CST quando score ≥ 50%"""
        resultado = corrigir_cst_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=60.0
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "CST_ICMS")
        self.assertEqual(resultado.valor_antigo, "10")
        self.assertEqual(resultado.valor_novo, "00")
    
    def test_corrigir_ncm_c170(self):
        """Testa correção de NCM quando score ≥ 50%"""
        # C170 com NCM errado
        c170_ncm_errado = self.c170_incorreto.copy()
        c170_ncm_errado["NCM"] = "99999999"
        
        resultado = corrigir_ncm_c170(
            c170_item=c170_ncm_errado,
            xml_item=self.xml_item_correto,
            score=60.0
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "NCM")
        self.assertEqual(resultado.valor_antigo, "99999999")
        self.assertEqual(resultado.valor_novo, "12345678")
    
    def test_aplicar_correcoes_c170_multiplas(self):
        """Testa aplicação de múltiplas correções em um C170"""
        resultado = aplicar_correcoes_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=self.score_alto
        )
        
        self.assertIsInstance(resultado, ResultadoCorrecaoC170)
        self.assertTrue(resultado.corrigido)
        # Deve ter corrigido VL_ITEM, QTD e CFOP (normalização)
        self.assertGreater(len(resultado.correcoes_aplicadas), 0)
    
    def test_log_detalhado_correcao(self):
        """Testa que log detalhado é gerado para cada correção"""
        resultado = corrigir_vl_item_c170(
            c170_item=self.c170_incorreto,
            xml_item=self.xml_item_correto,
            score=self.score_alto
        )
        
        self.assertIsNotNone(resultado.log)
        self.assertIn("VL_ITEM", resultado.log)
        self.assertIn("150.00", resultado.log)  # Valor antigo
        self.assertIn("100.00", resultado.log)  # Valor novo
        # Verificar que tem timestamp (formato ISO)
        self.assertIsNotNone(resultado.timestamp)
        self.assertIn("2025", resultado.log or "")  # Ano no timestamp


if __name__ == "__main__":
    unittest.main()

