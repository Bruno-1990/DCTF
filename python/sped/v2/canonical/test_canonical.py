"""
Testes unitários para Modelo Canônico Fiscal
"""

import unittest
from decimal import Decimal
from datetime import datetime
from pathlib import Path
import tempfile
import os

from .documento_fiscal import DocumentoFiscal
from .item_fiscal import ItemFiscal
from .tributos import TributoICMS, TributoICMSST, TributoIPI
from .parsers import (
    parse_xml_to_canonical,
    parse_efd_c100_to_canonical,
    parse_efd_c170_to_canonical,
    parse_decimal,
    parse_date_efd,
    parse_date_xml
)


class TestTributos(unittest.TestCase):
    """Testes para classes de tributos"""
    
    def test_tributo_icms(self):
        """Testa criação de TributoICMS"""
        icms = TributoICMS(
            base_calculo=Decimal('1000.00'),
            aliquota=Decimal('18.00'),
            valor=Decimal('180.00'),
            cst='00',
            cfop='5102'
        )
        self.assertEqual(icms.base_calculo, Decimal('1000.00'))
        self.assertEqual(icms.aliquota, Decimal('18.00'))
        self.assertEqual(icms.valor, Decimal('180.00'))
        self.assertEqual(icms.cst, '00')
    
    def test_tributo_icms_st(self):
        """Testa criação de TributoICMSST"""
        icms_st = TributoICMSST(
            base_calculo_st=Decimal('1200.00'),
            aliquota_st=Decimal('18.00'),
            valor_st=Decimal('216.00'),
            mva=Decimal('20.00')
        )
        self.assertEqual(icms_st.base_calculo_st, Decimal('1200.00'))
        self.assertEqual(icms_st.valor_st, Decimal('216.00'))


class TestItemFiscal(unittest.TestCase):
    """Testes para ItemFiscal"""
    
    def test_item_fiscal_basico(self):
        """Testa criação de ItemFiscal básico"""
        item = ItemFiscal(
            codigo_item='PROD001',
            descricao='Produto Teste',
            quantidade=Decimal('10.00'),
            valor_unitario=Decimal('100.00'),
            valor_total=Decimal('1000.00')
        )
        self.assertEqual(item.codigo_item, 'PROD001')
        self.assertEqual(item.quantidade, Decimal('10.00'))
        self.assertEqual(item.valor_total, Decimal('1000.00'))
    
    def test_item_fiscal_com_tributos(self):
        """Testa ItemFiscal com tributos"""
        item = ItemFiscal(
            codigo_item='PROD001',
            quantidade=Decimal('1.00'),
            valor_total=Decimal('1000.00'),
            icms=TributoICMS(
                base_calculo=Decimal('1000.00'),
                aliquota=Decimal('18.00'),
                valor=Decimal('180.00')
            ),
            icms_st=TributoICMSST(
                base_calculo_st=Decimal('1200.00'),
                valor_st=Decimal('216.00')
            )
        )
        self.assertIsNotNone(item.icms)
        self.assertIsNotNone(item.icms_st)
        self.assertEqual(item.get_valor_tributos(), Decimal('396.00'))
    
    def test_calcular_valor_total(self):
        """Testa cálculo de valor total do item"""
        item = ItemFiscal(
            valor_total=Decimal('1000.00'),
            valor_frete=Decimal('50.00'),
            valor_seguro=Decimal('10.00'),
            valor_outros=Decimal('20.00'),
            valor_desconto=Decimal('30.00')
        )
        total = item.calcular_valor_total()
        self.assertEqual(total, Decimal('1050.00'))


class TestDocumentoFiscal(unittest.TestCase):
    """Testes para DocumentoFiscal"""
    
    def test_documento_fiscal_basico(self):
        """Testa criação de DocumentoFiscal básico"""
        doc = DocumentoFiscal(
            chave_acesso='35200114300133000186550010000000011000000011',
            numero='1',
            serie='1',
            modelo='55',
            valor_total=Decimal('1000.00')
        )
        self.assertEqual(doc.chave_acesso, '35200114300133000186550010000000011000000011')
        self.assertEqual(doc.valor_total, Decimal('1000.00'))
        self.assertTrue(doc.is_valido())
    
    def test_documento_cancelado(self):
        """Testa documento cancelado"""
        doc = DocumentoFiscal(
            situacao='Cancelada',
            cod_sit='02'
        )
        self.assertTrue(doc.is_cancelado())
        self.assertFalse(doc.is_valido())
    
    def test_documento_com_itens(self):
        """Testa documento com itens"""
        doc = DocumentoFiscal(
            chave_acesso='35200114300133000186550010000000011000000011',
            valor_total=Decimal('2000.00')
        )
        doc.itens.append(ItemFiscal(valor_total=Decimal('1000.00')))
        doc.itens.append(ItemFiscal(valor_total=Decimal('1000.00')))
        self.assertEqual(len(doc.itens), 2)
        self.assertEqual(doc.get_total_itens(), Decimal('2000.00'))


class TestParsers(unittest.TestCase):
    """Testes para parsers"""
    
    def test_parse_decimal(self):
        """Testa conversão para Decimal"""
        self.assertEqual(parse_decimal('1000.50'), Decimal('1000.50'))
        self.assertEqual(parse_decimal('1000,50'), Decimal('1000.50'))
        self.assertEqual(parse_decimal(''), Decimal('0.00'))
        self.assertEqual(parse_decimal(None), Decimal('0.00'))
        self.assertEqual(parse_decimal(1000.50), Decimal('1000.50'))
    
    def test_parse_date_efd(self):
        """Testa conversão de data EFD"""
        date = parse_date_efd('01012025')
        self.assertIsNotNone(date)
        self.assertEqual(date.year, 2025)
        self.assertEqual(date.month, 1)
        self.assertEqual(date.day, 1)
        
        self.assertIsNone(parse_date_efd(''))
        self.assertIsNone(parse_date_efd(None))
    
    def test_parse_date_xml(self):
        """Testa conversão de data XML"""
        date = parse_date_xml('2025-01-01')
        self.assertIsNotNone(date)
        self.assertEqual(date.year, 2025)
        
        date2 = parse_date_xml('2025-01-01T10:30:00')
        self.assertIsNotNone(date2)
        self.assertEqual(date2.year, 2025)
        
        self.assertIsNone(parse_date_xml(''))
        self.assertIsNone(parse_date_xml(None))


class TestEFDParser(unittest.TestCase):
    """Testes para parser EFD"""
    
    def test_parse_efd_c100_basico(self):
        """Testa parsing básico de C100"""
        # Criar arquivo EFD temporário
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='latin1') as f:
            f.write("|0000|001|0|01012025|31122025|EMPRESA TESTE|12345678000190|||\n")
            f.write("|C100|0|0|000001|55|00|1|1|35200114300133000186550010000000011000000011|01012025|01012025|1000.00|0|0.00|0.00|1000.00|0|0.00|0.00|0.00|1000.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|\n")
            temp_path = f.name
        
        try:
            documentos = parse_efd_c100_to_canonical(Path(temp_path))
            self.assertEqual(len(documentos), 1)
            doc = documentos[0]
            self.assertEqual(doc.chave_acesso, '35200114300133000186550010000000011000000011')
            self.assertEqual(doc.valor_total, Decimal('1000.00'))
            self.assertEqual(doc.situacao, 'Normal')
        finally:
            os.unlink(temp_path)


if __name__ == '__main__':
    unittest.main()

