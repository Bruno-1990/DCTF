#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Sistema de Normalização Avançada
Testa normalização completa de dados.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from normalizacao import (
    normalizar_cnpj_cpf,
    validar_digitos_cnpj_cpf,
    normalizar_data,
    normalizar_decimal,
    normalizar_campo_chave,
    aplicar_normalizacao
)


class TestNormalizacao(unittest.TestCase):
    """Testes para normalização avançada"""
    
    def test_normalizar_cnpj_cpf(self):
        """Testa normalização de CNPJ/CPF (remover formatação)"""
        # CNPJ formatado
        cnpj_formatado = "12.345.678/0001-90"
        cnpj_normalizado = normalizar_cnpj_cpf(cnpj_formatado)
        self.assertEqual(cnpj_normalizado, "12345678000190")
        
        # CPF formatado
        cpf_formatado = "123.456.789-00"
        cpf_normalizado = normalizar_cnpj_cpf(cpf_formatado)
        self.assertEqual(cpf_normalizado, "12345678900")
        
        # Já normalizado
        cnpj_ja_normalizado = "12345678000190"
        self.assertEqual(normalizar_cnpj_cpf(cnpj_ja_normalizado), "12345678000190")
    
    def test_validar_digitos_cnpj_cpf(self):
        """Testa validação de dígitos verificadores de CNPJ/CPF"""
        # CNPJ válido (exemplo: 11.222.333/0001-81)
        cnpj_valido = "11222333000181"
        self.assertTrue(validar_digitos_cnpj_cpf(cnpj_valido))
        
        # CNPJ inválido (dígitos errados)
        cnpj_invalido = "11222333000199"
        self.assertFalse(validar_digitos_cnpj_cpf(cnpj_invalido))
        
        # CPF válido (exemplo: 111.444.777-35)
        cpf_valido = "11144477735"
        self.assertTrue(validar_digitos_cnpj_cpf(cpf_valido))
    
    def test_normalizar_data(self):
        """Testa normalização de datas (padronizar formato)"""
        # Data em formato DDMMYYYY
        data_ddmmyyyy = "01012024"
        data_normalizada = normalizar_data(data_ddmmyyyy)
        self.assertEqual(data_normalizada, "01012024")
        
        # Data em formato DD/MM/YYYY
        data_formatada = "01/01/2024"
        data_normalizada = normalizar_data(data_formatada)
        self.assertEqual(data_normalizada, "01012024")
    
    def test_normalizar_decimal(self):
        """Testa normalização de decimais (padronizar casas decimais)"""
        # Decimal com vírgula
        decimal_virgula = "100,50"
        decimal_normalizado = normalizar_decimal(decimal_virgula)
        self.assertEqual(decimal_normalizado, 100.50)
        
        # Decimal com ponto
        decimal_ponto = "100.50"
        decimal_normalizado = normalizar_decimal(decimal_ponto)
        self.assertEqual(decimal_normalizado, 100.50)
        
        # Decimal com muitas casas
        decimal_muitas_casas = "100.123456"
        decimal_normalizado = normalizar_decimal(decimal_muitas_casas, casas=2)
        self.assertAlmostEqual(decimal_normalizado, 100.12, places=2)
    
    def test_normalizar_campo_chave(self):
        """Testa normalização de campos-chave (espaços, maiúsculas/minúsculas)"""
        # Campo com espaços
        campo_espacos = "  COD_ITEM  "
        campo_normalizado = normalizar_campo_chave(campo_espacos)
        self.assertEqual(campo_normalizado, "COD_ITEM")
        
        # Campo com maiúsculas/minúsculas misturadas
        campo_misturado = "Cod_Item"
        campo_normalizado = normalizar_campo_chave(campo_misturado)
        self.assertEqual(campo_normalizado, "COD_ITEM")
    
    def test_aplicar_normalizacao(self):
        """Testa aplicação de normalização antes de comparações"""
        dados_originais = {
            "CNPJ": "12.345.678/0001-90",
            "DATA": "01/01/2024",
            "VALOR": "100,50",
            "COD_ITEM": "  item001  "
        }
        
        dados_normalizados = aplicar_normalizacao(dados_originais)
        
        self.assertEqual(dados_normalizados["CNPJ"], "12345678000190")
        self.assertEqual(dados_normalizados["DATA"], "01012024")
        self.assertEqual(dados_normalizados["VALOR"], 100.50)
        self.assertEqual(dados_normalizados["COD_ITEM"], "ITEM001")


if __name__ == "__main__":
    unittest.main()

