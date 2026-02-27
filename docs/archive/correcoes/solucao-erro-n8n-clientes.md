# Solução: Erro "relation public.clientes does not exist" no n8n

## Problema Identificado

O n8n está tentando inserir dados na tabela `dctf_declaracoes` do Supabase, mas está recebendo o erro:

```
The resource you are requesting could not be found: relation "public.clientes" does not exist
```

## Causa Raiz

A tabela `dctf_declaracoes` no Supabase tem um **trigger** que é executado automaticamente quando um registro é inserido. Este trigger chama a função `set_cliente_id_by_cnpj()` que tenta buscar dados na tabela `clientes`, que não existe no Supabase.

### Fluxo do Erro

```
n8n insere dados → Trigger executa → Função set_cliente_id_by_cnpj() → 
Busca na tabela clientes → ERRO: tabela não existe
```

## Solução

Remover os triggers e funções que dependem da tabela `clientes` no Supabase.

### Passo 1: Executar Script SQL no Supabase

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Execute o script: `docs/migrations/supabase/remove_dctf_triggers.sql`

```sql
-- Remover trigger
DROP TRIGGER IF EXISTS trigger_set_cliente_id_by_cnpj ON public.dctf_declaracoes;

-- Remover função
DROP FUNCTION IF EXISTS public.set_cliente_id_by_cnpj() CASCADE;
```

### Passo 2: Verificar Remoção

Execute no Supabase SQL Editor para verificar se não há mais triggers:

```sql
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'dctf_declaracoes';
```

**Resultado esperado:** Nenhum trigger deve ser retornado.

### Passo 3: Testar no n8n

Após remover os triggers:

1. Execute novamente o workflow no n8n
2. Os dados devem ser inseridos sem erros
3. A coluna `cliente_id` pode ficar `NULL` (isso é normal)

## Por Que Isso Funciona?

- **Antes:** O trigger tentava associar automaticamente `cliente_id` ao inserir, mas falhava porque a tabela `clientes` não existe
- **Depois:** Os dados são inseridos diretamente sem processamento de triggers
- **Próximo passo:** A associação com `cliente_id` será feita depois no MySQL durante a sincronização

## Impacto

✅ **Positivo:**
- n8n pode inserir dados sem erros
- Dados são salvos corretamente no Supabase
- Sincronização para MySQL funcionará normalmente

⚠️ **Observação:**
- A coluna `cliente_id` ficará `NULL` no Supabase (isso é esperado)
- A associação com clientes será feita no MySQL durante a sincronização

## Alternativa (Se Precisar Manter o Trigger)

Se você realmente precisar manter a funcionalidade do trigger, você teria que:

1. Criar a tabela `clientes` no Supabase (não recomendado, pois estamos migrando para MySQL)
2. Ou modificar a função para não depender de `clientes`:

```sql
CREATE OR REPLACE FUNCTION public.set_cliente_id_by_cnpj()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Não fazer nada - apenas retornar o registro
  -- A associação será feita depois no MySQL
  RETURN NEW;
END;
$function$;
```

**Recomendação:** Use a solução principal (remover o trigger), pois é mais simples e alinhada com a migração para MySQL.

## Próximos Passos

Após resolver o erro no n8n:

1. ✅ n8n insere dados no Supabase (sem erros)
2. ✅ Dados ficam disponíveis no Supabase
3. ✅ Use a funcionalidade de sincronização na área administrativa
4. ✅ Dados são transferidos para MySQL com `cliente_id` associado corretamente

## Arquivos Relacionados

- Script SQL: `docs/migrations/supabase/remove_dctf_triggers.sql`
- Função original: `docs/migrations/002_fix_cnpj_functions.sql`

