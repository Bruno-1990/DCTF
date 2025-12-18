#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Relatórios Avançados
Testa geração de relatórios completos.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from relatorios_avancados import (
    gerar_relatorio_divergencias,
    gerar_relatorio_correcoes,
    gerar_relatorio_auditoria,
    gerar_relatorio_executivo,
    exportar_relatorio_pdf,
    exportar_relatorio_excel
)


class TestRelatoriosAvancados(unittest.TestCase):
    """Testes para relatórios avançados"""
    
    def setUp(self):
        """Configurar dados de teste"""
        self.divergencias = [
            {"TIPO": "VL_ICMS_DIVERGENTE", "SEVERIDADE": "alta", "REGISTRO": "C170"},
            {"TIPO": "COD_ITEM_NAO_ENCONTRADO", "SEVERIDADE": "alta", "REGISTRO": "C170"}
        ]
        
        self.correcoes = [
            {"registro": "C170", "campo": "VL_ICMS", "valor_antes": 100.00, "valor_depois": 120.00}
        ]
    
    def test_gerar_relatorio_divergencias(self):
        """Testa geração de relatório completo de divergências"""
        relatorio = gerar_relatorio_divergencias(self.divergencias)
        
        self.assertIsInstance(relatorio, dict)
        self.assertIn("total_divergencias", relatorio)
        self.assertIn("divergencias", relatorio)
        self.assertEqual(relatorio["total_divergencias"], 2)
    
    def test_gerar_relatorio_correcoes(self):
        """Testa geração de relatório de correções aplicadas"""
        relatorio = gerar_relatorio_correcoes(self.correcoes)
        
        self.assertIsInstance(relatorio, dict)
        self.assertIn("total_correcoes", relatorio)
        self.assertIn("correcoes", relatorio)
    
    def test_gerar_relatorio_auditoria(self):
        """Testa geração de relatório de auditoria (rastreabilidade completa)"""
        relatorio = gerar_relatorio_auditoria(
            divergencias=self.divergencias,
            correcoes=self.correcoes
        )
        
        self.assertIsInstance(relatorio, dict)
        self.assertIn("rastreabilidade", relatorio)
    
    def test_gerar_relatorio_executivo(self):
        """Testa geração de relatório executivo (KPIs, métricas consolidadas)"""
        relatorio = gerar_relatorio_executivo(
            divergencias=self.divergencias,
            correcoes=self.correcoes
        )
        
        self.assertIsInstance(relatorio, dict)
        self.assertIn("kpis", relatorio)
        self.assertIn("metricas", relatorio)
    
    def test_exportar_relatorio_pdf(self):
        """Testa exportação de relatório em PDF"""
        relatorio = gerar_relatorio_divergencias(self.divergencias)
        resultado = exportar_relatorio_pdf(relatorio, "test_relatorio.pdf")
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("sucesso", resultado)
    
    def test_exportar_relatorio_excel(self):
        """Testa exportação de relatório em Excel"""
        relatorio = gerar_relatorio_divergencias(self.divergencias)
        resultado = exportar_relatorio_excel(relatorio, "test_relatorio.xlsx")
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("sucesso", resultado)


if __name__ == "__main__":
    unittest.main()

