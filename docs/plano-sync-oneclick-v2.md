# Plano — Repontar sincronização de clientes: OneClick antigo (v1/MySQL) → OneClick de produção (PostgreSQL/VPS)

> Objetivo: o DCTF Analyzer (DCTF_MPC) hoje sincroniza clientes lendo do **OneClick v1**
> (MySQL `db_intranet`, tabela `ger_cad_cli`). Precisamos repontar para o **OneClick de
> produção atual** (PostgreSQL na VPS).
>
> Investigação: 2026-07-07. **Fonte correta confirmada empiricamente:** banco `oneclick`,
> schema **`public`**, tabela **`public.clientes`** (1.345 clientes; 761 MENSAIS).

> ✅ **Conectividade (§4.1) resolvida:** túnel SSH via Tarefa Agendada do Windows
> `OneClick-DCTF-Tunnel` (scripts em `VPS HOSTINGER/oneclick-tunnel/`). Desde 2026-07-08
> o app **sobe o túnel sozinho** ao clicar em OneClick se estiver caído — ver
> `docs/ONECLICK_TUNNEL_AUTOHEAL.md`.

---

## 0. ⚠️ Correção importante da 1ª versão deste plano

A 1ª versão apontava para `tenant_05121506000172.empresas` (schema-per-tenant, do código
"ONECLICK V2" Turborepo local). **Isso estava errado.** Rastreando onde o app **realmente grava**
(row counts + timestamps de hoje + conexões ativas), a verdade é:

- O OneClick que roda na VPS **não é** o Turborepo `empresas`/multi-tenant. É um OneClick
  **single-schema `public`**, muito mais maduro (agenda, caixa postal, DTe, folha, Omie, drive sync…).
- A tabela `tenant_*.empresas` está **vazia e é vestigial**. Ignorar.
- Os clientes de verdade estão em **`public.clientes`** (1.345 linhas, gravação ativa hoje).

---

## 1. Situação atual (AS-IS)

### Fonte antiga — OneClick v1 (MySQL)
- **Conexão:** `mysql2` pool em `src/config/oneclick.ts`. Vars no `.env`:
  `ONECLICK_MYSQL_HOST=192.168.0.7`, `PORT=3306`, `USER=rose`, `DATABASE=db_intranet`.
- **Leitura:** `src/services/OneClickService.ts` → `ger_cad_cli` (colunas `cad_cli_*`),
  filtro `cad_cli_situacao = 2 (Mensal) AND cad_cli_ativo = 1`.
- **Upsert no DCTF:** `src/models/Cliente.ts` → `sincronizarComOneClick(ids?)`.
  Dedup por `cnpj_limpo`; **não-destrutivo** (só preenche campos vazios no UPDATE);
  regime = fonte de verdade → deriva `simples_optante`.
- **Gatilho HTTP:** `GET /api/clientes/oneclick/preview`, `POST /api/clientes/sincronizar-oneclick`.
- **Frontend:** botão "OneClick" em `frontend/src/pages/Clientes.tsx`.

### Destino — DCTF (MySQL, tabela `clientes`)
Colunas alvo: `cnpj_limpo, razao_social, email, telefone, endereco, bairro, municipio, uf,
cep, complemento, regime_tributario, simples_optante, beneficios_fiscais`.

---

## 2. Fonte nova — OneClick prod (PostgreSQL / VPS)

| Item | Valor |
|---|---|
| Host físico | VPS Hostinger `72.60.155.69` |
| Servidor PG | container **`n8n-postgres-1`** (postgres:17, compartilhado com n8n) |
| Porta publicada | **`127.0.0.1:54322`** no host da VPS (⚠️ só localhost) |
| Database | **`oneclick`** (user `oneclick`) |
| Schema | **`public`** (NÃO multi-tenant — ignore `tenant_*`) |
| Tabela de clientes | **`public.clientes`** (1.345 total, **761 MENSAL**) |
| Sócios | `public.socios` (FK `cliente_id`; 60 linhas) |
| Benefícios | `public.cliente_beneficios` (FK `cliente_id`; hoje 0 linhas) |

### Colunas de `public.clientes` relevantes
```
id (text/cuid, PK)   code (int)   razao_social   nome_fantasia
documento (text)     tipo_documento (enum TipoDocumento: CNPJ|CPF)
situacao (enum ClienteSituacao)   status (enum ClienteStatus)
tributacao (enum TaxRegime)       regime (enum RegimeContabil: CAIXA|COMPETENCIA)
inscricao_estadual   inscricao_municipal   cnae_principal
cep  logradouro  numero  complemento  bairro  cidade  uf(char2)
telefone  email   is_active(bool)  deleted_at   id_oneclick  id_omie
created_at  updated_at
```

### Enums
| Enum | Valores |
|---|---|
| `ClienteSituacao` | `MENSAL, EM_CONSTITUICAO, POTENCIAL, AVULSO, PARALIZADO, PRE_OPERACIONAL, PROSPECT` |
| `ClienteStatus` | `ATIVA, INATIVA, SUSPENSA, BAIXADA, INAPTA, NULA` |
| `TipoDocumento` | `CNPJ, CPF` |
| `TaxRegime` (`tributacao`) | `SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, MEI, IMUNE, ISENTA` |
| `RegimeContabil` (`regime`) | `CAIXA, COMPETENCIA` |

> `documento` vem **misto** (formatado `04.900.790/0001-12` e cru `37511891000150`) →
> normalizar sempre para 14 dígitos. Só sincronizar `tipo_documento='CNPJ'` (DCTF é por CNPJ).

---

## 3. Arquitetura alvo (TO-BE)

```
DCTF_MPC (192.168.0.47)
  └─ ClienteModel.sincronizarComOneClick()
       └─ OneClickService (NOVO: driver pg → banco `oneclick`, schema public)
            └─ 127.0.0.1:54322  ──[túnel SSH/autossh]──►  VPS n8n-postgres-1
                                                            db=oneclick  →  public.clientes
```
Direção mantida: **OneClick → DCTF (pull, read-only)**. Upsert por `cnpj_limpo`, não-destrutivo.

### Filtro equivalente ao v1 ("Mensais + Ativos")
> ⚠️ **Multi-tenant por coluna.** `public.clientes.empresa_id` separa os escritórios:
> `cmnn7xm6e00009gqgoii3ims2` (Central Contábil), `jrg-empresa` (Brasília/GO) e um tenant
> de demo. Toda query de sincronização **precisa** filtrar por `empresa_id` — ver
> `EMPRESA_ID_CENTRAL` / `getEmpresaId()` em `src/services/oneclick.mappers.ts`
> (override por `ONECLICK_EMPRESA_ID`). Sem isso o preview trazia ~950 clientes
> (os três tenants) em vez dos ~470 da Central.

```sql
WHERE empresa_id = 'cmnn7xm6e00009gqgoii3ims2'
  AND situacao = 'MENSAL'
  AND status   = 'ATIVA'
  AND is_active = true
  AND deleted_at IS NULL
  AND tipo_documento = 'CNPJ'
  AND documento IS NOT NULL AND btrim(documento) <> ''
```
> Hoje há 761 MENSAL. Confirmar se o filtro deve ser `status='ATIVA'` ou aceitar todos os MENSAL.

---

## 4. Infra (decisões / setup)

1. **Conectividade** DCTF (LAN `192.168.0.47`) → PG VPS (`127.0.0.1:54322`, só localhost):
   **(Recomendado) túnel SSH persistente** via `autossh` como serviço:
   `autossh -M 0 -N -L 54322:127.0.0.1:54322 root@72.60.155.69`
   → DCTF conecta em `127.0.0.1:54322`. Nada exposto publicamente.
2. **Role read-only** no PG (não usar `oneclick`/superuser):
   ```sql
   CREATE ROLE dctf_ro LOGIN PASSWORD '********';
   GRANT CONNECT ON DATABASE oneclick TO dctf_ro;
   GRANT USAGE ON SCHEMA public TO dctf_ro;
   GRANT SELECT ON public.clientes, public.socios, public.cliente_beneficios TO dctf_ro;
   ```
3. Schema é `public` (default) → **não precisa** de `search_path` especial.

---

## 5. Mapeamento de campos (`public.clientes` → DCTF `clientes`)

| DCTF (`clientes`) | OneClick (`public.clientes`) | Transformação |
|---|---|---|
| `cnpj_limpo` | `documento` | `replace(/\D/g,'')`, exigir 14 dígitos (`tipo_documento='CNPJ'`) |
| `razao_social` | `razao_social` | — |
| `email` | `email` | 1º email se houver vírgula |
| `telefone` | `telefone` | — |
| `endereco` | `logradouro` + `numero` | `[logradouro, numero].filter(Boolean).join(', ')` |
| `bairro` | `bairro` | — |
| `municipio` | `cidade` | — |
| `uf` | `uf` | `toUpperCase()` |
| `cep` | `cep` | `replace(/\D/g,'')` |
| `complemento` | `complemento` | — |
| `regime_tributario` | `tributacao` (enum) | ver mapa abaixo |
| `simples_optante` | (derivado) | `/simples/i.test(regime) ? 1 : 0` |
| `beneficios_fiscais` | `public.cliente_beneficios` (JOIN por `cliente_id`) | hoje 0 linhas — no-op até popular |

### Mapa de regime (`tributacao` → `regime_tributario` DCTF)
| `tributacao` | DCTF |
|---|---|
| `SIMPLES_NACIONAL` | `SIMPLES NACIONAL` |
| `MEI` | `SIMPLES NACIONAL` *(como no legado; ou `MEI` — decidir)* |
| `LUCRO_PRESUMIDO` | `LUCRO PRESUMIDO` |
| `LUCRO_REAL` | `LUCRO REAL` |
| `IMUNE` | `IMUNE` |
| `ISENTA` | `ISENTA` |
| `null` | `null` |
> Regime sempre **MAIÚSCULO**; `simples_optante` derivado.

### Sócios (opcional, se o sync de sócios for desejado)
`public.socios` (FK `cliente_id`): `nome_completo, cpf, participacao, tipo_socio, …` →
mapear para `clientes_socios` do DCTF (equivale ao QSA). **Fora do escopo mínimo**; decidir.

---

## 6. Mudanças de código (contrato HTTP intacto)

### 6.1 Dependência
- `pnpm add pg @types/pg` (hoje só existe `mysql2`).

### 6.2 `.env` (DCTF) — trocar bloco OneClick
```
# OneClick prod (PostgreSQL na VPS, via túnel SSH → 127.0.0.1:54322)
ONECLICK_PG_HOST=127.0.0.1
ONECLICK_PG_PORT=54322
ONECLICK_PG_USER=dctf_ro
ONECLICK_PG_PASSWORD=********
ONECLICK_PG_DATABASE=oneclick
# schema = public (default)
```
> Manter `ONECLICK_MYSQL_*` comentado para rollback rápido.

### 6.3 `src/config/oneclick.ts`
Trocar `mysql2` por `pg.Pool` (host/port/user/password/database, `max: 3`). Schema `public` (default).

### 6.4 `src/services/OneClickService.ts`
- `OneClickCliente`: `id: string` + novos campos (`documento`, `razao_social`, `logradouro`,
  `numero`, `bairro`, `cidade`, `uf`, `tributacao`).
- `buscarClientesMensaisAtivos()`:
  ```sql
  SELECT id, code, documento, razao_social, email, telefone,
         logradouro, numero, bairro, cidade, uf, cep, complemento, tributacao
  FROM public.clientes
  WHERE situacao='MENSAL' AND status='ATIVA' AND is_active AND deleted_at IS NULL
    AND tipo_documento='CNPJ' AND documento IS NOT NULL AND btrim(documento) <> ''
  ORDER BY razao_social
  ```
  (placeholders `$1`, driver `pg`).
- `buscarClientesPorIds(ids: string[])` → `id` é **text/cuid** (não int). Ajustar assinatura.
- `buscarBeneficiosPorClienteIds` → JOIN em `public.cliente_beneficios` por `cliente_id`
  (ou no-op enquanto 0 linhas).

### 6.5 `src/models/Cliente.ts` → `sincronizarComOneClick`
- Substituir `regimeMap` numérico pelo **mapa de enum** (§5).
- Ajustar nomes de campo (`documento`, `logradouro/numero`, `cidade`, `tributacao`).
- `ids` passam a ser `string[]` (cuid).

### 6.6 Controller / rotas / frontend
- Sem mudança de contrato. Conferir só o `previewOneClick` (colunas exibidas).

### 6.7 Script de regime
- `src/scripts/preencher-regime-via-oneclick.ts` → atualizar para a nova query/enum.

---

## 7. Passo a passo

1. **[Infra]** Criar role `dctf_ro` + túnel SSH; validar `psql` do host DCTF em `127.0.0.1:54322`.
2. **[Código]** `pnpm add pg @types/pg`.
3. **[Código]** Reescrever `config/oneclick.ts` (pg).
4. **[Código]** Reescrever `OneClickService.ts` (queries `public.clientes` + interface).
5. **[Código]** Ajustar `sincronizarComOneClick` (mapa enum, campos).
6. **[Config]** Atualizar `.env` / `.env.example`.
7. **[Teste]** `GET /oneclick/preview` → validar amostra dos 761. Depois `POST /sincronizar-oneclick`.
8. **[Validação]** Conferir na tabela `clientes` do DCTF (fonte de verdade).

---

## 8. Testes & rollback

- **Preview primeiro** (não grava). **Upsert não-destrutivo** (só preenche vazios) → baixo risco.
- **Rollback:** reverter `.env` + `config/oneclick.ts` para o MySQL v1 (código antigo em branch).
- **Read-only garantido:** role `dctf_ro` só tem `SELECT`.

---

## 9. Decisões em aberto

1. Conectividade: túnel SSH (recomendado) vs. expor porta vs. via API do OneClick?
2. Filtro: `situacao='MENSAL' AND status='ATIVA'` — ou incluir outros `status`/`situacao`?
3. `MEI` → `SIMPLES NACIONAL` (como legado) ou manter `MEI`?
4. `beneficios_fiscais`: descontinuar (tabela vazia hoje) ou sincronizar de `cliente_beneficios`?
5. Sócios: sincronizar `public.socios` → `clientes_socios` do DCTF, ou fora de escopo?
