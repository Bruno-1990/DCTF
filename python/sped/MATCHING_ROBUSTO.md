# Sistema de Matching Robusto XML ↔ SPED

## Visão Geral

Este documento descreve o sistema de matching robusto implementado para vincular itens do XML com registros C170 do SPED, mesmo quando o `NUM_ITEM` não corresponde ou há diferenças na estrutura dos dados.

## Arquivos Criados/Modificados

### 1. `match_items_robusto.py` (NOVO)
Módulo principal que implementa o sistema de matching multi-critério.

**Principais Funções:**

- **`match_item_xml_sped_robusto()`**: Matching robusto de item XML com C170 usando múltiplos critérios
- **`inferir_cfop_cst_do_sped()`**: Infere CFOP/CST para itens do XML baseado na classificação existente no SPED
- **`parse_efd_0200()`**: Parseia cadastro 0200 do SPED para mapear COD_ITEM → NCM
- **`similaridade_texto()`**: Calcula similaridade entre descrições usando SequenceMatcher
- **`extrair_ncm_de_cod_item()`**: Tenta extrair NCM de COD_ITEM (pode ser código interno ou NCM direto)

### 2. `validators_solucoes.py` (MODIFICADO)
Função `cruzar_item_item_xml_sped()` foi melhorada para suportar matching robusto.

**Novos Parâmetros:**
- `efd_txt`: Caminho do arquivo SPED para parsear 0200 (opcional)
- `c100_info`: Informações do C100 (opcional)
- `usar_matching_robusto`: Flag para habilitar matching robusto (padrão: True)

**Novo Campo no Retorno:**
- `matches_robustos`: Lista com informações sobre matches robustos realizados

## Estratégia de Matching (6 Camadas)

### CAMADA 1 - Match Exato por NUM_ITEM
- **Critério**: NUM_ITEM do XML = NUM_ITEM do C170
- **Score**: 100 pontos
- **Confiança**: ALTA
- **Uso**: Match perfeito quando os números de item correspondem

### CAMADA 2 - Match por NCM + Quantidade + Valor Unitário
- **Critérios**:
  - NCM do XML = NCM extraído do COD_ITEM do C170 (ou do 0200)
  - Quantidade similar (tolerância 1%)
  - Valor unitário similar (tolerância 2%)
- **Score**: 90-95 pontos
- **Confiança**: ALTA
- **Uso**: Quando NUM_ITEM não corresponde mas produto, quantidade e valor são consistentes

### CAMADA 3 - Match por Descrição (Fuzzy) + NCM
- **Critérios**:
  - Descrição similar (fuzzy match > 85%)
  - NCM igual
- **Score**: 80-90 pontos
- **Confiança**: ALTA
- **Uso**: Quando descrição é similar e NCM confirma que é o mesmo produto

### CAMADA 4 - Match por Cadastro 0200
- **Critérios**:
  - COD_ITEM do C170 existe no cadastro 0200
  - NCM do 0200 = NCM do XML
- **Score**: 85 pontos
- **Confiança**: ALTA
- **Uso**: Quando COD_ITEM é código interno mas 0200 tem o NCM correspondente

### CAMADA 5 - Match por Descrição + Quantidade
- **Critérios**:
  - Descrição similar (fuzzy match > 80%)
  - Quantidade similar (tolerância 1%)
- **Score**: 70-80 pontos
- **Confiança**: MÉDIA
- **Uso**: Quando não há NCM disponível mas descrição e quantidade são consistentes

### CAMADA 6 - Match por Valor Total + CFOP/CST
- **Critérios**:
  - Valor total similar (tolerância 5%)
  - CFOP/CST iguais (bônus de 5 pontos cada)
- **Score**: 60-70 pontos
- **Confiança**: BAIXA
- **Uso**: Último recurso quando outros critérios não funcionam

## Estratégia de Inferência de CFOP/CST (7 Camadas)

### 1. BUSCA POR NCM + FORNECEDOR (COD_PART)
- Buscar C170 com mesmo NCM e mesmo COD_PART do C100
- Se encontrar múltiplos, usar o mais frequente
- **Confiança**: 95%

### 2. BUSCA POR NCM + DESCRIÇÃO SIMILAR
- Buscar C170 com mesmo NCM e descrição similar (fuzzy > 85%)
- **Confiança**: 90%

### 3. BUSCA POR CADASTRO 0200
- Se COD_ITEM do C170 existe no 0200
- Buscar NCM no 0200 e comparar com NCM do XML
- **Confiança**: 85%

### 4. BUSCA NO MESMO C100
- Buscar outros C170 do mesmo C100 (mesma NF)
- Usar CFOP/CST mais frequente
- **Confiança**: 75%

### 5. BUSCA POR REGRAS DO SETOR
- Verificar regras do setor para CFOP/CST esperados
- **Confiança**: 70%

### 6. BUSCA HISTÓRICA (outros C100s)
- Buscar em outros C100s do mesmo período
- **Confiança**: 65%

### 7. FALLBACK: Usar CFOP/CST do XML
- Se nenhuma inferência funcionou
- **Confiança**: 50%

## Tolerâncias Configuradas

- **Quantidade**: 1% (`TOL_QUANTIDADE = 0.01`)
- **Valor Unitário**: 2% (`TOL_VALOR_UNITARIO = 0.02`)
- **Valor Total**: 5% (`TOL_VALOR_TOTAL = 0.05`)

## Limiares de Score

- **SCORE_MINIMO_MATCH**: 60.0 (mínimo para considerar match válido)
- **SCORE_MEDIA_CONFIANCA**: 70.0
- **SCORE_ALTA_CONFIANCA**: 85.0

## Benefícios

1. **Robustez**: Funciona mesmo quando NUM_ITEM não corresponde
2. **Inteligência**: Usa múltiplos critérios para garantir match correto
3. **Inferência**: Infere CFOP/CST do SPED quando item não está classificado
4. **Confiança**: Fornece score de confiança para cada match
5. **Rastreabilidade**: Detalhes completos sobre como o match foi realizado

## Uso

O matching robusto é habilitado por padrão na função `cruzar_item_item_xml_sped()`. Para desabilitar:

```python
cruzamento = cruzar_item_item_xml_sped(
    xml_items, c170_items, campo, rules,
    usar_matching_robusto=False
)
```

Para usar com informações adicionais:

```python
cruzamento = cruzar_item_item_xml_sped(
    xml_items, c170_items, campo, rules,
    efd_txt=efd_txt,  # Para parsear 0200
    c100_info=c100_info,  # Para inferência por fornecedor
    usar_matching_robusto=True
)
```

## Exemplo de Retorno

```python
{
    "itens_faltantes_sped": [
        {
            "nItem": "1",
            "CFOP": "5102",
            "CST": "000",
            "CFOP_INFERIDO": "5102",  # Inferido do SPED
            "CST_INFERIDO": "000",     # Inferido do SPED
            "CONFIANCA_CFOP_CST": 95.0,
            ...
        }
    ],
    "matches_robustos": [
        {
            "nItem": "2",
            "tipo_match": "ncm_qtd",
            "score": 92.5,
            "confianca": "ALTA",
            "detalhes": {
                "camada": 2,
                "criterio": "NCM + Quantidade + Valor Unitário",
                ...
            }
        }
    ],
    ...
}
```

## Notas Técnicas

- O matching robusto é executado apenas quando o match por NUM_ITEM falha
- O cadastro 0200 é parseado apenas uma vez por validação (cache implícito)
- Fuzzy matching usa `difflib.SequenceMatcher` (biblioteca padrão Python)
- Normalização de texto remove acentos, converte para maiúsculas e remove caracteres especiais

