# Migrações do Banco de Dados

Este diretório contém scripts de migração SQL para o banco de dados Supabase.

## Como aplicar as migrações

### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Copie e cole o conteúdo do arquivo de migração
5. Execute o script

### Opção 2: Via Supabase CLI

```bash
# Aplicar migração específica
supabase db push --file docs/migrations/001_normalize_cnpj_column.sql
```

### Opção 3: Via MCP Supabase

Use a ferramenta `mcp_supabase_apply_migration` para aplicar migrações programaticamente.

## Migrações Disponíveis

### 001_normalize_cnpj_column.sql

**Objetivo:** Normalizar a estrutura de CNPJ na tabela `clientes`

**Mudanças:**
- Remove a coluna `cnpj` formatada
- Mantém apenas `cnpj_limpo` (14 dígitos, sem formatação)
- Garante que todos os CNPJs tenham zeros à esquerda preservados
- Adiciona constraint UNIQUE em `cnpj_limpo`
- Cria índice para performance
- Adiciona/ajusta coluna `razao_social` se necessário

**⚠️ ATENÇÃO:** Esta migração:
- Remove registros com CNPJ inválido (menos de 14 dígitos)
- Preenche zeros à esquerda automaticamente
- Remove a coluna `cnpj` formatada permanentemente

**Backup recomendado:** Faça backup da tabela `clientes` antes de executar.

## Ordem de Execução

Execute as migrações na ordem numérica (001, 002, 003...).

