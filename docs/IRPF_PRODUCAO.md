# Módulo IRPF Produção

Documentação do módulo IRPF Produção (prefixo de API `/api/irpf-producao`).

## Variáveis de ambiente

| Variável | Descrição |
|----------|------------|
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Conexão MySQL (compartilhada com o app) |
| `REDIS_URL` ou `REDIS_HOST` + `REDIS_PORT` | Redis para filas BullMQ (workers) |
| `IRPF_STORAGE_PATH` | Pasta base para arquivos (ex.: pasta de rede). Padrão: `irpf_storage` no cwd |
| `IRPF_OCR_WEBHOOK_URL` | URL do serviço OCR externo (fluxo imagem) |
| `IRPF_APP_BASE_URL` | URL base da API (para callback e download do arquivo pelo OCR) |
| `IRPF_OCR_TIMEOUT_MS`, `IRPF_OCR_MAX_RETRIES` | Timeout e retentativas do webhook OCR (opcional) |
| `IRPF_MAX_EXTRACTION_ATTEMPTS` | Limite de tentativas de extração/reprocessamento (padrão: 10) |

## Subir os workers

Os jobs são processados por workers BullMQ. Para ativar o pipeline:

```bash
npm run workers:irpf-producao
```

Requer **Redis** e **MySQL** configurados. O processo mantém ativos os 6 workers: `extract_text`, `classify`, `validate`, `score_risk`, `generate_case_summary`, `process_case`.

## Pipeline de jobs

Fluxo após upload de documento (PDF com extração nativa):

1. **extract_text** — extrai texto do PDF, grava `raw_text` e dados extraídos; ao concluir enfileira **classify**
2. **classify** — (placeholder) enfileira **validate**
3. **validate** — (placeholder) enfileira **score_risk**
4. **score_risk** — (placeholder) enfileira **generate_case_summary**
5. **generate_case_summary** — (placeholder) fim do pipeline

Para imagens (OCR externo), o upload chama o webhook OCR; o callback atualiza o documento e não enfileira `extract_text` (o texto vem do serviço externo).

**process_case** (Task 14): job por case. Validações iniciais (RF-040 a RF-043: completude, informes, extração) e comparação fontes pagadoras esperadas (triagem) x recebidas (doc_type). Cria/atualiza pendências em `irpf_producao_issues` (INFO/WARN/BLOCKER). Disparo: `POST /api/irpf-producao/cases/:id/process`.

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/irpf-producao/health` | Health check (MySQL + share). 200 ou 503 |
| GET | `/api/irpf-producao/jobs` | Lista job_runs (filtros: `limit`, `case_id`, `document_id`, `status`). Requer perfil (`x-user-profile`) |
| POST | `/api/irpf-producao/documents/:id/reprocess-extraction` | Reprocessar extração (EXTRACTION_ERROR/REQUIRES_REVIEW). Requer perfil |
| POST | `/api/irpf-producao/documents/process-callback` | Callback do webhook OCR (body: `document_id`, `status`, `raw_text`, etc.) |
| GET | `/api/irpf-producao/documents/:id/file` | Download do arquivo (para o serviço OCR) |
| POST | `/api/irpf-producao/cases/:id/documents` | Upload de documento (multipart: `file`, `docType`, `source`) |
| POST | `/api/irpf-producao/cases/:id/process` | Enfileira job process_case (validações iniciais e divergências). Requer perfil |
| GET | `/api/irpf-producao/cases/:id/dossie` | Dossiê final (RF-062): inventário de documentos com SHA-256 + histórico do case (audit). Gate: não permite CLOSED sem inventário |
| POST | `/api/irpf-producao/cases/:id/review` | Revisão e aprovação (RF-050 a RF-052, P-004). Body: `action` (approve/reject), `justification` (obrig.), `override_reason`, `attachment_ref`. Case deve estar READY_FOR_REVIEW. Alto risco exige perfil Auditor ou Admin. Requer perfil |
| GET | `/api/irpf-producao/cases/:id/post-delivery-occurrences` | Lista ocorrências pós-entrega (RF-061) do case |
| POST | `/api/irpf-producao/cases/:id/post-delivery-occurrences` | Registra ocorrência pós-entrega. Body: `motivo` (MALHA_FINA, RETIFICACAO, COMPLEMENTACAO, OUTROS), `observacao`, `document_id` (anexo opcional). Requer perfil |
| POST | `/api/irpf-producao/cases/:id/sync-declaration` | Task 18: popula declaration_* a partir de case_people, triagem e dec_layout_version. Requer perfil |
| POST | `/api/irpf-producao/cases/:id/generate-dec` | Task 21/22: gera arquivo .DEC (pré-valida APPROVED, sem BLOCKER, totais consistentes); retorna `file_path` e `document_id`. Body opcional: `retificacao: true` para ORIGI/RETIF. Requer perfil |
| POST | `/api/irpf-producao/cases/:id/recalculate-totals` | Task 20: recalcula e persiste declaration_totals (simplificada 20% vs completa). Requer perfil |

Gate SUBMITTED (RF-060): para transição para SUBMITTED é obrigatório existir ao menos um documento com `doc_type = PROTOCOLO` (recibo). Upload de PROTOCOLO usa a pasta `10_protocolos` (já mapeada no upload).

**Task 18 – Modelo declaration_* e dec_layout_version:** Migração 026 cria tabelas `irpf_producao_declaration_income_pj/pf/exempt/exclusive`, `declaration_dependents`, `declaration_payments`, `declaration_assets`, `declaration_debts`, `declaration_totals` e `irpf_producao_dec_layout_version` (por exercício). Mapeamento bloco .DEC → origem em `dec-mapping.ts` (P-014). Serviço `populateDeclarationFromCase` sincroniza dependentes de case_people, insere totals (zerados) e garante layout por exercício; endpoint `POST .../sync-declaration` dispara a sincronização.

**Task 19 – Layout .DEC e writers (PRD 11.4):** `dec-layout.ts` carrega leiaute por exercício. `dec-writers/` implementa writers na ordem Anexo D; encoding Latin-1; `runWritersInOrder` e `generateDecBuffer`.

**Task 20 – Calculadora de totais e consistência (RF-075):** `declaration-totals-calculator.ts` calcula base, imposto e deduções (simplificada 20% vs completa) e persiste em declaration_totals. `declaration-consistency.ts` valida perfil vs blocos 17/18 ou 19/20 e T9 = totais calculados. Endpoint `POST .../recalculate-totals`.

**Task 21 – Orquestrador .DEC:** `generate-dec-orchestrator.ts`: pré-valida (APPROVED, sem BLOCKER, consistência); gera buffer; grava em 11_dec com nome `{CPF}-IRPF-A-{EXERCICIO}-{ANO_BASE}-ORIGI.DEC` (ou RETIF); pós-valida (T9/R9 count); registra document DEC_GERADO e audit_event ou rollback.

**Task 22 – Endpoint generate-dec:** `POST .../generate-dec` chama o orquestrador; retorna path e document_id ou erro (RF-071, RF-076). Validação por registro (tamanho linha, CRLF) no orquestrador.

**Task 23 – Testes .DEC:** `tests/services/irpf-producao-dec.test.ts` valida ordem de registros (IR primeiro, R9 último), tamanho de linha 250, CRLF e encoding Latin-1.

**Task 24 – UX e copy (PRD 11.6):** `ux-copy.ts` exporta STATUS_LABELS e ERROR_MESSAGES para o frontend. `docs/IRPF_UX_CHECKLIST.md` com checklist de legendas, placeholders, empty states e acessibilidade.

Migrações MySQL do módulo: `docs/migrations/mysql/020_*` a `026_*` (cases, documents, jobs, job_runs, extraction tables, post_delivery_occurrences, declaration tables).
