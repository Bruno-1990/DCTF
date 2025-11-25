# Correção: Erro "Unknown column 'id' in 'where clause'" na tabela sitf_protocols

## Problema Identificado

**Erro:** `Unknown column 'id' in 'where clause'`

**Causa:** A tabela `sitf_protocols` usa `cnpj` como chave primária (não `id`), mas o `SupabaseAdapter` estava tentando buscar o registro inserido/atualizado usando a coluna `id` após fazer o upsert.

## Estrutura da Tabela

```sql
CREATE TABLE sitf_protocols (
  cnpj VARCHAR(14) PRIMARY KEY,  -- Chave primária é 'cnpj', não 'id'
  protocolo TEXT,
  status VARCHAR(20),
  next_eligible_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  file_url TEXT,
  last_response JSON,
  attempts INT DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Correções Aplicadas

### 1. Busca do Registro Após Upsert

**Arquivo:** `src/services/SupabaseAdapter.ts` (função `executeInsert`)

**Antes:**
```typescript
if (this.insertData.id) {
  const [result] = await connection.execute(
    `SELECT * FROM \`${this.table}\` WHERE id = ?`,
    [this.insertData.id]
  );
  inserted = (result as any[])[0];
} else {
  const [result] = await connection.execute(
    `SELECT * FROM \`${this.table}\` WHERE id = LAST_INSERT_ID()`
  );
  inserted = (result as any[])[0];
}
```

**Depois:**
```typescript
const conflictColumn = this.upsertConflictColumn || 'id';

if (this.insertData[conflictColumn]) {
  // Usar a coluna de conflito (ou 'id' por padrão) para buscar o registro
  const [result] = await connection.execute(
    `SELECT * FROM \`${this.table}\` WHERE \`${conflictColumn}\` = ?`,
    [this.insertData[conflictColumn]]
  );
  inserted = (result as any[])[0];
} else if (this.insertData.id) {
  // Fallback para 'id' se existir
  // ...
} else {
  // Último fallback com tratamento de erro
  // ...
}
```

**Benefício:** Agora usa a coluna especificada em `onConflict` (no caso, `cnpj`) para buscar o registro após o upsert.

### 2. Geração da Query ON DUPLICATE KEY UPDATE

**Arquivo:** `src/services/SupabaseAdapter.ts` (função `executeInsert`)

**Melhorias:**
- Remove referência hardcoded a `id = id` no fallback
- Usa a coluna de conflito especificada quando disponível
- Trata casos onde não há campos para atualizar (atualiza `updated_at` se existir)

**Código:**
```typescript
let finalUpdateFields = updateFields;
if (!finalUpdateFields || finalUpdateFields.trim() === '') {
  // Se não há campos para atualizar, verificar se existe updated_at
  if (this.insertData.updated_at !== undefined) {
    finalUpdateFields = '`updated_at` = VALUES(`updated_at`)';
  } else {
    // Fallback: atualizar um campo que não seja a chave primária
    const nonKeyFields = Object.keys(this.insertData).filter(key => {
      const conflictKey = this.upsertConflictColumn || 'id';
      return key !== conflictKey;
    });
    if (nonKeyFields.length > 0) {
      finalUpdateFields = `\`${nonKeyFields[0]}\` = VALUES(\`${nonKeyFields[0]}\`)`;
    } else {
      // Último recurso: atualizar a própria chave (não faz nada, mas evita erro SQL)
      const conflictKey = this.upsertConflictColumn || 'id';
      finalUpdateFields = `\`${conflictKey}\` = \`${conflictKey}\``;
    }
  }
}
```

## Como Funciona Agora

### Chamada no Código
```typescript
await client.from('sitf_protocols').upsert(payload, { onConflict: 'cnpj' });
```

### Query Gerada
```sql
INSERT INTO `sitf_protocols` (cnpj, protocolo, status, next_eligible_at, ...) 
VALUES (?, ?, ?, ?, ...) 
ON DUPLICATE KEY UPDATE 
  protocolo = VALUES(protocolo),
  status = VALUES(status),
  next_eligible_at = VALUES(next_eligible_at),
  ...
```

### Busca Após Upsert
```sql
SELECT * FROM `sitf_protocols` WHERE `cnpj` = ?
```

## Resultado Esperado

Agora o sistema deve:
1. ✅ Fazer upsert corretamente usando `cnpj` como chave primária
2. ✅ Buscar o registro inserido/atualizado usando `cnpj` em vez de `id`
3. ✅ Não gerar mais erro "Unknown column 'id' in 'where clause'"
4. ✅ Salvar o protocolo corretamente no banco de dados
5. ✅ Permitir que o fluxo continue normalmente

## Testes Recomendados

1. **Teste de Upsert:**
   - Fazer uma consulta SITF
   - Verificar se o protocolo é salvo corretamente
   - Verificar se não há mais erros de SQL

2. **Teste de Atualização:**
   - Fazer uma segunda consulta para o mesmo CNPJ
   - Verificar se o protocolo é atualizado em vez de criar duplicata
   - Verificar se o estado é atualizado corretamente

3. **Teste de Busca:**
   - Após salvar, verificar se o registro é encontrado corretamente
   - Verificar se os dados estão completos

## Notas Técnicas

- MySQL `ON DUPLICATE KEY UPDATE` funciona automaticamente com PRIMARY KEY ou UNIQUE KEY
- Não é necessário especificar qual coluna causou o conflito
- O adapter agora é mais flexível e funciona com qualquer chave primária, não apenas `id`

