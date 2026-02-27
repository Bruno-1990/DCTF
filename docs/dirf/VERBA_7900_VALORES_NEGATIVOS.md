# Verba 7900 – Valores negativos na DIRF

## O que são os valores negativos em "Verba diversa (convênio, consignações, etc.)"?

Os valores **negativos** nessa linha são **descontos** que transitam pela folha de pagamento e **não** são rendimento nem retenção/isenção/dedução de IR. O eSocial retorna esses valores já em negativo no XML do S-5002 (evtIrrfBenef).

Conforme o layout do S-5002 (tpInfoIR 7900):

> *"Verba transitada pela folha de pagamento de natureza diversa de rendimento ou retenção/isenção/dedução de IR (exemplo: desconto de convênio farmácia, desconto de consignações, etc.)"*

Ou seja:

- **Valor negativo** = valor **descontado** do trabalhador (sai do salário).
- Exemplos: desconto de convênio farmácia, consignações, outros descontos que “passam” pela folha mas não entram na base de IR.

A tabela da DIRF apenas replica o que vem no retorno do Gov: o campo `infoIR/valor` para `tpInfoIR` 7900 já vem negativo no XML.

---

## Exemplo nos XMLs da pasta DIRF

No arquivo `eSocial_EventoRecibo_36903582177-122025.xml` (e outros da pasta DIRF_XML), para o CPF 619.911.479-53 aparecem trechos como:

```xml
<infoIR><tpInfoIR>7900</tpInfoIR><valor>-2041.97</valor></infoIR>
<infoIR><tpInfoIR>7900</tpInfoIR><valor>-14453.95</valor></infoIR>
<infoIR><tpInfoIR>7900</tpInfoIR><valor>-1471.53</valor></infoIR>
```

Ou seja: o próprio retorno do eSocial envia **valor negativo**; a aplicação não altera o sinal.

---

## Resumo

| O que aparece na tabela | Significado |
|-------------------------|-------------|
| **Verba diversa** com valores **negativos** (ex.: -R$ 718,89) | Descontos do trabalhador que transitam pela folha (convênio, consignações, etc.), conforme retorno S-5002. |
| **Soma mensal** | Já considera esses negativos (reduzem o total quando há verba 7900). |

Não é erro: é o comportamento esperado do layout eSocial para a verba 7900.
