#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação de Operações Especiais
Testa identificação e validação de cenários especiais.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_operacoes_especiais import (
    identificar_cenarios_especiais,
    aplicar_checklist_operacao_especial,
    validar_regras_operacao_especial,
    ResultadoValidacaoOperacaoEspecial,
    ChecklistOperacao
)


class TestValidacaoOperacoesEspeciais(unittest.TestCase):
    """Testes para validação de operações especiais"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # C100 com cupom fiscal
        self.c100_cupom = {
            "COD_MOD": "02",  # Cupom Fiscal
            "COD_SIT": "00"
        }
        
        # C100 com nota de referência
        self.c100_referencia = {
            "COD_MOD": "01",  # Nota Fiscal
            "COD_SIT": "04",  # Nota de referência
            "CFOP": "1101"
        }
        
        # C100 com CFOP específico (devolução)
        self.c100_devolucao = {
            "COD_MOD": "55",  # NFe
            "COD_SIT": "00",
            "CFOP": "1202"  # Devolução de venda
        }
    
    def test_identificar_cenarios_especiais_cupom(self):
        """Testa identificação de cenário especial: cupom fiscal"""
        resultado = identificar_cenarios_especiais(self.c100_cupom)
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("tipo_operacao", resultado)
        self.assertEqual(resultado["tipo_operacao"], "cupom_fiscal")
    
    def test_identificar_cenarios_especiais_referencia(self):
        """Testa identificação de cenário especial: nota de referência"""
        resultado = identificar_cenarios_especiais(self.c100_referencia)
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("tipo_operacao", resultado)
        self.assertEqual(resultado["tipo_operacao"], "nota_referencia")
    
    def test_identificar_cenarios_especiais_cfop_especifico(self):
        """Testa identificação de cenário especial: CFOP específico"""
        resultado = identificar_cenarios_especiais(self.c100_devolucao)
        
        self.assertIsInstance(resultado, dict)
        self.assertIn("tipo_operacao", resultado)
        # Devolução é um tipo especial
        self.assertIn(resultado["tipo_operacao"], ["devolucao", "operacao_especial"])
    
    def test_aplicar_checklist_operacao_especial(self):
        """Testa aplicação de checklist próprio para cada cenário"""
        cenario = identificar_cenarios_especiais(self.c100_cupom)
        checklist = aplicar_checklist_operacao_especial(
            tipo_operacao=cenario["tipo_operacao"],
            c100_record=self.c100_cupom,
            c170_items=[]
        )
        
        self.assertIsInstance(checklist, ChecklistOperacao)
        self.assertIsInstance(checklist.itens, list)
        self.assertGreater(len(checklist.itens), 0)
    
    def test_validar_regras_operacao_especial(self):
        """Testa validação de regras específicas de cada tipo de operação"""
        resultado = validar_regras_operacao_especial(
            c100_record=self.c100_cupom,
            c170_items=[]
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoOperacaoEspecial)
        # Deve validar regras específicas do cupom fiscal


if __name__ == "__main__":
    unittest.main()

