# DCTF_MPC

Plataforma web de ferramentas fiscais para conferencia, validacao e gestao de obrigacoes tributarias brasileiras (DCTF, SPED, DIRF, IRPF, SCI).

---

## Estrutura do Projeto

```
DCTF_MPC/
├── src/                          # Backend (Node.js + Express + TypeScript)
│   ├── index.ts                  # Entry point — inicia servidor
│   ├── server.ts                 # Configuracao Express (rotas, middleware, CORS)
│   ├── config/                   # Configuracao (database, mysql, oneclick)
│   ├── controllers/              # 28 controllers (logica de requisicao)
│   ├── models/                   # 13 models (Sequelize — MySQL)
│   ├── routes/                   # 26 modulos de rotas
│   ├── services/                 # 72 services (logica de negocio)
│   ├── middleware/               # 6 middlewares (auth, validation, error, logger)
│   ├── types/                    # Definicoes de tipos TypeScript
│   └── utils/                    # Utilitarios (pythonExtractor)
│
├── frontend/                     # Frontend (React + TypeScript + Vite)
│   └── src/
│       ├── App.tsx               # Wrapper principal
│       ├── main.tsx              # Entry point React
│       ├── router/index.tsx      # 24 rotas registradas
│       ├── pages/                # Paginas por funcionalidade
│       ├── components/           # Componentes organizados por dominio
│       │   ├── BancoHoras/       # Upload e progresso banco de horas
│       │   ├── Clientes/        # Abas de clientes (Acesso, CFOP, eBEF, Export)
│       │   ├── Dashboard/       # Cards, graficos, filtros do dashboard
│       │   ├── Layout/          # Header, Sidebar, Footer, Layout
│       │   ├── SituacaoFiscal/  # Registro detalhado situacao fiscal
│       │   ├── UI/              # Componentes base (Button, Input, Modal, Table, Alert)
│       │   ├── conferences/     # Secoes de conferencia DCTF
│       │   └── sped/            # Componentes SPED (upload, validacao, v2)
│       ├── contexts/            # Irpf2026AuthContext
│       ├── hooks/               # Hooks customizados (useClientes, useDCTF, useToast)
│       ├── services/            # Camada de API (axios)
│       ├── store/               # Zustand (estado global)
│       ├── types/               # Tipos compartilhados
│       └── utils/               # Utilitarios (exportExcel, formatCurrency)
│
├── python/                       # Scripts Python chamados pelo backend
│   ├── buscar_codigo_sci.py      # Busca codigo SCI no Firebird
│   ├── extract_socios_api.py     # Extrai socios via API
│   ├── catalog/                  # Consultas ao catalogo SCI
│   │   ├── buscar_catalog.py
│   │   ├── consulta_centro_custo.py
│   │   └── executar_sql.py
│   └── sped/                     # Validacao e correcao SPED
│       ├── aplicar_ajustes.py
│       ├── aplicar_correcao.py
│       ├── aplicar_todas_correcoes.py
│       ├── detectar_setor.py
│       ├── processar_ajustes.py
│       ├── processar_validacao.py
│       └── v2/                   # SPED V2 (RAG + metadata)
│           ├── extract_sped_metadata.py
│           ├── extract_xml_flags.py
│           ├── processar_validacao_v2.py
│           └── knowledge/
│               ├── generate_rule.py
│               └── query_rag.py
│
├── scripts/                      # Scripts de manutencao e migracao
├── tests/                        # Testes (Jest)
│   ├── controllers/
│   ├── integration/
│   ├── models/
│   ├── routes/
│   └── services/
│
├── docs/                         # Documentacao e migracoes SQL
│   └── migrations/
├── data/                         # Backups e dados locais
├── docker-compose.*.yml          # Docker (dev e producao)
├── Dockerfile                    # Build do backend
└── package.json                  # Dependencias e scripts npm
```

---

## Rotas do Frontend (24 ativas)

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/` | Home | Pagina inicial |
| `/dashboard` | AdminDashboard | Dashboard administrativo |
| `/conferencias` | Conferencias | Conferencias DCTF |
| `/clientes` | Clientes | Cadastro e gestao de clientes |
| `/clientes/cnae` | ClientesCNAE | Clientes por CNAE |
| `/dctf` | DCTF | Gestao de DCTFs |
| `/dctf/list` | DCTFList | Lista de DCTFs |
| `/dctf/:id/dados` | DCTFDadosPage | Dados detalhados de uma DCTF |
| `/upload` | UploadDCTF | Upload de arquivos DCTF |
| `/relatorios` | Relatorios | Geracao de relatorios |
| `/situacao-fiscal` | SituacaoFiscal | Consulta situacao fiscal |
| `/dirf` | Dirf | Gestao DIRF |
| `/administracao` | Administracao | Painel de administracao |
| `/sci/banco-horas` | BancoHoras | Banco de horas SCI |
| `/sci/gerador-sql` | GeradorSQL | Gerador de SQL para SCI |
| `/sped` | SpedValidacao | Validacao SPED |
| `/sped/v2` | SpedValidacaoV2 | Validacao SPED V2 |
| `/sped/knowledge` | SpedKnowledgeBase | Base de conhecimento SPED |
| `/irpf-2026` | Irpf2025 | Landing page IRPF 2026 |
| `/irpf-2026/cliente/login` | Irpf2026LoginPage | Login de clientes IRPF |
| `/irpf-2026/admin` | Irpf2026AdminLayout | Painel admin IRPF (protegido) |
| `/admin` | — | Redirect para `/irpf-2026/admin` |
| `*` | ErrorPage | Pagina de erro 404 |

---

## API Backend (26 modulos de rota)

| Modulo | Descricao |
|--------|-----------|
| `admin-dashboard` | Dashboard administrativo |
| `admin-dashboard-conferences` | Conferencias do dashboard |
| `cfop` | Gestao de CFOPs |
| `clientes` | CRUD de clientes |
| `conferences` | Conferencias automatizadas |
| `conferencias` | Conferencias manuais |
| `dctf` | Gestao DCTFs |
| `dctf-codes` | Codigos DCTF |
| `dirf` | Gestao DIRF |
| `fiscal-calculation` | Calculos fiscais |
| `flags` | Flags de clientes |
| `host-dados` | Dados do host/servidor |
| `irpf` | IRPF producao |
| `irpf2026` | IRPF 2026 (admin, auth, documentos, mensagens) |
| `n8n-webhook` | Webhooks n8n |
| `performance` | Monitoramento de performance |
| `receita` | Consulta Receita Federal |
| `relatorios` | Geracao de relatorios |
| `sci` | Integracao SCI (banco horas, catalogo, SQL) |
| `situacao-fiscal` | Situacao fiscal |
| `sped` | Validacao SPED V1 |
| `sped-v2` | Validacao SPED V2 |
| `sped-v2-knowledge` | Knowledge base SPED |
| `sped_correcoes` | Correcoes SPED |
| `spreadsheet` | Processamento de planilhas |

---

## Models (Sequelize/MySQL)

| Model | Descricao |
|-------|-----------|
| `Cliente` | Cadastro de clientes (CNPJ, razao social, regime, flags) |
| `DCTF` | Declaracoes DCTF |
| `DCTFDados` | Dados detalhados de cada DCTF |
| `DCTFCode` | Codigos de receita DCTF |
| `Flag` | Flags de situacao dos clientes |
| `Relatorio` | Relatorios gerados |
| `Analise` | Analises fiscais |
| `UploadHistory` | Historico de uploads |
| `BancoHorasRelatorio` | Relatorios banco de horas SCI |
| `IrpfFaturamentoCache` | Cache de faturamento IRPF |
| `IrpfFaturamentoConsolidado` | Faturamento consolidado IRPF |
| `IrpfFaturamentoDetalhado` | Faturamento detalhado IRPF |
| `IrpfFaturamentoMini` | Faturamento resumido IRPF |

---

## Scripts Python Ativos (16)

Chamados pelo backend via spawn/exec:

| Script | Funcao |
|--------|--------|
| `buscar_codigo_sci.py` | Busca codigo SCI no Firebird |
| `extract_socios_api.py` | Extrai socios de empresa via API |
| `catalog/buscar_catalog.py` | Consulta catalogo SCI |
| `catalog/consulta_centro_custo.py` | Consulta centro de custo |
| `catalog/executar_sql.py` | Executa SQL no SCI |
| `sped/aplicar_ajustes.py` | Aplica ajustes no SPED |
| `sped/aplicar_correcao.py` | Aplica correcao pontual |
| `sped/aplicar_todas_correcoes.py` | Aplica todas as correcoes |
| `sped/detectar_setor.py` | Detecta setor do contribuinte |
| `sped/processar_ajustes.py` | Processa ajustes SPED |
| `sped/processar_validacao.py` | Validacao SPED V1 |
| `sped/v2/extract_sped_metadata.py` | Extrai metadata SPED |
| `sped/v2/extract_xml_flags.py` | Extrai flags de XMLs |
| `sped/v2/processar_validacao_v2.py` | Validacao SPED V2 |
| `sped/v2/knowledge/generate_rule.py` | Gera regras RAG |
| `sped/v2/knowledge/query_rag.py` | Consulta base RAG |

---

## Como Rodar

### Pre-requisitos
- Node.js 18+
- MySQL 8.x
- Python 3.10+ (com dependencias: openpyxl, pandas, fdb)
- Docker (opcional, para MySQL)

### Desenvolvimento

```bash
# Instalar dependencias
npm install

# Rodar backend + frontend
npm run dev

# Ou separadamente:
npm run dev          # Backend (porta 3000)
cd frontend && npm run dev   # Frontend (porta 5173)
```

### Producao

```bash
# Build
npm run build

# Docker
docker compose -f docker-compose.production.yml up -d
```

### Testes

```bash
npm test
npm run test:watch
```

---

## Variaveis de Ambiente

Veja `.env.example` para a lista completa. Principais:

| Variavel | Descricao |
|----------|-----------|
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | Conexao MySQL principal |
| `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` | Supabase (legado) |
| `ONECLICK_MYSQL_*` | Banco OneClick (sync clientes) |
| `SCI_FB_HOST/DATABASE/USER/PASSWORD` | Firebird SCI |
| `EMAIL_USER/EMAIL_PASSWORD` | SMTP Gmail |
| `PORT/HOST` | Porta e host do servidor |
| `FRONTEND_URL` | URLs permitidas (CORS) |
| `GIT_TOKEN/GIT_REMOTE_URL` | Deploy Git |
