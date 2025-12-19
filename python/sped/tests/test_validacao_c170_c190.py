#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação C170 → C190 (Resumo por CST/CFOP/ALIQ)
Valida coerência entre os itens (C170) e os resumos (C190) agrupados por combinação CST/CFOP/ALIQ.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys
import tempfile

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_c170_c190 import (
    agrupar_c170_por_combinacao,
    calcular_totais_esperados_c170,
    comparar_c170_c190,
    validar_c170_c190,
    ResultadoValidacaoC170C190
)


class TestValidacaoC170C190(unittest.TestCase):
    """Testes para validação C170 → C190"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C170s de exemplo agrupados por (CST, CFOP, ALIQ)
        self.c170_items = [
            {
                "NUM_ITEM": "1",
                "CST_ICMS": "00",
                "CFOP": "5102",
                "ALIQ_ICMS": "18.00",
                "VL_OPR": 100.00,
                "VL_BC_ICMS": 100.00,
                "VL_ICMS": 18.00
            },
            {
                "NUM_ITEM": "2",
                "CST_ICMS": "00",
                "CFOP": "5102",
                "ALIQ_ICMS": "18.00",
                "VL_OPR": 50.00,
                "VL_BC_ICMS": 50.00,
                "VL_ICMS": 9.00
            },
            {
                "NUM_ITEM": "3",
                "CST_ICMS": "10",
                "CFOP": "5102",
                "ALIQ_ICMS": "12.00",
                "VL_OPR": 200.00,
                "VL_BC_ICMS": 200.00,
                "VL_ICMS": 24.00
            }
        ]
        
        # C190s correspondentes (corretos)
        self.c190_items = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 150.00,  # 100 + 50
                "VL_BC_ICMS": 150.00,
                "VL_ICMS": 27.00  # 18 + 9
            },
            {
                "CST_ICMS": "10",
                "CFOP": "5102",
                "VL_OPR": 200.00,
                "VL_BC_ICMS": 200.00,
                "VL_ICMS": 24.00
            }
        ]
    
    def test_agrupar_c170_por_combinacao(self):
        """Testa agrupamento de C170s por combinação (CST, CFOP, ALIQ)"""
        grupos = agrupar_c170_por_combinacao(self.c170_items)
        
        # Deve ter 2 grupos: (00, 5102, 18.00) e (10, 5102, 12.00)
        self.assertEqual(len(grupos), 2)
        
        # Verificar grupo CST=00, CFOP=5102, ALIQ=18.00
        grupo_00 = grupos.get(("00", "5102", "18.00"))
        self.assertIsNotNone(grupo_00)
        self.assertEqual(len(grupo_00), 2)  # 2 itens com essa combinação
        
        # Verificar grupo CST=10, CFOP=5102, ALIQ=12.00
        grupo_10 = grupos.get(("10", "5102", "12.00"))
        self.assertIsNotNone(grupo_10)
        self.assertEqual(len(grupo_10), 1)  # 1 item com essa combinação
    
    def test_calcular_totais_esperados_c170(self):
        """Testa cálculo de totais esperados de VL_OPR, VL_BC_ICMS, VL_ICMS"""
        grupos = agrupar_c170_por_combinacao(self.c170_items)
        
        # Calcular totais para grupo CST=00, CFOP=5102, ALIQ=18.00
        grupo_00 = grupos.get(("00", "5102", "18.00"))
        totais = calcular_totais_esperados_c170(grupo_00)
        
        self.assertEqual(totais["VL_OPR"], 150.00)  # 100 + 50
        self.assertEqual(totais["VL_BC_ICMS"], 150.00)  # 100 + 50
        self.assertEqual(totais["VL_ICMS"], 27.00)  # 18 + 9
    
    def test_comparar_c170_c190_corretos(self):
        """Testa comparação quando C170 e C190 estão corretos"""
        grupos = agrupar_c170_por_combinacao(self.c170_items)
        
        # Comparar grupo CST=00
        grupo_00 = grupos.get(("00", "5102", "18.00"))
        totais_c170 = calcular_totais_esperados_c170(grupo_00)
        c190_00 = self.c190_items[0]
        
        resultado = comparar_c170_c190(
            combinacao=("00", "5102", "18.00"),
            totais_c170=totais_c170,
            c190_item=c190_00
        )
        
        self.assertTrue(resultado["valido"])
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_comparar_c170_c190_divergente_vl_opr(self):
        """Testa comparação quando VL_OPR diverge"""
        grupos = agrupar_c170_por_combinacao(self.c170_items)
        grupo_00 = grupos.get(("00", "5102", "18.00"))
        totais_c170 = calcular_totais_esperados_c170(grupo_00)
        
        # C190 com VL_OPR errado
        c190_errado = self.c190_items[0].copy()
        c190_errado["VL_OPR"] = 200.00  # Deveria ser 150.00
        
        resultado = comparar_c170_c190(
            combinacao=("00", "5102", "18.00"),
            totais_c170=totais_c170,
            c190_item=c190_errado
        )
        
        self.assertFalse(resultado["valido"])
        vl_opr_divs = [d for d in resultado["divergencias"] if d["campo"] == "VL_OPR"]
        self.assertGreater(len(vl_opr_divs), 0)
    
    def test_comparar_c170_c190_divergente_vl_icms(self):
        """Testa comparação quando VL_ICMS diverge"""
        grupos = agrupar_c170_por_combinacao(self.c170_items)
        grupo_00 = grupos.get(("00", "5102", "18.00"))
        totais_c170 = calcular_totais_esperados_c170(grupo_00)
        
        # C190 com VL_ICMS errado
        c190_errado = self.c190_items[0].copy()
        c190_errado["VL_ICMS"] = 30.00  # Deveria ser 27.00
        
        resultado = comparar_c170_c190(
            combinacao=("00", "5102", "18.00"),
            totais_c170=totais_c170,
            c190_item=c190_errado
        )
        
        self.assertFalse(resultado["valido"])
        vl_icms_divs = [d for d in resultado["divergencias"] if d["campo"] == "VL_ICMS"]
        self.assertGreater(len(vl_icms_divs), 0)
    
    def test_validar_c170_c190_c190_faltante(self):
        """Testa validação quando falta C190 para uma combinação"""
        # Adicionar C170 com combinação que não tem C190
        c170_items_com_novo = self.c170_items + [
            {
                "NUM_ITEM": "4",
                "CST_ICMS": "20",
                "CFOP": "5102",
                "ALIQ_ICMS": "7.00",
                "VL_OPR": 300.00,
                "VL_BC_ICMS": 300.00,
                "VL_ICMS": 21.00
            }
        ]
        
        resultado = validar_c170_c190(
            c170_items=c170_items_com_novo,
            c190_items=self.c190_items
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC170C190)
        # Deve detectar C190 faltante para combinação (20, 5102, 7.00)
        c190_faltantes = [c for c in resultado.c190_faltantes if c["CST"] == "20"]
        self.assertGreater(len(c190_faltantes), 0)
    
    def test_validar_c170_c190_completo(self):
        """Testa validação completa C170 → C190"""
        resultado = validar_c170_c190(
            c170_items=self.c170_items,
            c190_items=self.c190_items
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC170C190)
        self.assertEqual(len(resultado.divergencias), 0)
        self.assertEqual(len(resultado.c190_faltantes), 0)
        self.assertEqual(len(resultado.combinacoes_validas), 2)
    
    def test_validar_c170_c190_com_divergencias(self):
        """Testa validação completa com divergências"""
        # C190 com valores errados
        c190_divergentes = [
            {
                "CST_ICMS": "00",
                "CFOP": "5102",
                "VL_OPR": 200.00,  # Errado: deveria ser 150.00
                "VL_BC_ICMS": 150.00,
                "VL_ICMS": 30.00  # Errado: deveria ser 27.00
            }
        ]
        
        resultado = validar_c170_c190(
            c170_items=self.c170_items,
            c190_items=c190_divergentes
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC170C190)
        self.assertGreater(len(resultado.divergencias), 0)
        # Deve ter divergências de VL_OPR e VL_ICMS
        vl_opr_divs = [d for d in resultado.divergencias if d.campo == "VL_OPR"]
        vl_icms_divs = [d for d in resultado.divergencias if d.campo == "VL_ICMS"]
        self.assertGreater(len(vl_opr_divs), 0)
        self.assertGreater(len(vl_icms_divs), 0)


if __name__ == "__main__":
    unittest.main()


