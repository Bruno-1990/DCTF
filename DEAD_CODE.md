# Relatorio de Codigo Morto — DCTF_MPC

Gerado em: 2026-04-08 | Verificado com dupla checagem de imports

Este relatorio lista todos os arquivos **confirmados como nao utilizados** no projeto — nao importados, nao referenciados, ou substituidos por versoes mais novas. Cada item foi verificado duas vezes para evitar exclusoes que quebrem o sistema.

---

## Resumo

| Categoria | Arquivos mortos | Seguros para deletar |
|-----------|-----------------|----------------------|
| Frontend — Paginas | 7 | 7 |
| Frontend — Componentes | 8 | 8 |
| Frontend — Hooks | 4 | 4 |
| Frontend — Servicos | 1 | 1 |
| Backend — Middleware | 1 | 1 |
| Python — Scripts | 7 | 7 |
| NPM — Dependencias | 3 | 3 |
| Git — Lixo rastreado | 8+ | 8+ |
| **TOTAL** | **~39 arquivos + 3 pacotes npm** | **Todos confirmados** |

---

## Frontend — Paginas sem rota (7 arquivos)

Estas paginas existem mas **nao estao registradas no router** (`frontend/src/router/index.tsx`):

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `pages/ConferenciasNova.tsx` | Versao alternativa de Conferencias, nunca ativada | SEGURO |
| `pages/UploadClientes.tsx` | Upload de clientes, nunca registrada | SEGURO |
| `pages/Irpf2026/Irpf2026ClienteLayout.tsx` | Layout cliente nao usado | SEGURO |
| `pages/Irpf2026/Irpf2026Dashboard.tsx` | Dashboard IRPF nunca importado | SEGURO |
| `pages/Irpf2026/Irpf2026ProtectedCliente.tsx` | Protecao cliente nao usada | SEGURO |
| `pages/Irpf2026/Irpf2026UploadModal.tsx` | So importado pelo Dashboard morto acima | SEGURO |
| `pages/Irpf2026/irpf2026Categorias.ts` | Dados nunca importados | SEGURO |

---

## Frontend — Componentes nao importados (8 arquivos)

### Conferencias (3)

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `components/conferences/BaseLegalRecomendacao.tsx` | Nunca importado | REMOVIDO |
| `components/conferences/ClientesHistoricoAtrasoSection.tsx` | Nunca importado | REMOVIDO |
| `components/conferences/DivergenciasValoresSection.tsx` | Nunca importado | REMOVIDO |

**CORRECAO:** `FiltroConferencias.tsx` foi restaurado — importado por 7 componentes ativos (ClientesDispensados, ClientesEmAndamento, ClientesSemDCTFComMovimento, ClientesSemDCTFVigente, ClientesSemMovimentacao, DCTFsForaDoPrazo, DCTFsPeriodoInconsistente).

### SPED V2 (4)

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `components/sped/v2/InternalValidationView.tsx` | Nunca importado | SEGURO |
| `components/sped/v2/MatchingView.tsx` | Nunca importado | SEGURO |
| `components/sped/v2/OperationsDashboard.tsx` | Nunca importado | SEGURO |
| `components/sped/v2/PipelineView.tsx` | Nunca importado | SEGURO |
| `components/sped/v2/SummaryPanel.tsx` | Nunca importado | SEGURO |

### REMOVIDOS DA LISTA (falso positivo na primeira analise)

Os seguintes arquivos foram inicialmente marcados como mortos mas **SAO ATIVOS** — importados indiretamente via cadeia de componentes:

| Arquivo | Importado por | Cadeia ate a rota |
|---------|---------------|-------------------|
| `components/sped/AjusteSpedComponent.tsx` | `ResultsDashboard.tsx` | → `SpedValidacao.tsx` (rota `/sped`) |
| `components/sped/DivergenciasInteligentes.tsx` | `ResultsDashboard.tsx` | → `SpedValidacao.tsx` |
| `components/sped/DivergenciasTable.tsx` | `ResultsDashboard.tsx` | → `SpedValidacao.tsx` |
| `components/sped/DivergenciasValoresConferencia.tsx` | `ResultsDashboard.tsx` | → `SpedValidacao.tsx` |
| `components/sped/ModalConfirmacaoCorrecoes.tsx` | `DivergenciasInteligentes.tsx` | → `ResultsDashboard` → `SpedValidacao.tsx` |
| `components/sped/ResultadoCorrecoes.tsx` | `DivergenciasInteligentes.tsx` | → `ResultsDashboard` → `SpedValidacao.tsx` |
| `components/sped/v2/AnalysisReport.tsx` | `Step4ResultsView.tsx` | → `SpedValidacaoV2.tsx` (rota `/sped/v2`) |
| `components/sped/v2/EvidenceDrawer.tsx` | `Step4ResultsView.tsx` | → `SpedValidacaoV2.tsx` |
| `components/sped/v2/RuleGeneratorModal.tsx` | `Step4ResultsView.tsx` | → `SpedValidacaoV2.tsx` |

---

## Frontend — Hooks nao importados (4 arquivos)

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `hooks/useApi.ts` | Exportado no index.ts mas nunca importado em nenhuma pagina/componente | SEGURO |
| `hooks/useAuth.ts` | Exportado no index.ts mas nunca importado | SEGURO |
| `hooks/useRealtime.ts` | Apenas usado em seu proprio teste, nunca em codigo de producao | SEGURO |
| `hooks/useSupabase.ts` | Exportado no index.ts mas nunca importado | SEGURO |

**Nota:** Ao deletar esses hooks, remover tambem os exports correspondentes do `hooks/index.ts`.

---

## Frontend — Servicos nao importados (1 arquivo)

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `services/conferences.ts` | Substituido por `conferences-modules.ts` | SEGURO |

---

## Backend — Middleware nao usado (1 arquivo)

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `src/middleware/auth.ts` | Funcao `apiKeyAuth()` nunca importada em nenhuma rota | SEGURO |

### REMOVIDO DA LISTA (falso positivo)

| Arquivo | Motivo |
|---------|--------|
| `src/frontend/buildAdminDashboardViewModel.ts` | Importado em `tests/frontend/AdminDashboardViewModel.test.ts` — usado nos testes |

---

## Python — Scripts sem referencia (7 arquivos)

Nenhum destes scripts e chamado pelo backend via spawn/exec:

| Arquivo | Motivo | Status |
|---------|--------|--------|
| `python/consulta_sci.py` | Zero referencias no TypeScript | SEGURO |
| `python/executar_relatorio_faturamento.py` | Zero referencias | SEGURO |
| `python/exemplo_consulta_sci.py` | Arquivo de exemplo | SEGURO |
| `python/testar_faturamento_sci.py` | Script de teste manual | SEGURO |
| `python/testar_relatorio.py` | Script de teste manual | SEGURO |
| `python/verificar_conexao_sci.py` | Script de verificacao manual | SEGURO |
| `window_1.py` (raiz) | Constantes de localizacao PT/EN nunca referenciadas | SEGURO |

---

## Dependencias NPM nao usadas (3 pacotes)

| Pacote | Tipo | Motivo | Status |
|--------|------|--------|--------|
| `bullmq` | dependency | Zero imports no src/, codigo fonte removido mas pacote ficou | SEGURO |
| `ioredis` | dependency | Zero imports, era dependencia do bullmq | SEGURO |
| `bcrypt` | dependency | Duplicata — apenas `bcryptjs` e importado no codigo | SEGURO |

### REMOVIDO DA LISTA (falso positivo)

| Pacote | Motivo |
|--------|--------|
| `socket.io-client` | Importado em `hooks/useRealtime.ts` e em testes WebSocket |

---

## Lixo rastreado no Git

Estes arquivos estao no repositorio mas **nao deveriam estar**:

| Arquivo/Diretorio | Tamanho | Motivo | Acao |
|-------------------|---------|--------|------|
| `.venv/` | 13MB | Ambiente virtual Python | `git rm -r --cached .venv/` + adicionar ao .gitignore |
| `dist/` | 3MB | Build compilado | `git rm -r --cached dist/` (ja esta no .gitignore) |
| `sync-errors.log` | 93KB | Log de runtime | `git rm --cached` + adicionar ao .gitignore |
| `ingest_docs.log` | 52KB | Log de runtime | `git rm --cached` + adicionar ao .gitignore |
| `.env.backup.20260116-095433` | 2.6KB | Backup antigo de .env | `git rm --cached` e deletar |
| `.env.temp` | 204B | Arquivo temporario | `git rm --cached` e deletar |
| `backup_duplicatas_*.json` | 122KB | Export de dados | `git rm --cached` |
| `tatus --porcelain` | 16KB | Arquivo com nome corrompido (output git) | Deletar |

---

## Observacoes adicionais

### Scripts soltos na raiz
Existem diversos scripts `.ts`, `.ps1` e `.bat` na raiz do projeto que deveriam estar organizados em `/scripts/`:
- `buscar-cnpj.ts`, `check-dctf-today.ts`, `check-sitf-data.ts`, `check-triggers.ts`
- `test-api-cnpj.ts`, `test-deduplication.ts`, `test-mysql-version.ts`
- `diagnostico-backend.ps1`, `iniciar-*.ps1`, `restaurar-dev.ps1`
- `1run.bat`

### Diretorio vazio
- `frontend/src/dashboard/` — diretorio vazio, pode ser removido

### Hook export faltando
- `frontend/src/hooks/useToast.tsx` e usado mas **nao e exportado** pelo `hooks/index.ts`
