# Análise: Comparação do Código Python Fornecido vs. Script Atual

## ❌ Problemas Identificados no Código Fornecido

### 1. **PDF_PATH Hardcoded (Crítico)**
```python
# ❌ Código fornecido:
PDF_PATH = r"/mnt/data/situacao-fiscal-05595540000189.pdf"

# ✅ Script atual:
pdf_path = sys.argv[1]  # Aceita como argumento de linha de comando
```
**Problema**: Não permite processar PDFs diferentes dinamicamente.

---

### 2. **Falta Extração de CNPJ (Crítico)**
```python
# ❌ Código fornecido: Não extrai CNPJ

# ✅ Script atual: Tem função extract_cnpj_from_pdf()
def extract_cnpj_from_pdf(text: str) -> str:
    """Extrai o CNPJ da empresa do texto do PDF."""
    # ... implementação completa
```
**Problema**: O Node.js precisa do CNPJ extraído do PDF para identificar o cliente.

---

### 3. **Não Retorna JSON no Formato Esperado (Crítico)**
```python
# ❌ Código fornecido:
def main():
    socios = extract_socios(PDF_PATH)
    # Gera arquivo .md
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

# ✅ Script atual:
def main():
    socios, cnpj_extracted = extract_socios(pdf_path)
    resultado = {
        "success": True,
        "socios": socios,
        "total": len(socios),
        "cnpj": cnpj_extracted
    }
    print(json.dumps(resultado, ensure_ascii=False))  # Retorna JSON no stdout
```
**Problema**: O Node.js espera JSON no stdout, não um arquivo .md.

---

### 4. **Regex Mais Restritivo para Percentual**
```python
# ❌ Código fornecido:
r'(?P<cap>\d{1,3},\d{2}%)'  # Aceita apenas vírgula

# ✅ Script atual:
r'(?P<cap>\d{1,3}[,\.]\d{2}%)'  # Aceita vírgula OU ponto
```
**Problema**: Alguns PDFs podem ter percentuais com ponto ao invés de vírgula.

---

### 5. **Qualificações Mais Restritivas**
```python
# ❌ Código fornecido:
r'(?P<qual>SÓCIO(?:-ADMINISTRADOR)?)\s+'  # Apenas 2 variações

# ✅ Script atual:
r'(?P<qual>SÓCIO(?:-ADMINISTRADOR)?|ADMINISTRADOR|QUOTISTA|TITULAR|PROPRIETÁRIO|CONDÔMINO|COTISTA)\s+'
```
**Problema**: Não captura outras qualificações comuns.

---

### 6. **Situações Cadastrais Mais Restritivas**
```python
# ❌ Código fornecido:
r'(?P<sit>REGULAR|ATIVA)\s+'  # Apenas 2 variações

# ✅ Script atual:
r'(?P<sit>REGULAR|ATIVA|INAPTA|SUSPENSA|BAIXADA|CANCELADA|INATIVA)\s+'
```
**Problema**: Não captura outras situações cadastrais possíveis.

---

### 7. **Não Processa Página 3+**
```python
# ❌ Código fornecido:
p1 = pages[0] if len(pages) > 0 else ""
p2 = pages[1] if len(pages) > 1 else ""
# Apenas 2 páginas

# ✅ Script atual:
p1 = pages[0] if len(pages) > 0 else ""
p2 = pages[1] if len(pages) > 1 else ""
p3 = pages[2] if len(pages) > 2 else ""  # Página 3 também
```
**Problema**: Alguns PDFs podem ter sócios na página 3 ou posterior.

---

### 8. **Não Remove Duplicatas**
```python
# ❌ Código fornecido:
return parse_rows(rows1) + parse_rows(rows2)  # Pode ter duplicatas

# ✅ Script atual:
# Remove duplicatas baseadas em CPF/CNPJ
seen_ids = set()
unique_rows = []
for row in all_rows:
    # ... lógica de remoção de duplicatas
```
**Problema**: Pode retornar sócios duplicados se aparecerem em múltiplas páginas.

---

### 9. **Tratamento de Erro Inadequado**
```python
# ❌ Código fornecido:
def main():
    socios = extract_socios(PDF_PATH)
    # Não tem tratamento de erro adequado
    # Não retorna JSON de erro para Node.js

# ✅ Script atual:
def main():
    try:
        socios, cnpj_extracted = extract_socios(pdf_path)
        # Retorna JSON de sucesso
    except Exception as e:
        error_msg = {"error": str(e), "success": False}
        print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
```
**Problema**: O Node.js precisa de JSON de erro para tratar falhas adequadamente.

---

### 10. **Função extract_socios Retorna Formato Diferente**
```python
# ❌ Código fornecido:
def extract_socios(pdf_path: str) -> list[dict]:
    # Retorna apenas lista de sócios
    return parse_rows(rows1) + parse_rows(rows2)

# ✅ Script atual:
def extract_socios(pdf_path: str) -> tuple:
    # Retorna (lista de sócios, CNPJ extraído)
    return socios, cnpj_extracted
```
**Problema**: O Node.js precisa do CNPJ extraído também.

---

### 11. **Falta Verificação de Existência do Arquivo**
```python
# ❌ Código fornecido:
# Não verifica se o arquivo existe antes de processar

# ✅ Script atual:
if not os.path.exists(pdf_path):
    error_msg = {"error": f"Arquivo não encontrado: {pdf_path}", "success": False}
    print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
```

---

### 12. **Falta Parsing Flexível para Casos Especiais**
```python
# ❌ Código fornecido:
m = row_parse_re.match(r)
if not m:
    bad.append(r)  # Apenas adiciona à lista de "bad"
    continue

# ✅ Script atual:
m = row_parse_re.match(r)
if not m:
    # Tentar parsing mais flexível
    m_flex = cpfcnpj_start_re.match(r)
    if m_flex:
        # Extrair informações básicas mesmo sem match completo
        # ... lógica de fallback
```
**Problema**: Pode perder dados válidos que não seguem o formato padrão exato.

---

## ✅ Recomendação

**O script atual (`extract_socios_api.py`) está mais completo e corrigido.** Ele:
- ✅ Aceita PDF como argumento de linha de comando
- ✅ Extrai CNPJ do PDF automaticamente
- ✅ Retorna JSON no formato esperado pelo Node.js
- ✅ Aceita mais variações de qualificações e situações cadastrais
- ✅ Processa até página 3
- ✅ Remove duplicatas
- ✅ Tem tratamento de erro adequado
- ✅ Tem parsing flexível para casos especiais
- ✅ Aceita vírgula OU ponto no percentual

**Conclusão**: Manter o script atual (`extract_socios_api.py`) e não substituir pelo código fornecido.


