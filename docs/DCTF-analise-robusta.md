# Diretrizes fiscais para análise robusta da DCTF

## Referências legais principais

- **Instrução Normativa RFB nº 2.005/2021** – Dispõe sobre a apresentação da DCTF Mensal, Retificadora e DCTFWeb. Destacam-se:
  - Art. 4º e 5º – obrigatoriedade de apresentação e contribuintes dispensados;
  - Art. 6º a 11 – prazos de entrega, retificação e efeitos;
  - Art. 12 a 16 – penalidades por atraso, não entrega e incorreções;
  - Art. 18 – regras para retificações e substituições;
  - Anexos – códigos de receitas, tabelas e instruções de preenchimento.
- **Lei nº 9.430/1996 (Art. 44)** – Multas de ofício sobre diferença de imposto apurado.
- **Código Tributário Nacional**:
  - Art. 138 – denúncia espontânea (redução de penalidade);
  - Art. 150 e 151 – lançamento por homologação e efeitos da suspensão de exigibilidade;
  - Art. 113, §3º – penalidades por descumprimento de obrigações acessórias.
- **Lei nº 9.430/1996, Art. 57** (com alterações da Lei nº 12.766/2012) – multa por atraso na entrega de declarações.
- **IN RFB nº 1.110/2010** e atualizações – regras específicas para multas de atraso, quando aplicável.

> Recomenda-se manter um monitoramento contínuo das atualizações normativas publicadas no Diário Oficial, especialmente instruções normativas RFB, atos declaratórios e soluções de consulta.

## Matriz de risco e gatilhos de multa

| Código | Situação identificada | Base Legal | Multa/penalidade | Severidade | Prazo de regularização |
|--------|----------------------|-----------|------------------|------------|------------------------|
| R01 | Entrega fora do prazo legal | IN RFB nº 2.005/2021, art. 12; Lei nº 9.430/96, art. 57 | 2% ao mês-calendário ou fração, limitada a 20%, mínimo R$ 200 (PJ inativa) e R$ 500 (demais) | Alta | Até envio da declaração + pagamento da multa |
| R02 | Falta de entrega/omissão de competência obrigatória | IN RFB nº 2.005/2021, arts. 4º e 6º | Mesmas multas de atraso + risco de intimação | Crítica | Entrega imediata da DCTF omitida |
| R03 | Divergência entre valores declarados e recolhidos/Guias | Lei nº 9.430/96, art. 44 | Multa de ofício 75% (até 150% em casos agravados) sobre diferença | Crítica | Reposição do tributo e ajuste na DCTF/contabilidade |
| R04 | Informações inexatas, incompletas ou incorretas | IN RFB nº 2.005/2021, art. 12, inciso II | Multa de 3% do valor omitido, inexato ou incorreto, mínimo R$ 100 | Alta | Retificação fundamentada |
| R05 | CNPJ divergente entre DCTF e cadastro de clientes | IN RFB nº 2.005/2021, art. 8º; CTN art. 113 | Pode levar a intimações, glosa de compensações | Alta | Correção da identificação do declarante ou vinculador |
| R06 | Falta de recolhimento de débitos declarados | CTN art. 113; Lei nº 9.430/96, art. 44 | Multa de mora 0,33% ao dia (limitada a 20%) + juros SELIC | Crítica | Pagamento imediato ou parcelamento |
| R07 | Reincidência em atraso ou erro | Lei nº 9.430/96, art. 44; art. 83 da Lei nº 9.430/96 | Majoração de multa (100% ou 150%) | Crítica | Ajustar controles internos; possível denúncia espontânea |
| R08 | Incompatibilidade com regime tributário/CNAE | IN RFB nº 2.005/2021, art. 4º | Intimação e reclassificação tributária | Média | Revisão cadastral e reprocessamento |

## Critérios de severidade sugeridos

- **Crítica**: Risco de multa imediata acima de R$ 5.000, possibilidade de autuação com multa de ofício, risco de decadência iminente (< 30 dias).
- **Alta**: Multas fixas relevantes, impacto operacional elevado ou exposição a fiscalização direta.
- **Média**: Multas reduzidas ou obrigações acessórias que podem ser sanadas com retificação sem autuação.
- **Baixa**: Ajustes formais, recomendações preventivas, inconsistências que não geram multa imediata.

## Prazos legais de referência

- DCTF mensal: último dia útil do 15º dia útil do segundo mês subsequente aos fatos geradores (IN RFB nº 2.005/2021, art. 6º).
- Retificação: pode ser apresentada a qualquer tempo antes do início do procedimento fiscal; após, sujeita à homologação da Receita (IN RFB nº 2.005/2021, art. 18).
- Pagamento de multa por atraso: deve ser realizado em até 30 dias da notificação para evitar inscrição em dívida ativa.

## Checklist de requisitos para análise

1. **Verificação cadastral**
   - CNPJ, CNAE, regime tributário compatíveis.
   - Dados do cliente atualizados no Supabase (endereços, contatos, responsável legal).
2. **Cobertura de períodos**
   - Todas as competências obrigatórias declaradas.
   - Monitoramento de omissões (diferença entre calendário fiscal e base DCTF).
3. **Consistência de valores**
   - Base de cálculo positiva e compatível com receitas.
   - Conferência entre códigos de receita, deduções, compensações.
4. **Conciliação com pagamentos**
   - Conferir DARF/DCTFWeb transmitidos vs. efetivo recolhimento.
   - Controlar tributos com recolhimento especial (IRRF, CSLL, PIS/COFINS).
5. **Prazos e multas**
   - Calcular atraso por competência com base no prazo legal.
   - Estimar multa de ofício e mora quando houver diferença de tributo.
6. **Evidências e relatórios**
   - Registrar findings, valor potencial da multa, base legal e plano de ação.
   - Manter histórico auditável para inspeções futuras.

## Rastreabilidade e armazenamento

- Centralizar referências em tabela específica (`dctf_risk_matrix`) com colunas para código do risco, descrição, base legal, severidade, multa potencial e prazo.
- Vincular cada achado a um registro da tabela de auditoria (`dctf_auditoria`) com hash dos dados analisados e carimbo temporal.
- Manter versão da base legal aplicada (ex.: `IN RFB nº 2.005/2021 - atualizada em 10/2023`) para facilitar revisões.

## Recomendações operacionais

- Automatizar atualização da matriz quando houver alteração legislativa.
- Definir política de denúncia espontânea: detecção interna + geração automática de guia para regularização.
- Configurar alerta antecipado (15, 7 e 3 dias antes) para competências ainda não declaradas.
- Revisar periodicamente integrações com SPED, ECD e ECF para garantir consistência contábil.

## Fluxo operacional proposto

1. **Ingestão** – serviço `DCTFIngestionService` monta dataset consolidado (declaração, cliente, dados contabilizados, estatísticas) e registra log em `logs/dctf-analysis.log`.
2. **Validações cruzadas** – `DCTFAnalysisService` aplica verificações cadastrais, consistência de valores, omissão de competências e atraso de entrega, com geração automática de flags críticas.
3. **Motor de risco** – cálculo do `riskScore` e estimativa de multa potencial com base nas penalidades previstas.
4. **Alertas** – flags críticas/altas disparam emissão de eventos WebSocket (`flags.created`) pelo gateway `/realtime` e alimentam dashboards/toasts do frontend.
5. **Relatórios** – `DCTFReportService` gera plano de ação detalhado em Markdown (pasta `docs/relatorios/`) contendo achados, base legal, flags pendentes e prazos.
6. **Auditoria** – todos os passos registram eventos com metadados de filtros, usuário e timestamp para rastreabilidade.
7. **Documentação** – este guia deve ser revisado sempre que houver mudança normativa ou evolução do pipeline.



