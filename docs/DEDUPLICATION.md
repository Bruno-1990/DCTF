# Deduplicação de Registros DCTF

## Problema

A tabela `dctf_declaracoes` estava gerando registros duplicados quando:
- O mesmo CNPJ
- Com o mesmo período de apuração
- E mesma data de transmissão

eram inseridos com IDs diferentes.

## Solução Implementada

### 1. Serviço de Deduplicação (`DCTFDeduplicationService`)

**Localização:** `src/services/DCTFDeduplicationService.ts`

**Funcionalidades:**

#### `detectDuplicates()`
- Detecta grupos de registros duplicados
- Considera duplicados: mesmo CNPJ + período + data
- Retorna lista de grupos com IDs envolvidos

#### `removeDuplicates(dryRun: boolean)`
- Remove duplicados mantendo sempre o registro **mais recente**
- Baseado em `updated_at` ou `created_at`
- Modo `dryRun=true` simula sem deletar
- Retorna estatísticas detalhadas

#### `createUniqueConstraint()`
- Cria índice UNIQUE para prevenir futuros duplicados
- Campos: `cnpj + periodo_apuracao + data_transmissao`
- **Só pode ser executado APÓS remover duplicados existentes**

#### `removeUniqueConstraint()`
- Remove a constraint (para manutenção se necessário)

### 2. Modificação no DCTFSyncService

**Localização:** `src/services/DCTFSyncService.ts`

**Mudanças:**

Antes (apenas verificava ID):
```typescript
const { data: existingData } = await this.mysqlAdapter
  .from('dctf_declaracoes')
  .select('id')
  .eq('id', record.id)
  .limit(1);
```

Agora (verifica dados completos):
```typescript
const { data: existingByData } = await this.mysqlAdapter
  .from('dctf_declaracoes')
  .select('id, created_at, updated_at')
  .eq('cnpj', record.cnpj)
  .eq('periodo_apuracao', record.periodo_apuracao)
  .limit(10);
```

**Lógica de Deduplicação:**
1. Busca registros com mesmos dados (não apenas ID)
2. Normaliza datas para comparação (apenas data, sem hora)
3. Compara `updated_at`/`created_at` para determinar qual é mais recente
4. **Se novo é mais recente:** atualiza o existente
5. **Se existente é mais recente:** ignora o novo
6. **Se não há duplicado:** insere normalmente

### 3. Endpoints de API

**Localização:** `src/controllers/DCTFController.ts` + `src/routes/dctf.ts`

#### POST `/api/dctf/admin/detect-duplicates`
Detecta duplicados sem modificar nada.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "cnpj": "12345678000190",
      "periodo_apuracao": "12/2025",
      "data_transmissao": "2025-01-15",
      "count": 3,
      "ids": ["uuid1", "uuid2", "uuid3"],
      "oldest_id": "uuid1",
      "newest_id": "uuid3"
    }
  ],
  "message": "Encontrados 5 grupos de duplicados (15 registros totais)"
}
```

#### POST `/api/dctf/admin/remove-duplicates`
Remove duplicados mantendo o mais recente.

**Body:**
```json
{
  "dryRun": true  // false para executar de verdade
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDuplicates": 15,
    "groupsProcessed": 5,
    "recordsRemoved": 10,
    "errors": 0,
    "details": [...]
  },
  "message": "Deduplicação concluída: 10 registros removidos de 5 grupos"
}
```

#### POST `/api/dctf/admin/create-unique-constraint`
Cria constraint para prevenir futuros duplicados.

**Response:**
```json
{
  "success": true,
  "data": true,
  "message": "Constraint UNIQUE criada. Futuros duplicados serão bloqueados."
}
```

#### DELETE `/api/dctf/admin/remove-unique-constraint`
Remove a constraint (para manutenção).

### 4. Script de Linha de Comando

**Localização:** `scripts/deduplicate-dctf.ts`

**Uso:**

```bash
# 1. Detectar e simular (não modifica nada)
npx tsx scripts/deduplicate-dctf.ts

# 2. Executar deduplicação de verdade
npx tsx scripts/deduplicate-dctf.ts --execute
```

**O que o script faz:**

1. ✅ Detecta duplicados
2. ✅ Mostra grupos encontrados
3. ✅ Executa simulação (dry run)
4. ⚠️ Aguarda confirmação (`--execute`)
5. ✅ Remove duplicados (se confirmado)
6. ✅ Cria constraint UNIQUE
7. ✅ Exibe relatório final

## Como Usar

### Opção 1: Via Script (Recomendado)

```bash
# Passo 1: Ver simulação
npx tsx scripts/deduplicate-dctf.ts

# Passo 2: Se estiver tudo OK, executar
npx tsx scripts/deduplicate-dctf.ts --execute
```

### Opção 2: Via API

```bash
# Passo 1: Detectar duplicados
curl -X POST http://localhost:3001/api/dctf/admin/detect-duplicates

# Passo 2: Simular remoção
curl -X POST http://localhost:3001/api/dctf/admin/remove-duplicates \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Passo 3: Executar remoção
curl -X POST http://localhost:3001/api/dctf/admin/remove-duplicates \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Passo 4: Criar constraint
curl -X POST http://localhost:3001/api/dctf/admin/create-unique-constraint
```

## Critérios de Duplicação

Um registro é considerado duplicado quando:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cnpj` | VARCHAR(14) | CNPJ da empresa |
| `periodo_apuracao` | VARCHAR(7) | Período no formato MM/YYYY |
| `data_transmissao` | DATE | Data de transmissão (apenas data, sem hora) |

**Exemplo de duplicados:**
```
ID: abc123 | CNPJ: 12345678000190 | Período: 12/2025 | Data: 2025-01-15 10:30:00 ← Mantido (mais recente)
ID: def456 | CNPJ: 12345678000190 | Período: 12/2025 | Data: 2025-01-15 08:20:00 ← Removido
```

## Registro Mantido

Quando há duplicados, o serviço mantém **sempre o registro mais recente**, baseado em:

1. `updated_at` (se disponível)
2. `created_at` (fallback)

## Constraint UNIQUE

Após a deduplicação, uma constraint UNIQUE é criada:

```sql
CREATE UNIQUE INDEX idx_unique_dctf 
ON dctf_declaracoes (cnpj, periodo_apuracao, data_transmissao(50))
```

**Efeito:**
- ✅ Bloqueia inserções duplicadas no futuro
- ✅ Garante integridade dos dados
- ⚠️ Só pode ser criada APÓS remover duplicados existentes

## Prevenção Futura

Com as modificações no `DCTFSyncService`, o sistema agora:

1. ✅ Verifica duplicados **antes** de inserir
2. ✅ Compara datas para manter o mais recente
3. ✅ Atualiza existentes em vez de criar novos
4. ✅ Ignora registros mais antigos automaticamente

## Rollback

Se precisar reverter a constraint:

```bash
# Via API
curl -X DELETE http://localhost:3001/api/dctf/admin/remove-unique-constraint

# Ou via MySQL direto
mysql> DROP INDEX idx_unique_dctf ON dctf_declaracoes;
```

## Logs

Todos os processos geram logs detalhados:

```
[Deduplication] Detectando duplicados...
[Deduplication] Encontrados 5 grupos de duplicados
[Deduplication] CNPJ 12345678000190, Período 12/2025:
  - Mantendo: abc123
  - Removendo: def456, ghi789
[Deduplication] Deduplicação concluída: 10 registros removidos
```

## Segurança

- ✅ Modo `dryRun` permite testar sem modificar
- ✅ Validação de dados antes de deletar
- ✅ Rollback via remoção de constraint
- ✅ Logs detalhados de todas operações
- ✅ Mantém sempre o registro mais recente

## Arquivos Modificados/Criados

### Novos
- `src/services/DCTFDeduplicationService.ts` - Serviço principal
- `scripts/deduplicate-dctf.ts` - Script CLI
- `docs/DEDUPLICATION.md` - Esta documentação

### Modificados
- `src/services/DCTFSyncService.ts` - Lógica anti-duplicação
- `src/controllers/DCTFController.ts` - Novos endpoints
- `src/routes/dctf.ts` - Novas rotas

## Testes

Para testar a solução:

```bash
# 1. Criar duplicados de teste (se necessário)
# 2. Executar detecção
npx tsx scripts/deduplicate-dctf.ts

# 3. Verificar resultado (dry run)
# 4. Executar de verdade
npx tsx scripts/deduplicate-dctf.ts --execute

# 5. Verificar que não há mais duplicados
npx tsx scripts/deduplicate-dctf.ts
```

## Suporte

Para problemas ou dúvidas:
1. Verifique os logs do servidor
2. Execute em modo `dryRun` primeiro
3. Use os endpoints de detecção antes de remover
