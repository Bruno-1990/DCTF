# Trashless Report — remoção da página `/dashboard`

**Data:** 2026-08-20
**Commit de segurança:** `b84cfc8` (já pushado em `origin/feat/clientes-status-ativo-inativo`)
**Para restaurar:** `git reset --hard b84cfc8`
**Stack detectada:** Node/Express + TypeScript (backend, Jest) · React + Vite + TypeScript (frontend, Vitest) · MySQL

> **Nota sobre a Fase 0.** Não criei um commit de checkpoint novo: a árvore já estava
> limpa no commit `b84cfc8`, exceto por dois arquivos de trabalho em andamento não
> relacionados (`src/scripts/preencher-regime-via-oneclick.ts` e
> `src/scripts/sync-regime-tributario-oneclick.ts`). Um `git add -A` teria varrido
> esse trabalho em progresso para dentro de um commit de limpeza. A rede de segurança
> existe e é o `b84cfc8`; os dois scripts não são tocados por nada aqui.

---

## Escopo

Remover a página `/dashboard` (o `AdminDashboard`) e tudo que ficar órfão com ela.

**O ponto de atenção deste projeto:** existem DUAS coisas com "Dashboard" no nome e
elas não são a mesma. A página `/dashboard` é uma; o conjunto
`AdminDashboardService` / `ReportDataFactory` é a espinha dorsal da página
**Relatórios**, que continua em uso. Remover por nome de arquivo quebraria os
relatórios.

---

## Baseline (antes de qualquer remoção)

| Verificação | Resultado |
|---|---|
| Testes backend (Jest) | 267 passando, 9 suítes |
| Testes frontend (Vitest) | 122 passando, **2 falhando** |
| `tsc` backend | 17 linhas de erro pré-existentes |
| `tsc -b` frontend | 96 linhas de erro pré-existentes |

As duas falhas de frontend são **anteriores** a esta auditoria:
`DCTFList.test.tsx` e `Home.test.tsx`. A segunda é relevante aqui — ver a seção
"Efeito colateral positivo" no fim.

---

## Resumo Executivo

| Categoria | Candidatos | Confirmados | Incertos | Falsos Positivos |
|---|---|---|---|---|
| Páginas / componentes frontend | 12 | 12 | 0 | 0 |
| Serviços frontend | 3 | 2 | 0 | 1 |
| Rotas e registros | 4 | 4 | 0 | 0 |
| Controllers / services backend | 11 | 3 | 1 | 7 |
| Imports que ficam órfãos | 4 | 4 | 0 | 0 |

**Total confirmado para remoção:** 25 itens · ~1.900 linhas

---

## ✅ Confirmados — Seguros para Remover

### Frontend — página e componentes

| Arquivo | Motivo | Verificação |
|---|---|---|
| `frontend/src/pages/AdminDashboard.tsx` | Alcançável só por `/dashboard` | Única rota que o monta; `/admin` redireciona para `/irpf-2026/admin` |
| `frontend/src/components/Dashboard/AlertsSection.tsx` | Importado só pelo `AdminDashboard` | grep em `frontend/src`: 0 refs fora da pasta e da página |
| `frontend/src/components/Dashboard/ConferenceSummaryCard.tsx` | idem | idem |
| `frontend/src/components/Dashboard/DashboardFilters.tsx` | idem | idem |
| `frontend/src/components/Dashboard/FinancialEvolutionChart.tsx` | idem | idem |
| `frontend/src/components/Dashboard/HeroSection.tsx` | idem | idem |
| `frontend/src/components/Dashboard/PeriodComparison.tsx` | idem | idem |
| `frontend/src/components/Dashboard/SitfMetricsSection.tsx` | idem | idem |
| `frontend/src/components/Dashboard/TopClientsChart.tsx` | idem | idem |
| `frontend/src/components/Dashboard/TopFaturamentoChart.tsx` | idem | idem |

A pasta `components/Dashboard/` inteira sai — nenhum arquivo dela é usado fora da
própria pasta ou da página.

> Não confundir com `frontend/src/components/sped/ResultsDashboard.tsx`, que é da
> tela de SPED e **fica**.

### Frontend — serviços

| Arquivo | Motivo | Verificação |
|---|---|---|
| `frontend/src/services/enhancedDashboard.ts` | Consumido só pela página e por `TopFaturamentoChart`/`HeroSection`, que também saem | Chama `/dashboard/admin/enhanced` e `/top-faturamento`, endpoints que saem junto |
| `frontend/src/services/dashboard.ts` | **Já era código morto antes desta limpeza** | `fetchAdminDashboardSnapshot` é reexportado por `services/index.ts` e **nenhum arquivo o importa** |
| linha em `frontend/src/services/index.ts` | Reexporta o arquivo acima | `export { fetchAdminDashboardSnapshot } from "./dashboard";` |

### Frontend — rota e navegação

| Local | Item |
|---|---|
| `frontend/src/router/index.tsx` | `{ path: 'dashboard', element: <AdminDashboard /> }` + o `import AdminDashboard` |
| `frontend/src/components/Layout/Header.tsx` | Item de menu `{ name: 'Dashboard', href: '/dashboard' }` |
| `frontend/src/components/Layout/Sidebar.tsx` | Item de menu `{ name: 'Dashboard', href: '/dashboard' }` |
| `frontend/src/pages/Home.tsx` | Card "Dashboard" que aponta para `/dashboard` |

### Frontend — imports que ficam órfãos

| Arquivo | Import |
|---|---|
| `frontend/src/components/Layout/Header.tsx` | `Squares2X2Icon` (a confirmar após a remoção do item) |
| `frontend/src/components/Layout/Sidebar.tsx` | `Squares2X2Icon` (idem) |
| `frontend/src/pages/Home.tsx` | `Squares2X2Icon` (idem) |
| `frontend/src/router/index.tsx` | `import AdminDashboard from '../pages/AdminDashboard'` |

### Backend

| Arquivo / trecho | Motivo | Verificação |
|---|---|---|
| `src/controllers/AdminDashboardController.ts` | Seus 3 handlers (`getSnapshot`, `getEnhanced`, `getTopFaturamento`) servem só a página | Nenhum outro consumidor dos 3 endpoints |
| `src/services/EnhancedDashboardService.ts` | Importado **apenas** pelo controller acima | grep: 2 refs, ambas no `AdminDashboardController` |
| 3 rotas em `src/routes/admin-dashboard.ts` | `/snapshot`, `/enhanced`, `/top-faturamento` | O **arquivo fica** — as rotas `/reports/*` são usadas pela página Relatórios |
| `src/frontend/buildAdminDashboardViewModel.ts` | **Zero referências no projeto inteiro** | Já era órfão; o diretório `src/frontend/` só tem esse arquivo e some junto |
| `getAdminDashboardSnapshot` em `src/services/AdminDashboardService.ts` | Único chamador era o controller que sai | As outras exportações do arquivo continuam em uso |

---

## ⚠️ Incertos — Revisar Manualmente

| Item | Situação | Ação sugerida |
|---|---|---|
| `src/routes/admin-dashboard-conferences.ts` + `src/controllers/AdminDashboardConferenceController.ts` + registro em `server.ts:149` | O endpoint `GET /api/dashboard/admin/conferences/summary` **não tem nenhum consumidor no repositório**. O `fetchConferenceSummary` do frontend chama `/conferencias/summary`, que é outra rota. | Endpoint público sem cliente conhecido. Remover é seguro dentro do repo, mas se algo externo (script, Postman, integração) consumir essa URL, ela some. **Recomendo remover**, mas fica destacado para sua decisão. |

> O **serviço** `AdminDashboardConferenceService` **não** entra: ele é usado pelo
> `ReportDataFactory` e fica.

---

## ❌ Falsos Positivos — Manter

| Arquivo | Motivo do descarte |
|---|---|
| `src/services/AdminDashboardService.ts` | `ReportDataFactory` importa `buildAdminDashboardSnapshot`, `fetchAllAdminDashboardRecords`, `formatPeriod` e `mapToDashboardRecord` — é a base da página **Relatórios** |
| `src/services/AdminDashboardConferenceService.ts` | `ReportDataFactory` importa `getConferenceSummary` |
| `src/services/DashboardMetricsService.ts` | Usado por `AdminDashboardService.buildAdminDashboardSnapshot` (que fica) |
| `src/services/AdminDashboardArchitecture.ts` | Usado por `AdminDashboardService` (idem) |
| `src/services/AdminDashboardRequirements.ts` | Usado por `AdminDashboardService` e por `AdminDashboardArchitecture` |
| `src/services/DashboardLayoutBlueprint.ts` | Usado por `AdminDashboardArchitecture` |
| `src/controllers/AdminDashboardReportController.ts` | Serve `/dashboard/admin/reports/*`, chamado por `pages/Relatorios.tsx` e `services/relatorios.ts` |
| `frontend/src/services/conferences-modules.ts` | Também usado por `pages/Conferencias.tsx` e `pages/Administracao.tsx` |
| `frontend/src/components/sped/ResultsDashboard.tsx` | Da tela de SPED; só coincide no nome |

---

## Efeito colateral positivo

`frontend/src/pages/__tests__/Home.test.tsx` **já falha hoje** (é uma das 2 falhas do
baseline): ele espera 5 cards na Home, na ordem
`['/dashboard', '/conferencias', '/clientes', '/dctf', '/relatorios']`, e a página tem
7 numa ordem diferente. O teste ficou para trás de alterações antigas.

Ao remover o card "Dashboard" sobram 6, e vou atualizar a expectativa do teste para o
que a Home realmente tem. Isso transforma uma falha pré-existente em teste verde —
**mas é uma mudança de expectativa de teste**, então fica registrada aqui em vez de
passar despercebida no diff.

---

## Endpoints que deixam de existir

| Método | Rota | Consumidor conhecido |
|---|---|---|
| GET | `/api/dashboard/admin/snapshot` | nenhum (o service do frontend que a chamava já era morto) |
| GET | `/api/dashboard/admin/enhanced` | só a página `/dashboard` |
| GET | `/api/dashboard/admin/top-faturamento` | só a página `/dashboard` |
| GET | `/api/dashboard/admin/conferences/summary` | nenhum — ver "Incertos" |

**Continuam existindo:** `/api/dashboard/admin/reports/*` (todas), usadas pela página
Relatórios.

---

---

# EXECUTADO — 20/08/2026

Decisão do usuário: **"na parte Admin fica intacto, apenas a página dashboard"**.
Removi **só o frontend**. O backend inteiro (controllers, services e rotas com
"AdminDashboard" no nome) ficou como estava.

## Removido

| Item | Detalhe |
|---|---|
| `frontend/src/pages/AdminDashboard.tsx` | a página |
| `frontend/src/components/Dashboard/` | 9 componentes; a pasta deixou de existir |
| `frontend/src/services/enhancedDashboard.ts` | consumido só pela página |
| `frontend/src/services/dashboard.ts` | já era morto antes desta limpeza |
| `frontend/src/services/index.ts` | linha que reexportava `fetchAdminDashboardSnapshot` |
| `frontend/src/router/index.tsx` | rota `dashboard` + o import da página |
| `frontend/src/components/Layout/Header.tsx` | item de menu + import `Squares2X2Icon` |
| `frontend/src/components/Layout/Sidebar.tsx` | item de menu + import `Squares2X2Icon` |
| `frontend/src/pages/Home.tsx` | card "Dashboard" + import `Squares2X2Icon` |

Também: comentário desatualizado em `pages/DCTF.tsx` que citava o Dashboard como
origem do `?search=` (o comportamento fica — `/dctf?search=X` segue valendo como link
direto), expectativa do `Home.test.tsx` alinhada aos 6 cards reais, e a seção 9 do
`docs/MAPEO_PROJETO.md` reescrita.

## Resultado medido

| Verificação | Antes | Depois |
|---|---|---|
| Testes backend | 267 passando | 267 passando |
| Testes frontend | 122 passando, **2 falhando** | **123 passando, 1 falhando** |
| `tsc -b` frontend | 96 linhas de erro | **92** |
| Arquivos | — | **12 arquivos a menos** |

A falha que sumiu é o `Home.test.tsx`, que já estava vermelho antes por expectativa
desatualizada. A que resta (`DCTFList.test.tsx`) é pré-existente e não tem relação.

## Deixado no backend, por decisão sua

Estes três ficaram **sem consumidor nenhum** depois da remoção do frontend. Não fazem
mal — respondem a endpoints que ninguém chama —, mas são código morto a partir de agora:

| Arquivo | Situação |
|---|---|
| `src/controllers/AdminDashboardController.ts` | seus 3 handlers (`snapshot`, `enhanced`, `top-faturamento`) perderam o único cliente |
| `src/services/EnhancedDashboardService.ts` | importado apenas pelo controller acima |
| `src/frontend/buildAdminDashboardViewModel.ts` | já tinha zero referências antes desta limpeza |

E permanece o ⚠️ de antes: `GET /api/dashboard/admin/conferences/summary`
(`src/routes/admin-dashboard-conferences.ts` + `AdminDashboardConferenceController`)
segue registrado sem nenhum consumidor no repositório.

Se quiser limpar isso depois, é uma segunda rodada de 4 arquivos + 3 linhas de rota +
1 registro no `server.ts`. Nada disso toca o `AdminDashboardService` nem os demais,
que são a base dos **Relatórios**.
