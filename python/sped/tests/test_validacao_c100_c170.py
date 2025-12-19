#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes para Validação C100 ↔ C170 (Itens)
Valida correspondência entre itens do XML e registros C170 no SPED.
"""
import unittest
from typing import Dict, List, Any
from pathlib import Path
import sys

# Adicionar diretório pai ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validacao_c100_c170 import (
    validar_c100_c170,
    validar_contagem_itens,
    validar_campos_fiscais,
    validar_quantidades,
    validar_valores,
    validar_rateios,
    ResultadoValidacaoC100C170
)


class TestValidacaoC100C170(unittest.TestCase):
    """Testes para validação C100 ↔ C170"""
    
    def setUp(self):
        """Configurar dados de teste"""
        # XML de exemplo com 3 itens
        self.xml_note = {
            "chave": "35200112345678901234567890123456789012345678",
            "mod": "55",
            "serie": "1",
            "nNF": "123",
            "items": [
                {
                    "nItem": "1",
                    "COD_ITEM": "PROD001",
                    "NCM": "12345678",
                    "CFOP": "5102",
                    "CST": "00",
                    "qCom": 10.0,
                    "uCom": "UN",
                    "vProd": 100.00,
                    "vFrete": 5.00,
                    "vSeg": 2.00,
                    "vDesc": 10.00,
                    "vOutro": 1.00
                },
                {
                    "nItem": "2",
                    "COD_ITEM": "PROD002",
                    "NCM": "87654321",
                    "CFOP": "5102",
                    "CST": "00",
                    "qCom": 5.0,
                    "uCom": "UN",
                    "vProd": 50.00,
                    "vFrete": 0.00,
                    "vSeg": 0.00,
                    "vDesc": 0.00,
                    "vOutro": 0.00
                },
                {
                    "nItem": "3",
                    "COD_ITEM": "PROD003",
                    "NCM": "11223344",
                    "CFOP": "5102",
                    "CST": "00",
                    "qCom": 2.0,
                    "uCom": "UN",
                    "vProd": 200.00,
                    "vFrete": 0.00,
                    "vSeg": 0.00,
                    "vDesc": 0.00,
                    "vOutro": 0.00
                }
            ]
        }
        
        # C170s correspondentes (corretos)
        self.c170_corretos = [
            {
                "NUM_ITEM": "1",
                "COD_ITEM": "PROD001",
                "NCM": "12345678",
                "CFOP": "5102",
                "CST_ICMS": "00",
                "QTD": 10.0,
                "UNID": "UN",
                "VL_ITEM": 100.00
            },
            {
                "NUM_ITEM": "2",
                "COD_ITEM": "PROD002",
                "NCM": "87654321",
                "CFOP": "5102",
                "CST_ICMS": "00",
                "QTD": 5.0,
                "UNID": "UN",
                "VL_ITEM": 50.00
            },
            {
                "NUM_ITEM": "3",
                "COD_ITEM": "PROD003",
                "NCM": "11223344",
                "CFOP": "5102",
                "CST_ICMS": "00",
                "QTD": 2.0,
                "UNID": "UN",
                "VL_ITEM": 200.00
            }
        ]
    
    def test_validar_contagem_itens_correta(self):
        """Testa validação de contagem de itens quando está correta"""
        resultado = validar_contagem_itens(
            xml_items=self.xml_note["items"],
            c170_items=self.c170_corretos
        )
        self.assertTrue(resultado["valido"])
        self.assertEqual(resultado["total_xml"], 3)
        self.assertEqual(resultado["total_c170"], 3)
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_validar_contagem_itens_divergente(self):
        """Testa validação de contagem quando há divergência"""
        # Remover um C170
        c170_incompleto = self.c170_corretos[:2]
        
        resultado = validar_contagem_itens(
            xml_items=self.xml_note["items"],
            c170_items=c170_incompleto
        )
        self.assertFalse(resultado["valido"])
        self.assertEqual(resultado["total_xml"], 3)
        self.assertEqual(resultado["total_c170"], 2)
        self.assertGreater(len(resultado["divergencias"]), 0)
    
    def test_validar_campos_fiscais_corretos(self):
        """Testa validação de campos fiscais quando estão corretos"""
        xml_item = self.xml_note["items"][0]
        c170_item = self.c170_corretos[0]
        
        resultado = validar_campos_fiscais(xml_item, c170_item)
        self.assertTrue(resultado["valido"])
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_validar_campos_fiscais_ncm_divergente(self):
        """Testa validação quando NCM diverge"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["NCM"] = "99999999"  # NCM diferente
        
        resultado = validar_campos_fiscais(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        self.assertGreater(len(resultado["divergencias"]), 0)
        # Verificar se há divergência de NCM
        ncm_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "NCM"]
        self.assertGreater(len(ncm_divergencias), 0)
    
    def test_validar_campos_fiscais_cfop_divergente(self):
        """Testa validação quando CFOP diverge"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["CFOP"] = "6102"  # CFOP diferente
        
        resultado = validar_campos_fiscais(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        cfop_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "CFOP"]
        self.assertGreater(len(cfop_divergencias), 0)
    
    def test_validar_campos_fiscais_cst_divergente(self):
        """Testa validação quando CST diverge"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["CST_ICMS"] = "10"  # CST diferente
        
        resultado = validar_campos_fiscais(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        cst_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "CST"]
        self.assertGreater(len(cst_divergencias), 0)
    
    def test_validar_quantidades_corretas(self):
        """Testa validação de quantidades quando estão corretas"""
        xml_item = self.xml_note["items"][0]
        c170_item = self.c170_corretos[0]
        
        resultado = validar_quantidades(xml_item, c170_item)
        self.assertTrue(resultado["valido"])
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_validar_quantidades_divergentes(self):
        """Testa validação quando quantidades divergem"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["QTD"] = 15.0  # Quantidade diferente
        
        resultado = validar_quantidades(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        qtd_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "QTD"]
        self.assertGreater(len(qtd_divergencias), 0)
    
    def test_validar_unidade_divergente(self):
        """Testa validação quando unidade diverge"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["UNID"] = "KG"  # Unidade diferente
        
        resultado = validar_quantidades(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        unid_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "UNID"]
        self.assertGreater(len(unid_divergencias), 0)
    
    def test_validar_valores_corretos(self):
        """Testa validação de valores quando estão corretos"""
        xml_item = self.xml_note["items"][0]
        c170_item = self.c170_corretos[0]
        
        resultado = validar_valores(xml_item, c170_item)
        self.assertTrue(resultado["valido"])
        self.assertEqual(len(resultado["divergencias"]), 0)
    
    def test_validar_valores_divergentes(self):
        """Testa validação quando valores divergem"""
        xml_item = self.xml_note["items"][0].copy()
        c170_item = self.c170_corretos[0].copy()
        c170_item["VL_ITEM"] = 150.00  # Valor diferente
        
        resultado = validar_valores(xml_item, c170_item)
        self.assertFalse(resultado["valido"])
        valor_divergencias = [d for d in resultado["divergencias"] if d["campo"] == "VL_ITEM"]
        self.assertGreater(len(valor_divergencias), 0)
    
    def test_validar_rateios_frete(self):
        """Testa validação de rateio de frete"""
        xml_item = self.xml_note["items"][0]
        c170_item = self.c170_corretos[0]
        
        # Adicionar frete no XML
        xml_item_com_frete = xml_item.copy()
        xml_item_com_frete["vFrete"] = 5.00
        
        resultado = validar_rateios(xml_item_com_frete, c170_item, self.xml_note)
        # Rateio de frete deve ser detectado
        self.assertIsNotNone(resultado)
    
    def test_validar_c100_c170_completo(self):
        """Testa validação completa C100 ↔ C170"""
        c100_record = {
            "CHV_NFE": "35200112345678901234567890123456789012345678",
            "COD_MOD": "55",
            "SER": "1",
            "NUM_DOC": "123"
        }
        
        resultado = validar_c100_c170(
            xml_note=self.xml_note,
            c100_record=c100_record,
            c170_items=self.c170_corretos
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC100C170)
        self.assertTrue(resultado.contagem_valida)
        self.assertEqual(len(resultado.divergencias), 0)
        self.assertEqual(resultado.total_itens_xml, 3)
        self.assertEqual(resultado.total_itens_c170, 3)
    
    def test_validar_c100_c170_com_divergencias(self):
        """Testa validação completa com divergências"""
        c100_record = {
            "CHV_NFE": "35200112345678901234567890123456789012345678",
            "COD_MOD": "55",
            "SER": "1",
            "NUM_DOC": "123"
        }
        
        # C170 com divergências
        c170_divergentes = [
            {
                "NUM_ITEM": "1",
                "COD_ITEM": "PROD001",
                "NCM": "99999999",  # NCM errado
                "CFOP": "5102",
                "CST_ICMS": "00",
                "QTD": 15.0,  # Quantidade errada
                "UNID": "UN",
                "VL_ITEM": 150.00  # Valor errado
            }
        ]
        
        resultado = validar_c100_c170(
            xml_note=self.xml_note,
            c100_record=c100_record,
            c170_items=c170_divergentes
        )
        
        self.assertIsInstance(resultado, ResultadoValidacaoC100C170)
        self.assertFalse(resultado.contagem_valida)  # Contagem diverge (1 vs 3)
        self.assertGreater(len(resultado.divergencias), 0)


if __name__ == "__main__":
    unittest.main()


