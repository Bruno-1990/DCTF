#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Recálculo Automático de C190
Testa recálculo de C190 automaticamente após correção de C170.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from recalculo_c190 import (
    agrupar_c170s_por_combinacao,
    calcular_totais_c190,
    criar_c190,
    atualizar_c190,
    recalcular_c190_apos_correcao_c170,
    ResultadoRecalculoC190
)


class TestRecalculoC190(unittest.TestCase):
    """Testes para recálculo automático de C190"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C170s corrigidos
        self.c170_items_corrigidos = [
            {
                "NUM_ITEM": "1",
                "CST_ICMS": "00",
                "CFOP": "5102",
                "ALIQ_ICMS": "18.00",
                "VL_OPR": 100.00,  # Corrigido
                "VL_BC_ICMS": 100.00,
                "VL_ICMS": 18.00
            },
            {
                "NUM_ITEM": "2",
                "CST_ICMS": "00",
                "CFOP": "5102",
                "ALIQ_ICMS": "18.00",
                "VL_OPR": 50.00,  # Corrigido
                "VL_BC_ICMS": 50.00,
                "VL_ICMS": 9.00
            }
        ]
        
        # C190 existente (pode estar desatualizado)
        self.c190_existente = {
            "CST_ICMS": "00",
            "CFOP": "5102",
            "ALIQ_ICMS": "18.00",
            "VL_OPR": 200.00,  # Valor antigo (deveria ser 150.00)
            "VL_BC_ICMS": 200.00,
            "VL_ICMS": 36.00
        }
    
    def test_agrupar_c170s_por_combinacao(self):
        """Testa agrupamento de C170s por combinação (CST, CFOP, ALIQ)"""
        grupos = agrupar_c170s_por_combinacao(self.c170_items_corrigidos)
        
        # Deve ter 1 grupo: (00, 5102, 18.00)
        self.assertEqual(len(grupos), 1)
        
        grupo = grupos.get(("00", "5102", "18.00"))
        self.assertIsNotNone(grupo)
        self.assertEqual(len(grupo), 2)  # 2 C170s com essa combinação
    
    def test_calcular_totais_c190(self):
        """Testa cálculo de totais esperados para C190"""
        grupos = agrupar_c170s_por_combinacao(self.c170_items_corrigidos)
        grupo = grupos.get(("00", "5102", "18.00"))
        
        totais = calcular_totais_c190(grupo)
        
        self.assertEqual(totais["VL_OPR"], 150.00)  # 100 + 50
        self.assertEqual(totais["VL_BC_ICMS"], 150.00)  # 100 + 50
        self.assertEqual(totais["VL_ICMS"], 27.00)  # 18 + 9
    
    def test_criar_c190(self):
        """Testa criação de C190 quando não existe"""
        grupos = agrupar_c170s_por_combinacao(self.c170_items_corrigidos)
        grupo = grupos.get(("00", "5102", "18.00"))
        totais = calcular_totais_c190(grupo)
        
        c190_novo = criar_c190(
            combinacao=("00", "5102", "18.00"),
            totais=totais
        )
        
        self.assertIsNotNone(c190_novo)
        self.assertEqual(c190_novo["CST_ICMS"], "00")
        self.assertEqual(c190_novo["CFOP"], "5102")
        self.assertEqual(c190_novo["ALIQ_ICMS"], "18.00")
        self.assertEqual(c190_novo["VL_OPR"], 150.00)
        self.assertEqual(c190_novo["VL_BC_ICMS"], 150.00)
        self.assertEqual(c190_novo["VL_ICMS"], 27.00)
    
    def test_atualizar_c190(self):
        """Testa atualização de C190 existente com novos totais"""
        grupos = agrupar_c170s_por_combinacao(self.c170_items_corrigidos)
        grupo = grupos.get(("00", "5102", "18.00"))
        totais = calcular_totais_c190(grupo)
        
        c190_atualizado = atualizar_c190(
            c190_existente=self.c190_existente,
            totais=totais
        )
        
        self.assertEqual(c190_atualizado["VL_OPR"], 150.00)  # Atualizado
        self.assertEqual(c190_atualizado["VL_BC_ICMS"], 150.00)  # Atualizado
        self.assertEqual(c190_atualizado["VL_ICMS"], 27.00)  # Atualizado
        # Campos de identificação devem permanecer
        self.assertEqual(c190_atualizado["CST_ICMS"], "00")
        self.assertEqual(c190_atualizado["CFOP"], "5102")
    
    def test_recalcular_c190_apos_correcao_c170(self):
        """Testa recálculo completo de C190 após correção de C170"""
        resultado = recalcular_c190_apos_correcao_c170(
            c170_items_corrigidos=self.c170_items_corrigidos,
            c190_existente=self.c190_existente
        )
        
        self.assertIsInstance(resultado, ResultadoRecalculoC190)
        self.assertTrue(resultado.recalculado)
        self.assertIsNotNone(resultado.c190_atualizado)
        self.assertEqual(resultado.c190_atualizado["VL_OPR"], 150.00)
        self.assertEqual(len(resultado.c170s_agrupados), 2)
    
    def test_recalcular_c190_criar_novo(self):
        """Testa criação de C190 quando não existe"""
        resultado = recalcular_c190_apos_correcao_c170(
            c170_items_corrigidos=self.c170_items_corrigidos,
            c190_existente=None  # C190 não existe
        )
        
        self.assertTrue(resultado.recalculado)
        self.assertTrue(resultado.c190_criado)
        self.assertIsNotNone(resultado.c190_atualizado)
        self.assertEqual(resultado.c190_atualizado["VL_OPR"], 150.00)
    
    def test_validar_coerencia_totais_recalculados(self):
        """Testa validação de coerência dos totais recalculados"""
        grupos = agrupar_c170s_por_combinacao(self.c170_items_corrigidos)
        grupo = grupos.get(("00", "5102", "18.00"))
        totais = calcular_totais_c190(grupo)
        
        # Validar que totais fazem sentido
        self.assertGreater(totais["VL_OPR"], 0)
        self.assertGreaterEqual(totais["VL_BC_ICMS"], 0)
        self.assertGreaterEqual(totais["VL_ICMS"], 0)
        # VL_ICMS deve ser aproximadamente ALIQ * VL_BC_ICMS
        aliq = 18.0 / 100.0
        vl_icms_esperado = totais["VL_BC_ICMS"] * aliq
        self.assertAlmostEqual(totais["VL_ICMS"], vl_icms_esperado, places=2)


if __name__ == "__main__":
    unittest.main()

