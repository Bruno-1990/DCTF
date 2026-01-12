# Migration 011: Adicionar CPF aos Sócios

## Descrição

Esta migration adiciona o campo `cpf` à tabela `clientes_socios` e garante que os campos de participação (`participacao_percentual` e `participacao_valor`) existam.

## Alterações

### Tabela: `clientes_socios`

1. **Nova coluna: `cpf`**
   - Tipo: `VARCHAR(14)`
   - Nulável: `SIM`
   - Comentário: "CPF do sócio (somente números)"
   - Índice: `idx_clientes_socios_cpf`

2. **Coluna verificada: `participacao_percentual`**
   - Tipo: `DECIMAL(5,2)`
   - Nulável: `SIM`
   - Comentário: "Porcentagem de participação no capital social"

3. **Coluna verificada: `participacao_valor`**
   - Tipo: `DECIMAL(15,2)`
   - Nulável: `SIM`
   - Comentário: "Valor da participação calculado (capital_social * participacao_percentual / 100)"

## Como Executar

### Opção 1: Via Script Node.js (Recomendado)

```bash
cd docs/migrations/mysql
node run_migration_011.js
```

### Opção 2: Via MySQL CLI

```bash
mysql -u root -p dctf_web < docs/migrations/mysql/011_add_cpf_to_socios.sql
```

### Opção 3: Via MySQL Workbench

1. Abra o MySQL Workbench
2. Conecte ao banco `dctf_web`
3. Abra o arquivo `011_add_cpf_to_socios.sql`
4. Execute o script

## Verificação

Após executar a migration, você pode verificar se as colunas foram adicionadas:

```sql
DESCRIBE clientes_socios;
```

Ou verificar especificamente as novas colunas:

```sql
SELECT 
  COLUMN_NAME as coluna,
  COLUMN_TYPE as tipo,
  IS_NULLABLE as nulavel,
  COLUMN_COMMENT as comentario
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dctf_web'
  AND TABLE_NAME = 'clientes_socios'
  AND COLUMN_NAME IN ('cpf', 'participacao_percentual', 'participacao_valor');
```

## Impacto no Sistema

### Backend

- O modelo `Cliente.ts` foi atualizado para mapear o campo `cpf` ao carregar sócios
- A interface `ClienteSocio` em `src/types/index.ts` foi atualizada com o campo `cpf`

### Frontend

- A interface `ClienteSocio` em `frontend/src/types/index.ts` foi atualizada com o campo `cpf`
- A aba "Participação" em `Clientes.tsx` agora exibe o CPF dos sócios (formatado)

## Formato do CPF

- **Armazenamento**: Apenas números (11 dígitos)
- **Exibição**: Formatado como `XXX.XXX.XXX-XX`

## Compatibilidade

- A migration usa `IF NOT EXISTS` para verificar a existência das colunas antes de adicioná-las
- Não há quebra de compatibilidade com dados existentes
- Sócios sem CPF cadastrado continuarão funcionando normalmente (campo nulável)

## Próximos Passos

1. Executar a migration no banco de dados
2. Popular os CPFs dos sócios (manualmente ou via importação)
3. Validar a exibição na aba "Participação"

## Observações

- O CPF é opcional (nulável) para não quebrar registros existentes
- O CPF deve ser armazenado sem formatação (apenas números)
- A formatação do CPF é feita apenas na interface do usuário


