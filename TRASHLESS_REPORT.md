# Trashless Report — auditoria de uso e remoção de código morto

**Data:** 2026-09-14
**Branch:** `chore/trashless` (local, sem push), criada a partir de `feat/trabalhista-darf-dctfweb`
**Commit de segurança:** `def7ea3`
**Para restaurar:** `git reset --hard def7ea3`
**Stack detectada:** Node 20/Express + TypeScript (backend, Jest) · React 18 + Vite 7 + TypeScript (frontend, Vitest) · Python (SPED/extração, chamado via `child_process`) · MySQL

> **Fase 0.** Nenhum commit de checkpoint novo: a árvore estava limpa em `def7ea3`, que é a
> rede de segurança. O relatório anterior (limpeza da página `/dashboard`, 2026-08-20) está no
> histórico do git.

> **Método.** TDD. Antes de remover qualquer coisa entraram dois testes (`efd3616`):
> `tests/architecture/route-table.test.ts`, retrato dos 217 endpoints montados (verde antes e
> depois), e `tests/architecture/dead-code.test.ts`, que nasceu vermelho com a lista desta
> auditoria e terminou verde. Cada etapa foi um commit, verificado por: jest, vitest, `vite build`,
> comparação do conjunto de erros de `tsc` com a baseline e a aplicação rodando (API e Vite).

---

## Resumo Executivo

| Categoria                              | Candidatos | Confirmados | Incertos | Falsos Positivos |
|----------------------------------------|-----------:|------------:|---------:|-----------------:|
| Imports não utilizados                 | —          | —           | —        | —                |
| Código morto — backend (inclui IRPF)   | 29         | 26          | 1        | 2                |
| Arquivos órfãos — frontend (inclui IRPF) | 14       | 13          | 0        | 1                |
| Testes que só cobriam código morto     | 6          | 6           | 0        | 0                |
| Scripts Python                         | 31         | 7           | 21       | 3                |
| Arquivos desnecessários                | 3          | 3           | 0        | 0                |
| Dependências órfãs                     | 14         | 14          | 0        | 0                |

**Total removido:** 55 arquivos e 14 dependências — 17.637 linhas a menos
(`git diff --shortstat def7ea3..HEAD`, antes deste relatório). Além deles, `App.tsx` e o router
foram editados.
"Imports não utilizados" e os 79 exports sem uso apontados pelo `knip` ficaram fora deste escopo.

### Commits

| Etapa | Commit | O que saiu |
|---|---|---|
| 0 | `efd3616` | (entrada) testes de caracterização e de código morto; `.gitignore` dos `.py` temporários |
| 1 | `b984242` | módulos de backend nunca montados e services órfãos |
| 2 | `1da4429` | módulo IRPF 2026 (backend desligado + telas que davam 404) |
| 4 | `9cfaef6` | dependências sem import |
| 5 | `37f4b40` | scripts Python sem chamador e arquivo perdido na raiz |
| 3 | `0afa9cb` | componentes e barrels órfãos do frontend |

### Baseline x final

| Verificação | Antes (`def7ea3`) | Depois | Observação |
|---|---|---|---|
| Endpoints montados | 217 | 217 | snapshot idêntico |
| Jest | 35 ✓ / 1 ✗ · 467 testes | 34 ✓ / 0 ✗ · 425 testes | o ✗ era o `AdminDashboardViewModel.test`, órfão; os 42 testes a menos cobriam só código removido |
| Vitest | 10 ✓ / 1 ✗ · 123 ✓ 1 ✗ | 8 ✓ / 1 ✗ · 112 ✓ 1 ✗ | o ✗ é o `DCTFList.test`, **pré-existente**; saíram os testes de `Button`/`Input` |
| `tsc` backend | 15 erros (3 arquivos) | 15 erros | nenhum novo — todos pré-existentes |
| `tsc` frontend | 67 erros | 66 erros | nenhum novo; sumiu um aviso do `DivergenciasTable` |
| `vite build` | ok | ok | |
| App rodando | — | API reiniciada do zero: `/health`, `/api/clientes`, `/api/dctf`, `/ws/health` 200; `/api/irpf2026/me` 404; Vite compila `App`, router e telas | |

---

## ✅ Confirmados — Removidos

### Backend — rotas nunca registradas no `server.ts` (etapa 1)

| Arquivo | Motivo | Verificação |
|---|---|---|
| `src/routes/dctf-codes.ts` | Nunca montada (sem registro no histórico do `server.ts`) | grep: só o próprio arquivo; teste de rotas montadas |
| `src/routes/fiscal-calculation.ts` | Idem | idem |
| `src/routes/performance.ts` | Idem | idem |
| `src/controllers/DCTFCodesController.ts` | Só importado pela rota morta | cadeia |
| `src/controllers/FiscalCalculationController.ts` | Idem | cadeia |
| `src/controllers/PerformanceController.ts` | Idem | cadeia |
| `src/services/DCTFCodesService.ts` (+ teste) | Só consumido pelos controllers mortos | cadeia; o teste só o exercitava |
| `src/services/DCTFCalculationService.ts` (+ teste) | Idem | cadeia |
| `src/services/PerformanceMonitoringService.ts` | Só o `PerformanceController` | cadeia |
| `src/models/DCTFCode.ts` | Só a cadeia acima (o `DCTFCode` do `DCTFValidationService` é interface própria) | grep + grafo |

### Backend — services e models sem nenhum import (etapa 1)

| Arquivo | Motivo | Verificação |
|---|---|---|
| `src/services/AuthService.ts` | 0 imports | grafo a partir de `src/index.ts` e de todos os `src/scripts` |
| `src/services/ConsultaProgressService.ts` | 0 imports | idem |
| `src/services/DCTFReportService.ts` | 0 imports | idem |
| `src/services/ModelFactory.ts` | 0 imports | idem |
| `src/models/index.ts`, `src/models/Analise.ts` | Só o `ModelFactory` | cadeia |
| `src/services/conferences/modules/ClientesHistoricoAtrasoModule.ts` | 0 imports | grafo; sem `require` dinâmico no backend |
| `src/services/conferences/modules/DivergenciasValoresModule.ts` | 0 imports | idem |
| `src/services/AdminReportPdfService.ts` (+ teste) | Invólucro de uma linha sobre `ReportPdfService`; só o teste chamava, com o serviço real mockado | grep |
| `tests/frontend/AdminDashboardViewModel.test.ts` | Importava `src/frontend/buildAdminDashboardViewModel`, removido em 20/08; falhava desde então | jest baseline |

### IRPF 2026 — decisão do usuário: remover tudo (etapa 2)

Backend desligado desde 17/03/2026 (`a9d0bd5`); as telas seguiam no ar e davam 404.

| Arquivo | Motivo |
|---|---|
| `src/routes/irpf2026.ts` | Não montada desde `a9d0bd5` |
| `src/controllers/irpf2026/{Admin,Auth,Documentos,Mensagens}Controller.ts` | Só a rota |
| `src/services/irpf2026/Irpf2026Service.ts` | Só os controllers |
| `src/middleware/irpf2026Auth.ts` | Só a rota e o `AuthController` |
| `frontend/src/pages/Irpf2026/*` (5 arquivos) | Login e Visão Geral chamando `/api/irpf2026` (404) |
| `frontend/src/contexts/Irpf2026AuthContext.tsx` | Envolvia o app inteiro; sem backend |
| `frontend/src/services/irpf2026.ts` | Cliente da API removida |
| `frontend/src/App.tsx`, `frontend/src/router/index.tsx` | **Editados**: sai o provider, as rotas `cliente/login` e `admin` e o atalho `/admin`; `/irpf-2026` continua servindo o `Irpf2025` |

### Dependências (etapa 4)

| Pacote | Motivo | Verificação |
|---|---|---|
| `fast-xml-parser`, `sharp`, `tesseract.js`, `winston`, `task-master-ai` | 0 imports em `src/` e `tests/` | grep + `npm ls` (nenhum é peer de pacote em uso) |
| `archiver`, `bcryptjs`, `jsonwebtoken` | Só o IRPF 2026 usava | grep após a etapa 2 (`exceljs` traz o próprio `archiver`) |
| `@types/bcrypt`, `@types/bcryptjs`, `@types/jsonwebtoken` | Tipos das acima (`bcrypt` nunca foi dependência) | — |
| `@types/xlsx`, `@types/express-rate-limit`, `@types/uuid` | Os pacotes já trazem os próprios tipos | `tsc` sem erro novo |

Lockfile: só perdeu entradas (429 pacotes); nenhuma versão de dependência mantida mudou.
`.depcheckrc.json` e `knip.json` deixaram de ignorar o que não existe mais.

### Frontend — órfãos (etapa 3)

| Arquivo | Motivo | Verificação |
|---|---|---|
| `components/UI/Button.tsx`, `Input.tsx` (+ testes) | Nenhuma tela importa; os testes só exercitavam o componente | grafo a partir de `main.tsx`; vitest |
| `components/UI/Table.tsx`, `components/UI/index.ts` | Nenhuma tela importa (as telas importam cada componente pelo caminho) | idem |
| `hooks/index.ts` | Barrel sem uso (hooks importados um a um) | idem |
| `components/sped/DivergenciasTable.tsx` | 0 imports | idem |

### Python e arquivos desnecessários (etapa 5)

| Arquivo | Motivo | Verificação |
|---|---|---|
| `python/catalog/consulta_colaborador_centro_custo.py`, `consulta_views_especificas.py`, `verificar_views_centro_custo.py` | Consultas avulsas; ninguém chama | grep no repo inteiro (docs, scripts, `.bat`/`.ps1`) |
| `python/scripts/atualizar_capital_social.py`, `extrair_capital_social_pdf.py`, `extrair_dados_pdf.py` | Ninguém chama nem documenta | idem |
| `python/sped/debug_find_c170.py` | Script de depuração | idem |
| `python/temp_gerar_relatorio_1764793714577.py`, `..._1764853441811.py` | Sobras do `BancoHorasService` (grava, roda e apaga; ficaram quando a execução caiu) | padrão adicionado ao `.gitignore` |
| `eção Exemplos de Divergências Averiguadas explicando tipos de confrontos` (raiz) | Saída de `git log --name-only` salva por engano, nome truncado | leitura do conteúdo |

---

## ⚠️ Incertos — Mantidos, revisar manualmente

| Item | Motivo | Ação sugerida |
|---|---|---|
| `src/services/DCTFBusinessRulesService.ts` | 449 linhas de regras com teste próprio, sem consumidor em runtime | Decidir se volta a ser ligado ou sai. Está na `ALLOWLIST` do teste |
| `python/scripts/investigar_sp_bi_fat.py` | Sem chamador, mas é ferramenta manual citada em `docs/REOA_CONFERENCIA.md` | Manter. Está na `ALLOWLIST` |
| 20 módulos `python/sped/` (`validacao_*`, `correcao_c100/c170`, `normalizacao`, `painel_riscos`, `rastreabilidade`, `recalculo_c190`, `relatorios_avancados`, `revalidacao`, `tolerancia`) | Só os testes pytest importam, e o pytest não roda no CI | Decidir se o pipeline SPED v1 vai usá-los; se não, saem com os testes |
| 42 endpoints sem chamada no frontend (`/api/flags/*`, `/api/sci/banco-horas/*`, `/api/dctf/admin/*`, `/api/darf/lote/executar`...) | Não são código morto: parte é operação manual/administrativa; nenhum outro app em `D:\aplicativos` os chama; a API não grava log de acesso para provar uso | Revisar grupo a grupo. `banco-horas` e `flags` parecem sobra de telas removidas |
| 36 arquivos de `src/scripts` fora do `package.json` | Ferramentas manuais | Revisar |
| `src/scripts/run-irpf2026-migration.ts`, `migrate:irpf2026`, migrations do IRPF 2026 | As tabelas continuam no banco; migrations nunca são tocadas | Manter até decidir o destino das tabelas |
| `src/config/database.ts` (cliente Supabase) | Só scripts usam; chaves vazias no `.env` | Sai junto quando os scripts de migração Supabase forem aposentados |

---

## ❌ Falsos Positivos — Mantidos

| Item | Motivo do descarte |
|---|---|
| `src/routes/sped_correcoes.ts` (apontado pelo `knip`) | Montado via `require('./routes/sped_correcoes')` no `server.ts` |
| `src/services/SupabaseAdapter.ts` | Apesar do nome, traduz a sintaxe do Supabase para MySQL — é a camada de dados em uso |
| `python/sped/format.py` | Importado pelo `excelio.py` dentro de um `try` (`from format import ...  # type: ignore`) |
| `python/sped/ajuste/gerador_sped_ajustado.py`, `cruzamento_inteligente.py`, `rules/cfop_cst_matrix.py` | Carregados por `importlib.util.spec_from_file_location` em `aplicar_ajustes.py`/`processar_ajustes.py` |
| `frontend/src/types/index.ts` | Só `import type`, mas referenciado — arquivo de tipos vivo |
| `DCTFValidationService.ts` citando `DCTFCode` | Declara interface própria com esse nome; não importa o model |

---

## Pendências pré-existentes (não causadas pela limpeza)

- `frontend/src/pages/__tests__/DCTFList.test.tsx` falha ("Total: 1" não encontrado).
- `tsc` com erros: backend 15 (`ReportPdfService`, `IrpfController`, `BancoHorasController`); frontend 66.
- `.github/workflows/ci.yml` documenta que o CI nunca passou.
- `docs/MAPEO_PROJETO.md` ainda descreve o SPED v2, removido em 08/04/2026 (`86195d3`). A seção de testes foi atualizada nesta limpeza; o resto não.

---

## Próximos Passos

- Decidir os itens ⚠️ acima (principalmente `DCTFBusinessRulesService` e os 20 módulos SPED só de teste).
- Os testes de `tests/architecture/` rodam no `npm test` e impedem o acúmulo de novos órfãos.
- A branch `chore/trashless` é local. Integrar/pushar só quando decidido.

Para restaurar o projeto ao estado anterior:
`git reset --hard def7ea3`
