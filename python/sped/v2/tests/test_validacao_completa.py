#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Validação Completa - Testa todas as implementações do roteiro
Verifica se todos os componentes críticos estão funcionando corretamente
"""

import sys
from pathlib import Path
from decimal import Decimal
import logging

# Adicionar caminho ao sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def test_imports():
    """Testa se todos os módulos podem ser importados"""
    print("\n" + "="*80)
    print("TESTE 1: VALIDAÇÃO DE IMPORTS")
    print("="*80)
    
    testes = []
    
    # Teste 1.1: SPEDParser
    try:
        from sped.v2.normalization import SPEDParser, RegistroC100, RegistroC170, RegistroC190, RegistroE110
        print("✅ 1.1 SPEDParser importado com sucesso")
        print(f"   - RegistroC100: {RegistroC100.__name__}")
        print(f"   - RegistroC170: {RegistroC170.__name__}")
        print(f"   - RegistroC190: {RegistroC190.__name__}")
        print(f"   - RegistroE110: {RegistroE110.__name__}")
        testes.append(("SPEDParser Import", True))
    except Exception as e:
        print(f"❌ 1.1 Erro ao importar SPEDParser: {e}")
        testes.append(("SPEDParser Import", False))
    
    # Teste 1.2: TotalingEngine
    try:
        from sped.v2.validation.totaling_engine import TotalingEngine, DivergenciaTotalizacao
        print("✅ 1.2 TotalingEngine importado com sucesso")
        print(f"   - TotalingEngine: {TotalingEngine.__name__}")
        print(f"   - DivergenciaTotalizacao: {DivergenciaTotalizacao.__name__}")
        testes.append(("TotalingEngine Import", True))
    except Exception as e:
        print(f"❌ 1.2 Erro ao importar TotalingEngine: {e}")
        testes.append(("TotalingEngine Import", False))
    
    # Teste 1.3: ValidadorImpactoE110
    try:
        from sped.v2.validation.impacto_e110 import ValidadorImpactoE110, ImpactoE110
        print("✅ 1.3 ValidadorImpactoE110 importado com sucesso")
        print(f"   - ValidadorImpactoE110: {ValidadorImpactoE110.__name__}")
        print(f"   - ImpactoE110: {ImpactoE110.__name__}")
        testes.append(("ValidadorImpactoE110 Import", True))
    except Exception as e:
        print(f"❌ 1.3 Erro ao importar ValidadorImpactoE110: {e}")
        testes.append(("ValidadorImpactoE110 Import", False))
    
    # Teste 1.4: DocumentFamilyGrouper
    try:
        from sped.v2.matching import DocumentFamilyGrouper, FamiliaDocumento
        print("✅ 1.4 DocumentFamilyGrouper importado com sucesso")
        print(f"   - DocumentFamilyGrouper: {DocumentFamilyGrouper.__name__}")
        print(f"   - FamiliaDocumento: {FamiliaDocumento.__name__}")
        testes.append(("DocumentFamilyGrouper Import", True))
    except Exception as e:
        print(f"❌ 1.4 Erro ao importar DocumentFamilyGrouper: {e}")
        testes.append(("DocumentFamilyGrouper Import", False))
    
    # Teste 1.5: Outros módulos críticos
    try:
        from sped.v2.normalization import XMLNormalizer, EFDNormalizer
        from sped.v2.matching import DocumentMatcher, ItemMatcher
        from sped.v2.validation.xml_efd_validator import XmlEfdValidator
        from sped.v2.validation.legitimacao_matrix import MatrizLegitimacao
        from sped.v2.validation.context_validator import ContextValidator
        print("✅ 1.5 Outros módulos críticos importados com sucesso")
        testes.append(("Outros Módulos Import", True))
    except Exception as e:
        print(f"❌ 1.5 Erro ao importar outros módulos: {e}")
        testes.append(("Outros Módulos Import", False))
    
    return testes


def test_sped_parser():
    """Testa funcionalidades do SPEDParser"""
    print("\n" + "="*80)
    print("TESTE 2: FUNCIONALIDADES DO SPEDParser")
    print("="*80)
    
    testes = []
    
    try:
        from sped.v2.normalization.sped_parser import (
            SPEDParser, 
            split_sped_line, 
            parse_decimal,
            parse_date_sped
        )
        
        # Teste 2.1: split_sped_line
        linha_teste = "C100|1|0|12345|55|00|001|123|43210987654321098765432109876543210987|01012024|01012024|1000,00|"
        campos = split_sped_line(linha_teste)
        assert len(campos) > 10, "Campos insuficientes"
        assert campos[0] == "C100", "Tipo registro errado"
        print(f"✅ 2.1 split_sped_line: {len(campos)} campos extraídos")
        testes.append(("split_sped_line", True))
        
        # Teste 2.2: parse_decimal
        valor = parse_decimal("1234,56")
        assert valor == Decimal("1234.56"), "Conversão decimal falhou"
        print(f"✅ 2.2 parse_decimal: '1234,56' → {valor}")
        testes.append(("parse_decimal", True))
        
        # Teste 2.3: parse_date_sped
        data = parse_date_sped("01012024")
        assert data == "2024-01-01", "Conversão data falhou"
        print(f"✅ 2.3 parse_date_sped: '01012024' → {data}")
        testes.append(("parse_date_sped", True))
        
        # Teste 2.4: Instanciar SPEDParser
        parser = SPEDParser(Path("dummy.txt"))
        assert hasattr(parser, 'registros_c100'), "Falta atributo registros_c100"
        assert hasattr(parser, 'registros_c170'), "Falta atributo registros_c170"
        assert hasattr(parser, 'registros_c190'), "Falta atributo registros_c190"
        assert hasattr(parser, 'registros_e110'), "Falta atributo registros_e110"
        print(f"✅ 2.4 SPEDParser instanciado com atributos corretos")
        testes.append(("SPEDParser Instância", True))
        
    except Exception as e:
        print(f"❌ TESTE 2 FALHOU: {e}")
        import traceback
        traceback.print_exc()
        testes.append(("SPEDParser Funcionalidades", False))
    
    return testes


def test_totaling_engine():
    """Testa funcionalidades do TotalingEngine"""
    print("\n" + "="*80)
    print("TESTE 3: FUNCIONALIDADES DO TotalingEngine")
    print("="*80)
    
    testes = []
    
    try:
        from sped.v2.validation.totaling_engine import (
            TotalingEngine,
            RegistroC170,
            RegistroC190,
            RegistroC100,
            RegistroE110,
            DivergenciaTotalizacao
        )
        
        # Teste 3.1: Instanciar TotalingEngine
        engine = TotalingEngine(
            tolerancia_linha=Decimal('0.01'),
            tolerancia_documento_min=Decimal('0.05'),
            tolerancia_documento_max=Decimal('0.10'),
            tolerancia_periodo_min=Decimal('0.50'),
            tolerancia_periodo_max=Decimal('2.00')
        )
        print(f"✅ 3.1 TotalingEngine instanciado")
        print(f"   - Tolerância linha: {engine.tolerancia_linha}")
        print(f"   - Tolerância documento: {engine.tolerancia_documento_min} - {engine.tolerancia_documento_max}")
        print(f"   - Tolerância período: {engine.tolerancia_periodo_min} - {engine.tolerancia_periodo_max}")
        testes.append(("TotalingEngine Instância", True))
        
        # Teste 3.2: Criar registros mock
        c170_mock = RegistroC170(
            chave="43210987654321098765432109876543210987",
            cfop="5102",
            cst="00",
            vl_item=Decimal("100.00"),
            vl_desconto=Decimal("0.00"),
            vl_bc_icms=Decimal("100.00"),
            vl_icms=Decimal("12.00"),
            vl_bc_icms_st=Decimal("0.00"),
            vl_icms_st=Decimal("0.00"),
            vl_ipi=Decimal("0.00"),
            vl_pis=Decimal("0.00"),
            vl_cofins=Decimal("0.00")
        )
        print(f"✅ 3.2 RegistroC170 mock criado: CFOP={c170_mock.cfop}, CST={c170_mock.cst}")
        testes.append(("RegistroC170 Mock", True))
        
        # Teste 3.3: Validar método existe
        assert hasattr(engine, 'validar_cadeia_c170_c190'), "Falta método validar_cadeia_c170_c190"
        assert hasattr(engine, 'validar_cadeia_c190_c100'), "Falta método validar_cadeia_c190_c100"
        assert hasattr(engine, 'validar_cadeia_c100_e110'), "Falta método validar_cadeia_c100_e110"
        assert hasattr(engine, 'validar_todas_cadeias'), "Falta método validar_todas_cadeias"
        print(f"✅ 3.3 Métodos de validação existem")
        testes.append(("TotalingEngine Métodos", True))
        
    except Exception as e:
        print(f"❌ TESTE 3 FALHOU: {e}")
        import traceback
        traceback.print_exc()
        testes.append(("TotalingEngine Funcionalidades", False))
    
    return testes


def test_validador_impacto_e110():
    """Testa funcionalidades do ValidadorImpactoE110"""
    print("\n" + "="*80)
    print("TESTE 4: FUNCIONALIDADES DO ValidadorImpactoE110")
    print("="*80)
    
    testes = []
    
    try:
        from sped.v2.validation.impacto_e110 import ValidadorImpactoE110, ImpactoE110
        from sped.v2.validation.xml_efd_validator import Divergencia
        
        # Teste 4.1: Instanciar ValidadorImpactoE110
        validador = ValidadorImpactoE110(tolerancia_minima=Decimal('0.50'))
        print(f"✅ 4.1 ValidadorImpactoE110 instanciado")
        print(f"   - Tolerância mínima: {validador.tolerancia_minima}")
        testes.append(("ValidadorImpactoE110 Instância", True))
        
        # Teste 4.2: Criar divergência mock
        div_mock = Divergencia(
            tipo="icms",
            nivel="documento",
            descricao="Divergência de teste",
            valor_xml=Decimal("100.00"),
            valor_efd=Decimal("90.00"),
            diferenca=Decimal("10.00"),
            percentual_diferenca=Decimal("10.00"),
            severidade="media",
            documento_xml=None,
            documento_efd=None,
            contexto={'tpNF': '1', 'tem_st': False}
        )
        print(f"✅ 4.2 Divergencia mock criada: diferença={div_mock.diferenca}")
        testes.append(("Divergencia Mock", True))
        
        # Teste 4.3: Calcular impacto
        impacto = validador.calcular_impacto(div_mock)
        assert isinstance(impacto, ImpactoE110), "Retorno não é ImpactoE110"
        print(f"✅ 4.3 Impacto calculado:")
        print(f"   - Prioridade: {impacto.prioridade}")
        print(f"   - Altera apuração: {impacto.altera_apuracao}")
        print(f"   - Impacto débitos: {impacto.impacto_debitos}")
        print(f"   - Impacto créditos: {impacto.impacto_creditos}")
        print(f"   - Impacto ICMS recolher: {impacto.impacto_icms_recolher}")
        testes.append(("Calcular Impacto", True))
        
        # Teste 4.4: Métodos existem
        assert hasattr(validador, 'calcular_impactos_lote'), "Falta método calcular_impactos_lote"
        assert hasattr(validador, 'priorizar_divergencias'), "Falta método priorizar_divergencias"
        print(f"✅ 4.4 Métodos de priorização existem")
        testes.append(("ValidadorImpactoE110 Métodos", True))
        
    except Exception as e:
        print(f"❌ TESTE 4 FALHOU: {e}")
        import traceback
        traceback.print_exc()
        testes.append(("ValidadorImpactoE110 Funcionalidades", False))
    
    return testes


def test_document_family_grouper():
    """Testa funcionalidades do DocumentFamilyGrouper"""
    print("\n" + "="*80)
    print("TESTE 5: FUNCIONALIDADES DO DocumentFamilyGrouper")
    print("="*80)
    
    testes = []
    
    try:
        from sped.v2.matching import DocumentFamilyGrouper, FamiliaDocumento
        from sped.v2.canonical.documento_fiscal import DocumentoFiscal
        
        # Teste 5.1: Instanciar DocumentFamilyGrouper
        grouper = DocumentFamilyGrouper()
        print(f"✅ 5.1 DocumentFamilyGrouper instanciado")
        testes.append(("DocumentFamilyGrouper Instância", True))
        
        # Teste 5.2: Criar documentos mock
        doc_principal = DocumentoFiscal(
            chave_acesso="43210987654321098765432109876543210987",
            numero="123",
            serie="001",
            modelo="55",
            cnpj_emitente="12345678000190",
            cnpj_destinatario="98765432000100",
            valor_total=Decimal("1000.00"),
            metadata={'finNFe': '1'}
        )
        
        doc_complementar = DocumentoFiscal(
            chave_acesso="43210987654321098765432109876543210988",
            numero="124",
            serie="001",
            modelo="55",
            cnpj_emitente="12345678000190",
            cnpj_destinatario="98765432000100",
            valor_total=Decimal("50.00"),
            metadata={'finNFe': '2', 'NFref': ["43210987654321098765432109876543210987"]}
        )
        print(f"✅ 5.2 Documentos mock criados")
        print(f"   - Principal: {doc_principal.chave_acesso}")
        print(f"   - Complementar: {doc_complementar.chave_acesso}")
        testes.append(("Documentos Mock", True))
        
        # Teste 5.3: Agrupar documentos
        familias = grouper.agrupar([doc_principal, doc_complementar], [])
        assert len(familias) > 0, "Nenhuma família criada"
        print(f"✅ 5.3 Agrupamento executado: {len(familias)} família(s)")
        testes.append(("Agrupar Documentos", True))
        
        # Teste 5.4: Verificar FamiliaDocumento
        familia = familias[0]
        assert isinstance(familia, FamiliaDocumento), "Não é FamiliaDocumento"
        assert hasattr(familia, 'documento_principal'), "Falta documento_principal"
        assert hasattr(familia, 'complementares'), "Falta complementares"
        assert hasattr(familia, 'valor_total_familia'), "Falta valor_total_familia"
        print(f"✅ 5.4 FamiliaDocumento válida:")
        print(f"   - Chave principal: {familia.chave_principal}")
        print(f"   - Total complementares: {len(familia.complementares)}")
        print(f"   - Valor total família: {familia.valor_total_familia}")
        testes.append(("FamiliaDocumento Estrutura", True))
        
    except Exception as e:
        print(f"❌ TESTE 5 FALHOU: {e}")
        import traceback
        traceback.print_exc()
        testes.append(("DocumentFamilyGrouper Funcionalidades", False))
    
    return testes


def test_integracao_processar_validacao():
    """Testa se processar_validacao_v2.py tem todas as integrações"""
    print("\n" + "="*80)
    print("TESTE 6: INTEGRAÇÃO NO processar_validacao_v2.py")
    print("="*80)
    
    testes = []
    
    try:
        # Ler arquivo processar_validacao_v2.py
        script_path = Path(__file__).parent.parent / 'processar_validacao_v2.py'
        
        if not script_path.exists():
            print(f"❌ 6.0 Arquivo não encontrado: {script_path}")
            testes.append(("Script Existe", False))
            return testes
        
        conteudo = script_path.read_text(encoding='utf-8')
        
        # Teste 6.1: Import SPEDParser
        if 'from sped.v2.normalization import' in conteudo and 'SPEDParser' in conteudo:
            print("✅ 6.1 Import SPEDParser presente")
            testes.append(("Import SPEDParser", True))
        else:
            print("❌ 6.1 Import SPEDParser ausente")
            testes.append(("Import SPEDParser", False))
        
        # Teste 6.2: Import ValidadorImpactoE110
        if 'from sped.v2.validation.impacto_e110 import' in conteudo:
            print("✅ 6.2 Import ValidadorImpactoE110 presente")
            testes.append(("Import ValidadorImpactoE110", True))
        else:
            print("❌ 6.2 Import ValidadorImpactoE110 ausente")
            testes.append(("Import ValidadorImpactoE110", False))
        
        # Teste 6.3: Instância SPEDParser
        if 'sped_parser = SPEDParser(' in conteudo:
            print("✅ 6.3 Instância SPEDParser presente")
            testes.append(("Instância SPEDParser", True))
        else:
            print("❌ 6.3 Instância SPEDParser ausente")
            testes.append(("Instância SPEDParser", False))
        
        # Teste 6.4: Chamada TotalingEngine
        if 'totaling_engine = TotalingEngine(' in conteudo:
            print("✅ 6.4 Instância TotalingEngine presente")
            testes.append(("Instância TotalingEngine", True))
        else:
            print("❌ 6.4 Instância TotalingEngine ausente")
            testes.append(("Instância TotalingEngine", False))
        
        # Teste 6.5: Validações C170→C190→C100→E110
        validacoes = [
            'validar_cadeia_c170_c190',
            'validar_cadeia_c190_c100',
            'validar_cadeia_c100_e110'
        ]
        validacoes_presentes = all(v in conteudo for v in validacoes)
        if validacoes_presentes:
            print("✅ 6.5 Validações de totalização presentes")
            testes.append(("Validações Totalização", True))
        else:
            print("❌ 6.5 Validações de totalização ausentes")
            print(f"   Buscando: {validacoes}")
            testes.append(("Validações Totalização", False))
        
        # Teste 6.6: Instância ValidadorImpactoE110
        if 'validador_e110 = ValidadorImpactoE110(' in conteudo:
            print("✅ 6.6 Instância ValidadorImpactoE110 presente")
            testes.append(("Instância ValidadorImpactoE110", True))
        else:
            print("❌ 6.6 Instância ValidadorImpactoE110 ausente")
            testes.append(("Instância ValidadorImpactoE110", False))
        
        # Teste 6.7: Cálculo de impacto E110
        if 'calcular_impacto' in conteudo and 'impacto_e110' in conteudo:
            print("✅ 6.7 Cálculo de impacto E110 presente")
            testes.append(("Cálculo Impacto E110", True))
        else:
            print("❌ 6.7 Cálculo de impacto E110 ausente")
            testes.append(("Cálculo Impacto E110", False))
        
        # Teste 6.8: Evidências detalhadas
        if "'evidencias'" in conteudo and "'xml'" in conteudo and "'sped'" in conteudo:
            print("✅ 6.8 Evidências detalhadas presentes")
            testes.append(("Evidências Detalhadas", True))
        else:
            print("❌ 6.8 Evidências detalhadas ausentes")
            testes.append(("Evidências Detalhadas", False))
        
    except Exception as e:
        print(f"❌ TESTE 6 FALHOU: {e}")
        import traceback
        traceback.print_exc()
        testes.append(("Integração Script", False))
    
    return testes


def gerar_relatorio(todos_testes):
    """Gera relatório final"""
    print("\n" + "="*80)
    print("RELATÓRIO FINAL DE VALIDAÇÃO")
    print("="*80)
    
    total = len(todos_testes)
    sucesso = len([t for t in todos_testes if t[1]])
    falha = total - sucesso
    percentual = (sucesso / total * 100) if total > 0 else 0
    
    print(f"\n📊 RESULTADOS:")
    print(f"   Total de testes: {total}")
    print(f"   ✅ Sucesso: {sucesso}")
    print(f"   ❌ Falha: {falha}")
    print(f"   Percentual: {percentual:.1f}%")
    
    if falha > 0:
        print(f"\n⚠️ TESTES QUE FALHARAM:")
        for nome, resultado in todos_testes:
            if not resultado:
                print(f"   - {nome}")
    
    print("\n" + "="*80)
    
    if percentual == 100:
        print("🎉 TODOS OS TESTES PASSARAM! Sistema 100% implementado!")
    elif percentual >= 90:
        print("✅ Sistema bem implementado, mas com algumas pendências.")
    elif percentual >= 70:
        print("⚠️ Sistema parcialmente implementado, requer atenção.")
    else:
        print("❌ Sistema com problemas críticos, requer revisão urgente.")
    
    print("="*80)
    
    return percentual == 100


def main():
    """Executa todos os testes"""
    print("╔" + "="*78 + "╗")
    print("║" + " "*20 + "VALIDAÇÃO COMPLETA DO SISTEMA" + " "*28 + "║")
    print("║" + " "*18 + "Roteiro XML × SPED - SPED v2.0" + " "*28 + "║")
    print("╚" + "="*78 + "╝")
    
    todos_testes = []
    
    # Executar todos os testes
    todos_testes.extend(test_imports())
    todos_testes.extend(test_sped_parser())
    todos_testes.extend(test_totaling_engine())
    todos_testes.extend(test_validador_impacto_e110())
    todos_testes.extend(test_document_family_grouper())
    todos_testes.extend(test_integracao_processar_validacao())
    
    # Gerar relatório
    sucesso_completo = gerar_relatorio(todos_testes)
    
    return 0 if sucesso_completo else 1


if __name__ == '__main__':
    sys.exit(main())

