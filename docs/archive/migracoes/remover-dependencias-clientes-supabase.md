# Remover Dependências da Tabela clientes no Supabase

## Problema

A tabela `dctf_declaracoes` no Supabase tem dependências da tabela `clientes` que não existe, causando erros ao inserir dados via n8n:

```
The resource you are requesting could not be found: relation "public.clientes" does not exist
```

## Solução

Remover todas as dependências (triggers, foreign keys, funções) que referenciam a tabela `clientes`.

## Método 1: Executar SQL Diretamente no Supabase (Recomendado)

### Passo 1: Acessar Supabase SQL Editor

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral)
4. Clique em **New query**

### Passo 2: Executar o Script SQL

Copie e cole o conteúdo do arquivo `docs/migrations/supabase/remove_clientes_dependencies.sql` no editor e execute.

**OU** execute este script completo:

```sql
-- 1. Remover triggers
DROP TRIGGER IF EXISTS trigger_set_cliente_id_by_cnpj ON public.dctf_declaracoes;
DROP TRIGGER IF EXISTS trigger_associar_declaracoes_a_cliente ON public.clientes;

-- 2. Remover funções
DROP FUNCTION IF EXISTS public.set_cliente_id_by_cnpj() CASCADE;
DROP FUNCTION IF EXISTS public.associar_declaracoes_a_cliente() CASCADE;
DROP FUNCTION IF EXISTS public.importar_dctf_json(jsonb) CASCADE;

-- 3. Remover foreign key constraint
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT constraint_name INTO constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'dctf_declaracoes'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%cliente%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.dctf_declaracoes DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Constraint removida: %', constraint_name;
    END IF;
END $$;

-- 4. Tornar cliente_id nullable
ALTER TABLE public.dctf_declaracoes 
ALTER COLUMN cliente_id DROP NOT NULL;
```

### Passo 3: Verificar Execução

Execute estas queries para verificar:

```sql
-- Verificar triggers (deve retornar vazio)
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'dctf_declaracoes';

-- Verificar foreign keys (deve retornar vazio)
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'dctf_declaracoes'
  AND constraint_type = 'FOREIGN KEY'
  AND constraint_name LIKE '%cliente%';

-- Verificar se cliente_id é nullable (deve retornar 'YES')
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dctf_declaracoes'
  AND column_name = 'cliente_id';
```

## Método 2: Usar Script Node.js (Alternativa)

Se preferir executar via script:

### Pré-requisitos

Configure no `.env`:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### Executar

```bash
npx ts-node src/scripts/remove-clientes-dependencies-supabase.ts
```

**Nota:** Este método pode não funcionar se o Supabase não tiver RPC configurado. Use o Método 1 (SQL direto) que é mais confiável.

## O Que Será Removido

✅ **Triggers:**
- `trigger_set_cliente_id_by_cnpj` - Tentava associar cliente automaticamente
- `trigger_associar_declaracoes_a_cliente` - Tentava associar declarações a cliente

✅ **Funções:**
- `set_cliente_id_by_cnpj()` - Buscava cliente por CNPJ
- `associar_declaracoes_a_cliente()` - Associava declarações a cliente
- `importar_dctf_json()` - Importava dados e criava clientes

✅ **Constraints:**
- Foreign key que referencia `clientes(id)`

✅ **Modificações:**
- Coluna `cliente_id` torna-se nullable (pode ser NULL)

## Resultado Esperado

Após executar o script:

1. ✅ **Nenhum trigger será executado** ao inserir dados
2. ✅ **Nenhuma foreign key** referenciará a tabela `clientes`
3. ✅ **A coluna `cliente_id` pode ser NULL**
4. ✅ **O n8n poderá inserir dados sem erros**
5. ✅ **Os dados serão inseridos diretamente** sem processamento automático

## Teste

Após executar o script:

1. Execute o workflow no n8n
2. Verifique se os dados são inseridos sem erros
3. Confirme no Supabase que os registros foram criados
4. Verifique que `cliente_id` está como `NULL` (isso é esperado)

## Próximos Passos

Após remover as dependências:

1. ✅ n8n insere dados no Supabase (sem erros)
2. ✅ Dados ficam disponíveis no Supabase
3. ✅ Use a funcionalidade de sincronização na área administrativa
4. ✅ Dados são transferidos para MySQL com `cliente_id` associado corretamente

## Arquivos Relacionados

- Script SQL: `docs/migrations/supabase/remove_clientes_dependencies.sql`
- Script Node.js: `src/scripts/remove-clientes-dependencies-supabase.ts`
- Documentação anterior: `docs/solucao-erro-n8n-clientes.md`

