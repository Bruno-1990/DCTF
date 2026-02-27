# Plano do Módulo DIRF (em aberto)

Módulo para processamento de XMLs eSocial **S-5002 (evtIrrfBenef)** e agregação de rendimentos/verbas por CPF, mês e ano (base para DIRF).

---

## O que já está feito

### Backend (API)

| Item | Arquivo(s) | Descrição |
|------|------------|-----------|
| Rotas | `src/routes/dirf.ts` | `GET /api/dirf/verbas`, `POST /api/dirf/parse` |
| Controller | `src/controllers/DirfController.ts` | Upload multipart (até 100 XMLs, 5MB cada), parse e resposta JSON |
| Parser S-5002 | `src/services/dirf/parse-s5002.ts` | Extrai `evtIrrfBenef`, agrega por CPF → período → tpInfoIR; retorna `porCpf`, `arquivosProcessados`, `errosPorArquivo` |
| Verbas (tpInfoIR) | `src/services/dirf/tpInfoIR-descricao.ts` | Mapa de códigos → descrição (ex.: 11 = Remuneração mensal, 31 = Retenção IR mensal) |
| Barrel | `src/services/dirf/index.ts` | Exporta `parseAndAggregate`, `TP_INFO_IR_DESCRICAO`, tipos |
| Server | `src/server.ts` | Monta rotas em `/api/dirf` |

### Frontend (parcial)

| Item | Arquivo(s) | Descrição |
|------|------------|-----------|
| Serviço API | `frontend/src/services/dirf.ts` | `parseXmls(files)`, `getVerbas()`, tipos `DirfParseResult`, `CpfAgregado`, `MesAgregado` |

### Documentação

| Item | Arquivo(s) | Descrição |
|------|------------|-----------|
| Layout S-5002 | `docs/dirf/layout-s5002.md` | Estrutura do evento, ideEvento, ideTrabalhador, dmDev, infoIR, totApurMen, tabela tpInfoIR |

---

## Em aberto (plano)

### 1. Tela DIRF no frontend (prioridade alta)

- **Página:** Nova página (ex.: `frontend/src/pages/Dirf.tsx` ou `DirfPage.tsx`).
- **Funcionalidades:**
  - Área de upload de arquivos `.xml` (arrastar/soltar ou seletor; múltiplos arquivos).
  - Botão “Processar” que chama `parseXmls(files)`.
  - Exibição de erros por arquivo (`errosPorArquivo`), se houver.
  - Resultado: lista ou tabela por **CPF** com:
    - Total do ano;
    - Detalhamento por **mês** (perApur/perRef) e por **verba** (tpInfoIR com descrição via `getVerbas()`).
  - Opcional: filtro por CPF, export para Excel/CSV.

### 2. Rota e menu

- **Rota:** Adicionar em `frontend/src/router/index.tsx` (ex.: `path: 'dirf'`, elemento `<Dirf />`).
- **Menu:** Incluir item “DIRF” (ou “DIRF / XML S-5002”) no menu lateral/navegação (em `Layout` ou componente de menu), apontando para `/dirf`.

### 3. Melhorias opcionais (backlog)

- **Persistência:** Salvar resultado do parse em MySQL (tabelas tipo `dirf_importacao`, `dirf_por_cpf`, `dirf_verbas_mes`) para histórico e relatórios.
- **Vínculo com cliente:** Associar CPFs a clientes (CNPJ) para relatório por cliente.
- **Exportação:** Gerar arquivo no formato esperado pela Receita (se houver layout oficial de entrega) ou Excel para conferência.
- **Validações:** Validar CPF, período (AAAA-MM), valores negativos ou duplicados entre XMLs.
- **Testes:** Testes unitários para `parse-s5002.ts` (XML de exemplo) e testes de integração para `POST /api/dirf/parse`.

---

## Resumo rápido

| Área        | Status   | Próximo passo |
|------------|----------|----------------|
| API parse/verbas | ✅ Feito | — |
| Serviço frontend | ✅ Feito | — |
| Página DIRF      | ❌ Em aberto | Criar página com upload + tabela por CPF/mês/verba |
| Rota + menu      | ❌ Em aberto | Adicionar rota `/dirf` e item no menu |
| Persistência/export | 🔲 Backlog | Definir se haverá BD e formato de export |

---

*Atualizado com base no código em: `src/routes/dirf.ts`, `src/controllers/DirfController.ts`, `src/services/dirf/`, `frontend/src/services/dirf.ts`, `frontend/src/router/index.tsx`.*
