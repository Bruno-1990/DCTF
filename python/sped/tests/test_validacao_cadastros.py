#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Cadastros
Testa validação de cadastros 0150, 0200, 0190, 0220.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_cadastros import (
    validar_cadastro_participantes,
    validar_cadastro_itens,
    validar_cadastro_unidades,
    validar_conversao_unidades,
    ResultadoValidacaoCadastros
)


class TestValidacaoCadastros(unittest.TestCase):
    """Testes para validação de cadastros"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # Cadastros válidos
        self.cadastro_0150 = {
            "PART001": {"COD_PART": "PART001", "NOME": "Fornecedor 1"},
            "PART002": {"COD_PART": "PART002", "NOME": "Cliente 1"}
        }
        
        self.cadastro_0200 = {
            "ITEM001": {"COD_ITEM": "ITEM001", "DESCR_ITEM": "Produto 1"},
            "ITEM002": {"COD_ITEM": "ITEM002", "DESCR_ITEM": "Produto 2"}
        }
        
        self.cadastro_0190 = {
            "UN": {"UNID": "UN", "DESCR": "Unidade"},
            "KG": {"UNID": "KG", "DESCR": "Quilograma"}
        }
        
        # C100 com COD_PART válido
        self.c100_valido = {
            "COD_PART": "PART001"
        }
        
        # C100 com COD_PART inválido
        self.c100_invalido = {
            "COD_PART": "PART999"  # Não existe no cadastro
        }
        
        # C170 com COD_ITEM e UNID válidos
        self.c170_valido = {
            "COD_ITEM": "ITEM001",
            "UNID": "UN"
        }
        
        # C170 com COD_ITEM inválido
        self.c170_invalido = {
            "COD_ITEM": "ITEM999",  # Não existe no cadastro
            "UNID": "UN"
        }
    
    def test_validar_cadastro_participantes_valido(self):
        """Testa validação quando COD_PART existe no cadastro"""
        resultado = validar_cadastro_participantes(
            c100_records=[self.c100_valido],
            cadastro_0150=self.cadastro_0150
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoCadastros)
        self.assertTrue(resultado.valido)
        self.assertEqual(len(resultado.codigos_nao_encontrados), 0)
    
    def test_validar_cadastro_participantes_invalido(self):
        """Testa validação quando COD_PART não existe no cadastro"""
        resultado = validar_cadastro_participantes(
            c100_records=[self.c100_invalido],
            cadastro_0150=self.cadastro_0150
        )
        
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.codigos_nao_encontrados), 0)
        self.assertIn("PART999", resultado.codigos_nao_encontrados)
        self.assertEqual(resultado.severidade, "alta")  # Erro estrutural
    
    def test_validar_cadastro_itens_valido(self):
        """Testa validação quando COD_ITEM existe no cadastro"""
        resultado = validar_cadastro_itens(
            c170_records=[self.c170_valido],
            cadastro_0200=self.cadastro_0200
        )
        
        self.assertTrue(resultado.valido)
        self.assertEqual(len(resultado.codigos_nao_encontrados), 0)
    
    def test_validar_cadastro_itens_invalido(self):
        """Testa validação quando COD_ITEM não existe no cadastro"""
        resultado = validar_cadastro_itens(
            c170_records=[self.c170_invalido],
            cadastro_0200=self.cadastro_0200
        )
        
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.codigos_nao_encontrados), 0)
        self.assertIn("ITEM999", resultado.codigos_nao_encontrados)
        self.assertEqual(resultado.severidade, "alta")
    
    def test_validar_cadastro_unidades_valido(self):
        """Testa validação quando UNID existe no cadastro"""
        resultado = validar_cadastro_unidades(
            c170_records=[self.c170_valido],
            cadastro_0190=self.cadastro_0190
        )
        
        self.assertTrue(resultado.valido)
        self.assertEqual(len(resultado.codigos_nao_encontrados), 0)
    
    def test_validar_cadastro_unidades_invalido(self):
        """Testa validação quando UNID não existe no cadastro"""
        c170_unid_invalida = {
            "COD_ITEM": "ITEM001",
            "UNID": "XXX"  # Não existe no cadastro
        }
        
        resultado = validar_cadastro_unidades(
            c170_records=[c170_unid_invalida],
            cadastro_0190=self.cadastro_0190
        )
        
        self.assertFalse(resultado.valido)
        self.assertGreater(len(resultado.codigos_nao_encontrados), 0)
        self.assertIn("XXX", resultado.codigos_nao_encontrados)
    
    def test_validar_conversao_unidades(self):
        """Testa validação de coerência na conversão de unidades (0220)"""
        cadastro_0220 = {
            "ITEM001": {
                "COD_ITEM": "ITEM001",
                "UNID": "UN",
                "FATOR_CONV": 10.0  # 1 UN = 10 KG
            }
        }
        
        c170_com_conversao = {
            "COD_ITEM": "ITEM001",
            "UNID": "UN",
            "QTD": 1.0
        }
        
        resultado = validar_conversao_unidades(
            c170_records=[c170_com_conversao],
            cadastro_0220=cadastro_0220
        )
        
        self.assertIsInstance(resultado, dict)
        # Deve validar coerência da conversão


if __name__ == "__main__":
    unittest.main()



