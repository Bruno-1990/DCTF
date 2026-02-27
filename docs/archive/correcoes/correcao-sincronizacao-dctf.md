# Correção: Erros na Sincronização DCTF (Supabase → MySQL)

## Problema Identificado

A sincronização está falhando com **427 erros** (0 inseridos, 0 atualizados). Isso indica que há incompatibilidade entre o schema do Supabase e do MySQL.

## Causa Raiz

O schema da tabela `dctf_declaracoes` no MySQL não está idêntico ao schema do Supabase, causando erros ao tentar inserir/atualizar registros.

## Solução

### Passo 1: Alinhar Schema MySQL com Supabase

Execute o script de migração para alinhar o schema:

```bash
npx ts-node src/scripts/align-mysql-with-supabase.ts
```

**O que este script faz:**
1. ✅ Remove foreign key de `cliente_id` (permite NULL)
2. ✅ Modifica `cliente_id` para ser nullable
3. ✅ Modifica `data_transmissao` para TEXT (como no Supabase)
4. ✅ Adiciona colunas faltantes do Supabase
5. ✅ Cria índices necessários

### Passo 2: Verificar Schema do Supabase

Se quiser verificar o schema do Supabase primeiro:

```bash
npx ts-node src/scripts/get-supabase-schema.ts
```

**Nota:** Requer `SUPABASE_URL` e `SUPABASE_ANON_KEY` configurados no `.env`.

### Passo 3: Testar Sincronização

Após executar a migração:

1. Acesse a área administrativa
2. Clique em "Sincronizar do Supabase para MySQL"
3. Verifique os logs no console do backend
4. Os erros agora devem mostrar detalhes específicos

## Melhorias Implementadas

### 1. Logging Melhorado

O serviço de sincronização agora mostra:
- Dados tentados (JSON completo)
- Erro completo (mensagem e código)
- Progresso detalhado

### 2. Mapeamento Completo

O método `mapSupabaseToMySQL()` agora inclui **todas** as colunas possíveis do Supabase:
- `id`, `cliente_id`, `cnpj`
- `periodo_apuracao`, `data_transmissao`, `situacao`
- `tipo_ni`, `categoria`, `origem`, `tipo`
- `debito_apurado`, `saldo_a_pagar`
- `metadados`, `hora_transmissao`, `numero_recibo`
- `created_at`, `updated_at`

### 3. Formato de Datas

As datas são convertidas para formato MySQL (`YYYY-MM-DD HH:MM:SS`) automaticamente.

## Schema Esperado (MySQL)

Após a migração, a tabela `dctf_declaracoes` deve ter:

```sql
CREATE TABLE dctf_declaracoes (
  id CHAR(36) PRIMARY KEY,
  cliente_id CHAR(36) NULL,              -- Nullable (como no Supabase)
  cnpj VARCHAR(14) NULL,
  periodo_apuracao VARCHAR(7) NULL,      -- Formato: MM/YYYY
  data_transmissao TEXT NULL,            -- TEXT (como no Supabase)
  situacao TEXT NULL,
  tipo_ni VARCHAR(10) NULL,
  categoria VARCHAR(100) NULL,
  origem VARCHAR(50) NULL,
  tipo VARCHAR(50) NULL,
  debito_apurado DECIMAL(15,2) NULL,
  saldo_a_pagar DECIMAL(15,2) NULL,
  metadados TEXT NULL,
  hora_transmissao VARCHAR(8) NULL,
  numero_recibo VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Erro: "Column doesn't exist"

**Causa:** Coluna não foi adicionada na migração.

**Solução:** Execute novamente o script `align-mysql-with-supabase.ts` ou adicione manualmente:

```sql
ALTER TABLE dctf_declaracoes 
ADD COLUMN nome_da_coluna TIPO NULL;
```

### Erro: "Data too long for column"

**Causa:** Tipo de dados incompatível (ex: VARCHAR muito pequeno).

**Solução:** Modifique a coluna:

```sql
ALTER TABLE dctf_declaracoes 
MODIFY COLUMN nome_da_coluna TIPO_MAIOR NULL;
```

### Erro: "Cannot add foreign key constraint"

**Causa:** Foreign key de `cliente_id` ainda existe.

**Solução:** Remova manualmente:

```sql
-- Encontrar nome da constraint
SELECT CONSTRAINT_NAME 
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'dctf_declaracoes' 
  AND REFERENCED_TABLE_NAME = 'clientes';

-- Remover
ALTER TABLE dctf_declaracoes DROP FOREIGN KEY nome_da_constraint;
```

### Erro: "Invalid date value"

**Causa:** Formato de data incompatível.

**Solução:** O mapeamento já converte automaticamente. Se persistir, verifique o formato no Supabase.

## Verificação

Após executar a migração, verifique:

```sql
-- Ver estrutura da tabela
SHOW COLUMNS FROM dctf_declaracoes;

-- Verificar se cliente_id é nullable
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'dctf_declaracoes' 
  AND column_name = 'cliente_id';

-- Verificar se foreign key foi removida
SELECT CONSTRAINT_NAME 
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'dctf_declaracoes' 
  AND REFERENCED_TABLE_NAME = 'clientes';
-- (Deve retornar vazio)
```

## Arquivos Criados

1. **`docs/migrations/mysql/006_align_dctf_declaracoes_with_supabase.sql`**
   - Script SQL de migração (referência)

2. **`src/scripts/align-mysql-with-supabase.ts`**
   - Script Node.js para executar migração com verificações

3. **`src/scripts/get-supabase-schema.ts`**
   - Script para obter schema do Supabase

4. **`src/scripts/compare-schemas.ts`**
   - Script para comparar schemas e gerar migração

## Próximos Passos

1. ✅ Execute `align-mysql-with-supabase.ts`
2. ✅ Teste a sincronização novamente
3. ✅ Verifique os logs de erro (agora mais detalhados)
4. ✅ Corrija problemas específicos se necessário



