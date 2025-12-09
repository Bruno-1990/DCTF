# Validação de Índices do SPED Fiscal

Este documento valida a indexação correta dos campos do SPED Fiscal de acordo com o layout oficial.

## Importante: Formato do SPED

O SPED Fiscal usa o formato pipe-delimited (separado por `|`). Quando fazemos `split("|")`:
- `fs[0]` = "" (string vazia antes do primeiro `|`)
- `fs[1]` = Nome do registro (ex: "C100", "C190", "0000")
- `fs[2]` = Primeiro campo de dados
- `fs[3]` = Segundo campo de dados
- etc.

## Registros Validados

### Registro 0000 (Abertura do Arquivo Digital)
**Layout Oficial:**
- Posição 1: REG (sempre "0000")
- Posição 2: COD_VER
- Posição 3: COD_FIN
- Posição 4: DT_INI
- Posição 5: DT_FIN
- Posição 6: NOME
- Posição 7: CNPJ

**Código Atual:**
```python
fs[4] = DT_INI  ✓ CORRETO
fs[5] = DT_FIN  ✓ CORRETO
fs[6] = NOME    ✓ CORRETO
fs[7] = CNPJ    ✓ CORRETO
```

### Registro C100 (Documento Fiscal)
**Layout Oficial (EFD-ICMS/IPI):**
- Posição 1: REG (sempre "C100")
- Posição 2: IND_OPER
- Posição 3: IND_EMIT
- Posição 4: COD_PART
- Posição 5: COD_MOD
- Posição 6: COD_SIT
- Posição 7: SER
- Posição 8: NUM_DOC
- Posição 9: CHV_NFE
- Posição 10: DT_DOC
- Posição 11: DT_E_S
- Posição 12: VL_DOC
- Posição 13: IND_PGTO
- Posição 14: VL_DESC
- Posição 15: VL_ABAT_NT
- Posição 16: VL_MERC
- Posição 17: IND_FRT
- Posição 18: VL_FRT
- Posição 19: VL_SEG
- Posição 20: VL_OUT_DA
- Posição 21: VL_BC_ICMS
- Posição 22: VL_ICMS
- Posição 23: VL_BC_ICMS_ST
- Posição 24: VL_ICMS_ST
- Posição 25: VL_IPI
- Posição 26: VL_PIS
- Posição 27: VL_COFINS

**Código Atual:**
```python
fs[2] = IND_OPER      ✓ CORRETO
fs[3] = IND_EMIT     ✓ CORRETO
fs[4] = COD_PART     ✓ CORRETO
fs[5] = COD_MOD      ✓ CORRETO
fs[6] = COD_SIT      ✓ CORRETO
fs[7] = SER          ✓ CORRETO
fs[8] = NUM_DOC      ✓ CORRETO
fs[9] = CHV_NFE      ✓ CORRETO
fs[10] = DT_DOC      ✓ CORRETO
fs[11] = DT_E_S      ✓ CORRETO
fs[12] = VL_DOC      ✓ CORRETO
fs[13] = IND_PGTO    ✓ CORRETO
fs[14] = VL_DESC     ✓ CORRETO
fs[15] = VL_ABAT_NT  ✓ CORRETO
fs[16] = VL_MERC     ✓ CORRETO
fs[17] = IND_FRT     ✓ CORRETO
fs[18] = VL_FRT      ✓ CORRETO
fs[19] = VL_SEG      ✓ CORRETO
fs[20] = VL_OUT_DA    ✓ CORRETO
fs[21] = VL_BC_ICMS  ✓ CORRETO
fs[22] = VL_ICMS     ✓ CORRETO
fs[23] = VL_BC_ICMS_ST ✓ CORRETO
fs[24] = VL_ICMS_ST   ✓ CORRETO
fs[25] = VL_IPI       ✓ CORRETO
fs[26] = VL_PIS      ✓ CORRETO
fs[27] = VL_COFINS   ✓ CORRETO
```

### Registro C190 (Regime de Apuração do ICMS)
**Layout Oficial:**
- Posição 1: REG (sempre "C190")
- Posição 2: CST_ICMS
- Posição 3: CFOP
- Posição 4: VL_OPR
- Posição 5: VL_BC_ICMS
- Posição 6: VL_ICMS
- Posição 7: VL_BC_ICMS_ST
- Posição 8: VL_ICMS_ST
- Posição 9: VL_RED_BC
- Posição 10: COD_OBS
- Posição 11: VL_IPI

**Código Atual:**
```python
fs[2] = CST_ICMS      ✓ CORRETO
fs[6] = VL_BC_ICMS    ✓ CORRETO (posição 5 no layout = índice 6)
fs[7] = VL_ICMS       ✓ CORRETO (posição 6 no layout = índice 7)
fs[8] = VL_BC_ICMS_ST ✓ CORRETO (posição 7 no layout = índice 8)
fs[9] = VL_ICMS_ST    ✓ CORRETO (posição 8 no layout = índice 9)
fs[11] = VL_IPI       ✓ CORRETO (posição 11 no layout = índice 11)
```

**ATENÇÃO:** O código está pulando fs[3], fs[4], fs[5], fs[10] que são CFOP, VL_OPR, VL_RED_BC, COD_OBS respectivamente. Isso pode estar correto se não precisarmos desses campos, mas devemos documentar.

### Registro D100 (Documento Fiscal de Transporte)
**Layout Oficial:**
- Posição 1: REG (sempre "D100")
- Posição 2: IND_OPER
- Posição 3: COD_PART
- Posição 4: COD_MOD
- Posição 5: COD_SIT
- Posição 6: SER
- Posição 7: NUM_DOC
- Posição 8: CHV_CTE
- Posição 9: DT_DOC
- Posição 10: DT_A_P
- Posição 11: TP_CT-e
- Posição 12: CHV_CTE_REF
- Posição 13: VL_DOC
- Posição 14: VL_DESC
- Posição 15: IND_FRT
- Posição 16: VL_SERV
- Posição 17: VL_BC_ICMS
- Posição 18: VL_ICMS
- Posição 19: VL_NT
- Posição 20: COD_INF
- Posição 21: COD_CTA

**Código Atual:**
```python
fs[2] = IND_OPER      ✓ CORRETO
fs[7] = SER          ✓ CORRETO (posição 6 no layout = índice 7)
fs[9] = NUM_DOC      ✓ CORRETO (posição 7 no layout = índice 9) - ERRO! Deveria ser fs[7]
fs[10] = CHV_CTE     ✓ CORRETO (posição 8 no layout = índice 10) - ERRO! Deveria ser fs[8]
fs[15] = VL_DOC      ✓ CORRETO (posição 13 no layout = índice 15)
fs[18] = VL_SERV     ✓ CORRETO (posição 16 no layout = índice 18)
fs[19] = VL_BC_ICMS  ✓ CORRETO (posição 17 no layout = índice 19)
fs[20] = VL_ICMS     ✓ CORRETO (posição 18 no layout = índice 20)
```

**PROBLEMA ENCONTRADO:** D100 está usando índices incorretos para SER, NUM_DOC e CHV_CTE!

