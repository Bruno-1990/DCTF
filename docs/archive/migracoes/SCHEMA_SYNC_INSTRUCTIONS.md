# Instruções para Sincronizar o Schema do Banco de Dados

Este documento explica como sincronizar o schema documentado com o schema real do banco de dados Supabase.

## Método 1: Usando o Script Automático (Recomendado)

### Pré-requisitos
- Ter `SUPABASE_SERVICE_ROLE_KEY` configurado no arquivo `.env`

### Passos

1. **Configurar variáveis de ambiente** (se ainda não estiver configurado):
   ```bash
   # No arquivo .env
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
   ```

2. **Executar o script**:
   ```bash
   npx ts-node src/scripts/sync-schema-from-db.ts
   ```

3. **Verificar o resultado**:
   - O script gerará um arquivo `docs/database-schema-synced.sql` com o schema atualizado
   - Compare com `docs/database-schema.sql` para ver as diferenças

## Método 2: Usando SQL Direto no Supabase (Alternativo)

Se o script automático não funcionar, você pode extrair o schema manualmente:

### Passos

1. **Acesse o Supabase Dashboard**:
   - Vá para [https://app.supabase.com](https://app.supabase.com)
   - Selecione seu projeto
   - Vá em **SQL Editor**

2. **Execute o script SQL**:
   - Abra o arquivo `docs/scripts/get-schema.sql`
   - Copie e cole no SQL Editor
   - Execute a query

3. **Copie os resultados**:
   - Especialmente os resultados da segunda query (informações das colunas)
   - Salve em um arquivo JSON ou CSV

4. **Atualize a documentação**:
   - Use os dados copiados para atualizar `docs/database-schema.sql`
   - Ou use o script `src/scripts/update-schema-from-query.ts` para processar os dados

## Verificando Diferenças

Após sincronizar, compare os arquivos:

- `docs/database-schema.sql` - Schema documentado original
- `docs/database-schema-synced.sql` - Schema sincronizado do banco real

### Principais diferenças a verificar:

1. **Nomes de colunas**: Verifique se há diferenças entre snake_case e camelCase
2. **Tipos de dados**: Verifique se os tipos estão corretos
3. **Constraints**: Verifique se há constraints faltando ou extras
4. **Índices**: Verifique se os índices estão documentados

## Atualizando o Código

Após sincronizar o schema, atualize o código que faz queries:

1. **Verificar nomes de colunas nos serviços**:
   - `src/services/TimelineConferenciasService.ts`
   - `src/services/ClienteTimelineService.ts`
   - `src/services/ClientesSemDCTFService.ts`
   - Outros serviços que fazem queries diretas

2. **Verificar mapeamentos nos modelos**:
   - `src/models/DCTF.ts` - método `mapSupabaseRow`
   - `src/models/Cliente.ts` - método `mapSupabaseRow`
   - Outros modelos

3. **Atualizar tipos TypeScript**:
   - `src/types/index.ts` - interfaces de tipos
   - Verificar se os tipos correspondem ao schema real

## Exemplo de Problema Comum

### Problema: Coluna não encontrada
```
Erro: column dctf_declaracoes.periodo does not exist
```

### Solução:
1. Verificar no banco se a coluna existe com outro nome
2. Verificar se o nome está correto (pode ser `periodo_apuracao` ou `competencia`)
3. Atualizar o código para usar o nome correto
4. Atualizar a documentação

## Manutenção Contínua

Recomenda-se sincronizar o schema periodicamente:

- Após migrações importantes
- Quando houver erros de "coluna não encontrada"
- Antes de releases importantes
- Quando adicionar novas tabelas ou colunas

## Notas Importantes

⚠️ **ATENÇÃO**: 
- O schema sincronizado reflete o estado atual do banco
- Pode incluir colunas que não estão na documentação original
- Pode não incluir colunas que estão na documentação mas não foram criadas no banco
- Sempre revise as diferenças antes de atualizar a documentação principal


