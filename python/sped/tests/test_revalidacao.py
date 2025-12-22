#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Sistema de Revalidação
Testa endpoint e lógica de revalidação do SPED corrigido.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from revalidacao import (
    comparar_metricas_antes_depois,
    calcular_melhoria,
    MetricasValidacao,
    ResultadoComparacao
)


class TestRevalidacao(unittest.TestCase):
    """Testes para sistema de revalidação"""
    
    def setUp(self):
        """Configurar dados de teste"""
        self.metricas_antes = MetricasValidacao(
            total_divergencias=100,
            divergencias_alta=30,
            divergencias_media=50,
            divergencias_baixa=20,
            divergencias_legitimas=10
        )
        
        self.metricas_depois = MetricasValidacao(
            total_divergencias=50,
            divergencias_alta=10,
            divergencias_media=30,
            divergencias_baixa=10,
            divergencias_legitimas=5
        )
    
    def test_calcular_melhoria(self):
        """Testa cálculo de melhoria entre métricas antes/depois"""
        melhoria = calcular_melhoria(self.metricas_antes, self.metricas_depois)
        
        self.assertEqual(melhoria.reducao_total, 50)  # 100 - 50
        self.assertEqual(melhoria.reducao_alta, 20)  # 30 - 10
        self.assertEqual(melhoria.percentual_melhoria, 50.0)  # 50/100 * 100
    
    def test_comparar_metricas_antes_depois(self):
        """Testa comparação completa de métricas"""
        resultado = comparar_metricas_antes_depois(
            metricas_antes=self.metricas_antes,
            metricas_depois=self.metricas_depois
        )
        
        self.assertIsInstance(resultado, ResultadoComparacao)
        self.assertTrue(resultado.melhorou)
        self.assertEqual(resultado.reducao_total, 50)
    
    def test_comparar_metricas_piorou(self):
        """Testa comparação quando métricas pioraram"""
        metricas_pior = MetricasValidacao(
            total_divergencias=150,
            divergencias_alta=40,
            divergencias_media=80,
            divergencias_baixa=30,
            divergencias_legitimas=15
        )
        
        resultado = comparar_metricas_antes_depois(
            metricas_antes=self.metricas_antes,
            metricas_depois=metricas_pior
        )
        
        self.assertFalse(resultado.melhorou)
        self.assertLess(resultado.reducao_total, 0)  # Aumentou


if __name__ == "__main__":
    unittest.main()



