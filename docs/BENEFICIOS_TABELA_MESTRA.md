# Benefícios Fiscais — tabela mestra de tipos

> Catálogo central dos **tipos** de benefício fiscal (ex.: `SUBSTITUTO`, `FUNDAP`,
> `COMPETE ATACADISTA`). Serve para listar os benefícios em qualquer tela sem
> precisar varrer a tabela `clientes` — basta um `SELECT` na tabela `beneficios`.
>
> Implementado em 2026-07-16.

---

## Por que existe

Antes, a lista de tipos de benefício era **derivada em memória** dos clientes
carregados na página (`split` da string `clientes.beneficios_fiscais`). Isso deixava
a lista **incompleta** (só via os tipos dos clientes da página atual) e obrigava a
consultar clientes só para montar um dropdown.

Agora há uma **tabela mestra** `beneficios`. Qualquer tela que precise listar os
tipos disponíveis (filtro, sugestões de autocomplete, etc.) consome um endpoint
que lê só essa tabela.

> **Escopo:** só a tabela mestra de **tipos**. A associação cliente ↔ benefício
> continua na coluna string `clientes.beneficios_fiscais` (separada por vírgula) —
> **não** foi normalizada em tabela de junção. OneClick e as VIEWs de comparação
> Compete/Invest não foram alterados.

---

## Banco de dados

**Tabela `beneficios`** (MySQL 8, banco `DCTF_WEB`):

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK |
| `nome` | `VARCHAR(120)` | **UNIQUE** (`uq_beneficios_nome`), sempre MAIÚSCULO |
| `ativo` | `TINYINT(1)` | default `1`; só ativos são listados |
| `created_at` / `updated_at` | `TIMESTAMP` | automáticos |

### Migration e seed

- SQL: `docs/migrations/mysql/034_create_beneficios.sql` (`CREATE TABLE IF NOT EXISTS`, idempotente).
- Runner + seed: `src/scripts/run-beneficios-migration.ts`.

```bash
npm run migrate:beneficios
```

O runner cria a tabela e faz o **seed** a partir dos tipos distintos já presentes
em `clientes.beneficios_fiscais` (split por vírgula → trim → MAIÚSCULO → dedup →
`INSERT IGNORE`). Pode ser reexecutado com segurança (idempotente).

> ⚠️ **Pegadinha do runner:** `src/config/index.ts` não carrega dotenv. O runner
> chama `dotenv.config({ path: <root>/.env })` **antes** de importar `mysqlPool`
> (ts-node compila CommonJS, então a ordem é respeitada). Sem isso, cai no default
> `root` sem senha → `ER_ACCESS_DENIED`.

---

## API

Rotas em `src/routes/beneficios.ts` (montado em `/api/beneficios` no `src/server.ts`).
Controller: `src/controllers/BeneficiosController.ts`. Service:
`src/services/BeneficiosService.ts`. Model: `src/models/BeneficioTipo.ts`.

### `GET /api/beneficios/tipos`

Lista os tipos ativos, ordenados por nome.

```json
{ "success": true, "data": [ { "id": 7, "nome": "FUNDAP" }, { "id": 6, "nome": "SUBSTITUTO" } ] }
```

### `POST /api/beneficios/tipos`

Upsert de um tipo. Normaliza para MAIÚSCULO; se já existir, retorna o existente
(não duplica). Nome vazio → **400**.

```jsonc
// req: { "nome": "fundap" }
{ "success": true, "data": { "id": 7, "nome": "FUNDAP" } }
```

---

## Frontend

- Service: `frontend/src/services/beneficios.ts` → `beneficiosService.listarTipos()` e
  `beneficiosService.criarTipo(nome)`.
- Página `frontend/src/pages/Clientes.tsx`:
  - `tiposBeneficioDistintos` agora é **estado** carregado via `listarTipos()` num
    `useEffect` (antes era `useMemo` derivado de `clientes`).
  - Alimenta o **dropdown de filtro** (ordenação "Benefício Fiscal" → "Tipo de Benefício")
    e as **sugestões de autocomplete** no painel de edição do cliente.
  - Ao cadastrar um benefício **novo** (não existente na lista), chama `criarTipo(nome)`
    para persistir na tabela mestra e já refletir nas sugestões.

A associação do cliente continua sendo salva na string `beneficios_fiscais` via
`PUT /api/clientes/:id` (comportamento inalterado).

---

## Arquivos

| Camada | Arquivo |
|--------|---------|
| Migration | `docs/migrations/mysql/034_create_beneficios.sql` |
| Seed/runner | `src/scripts/run-beneficios-migration.ts` (`npm run migrate:beneficios`) |
| Model | `src/models/BeneficioTipo.ts` |
| Service | `src/services/BeneficiosService.ts` (`listarTipos`, `criarTipo`) |
| Controller | `src/controllers/BeneficiosController.ts` (`listarTipos`, `criarTipo`) |
| Rotas | `src/routes/beneficios.ts` (`GET`/`POST /tipos`) |
| Frontend service | `frontend/src/services/beneficios.ts` |
| Frontend página | `frontend/src/pages/Clientes.tsx` |
