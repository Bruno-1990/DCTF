"""
Testes unitários para Normalizadores (Camada A)
"""

import unittest
from pathlib import Path
from decimal import Decimal
import tempfile
import os

from .xml_normalizer import XMLNormalizer, normalize_xml
from .efd_normalizer import EFDNormalizer, normalize_efd


class TestXMLNormalizer(unittest.TestCase):
    """Testes para XMLNormalizer"""
    
    def test_normalize_file_inexistente(self):
        """Testa normalização de arquivo inexistente"""
        normalizer = XMLNormalizer()
        result = normalizer.normalize_file(Path("/arquivo/inexistente.xml"))
        self.assertIsNone(result)
    
    def test_normalize_cnpj(self):
        """Testa normalização de CNPJ"""
        normalizer = XMLNormalizer()
        cnpj_formatado = "12.345.678/0001-90"
        cnpj_normalizado = normalizer._normalize_cnpj(cnpj_formatado)
        self.assertEqual(cnpj_normalizado, "12345678000190")
    
    def test_normalize_item_cfop(self):
        """Testa normalização de CFOP no item"""
        from ..canonical.item_fiscal import ItemFiscal
        
        normalizer = XMLNormalizer()
        item = ItemFiscal(cfop=" 5102 ")
        normalizer._normalize_item(item)
        self.assertEqual(item.cfop, "5102")
    
    def test_normalize_item_ncm(self):
        """Testa normalização de NCM no item"""
        from ..canonical.item_fiscal import ItemFiscal
        
        normalizer = XMLNormalizer()
        item = ItemFiscal(ncm="1234.56.78")
        normalizer._normalize_item(item)
        self.assertEqual(item.ncm, "12345678")


class TestEFDNormalizer(unittest.TestCase):
    """Testes para EFDNormalizer"""
    
    def test_normalize_file_inexistente(self):
        """Testa normalização de arquivo inexistente"""
        normalizer = EFDNormalizer()
        result = normalizer.normalize_file(Path("/arquivo/inexistente.txt"))
        self.assertEqual(len(result), 0)
    
    def test_parse_c170_by_chave(self):
        """Testa parsing de C170 agrupado por chave"""
        normalizer = EFDNormalizer()
        
        # Criar arquivo EFD temporário
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='latin1') as f:
            f.write("|0000|001|0|01012025|31122025|EMPRESA TESTE|12345678000190|||\n")
            f.write("|C100|0|0|000001|55|00|1|1|35200114300133000186550010000000011000000011|01012025|01012025|1000.00|0|0.00|0.00|1000.00|0|0.00|0.00|0.00|1000.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|\n")
            f.write("|C170|1|PROD001|Produto Teste|UN|10.00|100.00|1000.00|0.00|5102|00|0|1000.00|18.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|00|0.00|\n")
            temp_path = f.name
        
        try:
            itens_por_chave = normalizer._parse_c170_by_chave(Path(temp_path))
            self.assertGreater(len(itens_por_chave), 0)
        finally:
            os.unlink(temp_path)
    
    def test_normalize_item_cfop(self):
        """Testa normalização de CFOP no item"""
        from ..canonical.item_fiscal import ItemFiscal
        
        normalizer = EFDNormalizer()
        item = ItemFiscal(cfop=" 5102 ")
        normalizer._normalize_item(item)
        self.assertEqual(item.cfop, "5102")
    
    def test_normalize_efd_completo(self):
        """Testa normalização completa de EFD"""
        normalizer = EFDNormalizer()
        
        # Criar arquivo EFD temporário
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='latin1') as f:
            f.write("|0000|001|0|01012025|31122025|EMPRESA TESTE|12345678000190|||\n")
            f.write("|C100|0|0|000001|55|00|1|1|35200114300133000186550010000000011000000011|01012025|01012025|1000.00|0|0.00|0.00|1000.00|0|0.00|0.00|0.00|1000.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|\n")
            f.write("|C170|1|PROD001|Produto Teste|UN|10.00|100.00|1000.00|0.00|5102|00|0|1000.00|18.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|00|0.00|\n")
            temp_path = f.name
        
        try:
            documentos = normalizer.normalize_file(Path(temp_path))
            self.assertEqual(len(documentos), 1)
            doc = documentos[0]
            self.assertEqual(len(doc.itens), 1)
            self.assertEqual(doc.itens[0].cfop, "5102")
        finally:
            os.unlink(temp_path)


class TestFuncoesConveniencia(unittest.TestCase):
    """Testes para funções de conveniência"""
    
    def test_normalize_xml_function(self):
        """Testa função normalize_xml"""
        result = normalize_xml(Path("/inexistente.xml"))
        self.assertIsNone(result)
    
    def test_normalize_efd_function(self):
        """Testa função normalize_efd"""
        result = normalize_efd(Path("/inexistente.txt"))
        self.assertEqual(len(result), 0)


if __name__ == '__main__':
    unittest.main()








