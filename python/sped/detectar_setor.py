#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Função para detectar automaticamente o setor baseado no conteúdo do SPED e XMLs
Analisa CFOPs, NCMs, CSTs e outras características conforme legislação EFD
"""
from pathlib import Path
from typing import Optional, Dict, List, Set
import re

# Padrões de detecção por setor baseados na legislação EFD e arquivos de regras
SETOR_PATTERNS = {
    'autopecas': {
        'cfops_especificos': ['1403', '5405'],  # CFOPs com ST específicos de autopeças
        'cfops_compra_st': ['1403'],  # Compra com ST
        'cfops_venda_st': ['5405'],  # Venda com ST
        'cst_esperado': ['060'],  # CST 060 = ST
        'ncm_especificos': ['87089990', '87082999', '84099190'],  # NCMs que exigem CEST
        'ncm_prefix': ['8708', '8709', '4011', '4012', '4013', '8408', '8409'],  # Prefixos de autopeças
        'keywords': [
            r'auto.?peca', r'peça.*auto', r'pneu', r'pneus', r'borracha',
            r'oleo.*motor', r'óleo.*motor', r'filtro', r'filtros',
            r'pastilha.*freio', r'disco.*freio', r'amortecedor',
            r'bateria.*auto', r'correia', r'vela.*ignição', r'radiador',
            r'cabo.*vela', r'carburador', r'injeção.*eletrônica'
        ],
        'peso_cfop_especifico': 10,  # Alto peso para CFOPs específicos
        'peso_cst': 8,  # Alto peso para CST correto
        'peso_ncm_especifico': 6,
        'peso_ncm_prefix': 3,
        'peso_keyword': 2
    },
    'bebidas': {
        'cfops_especificos': ['5405', '6403'],  # Venda com ST (interna e interestadual)
        'cfops_venda_st': ['5405', '6403'],
        'cst_esperado': ['060'],  # CST 060 = ST
        'ncm_especificos': ['22021000', '22029900', '22030000'],  # NCMs que exigem CEST
        'ncm_prefix': ['2201', '2202', '2203', '2204', '2205', '2206', '2207', '2208', '2209'],
        'keywords': [
            r'bebida', r'cerveja', r'refrigerante', r'suco', r'água.*mineral',
            r'vinho', r'vodka', r'whisky', r'cachaça', r'licor', r'rum',
            r'energético', r'isotônico', r'água.*gaseificada', r'champagne',
            r'conhaque', r'gin', r'tequila', r'absinto'
        ],
        'peso_cfop_especifico': 10,
        'peso_cst': 8,
        'peso_ncm_especifico': 6,
        'peso_ncm_prefix': 3,
        'peso_keyword': 2
    },
    'construcao': {
        'cfops_especificos': ['1403', '5405'],  # Compra e venda com ST
        'cfops_compra_st': ['1403'],
        'cfops_venda_st': ['5405'],
        'cst_esperado': ['060'],
        'ncm_especificos': ['39269090', '73079990', '73089090'],  # NCMs que exigem CEST
        'ncm_prefix': ['2523', '2505', '2506', '2507', '6801', '6802', '6803', '6804', '6805', '6806', '6807', '6808', '6809', '6810', '6811', '6812', '6813', '6814', '6815', '7307', '7308', '7309', '7310'],
        'keywords': [
            r'cimento', r'areia', r'pedra', r'tijolo', r'telha', r'argamassa',
            r'construção', r'construcao', r'obra', r'engenharia',
            r'ferro.*construção', r'ferro.*obra', r'concreto', r'bloco',
            r'cerâmica', r'ceramica', r'azulejo', r'piso', r'porcelanato',
            r'ferro.*aço', r'ferro.*barra', r'vergalhão', r'viga', r'coluna'
        ],
        'peso_cfop_especifico': 10,
        'peso_cst': 8,
        'peso_ncm_especifico': 6,
        'peso_ncm_prefix': 3,
        'peso_keyword': 2
    },
    'cosmeticos': {
        'cfops_especificos': ['1403', '5405'],  # Compra e venda com ST
        'cfops_compra_st': ['1403'],
        'cfops_venda_st': ['5405'],
        'cst_esperado': ['060'],
        'ncm_especificos': ['33030020', '33049910', '33051000'],  # NCMs que exigem CEST
        'ncm_prefix': ['3301', '3302', '3303', '3304', '3305', '3306', '3307'],
        'keywords': [
            r'cosmético', r'cosmetico', r'perfume', r'maquiagem', r'sabonete',
            r'shampoo', r'condicionador', r'creme', r'loção', r'protetor.*solar',
            r'desodorante', r'pasta.*dente', r'escova.*dente', r'batom',
            r'sombra', r'base.*maquiagem', r'pó.*compacto', r'rimel'
        ],
        'peso_cfop_especifico': 10,
        'peso_cst': 8,
        'peso_ncm_especifico': 6,
        'peso_ncm_prefix': 3,
        'peso_keyword': 2
    },
    'industria': {
        'cfops_especificos': ['1901', '5901', '5902'],  # Industrialização
        'cfops_industrializacao': ['1901', '5901', '5902'],
        'cst_esperado': ['000', '010', '060'],
        'ncm_especificos': ['40111000', '84082020'],  # NCMs que exigem CEST
        'ncm_prefix': [],  # Muito amplo, não usar apenas prefixo
        'keywords': [
            r'indústria', r'industria', r'fabricação', r'fabricacao', r'produção',
            r'producao', r'manufatura', r'industrial', r'processamento',
            r'industrialização', r'industrializacao', r'fabrica', r'usina'
        ],
        'peso_cfop_especifico': 15,  # Muito alto - CFOPs de industrialização são muito específicos
        'peso_cst': 5,
        'peso_ncm_especifico': 4,
        'peso_ncm_prefix': 0,  # Não usar prefixo para indústria
        'peso_keyword': 3
    },
    'comercio': {
        'cfops_especificos': ['5102', '6102', '1202', '2202', '5405', '6404', '5910', '6910'],
        'cfops_venda_interna': ['5102'],
        'cfops_venda_interestadual': ['6102'],
        'cfops_devolucao': ['1202', '2202'],
        'cfops_bonificacao': ['5910', '6910'],
        'cst_esperado': ['000', '020', '060', '070', '040', '041', '050', '102', '103', '500', '900'],
        'ncm_especificos': ['22021000', '33030010'],  # NCMs que exigem CEST
        'ncm_prefix': [],  # Muito amplo
        'keywords': [
            r'comércio', r'comercio', r'varejo', r'atacado', r'distribuição',
            r'revenda', r'loja', r'supermercado', r'mercado', r'comercial'
        ],
        'peso_cfop_especifico': 5,  # CFOPs de comércio são comuns a vários setores
        'peso_cst': 3,
        'peso_ncm_especifico': 4,
        'peso_ncm_prefix': 0,
        'peso_keyword': 2
    },
    'transporte': {
        'cfops_especificos': ['5353', '6353', '5933', '6933'],  # Serviços de transporte
        'cfops_transporte': ['5353', '6353', '5933', '6933'],
        'cst_esperado': ['000'],
        'ncm_especificos': [],
        'ncm_prefix': ['2710', '2711', '2712', '8701', '8702', '8703', '8704'],  # Combustíveis e veículos
        'keywords': [
            r'transporte', r'frete', r'logística', r'logistica', r'carga',
            r'veículo', r'veiculo', r'caminhão', r'caminhao', r'frota',
            r'combustível', r'combustivel', r'diesel', r'gasolina', r'etanol',
            r'redespacho', r'redespachante'
        ],
        'peso_cfop_especifico': 15,  # CFOPs de transporte são muito específicos
        'peso_cst': 3,
        'peso_ncm_especifico': 0,
        'peso_ncm_prefix': 2,
        'peso_keyword': 2
    },
    'ecommerce': {
        'cfops_especificos': [],  # E-commerce usa CFOPs normais
        'cst_esperado': [],
        'ncm_especificos': [],
        'ncm_prefix': [],
        'keywords': [
            r'e.?commerce', r'ecommerce', r'online', r'digital', r'plataforma',
            r'marketplace', r'loja.*virtual', r'venda.*internet', r'venda.*online'
        ],
        'peso_cfop_especifico': 0,
        'peso_cst': 0,
        'peso_ncm_especifico': 0,
        'peso_ncm_prefix': 0,
        'peso_keyword': 5  # Apenas keywords para e-commerce
    }
}


def detectar_setor(sped_path: Path, xml_dir: Optional[Path] = None) -> List[str]:
    """
    Detecta o(s) setor(es) baseado no conteúdo do arquivo SPED e XMLs.
    Usa análise ponderada baseada em CFOPs específicos, NCMs, CSTs e keywords.
    Retorna múltiplos setores quando houver evidências claras de mais de um setor.
    
    Args:
        sped_path: Caminho para o arquivo SPED
        xml_dir: Caminho opcional para diretório com XMLs
        
    Returns:
        Lista de setores detectados (pode ser vazia se não conseguir detectar)
    """
    if not sped_path.exists():
        return []
    
    scores: Dict[str, int] = {setor: 0 for setor in SETOR_PATTERNS.keys()}
    cfops_encontrados: Set[str] = set()
    ncm_encontrados: Set[str] = set()
    csts_encontrados: Set[str] = set()
    
    try:
        with sped_path.open('r', encoding='latin1', errors='ignore') as f:
            content = f.read()
            lines = content.split('\n')
            
            razao_social = ''
            
            # Analisar linhas relevantes do SPED
            for line in lines:
                if not line.strip():
                    continue
                
                # Capturar razão social (linha 0000)
                if line.startswith('|0000|'):
                    parts = line.split('|')
                    if len(parts) > 6:
                        razao_social = parts[6].upper().strip()
                
                # Analisar C170 (itens)
                if line.startswith('|C170|'):
                    parts = line.split('|')
                    if len(parts) < 6:
                        continue
                    
                    # CFOP (posição 4)
                    if len(parts) > 4:
                        cfop = parts[4].strip()
                        if cfop and len(cfop) == 4 and cfop.isdigit():
                            cfops_encontrados.add(cfop)
                    
                    # Descrição (posição 3)
                    desc = parts[3].upper().strip() if len(parts) > 3 else ''
                    
                    # NCM (posição 5)
                    ncm = parts[5].strip() if len(parts) > 5 else ''
                    if ncm:
                        ncm_encontrados.add(ncm)
                    
                    # CST/CSOSN (posição 6 ou 7, dependendo do layout)
                    cst = ''
                    if len(parts) > 6:
                        cst = parts[6].strip()
                    if len(parts) > 7 and not cst:
                        cst = parts[7].strip()
                    if cst:
                        # Normalizar CST (remover zeros à esquerda se necessário)
                        cst_normalizado = cst.zfill(3) if len(cst) <= 3 else cst[:3]
                        csts_encontrados.add(cst_normalizado)
                
                # Analisar C190 (totais por CFOP/CST)
                if line.startswith('|C190|'):
                    parts = line.split('|')
                    if len(parts) > 4:
                        cfop = parts[4].strip()
                        if cfop and len(cfop) == 4 and cfop.isdigit():
                            cfops_encontrados.add(cfop)
                        if len(parts) > 5:
                            cst = parts[5].strip()
                            if cst:
                                cst_normalizado = cst.zfill(3) if len(cst) <= 3 else cst[:3]
                                csts_encontrados.add(cst_normalizado)
            
            # Calcular scores baseado nos dados coletados
            for setor, pattern in SETOR_PATTERNS.items():
                # 1. CFOPs específicos (maior peso)
                for cfop in cfops_encontrados:
                    if cfop in pattern.get('cfops_especificos', []):
                        scores[setor] += pattern.get('peso_cfop_especifico', 5)
                
                # 2. CSTs esperados
                for cst in csts_encontrados:
                    if cst in pattern.get('cst_esperado', []):
                        scores[setor] += pattern.get('peso_cst', 3)
                
                # 3. NCMs específicos
                for ncm in ncm_encontrados:
                    if ncm in pattern.get('ncm_especificos', []):
                        scores[setor] += pattern.get('peso_ncm_especifico', 4)
                    # NCMs por prefixo
                    for ncm_prefix in pattern.get('ncm_prefix', []):
                        if ncm.startswith(ncm_prefix):
                            scores[setor] += pattern.get('peso_ncm_prefix', 2)
                
                # 4. Keywords na razão social (peso alto)
                for keyword in pattern.get('keywords', []):
                    if razao_social and re.search(keyword, razao_social, re.IGNORECASE):
                        scores[setor] += pattern.get('peso_keyword', 2) * 2  # Dobro para razão social
            
            # Analisar XMLs se fornecidos
            if xml_dir and Path(xml_dir).exists() and Path(xml_dir).is_dir():
                try:
                    import xml.etree.ElementTree as ET
                    xml_files = list(Path(xml_dir).glob('*.xml'))[:100]  # Limitar a 100 XMLs
                    
                    for xml_file in xml_files:
                        try:
                            tree = ET.parse(xml_file)
                            root = tree.getroot()
                            
                            # Buscar elementos ignorando namespace
                            def find_all(tag):
                                results = []
                                # Tentar diferentes namespaces
                                for ns in ['http://www.portalfiscal.inf.br/nfe', '']:
                                    if ns:
                                        results.extend(root.findall(f'.//{{{ns}}}{tag}'))
                                    else:
                                        results.extend(root.findall(f'.//{tag}'))
                                return results
                            
                            # Buscar CFOPs, NCMs e descrições nos XMLs
                            for det in find_all('det'):
                                # CFOP
                                for cfop_elem in det.findall('.//CFOP') + det.findall('.//{http://www.portalfiscal.inf.br/nfe}CFOP'):
                                    if cfop_elem is not None and cfop_elem.text:
                                        cfop = cfop_elem.text.strip()
                                        if len(cfop) == 4 and cfop.isdigit():
                                            cfops_encontrados.add(cfop)
                                
                                # NCM
                                for ncm_elem in det.findall('.//NCM') + det.findall('.//{http://www.portalfiscal.inf.br/nfe}NCM'):
                                    if ncm_elem is not None and ncm_elem.text:
                                        ncm = ncm_elem.text.strip()
                                        ncm_encontrados.add(ncm)
                                
                                # CST/CSOSN
                                for icms in det.findall('.//ICMS') + det.findall('.//{http://www.portalfiscal.inf.br/nfe}ICMS'):
                                    for cst_elem in icms.findall('.//CST') + icms.findall('.//{http://www.portalfiscal.inf.br/nfe}CST'):
                                        if cst_elem is not None and cst_elem.text:
                                            cst = cst_elem.text.strip().zfill(3)
                                            csts_encontrados.add(cst)
                                    for csosn_elem in icms.findall('.//CSOSN') + icms.findall('.//{http://www.portalfiscal.inf.br/nfe}CSOSN'):
                                        if csosn_elem is not None and csosn_elem.text:
                                            csosn = csosn_elem.text.strip().zfill(3)
                                            csts_encontrados.add(csosn)
                                
                                # Descrição de produto
                                for prod_elem in det.findall('.//prod') + det.findall('.//{http://www.portalfiscal.inf.br/nfe}prod'):
                                    if prod_elem is not None:
                                        for xprod in prod_elem.findall('xProd') + prod_elem.findall('{http://www.portalfiscal.inf.br/nfe}xProd'):
                                            if xprod is not None and xprod.text:
                                                desc = xprod.text.upper()
                                                for setor, pattern in SETOR_PATTERNS.items():
                                                    for keyword in pattern.get('keywords', []):
                                                        if re.search(keyword, desc, re.IGNORECASE):
                                                            scores[setor] += pattern.get('peso_keyword', 2)
                        except Exception:
                            continue
                    
                    # Recalcular scores com dados dos XMLs
                    for setor, pattern in SETOR_PATTERNS.items():
                        for cfop in cfops_encontrados:
                            if cfop in pattern.get('cfops_especificos', []):
                                scores[setor] += pattern.get('peso_cfop_especifico', 5) // 2  # Peso menor para XMLs
                        
                        for cst in csts_encontrados:
                            if cst in pattern.get('cst_esperado', []):
                                scores[setor] += pattern.get('peso_cst', 3) // 2
                        
                        for ncm in ncm_encontrados:
                            if ncm in pattern.get('ncm_especificos', []):
                                scores[setor] += pattern.get('peso_ncm_especifico', 4) // 2
                            for ncm_prefix in pattern.get('ncm_prefix', []):
                                if ncm.startswith(ncm_prefix):
                                    scores[setor] += pattern.get('peso_ncm_prefix', 2) // 2
                except Exception:
                    pass
            
            # Encontrar setores com scores significativos
            max_score = max(scores.values()) if scores.values() else 0
            
            # Threshold mínimo baseado no tipo de setor
            thresholds = {
                'industria': 15,  # CFOPs de industrialização são muito específicos
                'transporte': 15,  # CFOPs de transporte são muito específicos
                'autopecas': 10,
                'bebidas': 10,
                'construcao': 10,
                'cosmeticos': 10,
                'comercio': 8,
                'ecommerce': 5  # Apenas keywords
            }
            
            if max_score > 0:
                setores_detectados: List[str] = []
                
                # Ordenar setores por score (maior primeiro)
                setores_ordenados = sorted(scores.items(), key=lambda x: x[1], reverse=True)
                
                # Adicionar setor com maior score se atender threshold
                for setor, score in setores_ordenados:
                    threshold = thresholds.get(setor, 5)
                    
                    # Se o score atender o threshold mínimo
                    if score >= threshold:
                        # Se for o primeiro (maior score), sempre adicionar
                        if len(setores_detectados) == 0:
                            setores_detectados.append(setor)
                        # Se houver outros setores com score muito próximo (dentro de 30% do máximo)
                        elif score >= max_score * 0.7:
                            # Verificar se não é um setor muito genérico que pode ser falso positivo
                            # Comércio e e-commerce são muito genéricos, só adicionar se tiver score muito alto
                            if setor in ['comercio', 'ecommerce']:
                                if score >= max_score * 0.9:  # Precisa estar muito próximo do máximo
                                    setores_detectados.append(setor)
                            else:
                                setores_detectados.append(setor)
                        else:
                            # Se o score for muito menor, parar de adicionar
                            break
                
                # Se detectou múltiplos setores, verificar se faz sentido combiná-los
                if len(setores_detectados) > 1:
                    # Remover combinações que não fazem sentido
                    # Ex: industria + comercio pode fazer sentido (indústria que também comercializa)
                    # Ex: transporte + comercio pode fazer sentido
                    # Ex: autopecas + bebidas não faz sentido
                    
                    setores_finais = []
                    for setor in setores_detectados:
                        # Se já adicionou um setor muito específico, não adicionar genéricos
                        if len(setores_finais) > 0:
                            setores_especificos = ['industria', 'transporte', 'autopecas', 'bebidas', 'construcao', 'cosmeticos']
                            setores_genericos = ['comercio', 'ecommerce']
                            
                            # Se já tem um específico e este é genérico, só adicionar se o genérico tiver score muito alto
                            if setor in setores_genericos:
                                if any(s in setores_especificos for s in setores_finais):
                                    # Só adicionar genérico se seu score for pelo menos 80% do máximo
                                    if scores[setor] >= max_score * 0.8:
                                        setores_finais.append(setor)
                                else:
                                    setores_finais.append(setor)
                            else:
                                setores_finais.append(setor)
                        else:
                            setores_finais.append(setor)
                    
                    return setores_finais
                elif len(setores_detectados) == 1:
                    return setores_detectados
    
    except Exception as e:
        import logging
        logging.warning(f"Erro ao detectar setor: {e}")
        pass
    
    return []


if __name__ == '__main__':
    import sys
    import json
    if len(sys.argv) < 2:
        print(json.dumps({"setores": []}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    xml_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    setores = detectar_setor(sped_path, xml_dir)
    # Retornar como JSON para facilitar parsing no backend
    print(json.dumps({"setores": setores}))
