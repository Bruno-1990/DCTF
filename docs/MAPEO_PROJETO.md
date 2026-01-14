# 🗺️ Mapeamento do Projeto DCTF MPC

> **Guia de Navegação Rápida** - Encontre rapidamente onde fazer alterações no projeto

## 📋 Índice Rápido

- [Arquitetura Geral](#arquitetura-geral)
- [Estrutura de Diretórios](#estrutura-de-diretórios)
- [Módulos Principais](#módulos-principais)
- [Onde Encontrar...](#onde-encontrar)
- [Fluxos Principais](#fluxos-principais)
- [Convenções e Padrões](#convenções-e-padrões)

---

## 🏗️ Arquitetura Geral

O projeto segue uma arquitetura **Full-Stack** com separação clara entre:

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Pages   │→ │Services  │→ │  Hooks   │→ │  Types  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Routes   │→ │Controllers│→ │  Models  │→ │ Services│ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│              PYTHON (Processamento/Validação)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  SPED    │  │Extractors│  │ Validators│             │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                    BANCO DE DADOS                       │
│              MySQL (Principal) + Supabase               │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura de Diretórios

### Raiz do Projeto
```
DCTF_MPC/
├── frontend/          # Aplicação React (Interface do usuário)
├── src/               # Backend Node.js/TypeScript
├── python/            # Scripts Python (SPED, extrações, validações)
├── scripts/           # Scripts utilitários (migrations, fixes)
├── docs/              # Documentação do projeto
├── tests/             # Testes automatizados
└── dist/              # Build compilado (não versionado)
```

---

## 🎯 Módulos Principais

### 1. **Clientes** 📇
**Responsabilidade**: Gerenciamento completo de clientes, sócios, participações

#### Frontend
- **Página Principal**: `frontend/src/pages/Clientes.tsx`
- **Componentes**: `frontend/src/components/Clientes/`
  - `PagamentosTab.tsx` - Aba de pagamentos
  - `EProcessosTab.tsx` - Aba de e-processos
  - `ExportClientesModal.tsx` - Modal de exportação
- **Serviços**: `frontend/src/services/clientes.ts`
- **Hooks**: `frontend/src/hooks/useClientes.ts`
- **Tipos**: `frontend/src/types/index.ts` (interface `Cliente`)

#### Backend
- **Controller**: `src/controllers/ClienteController.ts`
- **Model**: `src/models/Cliente.ts`
- **Routes**: `src/routes/clientes.ts`
- **Endpoints Principais**:
  - `GET /api/clientes` - Listar clientes
  - `GET /api/clientes/:id` - Obter cliente
  - `PUT /api/clientes/:id` - Atualizar cliente
  - `PUT /api/clientes/:id/editar-participacao-manual` - Editar participação manual
  - `PUT /api/clientes/:id/atualizar-socios-situacao-fiscal` - Atualizar sócios

#### Scripts Úteis
- `src/scripts/update-clientes-codigo-sci.ts` - Atualizar código SCI
- `src/scripts/atualizar-socios-zerados.ts` - Corrigir sócios zerados
- `src/scripts/corrigir-razoes-sociais-cnpj.ts` - Limpar razões sociais

---

### 2. **IRPF** 💰
**Responsabilidade**: Relatórios e dados para IRPF 2026

#### Frontend
- **Página**: `frontend/src/pages/Irpf2025.tsx`
- **Serviços**: `frontend/src/services/irpf.ts`

#### Backend
- **Controller**: `src/controllers/IrpfController.ts`
- **Routes**: `src/routes/irpf.ts`
- **Model**: `src/models/IrpfFaturamentoCache.ts`

---

### 3. **SPED Validação v2.0** 🔍
**Responsabilidade**: Validação avançada de arquivos SPED/EFD

#### Frontend
- **Página**: `frontend/src/pages/SpedValidacaoV2.tsx`
- **Componentes**: `frontend/src/components/sped/v2/`
  - `SummaryPanel.tsx` - Painel de resumo
  - `PipelineView.tsx` - Visualização do pipeline
- **Serviços**: `frontend/src/services/sped-v2.ts`

#### Backend
- **Controller**: `src/controllers/SpedV2ValidationController.ts`
- **Routes**: `src/routes/sped-v2.ts`
- **Service**: `src/services/SpedV2ValidationService.ts`

#### Python
- **Validação**: `python/sped/v2/validation/`
- **Normalização**: `python/sped/v2/normalization/`
- **Matching**: `python/sped/v2/matching/`
- **Canonical**: `python/sped/v2/canonical/`
- **Knowledge Base**: `python/sped/v2/knowledge/`

---

### 4. **SPED Validação (Legado)** 📊
**Responsabilidade**: Validação básica de SPED

#### Frontend
- **Página**: `frontend/src/pages/SpedValidacao.tsx`
- **Componentes**: `frontend/src/components/sped/`
- **Serviços**: `frontend/src/services/sped.ts`

#### Python
- **Processamento**: `python/sped/sped_editor.py`
- **Validações**: `python/sped/validacao_*.py`
- **Matching**: `python/sped/match_*.py`

---

### 5. **DCTF** 📋
**Responsabilidade**: Gerenciamento de declarações DCTF

#### Frontend
- **Páginas**: 
  - `frontend/src/pages/DCTF.tsx`
  - `frontend/src/pages/DCTFDadosPage.tsx`
  - `frontend/src/pages/DCTFList.tsx`
  - `frontend/src/pages/UploadDCTF.tsx`
- **Serviços**: `frontend/src/services/dctf.ts`
- **Hooks**: `frontend/src/hooks/useDCTF.ts`

#### Backend
- **Controller**: `src/controllers/DCTFController.ts`
- **Model**: `src/models/DCTF.ts`
- **Routes**: `src/routes/dctf.ts`

---

### 6. **Situação Fiscal** 🏛️
**Responsabilidade**: Consulta e processamento de situação fiscal

#### Frontend
- **Página**: `frontend/src/pages/SituacaoFiscal.tsx`
- **Componentes**: `frontend/src/components/SituacaoFiscal/`

#### Backend
- **Routes**: `src/routes/situacao-fiscal.ts`
- **Extração Python**: `python/extract_socios_api.py`
- **Utils**: `src/utils/pythonExtractor.ts`

---

### 7. **Conferências** ✅
**Responsabilidade**: Conferências e análises de divergências

#### Frontend
- **Páginas**: 
  - `frontend/src/pages/Conferencias.tsx`
  - `frontend/src/pages/ConferenciasNova.tsx`
- **Componentes**: `frontend/src/components/conferences/`
- **Serviços**: `frontend/src/services/conferences.ts`

#### Backend
- **Controllers**: 
  - `src/controllers/ConferenceController.ts`
  - `src/controllers/ConferenciaController.ts`
- **Routes**: 
  - `src/routes/conferences.ts`
  - `src/routes/conferencias.ts`

---

### 8. **Relatórios** 📈
**Responsabilidade**: Geração de relatórios diversos

#### Frontend
- **Página**: `frontend/src/pages/Relatorios.tsx`
- **Serviços**: `frontend/src/services/relatorios.ts`
- **Hooks**: `frontend/src/hooks/useRelatorios.ts`

#### Backend
- **Controller**: `src/controllers/RelatorioController.ts`
- **Routes**: `src/routes/relatorios.ts`

---

### 9. **Dashboard Admin** 🎛️
**Responsabilidade**: Painel administrativo

#### Frontend
- **Página**: `frontend/src/pages/AdminDashboard.tsx`
- **Componentes**: `frontend/src/components/Dashboard/`
- **Serviços**: `frontend/src/services/dashboard.ts`

#### Backend
- **Controllers**: 
  - `src/controllers/AdminDashboardController.ts`
  - `src/controllers/AdminDashboardReportController.ts`
  - `src/controllers/AdminDashboardConferenceController.ts`
- **Routes**: `src/routes/admin-dashboard.ts`

---

### 10. **Pagamentos** 💳
**Responsabilidade**: Gerenciamento de pagamentos

#### Frontend
- **Página**: `frontend/src/pages/Pagamentos.tsx`
- **Componentes**: `frontend/src/components/Clientes/PagamentosTab.tsx`

#### Backend
- **Controller**: `src/controllers/PagamentoController.ts`
- **Routes**: `src/routes/pagamentos.ts`

---

## 🔍 Onde Encontrar...

### **Quero adicionar um novo campo em Clientes**
1. **Backend Model**: `src/models/Cliente.ts` - Adicionar campo na interface
2. **Backend Controller**: `src/controllers/ClienteController.ts` - Atualizar métodos
3. **Frontend Types**: `frontend/src/types/index.ts` - Adicionar na interface `Cliente`
4. **Frontend Page**: `frontend/src/pages/Clientes.tsx` - Adicionar no formulário/tabela
5. **Migration SQL**: `docs/migrations/mysql/` - Criar migration se necessário

### **Quero criar uma nova página**
1. **Criar Página**: `frontend/src/pages/NovaPagina.tsx`
2. **Adicionar Rota**: `frontend/src/router/index.tsx`
3. **Adicionar Menu**: `frontend/src/components/Layout/Sidebar.tsx`
4. **Criar Service** (se necessário): `frontend/src/services/nova-pagina.ts`
5. **Criar Controller**: `src/controllers/NovaPaginaController.ts`
6. **Criar Routes**: `src/routes/nova-pagina.ts`

### **Quero adicionar uma nova validação SPED**
1. **Python Validator**: `python/sped/v2/validation/` ou `python/sped/validacao_*.py`
2. **Backend Service**: `src/services/SpedV2ValidationService.ts`
3. **Frontend**: `frontend/src/pages/SpedValidacaoV2.tsx`

### **Quero processar um PDF/XML**
1. **Python Extractor**: `python/extract_socios_api.py` ou criar novo em `python/`
2. **Backend Utils**: `src/utils/pythonExtractor.ts` - Chamar script Python
3. **Backend Route**: Adicionar endpoint em `src/routes/`

### **Quero criar um script de migração/correção**
1. **Criar Script**: `src/scripts/nome-do-script.ts`
2. **Adicionar npm script**: `package.json` - Adicionar em `scripts`
3. **Documentar**: Criar README em `src/scripts/` se necessário

### **Quero adicionar uma nova tabela no banco**
1. **Criar Migration**: `docs/migrations/mysql/XXX_nome_da_tabela.sql`
2. **Criar Model**: `src/models/NovaTabela.ts`
3. **Criar Controller**: `src/controllers/NovaTabelaController.ts`
4. **Criar Routes**: `src/routes/nova-tabela.ts`

### **Quero modificar o layout/menu**
1. **Layout Principal**: `frontend/src/components/Layout/Layout.tsx`
2. **Sidebar**: `frontend/src/components/Layout/Sidebar.tsx`
3. **Header**: `frontend/src/components/Layout/Header.tsx`
4. **Footer**: `frontend/src/components/Layout/Footer.tsx`

### **Quero adicionar um novo tipo/interface**
1. **Frontend**: `frontend/src/types/index.ts`
2. **Backend**: `src/types/index.ts`

---

## 🔄 Fluxos Principais

### **Fluxo: Atualizar Sócios de um Cliente**
```
1. Frontend: Clientes.tsx → Clica "Atualizar Sócios"
2. Frontend: clientes.ts → atualizarSociosPorSituacaoFiscal()
3. Backend: routes/clientes.ts → PUT /:id/atualizar-socios-situacao-fiscal
4. Backend: ClienteController.ts → atualizarSociosPorSituacaoFiscal()
5. Backend: Busca situação fiscal no Supabase
6. Backend: Extrai dados do MySQL (sitf_extracted_data)
7. Backend: Cliente.ts → atualizarSociosComParticipacao()
8. Backend: Atualiza clientes_socios no MySQL
9. Frontend: Recarrega dados e atualiza UI
```

### **Fluxo: Editar Participação Manual**
```
1. Frontend: Clientes.tsx (aba Participação) → Clica ícone de edição
2. Frontend: Abre modal de edição
3. Frontend: Usuário edita Capital Social e participações
4. Frontend: clientes.ts → editarParticipacaoManual()
5. Backend: routes/clientes.ts → PUT /:id/editar-participacao-manual
6. Backend: ClienteController.ts → editarParticipacaoManual()
7. Backend: Atualiza capital_social em clientes
8. Backend: Atualiza participacao_percentual e participacao_valor em clientes_socios
9. Frontend: Recarrega cliente e atualiza lista
```

### **Fluxo: Validar SPED v2.0**
```
1. Frontend: SpedValidacaoV2.tsx → Upload arquivo
2. Frontend: sped-v2.ts → uploadArquivo()
3. Backend: routes/sped-v2.ts → POST /upload
4. Backend: SpedV2ValidationController.ts → uploadArquivo()
5. Backend: SpedV2ValidationService.ts → processarValidacao()
6. Python: python/sped/v2/processar_validacao_v2.py
7. Python: Normaliza XML → Extrai dados → Valida → Gera relatório
8. Backend: Salva resultados no MySQL
9. Frontend: Exibe resultados em PipelineView e SummaryPanel
```

### **Fluxo: Consultar Situação Fiscal**
```
1. Frontend: SituacaoFiscal.tsx → Digita CNPJ
2. Frontend: Chama API de consulta
3. Backend: routes/situacao-fiscal.ts → POST /:cnpj/download
4. Backend: Consulta ReceitaWS (token → protocolo → base64)
5. Backend: Salva PDF no Supabase (sitf_downloads)
6. Python: extract_socios_api.py → Extrai dados do PDF
7. Backend: Salva dados extraídos no MySQL (sitf_extracted_data)
8. Frontend: Exibe dados extraídos
```

---

## 📐 Convenções e Padrões

### **Nomenclatura de Arquivos**
- **Controllers**: `NomeController.ts` (PascalCase)
- **Models**: `Nome.ts` (PascalCase)
- **Routes**: `nome.ts` (camelCase)
- **Services**: `NomeService.ts` (PascalCase)
- **Pages**: `NomePagina.tsx` (PascalCase)
- **Components**: `NomeComponent.tsx` (PascalCase)
- **Scripts**: `nome-do-script.ts` (kebab-case)

### **Estrutura de Endpoints**
```
GET    /api/recurso           → Listar todos
GET    /api/recurso/:id       → Obter um
POST   /api/recurso           → Criar
PUT    /api/recurso/:id       → Atualizar
DELETE /api/recurso/:id       → Deletar
```

### **Estrutura de Resposta API**
```typescript
// Sucesso
{
  success: true,
  data: { ... },
  message?: string
}

// Erro
{
  success: false,
  error: "Mensagem de erro",
  message?: string
}
```

### **Estrutura de Componente React**
```typescript
// 1. Imports
// 2. Types/Interfaces
// 3. Component
export const ComponentName = () => {
  // 4. Estados
  // 5. Hooks
  // 6. Funções
  // 7. Effects
  // 8. Render
  return (...)
}
```

### **Estrutura de Controller**
```typescript
class NomeController {
  // 1. Métodos públicos (handlers)
  async metodoHandler(req: Request, res: Response): Promise<void> {
    try {
      // Validação
      // Lógica
      // Resposta
    } catch (error) {
      // Tratamento de erro
    }
  }
}
```

---

## 🗄️ Banco de Dados

### **Principais Tabelas**
- `clientes` - Dados dos clientes
- `clientes_socios` - Sócios dos clientes
- `dctf_declaracoes` - Declarações DCTF
- `dctf_dados` - Dados detalhados DCTF
- `sitf_downloads` - Downloads de situação fiscal (Supabase)
- `sitf_extracted_data` - Dados extraídos de PDFs (MySQL)
- `irpf_faturamento_cache` - Cache de faturamento IRPF
- `sped_v2_legal_documents` - Documentos legais para validação

### **Documentação de Schema**
- `docs/ARQUITETURA_BANCO_DADOS.md` - Visão geral
- `docs/database-schema.sql` - Schema completo
- `docs/migrations/mysql/` - Migrations

---

## 🧪 Testes

### **Localização**
- **Frontend**: `frontend/src/components/UI/__tests__/`
- **Backend**: `tests/routes/`
- **Python**: `python/sped/tests/` e `python/sped/v2/*/test_*.py`

### **Executar Testes**
```bash
npm test              # Todos os testes
npm run test:watch    # Modo watch
```

---

## 📚 Documentação Adicional

### **Documentos Importantes**
- `docs/ARQUITETURA_BANCO_DADOS.md` - Arquitetura do banco
- `docs/SPED_MODULE.md` - Módulo SPED
- `docs/MIGRACAO_MYSQL_COMPLETA.md` - Migração MySQL
- `docs/DEPLOY.md` - Deploy
- `python/README.md` - Scripts Python
- `python/sped/MAPEAMENTO_CAMPOS_SPED.md` - Campos SPED

### **Guias de Uso**
- `docs/COMO-USAR-SINCRONIZACAO-RECEITA.md`
- `docs/CONFIGURACAO-RECEITA-API.md`
- `docs/API-DCTF-Dados.md`

---

## 🚀 Scripts NPM Úteis

```bash
# Desenvolvimento
npm run dev                    # Inicia servidor de desenvolvimento

# Clientes
npm run update:codigo-sci      # Atualizar código SCI
npm run update:socios-zerados  # Corrigir sócios zerados
npm run verify:duplicados      # Verificar duplicados

# Banco de Dados
npm run test:mysql-connection  # Testar conexão MySQL
npm run mysql:demo             # Demo MySQL

# Migrations
npm run create:sped-v2-legal-docs  # Criar tabelas SPED v2
```

---

## 💡 Dicas Rápidas

1. **Sempre verifique o Model antes de modificar o Controller** - O Model contém a lógica de negócio
2. **Use os Services para lógica complexa** - Mantém os Controllers limpos
3. **Scripts Python devem ser chamados via `pythonExtractor.ts`** - Centraliza a execução
4. **Migrations devem ser versionadas** - Use `XXX_nome.sql` com número sequencial
5. **Tipos devem estar sincronizados** - Frontend e Backend devem ter os mesmos tipos
6. **Use os Hooks do React** - `useClientes`, `useDCTF`, etc. já têm lógica pronta
7. **Documente mudanças grandes** - Crie um arquivo em `docs/` explicando

---

## 🔗 Links Úteis

- **Frontend Dev Server**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **Supabase Dashboard**: (verificar `.env`)
- **MySQL**: (verificar `.env`)

---

**Última atualização**: Janeiro 2026
**Mantido por**: Equipe de Desenvolvimento

