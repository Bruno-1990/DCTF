# Correção: Erro "Column 'cliente_id' cannot be null" na Sincronização

## Problema Identificado

A sincronização está falhando com dois tipos de erros:

1. **Erro 1:** `Column 'cliente_id' cannot be null`
   - **Causa:** A coluna `cliente_id` no MySQL está definida como `NOT NULL`, mas muitos registros no Supabase têm `cliente_id` como `NULL`.

2. **Erro 2:** `Cannot add or update a child row: a foreign key constraint fails`
   - **Causa:** A foreign key `dctf_declaracoes_ibfk_1` ainda existe e alguns `cliente_id` no Supabase são CNPJs formatados (ex: "39.226.309/0001-30") em vez de UUIDs válidos.

## Solução Implementada

### 1. Endpoint para Corrigir Schema

**Rota:** `POST /api/dctf/admin/fix-schema`

**Funcionalidade:**
- Remove foreign key de `cliente_id` (se existir)
- Torna `cliente_id` nullable
- Retorna status da correção

### 2. Botão na Interface Administrativa

Adicionado botão **"Corrigir Schema MySQL"** (amarelo) na seção de sincronização.

**Fluxo recomendado:**
1. Clique em **"Corrigir Schema MySQL"** (primeira vez ou se houver erros)
2. Aguarde confirmação
3. Clique em **"Sincronizar do Supabase para MySQL"**

### 3. Mapeamento Melhorado

O serviço de sincronização agora:
- Valida se `cliente_id` é um UUID válido
- Se for CNPJ formatado (ex: "39.226.309/0001-30"), usa `NULL`
- Permite `cliente_id` ser `NULL` durante a inserção

## Como Usar

### Opção 1: Via Interface (Recomendado)

1. Acesse `/administracao`
2. Na seção "Sincronização de Declarações DCTF"
3. Clique em **"Corrigir Schema MySQL"** (botão amarelo)
4. Aguarde confirmação de sucesso
5. Clique em **"Sincronizar do Supabase para MySQL"** (botão verde)

### Opção 2: Via Script SQL

Execute diretamente no MySQL:

```sql
USE dctf_web;

-- Remover foreign key
SET @constraint_name = (
  SELECT CONSTRAINT_NAME 
  FROM information_schema.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = 'dctf_web' 
    AND TABLE_NAME = 'dctf_declaracoes' 
    AND REFERENCED_TABLE_NAME = 'clientes'
  LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
  CONCAT('ALTER TABLE dctf_declaracoes DROP FOREIGN KEY ', @constraint_name),
  'SELECT "Foreign key não encontrada" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tornar cliente_id nullable
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN cliente_id CHAR(36) NULL;
```

### Opção 3: Via Script Node.js

```bash
npx ts-node src/scripts/fix-cliente-id-nullable.ts
```

**Nota:** Requer credenciais MySQL configuradas no `.env`.

## Verificação

Após executar a correção, verifique:

```sql
-- Verificar se cliente_id é nullable
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'dctf_web'
  AND table_name = 'dctf_declaracoes' 
  AND column_name = 'cliente_id';
-- Deve retornar: is_nullable = 'YES'

-- Verificar se foreign key foi removida
SELECT CONSTRAINT_NAME 
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = 'dctf_web'
  AND TABLE_NAME = 'dctf_declaracoes' 
  AND REFERENCED_TABLE_NAME = 'clientes';
-- Deve retornar vazio
```

## Resultado Esperado

Após corrigir o schema:

1. ✅ `cliente_id` pode ser `NULL` no MySQL
2. ✅ Foreign key removida (não bloqueia inserções)
3. ✅ Registros com `cliente_id` NULL são inseridos sem erros
4. ✅ Registros com `cliente_id` como CNPJ formatado são tratados como NULL
5. ✅ Sincronização funciona corretamente

## Arquivos Modificados

1. **`src/controllers/DCTFController.ts`**
   - Adicionado método `corrigirSchemaClienteId()`

2. **`src/routes/dctf.ts`**
   - Adicionada rota `POST /api/dctf/admin/fix-schema`

3. **`src/services/DCTFSyncService.ts`**
   - Melhorado `mapSupabaseToMySQL()` para validar UUIDs
   - Trata CNPJs formatados como NULL

4. **`frontend/src/services/dctf.ts`**
   - Adicionado método `fixSchema()`

5. **`frontend/src/pages/Administracao.tsx`**
   - Adicionado botão "Corrigir Schema MySQL"
   - Adicionada detecção automática de erro de schema
   - Mensagens de sucesso/erro para correção de schema

6. **`docs/migrations/mysql/007_fix_cliente_id_nullable.sql`**
   - Script SQL de referência

7. **`src/scripts/fix-cliente-id-nullable.ts`**
   - Script Node.js executável

## Próximos Passos

1. ✅ Execute "Corrigir Schema MySQL" (primeira vez)
2. ✅ Execute "Sincronizar do Supabase para MySQL"
3. ✅ Verifique se os dados foram sincronizados corretamente
4. ✅ Se ainda houver erros, verifique os logs para detalhes específicos

