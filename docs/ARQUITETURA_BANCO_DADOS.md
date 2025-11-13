# Arquitetura do Banco de Dados - DCTF MPC

## 📋 Visão Geral

Este documento explica como o sistema gerencia o banco de dados, a diferença entre arquivos SQL de documentação e o banco real, e como o sistema decide entre usar Supabase ou dados mock.

## 🔄 Como o Sistema Funciona

### 1. **Sistema Híbrido: Supabase OU Mock**

O sistema foi projetado para funcionar de duas formas:

#### ✅ **Modo Supabase (Produção/Desenvolvimento com Banco Real)**
- Quando `SUPABASE_URL` está configurado nas variáveis de ambiente
- Usa o banco PostgreSQL do Supabase
- Dados são persistidos e compartilhados
- Todas as operações CRUD funcionam normalmente

#### 🧪 **Modo Mock (Desenvolvimento sem Banco)**
- Quando `SUPABASE_URL` **NÃO** está configurado ou está vazio
- Usa dados em memória (mock) para testes
- Dados são temporários (perdidos ao reiniciar)
- Permite desenvolvimento sem configurar Supabase

### 2. **Detecção Automática**

O sistema detecta automaticamente qual modo usar:

```typescript
// Exemplo do modelo Cliente
if (!process.env['SUPABASE_URL'] || process.env['SUPABASE_URL'] === '') {
  // Usa dados MOCK
  return this.getMockData();
} else {
  // Usa SUPABASE real
  return super.findAll();
}
```

## 📁 Estrutura de Arquivos SQL

### **`docs/` - Documentação e Referência**

Os arquivos SQL na pasta `docs/` são **apenas documentação**:

- ✅ **`database-schema.sql`**: Schema inicial proposto (não é executado automaticamente)
- ✅ **`dctf-constraints.sql`**: Constraints e regras de negócio (documentação)
- ✅ **`dctf-performance-indexes.sql`**: Índices para performance (documentação)
- ✅ **`rls-policies.sql`**: Políticas de segurança (documentação)

**⚠️ IMPORTANTE**: Esses arquivos **NÃO são executados automaticamente**. Eles servem como:
- Documentação da estrutura esperada
- Referência para criar tabelas manualmente
- Guia para migrações futuras

### **`docs/migrations/` - Migrações Manuais**

As migrações são scripts SQL que **você precisa executar manualmente**:

- ✅ **`001_normalize_cnpj_column.sql`**: Migração para normalizar CNPJ
- ✅ **`README.md`**: Instruções de como aplicar migrações

**Como aplicar:**
1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Copie e cole o conteúdo da migração
4. Execute

## 🗄️ Tabelas Usadas pelo Sistema

### **Tabelas Principais (Código Implementado)**

Estas tabelas **têm código implementado** e são usadas pelo sistema:

| Tabela | Modelo | Arquivo | Status |
|--------|--------|---------|--------|
| `clientes` | `Cliente.ts` | `src/models/Cliente.ts` | ✅ **IMPLEMENTADO** |
| `dctf_declaracoes` | `DCTF.ts` | `src/models/DCTF.ts` | ✅ **IMPLEMENTADO** |
| `dctf_dados` | `DCTFDados.ts` | `src/models/DCTFDados.ts` | ✅ **IMPLEMENTADO** |
| `upload_history` | `UploadHistory.ts` | `src/models/UploadHistory.ts` | ✅ **IMPLEMENTADO** |
| `flags` | `Flag.ts` | `src/models/Flag.ts` | ✅ **IMPLEMENTADO** |
| `analises` | `Analise.ts` | `src/models/Analise.ts` | ✅ **IMPLEMENTADO** |
| `relatorios` | `Relatorio.ts` | `src/models/Relatorio.ts` | ✅ **IMPLEMENTADO** |
| `dctf_codes` | `DCTFCode.ts` | `src/models/DCTFCode.ts` | ✅ **IMPLEMENTADO** |
| `dctf_receita_codes` | `DCTFCode.ts` | `src/models/DCTFCode.ts` | ✅ **IMPLEMENTADO** |
| `dctf_aliquotas` | `DCTFCode.ts` | `src/models/DCTFCode.ts` | ✅ **IMPLEMENTADO** |

### **⚠️ Importante: Tabelas no Supabase**

**As tabelas acima podem ou não estar criadas no seu banco Supabase!**

- ✅ **Se a tabela existe no Supabase**: O sistema usa dados reais
- ❌ **Se a tabela NÃO existe no Supabase**: 
  - Se `SUPABASE_URL` estiver configurado → **Erro ao acessar**
  - Se `SUPABASE_URL` NÃO estiver configurado → **Usa dados mock**

### **Como Verificar**

1. **Verificar no código**: Procure por `super('nome_tabela')` nos modelos
2. **Verificar no Supabase**: Acesse Table Editor e veja quais tabelas existem
3. **Comparar**: Veja quais tabelas faltam e crie usando `database-schema.sql`

## 🔍 Como Verificar o Que Está Sendo Usado

### 1. **Verificar Variáveis de Ambiente**

```bash
# No terminal do backend
echo $SUPABASE_URL
```

Se retornar vazio, o sistema está usando **MOCK**.

### 2. **Verificar Logs do Servidor**

Ao iniciar o servidor, você verá:

```
🔐 Supabase configurado:
   - anon key: ✅ Definida
   - service_role key: ✅ Definida
   - usando: service_role (admin)
```

Ou:

```
⚠️  SUPABASE_URL e SUPABASE_ANON_KEY não estão definidas.
```

### 3. **Verificar Tabelas no Supabase**

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Table Editor**
4. Veja quais tabelas existem

### 4. **Verificar Código**

Procure por `this.tableName` nos modelos:

```typescript
// src/models/Cliente.ts
constructor() {
  super('clientes'); // ← Nome da tabela no Supabase
}

// src/models/DCTF.ts
constructor() {
  super('dctf_declaracoes'); // ← Nome da tabela no Supabase
}
```

## 🛠️ Como Configurar o Supabase

### **Passo 1: Criar Projeto no Supabase**

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Anote a **URL** e as **API Keys**

### **Passo 2: Configurar Variáveis de Ambiente**

Crie um arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

### **Passo 3: Criar Tabelas**

Execute os scripts SQL manualmente no Supabase Dashboard:

1. **Schema Base**: `docs/database-schema.sql`
2. **Constraints**: `docs/dctf-constraints.sql`
3. **Índices**: `docs/dctf-performance-indexes.sql`
4. **Migrações**: `docs/migrations/001_normalize_cnpj_column.sql`

### **Passo 4: Verificar Conexão**

O sistema detectará automaticamente e começará a usar o Supabase.

## 📊 Fluxo de Dados

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │
         │ HTTP Request
         ▼
┌─────────────────┐
│   Backend       │
│   (Express)     │
└────────┬────────┘
         │
         │ Verifica SUPABASE_URL
         ▼
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌─────────┐    ┌──────────────┐
│ SUPABASE│    │  MOCK DATA   │
│ (Real)  │    │  (Memória)   │
└─────────┘    └──────────────┘
```

## ⚠️ Problemas Comuns

### **"Tabelas não estão sendo usadas"**

**Causa**: As tabelas podem estar documentadas mas não criadas no Supabase.

**Solução**: 
1. Verifique quais tabelas existem no Supabase Dashboard
2. Compare com `database-schema.sql`
3. Execute os scripts SQL faltantes

### **"Sistema usando dados mock"**

**Causa**: `SUPABASE_URL` não está configurado.

**Solução**:
1. Verifique o arquivo `.env`
2. Reinicie o servidor após configurar

### **"Erro ao conectar ao Supabase"**

**Causa**: Credenciais incorretas ou projeto pausado.

**Solução**:
1. Verifique as chaves no Supabase Dashboard
2. Verifique se o projeto está ativo
3. Teste a conexão manualmente

## 📝 Resumo

| Item | Descrição |
|------|-----------|
| **Arquivos SQL em `docs/`** | Apenas documentação, não executados automaticamente |
| **Migrações em `docs/migrations/`** | Scripts para executar manualmente no Supabase |
| **Sistema usa Supabase?** | Sim, se `SUPABASE_URL` estiver configurado |
| **Sistema usa dados internos?** | Sim, se `SUPABASE_URL` NÃO estiver configurado (modo mock) |
| **Tabelas não usadas?** | Podem estar documentadas mas não criadas no banco |

## 🔗 Próximos Passos

1. ✅ Verificar quais tabelas existem no seu Supabase
2. ✅ Comparar com `docs/database-schema.sql`
3. ✅ Criar tabelas faltantes se necessário
4. ✅ Aplicar migrações pendentes
5. ✅ Verificar logs do servidor para confirmar uso do Supabase

