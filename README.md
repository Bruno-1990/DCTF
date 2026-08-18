<div align="center">

# 📦 DCTF_MPC

**Plataforma web de ferramentas fiscais para conferência, validação e gestão de obrigações tributárias brasileiras.**

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📋 Índice

- [Sobre](#-sobre)
- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura](#-arquitetura)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Pré-requisitos](#%EF%B8%8F-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Como Rodar](#%EF%B8%8F-como-rodar)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Testes](#-testes)
- [Deploy](#-deploy)
- [API Backend](#-api-backend)
- [Rotas do Frontend](#-rotas-do-frontend)
- [Fluxo de PR](#-fluxo-de-pr)
- [Resumo Técnico](#-resumo-técnico)
- [Licença](#-licença)

---

## 🧐 Sobre

Sistema completo de gestão fiscal para escritórios de contabilidade brasileiros. Processa e valida obrigações tributárias como **DCTF** (Declaração de Débitos e Créditos Tributários Federais), **SPED** (Sistema Público de Escrituração Digital), **IRPF** (Imposto de Renda Pessoa Física) e integra com sistemas legados como **SCI** (via Firebird).

**Origem dos dados de DCTF:** um projeto separado de **scraping do e‑CAC** coleta as declarações direto no portal da Receita e grava na tabela de aterrissagem `scrapecac` (banco local MySQL `DCTF_WEB`). O `DCTFSyncService` então consome `scrapecac` e popula a tabela de declarações `dctf_declaracoes`, que é a fonte consumida pelo frontend. Veja [Pipeline de dados DCTF](#-pipeline-de-dados-dctf).

**Principais funcionalidades:**
- Ingestão de DCTFs via scraping do e‑CAC (`scrapecac` → `dctf_declaracoes`)
- Conferência automatizada de declarações DCTF
- Validação e correção de arquivos SPED com motor Python (50+ regras)
- Dashboard administrativo com métricas fiscais e gráficos
- Gestão de clientes com sync automático via OneClick/MySQL
- Consulta de situação fiscal na Receita Federal
- Geração de relatórios Excel/PDF
- Módulo IRPF 2026 com área do cliente e painel admin
- Banco de horas via integração Firebird SCI
- Comunicação em tempo real via WebSocket (Socket.io)

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, React Router v6 |
| **Estado (client)** | Zustand, React Query (@tanstack/react-query) |
| **Backend** | Node.js 20, Express 4, TypeScript |
| **Banco de Dados** | MySQL 8.0 (principal), Firebird (SCI) |
| **Ingestão DCTF** | Scraping do e‑CAC → `scrapecac` → `dctf_declaracoes` (MySQL) |
| **Autenticação** | JWT (jsonwebtoken), bcryptjs |
| **Tempo real** | Socket.io |
| **Automação Python** | pandas, openpyxl, fdb (Firebird), pdfplumber |
| **Infra** | Docker, Docker Compose |
| **CI/CD** | GitHub Actions |
| **Testes** | Jest + ts-jest (backend), Vitest (frontend), Supertest (integração) |
| **Qualidade** | ESLint, Prettier, Knip, Depcheck |
| **Logs** | Winston |

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                 │
│               localhost:5173 (dev) / :80 (prod)         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                Backend (Express + TypeScript)            │
│                     localhost:38572                      │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐            │
│  │ Routes  │→ │Controllers│→ │  Services  │            │
│  │ (26)    │  │  (28)     │  │   (72)     │            │
│  └─────────┘  └──────────┘  └─────┬──────┘            │
│                                    │                    │
│  ┌─────────────────────────────────┼──────────────┐    │
│  │         Integrações             │              │    │
│  │  ┌───────┐ ┌─────────┐ ┌──────▼───────┐       │    │
│  │  │MySQL  │ │scrapecac│ │Python Scripts │       │    │
│  │  │(13    │ │(e-CAC   │ │(16 scripts)  │       │    │
│  │  │models)│ │ landing)│ │spawn/exec    │       │    │
│  │  └───────┘ └─────────┘ └──────────────┘       │    │
│  │  ┌───────┐ ┌────────┐ ┌──────────────┐       │    │
│  │  │Firebird│ │ n8n    │ │  Socket.io   │       │    │
│  │  │(SCI)  │ │Webhook │ │ (real-time)  │       │    │
│  │  └───────┘ └────────┘ └──────────────┘       │    │
│  └───────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

O backend spawna scripts Python para tarefas pesadas (validação SPED, extração de PDFs, consultas Firebird), comunicando-se via stdout JSON.

### 🔄 Pipeline de dados DCTF

```
┌──────────────────────┐   scraping    ┌──────────────────────┐   DCTFSyncService   ┌──────────────────────┐
│   Portal e-CAC (RFB)  │ ────────────▶ │  scrapecac (MySQL)    │ ──────────────────▶ │ dctf_declaracoes      │
│  (projeto separado de │   coleta as   │  banco local /        │  consome por `id`,  │ (tabela consumida     │
│   scraping eCAC)      │  declarações  │  tabela de aterrissagem│  insere o que falta │  pelo frontend)       │
└──────────────────────┘               └──────────────────────┘                     └──────────────────────┘
```

1. O projeto de **scraping do e‑CAC** (repositório separado) coleta as declarações direto no portal da Receita e grava em `scrapecac` no MySQL `DCTF_WEB` — a tabela de aterrissagem ("banco local").
2. O **`DCTFSyncService.syncFromScrapecac`** lê `scrapecac` em lotes e insere em `dctf_declaracoes` usando o mesmo `id` (CHAR(40)) como chave; registros já existentes são ignorados (nunca sobrescreve/apaga o destino).
3. O disparo do sync fica no painel **Administração** (`/administracao`).

> **Nota:** a sincronização antiga via **Supabase** foi descontinuada. A única fonte de DCTF hoje é o scraping do e‑CAC. O `scrapecac` é uma tabela de aterrissagem (pode ser limpa entre coletas); o histórico fica acumulado em `dctf_declaracoes`.

---

## 📁 Estrutura do Projeto

```
DCTF_MPC/
├── src/                          # Backend (Node.js + Express + TypeScript)
│   ├── index.ts                  # Entry point — inicia servidor
│   ├── server.ts                 # Configuração Express (rotas, middleware, CORS)
│   ├── config/                   # Configuração (database, mysql, oneclick)
│   ├── controllers/              # 28 controllers (lógica de requisição)
│   ├── models/                   # 13 models (Sequelize — MySQL)
│   ├── routes/                   # 26 módulos de rotas
│   ├── services/                 # 72 services (lógica de negócio)
│   ├── middleware/               # 6 middlewares (auth, validation, error, logger)
│   ├── types/                    # Definições de tipos TypeScript
│   └── utils/                    # Utilitários (pythonExtractor)
│
├── frontend/                     # Frontend (React + TypeScript + Vite)
│   └── src/
│       ├── App.tsx               # Wrapper principal
│       ├── router/index.tsx      # 24 rotas registradas
│       ├── pages/                # Páginas por funcionalidade
│       ├── components/           # Componentes organizados por domínio
│       │   ├── Clientes/         # Abas de clientes (Acesso, CFOP, eBEF, Export)
│       │   ├── Dashboard/        # Cards, gráficos, filtros do dashboard
│       │   ├── Layout/           # Header, Sidebar, Footer
│       │   ├── SituacaoFiscal/   # Registro detalhado situação fiscal
│       │   ├── UI/               # Componentes base (Button, Input, Modal, Table)
│       │   ├── conferences/      # Seções de conferência DCTF
│       │   └── sped/             # Componentes SPED (upload, validação)
│       ├── contexts/             # Irpf2026AuthContext
│       ├── hooks/                # Hooks customizados (useClientes, useDCTF, useToast)
│       ├── services/             # Camada de API (axios)
│       ├── store/                # Zustand (estado global)
│       ├── types/                # Tipos compartilhados
│       └── utils/                # Utilitários (exportExcel, formatCurrency)
│
├── python/                       # Scripts Python chamados pelo backend
│   ├── buscar_codigo_sci.py      # Busca código SCI no Firebird
│   ├── extract_socios_api.py     # Extrai sócios via API
│   ├── catalog/                  # Consultas ao catálogo SCI
│   └── sped/                     # Validação e correção SPED (50+ regras)
│       ├── aplicar_ajustes.py
│       ├── processar_validacao.py
│       └── v2/                   # SPED V2 (RAG + metadata)
│
├── scripts/                      # Scripts de manutenção e migração
├── tests/                        # Testes (Jest)
│   ├── integration/              # Testes de integração (5 arquivos)
│   ├── services/                 # Testes unitários de services (15 arquivos)
│   └── frontend/                 # Testes de frontend
│
├── docs/                         # Documentação e migrações SQL
│   └── migrations/
├── data/                         # Backups e dados locais
├── docker-compose.*.yml          # Docker (dev e produção)
├── Dockerfile                    # Build multi-stage do backend
└── .github/workflows/ci.yml     # CI (lint, test, build)
```

---

## ⚙️ Pré-requisitos

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **MySQL** 8.x (local ou Docker)
- **Python** 3.10+ com pip (para scripts de validação SPED e integração SCI)
- **Docker** e **Docker Compose** (opcional, para ambiente containerizado)
- **Firebird** client libs (opcional, apenas se usar integração SCI/Banco de Horas)

---

## 🚀 Instalação

```bash
# Clonar o repositório
git clone https://github.com/Bruno-1990/DCTF.git
cd DCTF_MPC

# Instalar dependências do backend
npm install

# Instalar dependências do frontend
cd frontend && npm install && cd ..

# Instalar dependências Python (validação SPED)
pip install openpyxl pandas fdb pdfplumber
```

---

## 🔧 Configuração

### Variáveis de Ambiente

Copie o `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Default | Descrição |
|----------|:-----------:|---------|-----------|
| `PORT` | Não | `38572` | Porta do servidor Express |
| `MYSQL_HOST` | Sim | — | Host do MySQL principal |
| `MYSQL_PORT` | Sim | — | Porta do MySQL |
| `MYSQL_USER` | Sim | — | Usuário MySQL |
| `MYSQL_PASSWORD` | Sim | — | Senha MySQL |
| `MYSQL_DATABASE` | Sim | — | Nome do banco MySQL (contém `scrapecac` e `dctf_declaracoes`) |
| `ONECLICK_MYSQL_*` | Não | — | Conexão MySQL OneClick (sync clientes) |
| `SCI_FB_HOST` | Não | — | Host Firebird SCI |
| `SCI_FB_DATABASE` | Não | — | Path do banco Firebird |
| `SCI_FB_USER` | Não | — | Usuário Firebird |
| `SCI_FB_PASSWORD` | Não | — | Senha Firebird |
| `EMAIL_USER` | Não | — | E-mail SMTP (Gmail) |
| `EMAIL_PASSWORD` | Não | — | App password do Gmail |
| `FRONTEND_URL` | Não | — | URLs permitidas para CORS |
| `IRPF2026_ADMIN_EMAILS` | Não | `ti@central-rnc.com.br,...` | E-mails admin do módulo IRPF |
| `COTA_SCHEDULER_ENABLED` | Não | `false` | Liga a apuração mensal da cota de aprendizagem |
| `COTA_SCHEDULER_DIA` | Não | `5` | Dia do mês em que a apuração roda |
| `COTA_ALERT_EMAILS` | Não | `ti@central-rnc.com.br` | Destinatários do aviso de cota de aprendizagem |
| `ENQUADRAMENTO_ALERT_EMAILS` | Não | `ti@central-rnc.com.br` | Destinatários do aviso de enquadramento de porte |
| `COTA_REFRESH_CADASTRO` | Não | `true` | Atualiza o cadastro pela ReceitaWS antes de apurar |
| `CADASTRO_REFRESH_INTERVALO_MS` | Não | `20000` | Ritmo da varredura cadastral (3 consultas/min) |

---

## ▶️ Como Rodar

### Desenvolvimento

```bash
# Backend (porta 38572)
npm run dev

# Frontend (porta 5173) — em outro terminal
cd frontend && npm run dev
```

### Produção

```bash
# Build do backend
npm run build

# Iniciar em produção
npm run start:production

# Ou via Docker
docker compose -f docker-compose.production.yml up -d
```

---

## 📜 Scripts Disponíveis

### Backend

| Script | Comando | Descrição |
|--------|---------|-----------|
| dev | `npm run dev` | Inicia backend com nodemon + ts-node |
| build | `npm run build` | Compila TypeScript para `dist/` |
| start | `npm start` | Roda build compilado |
| start:production | `npm run start:production` | Produção com NODE_ENV=production |
| test | `npm test` | Roda testes Jest |
| test:watch | `npm run test:watch` | Testes em modo watch |
| lint | `npm run lint` | ESLint no código fonte |
| lint:fix | `npm run lint:fix` | ESLint com auto-fix |
| format | `npm run format` | Prettier no código fonte |
| type-check | `npm run type-check` | Verifica tipos sem emitir |
| lint:unused | `npm run lint:unused` | Knip — detecta código não utilizado |
| deps:check | `npm run deps:check` | Depcheck — detecta deps não utilizadas |
| clean | `npm run clean` | Remove `dist/` |

### Scripts de Manutenção

| Script | Comando | Descrição |
|--------|---------|-----------|
| import:clientes | `npm run import:clientes` | Importa clientes para MySQL |
| verify:duplicados | `npm run verify:duplicados` | Verifica clientes duplicados |
| fix:razoes-sociais | `npm run fix:razoes-sociais` | Corrige razões sociais via CNPJ |
| migrate:irpf2026 | `npm run migrate:irpf2026` | Roda migração IRPF 2026 |
| deploy:dev | `npm run deploy:dev` | Deploy ambiente desenvolvimento |
| deploy:prod | `npm run deploy:prod` | Deploy ambiente produção |

---

## 🧪 Testes

```bash
# Rodar todos os testes
npm test

# Modo watch
npm run test:watch

# Testes Python (SPED)
cd python/sped && pytest tests/
```

### Cobertura de Testes

| Área | Framework | Arquivos de Teste | Tipo |
|------|-----------|:-----------------:|------|
| Services backend | Jest + ts-jest | 15 | Unitário |
| Integração backend | Jest + Supertest | 5 | Integração |
| Frontend | Vitest | — | Unitário |
| Python SPED | pytest | 20 | Unitário |

Testes configurados com `ts-jest`, mapeamento de paths (`@/`), e setup customizado em `tests/setup.ts`.

---

## 🚢 Deploy

### CI/CD — GitHub Actions

O pipeline `.github/workflows/ci.yml` executa em push para `main`/`master` e em PRs:

1. **Backend**: Install → Lint → Type check → Test → Build
2. **Frontend**: Install → Lint → Test → Build

### Docker (Produção)

```bash
# Sobe backend + frontend (Nginx) + MySQL
docker compose -f docker-compose.production.yml up -d
```

Serviços:
- **backend** — Node.js 20 Alpine, porta 38572, health check em `/health`
- **frontend** — Nginx servindo build estático, portas 80/443
- **mysql** — MySQL 8.0 com volume persistente

---

## 🔌 API Backend

26 módulos de rota organizados por domínio:

| Módulo | Endpoint Base | Descrição |
|--------|--------------|-----------|
| `clientes` | `/api/clientes` | CRUD de clientes, sync OneClick |
| `dctf` | `/api/dctf` | Gestão de declarações DCTF |
| `dctf-codes` | `/api/dctf-codes` | Códigos de receita DCTF |
| `sped` | `/api/sped` | Validação SPED V1 |
| `sped-v2` | `/api/sped-v2` | Validação SPED V2 (RAG) |
| `sped_correcoes` | `/api/sped/correcoes` | Aplicar correções SPED |
| `conferencias` | `/api/conferencias` | Conferências manuais |
| `conferences` | `/api/conferences` | Conferências automatizadas |
| `situacao-fiscal` | `/api/situacao-fiscal` | Consulta situação fiscal |
| `receita` | `/api/receita` | Consulta Receita Federal |
| `relatorios` | `/api/relatorios` | Geração de relatórios |
| `irpf` | `/api/irpf` | IRPF produção |
| `irpf2026` | `/api/irpf-2026` | IRPF 2026 (auth, admin, docs) |
| `sci` | `/api/sci` | Integração SCI (banco horas, catálogo) |
| `admin-dashboard` | `/api/dashboard/admin` | Dashboard administrativo |
| `flags` | `/api/flags` | Flags de clientes |
| `cota-aprendizagem` | `/api/cota-aprendizagem` | Classificação de porte ME/EPP/Demais (LC 123) |
| `spreadsheet` | `/api/spreadsheet` | Processamento de planilhas |

---

## 🖥 Rotas do Frontend

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Home | Página inicial |
| `/dashboard` | AdminDashboard | Dashboard administrativo |
| `/clientes` | Clientes | Cadastro e gestão de clientes |
| `/clientes/cnae` | ClientesCNAE | Clientes por CNAE |
| `/dctf` | DCTF | Gestão de DCTFs |
| `/dctf/list` | DCTFList | Lista de DCTFs |
| `/dctf/:id/dados` | DCTFDadosPage | Dados detalhados de uma DCTF |
| `/upload` | UploadDCTF | Upload de arquivos DCTF |
| `/conferencias` | Conferencias | Conferências DCTF |
| `/relatorios` | Relatorios | Geração de relatórios |
| `/situacao-fiscal` | SituacaoFiscal | Consulta situação fiscal |
| `/administracao` | Administracao | Painel de administração |
| `/sci/banco-horas` | BancoHoras | Banco de horas SCI |
| `/sci/gerador-sql` | GeradorSQL | Gerador de SQL para SCI |
| `/sped` | SpedValidacao | Validação SPED |
| `/sped/v2` | SpedValidacaoV2 | Validação SPED V2 |
| `/sped/knowledge` | SpedKnowledgeBase | Base de conhecimento SPED |
| `/irpf-2026` | Irpf2025 | Landing page IRPF 2026 |
| `/irpf-2026/cliente/login` | Irpf2026LoginPage | Login de clientes IRPF |
| `/irpf-2026/admin` | Irpf2026AdminLayout | Painel admin IRPF (protegido) |

---

## 🔄 Fluxo de PR

1. Abra uma branch a partir de `develop`
2. Implemente com testes
3. Abra PR com descrição, contexto e screenshots (se UI)
4. Aguarde aprovação de 1 revisor
5. Merge via squash

---

## 📌 Resumo Técnico

### Pontos Fortes

- **Arquitetura bem organizada** — separação clara entre controllers, services e models com 72 services cobrindo toda a lógica de negócio
- **Motor de validação SPED robusto** — 50+ regras de validação Python com 20 arquivos de teste dedicados (C100, C170, C190, IPI, ST, Simples Nacional)
- **Múltiplas integrações** — MySQL, scraping do e‑CAC, Firebird SCI, n8n, Receita Federal, OneClick — comunicação entre sistemas legados e modernos
- **CI automatizado** — GitHub Actions com lint, type-check, testes e build para backend e frontend
- **Ferramentas de qualidade** — ESLint, Prettier, Knip (código morto), Depcheck (deps órfãs)

### Riscos Técnicos

- **TypeScript strict desabilitado** — `noImplicitAny`, `strict`, `noUnusedLocals` todos em `false` — permite erros de tipo em tempo de execução. Mitigação: habilitar `strict` incrementalmente por módulo
- **`scrapecac` como tabela de aterrissagem volátil** — pode ser limpa entre coletas, então a presença de um lançamento deve ser conferida sempre em `dctf_declaracoes` (fonte de verdade), não em `scrapecac`. Mitigação: tratar `dctf_declaracoes` como histórico canônico e logar cada sync
- **Scripts Python via spawn** — comunicação backend→Python via stdout sem schema validado. Mitigação: padronizar protocolo JSON com schema Zod
- **Segredos no git remote** — token de acesso visível na URL do remote. Mitigação: usar SSH ou credential helper

### Maturidade do Projeto

| Dimensão | Nível | Observação |
|----------|:-----:|------------|
| Cobertura de testes | 3 | 20 testes unitários backend + 20 testes Python SPED + 5 integração. Frontend com pouca cobertura |
| Documentação | 4 | CLAUDE.md detalhado, README estruturado, .env.example, JSDoc parcial |
| Qualidade do código | 3 | ESLint + Prettier configurados, mas TypeScript strict desabilitado |
| Segurança | 3 | JWT auth, helmet, rate limiting, CORS configurado. Falta validação Zod nas rotas |
| Observabilidade | 3 | Winston para logs, health check no Docker, Socket.io para real-time. Sem APM externo |
| Escalabilidade | 2 | Monolito single-process, Python via spawn síncrono, sem cache Redis. Adequado para uso interno |

> Escala: 1 = Inexistente · 3 = Adequado · 5 = Excelente

---

## 📄 Licença

`MIT`

---

<div align="center">
Gerado com ❤️ por análise técnica automatizada
</div>
