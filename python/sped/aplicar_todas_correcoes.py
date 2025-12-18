#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para aplicar TODAS as correções de uma vez
Otimizado para ler o arquivo SPED apenas uma vez
"""
import sys
import json
from pathlib import Path
import logging
import re
import math

# Adicionar diretório atual ao path
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

try:
    from sped_editor import SpedEditor
except ImportError as e:
    print(json.dumps({"error": f"Erro ao importar módulos: {e}"}))
    sys.exit(1)

def _norm_num_doc(num):
    """Normaliza número de NF para dígitos sem zeros à esquerda."""
    if num is None:
        return None
    s = re.sub(r"\D", "", str(num).strip())
    s = s.lstrip("0")
    return s or None


def _is_c100_or_9999(line: str) -> bool:
    """Verifica se a linha é C100 ou 9999 (aceita |C100| ou C100|)."""
    line_stripped = line.lstrip()
    return "|C100|" in line_stripped or "|9999|" in line_stripped or line_stripped.startswith("C100|") or line_stripped.startswith("9999|")


def _is_c170(line: str) -> bool:
    """Verifica se a linha é C170 (aceita |C170| ou C170|)."""
    line_stripped = line.lstrip()
    return "|C170|" in line_stripped or line_stripped.startswith("C170|")


def _is_c190(line: str) -> bool:
    """Verifica se a linha é C190 (aceita |C190| ou C190|)."""
    line_stripped = line.lstrip()
    return "|C190|" in line_stripped or line_stripped.startswith("C190|")


def _normalize_cfop(cfop):
    """Normaliza CFOP removendo espaços e zeros à esquerda desnecessários."""
    if cfop is None:
        return ""
    # Remove espaços e converte para string
    cfop_str = "".join(str(cfop).strip().split())
    # CFOP deve ter 4 dígitos, mas pode vir com zeros à esquerda
    # Ex: "5102" ou "05102" -> ambos devem ser "5102"
    if len(cfop_str) > 4:
        # Se tiver mais de 4 dígitos, remove zeros à esquerda e pega últimos 4
        cfop_str = cfop_str.lstrip("0")
        if len(cfop_str) > 4:
            cfop_str = cfop_str[-4:]
    elif len(cfop_str) < 4 and cfop_str.isdigit():
        # Se tiver menos de 4 dígitos, preenche com zeros à esquerda
        cfop_str = cfop_str.zfill(4)
    return cfop_str


def _index_c100_por_chave(editor: SpedEditor) -> tuple:
    """
    Cria índices para C100:
    - por chave: {chave: idx}
    - por (ind_oper, num_doc_norm): {(ind_oper, num_norm): idx}
    Isso permite casar notas cujo número diverge entre XML e SPED.
    """
    from parsers import split_sped_line
    idx_c100 = {}
    idx_c100_por_num = {}
    for i, line in enumerate(editor.lines):
        # Remover espaços/BOM do início e normalizar
        line_stripped = line.lstrip()
        # Verificar se contém |C100| (formato padrão SPED)
        # Pode começar com | ou ter espaços antes
        if "|C100|" not in line_stripped:
            continue
        
        # Garantir que começa com | para split correto
        if not line_stripped.startswith("|"):
            # Se não começa com |, pode ser que tenha espaços ou BOM
            # Tentar encontrar a posição do |C100|
            pos = line_stripped.find("|C100|")
            if pos >= 0:
                line_stripped = line_stripped[pos:]
            else:
                continue
        
        parts = split_sped_line(line_stripped)
        
        # Verificar se temos pelo menos os campos básicos
        if len(parts) < 10:
            continue
            
        chv_idx_candidates = [9, 8, 2]
        chave = None
        for cand in chv_idx_candidates:
            if len(parts) > cand:
                val = parts[cand].strip()
                if val:
                    chave = val
                    break
        if chave and chave not in idx_c100:
            idx_c100[chave] = i
        # índice por número de documento + ind_oper
        ind_oper = parts[2].strip() if len(parts) > 2 else ""
        num_doc = parts[8].strip() if len(parts) > 8 else ""
        num_norm = _norm_num_doc(num_doc)
        if ind_oper and num_norm and (ind_oper, num_norm) not in idx_c100_por_num:
            idx_c100_por_num[(ind_oper, num_norm)] = i
    return idx_c100, idx_c100_por_num


def _get_c100_idx(chave, num_xml, ind_oper_xml, idx_c100_cache, idx_c100_por_num):
    """Localiza C100 pela chave; se não achar, tenta por (ind_oper, num_doc_norm)."""
    if chave and chave in idx_c100_cache:
        return idx_c100_cache[chave]
    num_norm = _norm_num_doc(num_xml)
    if ind_oper_xml and num_norm:
        return idx_c100_por_num.get((ind_oper_xml, num_norm))
    return None


def _iterar_xmls(xml_dir: Path):
    """
    Itera XMLs no diretório, retornando tuples (xml_path, conteudo_str).
    Usa utf-8 e fallback latin-1 para ser resiliente.
    """
    for xml_path in sorted(xml_dir.glob("*.xml")):
        try:
            content = xml_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = xml_path.read_text(encoding="latin-1", errors="ignore")
        yield xml_path, content


def _extrair_itens_xml(xml_str: str):
    """
    Extrai chave, ind_oper, nNF, CFOP, CST, vBC, vICMS e valor do item (vProd) de cada det.
    Retorna lista de dicts por item.
    Observação: parsing simples via regex; substituir por XML parser se necessário para maior robustez.
    """
    import re
    itens = []
    # chave (Id da NFe)
    m_chave = re.search(r'Id="NFe(\d{44})"', xml_str)
    chave = m_chave.group(1) if m_chave else None
    # indOper: 0 entrada, 1 saída
    m_ind = re.search(r"<indPag>(\d)</indPag>", xml_str)
    ind_oper = m_ind.group(1) if m_ind else None
    # número da NF (nNF)
    m_nnf = re.search(r"<nNF>(\d+)</nNF>", xml_str)
    num_doc = m_nnf.group(1) if m_nnf else None
    # percorrer cada det
    for det in re.findall(r"<det[^>]*>.*?</det>", xml_str, flags=re.S):
        cfop = None
        cst = None
        vbc = None
        vicms = None
        vprod = None
        m_cfop = re.search(r"<CFOP>([^<]+)</CFOP>", det)
        if m_cfop:
            cfop = m_cfop.group(1).strip()
        # CST ou CSOSN (pegar primeiro encontrado)
        m_cst = re.search(r"<CST>([^<]+)</CST>", det)
        if m_cst:
            cst = m_cst.group(1).strip()
        else:
            m_csosn = re.search(r"<CSOSN>([^<]+)</CSOSN>", det)
            if m_csosn:
                cst = m_csosn.group(1).strip()
        m_vbc = re.search(r"<vBC>([^<]+)</vBC>", det)
        if m_vbc:
            vbc = float(m_vbc.group(1).replace(",", "."))
        m_vicms = re.search(r"<vICMS>([^<]+)</vICMS>", det)
        if m_vicms:
            vicms = float(m_vicms.group(1).replace(",", "."))
        m_vprod = re.search(r"<vProd>([^<]+)</vProd>", det)
        if m_vprod:
            vprod = float(m_vprod.group(1).replace(",", "."))
        itens.append({
            "chave": chave,
            "ind_oper": ind_oper,
            "num_doc": num_doc,
            "cfop": cfop,
            "cst": cst,
            "vbc": vbc,
            "vicms": vicms,
            "vprod": vprod,
        })
    return itens


def aplicar_de_xmls(sped_path: Path, xml_dir: Path, output_path: Path) -> dict:
    """
    Novo modo leve: processa XML por XML, bloco por bloco (C100->C170/C190),
    evitando varrer o SPED inteiro a cada correção.
    """
    logger.info(f"Carregando SPED uma vez: {sped_path}")
    editor = SpedEditor(sped_path)
    idx_c100_cache, idx_c100_por_num = _index_c100_por_chave(editor)
    logger.info(f"Índices C100: {len(idx_c100_cache)} chaves, {len(idx_c100_por_num)} por num/ind_oper")

    total_xml = len(list(Path(xml_dir).glob("*.xml")))
    if total_xml == 0:
        return {"success": False, "error": "Nenhum XML encontrado"}

    aplicadas = 0
    puladas = 0
    erros = 0
    for ix, (xml_path, xml_str) in enumerate(_iterar_xmls(xml_dir), start=1):
        logger.info(f"[{ix}/{total_xml}] XML: {xml_path.name}")
        try:
            itens = _extrair_itens_xml(xml_str)
            for item in itens:
                chave = item.get("chave")
                cfop = item.get("cfop")
                cst = item.get("cst")
                vbc = item.get("vbc")
                vicms = item.get("vicms")
                vprod = item.get("vprod")
                ind_oper_xml = item.get("ind_oper")
                num_doc_xml = item.get("num_doc")

                if not chave:
                    continue

                # localizar C100
                c100_idx = _get_c100_idx(chave, num_doc_xml, ind_oper_xml, idx_c100_cache, idx_c100_por_num)
                if c100_idx is None:
                    logger.debug(f"Sem C100 para chave {chave}")
                    puladas += 1
                    continue

                # Normalizar CFOP e CST para comparação
                cfop_clean = _normalize_cfop(cfop)
                try:
                    from common import normalize_cst_for_compare as ncfc
                    cst_clean = ncfc(str(cst).strip()) if cst else ""
                except ImportError:
                    cst_clean = str(cst).strip().zfill(3) if cst else ""

                # coletar C170 no bloco do C100
                c170_idxs = []
                for j in range(c100_idx + 1, len(editor.lines)):
                    line = editor.lines[j]
                    if _is_c100_or_9999(line):
                        break
                    if _is_c170(line):
                        # Garantir que começa com | para split correto
                        line_stripped = line.lstrip()
                        if not line_stripped.startswith("|"):
                            pos = line_stripped.find("|C170|")
                            if pos >= 0:
                                line_stripped = line_stripped[pos:]
                            else:
                                continue
                        parts = editor.split_sped_line(line_stripped, min_fields=21)
                        if len(parts) > 11 and len(parts) > 10:
                            cfop_line = _normalize_cfop(parts[11].strip())
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                cst_line = ncfc(parts[10].strip())
                            except ImportError:
                                cst_line = parts[10].strip().zfill(3)
                            if cfop_line == cfop_clean and cst_line == cst_clean:
                                c170_idxs.append(j)
                                logger.debug(f"  C170 encontrado no bloco: linha {j+1}, CFOP={cfop_line}, CST={cst_line}")

                # Fallback: busca global por CFOP/CST se não encontrou no bloco
                if not c170_idxs:
                    logger.debug(f"Nenhum C170 no bloco de {chave} para CFOP/CST {cfop_clean}/{cst_clean}, tentando busca global...")
                    for j, line in enumerate(editor.lines):
                        if _is_c170(line):
                            # Garantir que começa com | para split correto
                            line_stripped = line.lstrip()
                            if not line_stripped.startswith("|"):
                                pos = line_stripped.find("|C170|")
                                if pos >= 0:
                                    line_stripped = line_stripped[pos:]
                                else:
                                    continue
                            parts = editor.split_sped_line(line_stripped, min_fields=21)
                            if len(parts) > 11 and len(parts) > 10:
                                cfop_line = _normalize_cfop(parts[11].strip())
                                try:
                                    from common import normalize_cst_for_compare as ncfc
                                    cst_line = ncfc(parts[10].strip())
                                except ImportError:
                                    cst_line = parts[10].strip().zfill(3)
                                if cfop_line == cfop_clean and cst_line == cst_clean:
                                    c170_idxs.append(j)
                                    logger.debug(f"  C170 encontrado globalmente: linha {j+1}, CFOP={cfop_line}, CST={cst_line}")

                if not c170_idxs:
                    logger.warning(f"Nenhum C170 encontrado (bloco + global) para chave {chave}, CFOP={cfop_clean}, CST={cst_clean}")
                    puladas += 1
                    continue

                # validar divergência: se parecer devolução/cancelamento/brinde, pular
                # (placeholder simplificado; integrar validators específicos se necessário)
                def divergencia_valida():
                    if cfop and str(cfop).startswith(("1", "2")) and vbc == 0 and vicms == 0:
                        return True
                    return False

                if divergencia_valida():
                    puladas += 1
                    continue

                # aplicar: atualiza C170 valores (vBC, vICMS) se informados
                mudou = False
                for idx in c170_idxs:
                    parts = editor.split_sped_line(editor.lines[idx], min_fields=21)
                    if vbc is not None:
                        parts[9] = f"{vbc:.2f}"
                        mudou = True
                    if vicms is not None:
                        parts[10] = f"{vicms:.2f}"
                        mudou = True
                    if vprod is not None and len(parts) > 7:
                        parts[7] = f"{vprod:.2f}"
                        mudou = True
                    editor.lines[idx] = "|".join(parts) + ("\n" if not editor.lines[idx].endswith("\n") else "")

                # recalcular C190 correspondente no bloco (soma C170)
                if mudou:
                    # zera ou cria C190 CFOP/CST
                    c190_idxs = []
                    for j in range(c100_idx + 1, len(editor.lines)):
                        line = editor.lines[j]
                        if _is_c100_or_9999(line):
                            break
                        if _is_c190(line):
                            # Garantir que começa com | para split correto
                            line_stripped = line.lstrip()
                            if not line_stripped.startswith("|"):
                                pos = line_stripped.find("|C190|")
                                if pos >= 0:
                                    line_stripped = line_stripped[pos:]
                                else:
                                    continue
                            p = editor.split_sped_line(line_stripped, min_fields=12)
                            cfop_line = _normalize_cfop(p[3].strip()) if len(p) > 3 else ""
                            cst_line = p[2].strip() if len(p) > 2 else ""
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                cst_line_norm = ncfc(cst_line)
                            except ImportError:
                                cst_line_norm = cst_line.strip().zfill(3) if cst_line else ""
                            if cfop_line == cfop_clean and cst_line_norm == cst_clean:
                                c190_idxs.append(j)
                    # sumarizar C170 do bloco para CFOP/CST
                    soma_bc = soma_icms = soma_bcst = soma_icmsst = soma_ipi = soma_opr = 0.0
                    for j in range(c100_idx + 1, len(editor.lines)):
                        line = editor.lines[j]
                        if line.startswith("C100|") or line.startswith("9999|"):
                            break
                        if _is_c170(line):
                            # Garantir que começa com | para split correto
                            line_stripped = line.lstrip()
                            if not line_stripped.startswith("|"):
                                pos = line_stripped.find("|C170|")
                                if pos >= 0:
                                    line_stripped = line_stripped[pos:]
                                else:
                                    continue
                            p = editor.split_sped_line(line_stripped, min_fields=21)
                            cfop_line = _normalize_cfop(p[11].strip()) if len(p) > 11 else ""
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                cst_line = ncfc(p[10].strip()) if len(p) > 10 else ""
                            except ImportError:
                                cst_line = p[10].strip().zfill(3) if len(p) > 10 else ""
                            if cfop_line == cfop_clean and cst_line == cst_clean:
                                soma_bc += float(p[9] or 0) if len(p) > 9 else 0
                                soma_icms += float(p[10] or 0) if len(p) > 10 else 0
                                soma_bcst += float(p[11] or 0) if len(p) > 11 else 0
                                soma_icmsst += float(p[12] or 0) if len(p) > 12 else 0
                                soma_ipi += float(p[13] or 0) if len(p) > 13 else 0
                                soma_opr += float(p[15] or 0) if len(p) > 15 else 0

                    linha_c190 = [
                        "", "C190",
                        cst_clean if cst else "",
                        cfop_clean,
                        "",  # ALIQ ICMS
                        f"{soma_opr:.2f}",
                        f"{soma_bc:.2f}",
                        f"{soma_icms:.2f}",
                        f"{soma_bcst:.2f}",
                        f"{soma_icmsst:.2f}",
                        "",  # VL_RED_BC
                        f"{soma_ipi:.2f}",
                        ""
                    ]
                    if c190_idxs:
                        editor.lines[c190_idxs[0]] = "|".join(linha_c190) + "\n"
                    else:
                        # inserir antes do próximo C100/9999
                        insert_pos = c100_idx + 1
                        while insert_pos < len(editor.lines) and not _is_c100_or_9999(editor.lines[insert_pos]):
                            insert_pos += 1
                        editor.lines.insert(insert_pos, "|".join(linha_c190) + "\n")

                    aplicadas += 1
                else:
                    puladas += 1

        except Exception as e:
            logger.error(f"Erro ao processar {xml_path.name}: {e}")
            erros += 1

    # salvar
    try:
        editor.save(output_path)
        return {
            "success": True,
            "aplicadas": aplicadas,
            "puladas": puladas,
            "erros": erros,
            "saida": str(output_path)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def aplicar_correcao_no_editor(editor: SpedEditor, correcao: dict, idx_c100_cache: dict = None, idx_c100_por_num: dict = None) -> tuple:
    """
    Aplica uma correção diretamente no editor em memória (sem salvar arquivo).
    Esta é uma versão otimizada que reutiliza a lógica de aplicar_correcao_c170_c190
    mas trabalha diretamente com o editor em memória.
    
    Args:
        editor: Instância do SpedEditor já carregada
        correcao: Dicionário com informações da correção
    
    Returns:
        Tupla (sucesso: bool, resumo: dict)
    """
    from parsers import split_sped_line
    from math import isfinite
    
    try:
        # Validações robustas dos campos obrigatórios
        registro = str(correcao.get("registro_corrigir", "")).strip()
        if not registro or registro not in ["C100", "C170", "C190"]:
            logger.error(f"REGISTRO_CORRIGIR inválido: {registro}")
            return (False, {"erro": f"REGISTRO_CORRIGIR inválido: {registro}. Deve ser C100, C170 ou C190"})
        
        campo = str(correcao.get("campo", "")).strip()
        if not campo:
            logger.error(f"Campo não especificado na correção")
            return (False, {"erro": "Campo não especificado na correção"})
        
        # Validar que o campo é válido para o registro
        campos_validos = {
            "C100": ["VL_BC_ICMS", "VL_ICMS", "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_IPI"],
            "C170": ["VL_BC_ICMS", "VL_ICMS", "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_IPI", "VL_ITEM"],
            "C190": ["VL_BC_ICMS", "VL_ICMS", "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_IPI"]
        }
        
        if campo not in campos_validos.get(registro, []):
            logger.error(f"Campo {campo} não é válido para registro {registro}")
            return (False, {"erro": f"Campo {campo} não é válido para registro {registro}"})
        
        # Validar valor_correto
        valor_correto_raw = correcao.get("valor_correto")
        if valor_correto_raw is None:
            logger.error(f"VALOR_CORRETO não especificado na correção")
            return (False, {"erro": "VALOR_CORRETO não especificado na correção"})
        
        try:
            valor_correto = float(valor_correto_raw)
            if not isfinite(valor_correto):
                logger.error(f"VALOR_CORRETO não é um número finito: {valor_correto_raw}")
                return (False, {"erro": f"VALOR_CORRETO não é um número finito: {valor_correto_raw}"})
        except (ValueError, TypeError) as e:
            logger.error(f"Erro ao converter VALOR_CORRETO para float: {valor_correto_raw} - {e}")
            return (False, {"erro": f"VALOR_CORRETO inválido: {valor_correto_raw}"})
        
        # Validar chave (obrigatória para C100/C170)
        chave = correcao.get("chave")
        if registro in ["C100", "C170"] and (not chave or not str(chave).strip()):
            logger.error(f"CHAVE não especificada para registro {registro}")
            return (False, {"erro": f"CHAVE é obrigatória para registro {registro}"})
        
        # Validar CFOP (obrigatório para C170/C190)
        cfop = correcao.get("cfop")
        if registro in ["C170", "C190"] and (not cfop or not str(cfop).strip()):
            logger.error(f"CFOP não especificado para registro {registro}")
            return (False, {"erro": f"CFOP é obrigatório para registro {registro}"})
        
        # Normalizar valores
        chave = str(chave).strip() if chave else None
        cfop_clean = _normalize_cfop(cfop)
        cst_raw = correcao.get("cst")
        linha_sped = correcao.get("linha_sped")
        
        # Validar linha_sped se fornecido
        if linha_sped is not None:
            try:
                linha_sped = int(linha_sped)
                if linha_sped < 1:
                    logger.warning(f"LINHA_SPED inválido: {linha_sped}, ignorando")
                    linha_sped = None
            except (ValueError, TypeError):
                logger.warning(f"LINHA_SPED não é um número válido: {linha_sped}, ignorando")
                linha_sped = None
        
        # Normalizar CST
        try:
            from common import normalize_cst_for_compare
            cst_normalizado = normalize_cst_for_compare(cst_raw) if cst_raw else None
        except ImportError:
            cst_normalizado = str(cst_raw).strip().zfill(3) if cst_raw else None
        
        logger.info(f"Aplicando correção: {registro}.{campo} = {valor_correto:.2f} (CFOP={cfop_clean}, CST={cst_normalizado})")
        
        # Se C190 não existe e precisa ser criado
        if registro == "C190" and valor_correto > 0:
            indices_c190 = editor.find_line_by_record("C190", cfop=cfop_clean, cst=cst_normalizado, linha_sped=linha_sped)
            
            if not indices_c190:
                # C190 não existe, precisa criar
                # 1) Buscar C170 dentro do bloco do C100 da chave (se existir)
                indices_c170 = []
                if chave:
                    # Normalizar chave antes de buscar (remover espaços)
                    chave_normalizada = str(chave).strip() if chave else None
                    # Usar _get_c100_idx que já tem fallback por num_doc/ind_oper
                    c100_idx = _get_c100_idx(
                        chave_normalizada,
                        correcao.get("num_doc_xml"),
                        correcao.get("ind_oper_xml"),
                        idx_c100_cache if idx_c100_cache is not None else {},
                        idx_c100_por_num if idx_c100_por_num is not None else {}
                    )
                    indices_c100 = [c100_idx] if c100_idx is not None else []
                    logger.debug(f"Encontrados {len(indices_c100)} C100 com chave {chave_normalizada}")
                    if c100_idx is not None:
                        for idx in range(c100_idx + 1, len(editor.lines)):
                            line = editor.lines[idx]
                            if _is_c100_or_9999(line):
                                break
                            line_stripped = line.lstrip()
                            if _is_c190(line_stripped):
                                continue
                            if _is_c170(line_stripped):
                                # Garantir que começa com | para split correto
                                if not line_stripped.startswith("|"):
                                    pos = line_stripped.find("|C170|")
                                    if pos >= 0:
                                        line_stripped = line_stripped[pos:]
                                    else:
                                        continue
                                parts = split_sped_line(line_stripped, min_fields=21)
                                if len(parts) > 11:
                                    linha_cfop_clean = _normalize_cfop(parts[11].strip())
                                    if linha_cfop_clean == cfop_clean:
                                        if len(parts) > 10:
                                            linha_cst = parts[10].strip()
                                            try:
                                                from common import normalize_cst_for_compare as ncfc
                                                linha_cst_norm = ncfc(linha_cst)
                                            except ImportError:
                                                linha_cst_norm = linha_cst.strip().zfill(3)
                                            if linha_cst_norm == cst_normalizado:
                                                indices_c170.append(idx)
                                                logger.debug(f"Encontrado C170 na linha {idx + 1} com CFOP {cfop_clean} e CST {cst_normalizado}")
                # 2) Fallback: busca global por CFOP/CST
                if not indices_c170:
                    logger.debug("Não encontrou C170 com chave; tentando busca global por CFOP/CST...")
                    indices_c170 = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_normalizado)
                # 3) Fallback: CFOP + CST original
                if not indices_c170 and cst_raw:
                    indices_c170 = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_raw)
                # 4) Fallback: CFOP e filtra CST manualmente
                if not indices_c170:
                    c170_cfop = editor.find_line_by_record("C170", cfop=cfop_clean)
                    indices_c170_alternativo = []
                    for idx in c170_cfop:
                        line = editor.lines[idx]
                        parts = split_sped_line(line, min_fields=21)
                        if len(parts) > 10:
                            linha_cst = parts[10].strip()
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                linha_cst_norm = ncfc(linha_cst)
                            except ImportError:
                                linha_cst_norm = linha_cst.strip().zfill(3)
                            if linha_cst_norm == cst_normalizado or linha_cst == cst_raw or linha_cst == str(cst_raw).strip():
                                indices_c170_alternativo.append(idx)
                    indices_c170 = indices_c170_alternativo

                if not indices_c170:
                    logger.warning(f"Nenhum C170 encontrado: CFOP={cfop_clean}, CST={cst_normalizado}, CHAVE={chave}")
                    # Log adicional para debug
                    if chave:
                        # Usar _get_c100_idx para aproveitar o índice
                        chave_normalizada = str(chave).strip() if chave else None
                        c100_idx_fallback = _get_c100_idx(
                            chave_normalizada,
                            correcao.get("num_doc_xml"),
                            correcao.get("ind_oper_xml"),
                            idx_c100_cache if idx_c100_cache is not None else {},
                            idx_c100_por_num if idx_c100_por_num is not None else {}
                        )
                        c100_encontrados = [c100_idx_fallback] if c100_idx_fallback is not None else []
                        logger.warning(f"C100 encontrados com chave {chave_normalizada}: {len(c100_encontrados)}")
                        if c100_encontrados:
                            c100_idx = c100_encontrados[0]
                            c170_no_bloco = []
                            for idx in range(c100_idx + 1, min(c100_idx + 120, len(editor.lines))):
                                if _is_c100_or_9999(editor.lines[idx]):
                                    break
                                if _is_c170(editor.lines[idx]):
                                    c170_no_bloco.append(idx)
                            logger.warning(f"C170 encontrados no bloco do C100: {len(c170_no_bloco)}")
                            for idx in c170_no_bloco[:3]:
                                parts = split_sped_line(editor.lines[idx], min_fields=21)
                                if len(parts) > 11:
                                    cfop_ex = _normalize_cfop(parts[11].strip())
                                    cst_ex = parts[10].strip() if len(parts) > 10 else "N/A"
                                    logger.warning(f"  Exemplo C170 linha {idx + 1}: CFOP={cfop_ex}, CST={cst_ex}")

                    return (False, {
                        "erro": f"Não foi possível criar C190: nenhum C170 encontrado com CFOP {cfop_clean} e CST {cst_normalizado} (chave: {chave})"
                    })
                
                # Calcular valores baseados nos C170
                vl_bc_icms = 0.0
                vl_icms = 0.0
                vl_bc_icms_st = 0.0
                vl_icms_st = 0.0
                vl_ipi = 0.0
                vl_opr = 0.0
                
                for idx in indices_c170:
                    parts = split_sped_line(editor.lines[idx], min_fields=21)
                    if len(parts) > 9:
                        vl_bc_icms += float(parts[9] or 0) if parts[9] else 0.0
                    if len(parts) > 10:
                        vl_icms += float(parts[10] or 0) if parts[10] else 0.0
                    if len(parts) > 11:
                        vl_bc_icms_st += float(parts[11] or 0) if parts[11] else 0.0
                    if len(parts) > 12:
                        vl_icms_st += float(parts[12] or 0) if parts[12] else 0.0
                    if len(parts) > 13:
                        vl_ipi += float(parts[13] or 0) if parts[13] else 0.0
                    if len(parts) > 15:
                        vl_opr += float(parts[15] or 0) if parts[15] else 0.0
                
                # Mapear campo para variável
                valor_soma_c170 = {
                    "VL_BC_ICMS": vl_bc_icms,
                    "VL_ICMS": vl_icms,
                    "VL_BC_ICMS_ST": vl_bc_icms_st,
                    "VL_ICMS_ST": vl_icms_st,
                    "VL_IPI": vl_ipi
                }.get(campo, 0.0)
                
                # Validar se o valor está de acordo com a legislação
                diferenca = abs(valor_correto - valor_soma_c170)
                if diferenca > 0.02:
                    logger.warning(f"Valor da correção ({valor_correto:.2f}) difere da soma dos C170 ({valor_soma_c170:.2f}). Usando soma dos C170.")
                    valor_correto = valor_soma_c170
                
                # Atualizar valores conforme campo
                if campo == "VL_BC_ICMS":
                    vl_bc_icms = valor_correto
                elif campo == "VL_ICMS":
                    vl_icms = valor_correto
                elif campo == "VL_BC_ICMS_ST":
                    vl_bc_icms_st = valor_correto
                elif campo == "VL_ICMS_ST":
                    vl_icms_st = valor_correto
                elif campo == "VL_IPI":
                    vl_ipi = valor_correto
                
                # Criar linha C190
                campos_c190 = [
                    "", "C190", cst_normalizado or "", cfop or "", "",
                    f"{vl_opr:.2f}", f"{vl_bc_icms:.2f}", f"{vl_icms:.2f}",
                    f"{vl_bc_icms_st:.2f}", f"{vl_icms_st:.2f}", "",
                    f"{vl_ipi:.2f}", ""
                ]
                linha_c190 = "|".join(campos_c190) + "|\n"
                
                # Encontrar posição para inserir
                posicao_inserir = None
                if indices_c170:
                    posicao_inserir = max(indices_c170) + 1
                else:
                    todos_c190 = editor.find_line_by_record("C190")
                    if todos_c190:
                        posicao_inserir = max(todos_c190) + 1
                    else:
                        todos_c170 = editor.find_line_by_record("C170")
                        if todos_c170:
                            posicao_inserir = max(todos_c170) + 1
                
                if posicao_inserir is None:
                    for idx in range(len(editor.lines) - 1, -1, -1):
                        if editor.lines[idx].startswith('9999|'):
                            posicao_inserir = idx
                            break
                
                if posicao_inserir is None:
                    posicao_inserir = len(editor.lines)
                
                # Inserir C190
                editor.lines.insert(posicao_inserir, linha_c190)
                logger.info(f"C190 criado na linha {posicao_inserir + 1} com CFOP {cfop_clean}, CST {cst_normalizado}, {campo} = {valor_correto:.2f}")
                return (True, {"acao": "criado", "linha": posicao_inserir + 1})
            else:
                # C190 existe, atualizar
                # Buscar C170 considerando a chave se disponível
                indices_c170 = []
                if chave:
                    # Buscar C100 com a chave
                    indices_c100 = editor.find_line_by_record("C100", chave=chave)
                    if indices_c100:
                        c100_idx = indices_c100[0]
                        # Buscar C170 no bloco deste C100
                        for idx in range(c100_idx + 1, len(editor.lines)):
                            line = editor.lines[idx]
                            if _is_c100_or_9999(line):
                                break
                            if _is_c170(line):
                                # Garantir que começa com | para split correto
                                line_stripped = line.lstrip()
                                if not line_stripped.startswith("|"):
                                    pos = line_stripped.find("|C170|")
                                    if pos >= 0:
                                        line_stripped = line_stripped[pos:]
                                    else:
                                        continue
                                parts = split_sped_line(line_stripped, min_fields=21)
                                if len(parts) > 11:
                                    linha_cfop_clean = _normalize_cfop(parts[11].strip())
                                    if linha_cfop_clean == cfop_clean:
                                        if len(parts) > 10:
                                            linha_cst = parts[10].strip()
                                            try:
                                                from common import normalize_cst_for_compare as ncfc
                                                linha_cst_norm = ncfc(linha_cst)
                                            except ImportError:
                                                linha_cst_norm = linha_cst.strip().zfill(3)
                                            if linha_cst_norm == cst_normalizado:
                                                indices_c170.append(idx)
                
                # Fallback: busca global se não encontrou com chave
                if not indices_c170:
                    indices_c170 = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_normalizado)
                
                if indices_c170:
                    soma_c170 = 0.0
                    posicao_campo = {
                        "VL_BC_ICMS": 9, "VL_ICMS": 10, "VL_BC_ICMS_ST": 11,
                        "VL_ICMS_ST": 12, "VL_IPI": 13
                    }.get(campo, 9)
                    
                    for idx in indices_c170:
                        parts = split_sped_line(editor.lines[idx], min_fields=21)
                        if len(parts) > posicao_campo:
                            soma_c170 += float(parts[posicao_campo] or 0) if parts[posicao_campo] else 0.0
                    
                    diferenca = abs(valor_correto - soma_c170)
                    if diferenca > 0.02:
                        logger.warning(f"Valor da correção ({valor_correto:.2f}) difere da soma dos C170 ({soma_c170:.2f}). Usando soma dos C170.")
                        valor_correto = soma_c170
                
                sucesso = editor.update_field(
                    registro=registro,
                    campo=campo,
                    novo_valor=valor_correto,
                    cfop=cfop,
                    cst=cst_normalizado,
                    linha_sped=linha_sped
                )
                
                if sucesso:
                    logger.info(f"C190 atualizado: {campo} = {valor_correto:.2f}")
                    return (True, {"acao": "atualizado"})
                else:
                    return (False, {"erro": "Não foi possível atualizar C190"})
        else:
            # Atualizar campo existente (C170 ou outro)
            sucesso = editor.update_field(
                registro=registro,
                campo=campo,
                novo_valor=valor_correto,
                chave=chave,
                cfop=cfop,
                cst=cst_normalizado,
                linha_sped=linha_sped
            )
            
            if sucesso:
                # Se corrigiu um C170, recalcular C190 correspondente automaticamente
                if registro == "C170" and cfop_clean and cst_normalizado:
                    logger.info(f"Correção C170 aplicada, recalculando C190 para CFOP {cfop_clean}, CST {cst_normalizado}")
                    
                    # Encontrar todos os C170 com mesmo CFOP/CST no bloco do C100
                    indices_c170_para_soma = []
                    if chave:
                        # Buscar C100 com a chave
                        chave_normalizada = str(chave).strip() if chave else None
                        c100_idx = _get_c100_idx(
                            chave_normalizada,
                            correcao.get("num_doc_xml"),
                            correcao.get("ind_oper_xml"),
                            idx_c100_cache if idx_c100_cache is not None else {},
                            idx_c100_por_num if idx_c100_por_num is not None else {}
                        )
                        if c100_idx is not None:
                            # Buscar C170 no bloco deste C100
                            for idx in range(c100_idx + 1, len(editor.lines)):
                                line = editor.lines[idx]
                                if _is_c100_or_9999(line):
                                    break
                                if _is_c190(line):
                                    continue
                                if _is_c170(line):
                                    line_stripped = line.lstrip()
                                    if not line_stripped.startswith("|"):
                                        pos = line_stripped.find("|C170|")
                                        if pos >= 0:
                                            line_stripped = line_stripped[pos:]
                                        else:
                                            continue
                                    parts = split_sped_line(line_stripped, min_fields=21)
                                    if len(parts) > 11:
                                        linha_cfop_clean = _normalize_cfop(parts[11].strip())
                                        if linha_cfop_clean == cfop_clean:
                                            if len(parts) > 10:
                                                linha_cst = parts[10].strip()
                                                try:
                                                    from common import normalize_cst_for_compare as ncfc
                                                    linha_cst_norm = ncfc(linha_cst)
                                                except ImportError:
                                                    linha_cst_norm = linha_cst.strip().zfill(3)
                                                if linha_cst_norm == cst_normalizado:
                                                    indices_c170_para_soma.append(idx)
                    
                    # Fallback: busca global se não encontrou com chave
                    if not indices_c170_para_soma:
                        indices_c170_para_soma = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_normalizado)
                    
                    if indices_c170_para_soma:
                        # Calcular soma de todos os campos dos C170
                        vl_bc_icms = 0.0
                        vl_icms = 0.0
                        vl_bc_icms_st = 0.0
                        vl_icms_st = 0.0
                        vl_ipi = 0.0
                        vl_opr = 0.0
                        
                        for idx in indices_c170_para_soma:
                            parts = split_sped_line(editor.lines[idx], min_fields=21)
                            if len(parts) > 9:
                                vl_bc_icms += float(parts[9] or 0) if parts[9] else 0.0
                            if len(parts) > 10:
                                vl_icms += float(parts[10] or 0) if parts[10] else 0.0
                            if len(parts) > 11:
                                vl_bc_icms_st += float(parts[11] or 0) if parts[11] else 0.0
                            if len(parts) > 12:
                                vl_icms_st += float(parts[12] or 0) if parts[12] else 0.0
                            if len(parts) > 13:
                                vl_ipi += float(parts[13] or 0) if parts[13] else 0.0
                            if len(parts) > 15:
                                vl_opr += float(parts[15] or 0) if parts[15] else 0.0
                        
                        # Buscar C190 correspondente
                        indices_c190 = editor.find_line_by_record("C190", cfop=cfop_clean, cst=cst_normalizado)
                        
                        if indices_c190:
                            # Atualizar C190 existente com os novos totais
                            c190_idx = indices_c190[0]
                            line_c190 = editor.lines[c190_idx]
                            line_c190_stripped = line_c190.lstrip()
                            
                            # Garantir que começa com |
                            if not line_c190_stripped.startswith("|"):
                                pos = line_c190_stripped.find("|C190|")
                                if pos >= 0:
                                    line_c190_stripped = line_c190_stripped[pos:]
                                else:
                                    logger.warning(f"Não foi possível processar C190 na linha {c190_idx + 1}")
                                    return (True, {"acao": "atualizado", "aviso": "C170 corrigido mas C190 não pôde ser recalculado"})
                            
                            parts_c190 = split_sped_line(line_c190_stripped, min_fields=14)
                            
                            # Atualizar campos do C190 (posições baseadas no formato SPED)
                            if len(parts_c190) > 6:
                                parts_c190[6] = f"{vl_opr:.2f}"
                            if len(parts_c190) > 7:
                                parts_c190[7] = f"{vl_bc_icms:.2f}"
                            if len(parts_c190) > 8:
                                parts_c190[8] = f"{vl_icms:.2f}"
                            if len(parts_c190) > 9:
                                parts_c190[9] = f"{vl_bc_icms_st:.2f}"
                            if len(parts_c190) > 10:
                                parts_c190[10] = f"{vl_icms_st:.2f}"
                            if len(parts_c190) > 12:
                                parts_c190[12] = f"{vl_ipi:.2f}"
                            
                            # Reconstruir linha C190 preservando formato original
                            linha_c190_atualizada = "|".join(parts_c190)
                            if not linha_c190_atualizada.endswith("|"):
                                linha_c190_atualizada += "|"
                            if not linha_c190_atualizada.endswith("\n"):
                                linha_c190_atualizada += "\n"
                            
                            editor.lines[c190_idx] = linha_c190_atualizada
                            logger.info(f"✅ C190 recalculado na linha {c190_idx + 1}: VL_BC_ICMS={vl_bc_icms:.2f}, VL_ICMS={vl_icms:.2f}, VL_IPI={vl_ipi:.2f}")
                        else:
                            # C190 não existe, criar novo
                            campos_c190 = [
                                "", "C190", cst_normalizado or "", cfop_clean or "", "",
                                f"{vl_opr:.2f}", f"{vl_bc_icms:.2f}", f"{vl_icms:.2f}",
                                f"{vl_bc_icms_st:.2f}", f"{vl_icms_st:.2f}", "",
                                f"{vl_ipi:.2f}", ""
                            ]
                            linha_c190 = "|".join(campos_c190) + "|\n"
                            
                            # Inserir após o último C170 do mesmo CFOP/CST
                            if indices_c170_para_soma:
                                posicao_inserir = max(indices_c170_para_soma) + 1
                            else:
                                # Fallback: inserir após qualquer C190 existente ou no final
                                todos_c190 = editor.find_line_by_record("C190")
                                if todos_c190:
                                    posicao_inserir = max(todos_c190) + 1
                                else:
                                    posicao_inserir = len(editor.lines)
                            
                            editor.lines.insert(posicao_inserir, linha_c190)
                            logger.info(f"✅ C190 criado na linha {posicao_inserir + 1} após correção de C170 (CFOP={cfop_clean}, CST={cst_normalizado})")
                
                return (True, {"acao": "atualizado"})
            else:
                return (False, {"erro": "Não foi possível aplicar correção"})
    
    except Exception as e:
        import traceback
        error_msg = f"Erro ao aplicar correção no editor: {str(e)}"
        logger.error(error_msg)
        logger.debug(traceback.format_exc())
        return (False, {"erro": error_msg})

def aplicar_todas_correcoes(sped_path: Path, correcoes: list, output_path: Path) -> dict:
    """
    Aplica todas as correções de uma vez, otimizado para performance.
    Carrega o arquivo SPED apenas uma vez e aplica todas as correções em memória.
    Agora utiliza índices C100 por chave e por número (ind_oper, num_doc_norm) para buscar blocos rapidamente.
    
    Args:
        sped_path: Caminho do arquivo SPED original
        correcoes: Lista de dicionários com informações das correções
        output_path: Caminho do arquivo SPED corrigido final
    
    Returns:
        Dicionário com resumo das alterações
    """
    try:
        # Carregar arquivo SPED UMA VEZ
        logger.info(f"Carregando arquivo SPED: {sped_path}")
        editor = SpedEditor(sped_path)
        logger.info(f"Arquivo SPED carregado: {len(editor.lines)} linhas")
        # Índices de C100 por chave e por (ind_oper, num_doc_norm) para casar notas mesmo com número divergente
        idx_c100_cache, idx_c100_por_num = _index_c100_por_chave(editor)
        logger.info(f"Índices C100 gerados: {len(idx_c100_cache)} chaves únicas, {len(idx_c100_por_num)} pares ind_oper/num_doc_norm")
        
        resultados = []
        sucessos = 0
        falhas = 0
        
        # Aplicar cada correção diretamente no editor em memória
        total = len(correcoes)
        logger.info(f"Iniciando aplicação de {total} correções...")
        for i, correcao in enumerate(correcoes):
            try:
                if (i + 1) % 10 == 0 or i == 0:
                    logger.info(f"Progresso: {i + 1}/{total} correções processadas...")
                
                # Log detalhado da correção sendo aplicada
                logger.debug(f"Correção {i + 1}/{total}: {correcao.get('registro_corrigir')}.{correcao.get('campo')} = {correcao.get('valor_correto')}")
                
                # Aplicar correção diretamente no editor (permitindo override de C100 por número de NF/ind_oper)
                c100_idx_override = None
                if "num_doc_xml" in correcao or "ind_oper_xml" in correcao:
                    c100_idx_override = _get_c100_idx(
                        correcao.get("chave"),
                        correcao.get("num_doc_xml"),
                        correcao.get("ind_oper_xml"),
                        idx_c100_cache,
                        idx_c100_por_num
                    )
                    if c100_idx_override is not None:
                        logger.debug(f"Usando C100 encontrado por num_doc/ind_oper: linha {c100_idx_override + 1}")
                        correcao = dict(correcao)
                        correcao["linha_sped_c100"] = c100_idx_override + 1  # 1-indexed
                
                sucesso, resumo = aplicar_correcao_no_editor(editor, correcao, idx_c100_cache=idx_c100_cache, idx_c100_por_num=idx_c100_por_num)
                
                if sucesso:
                    sucessos += 1
                    resultados.append({
                        "correcao": correcao,
                        "sucesso": True,
                        "resumo": resumo
                    })
                    logger.debug(f"✅ Correção {i + 1} aplicada com sucesso")
                else:
                    falhas += 1
                    erro_msg = resumo.get("erro", "Erro desconhecido")
                    logger.warning(f"⚠️ Correção {i + 1} falhou: {erro_msg}")
                    resultados.append({
                        "correcao": correcao,
                        "sucesso": False,
                        "erro": erro_msg
                    })
                    
            except Exception as e:
                import traceback
                falhas += 1
                error_msg = str(e)
                traceback_str = traceback.format_exc()
                logger.error(f"❌ Erro ao aplicar correção {i + 1}: {error_msg}")
                logger.debug(f"Traceback completo: {traceback_str}")
                resultados.append({
                    "correcao": correcao,
                    "sucesso": False,
                    "erro": error_msg,
                    "traceback": traceback_str[:500] if len(traceback_str) > 500 else traceback_str
                })
        
        logger.info(f"Correções processadas: {sucessos} sucessos, {falhas} falhas de {len(correcoes)} total")
        
        # Garantir que o diretório existe
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"Diretório garantido: {output_path.parent}")
        except Exception as e:
            logger.error(f"Erro ao criar diretório {output_path.parent}: {e}")
            return {
                "success": False,
                "error": f"Erro ao criar diretório: {str(e)}"
            }
        
        # Salvar arquivo corrigido UMA VEZ no final
        logger.info(f"Salvando arquivo corrigido: {output_path}")
        try:
            editor.save(output_path)
            logger.info(f"✅ Método save() executado com sucesso")
        except Exception as e:
            import traceback
            error_msg = f"Erro ao salvar arquivo: {str(e)}\n{traceback.format_exc()}"
            logger.error(error_msg)
            return {
                "success": False,
                "error": f"Erro ao salvar arquivo SPED: {str(e)}",
                "traceback": traceback.format_exc()[:500]
            }
        
        # Verificar se o arquivo foi criado
        if not output_path.exists():
            logger.error(f"❌ Arquivo não foi criado após save(): {output_path}")
            # Verificar se o diretório existe
            if not output_path.parent.exists():
                logger.error(f"❌ Diretório não existe: {output_path.parent}")
            else:
                # Listar arquivos no diretório para debug
                try:
                    files = list(output_path.parent.iterdir())
                    logger.error(f"Arquivos no diretório: {[f.name for f in files]}")
                except Exception as e:
                    logger.error(f"Erro ao listar arquivos: {e}")
            return {
                "success": False,
                "error": f"Arquivo final não foi criado: {output_path}",
                "detalhes": "O método save() foi executado mas o arquivo não foi encontrado"
            }
        
        # Verificar tamanho do arquivo
        try:
            file_size = output_path.stat().st_size
            if file_size == 0:
                logger.error(f"⚠️ Arquivo criado mas está vazio: {output_path}")
                return {
                    "success": False,
                    "error": f"Arquivo criado mas está vazio: {output_path}"
                }
            logger.info(f"✅ Arquivo corrigido salvo: {output_path} ({file_size} bytes)")
            print(json.dumps({"arquivo_criado": str(output_path), "tamanho_bytes": file_size}), flush=True)
        except Exception as e:
            logger.error(f"Erro ao verificar tamanho do arquivo: {e}")
            return {
                "success": False,
                "error": f"Erro ao verificar arquivo salvo: {str(e)}"
            }
        
        return {
            "success": sucessos > 0,
            "sucessos": sucessos,
            "falhas": falhas,
            "total": len(correcoes),
            "resultados": resultados
        }
        
    except Exception as e:
        import traceback
        error_msg = f"Erro ao aplicar correções: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }

def main():
    # Prioriza modo XML por flag
    if len(sys.argv) >= 4 and sys.argv[1] == "--xml-dir":
        # Uso: aplicar_todas_correcoes.py --xml-dir <xml_dir> <sped_path> <output_path_opcional>
        xml_dir = Path(sys.argv[2])
        sped_path = Path(sys.argv[3])
        output_path = Path(sys.argv[4]) if len(sys.argv) > 4 else sped_path.parent / "sped_corrigido.txt"
        try:
            resultado = aplicar_de_xmls(sped_path, xml_dir, output_path)
            print(json.dumps(resultado, indent=2, ensure_ascii=False), flush=True)
            if not resultado.get("success"):
                sys.exit(1)
        except Exception as e:
            import traceback
            error_msg = f"Erro ao aplicar de XMLs: {str(e)}\n{traceback.format_exc()}"
            print(json.dumps({"error": error_msg}), flush=True)
            sys.exit(1)
    # Modo JSON (corrigido)
    elif len(sys.argv) == 4:
        sped_path = Path(sys.argv[1])
        output_path = Path(sys.argv[2])
        correcoes_json_path = Path(sys.argv[3])
        try:
            if correcoes_json_path.exists():
                correcoes = json.loads(correcoes_json_path.read_text(encoding='utf-8'))
            else:
                correcoes = json.loads(str(correcoes_json_path))
            if not isinstance(correcoes, list):
                print(json.dumps({"error": "correcoes deve ser uma lista"}))
                sys.exit(1)
            logger.info(f"Aplicando {len(correcoes)} correções de uma vez...")
            print(json.dumps({"status": "iniciando", "total": len(correcoes)}), flush=True)
            resultado = aplicar_todas_correcoes(sped_path, correcoes, output_path)
            print(json.dumps(resultado, indent=2, ensure_ascii=False), flush=True)
            if not resultado.get("success"):
                sys.exit(1)
        except Exception as e:
            import traceback
            error_msg = f"Erro ao aplicar correções: {str(e)}\n{traceback.format_exc()}"
            print(json.dumps({"error": error_msg}), flush=True)
            sys.exit(1)
    else:
        print(json.dumps({"error": "Uso:\n  modo JSON: aplicar_todas_correcoes.py <sped_path> <saida_path> <correcoes_json>\n  modo XML:  aplicar_todas_correcoes.py --xml-dir <dir_xml> <sped_path> <saida_path_opcional>"}))
        sys.exit(1)

if __name__ == "__main__":
    main()

