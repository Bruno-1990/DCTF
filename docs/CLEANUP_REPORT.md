# Relatório de Limpeza – DCTF MPC

Ferramentas de análise de código e dependências para reduzir “lixo” no projeto.

## Comandos npm

| Comando | Ferramenta | O que faz |
|--------|------------|-----------|
| `npm run lint:unused` | [knip](https://github.com/webpro/knip) | Arquivos, exports e tipos não usados; dependências não referenciadas |
| `npm run deps:check` | [depcheck](https://github.com/depcheck/depcheck) | Dependências do package.json não usadas no código |

Configuração: `knip.json` (entry da aplicação e ignores) e `.depcheckrc.json` (ignores de pacotes).

---

Gerado a partir de `npm run lint:unused` (knip) e `npm run deps:check` (depcheck).  
Atualize este relatório após rodar as ferramentas novamente.

---

## Como rodar a análise

```bash
npm run lint:unused   # knip: arquivos/exports/deps não usados
npm run deps:check   # depcheck: dependências não referenciadas no código
```

---

## 1. Arquivos não usados (knip – 18)

Estes arquivos **não são importados** a partir do entry (`src/index.ts` → `src/server.ts`).  
Podem ser rotas/controllers desativados ou código legado.

| Arquivo | Observação |
|---------|------------|
| `src/controllers/DCTFCodesController.ts` | Controller DCTF Codes |
| `src/controllers/FiscalCalculationController.ts` | Cálculo fiscal |
| `src/controllers/PerformanceController.ts` | Performance |
| `src/middleware/auth.ts` | Middleware de auth |
| `src/models/Analise.ts` | Model Analise |
| `src/models/index.ts` | Barrel de models |
| `src/routes/dctf-codes.ts` | Rotas DCTF Codes |
| `src/routes/fiscal-calculation.ts` | Rotas cálculo fiscal |
| `src/routes/performance.ts` | Rotas performance |
| `src/routes/sped_correcoes.ts` | Rotas SPED correções |
| `src/services/AuthService.ts` | Serviço de autenticação |
| `src/services/ConsultaProgressService.ts` | Progresso de consulta |
| `src/services/DCTFReportService.ts` | Relatório DCTF |
| `src/services/ModelFactory.ts` | Factory de models |
| `src/services/PerformanceMonitoringService.ts` | Monitoramento performance |
| `src/services/irpf-producao/index.ts` | Barrel IRPF produção |
| `src/services/irpf-producao/ux-copy.ts` | Textos UX IRPF |
| `src/services/conferences/modules/DivergenciasValoresModule.ts` | Módulo conferências |

**Ação sugerida:** Confirmar se a funcionalidade foi desativada; se sim, mover para `src/_archive/` ou remover após backup.

---

## 2. Dependências não usadas (knip)

| Pacote | Tipo | Observação |
|--------|------|------------|
| `@types/express-rate-limit` | dependency | Só remover se não usar rate-limit |
| `@types/xlsx` | dependency | Tipos do xlsx |
| `ioredis` | dependency | Redis – verificar se BullMQ usa; pode ser opcional |
| `winston` | dependency | Logger – verificar se está em uso |
| `@types/uuid` | devDependency | Tipos do uuid |

**Ação sugerida:** Antes de remover, buscar no código: `ioredis`, `winston`. Se não forem usados, `npm uninstall ioredis winston` (e tipos).

---

## 3. Depcheck (dependências)

- **Não usadas:** `ioredis`, `winston`
- **Faltando (apenas em testes):** `@jest/globals` – costuma vir do ambiente Jest; pode ignorar no depcheck ou adicionar ao `ignores` se der falso positivo.

---

## 4. Exports não usados (knip – resumo)

Dezenas de exports (funções, classes, constantes) que nenhum outro arquivo importa.  
Útil para limpar gradualmente (remover export ou usar o símbolo em algum lugar).

Exemplos: `ReportPdfService`, `ReportXlsxService`, `EmailService`, helpers em `dec-writers`, `SitfDataExtractorService`, etc.  
Relatório completo: rodar `npm run lint:unused`.

---

## 5. Scripts one-off (não analisados pelo knip)

Os scripts em `src/scripts/` são **entry points** (rodados via `npm run …`), não importados pela aplicação.  
Não são “não usados”, mas muitos são de **migração/correção única**.  
Candidatos a arquivar (mover para `scripts/archive/` e remover do `package.json` quando não forem mais necessários):

- Migração/código Supabase: `migrate-to-mysql`, `align-mysql-with-supabase`, `get-supabase-schema`, `remove-clientes-dependencies-supabase`, `compare-schemas`, `fix-cliente-id-nullable`, `migrate-sitf-downloads`, `run-sitf-migration`, `run-teste-png-migration`, `sync-schema-from-db`, `update-schema-from-query`
- Criação de tabelas (já aplicada): `create-host-dados-table`, `create-banco-horas-table`, `create-sitf-tables`, `create-receita-tables`, `create-sped-v2-legal-documents-tables`, `create-irpf-producao-tables`
- Limpeza/correção pontual: `limpar-registros-duplicados`, `corrigir-razoes-sociais-cnpj`, `identificar-registros-incorretos`, `remover-registros-com-cnpj-na-razao`, `remover-clientes-recentes`, vários `verificar-*`, `fix-clientes-schema`, `atualizar-socios-zerados`, `migrate-clientes-receitaws-fields`
- Setup antigo: `apply-dctf-constraints`, `apply-performance-indexes`, `setup-dctf-codes`, `populate-dctf-codes`

**Ação sugerida:** Manter em `src/scripts/` até ter certeza que não serão mais rodados; depois mover para `scripts/archive/` e remover os comandos do `package.json`.

---

## 6. Documentação (.md) arquivada

Documentos movidos para `docs/archive/` por serem obsoletos ou apenas históricos (correções pontuais, análises antigas).  
Ver `docs/archive/README.md`.

---

## 7. Próximos passos

1. Revisar os 18 arquivos “não usados” e decidir: arquivar ou remover.
2. Confirmar uso de `ioredis` e `winston`; se não usados, remover do `package.json`.
3. Limpar exports não usados aos poucos (knip indica linha e nome).
4. Periodicamente rodar `npm run lint:unused` e `npm run deps:check` e atualizar este relatório.
