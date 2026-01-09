# -*- coding: utf-8 -*-
"""
API para extrair 'Sócios e Administradores' de PDF da RFB usando Python (pdfplumber).
Chamado pelo Node.js quando há upload de PDF manual.

Uso: python extract_socios_api.py <caminho_do_pdf>
Retorna: JSON com os sócios extraídos
"""

import sys
import json
import re
import os
from pathlib import Path

# Regex patterns
cpfcnpj_line_re = re.compile(
    r'^(?:\d{2,3}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\b',
    flags=re.MULTILINE
)

row_parse_re = re.compile(
    r'^(?P<id>(?:\d{2,3}\.\d{3}\.\d{3}/\d{4}-\d{2})|(?:\d{3}\.\d{3}\.\d{3}-\d{2}))\s+'
    r'(?P<nome>.*?)\s+'
    r'(?P<qual>SÓCIO(?:-ADMINISTRADOR)?|ADMINISTRADOR|QUOTISTA|TITULAR|PROPRIETÁRIO|CONDÔMINO|COTISTA)\s+'
    r'(?P<sit>REGULAR|ATIVA|INAPTA|SUSPENSA|BAIXADA|CANCELADA|INATIVA)\s+'
    r'(?P<cap>\d{1,3}[,\.]\d{2}%)'
    r'(?:\s+(?P<vot>\d{1,3}[,\.]\d{2}%))?'
    r'(?:\s+(?P<suffix>.+))?$'
)

cpfcnpj_start_re = re.compile(
    r'^(?P<id>(?:\d{2,3}\.\d{3}\.\d{3}/\d{4}-\d{2})|(?:\d{3}\.\d{3}\.\d{3}-\d{2}))\s+(?P<rest>.*)$'
)

def extract_text_pages(pdf_path: str) -> list:
    """
    Extract selectable text from PDF without OCR.
    Tries pdfplumber first; falls back to PyMuPDF if needed.
    """
    pages = []
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
        return pages
    except Exception as e1:
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)
            for p in doc:
                pages.append(p.get_text("text") or "")
            doc.close()
            return pages
        except Exception as e2:
            raise RuntimeError(f"Não foi possível extrair texto do PDF (sem OCR). pdfplumber: {e1}, PyMuPDF: {e2}")

def build_records(block_text: str) -> list:
    lines = [ln.strip() for ln in block_text.splitlines() if ln.strip()]
    recs = []
    cur = None

    for ln in lines:
        # ✅ MELHORADO: Ignorar linhas de cabeçalho ou informações complementares
        # Ignorar completamente linhas que contenham "Qualif. Resp." em qualquer lugar
        # Ignorar linhas com "CONTRATANTE: 32.401.481/0001-33" (CNPJ do contratante)
        if ("Qualif. Resp" in ln or "Qualif Resp" in ln or 
            ln.startswith("CPF Representante Legal") or 
            ln.startswith("CPF/CNPJ") or
            "CONTRATANTE: 32.401.481/0001-33" in ln or
            "CONTRATANTE: 32401481000133" in ln or
            "CONTRATANTE: 32.401.481" in ln):
            print(f"[Python Build] ⚠️ Linha ignorada (informação complementar): {ln[:100]}", file=sys.stderr)
            continue

        m = cpfcnpj_start_re.match(ln)
        if m:
            # ✅ NOVO: Verificar se a linha atual (cur) contém "Qualif. Resp." antes de adicionar
            if cur:
                if "Qualif. Resp" not in cur and "Qualif Resp" not in cur:
                    recs.append(cur.strip())
                else:
                    print(f"[Python Build] ⚠️ Registro ignorado (contém Qualif. Resp.): {cur[:100]}", file=sys.stderr)
            cur = ln
        else:
            if cur:
                # ✅ NOVO: Verificar se a linha a ser adicionada contém "Qualif. Resp."
                if "Qualif. Resp" not in ln and "Qualif Resp" not in ln:
                    cur += " " + ln
                else:
                    print(f"[Python Build] ⚠️ Linha ignorada (contém Qualif. Resp.): {ln[:100]}", file=sys.stderr)
                    # Não adicionar esta linha ao registro atual

    if cur:
        # ✅ NOVO: Verificar se o registro final contém "Qualif. Resp." antes de adicionar
        if "Qualif. Resp" not in cur and "Qualif Resp" not in cur:
            recs.append(cur.strip())
        else:
            print(f"[Python Build] ⚠️ Registro final ignorado (contém Qualif. Resp.): {cur[:100]}", file=sys.stderr)
    return recs

def parse_rows(rows: list) -> list:
    out = []
    bad = []

    for r in rows:
        # ✅ NOVO: Filtrar registros que contenham "Qualif. Resp." antes de processar
        if "Qualif. Resp" in r or "Qualif Resp" in r:
            print(f"[Python Parse] ⚠️ Registro ignorado (contém Qualif. Resp.): {r[:100]}", file=sys.stderr)
            continue
        # ✅ MELHORADO: Tentar regex completo primeiro
        m = row_parse_re.match(r)
        if not m:
            # ✅ MELHORADO: Tentar parsing mais flexível e robusto
            m_flex = cpfcnpj_start_re.match(r)
            if m_flex:
                # Extrair informações básicas mesmo sem match completo
                # ✅ MELHORADO: Buscar todos os dados possíveis na linha, não apenas dividir por espaços
                
                # 1. CPF/CNPJ já foi capturado pelo regex
                id_val = m_flex.group("id")
                rest = m_flex.group("rest")
                
                # 2. Buscar percentual em qualquer lugar da linha (não apenas no final)
                percent_match = re.search(r'(\d{1,3}[,\.]\d{2})\s*%', rest)
                percent = None
                if percent_match:
                    percent = percent_match.group(1).replace(',', '.')
                else:
                    # Tentar padrão alternativo: "Cap. Social: XX,XX%"
                    cap_social_match = re.search(r'Cap\.?\s*Social[:\s]*(\d{1,3}[,\.]\d{2})\s*%', rest, re.IGNORECASE)
                    if cap_social_match:
                        percent = cap_social_match.group(1).replace(',', '.')
                
                # 3. Buscar qualificação (palavras conhecidas)
                qualificacoes_conhecidas = [
                    r'SÓCIO-ADMINISTRADOR',
                    r'SÓCIO\s+ADMINISTRADOR',
                    r'ADMINISTRADOR',
                    r'SÓCIO',
                    r'QUOTISTA',
                    r'TITULAR',
                    r'PROPRIETÁRIO',
                    r'CONDÔMINO',
                    r'COTISTA'
                ]
                qual = None
                for qual_pattern in qualificacoes_conhecidas:
                    qual_match = re.search(qual_pattern, rest, re.IGNORECASE)
                    if qual_match:
                        qual = qual_match.group(0).upper()
                        break
                
                # 4. Buscar situação cadastral (palavras conhecidas)
                situacoes_conhecidas = [
                    r'REGULAR',
                    r'ATIVA',
                    r'INAPTA',
                    r'SUSPENSA',
                    r'BAIXADA',
                    r'CANCELADA',
                    r'INATIVA'
                ]
                sit = 'ATIVA'  # Default
                for sit_pattern in situacoes_conhecidas:
                    sit_match = re.search(sit_pattern, rest, re.IGNORECASE)
                    if sit_match:
                        sit = sit_match.group(0).upper()
                        break
                
                # 5. Extrair nome - remover CPF/CNPJ, percentual, qualificação e situação
                # O nome é tudo que sobra após remover esses elementos
                nome_str = rest
                
                # Remover percentual do texto do nome
                if percent_match:
                    nome_str = nome_str.replace(percent_match.group(0), '').strip()
                
                # Remover qualificação do texto do nome
                if qual:
                    nome_str = re.sub(re.escape(qual), '', nome_str, flags=re.IGNORECASE).strip()
                
                # Remover situação cadastral do texto do nome
                if sit != 'ATIVA':
                    nome_str = re.sub(sit, '', nome_str, flags=re.IGNORECASE).strip()
                
                # Remover "Cap. Social:" se presente
                nome_str = re.sub(r'Cap\.?\s*Social[:\s]*', '', nome_str, flags=re.IGNORECASE).strip()
                
                # Limpar espaços extras
                nome = re.sub(r'\s+', ' ', nome_str).strip()
                
                # Se não encontrou nome, tentar dividir por espaços (fallback)
                if not nome or len(nome) < 2:
                    parts = rest.split()
                    # Remover partes que são claramente percentuais, qualificações ou situações
                    filtered_parts = []
                    for part in parts:
                        if not re.match(r'^\d{1,3}[,\.]\d{2}%?$', part):  # Não é percentual
                            if part.upper() not in ['SÓCIO', 'ADMINISTRADOR', 'REGULAR', 'ATIVA', 'INAPTA', 'SUSPENSA', 'BAIXADA', 'CANCELADA', 'INATIVA']:
                                filtered_parts.append(part)
                    nome = ' '.join(filtered_parts).strip()
                
                # Se ainda não tem nome válido, usar a primeira parte que não é CPF/CNPJ
                if not nome or len(nome) < 2:
                    parts = rest.split()
                    if len(parts) > 0:
                        nome = parts[0]
                
                # ✅ NOVO: Verificar se o nome extraído não é apenas "Qualif. Resp."
                nome_limpo = nome.strip() if nome else ""
                if nome_limpo and "Qualif. Resp" not in nome_limpo and "Qualif Resp" not in nome_limpo:
                    out.append({
                        "CPF/CNPJ": id_val,
                        "Nome": nome_limpo,
                        "Qualificação": qual if qual else "",
                        "Situação Cadastral": sit,
                        "Cap. Social": f"{percent}%" if percent else "",
                        "Cap. Votante": ""
                    })
                    print(f"[Python Parse] ✅ Registro extraído (parsing flexível): {nome_limpo} - {id_val} - {percent}%", file=sys.stderr)
                else:
                    print(f"[Python Parse] ⚠️ Registro ignorado (nome inválido ou contém Qualif. Resp.): {nome_limpo}", file=sys.stderr)
                continue
            bad.append(r)
            continue

        d = m.groupdict()
        nome = d["nome"].strip()
        if d.get("suffix"):
            nome = (nome + " " + d["suffix"].strip()).strip()

        # Normalizar percentual (aceitar tanto , quanto .)
        cap_percent = d["cap"].replace(',', '.').replace('%', '')
        
        # ✅ NOVO: Verificar se o nome não contém "Qualif. Resp." antes de adicionar
        nome_limpo = nome.strip()
        if nome_limpo and "Qualif. Resp" not in nome_limpo and "Qualif Resp" not in nome_limpo:
            out.append({
                "CPF/CNPJ": d["id"],
                "Nome": nome_limpo,
                "Qualificação": d["qual"],
                "Situação Cadastral": d["sit"],
                "Cap. Social": f"{cap_percent}%",
                "Cap. Votante": d.get("vot", "").replace(',', '.').replace('%', '') if d.get("vot") else ""
            })
        else:
            print(f"[Python Parse] ⚠️ Registro ignorado (nome contém Qualif. Resp.): {nome_limpo}", file=sys.stderr)

    if bad:
        print("⚠️ Linhas não parseadas (verificar layout do PDF):", file=sys.stderr)
        for b in bad[:10]:
            print(f"- {b[:200]}", file=sys.stderr)

    return out

def isolate_socios_block_page1(text: str) -> str:
    idx = re.search(r'Sócios e Administradores', text, flags=re.IGNORECASE)
    if not idx:
        return ""
    sub = text[idx.start():]
    idx2 = re.search(r'CPF/CNPJ', sub, flags=re.IGNORECASE)
    if not idx2:
        return sub  # Retornar mesmo sem cabeçalho se encontrou a seção
    return sub[idx2.start():]

def isolate_socios_block_page2(text: str) -> str:
    m = cpfcnpj_line_re.search(text)
    if not m:
        return ""
    sub = text[m.start():]
    end = re.search(r'Certidão Emitida|CertidãoEmitida', sub, flags=re.IGNORECASE)
    if end:
        sub = sub[:end.start()]
    return sub

def extract_cnpj_from_pdf(text: str) -> str:
    """
    Extrai o CNPJ da empresa do texto do PDF.
    O CNPJ geralmente aparece no cabeçalho do documento.
    """
    # Padrões para encontrar CNPJ no PDF (em ordem de prioridade)
    # 1. "CNPJ: 00.000.000/0000-00" (mais específico)
    # 2. "CNPJ: 00000000000000" (formato sem pontuação)
    # 3. Qualquer padrão de CNPJ formatado no texto
    patterns = [
        r'CNPJ[:\s]+(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})',  # CNPJ: 00.000.000/0000-00
        r'CNPJ[:\s]+(\d{14})',  # CNPJ: 00000000000000
        r'CNPJ[:\s]*(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})',  # Mais flexível
    ]
    
    # Primeiro, tentar padrões específicos com "CNPJ:"
    for pattern in patterns[:2]:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            # Limpar e validar CNPJ (14 dígitos)
            cnpj_limpo = re.sub(r'\D', '', str(match))
            if len(cnpj_limpo) == 14:
                # Validar que começa com números válidos para CNPJ (0-9)
                if cnpj_limpo[0].isdigit():
                    return cnpj_limpo
    
    # Se não encontrou com "CNPJ:", tentar encontrar qualquer CNPJ formatado
    # (mas evitar pegar CNPJs de sócios)
    cnpj_formatado_pattern = r'\b(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\b'
    matches = re.findall(cnpj_formatado_pattern, text)
    
    # Buscar CNPJ que apareça nas primeiras linhas (geralmente no cabeçalho)
    first_lines = '\n'.join(text.split('\n')[:20])  # Primeiras 20 linhas
    for match in matches:
        if match in first_lines:
            cnpj_limpo = re.sub(r'\D', '', str(match))
            if len(cnpj_limpo) == 14 and cnpj_limpo[0].isdigit():
                return cnpj_limpo
    
    return ""

def extract_socios(pdf_path: str) -> tuple:
    """
    Extrai sócios e CNPJ do PDF.
    Retorna: (lista de sócios, CNPJ extraído)
    """
    import os
    
    # ✅ Log: Verificar arquivo
    if not os.path.exists(pdf_path):
        raise RuntimeError(f"Arquivo PDF não encontrado: {pdf_path}")
    
    file_size = os.path.getsize(pdf_path)
    print(f"[Python Extract] Processando PDF: {pdf_path} (tamanho: {file_size} bytes)", file=sys.stderr)
    
    pages = extract_text_pages(pdf_path)
    
    print(f"[Python Extract] Páginas extraídas: {len(pages)}", file=sys.stderr)
    print(f"[Python Extract] Tamanho do texto por página: {[len(p) for p in pages]}", file=sys.stderr)
    
    # Combinar todo o texto para extrair CNPJ
    full_text = "\n".join(pages)
    cnpj_extracted = extract_cnpj_from_pdf(full_text)
    
    print(f"[Python Extract] CNPJ extraído: {cnpj_extracted or 'não encontrado'}", file=sys.stderr)
    
    p1 = pages[0] if len(pages) > 0 else ""
    p2 = pages[1] if len(pages) > 1 else ""
    p3 = pages[2] if len(pages) > 2 else ""  # Alguns PDFs têm mais páginas

    block1 = isolate_socios_block_page1(p1)
    block2 = isolate_socios_block_page2(p2)
    block3 = isolate_socios_block_page2(p3) if p3 else ""  # Página 3 se houver

    print(f"[Python Extract] Blocos de sócios encontrados:", file=sys.stderr)
    print(f"  - Bloco 1 (Página 1): {len(block1)} caracteres", file=sys.stderr)
    print(f"  - Bloco 2 (Página 2): {len(block2)} caracteres", file=sys.stderr)
    print(f"  - Bloco 3 (Página 3): {len(block3)} caracteres", file=sys.stderr)

    rows1 = build_records(block1) if block1 else []
    rows2 = build_records(block2) if block2 else []
    rows3 = build_records(block3) if block3 else []

    print(f"[Python Extract] Registros brutos encontrados:", file=sys.stderr)
    print(f"  - Página 1: {len(rows1)} registros", file=sys.stderr)
    print(f"  - Página 2: {len(rows2)} registros", file=sys.stderr)
    print(f"  - Página 3: {len(rows3)} registros", file=sys.stderr)

    all_rows = rows1 + rows2 + rows3
    print(f"[Python Extract] Total de registros brutos: {len(all_rows)}", file=sys.stderr)
    
    # Remover duplicatas baseadas em CPF/CNPJ
    seen_ids = set()
    unique_rows = []
    for row in all_rows:
        m = cpfcnpj_start_re.match(row)
        if m:
            cpf_cnpj = m.group("id")
            if cpf_cnpj not in seen_ids:
                seen_ids.add(cpf_cnpj)
                unique_rows.append(row)
    
    print(f"[Python Extract] Registros únicos (após remoção de duplicatas): {len(unique_rows)}", file=sys.stderr)
    
    socios = parse_rows(unique_rows)
    
    print(f"[Python Extract] ✅ Sócios extraídos com sucesso: {len(socios)}", file=sys.stderr)
    for i, socio in enumerate(socios[:3], 1):  # Log apenas os 3 primeiros
        print(f"  {i}. {socio.get('Nome', 'N/A')} - {socio.get('CPF/CNPJ', 'N/A')} - {socio.get('Cap. Social', 'N/A')}", file=sys.stderr)
    if len(socios) > 3:
        print(f"  ... e mais {len(socios) - 3} sócios", file=sys.stderr)
    
    return socios, cnpj_extracted

def main():
    if len(sys.argv) < 2:
        error_msg = {"error": "Caminho do PDF não fornecido", "success": False}
        print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    if not os.path.exists(pdf_path):
        error_msg = {"error": f"Arquivo não encontrado: {pdf_path}", "success": False}
        print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    
    try:
        socios, cnpj_extracted = extract_socios(pdf_path)
        
        # Retornar JSON no stdout
        resultado = {
            "success": True,
            "socios": socios,
            "total": len(socios),
            "cnpj": cnpj_extracted
        }
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        error_msg = {"error": str(e), "success": False}
        print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

