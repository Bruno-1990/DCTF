# Catálogo de Flags DCTF e Matriz de Severidade

| Código | Descrição | Severidade | Base legal | Penalidade estimada | Plano de ação sugerido |
| --- | --- | --- | --- | --- | --- |
| FLAG_ATRASO_ENVIO | Declaração transmitida após o prazo legal | Alta | Lei nº 9.430/1996, art. 57; IN RFB nº 2.005/2021, art. 12 | Multa de 2% ao mês sobre o tributo declarado (mínimo R$ 200) | Emitir DARF código 2170, efetuar pagamento e registrar justificativa |
| FLAG_OMISSAO_COMPETENCIA | Ausência de DCTF em competência obrigatória | Crítica | IN RFB nº 2.005/2021, arts. 4º e 6º | Multas idênticas ao atraso + risco de autuação | Transmitir DCTF omitida imediatamente; avaliar denúncia espontânea |
| FLAG_VALOR_NEGATIVO | Valor negativo para receita ou retenção | Alta | IN RFB nº 2.005/2021, art. 12, II | Multa de 3% sobre valores incorretos (mínimo R$ 100) | Revisar classificação e ajustar lançamentos antes da retificação |
| FLAG_CNPJ_DIVERGENTE | CNPJ linha diferente do contribuinte | Alta | IN RFB nº 2.005/2021, art. 8º | Intimação e glosa de compensações | Corrigir planilha/arquivo e reenviar DCTF com vínculo correto |
| FLAG_DEDUCAO_SUPERIOR_RECEITA | Deduções superam receitas declaradas | Alta | Lei nº 9.430/1996, art. 44 | Multa de ofício 75% sobre diferença | Validar créditos e justificativas; retificar se necessário |
| FLAG_RETENCAO_SUPERIOR_RECEITA | Retenções maiores que a base líquida | Alta | IN RFB nº 2.005/2021, Anexos | Multas por recolhimento a maior/menor | Recalcular retenções e adequar códigos |
| FLAG_DUPLICIDADE_DECLARACAO | Mais de uma DCTF para mesma competência | Crítica | IN RFB nº 2.005/2021, art. 11 | Multa por informações incorretas e risco de autuação | Cancelar duplicata, consolidar informações e retificar |
| FLAG_SITUACAO_PENDENTE | Situação diferente de "Ativa" após processamento | Média | IN RFB nº 2.005/2021, art. 10 | Risco de pendência cadastral | Verificar processamento na RFB, reenviar se necessário |

## Critérios de severidade

- **Crítica**: potencial de autuação imediata ou multa de ofício > R$ 5.000.
- **Alta**: multas relevantes ou risco de intimação formal.
- **Média**: inconsistências que exigem correção, porém com impacto moderado.
- **Baixa**: alertas preventivos e recomendações.

## Severidades e tratativas

- Flags críticas devem disparar alerta imediato e plano de ação com prazo < 7 dias.
- Flags altas entram em fila de tratamento com prazo < 15 dias.
- Flags médias podem ser agrupadas em sprints de correção.
- Flags baixas são monitoradas e documentadas para revisão futura.


