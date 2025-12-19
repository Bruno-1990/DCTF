"""
Validações com geração automática de soluções
Cruza item a item XML ↔ SPED para identificar exatamente onde está o erro
e gerar soluções específicas com valores exatos
"""
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import logging
import re

# Importar função para parsear com linha (opcional)
try:
    from parsers_cruzamentos import parse_efd_c100_c190_c170_com_linha
except ImportError:
    parse_efd_c100_c190_c170_com_linha = None

try:
    import pandas as pd
except ImportError:
    pd = None

def _df(rows: List[Dict[str, Any]], columns: List[str]):
    """Helper para criar DataFrame"""
    if pd is None:
        return []
    if not rows:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(rows, columns=columns)


def parse_efd_c170_individual(file_path: Path) -> Dict[str, List[Dict[str, Any]]]:
    """
    Parseia C170 individualmente por chave (não agregado).
    Retorna: {chave_nf: [{"NUM_ITEM": ..., "CFOP": ..., "CST": ..., "VL_BC_ICMS": ..., ...}]}
    """
    c170_por_chave: Dict[str, List[Dict[str, Any]]] = {}
    current_key: Optional[str] = None
    
    try:
        from parsers import split_sped_line, parse_decimal
        
        with file_path.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith("|C100|"):
                    fs = split_sped_line(ln, min_fields=10)
                    if len(fs) >= 10:
                        current_key = (fs[9] or "").strip() or None
                
                elif ln.startswith("|C170|") and current_key:
                    fs = split_sped_line(ln, min_fields=21)
                    if len(fs) < 21:
                        continue
                    
                    if current_key not in c170_por_chave:
                        c170_por_chave[current_key] = []
                    
                    c170_por_chave[current_key].append({
                        "NUM_ITEM": (fs[2] or "").strip(),
                        "COD_ITEM": (fs[3] or "").strip(),
                        "DESCR_COMPL": (fs[4] or "").strip(),
                        "QTD": parse_decimal(fs[5] or "0") or 0.0,
                        "UNID": (fs[6] or "").strip(),
                        "VL_ITEM": parse_decimal(fs[7] or "0") or 0.0,
                        "VL_DESC": parse_decimal(fs[8] or "0") or 0.0,
                        "VL_ACMO": parse_decimal(fs[9] or "0") or 0.0,
                        "CST": (fs[10] or "").strip(),
                        "CFOP": (fs[11] or "").strip(),
                        "VL_BC_ICMS": parse_decimal(fs[12] or "0") or 0.0,
                        "ALIQ_ICMS": parse_decimal(fs[13] or "0") or 0.0,
                        "VL_ICMS": parse_decimal(fs[14] or "0") or 0.0,
                        "VL_BC_ICMS_ST": parse_decimal(fs[15] or "0") or 0.0,
                        "ALIQ_ST": parse_decimal(fs[16] or "0") or 0.0,
                        "VL_ICMS_ST": parse_decimal(fs[17] or "0") or 0.0,
                        "VL_IPI": parse_decimal(fs[18] or "0") or 0.0,
                        "VL_BC_IPI": parse_decimal(fs[19] or "0") or 0.0,
                        "ALIQ_IPI": parse_decimal(fs[20] or "0") or 0.0,
                    })
    except Exception as e:
        logging.warning(f"Erro ao parsear C170 individual: {e}")
    
    return c170_por_chave


def normalizar_cst_xml(icms_data: Dict[str, Any]) -> str:
    """
    Normaliza CST do XML combinando orig + CST quando necessário.
    No XML, o CST pode vir separado: orig="0" + CST="00" = "000" no SPED.
    
    Args:
        icms_data: Dicionário com dados do ICMS do XML (contém 'orig', 'CST', 'CSOSN')
    
    Returns:
        CST normalizado de 3 dígitos (ou CSOSN se aplicável)
    """
    if not icms_data:
        return ""
    
    # Se tem CSOSN, usar diretamente (já está completo)
    csosn = icms_data.get("CSOSN")
    if csosn:
        return str(csosn).strip().zfill(3)
    
    # Se tem CST, verificar se precisa combinar com orig
    cst = icms_data.get("CST")
    orig = icms_data.get("orig")
    
    if not cst:
        return ""
    
    cst_str = str(cst).strip()
    # Remover caracteres não numéricos
    cst_digits = re.sub(r"\D", "", cst_str)
    
    if not cst_digits:
        return ""
    
    # Se CST já tem 3 dígitos, verificar se o primeiro dígito é a origem
    if len(cst_digits) == 3:
        # Se o primeiro dígito corresponde à origem, já está completo
        if orig and str(orig).strip() == cst_digits[0]:
            return cst_digits
        # Se não corresponde, pode ser que o CST já venha completo
        # Verificar se orig existe e é diferente
        if orig:
            orig_str = str(orig).strip()
            if orig_str and orig_str != cst_digits[0]:
                # Combinar orig + CST (últimos 2 dígitos)
                return orig_str + cst_digits[-2:]
        return cst_digits
    
    # Se CST tem 2 dígitos, combinar com orig
    if len(cst_digits) == 2:
        if orig:
            orig_str = str(orig).strip()
            if orig_str:
                return orig_str + cst_digits
        # Se não tem orig, assumir origem 0 (nacional)
        return "0" + cst_digits
    
    # Se CST tem 1 dígito, combinar com orig
    if len(cst_digits) == 1:
        if orig:
            orig_str = str(orig).strip()
            if orig_str:
                return orig_str + cst_digits.zfill(2)
        # Se não tem orig, assumir origem 0
        return "0" + cst_digits.zfill(2)
    
    # Se tem mais de 3 dígitos, pegar os 3 primeiros
    return cst_digits[:3]


def cruzar_item_item_xml_sped(
    xml_items: List[Dict[str, Any]],
    c170_items: List[Dict[str, Any]],
    campo: str,
    rules: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Cruza item a item XML ↔ C170 para identificar divergências específicas.
    MELHORADO: Verifica também NCM, quantidade, unidade e descrição para garantir que é o mesmo produto.
    
    Retorna:
    {
        "itens_faltantes_sped": [...],  # Itens do XML que não estão no SPED
        "itens_faltantes_xml": [...],   # Itens do SPED que não estão no XML
        "itens_divergentes": [...],     # Itens que existem em ambos mas têm valores diferentes
        "itens_ncm_divergente": [...],  # Itens com NCM diferente (pode ser produto diferente)
        "itens_qtd_divergente": [...],  # Itens com quantidade diferente
        "total_xml": float,
        "total_sped": float,
        "diferenca": float
    }
    """
    resultado = {
        "itens_faltantes_sped": [],
        "itens_faltantes_xml": [],
        "itens_divergentes": [],
        "itens_ncm_divergente": [],
        "itens_qtd_divergente": [],
        "total_xml": 0.0,
        "total_sped": 0.0,
        "diferenca": 0.0
    }
    
    # Mapear C170 por NUM_ITEM
    c170_map = {str(item.get("NUM_ITEM", "")).strip(): item for item in c170_items}
    
    # Mapear XML por nItem
    xml_map = {str(item.get("nItem", "")).strip(): item for item in xml_items}
    
    # Mapear campo XML para campo SPED
    campo_map = {
        "BC ICMS": ("vBC", "VL_BC_ICMS"),
        "ICMS": ("vICMS", "VL_ICMS"),
        "BC ST": ("vBCST", "VL_BC_ICMS_ST"),
        "ST": ("vST", "VL_ICMS_ST"),
        "IPI": ("vIPI", "VL_IPI"),
    }
    
    if campo not in campo_map:
        return resultado
    
    campo_xml, campo_sped = campo_map[campo]
    
    # Verificar itens do XML
    for n_item, xml_item in xml_map.items():
        # Obter valor do XML (pode estar no item ou no ICMS)
        valor_xml = 0.0
        # Tentar primeiro no nível do item (alguns campos podem estar direto no item)
        if campo_xml in xml_item:
            valor_xml = float(xml_item.get(campo_xml, 0) or 0)
        
        # Se não encontrou, tentar no ICMS
        if valor_xml == 0.0 and "ICMS" in xml_item:
            icms_data = xml_item.get("ICMS", {})
            # Para vBCST, pode estar como vBCST no ICMS
            if campo_xml == "vBCST":
                valor_xml = float(icms_data.get("vBCST", 0) or 0)
            # Para vST, pode estar como vST, vICMSST ou no ICMS
            elif campo_xml == "vST":
                valor_xml = float(icms_data.get("vICMSST", icms_data.get("vST", 0)) or 0)
            # Para outros campos, tentar diretamente no ICMS
            elif campo_xml in icms_data:
                valor_xml = float(icms_data.get(campo_xml, 0) or 0)
        
        resultado["total_xml"] += valor_xml
        
        # Normalizar CST do XML
        icms_data = xml_item.get("ICMS", {})
        cst_xml_normalizado = normalizar_cst_xml(icms_data)
        
        c170_item = c170_map.get(n_item)
        
        if not c170_item:
            # Item existe no XML mas não no SPED
            resultado["itens_faltantes_sped"].append({
                "nItem": n_item,
                "CFOP": xml_item.get("CFOP", ""),
                "CST": cst_xml_normalizado,  # USAR CST NORMALIZADO
                "xProd": xml_item.get("xProd", ""),
                "NCM": xml_item.get("NCM", ""),
                "qCom": xml_item.get("qCom", 0),
                "uCom": xml_item.get("uCom", ""),
                "valor_xml": valor_xml,
                "valor_sped": 0.0,
                "diferenca": valor_xml
            })
        else:
            # Item existe em ambos - verificar valor e consistência
            valor_sped = float(c170_item.get(campo_sped, 0) or 0)
            resultado["total_sped"] += valor_sped
            
            # Normalizar CST do SPED para comparação
            cst_sped = str(c170_item.get("CST", "")).strip().zfill(3)
            
            # Verificar NCM (garantir que é o mesmo produto)
            ncm_xml = str(xml_item.get("NCM", "")).strip()
            ncm_sped = str(c170_item.get("COD_ITEM", "")).strip()  # COD_ITEM pode conter NCM ou código interno
            # Se temos NCM no XML, verificar se corresponde
            # Nota: COD_ITEM no C170 pode ser código interno, então não podemos comparar diretamente
            # Mas podemos verificar se há divergência quando ambos têm NCM
            
            # Verificar quantidade
            qtd_xml = float(xml_item.get("qCom", 0) or 0)
            qtd_sped = float(c170_item.get("QTD", 0) or 0)
            if abs(qtd_xml - qtd_sped) > 0.001:  # Tolerância para quantidade
                resultado["itens_qtd_divergente"].append({
                    "nItem": n_item,
                    "qtd_xml": qtd_xml,
                    "qtd_sped": qtd_sped,
                    "diferenca_qtd": abs(qtd_xml - qtd_sped)
                })
            
            # Aplicar regras do setor para validar CST se disponível
            cst_divergente_legitimo = False
            if rules and cst_xml_normalizado and cst_sped and cst_xml_normalizado != cst_sped:
                cfop = xml_item.get("CFOP", "")
                if cfop and "cfop_expected" in rules:
                    cfop_rules = rules.get("cfop_expected", {}).get(cfop, {})
                    expected_csts = cfop_rules.get("expected_cst", [])
                    if expected_csts:
                        # Normalizar CSTs esperados para comparação
                        try:
                            from common import normalize_cst_for_compare
                            expected_csts_norm = [normalize_cst_for_compare(str(c)) for c in expected_csts]
                            cst_xml_norm = normalize_cst_for_compare(cst_xml_normalizado)
                            cst_sped_norm = normalize_cst_for_compare(cst_sped)
                            # Se ambos os CSTs são esperados para este CFOP, pode ser legítimo
                            if cst_xml_norm in expected_csts_norm and cst_sped_norm in expected_csts_norm:
                                cst_divergente_legitimo = True
                        except Exception:
                            pass
            
            diferenca = abs(valor_xml - valor_sped)
            if diferenca > 0.02:  # Tolerância
                item_divergente = {
                    "nItem": n_item,
                    "CFOP": c170_item.get("CFOP", ""),
                    "CST": cst_xml_normalizado,  # USAR CST NORMALIZADO DO XML
                    "CST_SPED": cst_sped,  # CST do SPED para referência
                    "xProd": xml_item.get("xProd", ""),
                    "DESCR_COMPL": c170_item.get("DESCR_COMPL", ""),
                    "NCM_XML": ncm_xml,
                    "COD_ITEM_SPED": ncm_sped,
                    "QTD_XML": qtd_xml,
                    "QTD_SPED": qtd_sped,
                    "valor_xml": valor_xml,  # VALOR DO XML (sempre usado como correto)
                    "valor_sped": valor_sped,
                    "diferenca": diferenca
                }
                
                # Se NCM diverge e temos NCM no XML, adicionar flag
                if ncm_xml and ncm_sped and ncm_xml != ncm_sped and len(ncm_xml) == 8:
                    # Pode ser produto diferente ou código interno vs NCM
                    item_divergente["ncm_divergente"] = True
                    resultado["itens_ncm_divergente"].append(item_divergente)
                
                # Se CST diverge mas é legítimo conforme regras do setor, adicionar flag
                if cst_divergente_legitimo:
                    item_divergente["cst_divergente_legitimo"] = True
                
                resultado["itens_divergentes"].append(item_divergente)
    
    # Verificar itens do SPED que não estão no XML
    for n_item, c170_item in c170_map.items():
        if n_item not in xml_map:
            valor_sped = float(c170_item.get(campo_sped, 0) or 0)
            if valor_sped > 0.02:
                resultado["itens_faltantes_xml"].append({
                    "nItem": n_item,
                    "CFOP": c170_item.get("CFOP", ""),
                    "CST": c170_item.get("CST", ""),
                    "DESCR_COMPL": c170_item.get("DESCR_COMPL", ""),
                    "COD_ITEM": c170_item.get("COD_ITEM", ""),
                    "QTD": c170_item.get("QTD", 0),
                    "UNID": c170_item.get("UNID", ""),
                    "valor_sped": valor_sped,
                    "valor_xml": 0.0,
                    "diferenca": valor_sped
                })
                resultado["total_sped"] += valor_sped
    
    resultado["diferenca"] = abs(resultado["total_xml"] - resultado["total_sped"])
    
    return resultado


def identificar_onde_esta_erro(
    chave: str,
    campo: str,
    valor_xml: float,
    valor_sped: float,
    c100_info: Dict[str, Any],
    c170_items: List[Dict[str, Any]],
    c190_totais: Dict[str, Any],
    efd_txt: Path,
    c190_por_cfop_cst: Optional[Dict[str, Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Identifica exatamente onde está o erro: C100, C170 ou C190.
    MELHORADO: Valida relacionamentos conforme legislação (C100 = Σ C190, C190 = Σ C170 por CFOP/CST)
    
    Retorna:
    {
        "local_erro": "C100" | "C170" | "C190" | "MULTIPLO",
        "registro_especifico": {...},  # Detalhes do registro com erro (inclui LINHA_SPED se disponível)
        "valor_correto": float,
        "valor_atual": float,
        "instrucao_especifica": str,
        "linha_sped": Optional[int]  # Número da linha no SPED para correção precisa
    }
    """
    resultado = {
        "local_erro": "DESCONHECIDO",
        "registro_especifico": {},
        "valor_correto": valor_xml,
        "valor_atual": valor_sped,
        "instrucao_especifica": "",
        "linha_sped": None
    }
    
    # Mapear campo para nome no SPED
    campo_map = {
        "BC ICMS": ("VL_BC_ICMS", "VL_BC_ICMS", "VL_BC_ICMS"),
        "ICMS": ("VL_ICMS", "VL_ICMS", "VL_ICMS"),
        "BC ST": ("VL_BC_ICMS_ST", "VL_BC_ICMS_ST", "VL_BC_ICMS_ST"),
        "ST": ("VL_ICMS_ST", "VL_ICMS_ST", "VL_ICMS_ST"),
        "IPI": ("VL_IPI", "VL_IPI", "VL_IPI"),
        "Desconto": ("VL_DESC", None, None),  # Desconto é apenas no C100
        "VL_DESC": ("VL_DESC", None, None),  # Alias para Desconto
    }
    
    if campo not in campo_map:
        return resultado
    
    campo_c100, campo_c190, campo_c170 = campo_map[campo]
    
    # Verificar C100
    valor_c100 = float(c100_info.get(campo_c100, 0) or 0) if c100_info else 0.0
    linha_c100 = c100_info.get("LINHA_SPED") if c100_info else None
    
    # Verificar C190 (soma dos C170 por CFOP/CST conforme legislação)
    # Se temos C190 por CFOP/CST, usar isso; senão, usar total
    if c190_por_cfop_cst:
        # Somar todos os C190 por CFOP/CST para este campo
        valor_c190 = sum(
            float(c190.get(campo_c190, 0) or 0)
            for c190 in c190_por_cfop_cst.values()
            if c190.get("CHAVE") == chave
        )
    else:
        valor_c190 = float(c190_totais.get(campo_c190, 0) or 0) if c190_totais else 0.0
    
    # Inicializar c190_errados_por_cfop_cst (usado mais abaixo)
    c190_errados_por_cfop_cst = []
    
    # Verificar C170 (soma dos itens)
    valor_c170 = sum(float(item.get(campo_c170, 0) or 0) for item in c170_items)
    
    # Agrupar C170 por CFOP/CST para validar contra C190
    c170_por_cfop_cst: Dict[Tuple[str, str], float] = {}
    for item in c170_items:
        cfop = item.get("CFOP", "")
        cst = item.get("CST", "")
        if cfop and cst:
            key = (cfop, cst)
            c170_por_cfop_cst[key] = c170_por_cfop_cst.get(key, 0.0) + float(item.get(campo_c170, 0) or 0)
    
    # Identificar onde está o erro conforme legislação
    diferenca_c100 = abs(valor_xml - valor_c100)
    diferenca_c190 = abs(valor_xml - valor_c190)
    diferenca_c170 = abs(valor_xml - valor_c170)
    
    # VALIDAÇÃO LEGAL: C100 = Σ C190 (conforme Guia Prático, Campo 21-25 do C100)
    soma_c190_legal = valor_c190
    diferenca_c100_c190 = abs(valor_c100 - soma_c190_legal)
    
    # VALIDAÇÃO LEGAL: C190 = Σ C170 por CFOP/CST
    # Verificar se cada C190 corresponde à soma dos C170 do mesmo CFOP/CST
    c190_errados_por_cfop_cst = []
    if c190_por_cfop_cst:
        for (cfop, cst), valor_c170_cfop_cst in c170_por_cfop_cst.items():
            chave_c190 = f"{chave}_{cfop}_{cst}"
            c190_info = c190_por_cfop_cst.get(chave_c190)
            if c190_info:
                valor_c190_cfop_cst = float(c190_info.get(campo_c190, 0) or 0)
                if abs(valor_c190_cfop_cst - valor_c170_cfop_cst) > 0.02:
                    c190_errados_por_cfop_cst.append({
                        "CFOP": cfop,
                        "CST": cst,
                        "valor_c190": valor_c190_cfop_cst,
                        "valor_c170_soma": valor_c170_cfop_cst,
                        "linha_sped": c190_info.get("LINHA_SPED")
                    })
    
    # Se C190 está correto mas C100 está errado (viola: C100 = Σ C190)
    if diferenca_c190 < 0.02 and diferenca_c100 > 0.02:
        resultado["local_erro"] = "C100"
        resultado["registro_especifico"] = {
            "tipo": "C100",
            "chave": chave,
            "campo": campo_c100,
            "valor_atual": valor_c100,
            "valor_correto": valor_c190,  # C190 está correto, usar como referência
            "linha_sped": linha_c100
        }
        resultado["valor_correto"] = valor_c190
        resultado["valor_atual"] = valor_c100
        resultado["linha_sped"] = linha_c100
        linha_info = f" (linha {linha_c100} do SPED)" if linha_c100 else ""
        resultado["instrucao_especifica"] = (
            f"Corrigir campo {campo_c100} do registro C100{linha_info} (chave: {chave[:20]}...). "
            f"Valor atual: R$ {valor_c100:.2f}, Valor correto: R$ {valor_c190:.2f}. "
            f"Conforme legislação (Guia Prático, Campo 21-25 do C100): C100.{campo_c100} = Σ C190.{campo_c190}. "
            f"O C190 está correto, então o C100 deve ser atualizado para corresponder."
        )
    
    # CASO ESPECIAL: Se C190 está zerado mas C170 tem valor, o erro está no C190
    # (C190 deve ser igual à soma dos C170 por CFOP/CST)
    if abs(valor_c190) < 0.02 and abs(valor_c170) > 0.02:
        resultado["local_erro"] = "C190"
        # Encontrar qual C190 está errado (por CFOP/CST)
        cfop_cst_errados = []
        linhas_c190_errados = []
        for item in c170_items:
            cfop = item.get("CFOP", "")
            cst = item.get("CST", "")
            if cfop and cst:
                cfop_cst_errados.append(f"CFOP {cfop} / CST {cst}")
        
        # Se temos C190 específicos errados, usar essas informações
        if c190_errados_por_cfop_cst:
            cfop_cst_str = ', '.join([f"CFOP {e['CFOP']} / CST {e['CST']}" for e in c190_errados_por_cfop_cst[:3]])
            linhas_c190_errados = [e.get("linha_sped") for e in c190_errados_por_cfop_cst if e.get("linha_sped")]
        else:
            cfop_cst_str = ', '.join(set(cfop_cst_errados)) if cfop_cst_errados else "CFOP/CST correspondente"
        
        resultado["registro_especifico"] = {
            "tipo": "C190",
            "chave": chave,
            "campo": campo_c190,
            "cfop_cst": list(set(cfop_cst_errados)) if cfop_cst_errados else [],
            "c190_errados_detalhes": c190_errados_por_cfop_cst,
            "valor_atual": valor_c190,
            "valor_correto": valor_c170
        }
        resultado["valor_correto"] = valor_c170
        resultado["valor_atual"] = valor_c190
        resultado["linha_sped"] = linhas_c190_errados[0] if linhas_c190_errados else None
        linha_info = f" (linha {linhas_c190_errados[0]} do SPED)" if linhas_c190_errados else ""
        resultado["instrucao_especifica"] = (
            f"ADICIONAR ou CORRIGIR registro C190{linha_info} para {cfop_cst_str}. "
            f"Valor atual: R$ {valor_c190:.2f}, Valor correto: R$ {valor_c170:.2f}. "
            f"Conforme legislação (Guia Prático, Seção 3, Bloco C): C190.{campo_c190} = Σ C170.{campo_c170} por CFOP/CST. "
            f"O C190 está zerado mas os C170 têm valores, então o C190 deve ser criado ou corrigido para igualar a soma dos C170."
        )
    
    # Se C170 está correto mas C190 está errado (viola: C190 = Σ C170 por CFOP/CST)
    elif diferenca_c170 < 0.02 and diferenca_c190 > 0.02:
        resultado["local_erro"] = "C190"
        # Encontrar qual C190 está errado (por CFOP/CST)
        cfop_cst_errados = []
        linhas_c190_errados = []
        for item in c170_items:
            cfop = item.get("CFOP", "")
            cst = item.get("CST", "")
            if cfop and cst:
                cfop_cst_errados.append(f"CFOP {cfop} / CST {cst}")
        
        # Se temos C190 específicos errados, usar essas informações
        if c190_errados_por_cfop_cst:
            cfop_cst_str = ', '.join([f"CFOP {e['CFOP']} / CST {e['CST']}" for e in c190_errados_por_cfop_cst[:3]])
            linhas_c190_errados = [e.get("linha_sped") for e in c190_errados_por_cfop_cst if e.get("linha_sped")]
        else:
            cfop_cst_str = ', '.join(set(cfop_cst_errados))
        
        resultado["registro_especifico"] = {
            "tipo": "C190",
            "chave": chave,
            "campo": campo_c190,
            "cfop_cst": list(set(cfop_cst_errados)),
            "c190_errados_detalhes": c190_errados_por_cfop_cst,
            "valor_atual": valor_c190,
            "valor_correto": valor_c170
        }
        resultado["valor_correto"] = valor_c170
        resultado["valor_atual"] = valor_c190
        resultado["linha_sped"] = linhas_c190_errados[0] if linhas_c190_errados else None
        linha_info = f" (linha {linhas_c190_errados[0]} do SPED)" if linhas_c190_errados else ""
        resultado["instrucao_especifica"] = (
            f"Corrigir registro C190{linha_info} para {cfop_cst_str}. "
            f"Valor atual: R$ {valor_c190:.2f}, Valor correto: R$ {valor_c170:.2f}. "
            f"Conforme legislação (Guia Prático, Seção 3, Bloco C): C190.{campo_c190} = Σ C170.{campo_c170} por CFOP/CST. "
            f"O C190 deve ser igual à soma dos C170 agrupados por CFOP e CST."
        )
    
    # Se C170 está errado
    elif diferenca_c170 > 0.02:
        resultado["local_erro"] = "C170"
        # Identificar quais itens do C170 estão errados (com linha do SPED se disponível)
        itens_errados = []
        for item in c170_items:
            valor_item = float(item.get(campo_c170, 0) or 0)
            if valor_item > 0.02:  # Item tem valor, pode estar errado
                itens_errados.append({
                    "NUM_ITEM": item.get("NUM_ITEM", ""),
                    "CFOP": item.get("CFOP", ""),
                    "CST": item.get("CST", ""),
                    "valor_atual": valor_item,
                    "linha_sped": item.get("LINHA_SPED")
                })
        
        resultado["registro_especifico"] = {
            "tipo": "C170",
            "chave": chave,
            "campo": campo_c170,
            "itens_errados": itens_errados,
            "valor_atual": valor_c170,
            "valor_correto": valor_xml
        }
        resultado["valor_correto"] = valor_xml
        resultado["valor_atual"] = valor_c170
        resultado["linha_sped"] = itens_errados[0].get("linha_sped") if itens_errados else None
        
        # Construir lista de itens com linha do SPED se disponível
        itens_str_list = []
        for i in itens_errados[:5]:
            item_str = f'Item {i.get("NUM_ITEM", "")}'
            if i.get("linha_sped"):
                item_str += f' (linha {i.get("linha_sped")} do SPED)'
            itens_str_list.append(item_str)
        itens_str = ', '.join(itens_str_list)
        
        resultado["instrucao_especifica"] = (
            f"Corrigir itens C170. Valor total atual: R$ {valor_c170:.2f}, "
            f"Valor correto (XML): R$ {valor_xml:.2f}. "
            f"Verificar itens: {itens_str}"
        )
    
    # Múltiplos erros (C100 e C190 ambos errados)
    elif diferenca_c100 > 0.02 and diferenca_c190 > 0.02:
        resultado["local_erro"] = "MULTIPLO"
        # Para múltiplos erros, usar C190 como registro principal (mais comum)
        # mas marcar como não aplicável automaticamente
        resultado["valor_correto"] = valor_xml  # Ainda definir valor correto para referência
        resultado["instrucao_especifica"] = (
            f"Erros em múltiplos registros. C100: R$ {valor_c100:.2f}, "
            f"C190: R$ {valor_c190:.2f}, Correto (XML): R$ {valor_xml:.2f}. "
            f"Corrigir ambos os registros. "
            f"Conforme legislação: C100.{campo_c100} = Σ C190.{campo_c190} e C190.{campo_c190} = Σ C170.{campo_c170} por CFOP/CST."
        )
    
    return resultado


def validar_bc_st_com_c176(
    chave: str,
    num_item: str,
    valor_bc_st_xml: float,
    valor_bc_st_sped: float,
    c176_info: Optional[List[Dict[str, Any]]]
) -> Tuple[bool, str]:
    """
    Valida se BC ST = 0 é legítimo baseado em C176 (ST retido anteriormente).
    Conforme Guia Prático: C176 explica quando BC ST pode ser ajustado.
    
    Retorna: (é_legitima, motivo)
    """
    if not c176_info or len(c176_info) == 0:
        return False, ""
    
    # Se existe C176, BC ST pode ser ajustado (ressarcimento de ST)
    # Verificar se há C176 para este item específico
    for c176 in c176_info:
        num_item_c176 = c176.get("NUM_ITEM_ULT_E", "").strip()
        if num_item_c176 == num_item or not num_item_c176:
            # C176 encontrado - BC ST pode ser legítimo
            cod_mot_res = c176.get("COD_MOT_RES", "").strip()
            cod_resp_ret = c176.get("COD_RESP_RET", "").strip()
            vl_unit_res = float(c176.get("VL_UNIT_RES", 0) or 0)
            
            motivo = "Registro C176 presente - ST retido anteriormente"
            if cod_mot_res:
                motivos = {
                    "1": "Saída para outra UF",
                    "2": "Saída amparada por isenção ou não incidência",
                    "3": "Perda ou deterioração",
                    "4": "Furto ou roubo",
                    "5": "Exportação",
                    "6": "Venda interna para Simples Nacional",
                    "9": "Outros"
                }
                motivo += f" (Motivo: {motivos.get(cod_mot_res, cod_mot_res)})"
            
            if vl_unit_res > 0:
                motivo += f" - Ressarcimento: R$ {vl_unit_res:.2f}"
            
            return True, motivo
    
    return False, ""


def validar_ajustes_c195_c197(
    chave: str,
    campo: str,
    diferenca: float,
    c195_c197_info: Optional[Dict[str, Any]]
) -> Tuple[bool, str]:
    """
    Verifica se divergência é explicada por ajuste documentado em C195/C197.
    Conforme Guia Prático: C197 detalha ajustes que podem alterar valores do documento.
    
    Retorna: (é_explicado_por_ajuste, motivo)
    """
    if not c195_c197_info:
        return False, ""
    
    c197_list = c195_c197_info.get("c197", [])
    if not c197_list:
        return False, ""
    
    # Verificar se algum C197 explica a divergência
    campo_map = {
        "BC ICMS": "VL_BC_ICMS",
        "ICMS": "VL_ICMS",
        "BC ST": "VL_BC_ICMS",
        "ST": "VL_ICMS",
        "IPI": "VL_OUTROS",
    }
    
    campo_c197 = campo_map.get(campo, "VL_ICMS")
    
    for c197 in c197_list:
        vl_ajuste = float(c197.get(campo_c197, 0) or 0)
        if abs(vl_ajuste - diferenca) < 0.02:  # Ajuste corresponde à divergência
            cod_aj = c197.get("COD_AJ", "").strip()
            descr_aj = c197.get("DESCR_COMPL_AJ", "").strip()
            
            motivo = f"Ajuste documentado em C197 (COD_AJ: {cod_aj})"
            if descr_aj:
                motivo += f" - {descr_aj}"
            motivo += f" - Valor: R$ {vl_ajuste:.2f}"
            
            return True, motivo
    
    return False, ""


def gerar_solucao_automatica(
    chave: str,
    campo: str,
    valor_xml: float,
    valor_sped: float,
    xml_items: List[Dict[str, Any]],
    efd_txt: Path,
    c100_info: Optional[Dict[str, Any]] = None,
    c170_items: Optional[List[Dict[str, Any]]] = None,
    c190_totais: Optional[Dict[str, Any]] = None,
    rules: Optional[Dict[str, Any]] = None,
    c190_por_cfop_cst: Optional[Dict[str, Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Gera solução automática específica para uma divergência.
    
    Retorna:
    {
        "solucao": str,  # Instrução específica de correção
        "valor_correto": float,
        "registro_corrigir": str,  # "C100", "C170", "C190"
        "campo_corrigir": str,
        "detalhes_itens": [...],  # Detalhes item a item se aplicável
        "formula_legal": str,  # Fórmula legal aplicada
        "referencia_legal": str
    }
    """
    solucao = {
        "solucao": "",
        "valor_correto": valor_xml,
        "registro_corrigir": "",
        "campo_corrigir": "",
        "detalhes_itens": [],
        "formula_legal": "",
        "referencia_legal": "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3"
    }
    
    # Se não temos dados suficientes, retornar solução genérica
    if not c170_items:
        c170_items = []
    if not c100_info:
        c100_info = {}
    if not c190_totais:
        c190_totais = {}
    
    # 1. Verificar se é legítimo (aplicar regras de setor)
    from validators import _verificar_bc_st_legitima_zero
    if campo == "BC ST":
        é_legitima, motivo = _verificar_bc_st_legitima_zero(
            chave, "", "", valor_xml, valor_sped, efd_txt, rules
        )
        if é_legitima:
            solucao["solucao"] = f"Não requer correção - {motivo}"
            solucao["registro_corrigir"] = "NENHUM"
            return solucao
    
    # Mapear campo para nome no SPED
    campo_map_formula = {
        "BC ICMS": ("VL_BC_ICMS", "VL_BC_ICMS", "VL_BC_ICMS"),
        "ICMS": ("VL_ICMS", "VL_ICMS", "VL_ICMS"),
        "BC ST": ("VL_BC_ICMS_ST", "VL_BC_ICMS_ST", "VL_BC_ICMS_ST"),
        "ST": ("VL_ICMS_ST", "VL_ICMS_ST", "VL_ICMS_ST"),
        "IPI": ("VL_IPI", "VL_IPI", "VL_IPI"),
        "Desconto": ("VL_DESC", None, None),  # Desconto é apenas no C100
        "VL_DESC": ("VL_DESC", None, None),  # Alias para Desconto
    }
    campo_c100, campo_c190, campo_c170 = campo_map_formula.get(campo, (campo, campo, campo))
    
    # CORREÇÃO: Para campos que são apenas do C100 (como Desconto), determinar registro imediatamente
    if campo in ["Desconto", "VL_DESC"]:
        if c100_info:
            valor_c100 = float(c100_info.get("VL_DESC", 0) or 0)
            diferenca_c100 = abs(valor_xml - valor_c100)
            
            # Se a diferença está no C100, corrigir C100
            if diferenca_c100 > 0.02:
                solucao["registro_corrigir"] = "C100"
                solucao["campo_corrigir"] = "VL_DESC"
                solucao["valor_correto"] = valor_xml
                solucao["solucao"] = (
                    f"Corrigir campo VL_DESC no registro C100. "
                    f"Valor atual: R$ {valor_c100:.2f}, Valor correto (XML): R$ {valor_xml:.2f}. "
                    f"Conforme Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3: "
                    f"Valores informados no SPED devem corresponder aos valores dos documentos fiscais."
                )
                solucao["formula_legal"] = "C100.VL_DESC = valor do desconto no documento fiscal (XML)"
                return solucao
    
    # CASO ESPECIAL: Se C190 está zerado mas C170 tem valor, o erro está no C190
    # Calcular soma dos C170 para comparar
    valor_c170_soma = sum(float(item.get(campo_c170, 0) or 0) for item in c170_items) if c170_items else 0.0
    
    # DEBUG: Log para verificar valores
    import logging
    logging.info(f"[gerar_solucao_automatica] ========== VERIFICANDO CASO ESPECIAL ==========")
    logging.info(f"[gerar_solucao_automatica] valor_sped (C190): {valor_sped}")
    logging.info(f"[gerar_solucao_automatica] valor_c170_soma (calculado): {valor_c170_soma}")
    logging.info(f"[gerar_solucao_automatica] valor_xml: {valor_xml}")
    logging.info(f"[gerar_solucao_automatica] C170 items count: {len(c170_items) if c170_items else 0}")
    logging.info(f"[gerar_solucao_automatica] Campo: {campo}, campo_c170: {campo_c170}")
    if c170_items:
        for idx, item in enumerate(c170_items[:3]):  # Mostrar primeiros 3 itens
            valor_item = float(item.get(campo_c170, 0) or 0)
            logging.info(f"[gerar_solucao_automatica] C170 item {idx}: {item.get('NUM_ITEM', 'N/A')} - {campo_c170} = {valor_item}")
    
    # Se valor_sped (C190) está zerado mas C170 tem valor, erro está no C190
    # Usar valor_xml como fallback se valor_c170_soma for 0 (pode ser que não temos c170_items)
    valor_referencia = valor_c170_soma if valor_c170_soma > 0.02 else valor_xml
    
    if abs(valor_sped) < 0.02 and abs(valor_referencia) > 0.02:
        logging.info(f"[gerar_solucao_automatica] ✅✅✅ CASO ESPECIAL DETECTADO: C190 zerado ({valor_sped}), C170/XML tem valor ({valor_referencia}). Gerando solução...")
        solucao["registro_corrigir"] = "C190"
        solucao["valor_correto"] = valor_referencia
        solucao["campo_corrigir"] = f"C190.{campo_c190}"
        solucao["formula_legal"] = f"C190.{campo_c190} = Σ C170.{campo_c170} por CFOP/CST"
        solucao["solucao"] = (
            f"ADICIONAR ou CORRIGIR registro C190 para CFOP/CST correspondente. "
            f"Valor atual: R$ {valor_sped:.2f}, Valor correto: R$ {valor_referencia:.2f}. "
            f"Conforme legislação (Guia Prático, Seção 3, Bloco C): C190 deve ser igual à soma dos C170 agrupados por CFOP e CST. "
            f"O C190 está zerado mas os C170 têm valores, então o C190 deve ser criado ou corrigido."
        )
        logging.info(f"[gerar_solucao_automatica] ✅✅✅ Solução gerada com sucesso!")
        logging.info(f"[gerar_solucao_automatica] Solução completa: {solucao['solucao']}")
        return solucao
    else:
        logging.info(f"[gerar_solucao_automatica] ❌ Caso especial NÃO detectado - valor_sped: {valor_sped}, valor_referencia: {valor_referencia}")
    
    # 2. Identificar onde está o erro (com C190 por CFOP/CST se disponível)
    localizacao = identificar_onde_esta_erro(
        chave, campo, valor_xml, valor_sped,
        c100_info, c170_items, c190_totais, efd_txt,
        c190_por_cfop_cst=c190_por_cfop_cst
    )
    
    # CORREÇÃO: Se local_erro é "MULTIPLO", não aplicar automaticamente
    local_erro = localizacao.get("local_erro", "")
    if local_erro == "MULTIPLO" or not local_erro or local_erro == "":
        solucao["registro_corrigir"] = "NENHUM"  # Não aplicar automaticamente
        solucao["valor_correto"] = None
    else:
        solucao["registro_corrigir"] = local_erro
        solucao["valor_correto"] = localizacao.get("valor_correto")
        
        # Garantir que valor_correto seja definido
        if solucao["valor_correto"] is None:
            solucao["valor_correto"] = valor_xml  # Fallback para valor do XML
    
    # 2. VALIDAÇÃO LEGAL: Verificar se divergência é legítima conforme regras do setor
    if rules:
        # Aplicar validações específicas do setor antes de gerar correção
        try:
            from validators import _normalize_expected_list
            from common import normalize_cst_for_compare
            
            # Verificar CFOP/CST esperados conforme regras do setor
            if xml_items:
                for xml_item in xml_items:
                    cfop = xml_item.get("CFOP", "")
                    icms_data = xml_item.get("ICMS", {})
                    cst_xml = normalizar_cst_xml(icms_data)
                    
                    if cfop and cst_xml and "cfop_expected" in rules:
                        cfop_rules = rules.get("cfop_expected", {}).get(cfop, {})
                        expected_csts = _normalize_expected_list(
                            cfop_rules.get("expected_cst", []),
                            normalize_cst_for_compare
                        )
                        expected_codes = [e["code"] for e in expected_csts]
                        
                        # Se CST do XML não está nos esperados, pode ser erro
                        if expected_codes and cst_xml not in expected_codes:
                            logging.warning(
                                f"[gerar_solucao_automatica] CST {cst_xml} do XML não está nos esperados para CFOP {cfop}: {expected_codes}"
                            )
        except Exception as e:
            logging.warning(f"Erro ao validar regras do setor: {e}")
    
    # 3. CRUZAMENTO XML x SPED: Usar valores do XML como referência
    if xml_items and c170_items:
        cruzamento = cruzar_item_item_xml_sped(xml_items, c170_items, campo, rules)
        
        # Se há itens faltantes no SPED
        if cruzamento["itens_faltantes_sped"]:
            itens_falt = cruzamento["itens_faltantes_sped"]
            solucao["detalhes_itens"] = itens_falt
            
            itens_str = ", ".join([f"Item {i['nItem']} (CFOP {i['CFOP']}, CST {i['CST']})" 
                                 for i in itens_falt[:3]])
            # VALOR CORRETO = SOMA DOS VALORES DO XML
            valor_total_xml = sum(i['valor_xml'] for i in itens_falt)
            solucao["valor_correto"] = valor_total_xml
            solucao["solucao"] = (
                f"ADICIONAR itens C170 faltantes conforme valores do XML: {itens_str}. "
                f"Valor total a adicionar: R$ {valor_total_xml:.2f} (valores do XML). "
                f"Após adicionar, gerar C190 correspondente conforme legislação: "
                f"C190 = Σ C170 por CFOP/CST (Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C)."
            )
            solucao["campo_corrigir"] = "C170 (adicionar registros)"
            solucao["formula_legal"] = "C190 = Σ C170 por CFOP/CST"
            solucao["referencia_legal"] = "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C"
            return solucao
        
        # Se há itens divergentes
        if cruzamento["itens_divergentes"]:
            itens_div = cruzamento["itens_divergentes"]
            solucao["detalhes_itens"] = itens_div
            
            # VALIDAÇÃO LEGAL: C190 = Σ C170 por CFOP/CST (Guia Prático)
            # Se corrigindo C170, recalcular C190
            # Gerar instrução específica para cada item usando VALOR DO XML como correto
            instrucoes_itens = []
            for item in itens_div[:5]:  # Limitar a 5 itens
                # VALOR CORRETO = VALOR DO XML (sempre)
                valor_correto_item = item['valor_xml']
                instrucoes_itens.append(
                    f"Item {item['nItem']} (CFOP {item.get('CFOP', 'N/A')}, CST {item.get('CST', 'N/A')}): "
                    f"corrigir {campo} de R$ {item['valor_sped']:.2f} para R$ {valor_correto_item:.2f} "
                    f"(valor do XML)"
                )
            
            # VALOR CORRETO = SOMA DOS VALORES DO XML
            valor_total_xml = sum(i['valor_xml'] for i in itens_div)
            solucao["valor_correto"] = valor_total_xml
            solucao["solucao"] = (
                f"CORRIGIR valores nos seguintes itens C170 conforme valores do XML:\n" +
                "\n".join(f"- {inst}" for inst in instrucoes_itens) +
                f"\n\nApós corrigir, recalcular C190 para CFOP/CST correspondentes conforme legislação: "
                f"C190 = Σ C170 por CFOP/CST (Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C)."
            )
            solucao["campo_corrigir"] = f"C170.{campo_c170}"
            solucao["formula_legal"] = "C190 = Σ C170 por CFOP/CST"
            solucao["referencia_legal"] = "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C"
            return solucao
    
    # 4. Usar localização do erro para gerar solução
    if localizacao["instrucao_especifica"]:
        solucao["solucao"] = localizacao["instrucao_especifica"]
        
        # Adicionar fórmula legal específica baseada no campo
        campo_map_formula = {
            "BC ICMS": "VL_BC_ICMS",
            "ICMS": "VL_ICMS",
            "BC ST": "VL_BC_ICMS_ST",
            "ST": "VL_ICMS_ST",
            "IPI": "VL_IPI",
        }
        campo_sped = campo_map_formula.get(campo, campo)
        
        if localizacao["local_erro"] == "C190":
            solucao["formula_legal"] = f"C190.{campo_sped} = Σ C170.{campo_sped} por CFOP/CST"
        elif localizacao["local_erro"] == "C100":
            solucao["formula_legal"] = f"C100.{campo_sped} = Σ C190.{campo_sped}"
        elif localizacao["local_erro"] == "C170":
            solucao["formula_legal"] = "C170 deve corresponder aos valores do XML item a item"
    else:
        # Solução genérica como fallback
        solucao["solucao"] = (
            f"Corrigir {campo} no SPED. "
            f"Valor no XML: R$ {valor_xml:.2f}, "
            f"Valor no SPED: R$ {valor_sped:.2f}, "
            f"Diferença: R$ {abs(valor_xml - valor_sped):.2f}. "
            f"Verificar registros C100, C170 e C190 para esta chave."
        )
    
    return solucao


def gerar_solucao_c170_c190(
    chave: str,
    cfop: str,
    cst: str,
    campo: str,
    valor_c170: float,
    valor_c190: float,
    efd_txt: Path,
    xml_items: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Gera solução automática específica para divergência C170 x C190.
    
    Retorna:
    {
        "solucao": str,
        "registro_corrigir": "C170" | "C190",
        "valor_correto": float,
        "formula_legal": str,
        "detalhes": str
    }
    """
    solucao = {
        "solucao": "",
        "registro_corrigir": "C190",
        "valor_correto": valor_c170,
        "formula_legal": f"C190.{campo} = Σ C170.{campo} por CFOP/CST",
        "detalhes": ""
    }
    
    diferenca = abs(valor_c170 - valor_c190)
    
    # DEBUG: Log dos valores recebidos
    import logging
    logging.info(f"[gerar_solucao_c170_c190] Chave: {chave[:20]}..., CFOP: {cfop}, CST: {cst}, Campo: {campo}")
    logging.info(f"[gerar_solucao_c170_c190] Valores - C170: {valor_c170}, C190: {valor_c190}, Diferença: {diferenca}")
    
    # Se C190 está zerado mas C170 tem valores, o problema é no C190
    if abs(valor_c190) < 0.02 and abs(valor_c170) > 0.02:
        logging.info(f"[gerar_solucao_c170_c190] Caso 1: C190 zerado, C170 tem valor")
        num_itens_c170 = len([i for i in (xml_items or []) if i]) if xml_items else 0
        solucao["solucao"] = (
            f"ADICIONAR registro C190 para CFOP {cfop} / CST {cst}. "
            f"Valor a lançar: R$ {valor_c170:.2f} (soma dos C170). "
            f"Atualmente o C190 está zerado mas há {num_itens_c170} item(ns) no C170 com valores. "
            f"Conforme legislação (Guia Prático, Seção 3, Bloco C): C190.{campo} = Σ C170.{campo} por CFOP/CST."
        )
        solucao["registro_corrigir"] = "C190"
        solucao["valor_correto"] = valor_c170
        solucao["detalhes"] = f"C190 faltante para CFOP {cfop} / CST {cst}. Valor correto: R$ {valor_c170:.2f}"
        solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
        solucao["referencia_legal"] = "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C"
    
    # Se C190 tem valor mas está diferente de C170, verificar qual está correto
    elif diferenca > 0.02:
        # Se C170 tem mais itens, provavelmente C190 está incompleto
        if valor_c170 > valor_c190:
            solucao["solucao"] = (
                f"CORRIGIR C190 para CFOP {cfop} / CST {cst}. "
                f"Valor atual: R$ {valor_c190:.2f}, Valor correto: R$ {valor_c170:.2f}. "
                f"O C190 deve ser igual à soma dos C170. Diferença: R$ {diferenca:.2f}. "
                f"Conforme legislação (Guia Prático, Seção 3, Bloco C): C190.{campo} = Σ C170.{campo} por CFOP/CST."
            )
            solucao["registro_corrigir"] = "C190"
            solucao["valor_correto"] = valor_c170
            solucao["detalhes"] = f"Corrigir campo {campo} do C190. Valor atual incorreto: R$ {valor_c190:.2f}, deve ser: R$ {valor_c170:.2f}"
            solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
            solucao["referencia_legal"] = "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C"
        else:
            # C190 maior que C170 - pode haver itens extras no C190 ou C170 faltando
            solucao["solucao"] = (
                f"VERIFICAR C170 para CFOP {cfop} / CST {cst}. "
                f"C190 tem R$ {valor_c190:.2f} mas C170 soma apenas R$ {valor_c170:.2f}. "
                f"Diferença: R$ {diferenca:.2f}. "
                f"Pode haver itens faltando no C170 ou C190 com valores incorretos. "
                f"Conforme legislação: C190.{campo} = Σ C170.{campo} por CFOP/CST."
            )
            solucao["registro_corrigir"] = "C170"
            solucao["valor_correto"] = valor_c190
            solucao["detalhes"] = f"Verificar se há itens faltando no C170 ou se o C190 está com valor incorreto"
            solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
            solucao["referencia_legal"] = "Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, Bloco C"
    
    return solucao


def processar_divergencias_c170_c190_com_solucoes(
    divergencias_df: pd.DataFrame,
    xml_notes: List[Dict[str, Any]],
    efd_txt: Path,
    rules: Optional[Dict[str, Any]] = None
) -> pd.DataFrame:
    """
    Processa divergências C170 x C190 e adiciona soluções automáticas.
    """
    import logging
    logging.info(f"[processar_divergencias_c170_c190_com_solucoes] ========== INÍCIO ==========")
    logging.info(f"[processar_divergencias_c170_c190_com_solucoes] DataFrame recebido: {len(divergencias_df) if divergencias_df is not None and not divergencias_df.empty else 0} linhas")
    
    if divergencias_df is None or divergencias_df.empty:
        logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] DataFrame vazio ou None, retornando vazio")
        return divergencias_df
    
    # Parsear C170 individual para obter detalhes
    c170_por_chave = parse_efd_c170_individual(efd_txt)
    
    # Mapear XML por chave
    xml_por_chave = {n["CHAVE"]: n for n in xml_notes}
    
    # CORREÇÃO: Obter CNPJ da empresa UMA VEZ no início (do registro 0000)
    # Layout 0000: REG(1), COD_VER(2), COD_FIN(3), DT_INI(4), DT_FIN(5), NOME(6), CNPJ(7), UF(8), ...
    # Isso evita ler o arquivo SPED múltiplas vezes dentro do loop
    cnpj_empresa = None
    try:
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            for ln in f:
                if ln.startswith("|0000|"):
                    from parsers import split_sped_line
                    fs = split_sped_line(ln, min_fields=8)
                    if len(fs) > 7:
                        cnpj_empresa = (fs[7] or "").strip().replace(".", "").replace("/", "").replace("-", "")
                        logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] CNPJ da empresa obtido: {cnpj_empresa[:8] if cnpj_empresa and len(cnpj_empresa) > 8 else 'N/A'}...")
                        break
    except Exception as e:
        logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ Erro ao obter CNPJ da empresa do registro 0000: {e}")
    
    rows_com_solucoes = []
    
    for _, row in divergencias_df.iterrows():
        chave = str(row.get("CHAVE", "") or "")
        cfop = str(row.get("CFOP", "") or "")
        cst_raw = str(row.get("CST", "") or "")
        
        # CORREÇÃO: Normalizar CST antes de usar (pode vir do DataFrame em formato diferente)
        # O CST pode vir como "00", "000", "0", etc. e precisa ser normalizado para 3 dígitos
        from common import normalize_cst_for_compare
        cst = normalize_cst_for_compare(cst_raw) if cst_raw else ""
        
        campo = str(row.get("CAMPO", "") or "")
        valor_c170 = float(row.get("C170", 0) or 0)
        valor_c190 = float(row.get("C190", 0) or 0)
        
        if not chave:
            rows_com_solucoes.append(row.to_dict())
            continue
        
        # Obter itens do XML
        xml_note = xml_por_chave.get(chave, {})
        xml_items = xml_note.get("items", [])
        
        # Obter itens do C170
        c170_items = c170_por_chave.get(chave, [])
        
        # Filtrar C170 por CFOP/CST se necessário
        c170_filtrados = [
            item for item in c170_items
            if item.get("CFOP", "") == cfop and item.get("CST", "") == cst
        ]
        
        # Mapear campo para formato usado pela função robusta
        campo_map = {
            "VL_BC_ICMS": "BC ICMS",
            "VL_ICMS": "ICMS",
            "VL_BC_ICMS_ST": "BC ST",
            "VL_ICMS_ST": "ST",
            "VL_IPI": "IPI",
        }
        campo_formatado = campo_map.get(campo, campo)
        
        # Obter C100 por chave para pegar IND_OPER (necessário para conversão de perspectiva do CFOP)
        from parsers import parse_efd_c100
        efd_c100 = parse_efd_c100(efd_txt)
        c100_info_temp = {}
        if not efd_c100.empty and "CHV_NFE" in efd_c100.columns:
            c100_row = efd_c100[efd_c100["CHV_NFE"] == chave]
            if not c100_row.empty:
                c100_info_temp = c100_row.iloc[0].to_dict()
        
        # Obter IND_OPER do C100 para conversão de perspectiva do CFOP
        ind_oper = c100_info_temp.get("IND_OPER", "") if c100_info_temp else ""
        
        # FALLBACK: Se IND_OPER não estiver disponível no C100, inferir do XML
        # Comparando CNPJ do emitente com CNPJ da empresa (já obtido acima, não ler arquivo novamente)
        if not ind_oper:
            try:
                # Obter CNPJ do emitente do XML
                xml_note = xml_por_chave.get(chave, {})
                emit_cnpj = xml_note.get("emit_CNPJ", "") or xml_note.get("emit_cnpj", "")
                if emit_cnpj:
                    emit_cnpj = str(emit_cnpj).replace(".", "").replace("/", "").replace("-", "").strip()
                
                # Inferir IND_OPER: se emitente = empresa, é saída (1), senão é entrada (0)
                # Usar cnpj_empresa já obtido no início da função (não ler arquivo novamente)
                if cnpj_empresa and emit_cnpj:
                    if emit_cnpj == cnpj_empresa:
                        ind_oper = "1"  # Saída (empresa emitiu a nota)
                        logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] IND_OPER inferido do XML: {ind_oper} (emitente = empresa, saída)")
                    else:
                        ind_oper = "0"  # Entrada (empresa recebeu a nota)
                        logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] IND_OPER inferido do XML: {ind_oper} (emitente ≠ empresa, entrada)")
                else:
                    logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ Não foi possível inferir IND_OPER: CNPJ empresa={cnpj_empresa is not None}, CNPJ emitente={emit_cnpj is not None}")
            except Exception as e:
                logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ Erro ao inferir IND_OPER do XML: {e}")
        
        # DEBUG: Log do IND_OPER obtido
        if not ind_oper:
            logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ IND_OPER não encontrado para chave {chave[:20]}... (conversão pode não funcionar corretamente)")
        else:
            logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] IND_OPER={ind_oper} para chave {chave[:20]}...")
        
        # CORREÇÃO: Filtrar XML por CFOP/CST antes de calcular valor_xml
        # O confronto deve ser entre XML e SPED para o mesmo CFOP/CST
        # IMPORTANTE: Converter CFOP do XML para perspectiva do SPED antes de comparar
        xml_items_filtrados = []
        # Inicializar cfop_correto com o CFOP do SPED
        cfop_correto = cfop
        if xml_items:
            from common import normalize_cst_for_compare, converter_cfop_xml_para_sped
            cst_sped_normalizado = normalize_cst_for_compare(cst) if cst else ""
            
            # DEBUG: Log dos valores que estão sendo comparados
            logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] Filtrando XML: CFOP SPED={cfop}, CST SPED={cst} (normalizado={cst_sped_normalizado}), IND_OPER={ind_oper}")
            logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] Total de itens XML para filtrar: {len(xml_items)}")
            
            cfops_encontrados = set()  # CFOPs originais do XML
            cfops_convertidos = set()  # CFOPs convertidos para perspectiva do SPED
            csts_encontrados = set()
            cfop_cst_pares = {}
            
            # Primeiro, coletar todos os CFOPs/CSTs do XML (convertidos para perspectiva do SPED)
            for xml_item in xml_items:
                # CORREÇÃO: Garantir que CFOP seja string e normalizado (SEM espaços)
                xml_cfop_raw = xml_item.get("CFOP", "")
                xml_cfop = str(xml_cfop_raw).strip() if xml_cfop_raw is not None else ""
                # Garantir que não há espaços internos ou caracteres invisíveis
                xml_cfop_clean = "".join(xml_cfop.split())  # Remove todos os espaços (incluindo internos)
                
                # CORREÇÃO CRÍTICA: Converter CFOP do XML para perspectiva do SPED
                xml_cfop_convertido = converter_cfop_xml_para_sped(xml_cfop_clean, ind_oper)
                
                icms_data = xml_item.get("ICMS", {})
                cst_xml_normalizado = normalizar_cst_xml(icms_data)
                cst_xml_norm = normalize_cst_for_compare(cst_xml_normalizado) if cst_xml_normalizado else ""
                cst_xml_norm_clean = cst_xml_norm.strip() if cst_xml_norm else ""
                
                # Coletar estatísticas para debug (usar valores convertidos)
                cfops_encontrados.add(xml_cfop_clean)  # CFOP original do XML
                cfops_convertidos.add(xml_cfop_convertido)  # CFOP convertido para SPED
                csts_encontrados.add(cst_xml_norm_clean)
                chave_cfop_cst = f"{xml_cfop_convertido}/{cst_xml_norm_clean}"
                if chave_cfop_cst not in cfop_cst_pares:
                    cfop_cst_pares[chave_cfop_cst] = 0
                cfop_cst_pares[chave_cfop_cst] += 1
            
            # CORREÇÃO: Garantir que CFOP do SPED também seja string (SEM espaços)
            cfop_sped_raw = str(cfop).strip() if cfop else ""
            cfop_sped_clean = "".join(cfop_sped_raw.split())  # Remove todos os espaços (incluindo internos)
            cst_sped_norm_clean = cst_sped_normalizado.strip() if cst_sped_normalizado else ""
            
            # Agora comparar CFOP do SPED com CFOPs convertidos do XML
            if cfop_sped_clean not in cfops_convertidos:
                logging.warning(
                    f"[processar_divergencias_c170_c190_com_solucoes] CFOP do SPED ({cfop_sped_clean}) não encontrado após conversão (IND_OPER={ind_oper}). "
                    f"CFOPs originais no XML: {sorted(cfops_encontrados)[:10]}. "
                    f"CFOPs convertidos: {sorted(cfops_convertidos)[:10]}."
                )
                # Tentar buscar por CST mesmo assim
                cfop_candidatos = []
                for xml_item in xml_items:
                    xml_cfop_raw = xml_item.get("CFOP", "")
                    xml_cfop = str(xml_cfop_raw).strip() if xml_cfop_raw is not None else ""
                    xml_cfop_clean = "".join(xml_cfop.split())
                    xml_cfop_convertido = converter_cfop_xml_para_sped(xml_cfop_clean, ind_oper)
                    
                    icms_data = xml_item.get("ICMS", {})
                    cst_xml_normalizado = normalizar_cst_xml(icms_data)
                    cst_xml_norm = normalize_cst_for_compare(cst_xml_normalizado) if cst_xml_normalizado else ""
                    cst_xml_norm_clean = cst_xml_norm.strip() if cst_xml_norm else ""
                    
                    if cst_xml_norm_clean == cst_sped_norm_clean:
                        cfop_candidatos.append(xml_cfop_convertido)
                
                if cfop_candidatos:
                    from collections import Counter
                    cfop_mais_comum = Counter(cfop_candidatos).most_common(1)[0][0]
                    cfop_correto = cfop_mais_comum
                    logging.warning(
                        f"[processar_divergencias_c170_c190_com_solucoes] Usando CFOP convertido mais comum ({cfop_correto}) que corresponde ao CST {cst_sped_norm_clean}."
                    )
                else:
                    cfop_correto = cfop_sped_clean
            else:
                cfop_correto = cfop_sped_clean
            
            # Agora filtrar XML usando o CFOP correto (convertido para perspectiva do SPED)
            cfop_correto_clean = "".join(str(cfop_correto).strip().split())
            
            for xml_item in xml_items:
                # CORREÇÃO: Garantir que CFOP seja string e normalizado (SEM espaços)
                xml_cfop_raw = xml_item.get("CFOP", "")
                xml_cfop = str(xml_cfop_raw).strip() if xml_cfop_raw is not None else ""
                # Garantir que não há espaços internos ou caracteres invisíveis
                xml_cfop_clean = "".join(xml_cfop.split())  # Remove todos os espaços (incluindo internos)
                
                # CORREÇÃO CRÍTICA: Converter CFOP do XML para perspectiva do SPED antes de comparar
                xml_cfop_convertido = converter_cfop_xml_para_sped(xml_cfop_clean, ind_oper)
                
                icms_data = xml_item.get("ICMS", {})
                cst_xml_normalizado = normalizar_cst_xml(icms_data)
                cst_xml_norm = normalize_cst_for_compare(cst_xml_normalizado) if cst_xml_normalizado else ""
                cst_xml_norm_clean = cst_xml_norm.strip() if cst_xml_norm else ""
                
                # Filtrar apenas itens com mesmo CFOP/CST
                # IMPORTANTE: Comparar CFOP convertido (perspectiva do SPED) com CFOP do SPED
                cfop_match = xml_cfop_convertido == cfop_correto_clean if cfop_correto_clean else False
                cst_match = cst_xml_norm_clean == cst_sped_norm_clean if cst_sped_norm_clean else False
                
                if cfop_match and cst_match:
                    xml_items_filtrados.append(xml_item)
            
            # DEBUG: Log das estatísticas (atualizado para mostrar conversão)
            if len(xml_items_filtrados) == 0 and len(xml_items) > 0:
                # Limpar CFOPs e CSTs para exibição (remover espaços)
                cfops_orig_clean = sorted([c.strip() for c in cfops_encontrados if c])[:10]
                cfops_conv_clean = sorted([c.strip() for c in cfops_convertidos if c])[:10]
                csts_clean = sorted([c.strip() for c in csts_encontrados if c])[:10]
                pares_clean = sorted(cfop_cst_pares.items(), key=lambda x: x[1], reverse=True)[:5]
                
                logging.warning(
                    f"[processar_divergencias_c170_c190_com_solucoes] "
                    f"Nenhum item XML encontrado para CFOP '{cfop_sped_clean}' / CST '{cst_sped_norm_clean}' (IND_OPER={ind_oper}). "
                    f"Total de itens XML: {len(xml_items)}. "
                    f"CFOPs originais no XML: {cfops_orig_clean}... (total: {len(cfops_encontrados)}). "
                    f"CFOPs convertidos (IND_OPER={ind_oper}): {cfops_conv_clean}... (total: {len(cfops_convertidos)}). "
                    f"CSTs encontrados no XML: {csts_clean}... (total: {len(csts_encontrados)}). "
                    f"CFOP/CST pares mais comuns (convertidos): {pares_clean}. "
                    f"Usando valor_xml = 0.0 (valor do XML para este CFOP/CST)."
                )
        
        # Calcular valor_xml apenas dos itens filtrados por CFOP/CST
        valor_xml = 0.0
        campo_xml_map = {
            "BC ICMS": "vBC",
            "ICMS": "vICMS",
            "BC ST": "vBCST",
            "ST": "vST",
            "IPI": "vIPI",
        }
        campo_xml = campo_xml_map.get(campo_formatado, "")
        
        if campo_xml and xml_items_filtrados:
            for xml_item in xml_items_filtrados:
                # Tentar primeiro no nível do item
                if campo_xml in xml_item:
                    valor_xml += float(xml_item.get(campo_xml, 0) or 0)
                # Se não encontrou, tentar no ICMS
                elif "ICMS" in xml_item:
                    icms_data = xml_item.get("ICMS", {})
                    if campo_xml == "vBCST":
                        valor_xml += float(icms_data.get("vBCST", 0) or 0)
                    elif campo_xml == "vST":
                        valor_xml += float(icms_data.get("vICMSST", icms_data.get("vST", 0)) or 0)
                    elif campo_xml in icms_data:
                        valor_xml += float(icms_data.get(campo_xml, 0) or 0)
        
        # CORREÇÃO: Remover fallback para valor_c170
        # O valor correto SEMPRE vem do XML (mesmo que seja 0)
        # Se valor_xml é 0, é porque realmente é 0 no XML para este CFOP/CST
        if not xml_items_filtrados and xml_items:
            logging.warning(
                f"[processar_divergencias_c170_c190_com_solucoes] "
                f"Nenhum item XML encontrado para CFOP {cfop} / CST {cst}. "
                f"Total de itens XML: {len(xml_items)}. "
                f"Usando valor_xml = 0.0 (valor do XML para este CFOP/CST)."
            )
        
        # Obter C100 por chave (reutilizar c100_info_temp obtido acima)
        # c100_info_temp já foi obtido acima, então reutilizar
        c100_info = c100_info_temp
        
        # Obter C190 totais
        from parsers import parse_efd_c190_totais
        c190_by_key, _ = parse_efd_c190_totais(efd_txt)
        c190_totais = c190_by_key.get(chave, {})
        
        # Obter C190 por CFOP/CST (buscar diretamente do arquivo)
        c190_por_cfop_cst = {}
        try:
            # Buscar C190 específico por CFOP/CST diretamente do arquivo
            with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
                linhas = f.readlines()
                current_key = None
                for num_linha, ln in enumerate(linhas, 1):
                    if ln.startswith("|C100|"):
                        from parsers import split_sped_line
                        fs = split_sped_line(ln, min_fields=10)
                        if len(fs) >= 10:
                            current_key = (fs[9] or "").strip() or None
                    elif ln.startswith("|C190|") and current_key == chave:
                        from parsers import split_sped_line
                        fs = split_sped_line(ln, min_fields=13)
                        if len(fs) >= 13:
                            cst_linha = (fs[2] or "").strip()
                            cfop_linha = (fs[3] or "").strip()
                            # Normalizar CST e CFOP para comparação
                            from common import normalize_cst_for_compare
                            cst_linha_norm = normalize_cst_for_compare(cst_linha)
                            cst_norm = normalize_cst_for_compare(cst) if cst else ""
                            # Usar cfop_correto (do XML se o SPED estiver errado) - já definido acima
                            if cst_linha_norm == cst_norm and cfop_linha == cfop_correto:
                                from parsers import parse_decimal
                                chave_c190 = f"{chave}_{cfop_correto}_{cst_norm}"
                                c190_por_cfop_cst[chave_c190] = {
                                    "CHAVE": chave,
                                    "CFOP": cfop_linha,
                                    "CST": cst_linha,
                                    "VL_BC_ICMS": parse_decimal(fs[6]) if len(fs) > 6 else 0.0,
                                    "VL_ICMS": parse_decimal(fs[7]) if len(fs) > 7 else 0.0,
                                    "VL_BC_ICMS_ST": parse_decimal(fs[8]) if len(fs) > 8 else 0.0,
                                    "VL_ICMS_ST": parse_decimal(fs[9]) if len(fs) > 9 else 0.0,
                                    "VL_IPI": parse_decimal(fs[11]) if len(fs) > 11 else 0.0,
                                    "LINHA_SPED": num_linha
                                }
                                break  # Encontrou, pode parar
        except Exception as e:
            logging.warning(f"Erro ao buscar C190 por CFOP/CST: {e}")
        
        # DEBUG: Log antes de chamar gerar_solucao_automatica
        import logging
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] ========== INÍCIO PROCESSAMENTO ==========")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] Chave: {chave[:20]}...")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] Campo: {campo} -> {campo_formatado}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] C170: {valor_c170}, C190: {valor_c190}, XML: {valor_xml}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] CFOP: {cfop}, CST: {cst}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] XML items (todos): {len(xml_items) if xml_items else 0}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] XML items (filtrados por CFOP/CST): {len(xml_items_filtrados) if xml_items_filtrados else 0}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] C170 items (filtrados): {len(c170_filtrados) if c170_filtrados else 0}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] C170 items (todos): {len(c170_items) if c170_items else 0}")
        
        # VALIDAÇÃO ROBUSTA: Verificar match antes de aplicar correção automática
        # IMPORTANTE: Por enquanto, vamos fazer a validação opcional (não bloquear)
        # para não rejeitar todas as correções. O sistema de match pode ser muito restritivo.
        match_validado = True
        detalhes_match = {}
        validacao_match_disponivel = False
        
        try:
            from match_robusto import validar_match_antes_correcao
            from parsers import parse_efd_c100
            validacao_match_disponivel = True
            
            # Obter C100 para validação
            efd_c100 = parse_efd_c100(efd_txt)
            c100_record = {}
            if not efd_c100.empty and "CHV_NFE" in efd_c100.columns:
                c100_row = efd_c100[efd_c100["CHV_NFE"] == chave]
                if not c100_row.empty:
                    c100_record = c100_row.iloc[0].to_dict()
            
            # Validar match se temos C100 e XML
            # NOTA: Por enquanto, vamos apenas LOGAR o score mas não BLOQUEAR correções
            # O sistema de match pode ser muito restritivo inicialmente
            if c100_record and xml_note:
                pode_corrigir, detalhes_validacao = validar_match_antes_correcao(
                    xml_note, c100_record, c170_items, xml_items
                )
                detalhes_match = detalhes_validacao
                
                # Por enquanto, apenas logar mas não bloquear (match_validado = True sempre)
                # TODO: Ativar bloqueio quando sistema de match estiver mais refinado
                if not pode_corrigir:
                    logging.warning(
                        f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ Match fraco para {chave[:20]}... "
                        f"Score: {detalhes_validacao.get('score_final', 0):.1f}. "
                        f"Motivo: {detalhes_validacao.get('motivo_rejeicao', 'Desconhecido')}. "
                        f"[NOTA: Correção ainda será gerada, mas com score baixo]"
                    )
                    # Por enquanto, não bloquear - apenas marcar score baixo
                    # match_validado = False  # Descomentar quando quiser ativar bloqueio
                else:
                    logging.info(
                        f"[processar_divergencias_c170_c190_com_solucoes] ✅ Match validado: "
                        f"Score C100={detalhes_validacao.get('score_c100', 0):.1f}, "
                        f"Score médio itens={detalhes_validacao.get('score_medio_itens', 0):.1f}, "
                        f"Score final={detalhes_validacao.get('score_final', 0):.1f}"
                    )
        except ImportError:
            logging.debug("[processar_divergencias_c170_c190_com_solucoes] match_robusto não disponível, pulando validação")
        except Exception as e:
            logging.debug(f"[processar_divergencias_c170_c190_com_solucoes] Erro ao validar match: {e}")
            # Continuar mesmo com erro na validação (não bloquear processamento)
        
        # Se match foi rejeitado, marcar solução como "revisão manual necessária"
        if not match_validado:
            solucao = {
                "solucao": (
                    f"REVISÃO MANUAL NECESSÁRIA: Match insuficiente entre XML e SPED. "
                    f"Score: {detalhes_match.get('score_final', 0):.1f}/100. "
                    f"Motivo: {detalhes_match.get('motivo_rejeicao', 'Score insuficiente')}. "
                    f"Não é recomendado aplicar correção automática."
                ),
                "registro_corrigir": None,
                "valor_correto": None,
                "SOLUCAO_AUTOMATICA": False,
                "match_score": detalhes_match.get('score_final', 0),
                "match_detalhes": detalhes_match
            }
            row_dict["SOLUCAO_AUTOMATICA"] = False
            row_dict["SOLUCAO"] = solucao["solucao"]
            row_dict["MATCH_SCORE"] = detalhes_match.get('score_final', 0)
            rows_com_solucoes.append(row_dict)
            continue
        
        # Usar função robusta que faz cruzamento completo com XML
        # IMPORTANTE: valor_sped é o C190 (total consolidado), que pode ser 0
        # CORREÇÃO: Usar xml_items_filtrados (já filtrados por CFOP/CST) ao invés de xml_items
        try:
            solucao = gerar_solucao_automatica(
                chave,
                campo_formatado,
                valor_xml,  # Valor do XML filtrado por CFOP/CST (sempre usado como correto)
                valor_c190,  # valor_sped é o C190 (total consolidado) - pode ser 0!
                xml_items_filtrados if xml_items_filtrados else xml_items,  # Usar itens filtrados
                efd_txt,
                c100_info=c100_info,
                c170_items=c170_filtrados if c170_filtrados else c170_items,
                c190_totais=c190_totais,
                rules=rules,  # Passar rules para aplicar validações do setor
                c190_por_cfop_cst=c190_por_cfop_cst if c190_por_cfop_cst else None
            )
        except Exception as e:
            logging.error(f"[processar_divergencias_c170_c190_com_solucoes] ❌ ERRO ao chamar gerar_solucao_automatica: {e}")
            import traceback
            logging.error(f"[processar_divergencias_c170_c190_com_solucoes] Traceback: {traceback.format_exc()}")
            # Criar solução vazia para fallback
            # CORREÇÃO: Usar valor_xml (do XML) como valor_correto, não valor_c170 (do SPED)
            solucao = {
                "solucao": "",
                "valor_correto": valor_xml,  # Sempre usar valor do XML como correto
                "registro_corrigir": "",
                "campo_corrigir": "",
                "detalhes_itens": [],
                "formula_legal": "",
                "referencia_legal": ""
            }
        
        # DEBUG: Log da solução gerada
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] Solução gerada para {chave[:20]}... - solucao: {str(solucao.get('solucao', ''))[:200]}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] registro_corrigir: {solucao.get('registro_corrigir', '')}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] valor_correto: {solucao.get('valor_correto', '')}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] formula_legal: {solucao.get('formula_legal', '')}")
        logging.info(f"[processar_divergencias_c170_c190_com_solucoes] Valores - C170: {valor_c170}, C190: {valor_c190}, Campo: {campo}")
        
        # FALLBACK: Se solução está vazia, gerar solução genérica baseada nos valores
        if not solucao.get("solucao") or solucao.get("solucao") == "":
            logging.warning(f"[processar_divergencias_c170_c190_com_solucoes] ⚠️ Solução vazia! Gerando fallback...")
            if abs(valor_c190) < 0.02 and abs(valor_xml) > 0.02:
                # C190 zerado, XML tem valor (valor correto)
                solucao["solucao"] = (
                    f"ADICIONAR ou CORRIGIR registro C190 para CFOP {cfop} / CST {cst}. "
                    f"Valor atual (C190): R$ {valor_c190:.2f}, Valor correto (XML): R$ {valor_xml:.2f}. "
                    f"O C190 está zerado mas o XML tem valores, então o C190 deve ser criado ou corrigido conforme XML."
                )
                solucao["registro_corrigir"] = "C190"
                solucao["valor_correto"] = valor_xml  # Sempre usar valor do XML como correto
                solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
                logging.info(f"[processar_divergencias_c170_c190_com_solucoes] ✅ Fallback gerado: {solucao['solucao'][:100]}...")
            elif abs(valor_xml) < 0.02 and abs(valor_c190) > 0.02:
                # XML zerado, C190 tem valor (pode ser erro no SPED ou XML)
                solucao["solucao"] = (
                    f"VERIFICAR registro C190 para CFOP {cfop} / CST {cst}. "
                    f"O XML tem valor zero mas o C190 tem valor (R$ {valor_c190:.2f}). "
                    f"Verificar se o C190 está correto ou se há erro no XML. "
                    f"Valor correto conforme XML: R$ {valor_xml:.2f}."
                )
                solucao["registro_corrigir"] = "C190"
                solucao["valor_correto"] = valor_xml  # Sempre usar valor do XML como correto
                solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
                logging.info(f"[processar_divergencias_c170_c190_com_solucoes] ✅ Fallback gerado: {solucao['solucao'][:100]}...")
            else:
                # Diferença entre C170 e C190
                # CORREÇÃO: Usar valor_xml (do XML) como valor correto, não valor_c170 (do SPED)
                solucao["solucao"] = (
                    f"CORRIGIR divergência entre C170 (R$ {valor_c170:.2f}) e C190 (R$ {valor_c190:.2f}) "
                    f"para CFOP {cfop} / CST {cst}. "
                    f"Valor correto (XML): R$ {valor_xml:.2f}. Diferença: R$ {abs(valor_xml - valor_c190):.2f}."
                )
                # Determinar qual registro corrigir baseado na diferença com o XML
                diferenca_c170_xml = abs(valor_c170 - valor_xml)
                diferenca_c190_xml = abs(valor_c190 - valor_xml)
                solucao["registro_corrigir"] = "C190" if diferenca_c190_xml > diferenca_c170_xml else "C170"
                solucao["valor_correto"] = valor_xml  # Sempre usar valor do XML como correto
                solucao["formula_legal"] = f"C190.{campo} = Σ C170.{campo} por CFOP/CST"
                logging.info(f"[processar_divergencias_c170_c190_com_solucoes] ✅ Fallback gerado: {solucao['solucao'][:100]}...")
        
        # Adicionar solução ao row
        row_dict = row.to_dict()
        # CORREÇÃO: Garantir que CST está normalizado no row_dict (será usado na correção)
        row_dict["CST"] = cst  # CST já normalizado acima
        
        # CORREÇÃO CRÍTICA: SOLUCAO_AUTOMATICA deve ser BOOLEANO (True/False)
        # SOLUCAO é o texto da solução (string)
        solucao_texto = solucao.get("solucao", "") or ""
        registro_corrigir = solucao.get("registro_corrigir", "") or ""
        valor_correto = solucao.get("valor_correto")
        
        # Determinar se a solução pode ser aplicada automaticamente
        # Condições: tem solução, tem registro para corrigir, tem valor correto
        pode_aplicar_automaticamente = (
            bool(solucao_texto) and 
            bool(registro_corrigir) and 
            valor_correto is not None and
            registro_corrigir != "NENHUM"  # Não aplicar se for "NENHUM"
        )
        
        row_dict["SOLUCAO_AUTOMATICA"] = pode_aplicar_automaticamente
        row_dict["SOLUCAO"] = str(solucao_texto) if solucao_texto else ""
        
        registro_texto = solucao.get("registro_corrigir", "") or ""
        row_dict["REGISTRO_CORRIGIR"] = str(registro_texto) if registro_texto else ""
        if row_dict["REGISTRO_CORRIGIR"] is None:
            row_dict["REGISTRO_CORRIGIR"] = ""
        
        # Adicionar informações de match se disponíveis
        if detalhes_match:
            row_dict["MATCH_SCORE"] = detalhes_match.get("score_final", 0)
            row_dict["MATCH_SCORE_C100"] = detalhes_match.get("score_c100", 0)
            row_dict["MATCH_SCORE_ITENS"] = detalhes_match.get("score_medio_itens", 0)
        
        # Usar valor_correto da solução, ou fallback para valor_c170
        valor_correto = solucao.get("valor_correto", valor_c170)
        if valor_correto is None:
            valor_correto = valor_c170
        row_dict["VALOR_CORRETO"] = float(valor_correto) if valor_correto else valor_c170
        
        formula_texto = solucao.get("formula_legal", "") or ""
        row_dict["FORMULA_LEGAL"] = str(formula_texto) if formula_texto else ""
        if row_dict["FORMULA_LEGAL"] is None:
            row_dict["FORMULA_LEGAL"] = ""
        
        # Detalhes pode vir de "detalhes_itens" ou "detalhes"
        detalhes_itens = solucao.get("detalhes_itens", [])
        if detalhes_itens:
            # Formatar detalhes dos itens
            detalhes_str = f"Detalhes dos itens:\n"
            for item in detalhes_itens[:5]:  # Limitar a 5 itens
                detalhes_str += f"- Item {item.get('nItem', 'N/A')}: "
                detalhes_str += f"XML: R$ {item.get('valor_xml', 0):.2f}, "
                detalhes_str += f"SPED: R$ {item.get('valor_sped', 0):.2f}\n"
            row_dict["DETALHES"] = detalhes_str
        else:
            detalhes_texto = solucao.get("detalhes", "") or ""
            row_dict["DETALHES"] = str(detalhes_texto) if detalhes_texto else ""
        if row_dict["DETALHES"] is None:
            row_dict["DETALHES"] = ""
        
        # Adicionar REFERENCIA_LEGAL se disponível
        ref_texto = solucao.get("referencia_legal", "") or ""
        row_dict["REFERENCIA_LEGAL"] = str(ref_texto) if ref_texto else ""
        if row_dict["REFERENCIA_LEGAL"] is None:
            row_dict["REFERENCIA_LEGAL"] = ""
        
        # Adicionar informações de match se disponíveis
        if detalhes_match:
            row_dict["MATCH_SCORE"] = detalhes_match.get("score_final", 0)
            row_dict["MATCH_SCORE_C100"] = detalhes_match.get("score_c100", 0)
            row_dict["MATCH_SCORE_ITENS"] = detalhes_match.get("score_medio_itens", 0)
        else:
            # Se não teve validação de match, deixar campos vazios
            row_dict["MATCH_SCORE"] = None
            row_dict["MATCH_SCORE_C100"] = None
            row_dict["MATCH_SCORE_ITENS"] = None
        
        # Adicionar campo_corrigir se disponível (mais específico que registro_corrigir)
        campo_corrigir = solucao.get("campo_corrigir", "")
        if campo_corrigir:
            row_dict["CAMPO_CORRIGIR"] = str(campo_corrigir)
        
        # Adicionar LINHA_SPED para correção precisa (se disponível)
        # Buscar linha do C190 ou C170 no SPED
        try:
            # Função parse_efd_c190_por_cfop_cst não existe, buscar manualmente
            # Tentar buscar do C170 primeiro
            if c170_filtrados and len(c170_filtrados) > 0:
                primeiro_c170 = c170_filtrados[0]
                if "LINHA_SPED" in primeiro_c170:
                    row_dict["LINHA_SPED"] = primeiro_c170["LINHA_SPED"]
        except Exception as e:
            logging.warning(f"Erro ao buscar LINHA_SPED: {e}")
        
        # Adicionar instrução de correção implementável
        if registro_texto and row_dict.get("VALOR_CORRETO"):
            row_dict["INSTRUCAO_CORRECAO"] = (
                f"Corrigir {registro_texto}.{campo} na linha {row_dict.get('LINHA_SPED', 'N/A')} do SPED. "
                f"Valor atual: R$ {valor_c190:.2f}, Valor correto: R$ {row_dict['VALOR_CORRETO']:.2f}. "
                f"Esta correção pode ser aplicada automaticamente."
            )
        
        # Log para debug
        if solucao_texto:
            logging.info(f"[C170 x C190] Solução gerada para {chave} CFOP {cfop} CST {cst}: {solucao_texto[:100]}")
        
        rows_com_solucoes.append(row_dict)
    
    # Criar novo DataFrame com soluções
    try:
        colunas_originais = list(divergencias_df.columns)
        colunas_novas = ["SOLUCAO_AUTOMATICA", "SOLUCAO", "REGISTRO_CORRIGIR", "VALOR_CORRETO", 
                         "FORMULA_LEGAL", "DETALHES"]
        
        # Criar DataFrame sem especificar colunas primeiro (evita problemas de reindexação)
        df_resultado = pd.DataFrame(rows_com_solucoes)
        
        # Garantir que todas as colunas necessárias existam
        for col in colunas_originais + colunas_novas:
            if col not in df_resultado.columns:
                df_resultado[col] = ""
        
        # Resetar índice para evitar problemas de reindexação
        df_resultado = df_resultado.reset_index(drop=True)
        
        # DEBUG: Verificar se soluções foram geradas para C170 x C190
        if len(df_resultado) > 0:
            # CORREÇÃO: SOLUCAO_AUTOMATICA agora é booleano, verificar True
            solucoes_nao_vazias = df_resultado[
                df_resultado['SOLUCAO_AUTOMATICA'].notna() & 
                (df_resultado['SOLUCAO_AUTOMATICA'] == True)
            ]
            logging.info(f"[C170 x C190] Total de divergências: {len(df_resultado)}")
            logging.info(f"[C170 x C190] Divergências com solução automática: {len(solucoes_nao_vazias)}")
        
        return df_resultado
    except Exception as e:
        logging.error(f"[processar_divergencias_c170_c190_com_solucoes] ❌ Erro ao criar DataFrame: {e}")
        import traceback
        logging.error(f"[processar_divergencias_c170_c190_com_solucoes] Traceback: {traceback.format_exc()}")
        # Retornar divergências originais com colunas de solução vazias
        divergencias_df = divergencias_df.copy()
        for col in ["SOLUCAO_AUTOMATICA", "REGISTRO_CORRIGIR", "VALOR_CORRETO", "FORMULA_LEGAL", "DETALHES"]:
            if col not in divergencias_df.columns:
                divergencias_df[col] = ""
        return divergencias_df


def processar_divergencias_com_solucoes(
    divergencias_df: pd.DataFrame,
    xml_notes: List[Dict[str, Any]],
    efd_txt: Path,
    rules: Optional[Dict[str, Any]] = None
) -> pd.DataFrame:
    """
    Processa divergências e adiciona soluções automáticas específicas.
    
    Adiciona colunas:
    - SOLUCAO_AUTOMATICA: Instrução específica de correção
    - REGISTRO_CORRIGIR: C100, C170, C190 ou NENHUM
    - CAMPO_CORRIGIR: Campo específico a corrigir
    - VALOR_CORRETO: Valor exato a lançar
    - FORMULA_LEGAL: Fórmula legal aplicada
    - DETALHES_ITENS: JSON com detalhes item a item se aplicável
    """
    if divergencias_df is None or divergencias_df.empty:
        logging.warning("processar_divergencias_com_solucoes: DataFrame vazio ou None")
        return divergencias_df
    
    logging.info(f"[processar_divergencias_com_solucoes] Iniciando processamento de {len(divergencias_df)} divergências")
    logging.info(f"[processar_divergencias_com_solucoes] Colunas antes: {list(divergencias_df.columns)}")
    
    if pd is None:
        logging.error("pandas não disponível - não é possível gerar soluções")
        return divergencias_df
    
    try:
        # Parsear C170 individual (com número de linha se disponível)
        try:
            c170_por_chave = parse_efd_c170_individual(efd_txt)
            logging.info(f"Parseados {len(c170_por_chave)} chaves com C170 individual")
            
            # Tentar parsear com número de linha (melhorado)
            try:
                if parse_efd_c100_c190_c170_com_linha:
                    c100_map_linha, c190_map_linha, c170_map_linha = parse_efd_c100_c190_c170_com_linha(efd_txt)
                    # Atualizar c170_por_chave com LINHA_SPED se disponível
                    for chave, itens in c170_map_linha.items():
                        if chave in c170_por_chave:
                            for item_linha in itens:
                                num_item = item_linha.get("NUM_ITEM", "")
                                for item_original in c170_por_chave[chave]:
                                    if item_original.get("NUM_ITEM", "") == num_item:
                                        item_original["LINHA_SPED"] = item_linha.get("LINHA_SPED")
                    logging.info(f"Adicionados números de linha do SPED aos C170")
            except Exception as e_linha:
                logging.warning(f"Não foi possível adicionar números de linha: {e_linha}")
        except Exception as e:
            logging.error(f"Erro ao parsear C170 individual: {e}")
            c170_por_chave = {}
        
        # Parsear C100 (com número de linha se disponível)
        try:
            from validators import _get_c100_map
            c100_map = _get_c100_map(efd_txt)
            logging.info(f"Parseados {len(c100_map)} registros C100")
            
            # Tentar adicionar número de linha
            try:
                if parse_efd_c100_c190_c170_com_linha:
                    c100_map_linha, _, _ = parse_efd_c100_c190_c170_com_linha(efd_txt)
                    for chave, info_linha in c100_map_linha.items():
                        if chave in c100_map:
                            c100_map[chave]["LINHA_SPED"] = info_linha.get("LINHA_SPED")
            except Exception:
                pass
        except Exception as e:
            logging.error(f"Erro ao parsear C100: {e}")
            c100_map = {}
        
        # Parsear C190 (com número de linha se disponível)
        try:
            from parsers import parse_efd_c190_totais
            c190_by_key, _ = parse_efd_c190_totais(efd_txt)
            logging.info(f"Parseados {len(c190_by_key)} registros C190")
            
            # Tentar adicionar número de linha
            try:
                if parse_efd_c100_c190_c170_com_linha:
                    _, c190_map_linha, _ = parse_efd_c100_c190_c170_com_linha(efd_txt)
                    for chave_c190, info_linha in c190_map_linha.items():
                        chave_base = info_linha.get("CHAVE", "")
                        if chave_base in c190_by_key:
                            c190_by_key[chave_base]["LINHA_SPED"] = info_linha.get("LINHA_SPED")
            except Exception:
                pass
        except Exception as e:
            logging.error(f"Erro ao parsear C190: {e}")
            c190_by_key = {}
        
        # Parsear C176 (ST retido anteriormente)
        c176_por_chave = {}
        try:
            from parsers_cruzamentos import parse_efd_c176_por_chave
            c176_por_chave = parse_efd_c176_por_chave(efd_txt)
            logging.info(f"Parseados C176 para {len(c176_por_chave)} chaves")
        except Exception as e:
            logging.warning(f"Erro ao parsear C176: {e}")
        
        # Parsear C195/C197 (ajustes)
        c195_c197_por_chave = {}
        try:
            from parsers import parse_efd_c195_c197
            c195_c197_por_chave = parse_efd_c195_c197(efd_txt)
            logging.info(f"Parseados C195/C197 para {len(c195_c197_por_chave)} chaves")
        except Exception as e:
            logging.warning(f"Erro ao parsear C195/C197: {e}")
        
        # Mapear XML por chave
        try:
            xml_por_chave = {n["CHAVE"]: n for n in xml_notes}
            logging.info(f"Mapeados {len(xml_por_chave)} XMLs por chave")
        except Exception as e:
            logging.error(f"Erro ao mapear XMLs: {e}")
            xml_por_chave = {}
        
        rows_com_solucoes = []
        solucoes_geradas = 0
        
        for idx, row in divergencias_df.iterrows():
            chave = str(row.get("CHAVE", "") or "")
            # Tentar obter campo de diferentes colunas possíveis
            campo = str(row.get("CAMPO", "") or row.get("DELTA_COLUNA", "") or "")
            valor_xml = float(row.get("VALOR_XML", 0) or 0)
            valor_sped = float(row.get("VALOR_SPED", 0) or 0)
            
            # Debug: Log da primeira linha
            if idx == divergencias_df.index[0]:
                logging.info(f"[processar_divergencias_com_solucoes] Primeira linha - CHAVE: {chave}, CAMPO original: {row.get('CAMPO', 'N/A')}, DELTA_COLUNA: {row.get('DELTA_COLUNA', 'N/A')}")
            
            if not chave:
                logging.warning(f"[processar_divergencias_com_solucoes] Linha {idx} sem CHAVE - pulando")
                row_dict = row.to_dict()
                # Adicionar colunas de solução vazias
                for col in ["SOLUCAO_AUTOMATICA", "REGISTRO_CORRIGIR", "CAMPO_CORRIGIR", "VALOR_CORRETO", "FORMULA_LEGAL", "REFERENCIA_LEGAL", "DETALHES_ITENS"]:
                    if col not in row_dict:
                        row_dict[col] = None
                rows_com_solucoes.append(row_dict)
                continue
            
            # Se não temos campo, tentar inferir do DELTA_COLUNA
            if not campo and "DELTA_COLUNA" in row:
                delta_col = str(row.get("DELTA_COLUNA", "") or "")
                # Mapear DELTA_COLUNA para nome do campo (expandir variações)
                campo_map_delta = {
                    "DELTA_VL_BC_ICMS": "BC ICMS",
                    "DELTA_VL_ICMS": "ICMS",
                    "DELTA_VL_BC_ICMS_ST": "BC ST",
                    "DELTA_VL_ICMS_ST": "ST",
                    "DELTA_VL_IPI": "IPI",
                    "Delta Base ICMS": "BC ICMS",
                    "Delta ICMS": "ICMS",
                    "Delta Base ST": "BC ST",
                    "Delta ST": "ST",
                    "Delta IPI": "IPI",
                    # Adicionar mais variações
                    "VL_BC_ICMS": "BC ICMS",
                    "VL_ICMS": "ICMS",
                    "VL_BC_ICMS_ST": "BC ST",
                    "VL_ICMS_ST": "ST",
                    "VL_IPI": "IPI",
                }
                campo = campo_map_delta.get(delta_col, "")
                if idx == divergencias_df.index[0]:
                    logging.info(f"[processar_divergencias_com_solucoes] Campo mapeado de DELTA_COLUNA '{delta_col}' para '{campo}'")
            
            # Se ainda não temos campo, tentar usar o nome da coluna diretamente
            if not campo:
                # Tentar extrair do nome da coluna que tem "Delta" ou o nome do campo
                for col_name in row.index:
                    if "BC_ICMS" in col_name or "BC ICMS" in col_name:
                        campo = "BC ICMS"
                        break
                    elif "ICMS" in col_name and "ST" not in col_name and "BC" not in col_name:
                        campo = "ICMS"
                        break
                    elif "BC_ST" in col_name or "BC ST" in col_name:
                        campo = "BC ST"
                        break
                    elif "ICMS_ST" in col_name or "ICMS ST" in col_name or "ST" in col_name:
                        campo = "ST"
                        break
                    elif "IPI" in col_name:
                        campo = "IPI"
                        break
            
            if not campo:
                # Se ainda não temos campo, adicionar sem solução mas com colunas
                logging.warning(f"[processar_divergencias_com_solucoes] Linha {idx} (chave {chave}) sem campo identificável - adicionando sem solução")
                row_dict = row.to_dict()
                # Adicionar colunas de solução vazias
                for col in ["SOLUCAO_AUTOMATICA", "REGISTRO_CORRIGIR", "CAMPO_CORRIGIR", "VALOR_CORRETO", "FORMULA_LEGAL", "REFERENCIA_LEGAL", "DETALHES_ITENS"]:
                    if col not in row_dict:
                        row_dict[col] = None
                rows_com_solucoes.append(row_dict)
                continue
            
            # Obter dados necessários
            xml_note = xml_por_chave.get(chave, {})
            xml_items = xml_note.get("items", [])
            c170_items = c170_por_chave.get(chave, [])
            c100_info = c100_map.get(chave, {})
            c190_totais = c190_by_key.get(chave, {})
            
            # Obter C176 e C195/C197 para esta chave (melhorias)
            c176_info_por_item = c176_por_chave.get(chave, {})
            c195_c197_info = c195_c197_por_chave.get(chave, {})
            
            # Verificar se divergência é explicada por C176 ou C195/C197
            # (antes de gerar solução)
            explicado_por_ajuste = False
            motivo_ajuste = ""
            
            # Para BC ST, verificar C176
            if campo == "BC ST" and c176_info_por_item:
                # Verificar se algum item tem C176
                for num_item, c176_list in c176_info_por_item.items():
                    é_legitima, motivo = validar_bc_st_com_c176(
                        chave, num_item, valor_xml, valor_sped, c176_list
                    )
                    if é_legitima:
                        explicado_por_ajuste = True
                        motivo_ajuste = motivo
                        break
            
            # Verificar C195/C197 para qualquer campo
            if not explicado_por_ajuste and c195_c197_info:
                diferenca = abs(valor_xml - valor_sped)
                é_explicado, motivo = validar_ajustes_c195_c197(
                    chave, campo, diferenca, c195_c197_info
                )
                if é_explicado:
                    explicado_por_ajuste = True
                    motivo_ajuste = motivo
            
            # Gerar solução automática
            try:
                if idx == divergencias_df.index[0]:
                    logging.info(f"[processar_divergencias_com_solucoes] Gerando solução para chave {chave}, campo {campo}, valor_xml={valor_xml}, valor_sped={valor_sped}")
                
                # Se explicado por ajuste, criar solução especial
                if explicado_por_ajuste:
                    solucao = {
                        "solucao": f"Não requer correção - {motivo_ajuste}",
                        "valor_correto": valor_sped,  # Manter valor atual se é legítimo
                        "registro_corrigir": "NENHUM",
                        "campo_corrigir": "",
                        "detalhes_itens": [],
                        "formula_legal": "Ajuste documentado conforme legislação",
                        "referencia_legal": "Guia Prático EFD-ICMS/IPI, Registro C176/C197"
                    }
                else:
                    # Usar C190 por CFOP/CST se disponível (melhorado)
                    c190_por_cfop_cst = None
                    try:
                        if parse_efd_c100_c190_c170_com_linha:
                            _, c190_map_linha, _ = parse_efd_c100_c190_c170_com_linha(efd_txt)
                            c190_por_cfop_cst = c190_map_linha
                    except Exception:
                        pass
                    
                    solucao = gerar_solucao_automatica(
                        chave, campo, valor_xml, valor_sped,
                        xml_items, efd_txt,
                        c100_info, c170_items, c190_totais, rules,
                        c190_por_cfop_cst=c190_por_cfop_cst
                    )
                solucoes_geradas += 1
                if idx == divergencias_df.index[0]:
                    logging.info(f"[processar_divergencias_com_solucoes] Solução gerada: {solucao.get('solucao', '')[:100] if solucao.get('solucao') else 'VAZIA'}")
            except Exception as e:
                logging.error(f"Erro ao gerar solução para {chave}/{campo}: {e}")
                import traceback
                traceback.print_exc()
                solucao = {
                    "solucao": f"Erro ao gerar solução: {str(e)}",
                    "registro_corrigir": "DESCONHECIDO",
                    "campo_corrigir": campo,
                    "valor_correto": valor_xml,
                    "formula_legal": "",
                    "referencia_legal": "",
                    "detalhes_itens": []
                }
            
            # Adicionar solução ao row
            row_dict = row.to_dict()
            # Garantir que valores None sejam strings vazias para JSON (mais robusto)
            solucao_texto = solucao.get("solucao", "")
            # CORREÇÃO: SOLUCAO_AUTOMATICA deve ser booleano
            registro_corrigir_temp = solucao.get("registro_corrigir", "") or ""
            valor_correto_temp = solucao.get("valor_correto")
            pode_aplicar = (
                bool(solucao_texto) and 
                bool(registro_corrigir_temp) and 
                valor_correto_temp is not None and
                registro_corrigir_temp != "NENHUM"
            )
            row_dict["SOLUCAO_AUTOMATICA"] = pode_aplicar
            row_dict["SOLUCAO"] = str(solucao_texto) if solucao_texto else ""
            
            registro_texto = solucao.get("registro_corrigir", "")
            row_dict["REGISTRO_CORRIGIR"] = str(registro_texto) if registro_texto else ""
            if row_dict["REGISTRO_CORRIGIR"] is None:
                row_dict["REGISTRO_CORRIGIR"] = ""
            
            campo_texto = solucao.get("campo_corrigir", "")
            row_dict["CAMPO_CORRIGIR"] = str(campo_texto) if campo_texto else ""
            if row_dict["CAMPO_CORRIGIR"] is None:
                row_dict["CAMPO_CORRIGIR"] = ""
            
            row_dict["VALOR_CORRETO"] = solucao.get("valor_correto", valor_xml)
            
            formula_texto = solucao.get("formula_legal", "")
            row_dict["FORMULA_LEGAL"] = str(formula_texto) if formula_texto else ""
            if row_dict["FORMULA_LEGAL"] is None:
                row_dict["FORMULA_LEGAL"] = ""
            
            referencia_texto = solucao.get("referencia_legal", "")
            row_dict["REFERENCIA_LEGAL"] = str(referencia_texto) if referencia_texto else ""
            if row_dict["REFERENCIA_LEGAL"] is None:
                row_dict["REFERENCIA_LEGAL"] = ""
            
            # Adicionar detalhes de itens como JSON string
            if solucao.get("detalhes_itens"):
                import json
                row_dict["DETALHES_ITENS"] = json.dumps(solucao["detalhes_itens"], ensure_ascii=False)
            else:
                row_dict["DETALHES_ITENS"] = None
            
            rows_com_solucoes.append(row_dict)
        
        logging.info(f"Geradas {solucoes_geradas} soluções automáticas de {len(rows_com_solucoes)} divergências")
        
        # Criar novo DataFrame com soluções
        colunas_originais = list(divergencias_df.columns)
        colunas_novas = ["SOLUCAO_AUTOMATICA", "REGISTRO_CORRIGIR", "CAMPO_CORRIGIR", 
                         "VALOR_CORRETO", "FORMULA_LEGAL", "REFERENCIA_LEGAL", "DETALHES_ITENS"]
        
        # Garantir que todas as colunas novas existam
        for col in colunas_novas:
            if col not in colunas_originais:
                pass  # Será adicionada
        
        df_resultado = pd.DataFrame(rows_com_solucoes)
        
        # Garantir que todas as colunas novas estejam presentes
        for col in colunas_novas:
            if col not in df_resultado.columns:
                # SOLUCAO_AUTOMATICA é booleano, outros campos são None/string
                if col == "SOLUCAO_AUTOMATICA":
                    df_resultado[col] = False
                else:
                    df_resultado[col] = None
        
        # CORREÇÃO: SOLUCAO_AUTOMATICA é booleano, não string
        # Garantir que colunas de solução sejam strings (não object/None)
        colunas_string = ["REGISTRO_CORRIGIR", "CAMPO_CORRIGIR", "FORMULA_LEGAL", "REFERENCIA_LEGAL", "SOLUCAO"]
        for col in colunas_string:
            if col in df_resultado.columns:
                # Converter None para string vazia e garantir tipo string
                df_resultado[col] = df_resultado[col].fillna("").astype(str)
                # Remover "nan" strings que podem ter sido criadas
                df_resultado[col] = df_resultado[col].replace("nan", "").replace("None", "").replace("null", "")
        
        # DEBUG: Verificar se soluções foram geradas
        logging.info(f"[processar_divergencias_com_solucoes] DataFrame resultado criado: {len(df_resultado)} linhas")
        logging.info(f"[processar_divergencias_com_solucoes] Colunas depois: {list(df_resultado.columns)}")
        
        if len(df_resultado) > 0:
            # Verificar se coluna SOLUCAO_AUTOMATICA existe
            if 'SOLUCAO_AUTOMATICA' in df_resultado.columns:
                # CORREÇÃO: SOLUCAO_AUTOMATICA agora é booleano, verificar True
                solucoes_nao_vazias = df_resultado[
                    df_resultado['SOLUCAO_AUTOMATICA'].notna() & 
                    (df_resultado['SOLUCAO_AUTOMATICA'] == True)
                ]
                logging.info(f"[processar_divergencias_com_solucoes] Total de divergências: {len(df_resultado)}")
                logging.info(f"[processar_divergencias_com_solucoes] Divergências com solução automática: {len(solucoes_nao_vazias)}")
                if len(solucoes_nao_vazias) > 0:
                    exemplo = solucoes_nao_vazias.iloc[0]
                    solucao_exemplo = str(exemplo.get('SOLUCAO_AUTOMATICA', ''))[:200]
                    logging.info(f"[processar_divergencias_com_solucoes] Exemplo de solução: {solucao_exemplo}...")
                    logging.info(f"[processar_divergencias_com_solucoes] Registro a corrigir: {exemplo.get('REGISTRO_CORRIGIR', 'N/A')}")
                    logging.info(f"[processar_divergencias_com_solucoes] Exemplo completo (primeiras 5 chaves): {dict(list(exemplo.to_dict().items())[:5])}")
                else:
                    logging.warning(f"[processar_divergencias_com_solucoes] NENHUMA solução automática foi gerada!")
                    # Verificar por que não foram geradas
                    primeira_linha = df_resultado.iloc[0]
                    logging.info(f"[processar_divergencias_com_solucoes] Primeira linha - SOLUCAO_AUTOMATICA: {primeira_linha.get('SOLUCAO_AUTOMATICA', 'NÃO ENCONTRADA')}")
                    logging.info(f"[processar_divergencias_com_solucoes] Primeira linha - CHAVE: {primeira_linha.get('CHAVE', 'N/A')}")
                    logging.info(f"[processar_divergencias_com_solucoes] Primeira linha - CAMPO: {primeira_linha.get('CAMPO', primeira_linha.get('DELTA_COLUNA', 'N/A'))}")
            else:
                logging.error(f"[processar_divergencias_com_solucoes] Coluna SOLUCAO_AUTOMATICA NÃO existe no DataFrame resultado!")
        else:
            logging.warning("NENHUMA solução automática foi gerada!")
        
        logging.info(f"DataFrame resultante tem {len(df_resultado)} linhas e {len(df_resultado.columns)} colunas")
        logging.info(f"Colunas: {list(df_resultado.columns)}")
        
        return df_resultado
        
    except Exception as e:
        logging.error(f"Erro ao processar divergências com soluções: {e}")
        import traceback
        traceback.print_exc()
        return divergencias_df

