# Layout S-5002 - Imposto de Renda Retido na Fonte por Trabalhador (eSocial)

Documentação extraída do XSD oficial `S-5002_evtIrrfBenef.xsd`. Referência: Manual de Orientação do eSocial, eventos S-1210/S-5002.

**Namespace do evento:** `http://www.esocial.gov.br/schema/evt/evtIrrfBenef/v_S_01_03_00`

**Envelope dos XMLs de retorno:** `retornoEventoCompleto > evento > eSocial > evtIrrfBenef`

---

## 1. evtIrrfBenef (raiz do evento)

- **Descrição:** Evento IRRF por Trabalhador. Imposto de Renda Retido na Fonte por Trabalhador.
- **Atributo:** `Id` (TS_Id_retorno) – identificador único do evento.

---

## 2. ideEvento

Identificação do evento de retorno. CHAVE_GRUPO: perApur.

| Tag | Tipo | Ocorrência | Documentação |
|-----|------|------------|--------------|
| nrRecArqBase | TS_nrRecibo | 1 | Número do recibo do arquivo que deu origem ao presente arquivo de retorno. Deve corresponder ao recibo de um arquivo com informações de rendimentos sujeitos a IRRF (S-1210 ou S-3000). |
| perApur | TS_perApur_mensal | 1 | Mês/ano (formato AAAA-MM) de referência das informações. |

---

## 3. ideEmpregador

Tipo: T_ideEmpregador (referenciado no XSD).

| Tag | Descrição |
|-----|-----------|
| tpInsc | Tipo de inscrição (1 = CNPJ, 2 = CPF). |
| nrInsc | Número de inscrição (CNPJ ou CPF do empregador). |

---

## 4. ideTrabalhador

Identificação do beneficiário. CHAVE_GRUPO: cpfBenef.

| Tag | Tipo | Ocorrência | Documentação |
|-----|------|------------|--------------|
| cpfBenef | TS_cpf | 1 | CPF do beneficiário do pagamento. Origem: S-1210. |
| dmDev | (complexType) | 0..n | Informações do demonstrativo de valores devidos. |
| totInfoIR | (complexType) | 0..1 | Totalizador consolidado (consolidApurMen). |
| infoIRComplem | (complexType) | 0..1 | Informações complementares (dependentes, plano de saúde). |

---

## 5. dmDev (dentro de ideTrabalhador)

Informações do demonstrativo de valores devidos. CHAVE_GRUPO: perRef, ideDmDev, tpPgto. Condição: OC.

| Tag | Tipo | Ocorrência | Documentação |
|-----|------|------------|--------------|
| perRef | TS_perApur | 1 | Período de referência (AAAA-MM ou AAAA para 13º). Origem: S-1210. |
| ideDmDev | TS_codigo_esocial | 1 | Identificador do demonstrativo atribuído pela fonte pagadora. |
| tpPgto | byte | 1 | Evento de origem: 1=S-1200, 2=S-2299, 3=S-2399, 4=S-1202, 5=S-1207. |
| dtPgto | date | 1 | Data de pagamento. |
| codCateg | TS_codCateg | 1 | Código da categoria do trabalhador (Tabela 01). |
| infoIR | (complexType) | 0..999 | Rendimentos tributáveis, deduções, isenções e retenções. CHAVE_GRUPO: tpInfoIR. |
| totApurMen | (complexType) | 0..50 | Totalizador por CR mensal. CHAVE_GRUPO: CRMen. |

---

## 6. infoIR (dentro de dmDev)

Rendimentos tributáveis, deduções, isenções e retenções do IRRF.

| Tag | Tipo | Ocorrência | Documentação |
|-----|------|------------|--------------|
| tpInfoIR | (enumeração) | 1 | Código do tipo de valor (ver tabela tpInfoIR abaixo). |
| valor | TS_valor | 1 | Valor da verba. Composição conforme tpInfoIR. |
| descRendimento | string(1..100) | 0..1 | Descrição do rendimento não tributável (obrigatório se tpInfoIR=79 em certas condições). |
| infoProcJudRub | (complexType) | 0..n | Informações de processo judicial (exigibilidade suspensa). |

---

## 7. totApurMen (dentro de dmDev)

Totalizador dos rendimentos com período de apuração mensal. CHAVE_GRUPO: CRMen.

| Tag | Tipo | Documentação |
|-----|------|--------------|
| CRMen | TS_CRMen | Código de Receita mensal. |
| vlrRendTrib | TS_valor | Rendimento tributável mensal e férias. |
| vlrRendTrib13 | TS_valor | Rendimento do 13º salário. |
| vlrPrevOficial | TS_valor | Previdência oficial – mensal e férias. |
| vlrPrevOficial13 | TS_valor | Previdência oficial – 13º. |
| vlrCRMen | TS_valor | IR retido – mensal e férias. |
| vlrCR13Men | TS_valor | IR retido – 13º. |
| vlrParcIsenta65 | TS_valor | Parcela isenta 65 anos. |
| vlrParcIsenta65Dec | TS_valor | Parcela isenta 65 anos – 13º. |
| vlrDiarias | TS_valor | Diárias. |
| vlrAjudaCusto | TS_valor | Ajuda de custo. |
| vlrIndResContrato | TS_valor | Indenização/rescisão. |
| vlrAbonoPec | TS_valor | Abono pecuniário. |
| vlrRendMoleGrave | TS_valor | Moléstia grave – mensal. |
| vlrRendMoleGrave13 | TS_valor | Moléstia grave – 13º. |
| vlrAuxMoradia | TS_valor | Auxílio moradia. |
| vlrBolsaMedico | TS_valor | Bolsa médico residente – mensal. |
| vlrBolsaMedico13 | TS_valor | Bolsa médico residente – 13º. |
| vlrJurosMora | TS_valor | Juros de mora. |
| vlrIsenOutros | TS_valor | Outras isenções. |

---

## 8. totInfoIR > consolidApurMen

Mesmos campos do totalizador que `totApurMen`, consolidados por trabalhador no período.

---

## 9. infoIRComplem (opcional)

- **ideDep:** cpfDep, depIRRF, dtNascto, nome, tpDep (dependentes).
- **planSaude:** cnpjOper, regANS, vlrSaudeTit, infoDepSau (plano de saúde).

---

## Tabela tpInfoIR (códigos de verba)

Códigos definidos no XSD para o campo `infoIR/tpInfoIR`. Usados para discriminar cada verba nos totalizadores.

| Código | Descrição (eSocial) |
|--------|---------------------|
| 11 | Rendimentos tributáveis – Remuneração mensal |
| 12 | 13º salário |
| 14 | PLR |
| 31 | Retenções do IRRF – Remuneração mensal |
| 32 | Retenções do IRRF – 13º salário |
| 34 | Retenções do IRRF – PLR |
| 41 | Deduções – Previdência Social Oficial (PSO) – Remuneração mensal |
| 42 | PSO – 13º salário |
| 46 | Previdência complementar – Salário mensal |
| 47 | Previdência complementar – 13º salário |
| 51 | Pensão alimentícia – Remuneração mensal |
| 52 | Pensão alimentícia – 13º salário |
| 54 | Pensão alimentícia – PLR |
| 61 | FAPI – Remuneração mensal |
| 62 | FAPI – 13º salário |
| 63 | Fundação previdência complementar servidor público – Mensal |
| 64 | Fundação previdência complementar servidor público – 13º |
| 67 | Plano privado coletivo de assistência à saúde |
| 68 | Desconto simplificado mensal |
| 70 | Parcela isenta 65 anos – Remuneração mensal |
| 71 | Parcela isenta 65 anos – 13º salário |
| 72 | Diárias |
| 73 | Ajuda de custo |
| 74 | Indenização e rescisão (PDV, acidentes) |
| 75 | Abono pecuniário |
| 76 | Moléstia grave – Remuneração mensal |
| 77 | Moléstia grave – 13º salário |
| 79 | Outras isenções |
| 700 | Auxílio moradia |
| 701 | Parte não tributável – transporte passageiros/cargas |
| 702 | Bolsa médico residente – mensal |
| 703 | Bolsa médico residente – 13º |
| 704 | Juros de mora |
| 7900 | Verba diversa (convênio, consignações, etc.) — valores **negativos** = descontos que transitam pela folha (ex.: convênio farmácia, consignações). |
| 7950 | Rendimento não tributável (compatibilidade) |
| 7951 | Rendimento não tributável – bitributação |
| 7952 | Rendimento tributável – RRA |
| 7953 | Retenção de IR – RRA |
| 7954 | PSO – RRA |
| 7955 | Pensão alimentícia – RRA |
| 7956 | Valores MEI/EPP (exceto pró-labore e aluguéis) |
| 7957 | Depósito judicial |
| 7958 | Compensaçao judicial – ano-calendário |
| 7959 | Compensação judicial – anos anteriores |
| 7960 | Exigibilidade suspensa – Remuneração mensal |
| 7961 | Exigibilidade suspensa – 13º |
| 7962 | Exigibilidade suspensa – Férias |
| 7963 | Exigibilidade suspensa – PLR |
| 7964 | Exigibilidade suspensa – RRA |
| 9011 | Exig. suspensa – Rend. tributável – Mensal |
| 9012 | Exig. suspensa – 13º |
| 9014 | Exig. suspensa – PLR |
| 9031 | Exig. suspensa – Retenção IR – Mensal |
| 9032 | Exig. suspensa – Retenção IR – 13º |
| 9034 | Exig. suspensa – Retenção IR – PLR |
| 9041 | Exig. suspensa – PSO – Mensal |
| 9042 | Exig. suspensa – PSO – 13º |
| 9046 | Exig. suspensa – Previdência complementar – Mensal |
| 9047 | Exig. suspensa – Previdência complementar – 13º |
| 9051 | Exig. suspensa – Pensão alimentícia – Mensal |
| 9052 | Exig. suspensa – Pensão alimentícia – 13º |
| 9054 | Exig. suspensa – Pensão alimentícia – PLR |
| 9061 | Exig. suspensa – FAPI – Mensal |
| 9062 | Exig. suspensa – FAPI – 13º |
| 9063 | Exig. suspensa – Fund. prev. serv. público – Mensal |
| 9064 | Exig. suspensa – Fund. prev. serv. público – 13º |
| 9067 | Exig. suspensa – Plano saúde |
| 9082 | Compensação judicial – ano-calendário |
| 9083 | Compensação judicial – anos anteriores |
| 9831 | Depósito judicial – Mensal |
| 9832 | Depósito judicial – 13º |
| 9834 | Depósito judicial – PLR |

---

*Documento gerado com base exclusiva no XSD S-5002_evtIrrfBenef.xsd (eSocial).*
