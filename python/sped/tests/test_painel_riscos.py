#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Painel de Riscos
Testa classificação e visualização de riscos.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from painel_riscos import (
    classificar_risco,
    priorizar_risco,
    calcular_distribuicao_riscos,
    filtrar_riscos,
    ResultadoClassificacaoRisco
)


class TestPainelRiscos(unittest.TestCase):
    """Testes para painel de riscos"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # Divergência estrutural (afeta aceitação do arquivo)
        self.divergencia_estrutural = {
            "TIPO": "COD_PART_NAO_ENCONTRADO",
            "SEVERIDADE": "alta",
            "REGISTRO": "C100"
        }
        
        # Divergência fiscal (afeta créditos/débitos)
        self.divergencia_fiscal = {
            "TIPO": "VL_ICMS_DIVERGENTE",
            "SEVERIDADE": "alta",
            "REGISTRO": "C170"
        }
        
        # Divergência operacional (afeta prazos/retificações)
        self.divergencia_operacional = {
            "TIPO": "DATA_DOCUMENTO_INVALIDA",
            "SEVERIDADE": "media",
            "REGISTRO": "C100"
        }
    
    def test_classificar_risco_estrutural(self):
        """Testa classificação de risco estrutural"""
        resultado = classificar_risco(self.divergencia_estrutural)
        
        self.assertIsInstance(resultado, ResultadoClassificacaoRisco)
        self.assertEqual(resultado.tipo_risco, "estrutural")
    
    def test_classificar_risco_fiscal(self):
        """Testa classificação de risco fiscal"""
        resultado = classificar_risco(self.divergencia_fiscal)
        
        self.assertEqual(resultado.tipo_risco, "fiscal")
    
    def test_classificar_risco_operacional(self):
        """Testa classificação de risco operacional"""
        resultado = classificar_risco(self.divergencia_operacional)
        
        self.assertEqual(resultado.tipo_risco, "operacional")
    
    def test_priorizar_risco(self):
        """Testa priorização de riscos (alta, média, baixa)"""
        resultado = priorizar_risco(self.divergencia_estrutural)
        
        self.assertIn(resultado.prioridade, ["alta", "media", "baixa"])
        # Risco estrutural com severidade alta deve ter prioridade alta
        self.assertEqual(resultado.prioridade, "alta")
    
    def test_calcular_distribuicao_riscos(self):
        """Testa cálculo de distribuição de riscos"""
        divergencias = [
            self.divergencia_estrutural,
            self.divergencia_fiscal,
            self.divergencia_operacional
        ]
        
        distribuicao = calcular_distribuicao_riscos(divergencias)
        
        self.assertIsInstance(distribuicao, dict)
        self.assertIn("estrutural", distribuicao)
        self.assertIn("fiscal", distribuicao)
        self.assertIn("operacional", distribuicao)
    
    def test_filtrar_riscos(self):
        """Testa filtros por período, cliente, tipo de risco"""
        riscos = [
            {"TIPO": "COD_PART_NAO_ENCONTRADO", "SEVERIDADE": "alta", "periodo": "01/2024", "cliente": "CLI001"},
            {"TIPO": "VL_ICMS_DIVERGENTE", "SEVERIDADE": "alta", "periodo": "01/2024", "cliente": "CLI002"},
            {"TIPO": "COD_ITEM_NAO_ENCONTRADO", "SEVERIDADE": "alta", "periodo": "02/2024", "cliente": "CLI001"}
        ]
        
        # Filtrar por tipo
        riscos_filtrados = filtrar_riscos(riscos, tipo_risco="estrutural")
        self.assertEqual(len(riscos_filtrados), 2)
        
        # Filtrar por período
        riscos_filtrados = filtrar_riscos(riscos, periodo="01/2024")
        self.assertEqual(len(riscos_filtrados), 2)
        
        # Filtrar por cliente
        riscos_filtrados = filtrar_riscos(riscos, cliente="CLI001")
        self.assertEqual(len(riscos_filtrados), 2)


if __name__ == "__main__":
    unittest.main()

