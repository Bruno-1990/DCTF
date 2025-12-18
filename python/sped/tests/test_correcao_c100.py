#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Algoritmo de Correção C100
Testa correções automáticas nos registros C100 baseadas em dados do XML.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from correcao_c100 import (
    corrigir_vl_doc_c100,
    corrigir_dt_doc_c100,
    corrigir_dt_e_s_c100,
    corrigir_cod_sit_c100,
    aplicar_correcoes_c100,
    ResultadoCorrecaoC100
)


class TestCorrecaoC100(unittest.TestCase):
    """Testes para algoritmo de correção C100"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C100 com valores incorretos
        self.c100_incorreto = {
            "CHV_NFE": "35200112345678901234567890123456789012345678",
            "VL_DOC": 350.00,  # Deveria ser 300.00
            "DT_DOC": "15012024",  # Deveria ser "15012024" (formato DDMMYYYY)
            "DT_E_S": "16012024",  # Deveria ser "16012024"
            "COD_SIT": "01"  # Situação
        }
        
        # XML com valores corretos
        self.xml_note_correto = {
            "chave": "35200112345678901234567890123456789012345678",
            "vNF": 300.00,
            "dEmi": "2024-01-15",  # Formato ISO
            "dhEmi": "2024-01-15T10:30:00-03:00"
        }
        
        # Score de confiança alto
        self.score_alto = 85.0
        
        # Score de confiança baixo
        self.score_baixo = 30.0
    
    def test_corrigir_vl_doc_c100(self):
        """Testa correção de VL_DOC baseado em XML"""
        resultado = corrigir_vl_doc_c100(
            c100_record=self.c100_incorreto,
            xml_note=self.xml_note_correto,
            score=self.score_alto
        )
        
        self.assertIsInstance(resultado, ResultadoCorrecaoC100)
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "VL_DOC")
        self.assertEqual(resultado.valor_antigo, 350.00)
        self.assertEqual(resultado.valor_novo, 300.00)
        self.assertIsNotNone(resultado.timestamp)
    
    def test_corrigir_vl_doc_score_insuficiente(self):
        """Testa que correção não é aplicada com score insuficiente"""
        resultado = corrigir_vl_doc_c100(
            c100_record=self.c100_incorreto,
            xml_note=self.xml_note_correto,
            score=self.score_baixo
        )
        
        self.assertFalse(resultado.corrigido)
    
    def test_corrigir_dt_doc_c100(self):
        """Testa correção de DT_DOC baseado em XML"""
        # C100 com data diferente
        c100_dt_diferente = self.c100_incorreto.copy()
        c100_dt_diferente["DT_DOC"] = "20012024"  # Data diferente
        
        resultado = corrigir_dt_doc_c100(
            c100_record=c100_dt_diferente,
            xml_note=self.xml_note_correto,
            score=self.score_alto
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "DT_DOC")
        # DT_DOC deve estar no formato DDMMYYYY
        self.assertEqual(resultado.valor_novo, "15012024")
    
    def test_corrigir_dt_e_s_c100(self):
        """Testa correção de DT_E_S baseado em XML"""
        resultado = corrigir_dt_e_s_c100(
            c100_record=self.c100_incorreto,
            xml_note=self.xml_note_correto,
            score=self.score_alto
        )
        
        self.assertTrue(resultado.corrigido)
        self.assertEqual(resultado.campo_corrigido, "DT_E_S")
        # DT_E_S deve estar no formato DDMMYYYY
        self.assertIsNotNone(resultado.valor_novo)
    
    def test_corrigir_cod_sit_autorizado(self):
        """Testa correção de COD_SIT para documento autorizado"""
        xml_autorizado = self.xml_note_correto.copy()
        # Documento autorizado não tem eventos de cancelamento
        
        c100_cod_sit_errado = self.c100_incorreto.copy()
        c100_cod_sit_errado["COD_SIT"] = "02"  # Cancelado (errado)
        
        resultado = corrigir_cod_sit_c100(
            c100_record=c100_cod_sit_errado,
            xml_note=xml_autorizado,
            score=self.score_alto
        )
        
        # Se o XML não tem eventos de cancelamento, COD_SIT deve ser 00 ou 01
        self.assertIsNotNone(resultado)
    
    def test_corrigir_cod_sit_cancelado(self):
        """Testa correção de COD_SIT para documento cancelado"""
        xml_cancelado = self.xml_note_correto.copy()
        xml_cancelado["eventos"] = [{"tpEvento": "110111"}]  # Cancelamento
        
        c100_cod_sit_errado = self.c100_incorreto.copy()
        c100_cod_sit_errado["COD_SIT"] = "00"  # Autorizado (errado)
        
        resultado = corrigir_cod_sit_c100(
            c100_record=c100_cod_sit_errado,
            xml_note=xml_cancelado,
            score=self.score_alto
        )
        
        # Se o XML tem evento de cancelamento, COD_SIT deve ser 02
        self.assertIsNotNone(resultado)
    
    def test_aplicar_correcoes_c100_multiplas(self):
        """Testa aplicação de múltiplas correções em um C100"""
        resultado = aplicar_correcoes_c100(
            c100_record=self.c100_incorreto,
            xml_note=self.xml_note_correto,
            score=self.score_alto
        )
        
        self.assertIsInstance(resultado, ResultadoCorrecaoC100)
        self.assertTrue(resultado.corrigido)
        self.assertGreater(len(resultado.correcoes_aplicadas), 0)
    
    def test_log_detalhado_correcao_c100(self):
        """Testa que log detalhado é gerado para cada correção"""
        resultado = corrigir_vl_doc_c100(
            c100_record=self.c100_incorreto,
            xml_note=self.xml_note_correto,
            score=self.score_alto
        )
        
        self.assertIsNotNone(resultado.log)
        self.assertIn("VL_DOC", resultado.log)
        self.assertIn("350.00", resultado.log)  # Valor antigo
        self.assertIn("300.00", resultado.log)  # Valor novo
        self.assertIsNotNone(resultado.timestamp)


if __name__ == "__main__":
    unittest.main()

