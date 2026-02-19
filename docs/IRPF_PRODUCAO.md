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

Requer **Redis** e **MySQL** configurados. O processo mantém ativos os 5 workers: `extract_text`, `classify`, `validate`, `score_risk`, `generate_case_summary`.

## Pipeline de jobs

Fluxo após upload de documento (PDF com extração nativa):

1. **extract_text** — extrai texto do PDF, grava `raw_text` e dados extraídos; ao concluir enfileira **classify**
2. **classify** — (placeholder) enfileira **validate**
3. **validate** — (placeholder) enfileira **score_risk**
4. **score_risk** — (placeholder) enfileira **generate_case_summary**
5. **generate_case_summary** — (placeholder) fim do pipeline

Para imagens (OCR externo), o upload chama o webhook OCR; o callback atualiza o documento e não enfileira `extract_text` (o texto vem do serviço externo).

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/api/irpf-producao/health` | Health check (MySQL + share). 200 ou 503 |
| GET | `/api/irpf-producao/jobs` | Lista job_runs (filtros: `limit`, `case_id`, `document_id`, `status`). Requer perfil (`x-user-profile`) |
| POST | `/api/irpf-producao/documents/:id/reprocess-extraction` | Reprocessar extração (EXTRACTION_ERROR/REQUIRES_REVIEW). Requer perfil |
| POST | `/api/irpf-producao/documents/process-callback` | Callback do webhook OCR (body: `document_id`, `status`, `raw_text`, etc.) |
| GET | `/api/irpf-producao/documents/:id/file` | Download do arquivo (para o serviço OCR) |
| POST | `/api/irpf-producao/cases/:id/documents` | Upload de documento (multipart: `file`, `docType`, `source`) |

Migrações MySQL do módulo: `docs/migrations/mysql/020_*` a `024_*` (cases, documents, jobs, job_runs, extraction tables).
