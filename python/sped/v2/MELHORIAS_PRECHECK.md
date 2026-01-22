# Melhorias do Precheck - Mapeamento Inicial

## Análise do Precheck_XML_SPED_EFD.docx

### O que já está implementado ✅
1. Extração do registro 0000 (parcialmente)
   - ✅ NOME (Razão Social)
   - ✅ CNPJ
   - ✅ DT_INI (Competência)
   - ⚠️ DT_FIN (não validado)
   - ❌ UF (não extraído)
   - ⚠️ IND_PERFIL (extraído mas não usado corretamente)
   - ❌ IND_ATIV (não extraído)

2. Detecção de flags operacionais
   - ✅ ST (do SPED)
   - ✅ DIFAL (do SPED)
   - ✅ FCP (do SPED)
   - ✅ Interestadual (do SPED)
   - ❌ Flags dos XMLs (não implementado)

3. Inferência de segmento
   - ✅ Baseada em CFOPs
   - ❌ Baseada em IND_ATIV (não implementado)

### O que precisa ser implementado ❌

#### 1. Extração completa do registro 0000
- [ ] Extrair UF (posição 8 após split)
- [ ] Extrair IND_PERFIL (posição 14 - já extraído como regime)
- [ ] Extrair IND_ATIV (posição 15 - tipo de atividade)
- [ ] Validar DT_FIN no mesmo mês de DT_INI

#### 2. Mapeamento IND_ATIV → Segmento
- [ ] 0 = Industrial → INDUSTRIA
- [ ] 1 = Outros (comércio/serviços) → COMERCIO
- [ ] 2 = Outros → COMERCIO (default)

#### 3. Detecção de flags dos XMLs
- [ ] ST: vICMSST, vBCST > 0
- [ ] DIFAL: ICMSUFDest presente
- [ ] FCP: vFCP, vFCPST, vFCPUFDest > 0
- [ ] Interestadual: emit.UF != dest.UF ou idDest em {2,3}

#### 4. UI/UX - Fonte e Confiança
- [ ] Mostrar fonte ao lado de cada campo (SPED|0000, XML|emit, Cadastro)
- [ ] Mostrar nível de confiança (Alta, Média, Baixa)
- [ ] Alertar quando houver inconsistência (ex: Segmento ≠ IND_ATIV)

#### 5. Persistência de perfil por competência
- [ ] Tabela perfil_competencia (CNPJ, competencia, ind_perfil, ind_ativ, flags, fonte, hash)

