#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Simples Nacional
Testa tratamento correto de créditos no Simples Nacional.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_simples_nacional import (
    buscar_credito_multiplos_locais,
    validar_ajustes_documento_apuracao,
    identificar_cenarios_simples_nacional,
    validar_regras_simples_nacional,
    ResultadoValidacaoSimplesNacional
)


class TestValidacaoSimplesNacional(unittest.TestCase):
    """Testes para validação de Simples Nacional"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C170 com crédito no Simples Nacional
        self.c170_item = {
            "VL_ICMS": 18.00,
            "CST_ICMS": "00"
        }
        
        # C197 (crédito de ICMS)
        self.c197_record = {
            "COD_AJ": "001",
            "DESCR_COMPL_AJ": "Crédito de ICMS",
            "VL_CRED_ORIG": 18.00
        }
        
        # E111 (ajuste de apuração)
        self.e111_record = {
            "COD_AJ_APUR": "001",
            "DESCR_COMPL_AJ": "Crédito de ICMS",
            "VL_AJ_APUR": 18.00
        }
    
    def test_buscar_credito_multiplos_locais(self):
        """Testa busca de crédito em múltiplos locais (C197, E111, campos de ICMS)"""
        resultado = buscar_credito_multiplos_locais(
            c170_items=[self.c170_item],
            c197_records=[self.c197_record],
            e111_records=[self.e111_record]
        )
        
        # Deve encontrar crédito em pelo menos um local
        self.assertGreaterEqual(resultado.total_credito, 0)
        self.assertGreater(len(resultado.locais_credito), 0)
    
    def test_validar_ajustes_documento_apuracao(self):
        """Testa validação de ajustes de documento e apuração"""
        resultado = validar_ajustes_documento_apuracao(
            c197_records=[self.c197_record],
            e111_records=[self.e111_record]
        )
        
        self.assertIsInstance(resultado, dict)
        # Deve validar consistência entre ajustes de documento e apuração
    
    def test_identificar_cenarios_simples_nacional(self):
        """Testa identificação de cenários específicos do Simples Nacional"""
        c100_simples = {
            "COD_PART": "12345678000190",
            "COD_MOD": "55"  # NFe
        }
        
        resultado = identificar_cenarios_simples_nacional(
            c100_record=c100_simples,
            c170_items=[self.c170_item]
        )
        
        self.assertIsInstance(resultado, dict)
        # Deve identificar se é Simples Nacional
    
    def test_validar_regras_simples_nacional(self):
        """Testa validação de regras específicas do regime"""
        resultado = validar_regras_simples_nacional(
            c100_record={"COD_MOD": "55"},
            c170_items=[self.c170_item],
            c197_records=[self.c197_record],
            e111_records=[self.e111_record]
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoSimplesNacional)
        # Deve validar regras específicas do Simples Nacional


if __name__ == "__main__":
    unittest.main()


