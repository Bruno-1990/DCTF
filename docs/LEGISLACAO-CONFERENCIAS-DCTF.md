# Base legal – Conferências DCTF

Este documento registra as normas utilizadas nas conferências DCTF do sistema, para auditoria e manutenção.

## Normas utilizadas

| Norma | Uso |
|-------|-----|
| **Lei 10.168/2000** | Obrigatoriedade de entrega da DCTF; multa por transmissão em atraso. |
| **IN RFB 2.237/2024, Art. 3º, § 3º** | Dispensa de transmitir DCTF após declarar "Original sem movimento"; dispensa vale até novo movimento. |
| **Instrução Normativa RFB (prazo)** | Prazo de entrega: último dia útil do mês seguinte ao da competência. |
| **Instrução Normativa RFB (DCTF)** | Período de apuração e consistência da declaração. |

## Tipo de conferência × norma e implementação

| Tipo de conferência | Norma que embasa a regra | Arquivo(s) da regra |
|---------------------|--------------------------|----------------------|
| **Sem DCTF Vigente** | Lei 10.168/2000; IN RFB (prazo). Competência vigente = mês anterior; vencimento = último dia útil do mês seguinte. | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_SEM_DCTF_VIGENTE); `src/services/conferences/modules/ClientesSemDCTFVigenteModule.ts`; `src/services/conferences/utils/dateUtils.ts` (calcularVencimento, calcularCompetenciaVigente). |
| **Sem DCTF c/ Movimento** | Lei 10.168/2000. Obrigatoriedade quando há movimentação na competência. | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_SEM_DCTF_COM_MOVIMENTO); `src/services/HostDadosObrigacaoService.ts`. |
| **Fora do Prazo** | Lei 10.168/2000 (multa por atraso). | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_FORA_DO_PRAZO); `src/services/conferences/modules/DCTFsForaDoPrazoModule.ts`. |
| **Período Inconsistente** | IN RFB (DCTF) – período de apuração deve corresponder à competência. | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_PERIODO_INCONSISTENTE); `src/services/conferences/modules/DCTFsPeriodoInconsistenteModule.ts`. |
| **Sem Movimentação** | Informativo; possível dispensa (ex.: IN 2.237/2024). | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_SEM_MOVIMENTACAO); `src/services/conferences/modules/ClientesSemMovimentacaoModule.ts`. |
| **Histórico de Atraso** | Lei 10.168/2000 – multa e regularização. | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_HISTORICO_ATRASO); `src/services/conferences/modules/ClientesHistoricoAtrasoModule.ts`. |
| **Dispensados** | IN RFB 2.237/2024, Art. 3º, § 3º – Original sem movimento. | `src/services/conferences/legislacao-dctf.ts` (BASE_LEGAL_DISPENSADOS); `src/services/conferences/modules/ClientesDispensadosDCTFModule.ts`. |

## Regime tributário

- O sistema **exibe** o campo **Regime** nas listas das seções "Sem DCTF Vigente" e "Sem DCTF c/ Movimento" apenas para **apoio à decisão** do usuário.
- **Não** há, neste momento, regra automática do tipo "Simples Nacional dispensado" ou obrigatoriedade diferenciada por regime.
- A definição de obrigatoriedade ou dispensa por regime tributário pode ser tema de **evolução futura**; quando implementada, deve ser documentada aqui e referenciada em `legislacao-dctf.ts`.

## Referência única no código

- **Constantes e textos de base legal:** `src/services/conferences/legislacao-dctf.ts`
- **Resumo de conferências (base legal e recomendação por módulo):** `src/services/conferences/ConferenceModulesService.ts` (preenchimento de `modulosMeta` a partir de `legislacao-dctf.ts`).
