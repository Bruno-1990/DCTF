"""
Script Python para processar validação SPED v2.0
Utiliza normalizadores e modelo canônico
"""

import sys
import json
import argparse
from pathlib import Path
from decimal import Decimal
from typing import Dict, Any, List
import io

# Configurar encoding UTF-8 para stdout/stderr no Windows
if sys.platform == 'win32':
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except AttributeError:
        # Se já for TextIOWrapper, não fazer nada
        pass

# Adicionar caminho ao sys.path para imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sped.v2.normalization import XMLNormalizer, EFDNormalizer, SPEDParser, RegistroC100, RegistroC170, RegistroC190, RegistroE110
from sped.v2.matching import DocumentMatcher, ItemMatcher
from sped.v2.validation.xml_efd_validator import XmlEfdValidator, Divergencia
from sped.v2.validation.legitimacao_matrix import MatrizLegitimacao, ClassificacaoDivergencia
from sped.v2.validation.totaling_engine import TotalingEngine, DivergenciaTotalizacao
from sped.v2.validation.efd_internal_validator import EFDInternalValidator
from sped.v2.validation.context_validator import ContextValidator
from sped.v2.validation.impacto_e110 import ValidadorImpactoE110, ImpactoE110


def main():
    parser = argparse.ArgumentParser(description='Processar validação SPED v2.0')
    parser.add_argument('sped_path', type=str, help='Caminho do arquivo SPED')
    parser.add_argument('xml_dir', type=str, help='Caminho do diretório com XMLs')
    parser.add_argument('--validation-id', type=str, required=True, help='ID da validação')
    parser.add_argument('--output-dir', type=str, required=True, help='Diretório de saída')
    parser.add_argument('--segmento', type=str, help='Segmento do cliente')
    parser.add_argument('--regime', type=str, help='Regime tributário')
    parser.add_argument('--opera-st', action='store_true', help='Opera com ST')
    parser.add_argument('--regime-especial', action='store_true', help='Tem regime especial')
    parser.add_argument('--opera-interestadual-difal', action='store_true', help='Opera interestadual/DIFAL')
    
    args = parser.parse_args()
    
    sped_path = Path(args.sped_path)
    xml_dir = Path(args.xml_dir)
    output_dir = Path(args.output_dir)
    
    # Criar diretório de saída se não existir
    output_dir.mkdir(parents=True, exist_ok=True)
    
    resultado = {
        'validation_id': args.validation_id,
        'status': 'processing',
        'normalizacao': {},
        'validacoes': [],
        'erros': []
    }
    
    try:
        # Normalizar EFD
        print(f"[SPED v2] Normalizando EFD: {sped_path}")
        efd_normalizer = EFDNormalizer()
        documentos_efd = efd_normalizer.normalize_file(sped_path)
        print(f"[SPED v2] OK: EFD normalizado: {len(documentos_efd)} documentos encontrados")
        
        if len(documentos_efd) == 0:
            print(f"[SPED v2] ATENCAO: Nenhum documento EFD foi normalizado! Verifique o arquivo SPED.")
        else:
            print(f"[SPED v2] INFO: Primeiro documento EFD: chave={documentos_efd[0].chave_acesso}, valor_total={documentos_efd[0].valor_total}, itens={len(documentos_efd[0].itens)}")
        
        resultado['normalizacao']['efd'] = {
            'total_documentos': len(documentos_efd),
            'documentos': [
                {
                    'chave_acesso': doc.chave_acesso,
                    'numero_documento': doc.numero,  # Correto: atributo é 'numero', não 'numero_documento'
                    'serie': doc.serie,
                    'modelo': doc.modelo,
                    'cnpj_emitente': doc.cnpj_emitente,
                    'cnpj_destinatario': doc.cnpj_destinatario,
                    'valor_total': float(doc.valor_total),
                    'total_itens': len(doc.itens)
                }
                for doc in documentos_efd
            ]
        }
        
        # Normalizar XMLs
        print(f"[SPED v2] Normalizando XMLs: {xml_dir}")
        xml_normalizer = XMLNormalizer()
        documentos_xml = xml_normalizer.normalize_folder(xml_dir)
        print(f"[SPED v2] OK: XMLs normalizados: {len(documentos_xml)} documentos encontrados")
        
        if len(documentos_xml) == 0:
            print(f"[SPED v2] ATENCAO: Nenhum documento XML foi normalizado! Verifique o diretório de XMLs.")
        else:
            xmls_validos = [d for d in documentos_xml if d.is_valido()]
            print(f"[SPED v2] INFO: XMLs válidos: {len(xmls_validos)} de {len(documentos_xml)}")
            if xmls_validos:
                print(f"[SPED v2] INFO: Primeiro XML válido: chave={xmls_validos[0].chave_acesso}, valor_total={xmls_validos[0].valor_total}, itens={len(xmls_validos[0].itens)}")
        
        resultado['normalizacao']['xml'] = {
            'total_documentos': len(documentos_xml),
            'documentos': [
                {
                    'chave_acesso': doc.chave_acesso,
                    'numero_documento': doc.numero,  # Correto: atributo é 'numero', não 'numero_documento'
                    'serie': doc.serie,
                    'modelo': doc.modelo,
                    'cnpj_emitente': doc.cnpj_emitente,
                    'cnpj_destinatario': doc.cnpj_destinatario,
                    'valor_total': float(doc.valor_total),
                    'total_itens': len(doc.itens)
                }
                for doc in documentos_xml
            ]
        }
        
        # ========== MATCHING DE DOCUMENTOS ==========
        print(f"[SPED v2] Fazendo matching de documentos...")
        print(f"[SPED v2] INFO: Antes do matching: {len(documentos_xml)} XMLs, {len(documentos_efd)} EFDs")
        matches = []
        try:
            document_matcher = DocumentMatcher(
                tolerancia_valor=0.01,
                tolerancia_data_dias=1,
                tolerancia_percentual=0.001
            )
            matches = document_matcher.match_documentos(documentos_xml, documentos_efd)
            matches_ok = [m for m in matches if m.matched]
            print(f"[SPED v2] OK: Matching concluído: {len(matches_ok)} documentos matched de {len(matches)} tentativas")
            
            if len(matches_ok) == 0:
                print(f"[SPED v2] ATENCAO: Nenhum documento foi matched! Isso pode explicar por que não há divergências.")
                print(f"[SPED v2] INFO: Verificando chaves de acesso...")
                if documentos_xml:
                    print(f"[SPED v2]   Primeiras 3 chaves XML: {[d.chave_acesso for d in documentos_xml[:3] if d.chave_acesso]}")
                if documentos_efd:
                    print(f"[SPED v2]   Primeiras 3 chaves EFD: {[d.chave_acesso for d in documentos_efd[:3] if d.chave_acesso]}")
        except Exception as e:
            print(f"[SPED v2] ERRO: Erro no matching de documentos: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            # Continuar mesmo com erro no matching
        
        resultado['matching'] = {
            'total_matches': len([m for m in matches if m.matched]),
            'total_xml': len(documentos_xml),
            'total_efd': len(documentos_efd),
            'matches_confiaveis': len([m for m in matches if m.is_confiavel()]),
            'matches': [
                {
                    'chave_xml': m.xml_doc.chave_acesso,
                    'chave_efd': m.sped_doc.chave_acesso if m.sped_doc else None,
                    'matched': m.matched,
                    'confiavel': m.is_confiavel(),
                    'score': m.match_score.score_total,
                    'strategy': m.match_score.strategy.value,
                    'total_itens_matched': len(m.itens_matched),
                    'itens_nao_matched_xml': len(m.itens_nao_matched_xml),
                    'itens_nao_matched_sped': len(m.itens_nao_matched_sped)
                }
                for m in matches
            ]
        }
        
        # ========== MATCHING DE ITENS ==========
        print(f"[SPED v2] Fazendo matching de itens...")
        item_matcher = ItemMatcher()
        
        # Criar índice de cadastro 0200 do EFD (se disponível)
        map_0200 = {}
        # TODO: Extrair cadastro 0200 do EFD quando disponível
        
        total_itens_matched = 0
        total_itens_nao_matched = 0
        
        for match in matches:
            if match.matched and match.sped_doc:
                # Fazer matching detalhado de itens
                for xml_item in match.xml_doc.itens:
                    item_result = item_matcher.match_itens(
                        xml_item,
                        match.sped_doc.itens,
                        match.sped_doc
                    )
                    if item_result.matched:
                        total_itens_matched += 1
                    else:
                        total_itens_nao_matched += 1
        
        resultado['matching']['itens'] = {
            'total_matched': total_itens_matched,
            'total_nao_matched': total_itens_nao_matched
        }
        
        # ========== CAMADA B: VALIDAÇÃO INTERNA DA EFD ==========
        print(f"[SPED v2] [CAMADA B] Validando consistência interna da EFD...")
        validacoes_internas = []
        try:
            efd_validator = EFDInternalValidator(
                tolerancia_linha=0.01,
                tolerancia_documento=0.10
            )
            validation_result = efd_validator.validate(sped_path)
            
            if validation_result.issues:
                print(f"[SPED v2] [CAMADA B] ATENCAO: Encontrados {len(validation_result.issues)} problemas internos na EFD")
                for issue in validation_result.issues[:5]:  # Mostrar primeiros 5
                    print(f"  - {issue.registro}: {issue.message}")
            else:
                print(f"[SPED v2] [CAMADA B] OK: EFD internamente consistente")
            
            validacoes_internas = validation_result.issues
        except Exception as e:
            print(f"[SPED v2] [CAMADA B] ERRO: Erro na validação interna: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        # ========== VALIDAÇÃO DE TOTALIZAÇÃO (CADEIAS C170→C190→C100→E110) ==========
        print(f"[SPED v2] [MOTOR DE TOTALIZAÇÃO] Validando cadeias C170→C190→C100→E110...")
        divergencias_totalizacao = []
        
        try:
            # Parse registros SPED
            print(f"[SPED v2] Parseando registros SPED (C100, C170, C190, E110)...")
            sped_parser = SPEDParser(sped_path)
            
            if not sped_parser.parse():
                print(f"[SPED v2] ATENCAO: Erro ao parsear registros SPED para totalização", file=sys.stderr)
            else:
                print(f"[SPED v2] OK: Parse concluído - C100: {len(sped_parser.registros_c100)}, "
                      f"C170: {len(sped_parser.registros_c170)}, C190: {len(sped_parser.registros_c190)}, "
                      f"E110: {len(sped_parser.registros_e110)}")
                
                # Converter registros SPED para formato TotalingEngine
                from sped.v2.validation.totaling_engine import (
                    RegistroC170 as EngineC170,
                    RegistroC190 as EngineC190,
                    RegistroC100 as EngineC100,
                    RegistroE110 as EngineE110
                )
                
                # Converter C170
                c170_engine = []
                for c170 in sped_parser.registros_c170:
                    c170_engine.append(EngineC170(
                        chave=c170.chv_nfe_pai,
                        cfop=c170.cfop,
                        cst=c170.cst_icms,
                        vl_item=c170.vl_item,
                        vl_desconto=c170.vl_desc,
                        vl_bc_icms=c170.vl_bc_icms,
                        vl_icms=c170.vl_icms,
                        vl_bc_icms_st=c170.vl_bc_icms_st,
                        vl_icms_st=c170.vl_icms_st,
                        vl_ipi=c170.vl_ipi,
                        vl_pis=c170.vl_pis,
                        vl_cofins=c170.vl_cofins,
                        metadata={'num_item': c170.num_item, 'cod_item': c170.cod_item}
                    ))
                
                # Converter C190
                c190_engine = []
                for c190 in sped_parser.registros_c190:
                    c190_engine.append(EngineC190(
                        chave=c190.chv_nfe_pai,
                        cfop=c190.cfop,
                        cst=c190.cst_icms,
                        vl_opr=c190.vl_opr,
                        vl_bc_icms=c190.vl_bc_icms,
                        vl_icms=c190.vl_icms,
                        vl_bc_icms_st=c190.vl_bc_icms_st,
                        vl_icms_st=c190.vl_icms_st,
                        vl_ipi=c190.vl_ipi,
                        metadata={'cod_obs': c190.cod_obs}
                    ))
                
                # Converter C100
                c100_engine = []
                for c100 in sped_parser.registros_c100:
                    # Extrair competência da data do documento (DDMMYYYY)
                    competencia = ''
                    if c100.dt_doc and len(c100.dt_doc) == 8:
                        mm = c100.dt_doc[2:4]
                        yyyy = c100.dt_doc[4:8]
                        competencia = f"{mm}/{yyyy}"
                    
                    c100_engine.append(EngineC100(
                        chave=c100.chv_nfe,
                        vl_merc=c100.vl_merc,
                        vl_frt=c100.vl_frt,
                        vl_seg=c100.vl_seg,
                        vl_desc=c100.vl_desc,
                        vl_out=c100.vl_out_da,
                        vl_bc_icms=c100.vl_bc_icms,
                        vl_icms=c100.vl_icms,
                        vl_bc_icms_st=c100.vl_bc_icms_st,
                        vl_icms_st=c100.vl_icms_st,
                        vl_ipi=c100.vl_ipi,
                        competencia=competencia,
                        metadata={'cod_sit': c100.cod_sit, 'num_doc': c100.num_doc}
                    ))
                
                # Converter E110
                e110_engine = []
                for e110 in sped_parser.registros_e110:
                    e110_engine.append(EngineE110(
                        competencia=e110.competencia,
                        vl_tot_debitos=e110.vl_tot_debitos,
                        vl_aj_debitos=e110.vl_aj_debitos,
                        vl_tot_aj_debitos=e110.vl_tot_aj_debitos,
                        vl_estornos_cred=e110.vl_estornos_cred,
                        vl_tot_creditos=e110.vl_tot_creditos,
                        vl_aj_creditos=e110.vl_aj_creditos,
                        vl_tot_aj_creditos=e110.vl_tot_aj_creditos,
                        vl_estornos_deb=e110.vl_estornos_deb,
                        vl_sld_credor_ant=e110.vl_sld_credor_ant,
                        vl_sld_apurado=e110.vl_sld_apurado,
                        vl_tot_deducoes=e110.vl_tot_ded,
                        vl_icms_recolher=e110.vl_icms_recolher,
                        metadata={}
                    ))
                
                # Executar TotalingEngine
                print(f"[SPED v2] Executando validações de totalização...")
                totaling_engine = TotalingEngine(
                    tolerancia_linha=Decimal('0.01'),
                    tolerancia_documento_min=Decimal('0.10'),
                    tolerancia_documento_max=Decimal('1.00'),
                    tolerancia_periodo_min=Decimal('2.00'),
                    tolerancia_periodo_max=Decimal('10.00')
                )
                
                # Validar C170 → C190
                divs_c170_c190 = totaling_engine.validar_cadeia_c170_c190(c170_engine, c190_engine)
                print(f"[SPED v2] Validação C170→C190: {len(divs_c170_c190)} divergências")
                
                # Validar C190 → C100
                divs_c190_c100 = totaling_engine.validar_cadeia_c190_c100(c190_engine, c100_engine)
                print(f"[SPED v2] Validação C190→C100: {len(divs_c190_c100)} divergências")
                
                # Validar C100 → E110
                divs_c100_e110 = totaling_engine.validar_cadeia_c100_e110(c100_engine, e110_engine)
                print(f"[SPED v2] Validação C100→E110: {len(divs_c100_e110)} divergências")
                
                # Consolidar todas divergências de totalização
                todas_divs_totalizacao = divs_c170_c190 + divs_c190_c100 + divs_c100_e110
                
                # Converter divergências de totalização para formato de Divergencia
                for div_tot in todas_divs_totalizacao:
                    # Criar divergência compatível com o formato esperado
                    divergencia = Divergencia(
                        tipo=f"totalizacao_{div_tot.cadeia.replace('→', '_para_')}",
                        nivel='documento',
                        descricao=div_tot.mensagem,
                        valor_xml=None,
                        valor_efd=None,
                        diferenca=div_tot.diferenca_absoluta,
                        percentual_diferenca=div_tot.percentual_diferenca,
                        severidade='alta',  # Totalização é sempre alta severidade
                        documento_xml=None,
                        documento_efd=None,
                        contexto={
                            'cadeia': div_tot.cadeia,
                            'tipo_divergencia': div_tot.tipo,
                            'chave': div_tot.chave,
                            'competencia': div_tot.competencia,
                            'cfop': div_tot.cfop,
                            'cst': div_tot.cst,
                            'valor_esperado': float(div_tot.valor_esperado) if div_tot.valor_esperado else None,
                            'valor_encontrado': float(div_tot.valor_encontrado) if div_tot.valor_encontrado else None,
                            'impacto_e110': True,  # Totalização sempre impacta E110
                        }
                    )
                    divergencias_totalizacao.append(divergencia)
                
                print(f"[SPED v2] OK: Motor de Totalização concluído - {len(divergencias_totalizacao)} divergências encontradas")
                
        except Exception as e:
            print(f"[SPED v2] ERRO: Erro no Motor de Totalização: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        # ========== CAMADA C: VALIDAÇÃO XML × EFD ==========
        print(f"[SPED v2] [CAMADA C] Executando validação XML × EFD...")
        print(f"[SPED v2] Total de documentos XML: {len(documentos_xml)}")
        print(f"[SPED v2] Total de documentos EFD: {len(documentos_efd)}")
        print(f"[SPED v2] Total de matches: {len([m for m in matches if m.matched])}")
        
        # Preparar perfil fiscal
        perfil_fiscal = {
            'segmento': args.segmento,
            'regime': args.regime,
            'operaST': args.opera_st,
            'regimeEspecial': args.regime_especial,
            'operaInterestadualDIFAL': args.opera_interestadual_difal,
        }
        
        # Criar ContextValidator para consultar RAG antes de criar divergências
        print(f"[SPED v2] Inicializando ContextValidator (RAG)...")
        # RAG desabilitado por padrão - será usado apenas na geração automática de regras
        context_validator = ContextValidator(use_rag=False)
        
        resultado_validacao = None
        try:
            # Passar ContextValidator para o validator
            validator = XmlEfdValidator(
                tolerancia=Decimal('0.02'),
                context_validator=context_validator
            )
            
            # Criar dicionário de matches para o validator
            matches_dict = {}
            for match in matches:
                if match.matched and match.xml_doc.chave_acesso and match.sped_doc:
                    matches_dict[match.xml_doc.chave_acesso] = match.sped_doc.chave_acesso or ''
            
            print(f"[SPED v2] Matches para validação: {len(matches_dict)}")
            
            resultado_validacao = validator.validar(
                documentos_xml,
                documentos_efd,
                matches_dict,
                perfil_fiscal
            )
            print(f"[SPED v2] OK: Validação base concluída: {len(resultado_validacao.divergencias)} divergências encontradas")
            
            # Adicionar divergências de totalização ao resultado
            if divergencias_totalizacao:
                resultado_validacao.divergencias.extend(divergencias_totalizacao)
                print(f"[SPED v2] INFO: Adicionadas {len(divergencias_totalizacao)} divergências de totalização")
            
            # ========== APLICAR MATRIZ DE LEGITIMAÇÃO ==========
            print(f"[SPED v2] Aplicando Matriz de Legitimação...")
            matriz = MatrizLegitimacao()
            divergencias_classificadas = []
            
            # ========== CALCULAR IMPACTO E110 ==========
            print(f"[SPED v2] Calculando impacto E110 nas divergências...")
            validador_e110 = ValidadorImpactoE110(tolerancia_minima=Decimal('0.50'))
            
            # Obter E110 original se disponível
            e110_original = e110_engine[0] if e110_engine else None
            
            for div in resultado_validacao.divergencias:
                # Extrair contexto fiscal
                contexto = matriz.extrair_contexto_fiscal(
                    div.documento_xml,
                    div.documento_efd,
                    perfil_fiscal
                )
                
                # Calcular impacto E110
                impacto_e110 = validador_e110.calcular_impacto(div, e110_original, perfil_fiscal)
                
                # Classificar divergência
                classificacao, score_confianca, explicacao, regra_aplicada = matriz.classificar_divergencia(
                    div.tipo,
                    contexto,
                    div.diferenca or Decimal('0'),
                    div.percentual_diferenca or Decimal('0'),
                    contexto.tem_ajuste_c197 or contexto.tem_ajuste_e111,
                    chave_nfe=div.chave_nfe or div.documento_xml.chave_acesso if div.documento_xml else ""
                )
                
                # Ajustar severidade baseada no impacto E110
                severidade_original = div.severidade
                if impacto_e110.prioridade == 'ALTA' and impacto_e110.altera_apuracao:
                    div.severidade = 'alta'
                elif impacto_e110.prioridade == 'MEDIA':
                    div.severidade = 'media' if div.severidade == 'baixa' else div.severidade
                
                # Atualizar divergência com classificação e impacto
                div.contexto.update({
                    'classificacao': classificacao.value,
                    'score_confianca': score_confianca,
                    'explicacao_legitimacao': explicacao,
                    'regra_aplicada': regra_aplicada,  # NOVO: Nome da regra aplicada
                    'cfop': contexto.cfop,
                    'cst': contexto.cst,
                    'tem_st': contexto.tem_st,
                    'tem_difal': contexto.tem_difal,
                    'impacto_e110': {
                        'impacto_debitos': float(impacto_e110.impacto_debitos),
                        'impacto_creditos': float(impacto_e110.impacto_creditos),
                        'impacto_saldo_apurado': float(impacto_e110.impacto_saldo_apurado),
                        'impacto_icms_recolher': float(impacto_e110.impacto_icms_recolher),
                        'altera_apuracao': impacto_e110.altera_apuracao,
                        'prioridade': impacto_e110.prioridade,
                        'explicacao': impacto_e110.explicacao,
                    },
                    'severidade_ajustada': div.severidade != severidade_original,
                })
                
                divergencias_classificadas.append(div)
            
            print(f"[SPED v2] OK: {len(divergencias_classificadas)} divergências classificadas com impacto E110")
            
            # ========== FILTRAR DIVERGÊNCIAS LEGÍTIMAS ==========
            # Conforme roteiro: não retornar divergências classificadas como LEGÍTIMO
            print(f"[SPED v2] Filtrando divergências legítimas...")
            divergencias_filtradas = [
                div for div in divergencias_classificadas
                if div.contexto.get('classificacao') != 'LEGÍTIMO'
            ]
            
            # Opcional: também filtrar REVISAR com score muito baixo (< 30)
            divergencias_filtradas = [
                div for div in divergencias_filtradas
                if div.contexto.get('classificacao') != 'REVISAR' or div.contexto.get('score_confianca', 0) >= 30
            ]
            
            # Substituir divergências pelas filtradas
            resultado_validacao.divergencias = divergencias_filtradas
            
            print(f"[SPED v2] INFO: Após filtragem: {len(divergencias_filtradas)} divergências (de {len(divergencias_classificadas)} originais)")
            print(f"[SPED v2] INFO: {len(divergencias_classificadas) - len(divergencias_filtradas)} divergências legítimas foram filtradas")
            
            # Log detalhado das divergências
            if resultado_validacao.divergencias:
                print(f"[SPED v2] INFO: Divergências classificadas:")
                por_classificacao = {}
                for div in resultado_validacao.divergencias:
                    classificacao = div.contexto.get('classificacao', 'REVISAR')
                    por_classificacao[classificacao] = por_classificacao.get(classificacao, 0) + 1
                
                for classificacao, count in por_classificacao.items():
                    print(f"  - {classificacao}: {count}")
                
                # Mostrar algumas divergências de exemplo
                erros = [d for d in resultado_validacao.divergencias if d.contexto.get('classificacao') == 'ERRO']
                if erros:
                    print(f"[SPED v2] INFO: Exemplos de ERROS encontrados:")
                    for i, div in enumerate(erros[:3], 1):
                        print(f"  {i}. {div.descricao} (Score: {div.contexto.get('score_confianca', 0)})")
            else:
                print(f"[SPED v2] ATENCAO: NENHUMA divergência encontrada - isso pode indicar um problema")
                print(f"[SPED v2] Verificando se há documentos para validar...")
                print(f"  - XMLs válidos: {len([d for d in documentos_xml if d.is_valido()])}")
                print(f"  - EFDs válidos: {len(documentos_efd)}")
                print(f"  - Matches: {len(matches_dict)}")
        except Exception as e:
            print(f"[SPED v2] ERRO: Erro na validação XML x EFD: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            # Criar resultado vazio se houver erro
            from sped.v2.validation.xml_efd_validator import ResultadoValidacao
            resultado_validacao = ResultadoValidacao()
        
        # ========== CONVERTER DIVERGÊNCIAS PARA FORMATO DO FRONTEND ==========
        divergencias_formatadas = []
        if resultado_validacao and resultado_validacao.divergencias:
            for i, div in enumerate(resultado_validacao.divergencias):
                # Usar classificação da Matriz de Legitimação (se disponível)
                classificacao = div.contexto.get('classificacao', 'REVISAR')
                if not classificacao:
                    # Fallback para classificação baseada na severidade
                    classificacao = 'ERRO' if div.severidade == 'alta' else 'REVISAR' if div.severidade == 'media' else 'LEGÍTIMO'
                
                # Determinar impacto baseado na classificação e diferença
                if classificacao == 'ERRO':
                    impacto = 'alto'
                elif classificacao == 'REVISAR':
                    # Impacto baseado na diferença
                    diferenca_abs = abs(div.diferenca) if div.diferenca else Decimal('0')
                    if diferenca_abs > Decimal('100.00'):
                        impacto = 'alto'
                    elif diferenca_abs > Decimal('10.00'):
                        impacto = 'medio'
                    else:
                        impacto = 'baixo'
                else:
                    impacto = 'baixo'
                
                # Calcular diferença
                diferenca = float(div.diferenca) if div.diferenca else 0.0
                if div.valor_xml and div.valor_efd:
                    diferenca = float(div.valor_xml - div.valor_efd)
                
                # Determinar campo
                campo = div.contexto.get('campo', div.tipo) if div.contexto else div.tipo
                
                # Determinar tipo
                tipo = div.tipo
                if div.contexto:
                    if 'cfop' in div.contexto:
                        tipo = f"CFOP {div.contexto.get('cfops_xml', [])}"
                    elif 'tributo' in div.contexto:
                        tipo = f"{div.contexto['tributo']}"
                
                # Score de confiança da Matriz de Legitimação
                score_confianca = div.contexto.get('score_confianca', 75.0)
                if not score_confianca:
                    # Fallback
                    score_confianca = 100.0 if div.severidade == 'alta' else 70.0 if div.severidade == 'media' else 50.0
                
                # Explicação completa (descrição + explicação da legitimação)
                explicacao_completa = div.descricao
                if div.contexto.get('explicacao_legitimacao'):
                    explicacao_completa += f" | {div.contexto['explicacao_legitimacao']}"
                
                # ========== EVIDÊNCIAS DETALHADAS (SPED + XML) ==========
                evidencias = {
                    'xml': {},
                    'sped': {},
                    'documento': {}
                }
                
                # Evidências do XML
                if div.documento_xml:
                    evidencias['xml'] = {
                        'chave_acesso': div.documento_xml.chave_acesso,
                        'numero': div.documento_xml.numero,
                        'serie': div.documento_xml.serie,
                        'modelo': div.documento_xml.modelo,
                        'data_emissao': div.documento_xml.data_emissao,
                        'cnpj_emitente': div.documento_xml.cnpj_emitente,
                        'cnpj_destinatario': div.documento_xml.cnpj_destinatario,
                        'valor_total': float(div.documento_xml.valor_total) if div.documento_xml.valor_total else None,
                        'valor_produtos': float(div.documento_xml.valor_produtos) if div.documento_xml.valor_produtos else None,
                    }
                    
                    # Tags fiscais do XML
                    if div.documento_xml.itens and len(div.documento_xml.itens) > 0:
                        primeiro_item = div.documento_xml.itens[0]
                        evidencias['xml']['tags_fiscais'] = {
                            'cfop': primeiro_item.cfop,
                            'cst': primeiro_item.icms.cst if primeiro_item.icms else None,
                            'csosn': primeiro_item.icms.cst if primeiro_item.icms else None,  # CSOSN também está em cst
                            'origem': primeiro_item.icms.origem if primeiro_item.icms else None,
                        }
                
                # Evidências do SPED
                if div.documento_efd:
                    evidencias['sped'] = {
                        'chave_acesso': div.documento_efd.chave_acesso,
                        'numero': div.documento_efd.numero,
                        'serie': div.documento_efd.serie,
                        'modelo': div.documento_efd.modelo,
                        'data_emissao': div.documento_efd.data_emissao,
                        'codigo_participante': div.documento_efd.cnpj_emitente or div.documento_efd.cnpj_destinatario,
                        'valor_total': float(div.documento_efd.valor_total) if div.documento_efd.valor_total else None,
                        'cod_sit': div.documento_efd.metadata.get('cod_sit') if div.documento_efd.metadata else None,
                    }
                    
                    # Tags fiscais do SPED
                    if div.documento_efd.itens and len(div.documento_efd.itens) > 0:
                        primeiro_item_sped = div.documento_efd.itens[0]
                        evidencias['sped']['registros'] = {
                            'cfop': primeiro_item_sped.cfop,
                            'cst': primeiro_item_sped.icms.cst if primeiro_item_sped.icms else None,
                            'vl_bc_icms': float(primeiro_item_sped.icms.base_calculo) if primeiro_item_sped.icms else None,
                            'vl_icms': float(primeiro_item_sped.icms.valor) if primeiro_item_sped.icms else None,
                        }
                
                # Evidências do documento (contexto fiscal)
                evidencias['documento'] = {
                    'tipo': div.contexto.get('tpNF'),
                    'finalidade': div.contexto.get('finalidade_nfe'),
                    'operacao': 'Entrada' if div.contexto.get('tpNF') == '0' else 'Saída',
                    'tem_st': div.contexto.get('tem_st', False),
                    'tem_difal': div.contexto.get('tem_difal', False),
                    'tem_fcp': div.contexto.get('tem_fcp', False),
                }
                
                # Se tem impacto E110, adicionar às evidências
                impacto_e110_info = div.contexto.get('impacto_e110')
                if impacto_e110_info:
                    evidencias['impacto_apuracao'] = {
                        'altera_apuracao': impacto_e110_info.get('altera_apuracao', False),
                        'prioridade': impacto_e110_info.get('prioridade', 'BAIXA'),
                        'impacto_debitos': impacto_e110_info.get('impacto_debitos', 0.0),
                        'impacto_creditos': impacto_e110_info.get('impacto_creditos', 0.0),
                        'impacto_icms_recolher': impacto_e110_info.get('impacto_icms_recolher', 0.0),
                    }
                
                divergencia_formatada = {
                    'id': f"div_{i+1}",
                    'campo': campo,
                    'tipo': tipo,
                    'classificacao': classificacao,
                    'impacto': impacto,
                    'diferenca': diferenca,
                    'valor_xml': float(div.valor_xml) if div.valor_xml else 0.0,
                    'valor_sped': float(div.valor_efd) if div.valor_efd else 0.0,
                    'score_confianca': float(score_confianca),
                    'explicacao': explicacao_completa,
                    'chave_nfe': div.documento_xml.chave_acesso if div.documento_xml else None,
                    'nivel': div.nivel,
                    'contexto': div.contexto,
                    'evidencias': evidencias,  # ✅ NOVAS EVIDÊNCIAS DETALHADAS
                }
                divergencias_formatadas.append(divergencia_formatada)
        
        if resultado_validacao:
            resultado['validacoes'] = {
                'total_divergencias': len(divergencias_formatadas),
                'divergencias': divergencias_formatadas,
                'score_concordancia': float(resultado_validacao.score_concordancia) if resultado_validacao.score_concordancia else 0.0,
                'documentos_validados': resultado_validacao.documentos_validados,
                'documentos_sem_match': len(resultado_validacao.documentos_sem_match),
                'operacoes_efd_sem_xml': len(resultado_validacao.operacoes_efd_sem_xml),
                'resumo': resultado_validacao.to_dict() if hasattr(resultado_validacao, 'to_dict') else {}
            }
        else:
            resultado['validacoes'] = {
                'total_divergencias': 0,
                'divergencias': [],
                'score_concordancia': 0.0,
                'documentos_validados': 0,
                'documentos_sem_match': 0,
                'operacoes_efd_sem_xml': 0,
                'resumo': {}
            }
        
        resultado['status'] = 'completed'
        resultado['message'] = f'Validação concluída: {len(divergencias_formatadas)} divergências encontradas'
        
    except Exception as e:
        resultado['status'] = 'error'
        resultado['erros'].append({
            'tipo': type(e).__name__,
            'mensagem': str(e)
        })
        print(f"[SPED v2] Erro: {e}", file=sys.stderr)
    
    # Salvar resultado
    resultado_path = output_dir / 'resultado.json'
    with open(resultado_path, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False, default=str)
    
    # Imprimir resultado JSON para stdout
    print(json.dumps(resultado, indent=2, ensure_ascii=False, default=str))
    
    sys.exit(0 if resultado['status'] == 'completed' else 1)


if __name__ == '__main__':
    main()





