# Normalização da Coluna CNPJ

## Problema Identificado

O banco de dados possui duas colunas para CNPJ:
- `cnpj`: CNPJ formatado (ex: "12.345.678/0001-90")
- `cnpj_limpo`: CNPJ sem formatação (ex: "12345678000190")

Isso causa problemas:
- Duplicação de dados
- Possibilidade de inconsistências
- Perda de zeros à esquerda quando convertido para número
- Complexidade desnecessária

## Solução Implementada

### 1. Migração do Banco de Dados

**Arquivo:** `docs/migrations/001_normalize_cnpj_column.sql`

A migração:
- ✅ Adiciona coluna `cnpj_limpo` se não existir
- ✅ Popula `cnpj_limpo` a partir de `cnpj` (removendo formatação)
- ✅ Garante que todos os CNPJs tenham 14 dígitos (preenche zeros à esquerda)
- ✅ Remove registros inválidos (menos de 14 dígitos)
- ✅ Adiciona constraint UNIQUE em `cnpj_limpo`
- ✅ Remove a coluna `cnpj` formatada
- ✅ Cria índice para performance

### 2. Mudanças no Código

#### Backend

**Arquivos atualizados:**
- `src/types/index.ts`: Removido campo `cnpj` da interface `Cliente`
- `src/models/Cliente.ts`: 
  - Removida validação de `cnpj` formatado
  - Removido salvamento de `cnpj` formatado
  - Mantido apenas `cnpj_limpo` no banco

**Função de formatação:**
- `formatCNPJDisplay()`: Formata `cnpj_limpo` apenas para exibição (não salva)

#### Frontend

**Arquivos que precisam ser atualizados:**
- `frontend/src/pages/Clientes.tsx`: Usar apenas `cnpj_limpo` e formatar na exibição
- `frontend/src/services/clientes.ts`: Remover referências a `cnpj` formatado
- `frontend/src/types/index.ts`: Atualizar interface para remover `cnpj`

### 3. Como Aplicar a Migração

#### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Copie o conteúdo de `docs/migrations/001_normalize_cnpj_column.sql`
5. Execute o script

#### Opção 2: Via MCP Supabase

```typescript
// Usar a ferramenta mcp_supabase_apply_migration
```

### 4. Verificação Pós-Migração

Após aplicar a migração, verifique:

```sql
-- Verificar estrutura da tabela
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clientes'
ORDER BY ordinal_position;

-- Verificar se todos os CNPJs têm 14 dígitos
SELECT 
  id,
  cnpj_limpo,
  LENGTH(cnpj_limpo) as tamanho
FROM clientes
WHERE LENGTH(cnpj_limpo) != 14;

-- Verificar se não há duplicatas
SELECT cnpj_limpo, COUNT(*) as count
FROM clientes
GROUP BY cnpj_limpo
HAVING COUNT(*) > 1;
```

### 5. Benefícios

✅ **Consistência**: Apenas uma fonte de verdade para CNPJ
✅ **Performance**: Menos dados armazenados, índice único
✅ **Confiabilidade**: Zeros à esquerda sempre preservados
✅ **Simplicidade**: Código mais limpo e fácil de manter
✅ **Flexibilidade**: Formatação pode ser aplicada conforme necessário na exibição

### 6. Próximos Passos

1. ✅ Criar migração SQL
2. ⏳ Aplicar migração no banco
3. ⏳ Atualizar código frontend para usar apenas `cnpj_limpo`
4. ⏳ Testar upload de planilhas
5. ⏳ Verificar relatórios e exibições

## Notas Importantes

⚠️ **BACKUP**: Sempre faça backup antes de executar migrações
⚠️ **TESTE**: Teste a migração em ambiente de desenvolvimento primeiro
⚠️ **ZEROS À ESQUERDA**: A migração preserva zeros à esquerda usando `LPAD`

