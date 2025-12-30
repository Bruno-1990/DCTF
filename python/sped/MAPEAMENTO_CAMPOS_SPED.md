# Mapeamento de Campos SPED - C100, C170, C190

Este documento mapeia os campos dos registros SPED mais importantes para correções.

## Estrutura Geral

Todos os registros SPED usam o formato pipe-separated (`|`):
- A linha sempre começa com `|`
- Após o `split("|")`, o primeiro elemento (`parts[0]`) é **vazio** (string vazia)
- O segundo elemento (`parts[1]`) é o **tipo de registro** (C100, C170, C190, etc.)

## C100 - Documento Fiscal

**Formato exemplo:**
```
|C100|0|1|000083090|55|00|005|161374|35250939881307000184550050001613741142384750|17092025|09102025|78,1|2|0|0|78,12|0|0|0|0|0|0|0|0|||||
```

**Mapeamento após `split("|")`:**
- `parts[0]` = `""` (vazio - linha começa com |)
- `parts[1]` = `"C100"` (tipo de registro)
- `parts[2]` = `"0"` (IND_OPER)
- `parts[3]` = `"1"` (IND_EMIT)
- `parts[4]` = `"000083090"` (COD_PART)
- `parts[5]` = `"55"` (COD_MOD)
- `parts[6]` = `"00"` (COD_SIT)
- `parts[7]` = `"005"` (SER)
- `parts[8]` = `"161374"` (NUM_DOC)
- **`parts[9]` = `"35250939881307000184550050001613741142384750"` (CHV_NFE) ⭐ CHAVE DA NF**
- `parts[10]` = `"17092025"` (DT_DOC)
- `parts[11]` = `"09102025"` (DT_E_S)
- ... (outros campos)

**Campos importantes:**
- **CHV_NFE (Chave da NF)**: `parts[9]` - usado para encontrar C100 pela chave
- **DT_DOC**: `parts[10]` - data do documento
- **VL_DOC**: `parts[15]` - valor do documento

---

## C170 - Itens do Documento Fiscal

**Formato exemplo:**
```
|C170|1|34||1|UN|39,05|0|0|090|2556|2101|0|0|0|0|0|0||||0|0|0||||
```

**Mapeamento após `split("|")`:**
- `parts[0]` = `""` (vazio)
- `parts[1]` = `"C170"` (tipo de registro)
- `parts[2]` = `"1"` (NUM_ITEM)
- `parts[3]` = `"34"` (COD_ITEM)
- `parts[4]` = `""` (COD_DESCR - pode estar vazio)
- `parts[5]` = `"1"` (QTD)
- `parts[6]` = `"UN"` (UNID)
- `parts[7]` = `"39,05"` (VL_ITEM)
- `parts[8]` = `"0"` (VL_DESC)
- `parts[9]` = `"0"` (IND_MOV)
- **`parts[10]` = `"090"` (CST_ICMS) ⭐ CST**
- **`parts[11]` = `"2556"` (CFOP) ⭐ CFOP**
- `parts[12]` = `"2101"` (CST_IPI)
- `parts[13]` = `"0"` (VL_BC_ICMS)
- `parts[14]` = `"0"` (VL_ICMS)
- `parts[15]` = `"0"` (VL_BC_ICMS_ST)
- `parts[16]` = `"0"` (VL_ICMS_ST)
- ... (outros campos)

**Campos importantes:**
- **CST_ICMS**: `parts[10]` - Código de Situação Tributária
- **CFOP**: `parts[11]` - Código Fiscal de Operações e Prestações
- **VL_BC_ICMS_ST**: `parts[15]` - Base de Cálculo do ICMS ST
- **VL_ICMS_ST**: `parts[16]` - Valor do ICMS ST

---

## C190 - Resumo por CFOP/CST

**Formato exemplo:**
```
|C190|090|2556|0|78,1|0|0|0|0|0|0||
```

**Mapeamento após `split("|")`:**
- `parts[0]` = `""` (vazio)
- `parts[1]` = `"C190"` (tipo de registro)
- **`parts[2]` = `"090"` (CST_ICMS) ⭐ CST**
- **`parts[3]` = `"2556"` (CFOP) ⭐ CFOP**
- `parts[4]` = `"0"` (ALIQ_ICMS)
- `parts[5]` = `"78,1"` (VL_OPR)
- `parts[6]` = `"0"` (VL_BC_ICMS)
- `parts[7]` = `"0"` (VL_ICMS)
- `parts[8]` = `"0"` (VL_BC_ICMS_ST) ⭐ BC ST
- `parts[9]` = `"0"` (VL_ICMS_ST) ⭐ ICMS ST
- `parts[10]` = `"0"` (VL_RED_BC)
- `parts[11]` = `"0"` (VL_IPI)
- `parts[12]` = `""` (COD_OBS)
- ... (outros campos podem estar vazios)

**Campos importantes:**
- **CST_ICMS**: `parts[2]` - Código de Situação Tributária ⭐
- **CFOP**: `parts[3]` - Código Fiscal de Operações e Prestações ⭐
- **VL_BC_ICMS_ST**: `parts[8]` - Base de Cálculo do ICMS ST (campo "BC ST")
- **VL_ICMS_ST**: `parts[9]` - Valor do ICMS ST (campo "ICMS ST")
- **VL_BC_ICMS**: `parts[6]` - Base de Cálculo do ICMS
- **VL_ICMS**: `parts[7]` - Valor do ICMS
- **VL_IPI**: `parts[11]` - Valor do IPI

---

## Exemplo Completo de Bloco C100

```
|C100|0|1|000083090|55|00|005|161374|35250939881307000184550050001613741142384750|17092025|09102025|78,1|2|0|0|78,12|0|0|0|0|0|0|0|0|||||
|C170|1|34||1|UN|39,05|0|0|090|2556|2101|0|0|0|0|0|0||||0|0|0||||
|C170|1|34||2|UN|157,8|0|0|090|2556|2101|0|0|0|00|0||||00|0||||||||||||||0|
|C190|090|2556|0|78,1|0|0|0|0|0|0||
|C195|12||
```

**Estrutura do bloco:**
1. **C100** - Cabeçalho do documento (contém CHV_NFE em `parts[9]`)
2. **C170** - Itens do documento (pode ter múltiplos, cada um com CFOP/CST em `parts[11]`/`parts[10]`)
3. **C190** - Resumo por CFOP/CST (agrupa os C170, tem CFOP/CST em `parts[3]`/`parts[2]`)
4. **C195** - Observações (marca fim do bloco)

---

## Função `split_sped_line()`

A função `split_sped_line()` faz o split por `|` e garante que:
- Linhas que não terminam com `|` recebem um `|` no final
- Retorna uma lista de strings, onde `parts[0]` é sempre vazio

**Exemplo:**
```python
line = "|C190|090|2556|0|78,1|0|0|0|0|0|0||"
parts = split_sped_line(line)
# parts[0] = ""
# parts[1] = "C190"
# parts[2] = "090"  # CST
# parts[3] = "2556" # CFOP
# parts[4] = "0"
# parts[5] = "78,1"
# ...
```

---

## Estratégia de Busca de CFOP/CST para C190

Quando precisamos corrigir um C190 mas não temos CFOP/CST:

1. **CAMADA 1**: Buscar C100 pela chave da NF → Buscar C170 no bloco → Extrair CFOP/CST do C170
2. **CAMADA 2**: Se não encontrou C170 → Buscar C190 no bloco do C100 → Extrair CFOP/CST do C190
3. **CAMADA 3**: Se não encontrou C100 → Buscar C170 diretamente pela chave
4. **CAMADA 4**: Buscar C190 com campo zerado → Extrair CFOP/CST desse C190
5. **CAMADA 5**: Buscar qualquer C190 próximo ao C100

**Importante**: Sempre usar `parts[2]` para CST e `parts[3]` para CFOP em C190!

---

## Campos de C190 que podem ser corrigidos

| Campo | Nome | Posição | Exemplo |
|-------|------|---------|---------|
| VL_BC_ICMS | Base de Cálculo ICMS | `parts[6]` | `208,22` |
| VL_ICMS | Valor ICMS | `parts[7]` | `14,58` |
| VL_BC_ICMS_ST | Base de Cálculo ICMS ST (BC ST) | `parts[8]` | `325,22` |
| VL_ICMS_ST | Valor ICMS ST | `parts[9]` | `0,00` |
| VL_IPI | Valor IPI | `parts[11]` | `0,00` |

---

## Notas Importantes

1. **Sempre usar `strip()`** antes de comparar ou usar valores
2. **Sempre verificar `len(parts) > N`** antes de acessar `parts[N]`
3. **CST pode ter 2 ou 3 dígitos** - normalizar com `zfill(3)` ou função `normalize_cst_for_compare()`
4. **CFOP pode ter espaços** - remover todos com `"".join(cfop.split())`
5. **Linhas podem ter espaços no início** - sempre usar `line.strip()` antes de `startswith()`

