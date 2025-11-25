# Correção: Erro "value too long for type character varying(7)" no n8n

## Problema Identificado

O n8n está tentando inserir dados na tabela `dctf_declaracoes` do Supabase, mas está recebendo o erro:

```
Bad request - please check your parameters: value too long for type character varying(7)
```

## Causa Raiz

A coluna `periodo_apuracao` no Supabase é definida como `VARCHAR(7)` e espera o formato **`MM/YYYY`** (ex: `09/2025`), mas o n8n está enviando o formato **`YYYY-MM-DD`** (ex: `2025-09-01`), que tem 10 caracteres.

### Campos Afetados

| Campo no n8n | Valor Enviado | Tamanho | Campo no Supabase | Tamanho Esperado | Formato Esperado |
|--------------|---------------|---------|-------------------|------------------|------------------|
| `periodo_apuracao_inicio_iso` | `2025-09-01` | 10 chars | `periodo_apuracao` | 7 chars | `MM/YYYY` |
| `data_transmissao_iso` | `2025-10-07` | 10 chars | `data_transmissao` | TEXT | `YYYY-MM-DD` ou `DD/MM/YYYY` |

## Solução

Converter o formato dos dados no n8n antes de enviar para o Supabase.

### Opção 1: Converter no Node "Create a row" (Recomendado)

No node "Create a row1" do n8n, modifique os campos:

#### Campo `periodo_apuracao`

**Antes:**
```
Field Value: {{ $json.periodo_apuracao_inicio_iso }}
Resultado: 2025-09-01 (10 caracteres) ❌
```

**Depois:**
```
Field Value: {{ $json.periodo_apuracao }}
Resultado: 09/2025 (7 caracteres) ✅
```

**OU** se você não tiver o campo `periodo_apuracao` no formato correto, use uma expressão JavaScript:

```javascript
{{ 
  // Converter 2025-09-01 para 09/2025
  const date = new Date($json.periodo_apuracao_inicio_iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  `${month}/${year}`;
}}
```

#### Campo `data_transmissao`

**Antes:**
```
Field Value: {{ $json.data_transmissao_iso }}
Resultado: 2025-10-07 (10 caracteres)
```

**Depois:**
```
Field Value: {{ $json.data_transmissao_iso }}
Resultado: 2025-10-07 (10 caracteres) ✅
```

**Nota:** Se `data_transmissao` for `TEXT` no Supabase, o formato `YYYY-MM-DD` está correto. Se for `VARCHAR(7)`, você precisará converter também.

### Opção 2: Adicionar Node de Transformação (Mais Flexível)

Adicione um node "Code" (JavaScript) antes do "Create a row" para transformar os dados:

```javascript
// Converter periodo_apuracao_inicio_iso para MM/YYYY
const items = $input.all();

for (const item of items) {
  const date = new Date(item.json.periodo_apuracao_inicio_iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  item.json.periodo_apuracao = `${month}/${year}`;
  
  // Manter data_transmissao no formato ISO (se for TEXT no Supabase)
  // item.json.data_transmissao = item.json.data_transmissao_iso;
}

return items;
```

Depois, no node "Create a row", use:
- `periodo_apuracao`: `{{ $json.periodo_apuracao }}`
- `data_transmissao`: `{{ $json.data_transmissao_iso }}`

## Verificação do Schema no Supabase

Para confirmar os tipos de dados corretos, execute no Supabase SQL Editor:

```sql
SELECT 
  column_name, 
  data_type, 
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'dctf_declaracoes'
  AND column_name IN ('periodo_apuracao', 'data_transmissao', 'cnpj');
```

**Resultado esperado:**
- `periodo_apuracao`: `character varying(7)` → Formato: `MM/YYYY`
- `data_transmissao`: `text` ou `character varying` → Formato: `YYYY-MM-DD` ou `DD/MM/YYYY`
- `cnpj`: `character varying(14)` → Formato: `39226309000130` (14 dígitos)

## Mapeamento Correto dos Campos

| Campo Supabase | Tipo | Formato Esperado | Campo n8n | Conversão |
|----------------|------|------------------|-----------|-----------|
| `cnpj` | VARCHAR(14) | `39226309000130` | `{{ $json.cnpj_limpo }}` | ✅ Já correto |
| `periodo_apuracao` | VARCHAR(7) | `09/2025` | `{{ $json.periodo_apuracao }}` | ✅ Usar campo original |
| `data_transmissao` | TEXT | `2025-10-07` | `{{ $json.data_transmissao_iso }}` | ✅ Já correto |

## Exemplo Completo de Node "Create a row"

```
Table: dctf_declaracoes

Fields:
┌─────────────────────┬─────────────────────────────────────┐
│ Field Name          │ Field Value                         │
├─────────────────────┼─────────────────────────────────────┤
│ cnpj                │ {{ $json.cnpj_limpo }}              │
│ periodo_apuracao    │ {{ $json.periodo_apuracao }}         │
│ data_transmissao    │ {{ $json.data_transmissao_iso }}    │
│ situacao            │ {{ $json.situacao }}                 │
│ tipo                │ {{ $json.tipo }}                     │
│ origem              │ {{ $json.origem }}                   │
│ categoria           │ {{ $json.categoria }}                 │
│ debito_apurado      │ {{ $json.debito_apurado_num }}       │
│ saldo_a_pagar       │ {{ $json.saldo_a_pagar_num }}        │
└─────────────────────┴─────────────────────────────────────┘
```

## Teste

Após fazer as correções:

1. Execute o workflow no n8n
2. Verifique se os dados são inseridos sem erros
3. Confirme no Supabase que `periodo_apuracao` está no formato `MM/YYYY`

## Troubleshooting

### Erro persiste após correção

1. **Verifique o formato do campo `periodo_apuracao` no n8n:**
   - Deve ser `09/2025` (7 caracteres)
   - Não deve ser `2025-09-01` (10 caracteres)

2. **Verifique se há outros campos com tamanho limitado:**
   ```sql
   SELECT column_name, data_type, character_maximum_length
   FROM information_schema.columns
   WHERE table_name = 'dctf_declaracoes'
     AND character_maximum_length IS NOT NULL;
   ```

3. **Teste com um registro manual no Supabase:**
   ```sql
   INSERT INTO dctf_declaracoes (cnpj, periodo_apuracao, data_transmissao)
   VALUES ('39226309000130', '09/2025', '2025-10-07');
   ```

### Campo `periodo_apuracao` não existe no JSON do n8n

Se você não tiver o campo `periodo_apuracao` no formato `MM/YYYY`, adicione um node "Code" antes do "Create a row" para criar esse campo:

```javascript
const items = $input.all();

for (const item of items) {
  // Converter periodo_apuracao_inicio_iso (2025-09-01) para periodo_apuracao (09/2025)
  if (item.json.periodo_apuracao_inicio_iso) {
    const date = new Date(item.json.periodo_apuracao_inicio_iso);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    item.json.periodo_apuracao = `${month}/${year}`;
  }
}

return items;
```

## Arquivos Relacionados

- Schema MySQL: `docs/migrations/mysql/001_create_schema_dctf_web.sql`
- Documentação de sincronização: `docs/sincronizacao-dctf-supabase-mysql.md`

